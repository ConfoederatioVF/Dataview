import fs from 'fs'
import path from 'path'
import type { ServerResponse } from 'http'
import { UfDate, type UfDateObject } from '../framework/utils/uf_date.ts'
import {
  computeGeometryBBox,
  cullAndSimplifyGeometry,
} from './atlas_geometry_utils.ts'
import {
  clearCityResolverCache,
  findCityCoordsByName,
  getStateCapitalInfo,
  type StateCapitalInfo,
} from './atlas_city_resolver.ts'
import {
  clearAtlasConfigCache,
  getAtlasDatasetPaths,
  type AtlasDatasetPaths,
} from './atlas_config_loader.ts'
import {
  clearNaissanceCache,
  detailed_borders_slices,
  getEntityKeyframesSummary,
  type HistoricalBorderFeature,
  type HistoricalBorderKeyframe,
  loadCShapes,
  loadNaissance,
  type NaissanceEntityRecord,
  parseNaissanceKeyframes,
} from './atlas_naissance_loader.ts'

export type { AtlasDatasetPaths, HistoricalBorderFeature, HistoricalBorderKeyframe }

export interface HistoricalBordersResponse {
  count: number
  date?: string
  domain: [number, number]
  features: HistoricalBorderFeature[]
  source: 'cshapes' | 'naissance'
  timestamp?: number
  year: number
}

let cached_active_state_ids: Map<string, Set<number>> = new Map()
let in_memory_slice_lru: Map<string, HistoricalBorderFeature[]> = new Map()
let max_lru_entries = 60

/**
 * AtlasBordersService provides high-performance temporal slicing and streaming of historical GIS boundaries.
 */
export class AtlasBordersService {
  static states_by_id: Map<string | number, any> | null = null

  /**
   * Culls redundant and duplicate vertices in GeoJSON polygon geometries using Ramer-Douglas-Peucker algorithm.
   *
   * @param {any} arg0_geometry
   * @param {number} [arg1_tolerance=0.01]
   *
   * @returns {any}
   */
  static cullAndSimplifyGeometry (arg0_geometry: any, arg1_tolerance: number = 0.01): any {
    return cullAndSimplifyGeometry(arg0_geometry, arg1_tolerance)
  }

  /**
   * Resolves absolute file paths for GIS and boundary datasets dynamically from atlas.json5.
   *
   * @returns {AtlasDatasetPaths}
   */
  static getDatasetPaths (): AtlasDatasetPaths {
    return getAtlasDatasetPaths()
  }

  /**
   * Loads and indexes CShapes-2.0.geojson in memory on first access.
   *
   * @returns {any[]}
   */
  static loadCShapes (): any[] {
    return loadCShapes(AtlasBordersService.getDatasetPaths().cshapesPath)
  }

  /**
   * Parses keyframes from a Naissance entity object, supporting stringified JSON,
   * numeric timestamps, and UF/Date natural/ISO/delimited date strings.
   *
   * @param {any} arg0_ent
   *
   * @returns {{ kf_map: Map<number, [any, any, any]>, sorted_ts: number[] } | null}
   */
  static parseNaissanceKeyframes (
    arg0_ent: any
  ): { kf_map: Map<number, [any, any, any]>; sorted_ts: number[] } | null {
    return parseNaissanceKeyframes(arg0_ent)
  }

  /**
   * Loads and indexes a .naissance file in memory on first access using SVEA History keyframe specifications.
   *
   * @param {string} [arg0_file_path]
   *
   * @returns {Map<string, NaissanceEntityRecord>}
   */
  static loadNaissance (arg0_file_path?: string): Map<string, NaissanceEntityRecord> {
    return loadNaissance(arg0_file_path || AtlasBordersService.getDatasetPaths().dejureNaissancePath)
  }

