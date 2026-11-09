import fs from 'fs'
import path from 'path'
import { getStateCapitalInfo } from './atlas_city_resolver.ts'
import { computeGeometryBBox, cullAndSimplifyGeometry } from './atlas_geometry_utils.ts'
import { FilepathDefines } from './filepath_defines.ts'
import { UfDate } from '../framework/utils/uf_date.ts'

export interface HistoricalBorderKeyframe {
  date: string
  day?: number
  description?: string
  label: string
  month?: number
  properties?: Record<string, any>
  timestamp?: number
  year: number
}

export interface HistoricalBorderFeature {
  bbox?: [number, number, number, number]
  geometry: {
    coordinates: any
    type: 'Polygon' | 'MultiPolygon'
  }
  id: string
  properties: {
    area?: number
    attributes?: Record<string, any>
    cap_coords?: [number, number]
    capkey?: string
    caplat?: number
    caplong?: number
    capname?: string
    cow?: number | string
    cow_id?: number | string
    cshapes_id?: number | string
    date?: string
    dejure?: boolean
    description?: string | string[]
    endDate?: string
    endYear?: number
    gwcode?: number
    id: string | number
    is_acapital?: boolean
    keyframes?: HistoricalBorderKeyframe[]
    name: string
    seshat_id?: string
    startDate?: string
    startYear?: number
    state_id?: number
    symbol?: Record<string, any>
    timestamp?: number
    [key: string]: any
  }
  type: 'Feature'
}

export interface NaissanceEntityRecord {
  class_name: string
  description?: string | string[]
  id: string
  keyframes: Map<number, [any, any, any]>
  keyframes_summary?: HistoricalBorderKeyframe[]
  max_ts: number
  metadata?: Record<string, any>
  min_ts: number
  name?: string
  sorted_timestamps: number[]
}

export let defacto_borders_slices = [
  { domain: [-3500, 476], file: '0.476.1.1.naissance' },
  { domain: [476, 1356], file: '1.1356.1.1.naissance' },
  { domain: [1356, 1707], file: '2.1707.1.1.naissance' },
  { domain: [1707, 1815], file: '3.1815.1.1.naissance' },
  { domain: [1815, 1914], file: '4.1914.1.1.naissance' },
  { domain: [1914, 1936], file: '5.1936.1.1.naissance' },
  { domain: [1936, 1946], file: '6.1946.1.1.naissance' },
  { domain: [1946, 1991], file: '7.1991.1.1.naissance' },
  { domain: [1991, 2026], file: '8.2026.1.1.naissance' },
]

let cached_cshapes_data: any = null
let cached_cshapes_features: any[] = null as unknown as any[]
let cached_cshapes_keyframes_by_gwcode: Map<number, HistoricalBorderKeyframe[]> = new Map()
let cached_naissance_entities_by_path: Map<string, Map<string, NaissanceEntityRecord>> = new Map()
let cached_naissance_mtimes: Map<string, number> = new Map()

/**
 * Resolves the last-modified timestamp of a .naissance file on disk.
 *
 * @param {string} arg0_file_path
 *
 * @returns {number}
 */
export let getNaissanceFileMtime = function (arg0_file_path: string): number {
  //Convert from parameters
  let file_path = arg0_file_path

  //Guard clauses
  if (!fs.existsSync(file_path))
    return 0

  //Return statement
  return fs.statSync(file_path).mtimeMs
}


/**
 * Checks whether an in-memory parsed Naissance entity cache is stale relative to disk mtime.
 *
 * @param {string} arg0_file_path
 *
 * @returns {boolean}
 */
export let isNaissanceCacheStale = function (arg0_file_path: string): boolean {
  //Convert from parameters
  let file_path = arg0_file_path

  //Guard clauses
  if (!cached_naissance_entities_by_path.has(file_path))
    return false
  if (!fs.existsSync(file_path))
    return false

  //Return statement
  return fs.statSync(file_path).mtimeMs !== cached_naissance_mtimes.get(file_path)
}

/**
 * Returns pre-indexed CShapes keyframes by GW code.
 *
 * @returns {Map<number, HistoricalBorderKeyframe[]>}
 */
export let getCShapesKeyframesByGwcode = function (): Map<number, HistoricalBorderKeyframe[]> {
  return cached_cshapes_keyframes_by_gwcode
}

/**
 * Generates or retrieves cached keyframes summary for a Naissance entity.
 *
 * @param {NaissanceEntityRecord} arg0_ent
 *
 * @returns {HistoricalBorderKeyframe[]}
 */
