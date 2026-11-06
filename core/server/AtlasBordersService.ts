import fs from 'fs'
import path from 'path'
import type { ServerResponse } from 'http'
import { normaliseBorderDatasetId } from '../framework/geopng/types.ts'
import { UfDate, type UfDateObject } from '../framework/utils/uf_date.ts'
import {
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
import { FilepathDefines } from './filepath_defines.ts'
import {
  clearNaissanceCache,
  defacto_borders_slices,
  getNaissanceFileMtime,
  type HistoricalBorderFeature,
  type HistoricalBorderKeyframe,
  isNaissanceCacheStale,
  loadCShapes,
  loadNaissance,
  type NaissanceEntityRecord,
  parseNaissanceKeyframes,
  sliceNaissanceEntities,
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

//Bump whenever the cached border feature schema changes, to invalidate stale disk caches
let all_cache_clearers: Array<() => void> = []
let border_cache_version = 8
let cached_active_state_ids: Map<string, Set<number>> = new Map()
let in_memory_slice_lru: Map<string, HistoricalBorderFeature[]> = new Map()
let last_known_source_mtimes: Map<string, number> = new Map()
let max_lru_entries = 60

/**
 * Registers an external cache clearer to run when AtlasBordersService.clearCache() is called.
 *
 * @param {() => void} arg0_fn
 *
 * @returns {void}
 */
export function registerAtlasCacheClearer (arg0_fn: () => void): void {
  //Convert from parameters
  let fn = arg0_fn

  //Function body
  all_cache_clearers.push(fn)
}

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
   * Returns a set of all active state IDs present in the de facto border slice at a specific date.
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
      dataset: 'defacto_borders',
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
    let primary_dataset = normaliseBorderDatasetId(options.dataset, 'defacto_borders')
    let q_name_lower = name ? name.toLowerCase() : ''
    let target_feature: HistoricalBorderFeature | null = null

    //Function body
    datasets_to_search.push(primary_dataset)
    if (primary_dataset !== 'defacto_borders')
      datasets_to_search.push('defacto_borders')
    if (primary_dataset !== 'dejure_borders')
      datasets_to_search.push('dejure_borders')

    let matchFeature = function (arg0_feat: HistoricalBorderFeature): boolean {
      let f = arg0_feat
      let clean_state_id = (state_id !== undefined) ? String(state_id).replace(/^naissance_/, '') : undefined

      if (q_name_lower) {
        let fn = (f.properties?.name || '').toLowerCase().trim()
        let fl = (f.properties?.name_long || '').toLowerCase().trim()
        if (fn !== q_name_lower && fl !== q_name_lower)
          return false
      }

      if (clean_state_id !== undefined) {
        let clean_f_id = String(f.id || '').replace(/^naissance_/, '').replace('detailed_', '').replace('defacto_', '').replace('cshapes_', '')
        let clean_p_id = String(f.properties?.id || '').replace(/^naissance_/, '')
        let p_state_id = (f.properties?.state_id !== undefined) ? String(f.properties.state_id) : ''

        if (clean_f_id === clean_state_id || clean_p_id === clean_state_id || p_state_id === clean_state_id || (!q_name_lower && String(f.properties?.gwcode) === clean_state_id))
          return true

        return Boolean(q_name_lower)
      }

      return Boolean(q_name_lower)
    }

    for (let i = 0; i < datasets_to_search.length; i++) {
      let ds = datasets_to_search[i]
      try {
        let borders_res = AtlasBordersService.getBordersAtYear(target_year, { dataset: ds, day: options.day, month: options.month })
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
      } catch {
        //Continue search
      }
    }

    if (target_feature)
      return target_feature

    if (state_id !== undefined) {
      let state = AtlasBordersService.getStateById(state_id)
      if (state) {
        let synth_feat: HistoricalBorderFeature = {
          geometry: state.bbox
            ? { coordinates: [[[state.bbox[0], state.bbox[1]], [state.bbox[2], state.bbox[1]], [state.bbox[2], state.bbox[3]], [state.bbox[0], state.bbox[3]], [state.bbox[0], state.bbox[1]]]], type: 'Polygon' }
            : { coordinates: [], type: 'Polygon' },
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
    let dataset = normaliseBorderDatasetId(options.dataset, 'dejure_borders')
    let target_day = options.day
    let target_month = options.month

    //Declare local instance variables
    let dataset_paths = AtlasBordersService.getDatasetPaths()
    let disk_cache_path: string
    let domain: [number, number]
    let features: HistoricalBorderFeature[] = []
    let is_dejure = Boolean(dataset_paths.dejureDatasets[dataset])
    let is_whole_year_query: boolean
    let lru_key: string
    let source: 'cshapes' | 'naissance'
    let source_mtime: number
    let target_date_obj: UfDateObject
    let target_ts: number

    //Function body
    AtlasBordersService.ensureDatasetFreshness(dataset, target_year)
    source_mtime = AtlasBordersService.getSourceMtime(dataset, target_year)

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
      dataset_paths.cacheDir,
      `borders_${dataset}_${target_year}.json`
    )

    if (is_whole_year_query && fs.existsSync(disk_cache_path)) {
      try {
        let cache_stat = fs.statSync(disk_cache_path)
        let is_mtime_stale = Boolean(source_mtime > 0 && cache_stat.mtimeMs < source_mtime)

        if (is_mtime_stale) {
          try {
            fs.unlinkSync(disk_cache_path)
          } catch {}
        } else {
          let cached_json = JSON.parse(fs.readFileSync(disk_cache_path, 'utf-8'))
          let is_source_stale = Boolean(cached_json.source_mtime && source_mtime > 0 && cached_json.source_mtime < source_mtime)

          if (is_source_stale) {
            try {
              fs.unlinkSync(disk_cache_path)
            } catch {}
          } else {
            let is_valid_cache = Array.isArray(cached_json.features) &&
              (cached_json.features.length > 0 || target_year < -3000) &&
              (cached_json.features.length === 0 || cached_json.features[0].id !== undefined)
            let is_missing_cap_coords = cached_json.v !== border_cache_version &&
              cached_json.features &&
              cached_json.features.length > 20 &&
              !cached_json.features.some((arg0_f: any) => arg0_f.properties?.cap_coords) &&
              cached_json.features.some((arg0_f: any) => arg0_f.properties?.capname)
            if (is_valid_cache && !is_missing_cap_coords && cached_json.v === border_cache_version) {
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
          }
        }
      } catch {
        //Ignore malformed cache
      }
    }

    if (dataset === 'defacto_borders') {
      let entities: Map<string, NaissanceEntityRecord>

      if (fs.existsSync(dataset_paths.defactoNaissancePath)) {
        entities = AtlasBordersService.loadNaissance(dataset_paths.defactoNaissancePath)
      } else {
        let slice = defacto_borders_slices.find((arg0_s) =>
          target_year >= arg0_s.domain[0] && (target_year < arg0_s.domain[1] || arg0_s.domain[1] === 2026)
        )
        if (!slice)
          slice = target_year < -3500 ? defacto_borders_slices[0] : defacto_borders_slices[defacto_borders_slices.length - 1]

        let slice_path = path.join(dataset_paths.detailedDir, slice.file)
        entities = AtlasBordersService.loadNaissance(slice_path)
      }

      features = sliceNaissanceEntities(entities, target_ts, target_year, {
        bbox,
        getStateById: AtlasBordersService.getStateById,
        id_prefix: 'defacto_',
        is_defacto: true,
        is_dejure,
      })
    } else {
      let entities = AtlasBordersService.loadNaissance(dataset_paths.dejureNaissancePath)

      features = sliceNaissanceEntities(entities, target_ts, target_year, {
        bbox,
        getStateById: AtlasBordersService.getStateById,
        id_prefix: 'naissance_',
        is_defacto: false,
        is_dejure,
      })
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
          source_mtime,
          timestamp: target_ts,
          v: border_cache_version,
          year: target_year,
        }
        fs.writeFileSync(disk_cache_path, JSON.stringify(payload_to_cache))
      } catch {
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
    let target_id = arg0_id.replace(/^(naissance_|cshapes_|detailed_|defacto_)/, '')

    //Declare local instance variables
    let cshapes = AtlasBordersService.loadCShapes()
    let dataset_paths = AtlasBordersService.getDatasetPaths()
    let default_entities = AtlasBordersService.loadNaissance()
    let search_entity_maps = [default_entities]

    //Function body
    if (fs.existsSync(dataset_paths.defactoNaissancePath)) {
      let defacto_entities = AtlasBordersService.loadNaissance(dataset_paths.defactoNaissancePath)
      if (!search_entity_maps.includes(defacto_entities))
        search_entity_maps.push(defacto_entities)
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
          description: ent.description || ent.metadata?.description || (ent as any).descriptions,
          id: ent.id,
          keyframes: keyframes_detail,
          metadata: ent.metadata,
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
      let states_path = FilepathDefines.get().filepaths.atlas_states
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
    last_known_source_mtimes.clear()

    for (let i = 0; i < all_cache_clearers.length; i++) {
      try {
        all_cache_clearers[i]()
      } catch {}
    }

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

  /**
   * Clears in-memory and stale disk caches for a specific border dataset.
   *
   * @param {string} arg0_dataset
   * @param {string} [arg1_source_path]
   *
   * @returns {void}
   */
  static clearCacheForDataset (arg0_dataset: string, arg1_source_path?: string): void {
    //Convert from parameters
    let dataset = normaliseBorderDatasetId(arg0_dataset, 'dejure_borders')
    let source_path = arg1_source_path

    //Function body
    for (let key of in_memory_slice_lru.keys()) {
      if (key.startsWith(`${dataset}_`))
        in_memory_slice_lru.delete(key)
    }

    cached_active_state_ids.clear()
    clearNaissanceCache(source_path)

    for (let i = 0; i < all_cache_clearers.length; i++) {
      try {
        all_cache_clearers[i]()
      } catch {}
    }

    AtlasBordersService.purgeStaleDiskCaches(dataset)

    //Return statement
    return
  }

  /**
   * Validates whether the source .naissance file has been updated on disk, automatically invalidating stale caches.
   *
   * @param {string} arg0_dataset
   * @param {number} [arg1_year]
   *
   * @returns {boolean} True if caches were stale and purged, false if already fresh.
   */
  static ensureDatasetFreshness (arg0_dataset: string, arg1_year?: number): boolean {
    //Convert from parameters
    let dataset = normaliseBorderDatasetId(arg0_dataset, 'dejure_borders')
    let year = arg1_year

    //Declare local instance variables
    let current_mtime: number
    let is_stale = false
    let last_mtime: number | undefined
    let source_path = AtlasBordersService.getSourceDatasetPath(dataset, year)

    //Guard clauses
    if (!source_path || !fs.existsSync(source_path))
      return false

    //Function body
    current_mtime = getNaissanceFileMtime(source_path)
    last_mtime = last_known_source_mtimes.get(source_path)

    if (last_mtime !== undefined && current_mtime > last_mtime)
      is_stale = true
    if (isNaissanceCacheStale(source_path))
      is_stale = true

    last_known_source_mtimes.set(source_path, current_mtime)

    if (is_stale) {
      console.log(`[AtlasBordersService] Detected update to ${path.basename(source_path)} (mtime: ${current_mtime}). Automatically invalidating caches...`)
      AtlasBordersService.clearCacheForDataset(dataset, source_path)
    }

    //Return statement
    return is_stale
  }

  /**
   * Resolves the primary source filesystem path for a historical border dataset.
   *
   * @param {string} arg0_dataset
   * @param {number} [arg1_year]
   *
   * @returns {string | null}
   */
  static getSourceDatasetPath (arg0_dataset: string, arg1_year?: number): string | null {
    //Convert from parameters
    let dataset = normaliseBorderDatasetId(arg0_dataset, 'dejure_borders')
    let year = arg1_year

    //Declare local instance variables
    let dataset_paths = AtlasBordersService.getDatasetPaths()

    //Function body
    if (dataset === 'defacto_borders') {
      if (fs.existsSync(dataset_paths.defactoNaissancePath))
        return dataset_paths.defactoNaissancePath

      if (year !== undefined && fs.existsSync(dataset_paths.detailedDir)) {
        let slice = defacto_borders_slices.find((arg0_s) =>
          year >= arg0_s.domain[0] && (year < arg0_s.domain[1] || arg0_s.domain[1] === 2026)
        )
        if (!slice)
          slice = year < -3500 ? defacto_borders_slices[0] : defacto_borders_slices[defacto_borders_slices.length - 1]

        let slice_path = path.join(dataset_paths.detailedDir, slice.file)
        if (fs.existsSync(slice_path))
          return slice_path
      }

      return dataset_paths.defactoNaissancePath
    }

    //Return statement
    return dataset_paths.dejureNaissancePath || dataset_paths.naissancePath || null
  }

  /**
   * Resolves the last-modified timestamp of the source .naissance file for a dataset.
   *
   * @param {string} arg0_dataset
   * @param {number} [arg1_year]
   *
   * @returns {number}
   */
  static getSourceMtime (arg0_dataset: string, arg1_year?: number): number {
    //Convert from parameters
    let dataset = arg0_dataset
    let year = arg1_year

    //Declare local instance variables
    let source_path = AtlasBordersService.getSourceDatasetPath(dataset, year)

    //Guard clauses
    if (!source_path)
      return 0

    //Return statement
    return getNaissanceFileMtime(source_path)
  }

  /**
   * Purges disk cache files in cacheDir that are older than their corresponding .naissance source file.
   *
   * @param {string} [arg0_dataset]
   *
   * @returns {number} The count of deleted stale cache files.
   */
  static purgeStaleDiskCaches (arg0_dataset?: string): number {
    //Convert from parameters
    let target_dataset = arg0_dataset ? normaliseBorderDatasetId(arg0_dataset, 'dejure_borders') : undefined

    //Declare local instance variables
    let cache_dir = AtlasBordersService.getDatasetPaths().cacheDir
    let purged_count = 0

    //Guard clauses
    if (!fs.existsSync(cache_dir))
      return 0

    //Function body
    try {
      let files = fs.readdirSync(cache_dir)
      for (let i = 0; i < files.length; i++) {
        let f = files[i]
        if (!f.startsWith('borders_') || !f.endsWith('.json'))
          continue

        let file_path = path.join(cache_dir, f)
        let parts = f.replace(/^borders_/, '').replace(/\.json$/, '').split('_')
        let file_year = parts.length > 1 ? Number(parts[parts.length - 1]) : undefined
        let ds = parts.slice(0, parts.length - 1).join('_')

        if (target_dataset && ds !== target_dataset)
          continue

        let source_mtime = AtlasBordersService.getSourceMtime(ds, file_year)
        if (source_mtime > 0) {
          let stat = fs.statSync(file_path)
          if (stat.mtimeMs < source_mtime) {
            try {
              fs.unlinkSync(file_path)
              purged_count++
            } catch {}
          }
        }
      }
    } catch (arg0_err) {
      console.warn('[AtlasBordersService] Error purging stale disk caches:', arg0_err)
    }

    if (purged_count > 0)
      console.log(`[AtlasBordersService] Purged ${purged_count} stale border disk cache file(s).`)

    //Return statement
    return purged_count
  }
}