  /**
   * Returns a set of all active state IDs present in the detailed border slice at a specific date.
   *
   * @param {number} arg0_year
   * @param {number} [arg1_month]
   * @param {number} [arg2_day]
   *
   * @returns {Set<number>}
   */
  static getActiveStateIdsAtDate (
    arg0_year: number,
    arg1_month?: number,
    arg2_day?: number
  ): Set<number> {
    //Convert from parameters
    let day = arg2_day
    let month = arg1_month
    let year = arg0_year

    //Declare local instance variables
    let active_ids = new Set<number>()
    let cache_key = `${year}_${month !== undefined ? month : 1}_${day !== undefined ? day : 1}`

    //Guard clauses
    if (cached_active_state_ids.has(cache_key))
      return cached_active_state_ids.get(cache_key)!

    //Function body
    let borders_res = AtlasBordersService.getBordersAtYear(year, {
      dataset: 'detailed_borders',
      day,
      month,
    })

    for (let i = 0; i < borders_res.features.length; i++) {
      let feat = borders_res.features[i]
      let sid = feat.properties?.state_id
      if (sid !== undefined && sid !== null)
        active_ids.add(Number(sid))
    }

    cached_active_state_ids.set(cache_key, active_ids)

    //Return statement
    return active_ids
  }

  /**
   * Retrieves a single historical border feature by state_id, gwcode, or name at a given year.
   *
   * @param {number} arg0_year
   * @param {number | string} [arg1_state_id]
   * @param {string} [arg2_name]
   * @param {Object} [arg3_options]
   * @param {string} [arg3_options.dataset]
   * @param {number} [arg3_options.day]
   * @param {number} [arg3_options.month]
   *
   * @returns {HistoricalBorderFeature | null}
   */
  static getBorderFeature (
    arg0_year: number,
    arg1_state_id?: number | string,
    arg2_name?: string,
    arg3_options?: {
      dataset?: string
      day?: number
      month?: number
    }
  ): HistoricalBorderFeature | null {
    //Convert from parameters
    let name = arg2_name ? arg2_name.trim() : undefined
    let options = arg3_options || {}
    let state_id = arg1_state_id !== undefined && arg1_state_id !== null && String(arg1_state_id).trim() !== ''
      ? String(arg1_state_id).trim()
      : undefined
    let target_year = arg0_year

    //Guard clauses
    if (state_id === undefined && !name)
      return null

    //Declare local instance variables
    let datasets_to_search: string[] = []
    let primary_dataset = options.dataset || 'detailed_borders'
    let q_name_lower = name ? name.toLowerCase() : ''
    let target_feature: HistoricalBorderFeature | null = null

    //Function body
    datasets_to_search.push(primary_dataset)
    if (primary_dataset !== 'detailed_borders')
      datasets_to_search.push('detailed_borders')
    if (primary_dataset !== 'statistical_borders')
      datasets_to_search.push('statistical_borders')

    let matchFeature = function (arg0_feat: HistoricalBorderFeature): boolean {
      let f = arg0_feat
      if (state_id !== undefined) {
        if (
          String(f.id) === state_id ||
          String(f.id).replace('detailed_', '') === state_id ||
          String(f.id).replace('cshapes_', '') === state_id ||
          String(f.properties?.id) === state_id ||
          String(f.properties?.state_id) === state_id ||
          String(f.properties?.gwcode) === state_id
        ) {
          return true
        }
      }
      if (q_name_lower && f.properties?.name) {
        let fn = f.properties.name.toLowerCase().trim()
        if (fn === q_name_lower)
          return true
      }
      if (q_name_lower && f.properties?.name_long) {
        let fl = f.properties.name_long.toLowerCase().trim()
        if (fl === q_name_lower)
          return true
      }
      return false
    }

    for (let i = 0; i < datasets_to_search.length; i++) {
      let ds = datasets_to_search[i]
      try {
        let borders_res = AtlasBordersService.getBordersAtYear(target_year, {
          dataset: ds,
          day: options.day,
          month: options.month,
        })
        if (borders_res && Array.isArray(borders_res.features)) {
          for (let x = 0; x < borders_res.features.length; x++) {
            if (matchFeature(borders_res.features[x])) {
              target_feature = borders_res.features[x]
              break
            }
          }
          if (target_feature)
            break

          if (q_name_lower) {
            for (let y = 0; y < borders_res.features.length; y++) {
              let feat = borders_res.features[y]
              let fn = (feat.properties?.name || '').toLowerCase()
              let fl = (feat.properties?.name_long || '').toLowerCase()
              if ((fn && (fn.includes(q_name_lower) || q_name_lower.includes(fn))) ||
                  (fl && (fl.includes(q_name_lower) || q_name_lower.includes(fl)))) {
                target_feature = feat
                break
              }
            }
            if (target_feature)
              break
          }
        }
      } catch (arg0_err) {
        //Continue search
      }
    }

    if (target_feature)
      return target_feature

    if (state_id !== undefined) {
      let state = AtlasBordersService.getStateById(state_id)
      if (state) {
        let synth_feat: HistoricalBorderFeature = {
          geometry: state.bbox ? {
            coordinates: [[[state.bbox[0], state.bbox[1]], [state.bbox[2], state.bbox[1]], [state.bbox[2], state.bbox[3]], [state.bbox[0], state.bbox[3]], [state.bbox[0], state.bbox[1]]]],
            type: 'Polygon',
          } : {
            coordinates: [],
            type: 'Polygon',
          },
          id: String(state.state_id),
          properties: {
            area: 0,
            bbox: state.bbox,
            endDate: state.stop_date,
            endYear: state.stop_year,
            fill_color: state.fill_color,
            id: state.state_id,
            is_contemporary: state.is_contemporary,
            name: state.name,
            name_long: state.name,
            startDate: state.start_date,
            startYear: state.start_year,
            state_id: state.state_id,
          },
          type: 'Feature',
        }
        return synth_feat
      }
    }

    //Return statement
    return null
  }