export let getEntityKeyframesSummary = function (arg0_ent: NaissanceEntityRecord): HistoricalBorderKeyframe[] {
  //Convert from parameters
  let ent = arg0_ent

  //Guard clauses
  if (ent.keyframes_summary)
    return ent.keyframes_summary

  //Declare local instance variables
  let keyframes_summary: HistoricalBorderKeyframe[] = []

  //Function body
  for (let k = 0; k < ent.sorted_timestamps.length; k++) {
    let k_ts = ent.sorted_timestamps[k]
    let date_obj = UfDate.convertTimestampToDate(k_ts)
    let k_val = ent.keyframes.get(k_ts)
    let label = 'Boundary keyframe'
    if (k_val && (k_val[0] === null || k_val[2]?.hidden === true)) {
      label = 'Boundary unrecorded / hidden'
    } else if (k === 0) {
      label = 'Recorded keyframe'
    } else if (k_val && k_val[2] && k_val[2].name) {
      label = `Renamed to ${String(k_val[2].name).replace(/\n+/g, ' ')}`
    } else {
      label = 'Boundary updated'
    }

    keyframes_summary.push({
      date: UfDate.formatDate(date_obj),
      day: date_obj.day,
      label,
      month: date_obj.month,
      timestamp: k_ts,
      year: date_obj.year,
    })
  }

  ent.keyframes_summary = keyframes_summary

  //Return statement
  return keyframes_summary
}


/**
 * Loads and indexes CShapes-2.0.geojson in memory on first access.
 *
 * @param {string} [arg0_cshapes_path]
 *
 * @returns {any[]}
 */
export let loadCShapes = function (arg0_cshapes_path?: string): any[] {
  //Guard clauses
  if (cached_cshapes_features)
    return cached_cshapes_features

  //Declare local instance variables
  let file_path = arg0_cshapes_path || FilepathDefines.get().filepaths.atlas_cshapes

  //Guard clauses
  if (!fs.existsSync(file_path)) {
    console.warn(`[AtlasBordersService] CShapes file not found: ${file_path}`)
    cached_cshapes_features = []
    return cached_cshapes_features
  }

  //Function body
  try {
    console.log(`[AtlasBordersService] Loading and indexing CShapes-2.0.geojson...`)
    let raw = fs.readFileSync(file_path, 'utf-8')
    cached_cshapes_data = JSON.parse(raw)
    cached_cshapes_features = cached_cshapes_data.features || []

    for (let i = 0; i < cached_cshapes_features.length; i++) {
      let feat = cached_cshapes_features[i]
      if (feat.geometry)
        feat.geometry = cullAndSimplifyGeometry(feat.geometry, 0.012)
    }

    cached_cshapes_keyframes_by_gwcode = new Map()
    for (let i = 0; i < cached_cshapes_features.length; i++) {
      let feat = cached_cshapes_features[i]
      let p = feat.properties
      let s_day = p.gwsday || 1
      let s_month = p.gwsmonth || 1
      let s_year = p.gwsyear
      let e_day = p.gweday || 1
      let e_month = p.gwemonth || 1
      let e_year = p.gweyear

      feat._start_ts = UfDate.getTimestamp({
        day: s_day,
        hour: 0,
        minute: 0,
        month: s_month,
        year: s_year,
      })
      feat._end_ts = UfDate.getTimestamp({
        day: e_day,
        hour: 23,
        minute: 59,
        month: e_month,
        year: e_year,
      })

      let gw = p.gwcode
      if (gw !== undefined) {
        if (!cached_cshapes_keyframes_by_gwcode.has(gw))
          cached_cshapes_keyframes_by_gwcode.set(gw, [])
        let list = cached_cshapes_keyframes_by_gwcode.get(gw)!
        let formatted_date = UfDate.formatDate({
          day: s_day,
          month: s_month,
          year: s_year,
        })
        list.push({
          date: formatted_date,
          day: s_day,
          label: `Boundary keyframe (${s_year}-${e_year})`,
          month: s_month,
          timestamp: feat._start_ts,
          year: s_year,
        })
      }
    }

    for (let list of cached_cshapes_keyframes_by_gwcode.values()) {
      list.sort((arg0_a, arg0_b) => (arg0_a.timestamp || 0) - (arg0_b.timestamp || 0))
    }

    console.log(`[AtlasBordersService] Successfully indexed ${cached_cshapes_features.length} CShapes features across ${cached_cshapes_keyframes_by_gwcode.size} nations.`)
  } catch (arg0_err) {
    console.error('[AtlasBordersService] Failed to load CShapes-2.0.geojson:', arg0_err)
    cached_cshapes_features = []
  }

  //Return statement
  return cached_cshapes_features
}


