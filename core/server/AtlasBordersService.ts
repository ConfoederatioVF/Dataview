import fs from 'fs'
import path from 'path'
import type { ServerResponse } from 'http'
import { UfDate, type UfDateObject } from '../framework/utils/uf_date.ts'

export interface HistoricalBorderKeyframe {
  date: string
  day?: number
  label: string
  month?: number
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
    cap_coords?: [number, number]
    capkey?: string
    caplat?: number
    caplong?: number
    capname?: string
    date?: string
    endDate?: string
    endYear?: number
    gwcode?: number
    id: string | number
    is_acapital?: boolean
    keyframes?: HistoricalBorderKeyframe[]
    name: string
    startDate?: string
    startYear?: number
    state_id?: number
    symbol?: Record<string, any>
    timestamp?: number
    [key: string]: any
  }
  type: 'Feature'
}

export interface HistoricalBordersResponse {
  count: number
  date?: string
  domain: [number, number]
  features: HistoricalBorderFeature[]
  source: 'cshapes' | 'naissance'
  timestamp?: number
  year: number
}

interface NaissanceEntityRecord {
  class_name: string
  id: string
  keyframes: Map<number, [any, any, any]>
  keyframes_summary?: HistoricalBorderKeyframe[]
  max_ts: number
  min_ts: number
  name?: string
  sorted_timestamps: number[]
}

let cached_cshapes_data: any = null
let cached_cshapes_features: any[] = null as unknown as any[]
let cached_cshapes_keyframes_by_gwcode: Map<number, HistoricalBorderKeyframe[]> = new Map()
let cached_naissance_entities_by_path: Map<string, Map<string, NaissanceEntityRecord>> = new Map()
let detailed_borders_slices = [
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
let in_memory_slice_lru: Map<string, HistoricalBorderFeature[]> = new Map()
let max_lru_entries = 60

/**
 * Computes a 2D bounding box [minLng, minLat, maxLng, maxLat] for a GeoJSON geometry.
 *
 * @param {any} arg0_geometry
 *
 * @returns {[number, number, number, number]}
 */
export let computeGeometryBBox = function (arg0_geometry: any): [number, number, number, number] {
  //Convert from parameters
  let geometry = arg0_geometry

  //Declare local instance variables
  let max_x = -Infinity
  let max_y = -Infinity
  let min_x = Infinity
  let min_y = Infinity
  let scan_coords: (arg0_coords: any) => void

  //Function body
  scan_coords = function (arg0_coords: any) {
    let coords = arg0_coords
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      let x = coords[0]
      let y = coords[1]
      if (x < min_x)
        min_x = x
      if (x > max_x)
        max_x = x
      if (y < min_y)
        min_y = y
      if (y > max_y)
        max_y = y
      return
    }
    for (let i = 0; i < coords.length; i++)
      scan_coords(coords[i])
  }

  if (geometry && geometry.coordinates)
    scan_coords(geometry.coordinates)

  //Return statement
  return [
    min_x === Infinity ? -180 : min_x,
    min_y === Infinity ? -90 : min_y,
    max_x === -Infinity ? 180 : max_x,
    max_y === -Infinity ? 90 : max_y,
  ]
}

/**
 * Recursively applies Ramer-Douglas-Peucker simplification step to an array of 2D points.
 *
 * @param {any[]} arg0_points
 * @param {number} arg1_first
 * @param {number} arg2_last
 * @param {number} arg3_sq_tol
 * @param {any[]} arg4_simplified
 *
 * @returns {void}
 */
function simplifyRDPStep (
  arg0_points: any[],
  arg1_first: number,
  arg2_last: number,
  arg3_sq_tol: number,
  arg4_simplified: any[]
): void {
  //Convert from parameters
  let first = arg1_first
  let last = arg2_last
  let points = arg0_points
  let simplified = arg4_simplified
  let sq_tol = arg3_sq_tol

  //Declare local instance variables
  let dx: number
  let dy: number
  let index: number = -1
  let max_sq_dist = sq_tol
  let p: any
  let p1: any
  let p2: any
  let proj_x: number
  let proj_y: number
  let sq_d: number
  let t: number

  //Function body
  p1 = points[first]
  p2 = points[last]
  dx = p2[0] - p1[0]
  dy = p2[1] - p1[1]

  for (let i = first + 1; i < last; i++) {
    p = points[i]
    if (dx !== 0 || dy !== 0) {
      t = ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / (dx * dx + dy * dy)
      t = Math.max(0, Math.min(1, t))
      proj_x = p1[0] + t * dx
      proj_y = p1[1] + t * dy
    } else {
      proj_x = p1[0]
      proj_y = p1[1]
    }
    sq_d = (p[0] - proj_x) * (p[0] - proj_x) + (p[1] - proj_y) * (p[1] - proj_y)

    if (sq_d > max_sq_dist) {
      index = i
      max_sq_dist = sq_d
    }
  }

  if (index !== -1) {
    if (index - first > 1)
      simplifyRDPStep(points, first, index, sq_tol, simplified)
    simplified.push(points[index])
    if (last - index > 1)
      simplifyRDPStep(points, index, last, sq_tol, simplified)
  }
}