  /**
   * Slices active historical borders for a given year and dataset.
   * Supports sub-yearly continuous GMT timestamps and capped LRU caching.
   *
   * @param {number} arg0_year
   * @param {Object} [arg1_options]
   * @param {[number, number, number, number]} [arg1_options.bbox]
   * @param {string} [arg1_options.dataset]
   * @param {number} [arg1_options.day]
   * @param {number} [arg1_options.month]
   *
   * @returns {HistoricalBordersResponse}
   */
  static getBordersAtYear (
    arg0_year: number,
    arg1_options?: {
      bbox?: [number, number, number, number]
      dataset?: string
      day?: number
      month?: number
    } | string
  ): HistoricalBordersResponse {
    //Convert from parameters
    let options = typeof arg1_options === 'string' ? { dataset: arg1_options } : (arg1_options || {})
    let target_year = arg0_year
    let bbox = options.bbox
    let dataset = options.dataset || 'statistical_borders'
    let target_day = options.day
    let target_month = options.month

    //Declare local instance variables
    let disk_cache_path: string
    let domain: [number, number]
    let features: HistoricalBorderFeature[] = []
    let is_dejure = Boolean(AtlasBordersService.getDatasetPaths().dejureDatasets[dataset])
    let is_whole_year_query: boolean
    let lru_key: string
    let source: 'cshapes' | 'naissance'
    let target_date_obj: UfDateObject
    let target_ts: number

    //Function body
    if (target_day !== undefined && target_month !== undefined) {
      target_date_obj = {
        day: target_day,
        hour: 0,
        minute: 0,
        month: target_month,
        year: (target_year < 0 ? Math.ceil(target_year) : Math.floor(target_year)),
      }
    } else if (target_year !== Math.floor(target_year)) {
      target_date_obj = UfDate.fromFractionalYear(target_year)
    } else {
      target_date_obj = {
        day: 1,
        hour: 0,
        minute: 0,
        month: 1,
        year: target_year,
      }
    }

    target_ts = UfDate.getTimestamp(target_date_obj)
    target_year = target_date_obj.year

    domain = [-3500, 2026]
    source = 'naissance'

    lru_key = `${dataset}_${target_date_obj.year}_${target_date_obj.month}_${target_date_obj.day}_${bbox ? bbox.join(',') : 'all'}`
    is_whole_year_query = Boolean(!bbox && target_date_obj.day === 1 && target_date_obj.month === 1 && Number.isInteger(arg0_year))

    if (in_memory_slice_lru.has(lru_key)) {
      let cached_list = in_memory_slice_lru.get(lru_key)!
      return {
        count: cached_list.length,
        date: UfDate.formatDate(target_date_obj),
        domain,
        features: cached_list,
        source,
        timestamp: target_ts,
        year: target_year,
      }
    }

    disk_cache_path = path.join(
      AtlasBordersService.getDatasetPaths().cacheDir,
      `borders_${dataset}_${target_year}.json`
    )

    if (!fs.existsSync(disk_cache_path) && (dataset === 'simplified_borders' || dataset === 'statistical_borders')) {
      let alt_dataset = (dataset === 'simplified_borders') ? 'statistical_borders' : 'simplified_borders'
      let alt_path = path.join(AtlasBordersService.getDatasetPaths().cacheDir, `borders_${alt_dataset}_${target_year}.json`)
      if (fs.existsSync(alt_path))
        disk_cache_path = alt_path
    }

    if (is_whole_year_query && fs.existsSync(disk_cache_path)) {
      try {
        let cached_json = JSON.parse(fs.readFileSync(disk_cache_path, 'utf-8'))
        let is_valid_cache = Array.isArray(cached_json.features) &&
          (cached_json.features.length > 0 || target_year < -3000) &&
          (cached_json.features.length === 0 || cached_json.features[0].id !== undefined)
        let is_missing_cap_coords = cached_json.v !== 6 &&
          cached_json.features &&
          cached_json.features.length > 20 &&
          !cached_json.features.some((arg0_f: any) => arg0_f.properties?.cap_coords) &&
          cached_json.features.some((arg0_f: any) => arg0_f.properties?.capname)
        if (is_valid_cache && !is_missing_cap_coords && cached_json.v === 6) {
          in_memory_slice_lru.set(lru_key, cached_json.features)
          return {
            count: cached_json.features.length,
            date: cached_json.date || UfDate.formatDate(target_date_obj),
            domain,
            features: cached_json.features,
            source,
            timestamp: cached_json.timestamp || target_ts,
            year: target_year,
          }
        }
      } catch {
        //Ignore malformed cache
      }
    }

    if (dataset === 'detailed_borders') {
      let dataset_paths = AtlasBordersService.getDatasetPaths()
      let entities: Map<string, NaissanceEntityRecord>

      if (fs.existsSync(dataset_paths.detailedNaissancePath)) {
        entities = AtlasBordersService.loadNaissance(dataset_paths.detailedNaissancePath)
      } else {
        let slice = detailed_borders_slices.find((arg0_s) =>
          target_year >= arg0_s.domain[0] && (target_year < arg0_s.domain[1] || arg0_s.domain[1] === 2026)
        )
        if (!slice)
          slice = target_year < -3500 ? detailed_borders_slices[0] : detailed_borders_slices[detailed_borders_slices.length - 1]

        let detailed_path = path.join(dataset_paths.detailedDir, slice.file)
        entities = AtlasBordersService.loadNaissance(detailed_path)
      }

      for (let [ent_id, ent] of entities.entries()) {
        if (ent.min_ts > target_ts)
          continue

        let current_geom: any = null
        let current_props: Record<string, any> = {}
        let current_symbol: Record<string, any> = {}
        let resolved_ts = ent.min_ts

        for (let i = 0; i < ent.sorted_timestamps.length; i++) {
          let ts = ent.sorted_timestamps[i]
          if (ts > target_ts)
            break

          resolved_ts = ts
          let kf = ent.keyframes.get(ts)
          if (!kf)
            continue

          if (kf[0] !== undefined && kf[0] !== 'undefined')
            current_geom = kf[0]
          if (kf[1] !== undefined && kf[1] !== 'undefined' && typeof kf[1] === 'object' && kf[1] !== null)
            current_symbol = { ...current_symbol, ...kf[1] }
          if (kf[2] !== undefined && kf[2] !== 'undefined' && typeof kf[2] === 'object' && kf[2] !== null)
            current_props = { ...current_props, ...kf[2] }
        }

        if (current_props.hidden === true)
          continue
        if (!current_geom)
          continue

        let geom = current_geom.feature?.geometry || current_geom.geometry || (current_geom.type && current_geom.coordinates ? current_geom : null)
        if (!geom || !geom.coordinates)
          continue

        if (!geom._simplified) {
          geom = cullAndSimplifyGeometry(geom, 0.008)
          geom._simplified = true
        }

        let geom_bbox = computeGeometryBBox(geom)

        if (bbox) {
          let [b_min_x, b_min_y, b_max_x, b_max_y] = bbox
          let [g_min_x, g_min_y, g_max_x, g_max_y] = geom_bbox
          if (g_max_x < b_min_x || g_min_x > b_max_x || g_max_y < b_min_y || g_min_y > b_max_y)
            continue
        }

        let raw_name = current_props.name || ent.name || `Entity ${ent_id}`
        let entity_name = typeof raw_name === 'string' ? raw_name.replace(/\n+/g, ' ') : `Entity ${ent_id}`
        let resolved_date_obj = UfDate.convertTimestampToDate(resolved_ts)
        let num_sid = Number(current_props.state_id !== undefined ? current_props.state_id : ent_id)
        let cap_info = getStateCapitalInfo(num_sid, target_year, entity_name, AtlasBordersService.getStateById)
        let feat_fill = current_symbol?.polygonFill ||
          current_props.polygonFill ||
          current_symbol?.fillColor ||
          current_props.fillColor ||
          current_props.fill_color ||
          current_props.color ||
          cap_info.fill_color ||
          AtlasBordersService.getStateById(num_sid)?.fill_color

        if (feat_fill && !current_symbol.polygonFill)
          current_symbol = { ...current_symbol, polygonFill: feat_fill }

        features.push({
          bbox: geom_bbox,
          geometry: geom,
          id: `detailed_${ent_id}`,
          properties: {
            adm0_a3: entity_name,
            area: current_props.area,
            cap_coords: cap_info.cap_coords,
            capkey: cap_info.capkey,
            caplat: cap_info.cap_coords ? cap_info.cap_coords[1] : undefined,
            caplong: cap_info.cap_coords ? cap_info.cap_coords[0] : undefined,
            capname: cap_info.capname,
            color: feat_fill,
            cow: current_props.cow || current_props.cow_code,
            cow_id: current_props.cow_id || current_props.cow || current_props.cow_code,
            cshapes_id: current_props.cshapes_id || current_props.cshapes || current_props.gwcode,
            date: UfDate.formatDate(resolved_date_obj),
            dejure: is_dejure,
            fillColor: feat_fill,
            fill_color: feat_fill,
            flags: current_props.flags,
            gwcode: current_props.gwcode || current_props.cshapes_id || current_props.cshapes,
            id: ent_id,
            is_acapital: cap_info.is_acapital,
            iso_a3: entity_name,
            keyframes: getEntityKeyframesSummary(ent),
            label: current_props.label,
            link: current_props.link,
            name: entity_name,
            name_long: entity_name,
            polygonFill: feat_fill,
            seshat_id: current_props.seshat_id || current_props.seshatId || current_props.seshat,
            state_id: num_sid,
            symbol: current_symbol,
            timestamp: resolved_ts,
          },
          type: 'Feature',
        })
      }
    } else {
      let dataset_paths = AtlasBordersService.getDatasetPaths()
      let entities = AtlasBordersService.loadNaissance(dataset_paths.dejureNaissancePath)

      for (let [ent_id, ent] of entities.entries()) {
        if (ent.min_ts > target_ts)
          continue

        let current_geom: any = null
        let current_props: Record<string, any> = {}
        let current_symbol: Record<string, any> = {}
        let resolved_ts = ent.min_ts

        for (let i = 0; i < ent.sorted_timestamps.length; i++) {
          let ts = ent.sorted_timestamps[i]
          if (ts > target_ts)
            break

          resolved_ts = ts
          let kf = ent.keyframes.get(ts)
          if (!kf)
            continue

          if (kf[0] !== undefined && kf[0] !== 'undefined')
            current_geom = kf[0]
          if (kf[1] !== undefined && kf[1] !== 'undefined' && typeof kf[1] === 'object' && kf[1] !== null)
            current_symbol = { ...current_symbol, ...kf[1] }
          if (kf[2] !== undefined && kf[2] !== 'undefined' && typeof kf[2] === 'object' && kf[2] !== null)
            current_props = { ...current_props, ...kf[2] }
        }

        if (current_props.hidden === true)
          continue
        if (!current_geom)
          continue

        let geom = current_geom.feature?.geometry || current_geom.geometry || (current_geom.type && current_geom.coordinates ? current_geom : null)
        if (!geom || !geom.coordinates)
          continue

        let geom_bbox = computeGeometryBBox(geom)

        if (bbox) {
          let [b_min_x, b_min_y, b_max_x, b_max_y] = bbox
          let [g_min_x, g_min_y, g_max_x, g_max_y] = geom_bbox
          if (g_max_x < b_min_x || g_min_x > b_max_x || g_max_y < b_min_y || g_min_y > b_max_y)
            continue
        }

        let raw_name = current_props.name || ent.name || `Entity ${ent_id}`
        let entity_name = typeof raw_name === 'string' ? raw_name.replace(/\n+/g, ' ') : `Entity ${ent_id}`
        let resolved_date_obj = UfDate.convertTimestampToDate(resolved_ts)
        let explicit_sid = current_props.state_id !== undefined ? Number(current_props.state_id) : undefined
        let cap_info = getStateCapitalInfo(explicit_sid, target_year, entity_name, AtlasBordersService.getStateById)
        let feat_fill = current_symbol?.polygonFill ||
          current_props.polygonFill ||
          current_symbol?.fillColor ||
          current_props.fillColor ||
          current_props.fill_color ||
          current_props.color ||
          undefined

        if (feat_fill && !current_symbol.polygonFill)
          current_symbol = { ...current_symbol, polygonFill: feat_fill }

        features.push({
          bbox: geom_bbox,
          geometry: geom,
          id: `naissance_${ent_id}`,
          properties: {
            adm0_a3: entity_name,
            area: current_props.area,
            cap_coords: cap_info.cap_coords,
            capkey: cap_info.capkey,
            caplat: cap_info.cap_coords ? cap_info.cap_coords[1] : undefined,
            caplong: cap_info.cap_coords ? cap_info.cap_coords[0] : undefined,
            capname: cap_info.capname,
            color: feat_fill,
            cow: current_props.cow || current_props.cow_code,
            cow_id: current_props.cow_id || current_props.cow || current_props.cow_code,
            cshapes_id: current_props.cshapes_id || current_props.cshapes || current_props.gwcode,
            date: UfDate.formatDate(resolved_date_obj),
            dejure: is_dejure,
            fillColor: feat_fill,
            fill_color: feat_fill,
            flags: current_props.flags,
            gwcode: current_props.gwcode || current_props.cshapes_id || current_props.cshapes,
            id: ent_id,
            is_acapital: cap_info.is_acapital,
            iso_a3: entity_name,
            keyframes: getEntityKeyframesSummary(ent),
            label: current_props.label,
            link: current_props.link,
            name: entity_name,
            name_long: entity_name,
            polygonFill: feat_fill,
            seshat_id: current_props.seshat_id || current_props.seshatId || current_props.seshat,
            state_id: explicit_sid,
            symbol: current_symbol,
            timestamp: resolved_ts,
          },
          type: 'Feature',
        })
      }
    }

    if (in_memory_slice_lru.size >= max_lru_entries) {
      let oldest_key = in_memory_slice_lru.keys().next().value
      if (oldest_key !== undefined)
        in_memory_slice_lru.delete(oldest_key)
    }
    in_memory_slice_lru.set(lru_key, features)

    if (is_whole_year_query && (features.length > 0 || target_year < -3000)) {
      try {
        let payload_to_cache = {
          count: features.length,
          date: UfDate.formatDate(target_date_obj),
          domain,
          features,
          source,
          timestamp: target_ts,
          v: 6,
          year: target_year,
        }
        fs.writeFileSync(disk_cache_path, JSON.stringify(payload_to_cache))
      } catch (arg0_err) {
        //Ignore write errors
      }
    }

    //Return statement
    return {
      count: features.length,
      date: UfDate.formatDate(target_date_obj),
      domain,
      features,
      source,
      timestamp: target_ts,
      year: target_year,
    }
  }