/**
 * Parses keyframes from a Naissance entity object, supporting stringified JSON,
 * numeric timestamps, and UF/Date natural/ISO/delimited date strings.
 *
 * @param {any} arg0_ent
 *
 * @returns {{ kf_map: Map<number, [any, any, any]>, sorted_ts: number[] } | null}
 */
export let parseNaissanceKeyframes = function (
  arg0_ent: any
): { kf_map: Map<number, [any, any, any]>; sorted_ts: number[] } | null {
  //Convert from parameters
  let ent = arg0_ent

  //Guard clauses
  if (!ent || typeof ent !== 'object')
    return null

  //Declare local instance variables
  let history_obj: any
  let kf_items: { ts: number; val: [any, any, any] }[] = []
  let kf_map = new Map<number, [any, any, any]>()
  let raw_history = ent.history || ent.keyframes
  let raw_keys: string[]
  let sorted_ts: number[]

  //Function body
  if (typeof raw_history === 'string') {
    try {
      raw_history = JSON.parse(raw_history)
    } catch {
      return null
    }
  }

  history_obj = (raw_history && raw_history.keyframes) ? raw_history.keyframes : raw_history
  if (!history_obj || typeof history_obj !== 'object')
    return null

  raw_keys = Object.keys(history_obj)
  if (raw_keys.length === 0)
    return null

  for (let i = 0; i < raw_keys.length; i++) {
    let raw_key = raw_keys[i]
    let raw_val = history_obj[raw_key]
    let ts: number
    let val = Array.isArray(raw_val) ? raw_val : raw_val?.value
    let trimmed_key = String(raw_key).trim()
    let num_val = Number(trimmed_key)

    if (!Number.isNaN(num_val)) {
      if (Math.abs(num_val) <= 10000) {
        ts = UfDate.getTimestamp({ day: 1, hour: 0, minute: 0, month: 1, year: Math.round(num_val) })
      } else {
        ts = num_val
      }
    } else {
      let parsed_date = UfDate.convertStringToDate(trimmed_key)
      if (parsed_date) {
        ts = UfDate.getTimestamp(parsed_date)
      } else {
        ts = UfDate.getTimestamp(trimmed_key)
      }
    }

    if (Array.isArray(val)) {
      let geom = val[0]
      if (geom === 'undefined')
        geom = undefined
      let symbol = (val[1] === 'undefined') ? undefined : val[1]
      let props = (val[2] === 'undefined') ? undefined : val[2]
      kf_items.push({ ts, val: [geom, symbol, props] as [any, any, any] })
    } else if (raw_val && typeof raw_val === 'object') {
      let geom = raw_val.geometry || raw_val.feature || null
      if (geom === 'undefined')
        geom = undefined
      let symbol = (typeof raw_val.symbol === 'object' && raw_val.symbol !== null) ? raw_val.symbol : (raw_val.symbol === 'undefined' ? undefined : {})
      let props = (typeof raw_val.properties === 'object' && raw_val.properties !== null) ? raw_val.properties : (raw_val.properties === 'undefined' ? undefined : {})
      kf_items.push({ ts, val: [geom, symbol, props] })
    }
  }

  if (kf_items.length === 0)
    return null

  kf_items.sort((arg0_a, arg0_b) => arg0_a.ts - arg0_b.ts)
  sorted_ts = kf_items.map((arg0_it) => arg0_it.ts)

  for (let i = 0; i < kf_items.length; i++) {
    kf_map.set(kf_items[i].ts, kf_items[i].val)
  }

  //Return statement
  return { kf_map, sorted_ts }
}


/**
 * Loads and indexes a .naissance file in memory on first access using SVEA History keyframe specifications.
 * Supports both small and very large (>500MB) files using chunked streaming buffers to prevent V8 string limits.
 *
 * @param {string} arg0_file_path
 *
 * @returns {Map<string, NaissanceEntityRecord>}
 */