/**
 * Simplifies and deduplicates a polygon coordinate ring using Ramer-Douglas-Peucker algorithm.
 *
 * @param {any[]} arg0_ring
 * @param {number} [arg1_tolerance=0.01]
 *
 * @returns {any[]}
 */
function simplifyRing (arg0_ring: any[], arg1_tolerance: number = 0.01): any[] {
  //Convert from parameters
  let ring = arg0_ring
  let tol = arg1_tolerance

  //Declare local instance variables
  let chain1: any[]
  let chain2: any[]
  let clean_ring: any[] = []
  let d: number
  let dx: number
  let dy: number
  let far_idx: number = -1
  let is_closed: boolean
  let max_d: number = 0
  let p0: any
  let pt: any
  let result: any[]
  let sq_tol: number

  //Guard clauses
  if (!ring || ring.length <= 4)
    return ring

  //Function body
  for (let i = 0; i < ring.length; i++) {
    pt = ring[i]
    if (
      clean_ring.length === 0 ||
      clean_ring[clean_ring.length - 1][0] !== pt[0] ||
      clean_ring[clean_ring.length - 1][1] !== pt[1]
    ) {
      clean_ring.push(pt)
    }
  }

  if (clean_ring.length <= 4)
    return ring

  is_closed = (
    clean_ring[0][0] === clean_ring[clean_ring.length - 1][0] &&
    clean_ring[0][1] === clean_ring[clean_ring.length - 1][1]
  )
  sq_tol = tol * tol

  if (is_closed) {
    p0 = clean_ring[0]
    for (let i = 1; i < clean_ring.length - 1; i++) {
      dx = clean_ring[i][0] - p0[0]
      dy = clean_ring[i][1] - p0[1]
      d = dx * dx + dy * dy
      if (d > max_d) {
        max_d = d
        far_idx = i
      }
    }

    if (far_idx <= 1 || far_idx >= clean_ring.length - 2)
      return clean_ring

    chain1 = [clean_ring[0]]
    simplifyRDPStep(clean_ring, 0, far_idx, sq_tol, chain1)
    chain1.push(clean_ring[far_idx])

    chain2 = []
    simplifyRDPStep(clean_ring, far_idx, clean_ring.length - 1, sq_tol, chain2)
    chain2.push(clean_ring[clean_ring.length - 1])

    result = chain1.concat(chain2)
    if (result.length < 4)
      return clean_ring

    //Return statement
    return result
  }

  result = [clean_ring[0]]
  simplifyRDPStep(clean_ring, 0, clean_ring.length - 1, sq_tol, result)
  result.push(clean_ring[clean_ring.length - 1])

  //Return statement
  return result
}

/**
 * Culls redundant and duplicate vertices in GeoJSON polygon geometries using Ramer-Douglas-Peucker algorithm.
 *
 * @param {any} arg0_geometry
 * @param {number} [arg1_tolerance=0.01]
 *
 * @returns {any}
 */
export let cullAndSimplifyGeometry = function (arg0_geometry: any, arg1_tolerance: number = 0.01): any {
  //Convert from parameters
  let geometry = arg0_geometry
  let tol = arg1_tolerance

  //Declare local instance variables
  let new_coords: any[] = []
  let new_poly: any[]
  let poly: any[]
  let type: string

  //Guard clauses
  if (!geometry || !geometry.coordinates || !geometry.type)
    return geometry

  //Function body
  type = geometry.type

  if (type === 'Polygon') {
    for (let i = 0; i < geometry.coordinates.length; i++)
      new_coords.push(simplifyRing(geometry.coordinates[i], tol))

    //Return statement
    return {
      ...geometry,
      coordinates: new_coords,
    }
  }

  if (type === 'MultiPolygon') {
    for (let i = 0; i < geometry.coordinates.length; i++) {
      poly = geometry.coordinates[i]
      new_poly = []
      for (let x = 0; x < poly.length; x++)
        new_poly.push(simplifyRing(poly[x], tol))
      new_coords.push(new_poly)
    }

    //Return statement
    return {
      ...geometry,
      coordinates: new_coords,
    }
  }

  //Return statement
  return geometry
}