  /**
   * Streams sliced border feature collections in chunked JSON format.
   *
   * @param {ServerResponse} arg0_res
   * @param {number} arg1_year
   * @param {Object} [arg2_options]
   *
   * @returns {void}
   */
  static streamBorders (
    arg0_res: ServerResponse,
    arg1_year: number,
    arg2_options?: {
      bbox?: [number, number, number, number]
      dataset?: string
      day?: number
      month?: number
    }
  ): void {
    //Convert from parameters
    let options = arg2_options || {}
    let res = arg0_res
    let year = arg1_year

    //Declare local instance variables
    let borders_res = AtlasBordersService.getBordersAtYear(year, options)
    let features = borders_res.features

    //Function body
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Transfer-Encoding', 'chunked')
    res.setHeader('Cache-Control', 'public, max-age=3600')

    res.write('{\n')
    res.write(`  "type": "FeatureCollection",\n`)
    res.write(`  "year": ${borders_res.year},\n`)
    res.write(`  "date": "${borders_res.date || ''}",\n`)
    res.write(`  "timestamp": ${borders_res.timestamp || 0},\n`)
    res.write(`  "source": "${borders_res.source}",\n`)
    res.write(`  "domain": [${borders_res.domain[0]}, ${borders_res.domain[1]}],\n`)
    res.write(`  "count": ${features.length},\n`)
    res.write(`  "features": [\n`)

    for (let i = 0; i < features.length; i++) {
      let is_last = i === features.length - 1
      let chunk = `    ${JSON.stringify(features[i])}${is_last ? '' : ','}\n`
      res.write(chunk)
    }

    res.write('  ]\n')
    res.write('}\n')
    res.end()

    //Return statement
    return
  }