export let loadNaissance = function (arg0_file_path: string): Map<string, NaissanceEntityRecord> {
  //Convert from parameters
  let file_path = arg0_file_path

  //Guard clauses
  if (!fs.existsSync(file_path)) {
    console.warn(`[AtlasBordersService] Naissance file not found: ${file_path}`)
    let empty_map = new Map<string, NaissanceEntityRecord>()
    cached_naissance_entities_by_path.set(file_path, empty_map)
    cached_naissance_mtimes.set(file_path, 0)
    return empty_map
  }

  //Declare local instance variables
  let entity_records = new Map<string, NaissanceEntityRecord>()
  let stat = fs.statSync(file_path)

  //Guard clauses
  if (
    cached_naissance_entities_by_path.has(file_path) &&
    cached_naissance_mtimes.get(file_path) === stat.mtimeMs
  ) {
    return cached_naissance_entities_by_path.get(file_path)!
  }

  //If mtime changed or not cached, purge stale entry
  cached_naissance_entities_by_path.delete(file_path)
  cached_naissance_mtimes.delete(file_path)

  //Maintain memory bounded cache: retain at most 3 parsed maps in memory
  if (cached_naissance_entities_by_path.size >= 3) {
    let oldest_key = cached_naissance_entities_by_path.keys().next().value
    if (oldest_key !== undefined) {
      cached_naissance_entities_by_path.delete(oldest_key)
      cached_naissance_mtimes.delete(oldest_key)
    }
  }

  //Function body
  try {
    console.log(`[AtlasBordersService] Loading and indexing ${path.basename(file_path)} (${Math.round(stat.size / 1024 / 1024)}MB)...`)

    if (stat.size >= 250 * 1024 * 1024) {
      let buffer_size = 4 * 1024 * 1024
      let buffer = Buffer.alloc(buffer_size)
      let fd = fs.openSync(file_path, 'r')
      let file_size = stat.size
      let leftover = ''
      let position = 0

      while (position < file_size) {
        let bytes_to_read = Math.min(buffer_size, file_size - position)
        let bytes_read = fs.readSync(fd, buffer, 0, bytes_to_read, position)
        position += bytes_read

        let chunk_str = leftover + buffer.toString('utf-8', 0, bytes_read)
        let last_nl = chunk_str.lastIndexOf('\n')
        if (last_nl === -1) {
          leftover = chunk_str
          continue
        }

        let to_process = chunk_str.slice(0, last_nl)
        leftover = chunk_str.slice(last_nl + 1)
        let lines = to_process.split('\n')

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim()
          if (line === '{' || line === '}' || line === '')
            continue
          if (line.endsWith(','))
            line = line.slice(0, -1)
          if (line.startsWith('"map_settings":'))
            continue

          let colon_idx = line.indexOf('":')
          if (colon_idx === -1)
            continue

          let ent_id = line.slice(1, colon_idx)
          let json_str = line.slice(colon_idx + 2)

          try {
            let ent = JSON.parse(json_str)
            if (!ent || ent.class_name !== 'GeometryPolygon')
              continue

            let parsed_kfs = parseNaissanceKeyframes(ent)
            if (!parsed_kfs)
              continue

            entity_records.set(ent_id, {
              class_name: ent.class_name,
              description: ent.metadata?.description || ent.metadata?.descriptions || ent.description || ent.descriptions,
              id: ent_id,
              keyframes: parsed_kfs.kf_map,
              max_ts: parsed_kfs.sorted_ts[parsed_kfs.sorted_ts.length - 1],
              metadata: ent.metadata,
              min_ts: parsed_kfs.sorted_ts[0],
              name: ent.name,
              sorted_timestamps: parsed_kfs.sorted_ts,
            })
          } catch {
            //Skip malformed entry
          }
        }
      }

      if (leftover.trim().length > 0) {
        let line = leftover.trim()
        if (line.endsWith(','))
          line = line.slice(0, -1)
        if (line !== '}' && !line.startsWith('"map_settings":')) {
          let colon_idx = line.indexOf('":')
          if (colon_idx !== -1) {
            let ent_id = line.slice(1, colon_idx)
            let json_str = line.slice(colon_idx + 2)
            try {
              let ent = JSON.parse(json_str)
              if (ent && ent.class_name === 'GeometryPolygon') {
                let parsed_kfs = parseNaissanceKeyframes(ent)
                if (parsed_kfs) {
                  entity_records.set(ent_id, {
                    class_name: ent.class_name,
                    description: ent.metadata?.description || ent.metadata?.descriptions || ent.description || ent.descriptions,
                    id: ent_id,
                    keyframes: parsed_kfs.kf_map,
                    max_ts: parsed_kfs.sorted_ts[parsed_kfs.sorted_ts.length - 1],
                    metadata: ent.metadata,
                    min_ts: parsed_kfs.sorted_ts[0],
                    name: ent.name,
                    sorted_timestamps: parsed_kfs.sorted_ts,
                  })
                }
              }
            } catch {
              //Skip malformed entry
            }
          }
        }
      }

      fs.closeSync(fd)
    } else {
      let raw = fs.readFileSync(file_path, 'utf-8')
      let parsed_data = JSON.parse(raw)
      raw = ''

      let keys = Object.keys(parsed_data)
      for (let i = 0; i < keys.length; i++) {
        let ent_id = keys[i]
        if (ent_id === 'map_settings')
          continue

        let ent = parsed_data[ent_id]
        if (!ent || ent.class_name !== 'GeometryPolygon')
          continue

        let parsed_kfs = parseNaissanceKeyframes(ent)
        if (!parsed_kfs)
          continue

        entity_records.set(ent_id, {
          class_name: ent.class_name,
          description: ent.metadata?.description || ent.metadata?.descriptions || ent.description || ent.descriptions,
          id: ent_id,
          keyframes: parsed_kfs.kf_map,
          max_ts: parsed_kfs.sorted_ts[parsed_kfs.sorted_ts.length - 1],
          metadata: ent.metadata,
          min_ts: parsed_kfs.sorted_ts[0],
          name: ent.name,
          sorted_timestamps: parsed_kfs.sorted_ts,
        })
      }

      parsed_data = null as any
    }

    console.log(`[AtlasBordersService] Successfully indexed ${entity_records.size} entities from ${path.basename(file_path)}.`)
  } catch (arg0_err) {
    console.error(`[AtlasBordersService] Failed to load ${file_path}:`, arg0_err)
  }

  cached_naissance_entities_by_path.set(file_path, entity_records)
  cached_naissance_mtimes.set(file_path, stat.mtimeMs)

  //Return statement
  return entity_records
}