let city_coords_cache: Map<string, [number, number]> | null = null
let state_capitals_data: Record<number, { acapital: boolean; timeline?: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }> }> | null = null
let states_name_map: Map<string, Array<{ start_year: number; state_id: number; stop_year: number }>> | null = null

let getCityCoordsByKey = function (arg0_key: string): [number, number] | null {
  //Convert from parameters
  let key = arg0_key

  //Function body
  if (!city_coords_cache) {
    city_coords_cache = new Map()
    let coords_path = path.resolve(process.cwd(), 'data/stadester/all_cities_coords.json')
    if (fs.existsSync(coords_path)) {
      try {
        let raw = JSON.parse(fs.readFileSync(coords_path, 'utf-8'))
        let list = Object.values(raw) as any[]
        for (let i = 0; i < list.length; i++) {
          let item = list[i]
          if (item && item.key && Array.isArray(item.coords) && item.coords.length >= 2) {
            city_coords_cache.set(item.key, item.coords as [number, number])
            city_coords_cache.set(item.key.toLowerCase().trim(), item.coords as [number, number])
          }
        }
      } catch {
        //Ignore parsing error
      }
    }
  }

  //Return statement
  return city_coords_cache.get(key) || city_coords_cache.get(key.toLowerCase().trim()) || null
}

let isCityCoordsInsideBbox = function (
  arg0_coords: [number, number],
  arg1_bbox: [number, number, number, number],
  arg2_pad: number = 3.5
): boolean {
  //Convert from parameters
  let bbox = arg1_bbox
  let coords = arg0_coords
  let pad = arg2_pad

  //Declare local instance variables
  let c_lat = coords[1]
  let c_lng = coords[0]
  let max_lat = bbox[3]
  let max_lng = bbox[2]
  let min_lat = bbox[1]
  let min_lng = bbox[0]

  //Return statement
  return (
    c_lng >= min_lng - pad &&
    c_lng <= max_lng + pad &&
    c_lat >= min_lat - pad &&
    c_lat <= max_lat + pad
  )
}

/**
 * Resolves the capital information for a state at a specific fractional year.
 *
 * @param {number} arg0_state_id
 * @param {number} arg1_year_frac
 * @param {string} [arg2_entity_name]
 *
 * @returns {{ cap_coords?: [number, number]; capkey?: string; capname?: string; is_acapital: boolean }}
 */