  /**
   * Retrieves full keyframe history and metadata for a specific entity.
   *
   * @param {string} arg0_id
   *
   * @returns {any}
   */
  static getEntityDetails (arg0_id: string): any {
    //Convert from parameters
    let target_id = arg0_id.replace(/^(naissance_|cshapes_|detailed_)/, '')

    //Declare local instance variables
    let cshapes = AtlasBordersService.loadCShapes()
    let dataset_paths = AtlasBordersService.getDatasetPaths()
    let default_entities = AtlasBordersService.loadNaissance()
    let search_entity_maps = [default_entities]

    //Function body
    if (fs.existsSync(dataset_paths.detailedNaissancePath)) {
      let detailed_entities = AtlasBordersService.loadNaissance(dataset_paths.detailedNaissancePath)
      if (!search_entity_maps.includes(detailed_entities))
        search_entity_maps.push(detailed_entities)
    }

    for (let i = 0; i < search_entity_maps.length; i++) {
      let entities = search_entity_maps[i]
      if (entities.has(target_id)) {
        let ent = entities.get(target_id)!
        let keyframes_detail: any[] = []

        for (let x = 0; x < ent.sorted_timestamps.length; x++) {
          let ts = ent.sorted_timestamps[x]
          let kf = ent.keyframes.get(ts)
          let date_obj = UfDate.convertTimestampToDate(ts)

          keyframes_detail.push({
            date: UfDate.formatDate(date_obj),
            hasGeometry: Boolean(kf && kf[0] && kf[0] !== null && kf[0] !== 'undefined'),
            properties: kf?.[2] || {},
            symbol: kf?.[1] || {},
            timestamp: ts,
            year: date_obj.year,
          })
        }

        //Return statement
        return {
          class_name: ent.class_name,
          id: ent.id,
          keyframes: keyframes_detail,
          name: ent.name,
          source: 'naissance',
          totalKeyframes: keyframes_detail.length,
        }
      }
    }

    let numeric_gw = parseInt(target_id, 10)
    let matching_features = cshapes.filter(
      (arg0_f) => arg0_f.properties.gwcode === numeric_gw || arg0_f.properties.cntry_name.toLowerCase() === target_id.toLowerCase()
    )

    if (matching_features.length > 0) {
      let keyframes_detail = matching_features.map((arg0_f) => ({
        area: arg0_f.properties.area,
        capname: arg0_f.properties.capname,
        date: arg0_f.properties.gwsdate,
        endDate: arg0_f.properties.gwedate,
        endYear: arg0_f.properties.gweyear,
        startDate: arg0_f.properties.gwsdate,
        startYear: arg0_f.properties.gwsyear,
        year: arg0_f.properties.gwsyear,
      }))

      keyframes_detail.sort((arg0_a, arg0_b) => arg0_a.year - arg0_b.year)

      //Return statement
      return {
        gwcode: matching_features[0].properties.gwcode,
        id: target_id,
        keyframes: keyframes_detail,
        name: matching_features[0].properties.cntry_name,
        source: 'cshapes',
        totalKeyframes: keyframes_detail.length,
      }
    }

    //Return statement
    return null
  }