/**
 * Clears in-memory CShapes and Naissance caches, optionally targeting a specific file.
 *
 * @param {string} [arg0_file_path]
 *
 * @returns {void}
 */
export let clearNaissanceCache = function (arg0_file_path?: string): void {
  //Convert from parameters
  let file_path = arg0_file_path

  //Function body
  if (file_path) {
    cached_naissance_entities_by_path.delete(file_path)
    cached_naissance_mtimes.delete(file_path)
    return
  }

  cached_cshapes_data = null
  cached_cshapes_features = null as unknown as any[]
  cached_cshapes_keyframes_by_gwcode.clear()
  cached_naissance_entities_by_path.clear()
  cached_naissance_mtimes.clear()
}


/**
 * Slices and formats historical border features from Naissance entities for a given target timestamp.
 *
 * @param {Map<string, NaissanceEntityRecord>} arg0_entities
 * @param {number} arg1_target_ts
 * @param {number} arg2_target_year
 * @param {Object} [arg3_options]
 * @param {[number, number, number, number]} [arg3_options.bbox]
 * @param {(arg0_id: string | number) => any} [arg3_options.getStateById]
 * @param {string} [arg3_options.id_prefix='naissance_']
 * @param {boolean} [arg3_options.is_defacto=false]
 * @param {boolean} [arg3_options.is_dejure=false]
 *
 * @returns {HistoricalBorderFeature[]}
 */
export let sliceNaissanceEntities = function (
  arg0_entities: Map<string, NaissanceEntityRecord>,
  arg1_target_ts: number,
  arg2_target_year: number,
  arg3_options?: {
    bbox?: [number, number, number, number]
    getStateById?: (arg0_id: string | number) => any
    id_prefix?: string
    is_defacto?: boolean
    is_dejure?: boolean
  }
): HistoricalBorderFeature[] {
  //Convert from parameters
  let entities = arg0_entities
  let options = arg3_options || {}
  let target_ts = arg1_target_ts
  let target_year = arg2_target_year

  //Declare local instance variables
  let bbox = options.bbox
  let features: HistoricalBorderFeature[] = []
  let getStateById = options.getStateById || (() => null)
  let id_prefix = options.id_prefix || 'naissance_'
  let is_defacto = Boolean(options.is_defacto)
  let is_dejure = Boolean(options.is_dejure)

  //Function body
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
    let explicit_sid = current_props.state_id !== undefined ? Number(current_props.state_id) : (is_defacto ? Number(ent_id) : undefined)
    let cap_info = getStateCapitalInfo(explicit_sid, target_year, entity_name, getStateById)
    let feat_fill = current_symbol?.polygonFill ||
      current_props.polygonFill ||
      current_symbol?.fillColor ||
      current_props.fillColor ||
      current_props.fill_color ||
      current_props.color ||
      (is_defacto ? (cap_info.fill_color || getStateById(explicit_sid!)?.fill_color) : undefined)

    if (feat_fill && !current_symbol.polygonFill)
      current_symbol = { ...current_symbol, polygonFill: feat_fill }

    features.push({
      bbox: geom_bbox,
      geometry: geom,
      id: `${id_prefix}${ent_id}`,
      properties: {
        adm0_a3: entity_name,
        area: current_props.area,
        attributes: current_props,
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
        description: current_props.description || current_props.descriptions || ent.description || ent.metadata?.description,
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

  //Return statement
  return features
}