let getStateCapitalInfo = function (
  arg0_state_id: number,
  arg1_year_frac: number,
  arg2_entity_name?: string
): { cap_coords?: [number, number]; capkey?: string; capname?: string; is_acapital: boolean } {
  //Convert from parameters
  let entity_name = arg2_entity_name
  let state_id = arg0_state_id
  let year_frac = arg1_year_frac

  //Declare local instance variables
  let best_diff: number
  let best_iv: any
  let candidates: Array<{ start_year: number; state_id: number; stop_year: number }>
  let clean_e: string
  let diff: number
  let file_path: string
  let info: { acapital: boolean; timeline?: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }> } | undefined
  let state: any
  let state_bbox: [number, number, number, number] | undefined
  let states_path: string
  let valid_timeline: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }>

  //Function body
  if (!state_capitals_data) {
    file_path = path.resolve(process.cwd(), 'data/stadester/state_capitals.json')
    if (fs.existsSync(file_path)) {
      try {
        state_capitals_data = JSON.parse(fs.readFileSync(file_path, 'utf-8'))
      } catch {
        state_capitals_data = {}
      }
    } else {
      state_capitals_data = {}
    }
  }

  info = state_capitals_data ? state_capitals_data[state_id] : undefined

  //Fallback to match by entity name if state_id has no direct capital record
  if (!info && entity_name) {
    if (!states_name_map) {
      states_name_map = new Map()
      states_path = path.resolve(process.cwd(), 'data/atlas/temp/states.json')
      if (fs.existsSync(states_path)) {
        try {
          let raw_states = JSON.parse(fs.readFileSync(states_path, 'utf-8'))
          let all_keys = Object.keys(raw_states)
          for (let i = 0; i < all_keys.length; i++) {
            let s = raw_states[all_keys[i]]
            if (s && s.state_id !== undefined) {
              let s_name = (s.name || '').toLowerCase().trim()
              if (!states_name_map.has(s_name))
                states_name_map.set(s_name, [])
              states_name_map.get(s_name)!.push({
                start_year: s.start_year ?? -99999,
                state_id: Number(s.state_id),
                stop_year: s.stop_year ?? 99999,
              })
            }
          }
        } catch {
          //Ignore parsing error
        }
      }
    }

    clean_e = entity_name.toLowerCase().trim()
    candidates = []

    for (let [s_name, list] of states_name_map.entries()) {
      let base_s = s_name.replace(/\(.*?\)/g, '').trim()
      let is_match = (base_s === clean_e) ||
        (clean_e.length >= 4 && (base_s.endsWith(' ' + clean_e) || base_s.startsWith(clean_e + ' ')))
      if (is_match) {
        for (let j = 0; j < list.length; j++) {
          if (year_frac >= list[j].start_year && year_frac <= list[j].stop_year)
            candidates.push(list[j])
        }
      }
    }

    if (candidates.length > 0 && state_capitals_data) {
      candidates.sort((arg0_a, arg0_b) => {
        let a_info = state_capitals_data![arg0_a.state_id]
        let a_has_tl = a_info && !a_info.acapital && a_info.timeline && a_info.timeline.length > 0 ? 1 : 0
        let b_info = state_capitals_data![arg0_b.state_id]
        let b_has_tl = b_info && !b_info.acapital && b_info.timeline && b_info.timeline.length > 0 ? 1 : 0
        return b_has_tl - a_has_tl
      })

      for (let k = 0; k < candidates.length; k++) {
        let candidate_info = state_capitals_data[candidates[k].state_id]
        if (candidate_info) {
          info = candidate_info
          break
        }
      }
    }
  }

  if (!info)
    return { is_acapital: false }

  if (info.acapital)
    return { is_acapital: true }

  if (info.timeline && info.timeline.length > 0) {
    state = AtlasBordersService.getStateById(state_id)
    state_bbox = state?.bbox

    //Filter out timeline items whose cities are geographically impossible for this state
    valid_timeline = []
    for (let i = 0; i < info.timeline.length; i++) {
      let iv = info.timeline[i]
      if (state_bbox && iv.key) {
        let c_coords = getCityCoordsByKey(iv.key)
        if (c_coords && !isCityCoordsInsideBbox(c_coords, state_bbox, 3.5))
          continue
      }
      valid_timeline.push(iv)
    }

    if (valid_timeline.length === 0)
      return { is_acapital: false }

    for (let i = 0; i < valid_timeline.length; i++) {
      let iv = valid_timeline[i]
      if (year_frac >= iv.start_frac && year_frac <= iv.stop_frac) {
        let c_coords = iv.key ? getCityCoordsByKey(iv.key) : undefined
        return { cap_coords: c_coords ? [c_coords[0], c_coords[1]] : undefined, capkey: iv.key, capname: iv.city, is_acapital: false }
      }
    }

    best_iv = valid_timeline[0]
    best_diff = Math.abs(year_frac - (best_iv.start_frac + best_iv.stop_frac) / 2)
    for (let i = 1; i < valid_timeline.length; i++) {
      let iv = valid_timeline[i]
      diff = Math.abs(year_frac - (iv.start_frac + iv.stop_frac) / 2)
      if (diff < best_diff) {
        best_diff = diff
        best_iv = iv
      }
    }
    let best_coords = best_iv.key ? getCityCoordsByKey(best_iv.key) : undefined
    return { cap_coords: best_coords ? [best_coords[0], best_coords[1]] : undefined, capkey: best_iv.key, capname: best_iv.city, is_acapital: false }
  }

  //Return statement
  return { is_acapital: false }
}

/**
 * AtlasBordersService provides high-performance temporal slicing and streaming of historical GIS boundaries.
 */
export class AtlasBordersService {
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
   * Retrieves the absolute filesystem paths for atlas datasets.
   *
   * @returns {{ cacheDir: string, cshapesPath: string, detailedDir: string, naissancePath: string }}
   */
  static getDatasetPaths (): { cacheDir: string; cshapesPath: string; detailedDir: string; naissancePath: string } {
    //Declare local instance variables
    let base_dir = path.resolve(process.cwd(), 'data/atlas')
    let cache_dir = path.join(base_dir, 'cache')
    let cshapes_path = path.join(base_dir, 'CShapes-2.0.geojson')
    let detailed_dir = path.join(base_dir, 'detailed')
    let naissance_path = path.join(base_dir, 'atlas.naissance')

    //Function body
    if (!fs.existsSync(cache_dir))
      fs.mkdirSync(cache_dir, { recursive: true })

    //Return statement
    return {
      cacheDir: cache_dir,
      cshapesPath: cshapes_path,
      detailedDir: detailed_dir,
      naissancePath: naissance_path,
    }
  }