  /**
   * Retrieves state metadata by state ID from data/atlas/temp/states.json.
   *
   * @param {string | number} arg0_state_id
   *
   * @returns {any | null}
   */
  static getStateById (arg0_state_id: string | number): any {
    //Convert from parameters
    let state_id = arg0_state_id

    //Guard clauses
    if (state_id === undefined || state_id === null)
      return null

    //Function body
    if (!AtlasBordersService.states_by_id) {
      AtlasBordersService.states_by_id = new Map()
      let states_path = path.resolve(process.cwd(), 'data/atlas/temp/states.json')
      if (fs.existsSync(states_path)) {
        try {
          let list = JSON.parse(fs.readFileSync(states_path, 'utf-8'))
          if (Array.isArray(list)) {
            for (let i = 0; i < list.length; i++) {
              let s = list[i]
              AtlasBordersService.states_by_id.set(s.state_id, s)
              AtlasBordersService.states_by_id.set(String(s.state_id), s)
            }
          }
        } catch (arg0_err) {
          console.warn('[AtlasBordersService] Failed to load states.json:', arg0_err)
        }
      }
    }

    //Return statement
    return AtlasBordersService.states_by_id.get(state_id) || AtlasBordersService.states_by_id.get(String(state_id)) || null
  }

  /**
   * Retrieves authoritative capital city info for a state at a fractional year.
   *
   * @param {number} arg0_state_id
   * @param {number} arg1_year_frac
   * @param {string} [arg2_entity_name]
   *
   * @returns {StateCapitalInfo}
   */
  static getStateCapitalInfo (
    arg0_state_id: number,
    arg1_year_frac: number,
    arg2_entity_name?: string
  ): StateCapitalInfo {
    return getStateCapitalInfo(arg0_state_id, arg1_year_frac, arg2_entity_name, AtlasBordersService.getStateById)
  }

  /**
   * Resolves city coordinates and key from city name and optional country.
   *
   * @param {string} arg0_city_name
   * @param {string} [arg1_country]
   *
   * @returns {{ coords?: [number, number]; key?: string } | null}
   */
  static findCityCoordsByName (
    arg0_city_name: string,
    arg1_country?: string
  ): { coords?: [number, number]; key?: string } | null {
    return findCityCoordsByName(arg0_city_name, arg1_country)
  }

  /**
   * Clears the in-memory LRU cache and disk slice cache.
   *
   * @returns {void}
   */
  static clearCache (): void {
    //Function body
    AtlasBordersService.states_by_id = null
    cached_active_state_ids.clear()
    clearAtlasConfigCache()
    clearCityResolverCache()
    clearNaissanceCache()
    in_memory_slice_lru.clear()

    let cache_dir = AtlasBordersService.getDatasetPaths().cacheDir
    if (fs.existsSync(cache_dir)) {
      let files = fs.readdirSync(cache_dir)
      for (let i = 0; i < files.length; i++) {
        if (files[i].startsWith('borders_') && files[i].endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(cache_dir, files[i]))
          } catch {}
        }
      }
    }
  }
}