  /**
   * Loads and indexes CShapes-2.0.geojson in memory on first access.
   *
   * @returns {any[]}
   */
  static loadCShapes (): any[] {
    //Guard clauses
    if (cached_cshapes_features)
      return cached_cshapes_features

    //Declare local instance variables
    let file_path = AtlasBordersService.getDatasetPaths().cshapesPath

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

      //Deduplicate and cull redundant vertices from CShapes features for high-performance rendering
      for (let i = 0; i < cached_cshapes_features.length; i++) {
        let feat = cached_cshapes_features[i]
        if (feat.geometry)
          feat.geometry = cullAndSimplifyGeometry(feat.geometry, 0.012)
      }

      //Index keyframes by gwcode and precalculate start/end timestamps
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

      //Sort keyframes chronologically
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
   * Loads and indexes atlas.naissance in memory on first access using SVEA History keyframe specifications.
   *
   * @returns {Map<string, NaissanceEntityRecord>}
   */
  /**
   * Loads and indexes a .naissance file in memory on first access using SVEA History keyframe specifications.
   *
   * @param {string} [arg0_file_path]
   *
   * @returns {Map<string, NaissanceEntityRecord>}
   */
  static loadNaissance (arg0_file_path?: string): Map<string, NaissanceEntityRecord> {
    //Convert from parameters
    let file_path = arg0_file_path || AtlasBordersService.getDatasetPaths().naissancePath

    //Guard clauses
    if (cached_naissance_entities_by_path.has(file_path))
      return cached_naissance_entities_by_path.get(file_path)!

    if (!fs.existsSync(file_path)) {
      console.warn(`[AtlasBordersService] Naissance file not found: ${file_path}`)
      let empty_map = new Map<string, NaissanceEntityRecord>()
      cached_naissance_entities_by_path.set(file_path, empty_map)
      return empty_map
    }

    //Declare local instance variables
    let entity_records = new Map<string, NaissanceEntityRecord>()

    //Release previous slice from memory cache to prevent holding multiple 600MB-900MB slices in RAM
    if (cached_naissance_entities_by_path.size >= 1)
      cached_naissance_entities_by_path.clear()

    //Function body
    try {
      console.log(`[AtlasBordersService] Loading and indexing ${path.basename(file_path)}...`)
      let raw = fs.readFileSync(file_path, 'utf-8')
      let parsed_data = JSON.parse(raw)
      raw = ''

      let keys = Object.keys(parsed_data)
      for (let i = 0; i < keys.length; i++) {
        let ent_id = keys[i]
        if (ent_id === 'map_settings')
          continue

        let ent = parsed_data[ent_id]
        if (!ent || ent.class_name !== 'GeometryPolygon' || !ent.history)
          continue

        let raw_ts_keys = Object.keys(ent.history)
        if (raw_ts_keys.length === 0)
          continue

        let sorted_ts = raw_ts_keys.map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
        let kf_map = new Map<number, [any, any, any]>()

        for (let x = 0; x < sorted_ts.length; x++) {
          let ts = sorted_ts[x]
          let val = ent.history[String(ts)]
          if (Array.isArray(val))
            kf_map.set(ts, val as [any, any, any])
        }

        let keyframes_summary: HistoricalBorderKeyframe[] = []
        for (let k = 0; k < sorted_ts.length; k++) {
          let k_ts = sorted_ts[k]
          let date_obj = UfDate.convertTimestampToDate(k_ts)
          let k_val = kf_map.get(k_ts)
          let label = 'Boundary keyframe'
          if (k_val && (k_val[0] === null || k_val[2]?.hidden === true))
            label = 'Boundary unrecorded / hidden'
          else if (k === 0)
            label = 'Recorded keyframe'
          else if (k_val && k_val[2] && k_val[2].name)
            label = `Renamed to ${String(k_val[2].name).replace(/\n+/g, ' ')}`
          else
            label = 'Boundary updated'

          keyframes_summary.push({
            date: UfDate.formatDate(date_obj),
            day: date_obj.day,
            label,
            month: date_obj.month,
            timestamp: k_ts,
            year: date_obj.year,
          })
        }

        entity_records.set(ent_id, {
          class_name: ent.class_name,
          id: ent_id,
          keyframes: kf_map,
          keyframes_summary,
          max_ts: sorted_ts[sorted_ts.length - 1],
          min_ts: sorted_ts[0],
          name: ent.name,
          sorted_timestamps: sorted_ts,
        })
      }

      parsed_data = null as any
      console.log(`[AtlasBordersService] Successfully indexed ${entity_records.size} entities from ${path.basename(file_path)}.`)
    } catch (arg0_err) {
      console.error(`[AtlasBordersService] Failed to load ${file_path}:`, arg0_err)
    }

    cached_naissance_entities_by_path.set(file_path, entity_records)

    //Return statement
    return entity_records
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
    let borders_res = AtlasBordersService.getBordersAtYear(year, {
      dataset: 'detailed_borders',
      day,
      month,
    })

    //Function body
    for (let i = 0; i < borders_res.features.length; i++) {
      let feat = borders_res.features[i]
      let sid = feat.properties?.state_id
      if (sid !== undefined && sid !== null)
        active_ids.add(Number(sid))
    }

    //Return statement
    return active_ids
  }

  /**
   * Retrieves a single historical border feature by state_id, gwcode, or name at a given year.
   * Searches detailed_borders first, then statistical_borders, and finally falls back to states.json.
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
          //1. Exact match pass
          for (let x = 0; x < borders_res.features.length; x++) {
            if (matchFeature(borders_res.features[x])) {
              target_feature = borders_res.features[x]
              break
            }
          }
          if (target_feature)
            break

          //2. Substring/alias match pass if name was provided
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

    //3. Fallback to states.json if not found in sliced border geometries
    if (state_id !== undefined) {
      let state = AtlasBordersService.getStateById(state_id)
      if (state) {
        let synth_feat: HistoricalBorderFeature = {
          geometry: state.bbox ? {
            coordinates: [[
              [state.bbox[0], state.bbox[1]],
              [state.bbox[2], state.bbox[1]],
              [state.bbox[2], state.bbox[3]],
              [state.bbox[0], state.bbox[3]],
              [state.bbox[0], state.bbox[1]],
            ]],
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
    }
  ): HistoricalBordersResponse {
    //Convert from parameters
    let options = arg1_options || {}
    let target_year = arg0_year
    let bbox = options.bbox
    let dataset = options.dataset || 'statistical_borders'
    let target_day = options.day
    let target_month = options.month

    //Declare local instance variables
    let disk_cache_path: string
    let domain: [number, number]
    let features: HistoricalBorderFeature[] = []
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

    domain = dataset === 'detailed_borders'
      ? [-3500, 2026]
      : (target_year >= 1886 ? [1886, 2026] : [-3500, 1886])

    source = dataset === 'detailed_borders'
      ? 'naissance'
      : (target_year >= 1886 ? 'cshapes' : 'naissance')

    lru_key = `${dataset}_${target_date_obj.year}_${target_date_obj.month}_${target_date_obj.day}_${bbox ? bbox.join(',') : 'all'}`
    is_whole_year_query = Boolean(!bbox && target_date_obj.day === 1 && target_date_obj.month === 1 && Number.isInteger(arg0_year))

    //Check in-memory LRU cache
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

    //Check disk cache only for baseline whole-year queries without spatial bbox
    if (is_whole_year_query && fs.existsSync(disk_cache_path)) {
      try {
        let cached_json = JSON.parse(fs.readFileSync(disk_cache_path, 'utf-8'))
        if (Array.isArray(cached_json.features) && (cached_json.features.length === 0 || cached_json.features[0].properties?.state_id !== undefined)) {
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
      //--- 1. DETAILED BORDERS SLICER (-3500 to 2026) ---
      let slice = detailed_borders_slices.find((arg0_s) =>
        target_year >= arg0_s.domain[0] && (target_year < arg0_s.domain[1] || arg0_s.domain[1] === 2026)
      )
      if (!slice)
        slice = target_year < -3500 ? detailed_borders_slices[0] : detailed_borders_slices[detailed_borders_slices.length - 1]

      let detailed_path = path.join(AtlasBordersService.getDatasetPaths().detailedDir, slice.file)
      let entities = AtlasBordersService.loadNaissance(detailed_path)

      for (let [ent_id, ent] of entities.entries()) {
        //Guard clause: check if entity exists at or before target timestamp
        if (ent.min_ts > target_ts)
          continue

        let current_geom: any = null
        let current_props: Record<string, any> = {}
        let current_symbol: Record<string, any> = {}
        let resolved_ts = ent.min_ts

        //Resolve state at target_ts using SVEA History algorithm
        for (let i = 0; i < ent.sorted_timestamps.length; i++) {
          let ts = ent.sorted_timestamps[i]
          if (ts > target_ts)
            break

          resolved_ts = ts
          let kf = ent.keyframes.get(ts)
          if (!kf)
            continue

          if (kf[0] !== undefined)
            current_geom = kf[0]
          if (kf[1] !== undefined && typeof kf[1] === 'object' && kf[1] !== null)
            current_symbol = { ...current_symbol, ...kf[1] }
          if (kf[2] !== undefined && typeof kf[2] === 'object' && kf[2] !== null)
            current_props = { ...current_props, ...kf[2] }
        }

        //If territory ceased existing (.properties.hidden in SVEA) or geometry is missing, skip
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
        let cap_info = getStateCapitalInfo(num_sid, target_year, entity_name)

        features.push({
          bbox: geom_bbox,
          geometry: geom,
          id: `detailed_${ent_id}`,
          properties: {
            adm0_a3: entity_name,
            area: current_props.area,
            capkey: cap_info.capkey,
            capname: cap_info.capname,
            date: UfDate.formatDate(resolved_date_obj),
            flags: current_props.flags,
            id: ent_id,
            is_acapital: cap_info.is_acapital,
            iso_a3: entity_name,
            keyframes: ent.keyframes_summary || [],
            label: current_props.label,
            link: current_props.link,
            name: entity_name,
            name_long: entity_name,
            state_id: num_sid,
            symbol: current_symbol,
            timestamp: resolved_ts,
          },
          type: 'Feature',
        })
      }
    } else if (target_year >= 1886) {
      //--- 2. CSHAPES-2.0 GEOJSON SLICER (1886 - Present) ---
      let cshapes = AtlasBordersService.loadCShapes()

      for (let i = 0; i < cshapes.length; i++) {
        let feat = cshapes[i]
        let p = feat.properties

        //Check temporal domain validity using precalculated timestamps
        let is_active = feat._start_ts <= target_ts && (feat._end_ts >= target_ts || (p.gweyear >= 2019 && target_year >= 2019))
        if (!is_active)
          continue

        //Compute or verify bounding box
        let geom_bbox = feat.bbox || computeGeometryBBox(feat.geometry)
        if (bbox) {
          let [b_min_x, b_min_y, b_max_x, b_max_y] = bbox
          let [g_min_x, g_min_y, g_max_x, g_max_y] = geom_bbox
          if (g_max_x < b_min_x || g_min_x > b_max_x || g_max_y < b_min_y || g_min_y > b_max_y)
            continue
        }

        let gw = p.gwcode
        let keyframes = gw !== undefined ? cached_cshapes_keyframes_by_gwcode.get(gw) : undefined

        features.push({
          bbox: geom_bbox,
          geometry: feat.geometry,
          id: `cshapes_${p.gwcode}_${p.gwsyear}`,
          properties: {
            adm0_a3: p.cntry_name,
            area: p.area,
            cap_coords: (p.caplong !== undefined && p.caplat !== undefined) ? [p.caplong, p.caplat] : undefined,
            caplat: p.caplat,
            caplong: p.caplong,
            capname: p.capname,
            date: UfDate.formatDate({
              day: p.gwsday || 1,
              month: p.gwsmonth || 1,
              year: p.gwsyear,
            }),
            endDate: p.gwedate,
            endYear: p.gweyear,
            gwcode: p.gwcode,
            id: p.gwcode,
            iso_a3: p.cntry_name,
            keyframes: keyframes || [],
            name: p.cntry_name,
            name_long: p.cntry_name,
            startDate: p.gwsdate,
            startYear: p.gwsyear,
          },
          type: 'Feature',
        })
      }
    } else {
      //--- 3. ATLAS.NAISSANCE SLICER (-3500 to 1886) ---
      let entities = AtlasBordersService.loadNaissance()

      for (let [ent_id, ent] of entities.entries()) {
        //Guard clause: check if entity exists at or before target timestamp
        if (ent.min_ts > target_ts)
          continue

        let current_geom: any = null
        let current_props: Record<string, any> = {}
        let current_symbol: Record<string, any> = {}
        let resolved_ts = ent.min_ts

        //Resolve state at target_ts using SVEA History algorithm
        for (let i = 0; i < ent.sorted_timestamps.length; i++) {
          let ts = ent.sorted_timestamps[i]
          if (ts > target_ts)
            break

          resolved_ts = ts
          let kf = ent.keyframes.get(ts)
          if (!kf)
            continue

          if (kf[0] !== undefined)
            current_geom = kf[0]
          if (kf[1] !== undefined && typeof kf[1] === 'object' && kf[1] !== null)
            current_symbol = { ...current_symbol, ...kf[1] }
          if (kf[2] !== undefined && typeof kf[2] === 'object' && kf[2] !== null)
            current_props = { ...current_props, ...kf[2] }
        }

        //If territory ceased existing (.properties.hidden in SVEA) or geometry is missing, skip
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
        let num_sid = Number(ent_id)
        let cap_info = getStateCapitalInfo(num_sid, target_year, entity_name)

        features.push({
          bbox: geom_bbox,
          geometry: geom,
          id: `naissance_${ent_id}`,
          properties: {
            adm0_a3: entity_name,
            cap_coords: cap_info.cap_coords,
            capkey: cap_info.capkey,
            capname: cap_info.capname,
            date: UfDate.formatDate(resolved_date_obj),
            id: ent_id,
            is_acapital: cap_info.is_acapital,
            iso_a3: entity_name,
            keyframes: ent.keyframes_summary || [],
            name: entity_name,
            name_long: entity_name,
            state_id: num_sid,
            symbol: current_symbol,
            timestamp: resolved_ts,
          },
          type: 'Feature',
        })
      }
    }

    //Sort features deterministically by name
    features.sort((arg0_a, arg0_b) => arg0_a.properties.name.localeCompare(arg0_b.properties.name))

    //Update in-memory LRU with capacity cap
    if (in_memory_slice_lru.size >= max_lru_entries) {
      let oldest_key = in_memory_slice_lru.keys().next().value
      if (oldest_key !== undefined)
        in_memory_slice_lru.delete(oldest_key)
    }
    in_memory_slice_lru.set(lru_key, features)

    //Persist to disk cache asynchronously only for baseline whole-year queries
    if (is_whole_year_query) {
      try {
        fs.writeFile(
          disk_cache_path,
          JSON.stringify({ date: UfDate.formatDate(target_date_obj), domain, features, source, timestamp: target_ts, year: target_year }),
          'utf-8',
          () => {}
        )
      } catch {
        //Ignore disk write errors
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
   * Streams sliced historical borders as chunked JSON to the HTTP response.
   *
   * @param {ServerResponse} arg0_res
   * @param {number} arg1_year
   * @param {Object} [arg2_options]
   * @param {[number, number, number, number]} [arg2_options.bbox]
   * @param {string} [arg2_options.dataset]
   * @param {number} [arg2_options.day]
   * @param {number} [arg2_options.month]
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
    let default_entities = AtlasBordersService.loadNaissance()
    let search_entity_maps = [default_entities, ...cached_naissance_entities_by_path.values()]

    //Function body
    //1. Check Naissance entities across any loaded maps or default atlas.naissance
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
            hasGeometry: Boolean(kf && kf[0] && kf[0] !== null),
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

    //2. Check CShapes entities
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

  static states_by_id: Map<string | number, any> | null = null

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
   * @returns {{ capkey?: string; capname?: string; is_acapital: boolean }}
   */
  static getStateCapitalInfo (
    arg0_state_id: number,
    arg1_year_frac: number,
    arg2_entity_name?: string
  ): { capkey?: string; capname?: string; is_acapital: boolean } {
    return getStateCapitalInfo(arg0_state_id, arg1_year_frac, arg2_entity_name)
  }

  /**
   * Clears the in-memory LRU cache and disk slice cache.
   *
   * @returns {void}
   */
  static clearCache (): void {
    //Function body
    in_memory_slice_lru.clear()
    cached_naissance_entities_by_path.clear()
    let cache_dir = AtlasBordersService.getDatasetPaths().cacheDir
    if (fs.existsSync(cache_dir)) {
      let files = fs.readdirSync(cache_dir)
      for (let i = 0; i < files.length; i++) {
        if (files[i].startsWith('borders_') && files[i].endsWith('.json')) {
          try {
            fs.unlinkSync(path.join(cache_dir, files[i]))
          } catch {
            //Ignore delete errors
          }
        }
      }
    }
  }
}
