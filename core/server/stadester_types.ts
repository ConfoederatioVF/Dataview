import fs from 'fs'
import { FilepathDefines } from './filepath_defines.ts'
import { cleanCandidateCityString, isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  buildAliasStemSet,
  computeHaversineDistanceKm,
  matchesAliasStemSet,
  normalizeCityKey,
  normalizePrimaryCityKey,
  parseYearMonthDay,
  type AliasStemSet,
  type CapitalRecord,
  type CityMetadataEntry,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'

export type { AliasStemSet, CapitalRecord, CityMetadataEntry, HistoricalNameRecord }

let bugged_cities_set: Set<string> | null = null
let bugged_cities_mtime = 0

/**
 * Loads and returns the set of bugged city names from data/stadester/bugged_cities.txt.
 *
 * @returns {Set<string>}
 */
export function getBuggedCitiesSet (): Set<string> {
  let file_path = FilepathDefines.get().filepaths.stadester_bugged_cities

  if (fs.existsSync(file_path)) {
    try {
      let stats = fs.statSync(file_path)
      if (!bugged_cities_set || stats.mtimeMs > bugged_cities_mtime) {
        bugged_cities_mtime = stats.mtimeMs
        let content = fs.readFileSync(file_path, 'utf-8')
        let lines = content.split(/\r?\n/)
        let set = new Set<string>()

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim()
          if (line && !line.startsWith('#')) {
            set.add(line.toLowerCase())
            let norm = line.toLowerCase().replace(/[-~'`^]/g, ' ').replace(/\s+/g, ' ').trim()
            if (norm)
              set.add(norm)
            let strip = line.toLowerCase().replace(/[`'’\-\s]/g, '')
            if (strip)
              set.add(strip)
          }
        }
        bugged_cities_set = set
      }
      return bugged_cities_set!
    } catch (arg0_err) {
      console.warn('[StadesterService] Failed to read bugged_cities.txt:', arg0_err)
      return new Set()
    }
  }
  return new Set()
}


/**
 * Normalises a city key or composite name string to its primary alphanumeric base,
 * stripping secondary conurbations/agglomerations after semicolons or in parentheses.
 *
 * @param {string} arg0_key
 *
 * @returns {string}
 */
export function getPrimaryCityNormKey (arg0_key: string): string {
  //Convert from parameters
  let key = arg0_key

  //Return statement
  return normalizePrimaryCityKey(key)
}


export interface CityIndexEntry {
  area?: Record<string, number>
  capital?: Record<string, number | string | null>
  capital_records?: CapitalRecord[]
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: Record<string, number>
  elevation?: number
  ghsl_name?: string
  historical_names?: HistoricalNameRecord[]
  id: number | string
  is_agglomeration?: boolean
  is_agglomeration_of?: string
  key: string
  max_pop: number
  max_year: number
  metadata_name?: string
  min_year: number
  name: string
  original_names?: string | string[]
  other_names?: string | string[]
  population?: Record<string, number>
  reconciled_name?: string
  region?: string
  sources?: string[]
  type?: string
  years: number[]
}

export interface StadesterQueryOptions {
  active_state_ids?: Set<number>
  bbox?: [number, number, number, number] // [west, south, east, north]
  color_mode?: 'growth' | 'population' | 'region' | 'continent'
  dataset?: string
  day?: number
  max_cities?: number
  min_pop?: number
  month?: number
  preserve_capitals?: boolean
}

export interface CompactCitiesPayload {
  capitals?: number[]
  capital_colors?: (string | null)[]
  capital_names?: (string | null)[]
  capital_state_ids?: (number | null)[]
  coords: number[] // [lat0, lon0, lat1, lon1, ...]
  count: number
  countries: (string | undefined)[]
  growth: number[]
  keys: string[]
  names: string[]
  other_names?: (string[] | null)[]
  pops: number[]
  regions: (string | undefined)[]
}

export interface CityRenderPoint {
  area?: number
  capital_color?: string
  capital_state_id?: number | string
  capital_state_name?: string
  capitalOf?: string
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: number
  growthRate?: number
  historical_names?: HistoricalNameRecord[]
  id: number | string
  is_capital?: boolean
  isCapital?: boolean
  key: string
  metadata_name?: string
  name: string
  other_names?: string | string[]
  population: number
  region?: string
}

/**
 * Checks whether a city coordinate is spatially contained within or proximate to a state's bounding box.
 *
 * @param {any} arg0_city
 * @param {any} arg1_state
 * @param {number} [arg2_tolerance_deg=0.75]
 *
 * @returns {boolean}
 */
export function isCityInsideStateBBox (
  arg0_city: any,
  arg1_state: any,
  arg2_tolerance_deg: number = 0.75
): boolean {
  //Convert from parameters
  let city = arg0_city
  let state = arg1_state
  let tol = arg2_tolerance_deg

  //Guard clauses
  if (!city || !state)
    return false

  if (!state.bbox || !Array.isArray(state.bbox) || state.bbox.length < 4)
    return true

  //Declare local instance variables
  let c_lat: number | null = null
  let c_lng: number | null = null

  //Function body
  if (city.lat !== undefined && city.lon !== undefined) {
    c_lat = Number(city.lat)
    c_lng = Number(city.lon)
  } else if (city.lat !== undefined && city.lng !== undefined) {
    c_lat = Number(city.lat)
    c_lng = Number(city.lng)
  } else if (Array.isArray(city.coords) && city.coords.length >= 2) {
    if (city.key || city.population !== undefined || city.country !== undefined) {
      c_lat = Number(city.coords[0])
      c_lng = Number(city.coords[1])
    } else {
      c_lat = Number(city.coords[1])
      c_lng = Number(city.coords[0])
    }
  }

  if (c_lat === null || c_lng === null || isNaN(c_lat) || isNaN(c_lng))
    return true

  let [minX, minY, maxX, maxY] = state.bbox
  let span = Math.max(Math.abs(maxX - minX), Math.abs(maxY - minY))
  let effective_tol = span < 1.5 ? Math.min(tol, Math.max(0.25, span*0.75)) : tol
  if (c_lng < minX - effective_tol || c_lng > maxX + effective_tol || c_lat < minY - effective_tol || c_lat > maxY + effective_tol)
    return false

  //Return statement
  return true
}


/**
 * Selects the single highest-confidence settlement from candidate matches for a state capital timeline entry,
 * enforcing strict spatial containment and polity-country consistency so distant homonyms are never misallocated.
 *
 * @param {any[]} arg0_candidates
 * @param {any} arg1_state
 * @param {string} [arg2_tl_key]
 * @param {number} [arg3_start_frac]
 * @param {number} [arg4_stop_frac]
 *
 * @returns {any | null}
 */
export function selectBestCapitalCandidateForTimeline (
  arg0_candidates: any[],
  arg1_state: any,
  arg2_tl_key?: string,
  arg3_start_frac?: number,
  arg4_stop_frac?: number
): any | null {
  //Convert from parameters
  let candidates = arg0_candidates
  let start_frac = arg3_start_frac
  let state = arg1_state
  let stop_frac = arg4_stop_frac
  let tl_key = arg2_tl_key || ''

  //Guard clauses
  if (!candidates || candidates.length === 0)
    return null

  //Declare local instance variables
  let best_city: any = null
  let best_score = -Infinity
  let has_bbox = Boolean(state?.bbox && Array.isArray(state.bbox) && state.bbox.length >= 4)
  let mid_lat = has_bbox ? (state.bbox[1] + state.bbox[3])*0.5 : 0
  let mid_lon = has_bbox ? (state.bbox[0] + state.bbox[2])*0.5 : 0
  let norm_tl = tl_key ? normalizeCityKey(tl_key) : ''
  let prim_tl = tl_key ? getPrimaryCityNormKey(tl_key) : ''
  let state_name = (state?.name || '').toLowerCase().trim()
  let tl_parts = tl_key ? tl_key.replace(/^(stadester|ghsl|oxford)-/i, '').split('-') : []
  let tl_country = tl_parts.length > 1 ? tl_parts[tl_parts.length - 1].toLowerCase().trim() : ''
  let umbrella_countries = new Set(['australia', 'canada', 'u.s.', 'united states', 'usa'])

  //Function body
  for (let i = 0; i < candidates.length; i++) {
    let c = candidates[i]
    if (!c)
      continue

    let c_key = String(c.key || '')
    let c_norm = c_key ? normalizeCityKey(c_key) : ''
    let c_prim = c_key ? getPrimaryCityNormKey(c_key) : ''
    let is_exact_key = Boolean(tl_key && c_key === tl_key)
    let is_prim_key = Boolean(
      is_exact_key ||
      (norm_tl && c_norm && norm_tl === c_norm) ||
      (prim_tl && c_prim && prim_tl === c_prim)
    )

    if (state) {
      let bbox_tol = is_prim_key ? 0.75 : 0.25
      if (!isCityInsideStateBBox(c, state, bbox_tol))
        continue
    }

    let c_country = String(c.country || '').toLowerCase().trim()
    let is_country_match = Boolean(
      (tl_country && c_country && c_country === tl_country) ||
      (state_name && c_country && c_country.length >= 3 && state_name.includes(c_country))
    )

    if (!is_prim_key && tl_country && !umbrella_countries.has(tl_country) && c_country && !is_country_match)
      continue

    let score = 0
    if (is_exact_key)
      score += 1000000
    else if (is_prim_key)
      score += 800000

    if (is_country_match)
      score += 500000
    if (state && isCityInsideStateBBox(c, state, 0.05))
      score += 200000
    if (!c_key.toLowerCase().includes('(agglomeration)') && !c.is_ghsl)
      score += 50000
    else if (!c_key.toLowerCase().includes('(agglomeration)'))
      score += 25000

    if (start_frac !== undefined && stop_frac !== undefined && c.min_year !== undefined && c.max_year !== undefined) {
      if (c.max_year >= Math.floor(start_frac) && c.min_year <= Math.ceil(stop_frac))
        score += 25000
    }

    let max_pop = typeof c.max_pop === 'number' ? c.max_pop : 0
    if (max_pop === 0 && c.population && typeof c.population === 'object') {
      let vals = Object.values(c.population) as number[]
      for (let v = 0; v < vals.length; v++) {
        if (typeof vals[v] === 'number' && vals[v] > max_pop)
          max_pop = vals[v]
      }
    }
    score += Math.min(10000, Math.round(Math.log10(Math.max(1, max_pop))*1500))

    if (has_bbox && Array.isArray(c.coords) && c.coords.length >= 2)
      score += Math.round(5000/(1 + Math.hypot(Number(c.coords[0]) - mid_lat, Number(c.coords[1]) - mid_lon)))

    if (score > best_score) {
      best_score = score
      best_city = c
    }
  }

  //Return statement
  return best_city
}


/**
 * Merges capital timelines from a CityMetadataEntry into an indexed CityIndexEntry.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {CityMetadataEntry} arg1_meta
 *
 * @returns {void}
 */
export function mergeCityCapitalRecords (arg0_city: CityIndexEntry, arg1_meta: CityMetadataEntry): void {
  //Convert from parameters
  let city = arg0_city
  let meta = arg1_meta

  //Guard clauses
  if (!meta.capital_records || meta.capital_records.length === 0)
    return

  //Function body
  if (!city.capital) {
    city.capital = meta.capital as any
    city.capital_records = meta.capital_records
    return
  }

  let all_meta_keys: string[]
  let existing_cap: Record<string, string | number | null> = { ...(city.capital || {}) }
  let raw_meta_cap = meta.capital || {}

  all_meta_keys = Object.keys(raw_meta_cap)
  for (let i = 0; i < all_meta_keys.length; i++) {
    let d_key = all_meta_keys[i]
    let incoming_val = raw_meta_cap[d_key]
    if (existing_cap[d_key] === undefined || (incoming_val !== null && incoming_val !== undefined))
      existing_cap[d_key] = incoming_val
  }
  city.capital = existing_cap
  city.capital_records = Object.keys(existing_cap).map((arg0_d) => {
    let p = parseYearMonthDay(arg0_d)
    return {
      date: arg0_d,
      state_id: (existing_cap[arg0_d] !== undefined && existing_cap[arg0_d] !== null) ? Number(existing_cap[arg0_d]) : null,
      year_frac: p.year_frac,
    }
  }).sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)
}


/**
 * Merges incoming city aliases and metadata names into an indexed city's deduplicated `other_names` array.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {string[]} arg1_extra_names
 *
 * @returns {void}
 */
export function mergeCityOtherNames (arg0_city: CityIndexEntry, arg1_extra_names: string[]): void {
  //Convert from parameters
  let city = arg0_city
  let extra_names = arg1_extra_names

  //Declare local instance variables
  let best_by_low = new Map<string, string>()
  let excluded_low = new Set<string>()
  let existing_arr: string[] = []
  let merged: string[] = []
  let order: string[] = []
  let scoreCase = function (arg0_str: string): number {
    let has_upper = /[A-Z\u00C0-\u00DE]/.test(arg0_str)
    let has_lower = /[a-z\u00DF-\u00FF]/.test(arg0_str)
    let has_diacritic = /[\u00C0-\u024F]/.test(arg0_str)
    return (has_upper && has_lower ? 4 : (has_upper ? 1 : 2)) + (has_diacritic ? 1 : 0)
  }

  //Function body
  if (city.name)
    excluded_low.add(String(city.name).trim().toLowerCase())

  if (Array.isArray(city.other_names)) {
    existing_arr = city.other_names
  } else if (typeof city.other_names === 'string' && city.other_names.trim()) {
    existing_arr = [city.other_names]
  }

  let all_inputs = existing_arr.concat(extra_names)
  for (let i = 0; i < all_inputs.length; i++) {
    let clean = String(all_inputs[i] || '').trim()
    let low = clean.toLowerCase()
    if (!clean || excluded_low.has(low))
      continue
    if (!best_by_low.has(low)) {
      best_by_low.set(low, clean)
      order.push(low)
    } else if (scoreCase(clean) > scoreCase(best_by_low.get(low)!)) {
      best_by_low.set(low, clean)
    }
  }

  for (let i = 0; i < order.length; i++)
    merged.push(best_by_low.get(order[i])!)

  if (merged.length > 0)
    city.other_names = merged
  else
    delete city.other_names
}


/**
 * Builds normalised alias and stem arrays solely from a city's primary name, pre-metadata name, and primary key stem.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {string} [arg1_raw_name]
 *
 * @returns {AliasStemSet}
 */
export function buildPrimaryCityNameSet (arg0_city: CityIndexEntry, arg1_raw_name?: string): AliasStemSet {
  //Convert from parameters
  let city = arg0_city
  let raw_name = arg1_raw_name

  //Declare local instance variables
  let candidates: string[] = []

  //Function body
  if (city.name) {
    let primary_clean = cleanCandidateCityString(String(city.name).split(';')[0])
    if (primary_clean)
      candidates.push(primary_clean)
  }
  if (raw_name) {
    let raw_clean = cleanCandidateCityString(String(raw_name).split(';')[0])
    if (raw_clean)
      candidates.push(raw_clean)
  }
  if (city.key) {
    let stripped = String(city.key).replace(/^(stadester|ghsl|oxford)-/i, '')
    let parts = stripped.split('-')
    let city_part = parts.length > 1 ? parts.slice(0, parts.length - 1).join('-') : stripped
    let key_primary = city_part.split(';')[0].replace(/\s*\([^)]*\)/g, '').trim()
    if (key_primary && !/^\d+$/.test(key_primary))
      candidates.push(key_primary)
  }

  //Return statement
  return buildAliasStemSet(undefined, candidates)
}


/**
 * Packs a signed integer `(lat_bin, lng_bin)` spatial grid coordinate into a single collision-free number key.
 *
 * @param {number} arg0_lat_bin
 * @param {number} arg1_lng_bin
 *
 * @returns {number}
 */
export function packSpatialGridKey (arg0_lat_bin: number, arg1_lng_bin: number): number {
  //Convert from parameters
  let lat_bin = arg0_lat_bin
  let lng_bin = arg1_lng_bin

  //Return statement
  return (lat_bin + 4096)*8192 + (lng_bin + 4096)
}


/**
 * Checks whether a candidate displaced label matches another nearby city's primary name within the given radius.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {string} arg1_label
 * @param {Record<string, CityIndexEntry[]> | Map<number, CityIndexEntry[]>} arg2_spatial_grid
 * @param {Map<string, string>} arg3_raw_city_name_by_key
 * @param {Map<string, AliasStemSet>} arg4_primary_alias_cache
 * @param {number} [arg5_radius_km=25]
 * @param {number} [arg6_cells_per_degree=1]
 *
 * @returns {boolean}
 */
export function doesLabelMatchAnotherNearbyCity (
  arg0_city: CityIndexEntry,
  arg1_label: string,
  arg2_spatial_grid: Record<string, CityIndexEntry[]> | Map<number, CityIndexEntry[]>,
  arg3_raw_city_name_by_key: Map<string, string>,
  arg4_primary_alias_cache: Map<string, AliasStemSet>,
  arg5_radius_km: number = 25,
  arg6_cells_per_degree: number = 1
): boolean {
  //Convert from parameters
  let cells_per_degree = arg6_cells_per_degree
  let city = arg0_city
  let label = arg1_label
  let primary_alias_cache = arg4_primary_alias_cache
  let radius_km = arg5_radius_km
  let raw_city_name_by_key = arg3_raw_city_name_by_key
  let spatial_grid = arg2_spatial_grid

  //Guard clauses
  if (!city || !city.coords || !label || isCorruptedCityName(label))
    return false

  //Declare local instance variables
  let cell_radius = Math.max(1, Math.ceil((radius_km/111.0)*cells_per_degree*1.5))
  let center_lat = Math.floor(city.coords[0]*cells_per_degree)
  let center_lng = Math.floor(city.coords[1]*cells_per_degree)
  let deg_lat_bound = radius_km/111.0 + 0.02
  let deg_lon_bound = radius_km/(111.0*Math.max(0.2, Math.cos((city.coords[0]*Math.PI)/180))) + 0.02
  let is_map_grid = spatial_grid instanceof Map
  let label_set = buildAliasStemSet(label)
  let self_raw = raw_city_name_by_key.get(city.key) || city.name || ''
  let self_raw_set = buildAliasStemSet(cleanCandidateCityString(self_raw.split(';')[0]))

  //Function body
  if (label_set.aliases.length === 0 && label_set.stems.length === 0)
    return false

  if (matchesAliasStemSet(label_set, self_raw_set))
    return false

  for (let d_lat = -cell_radius; d_lat <= cell_radius; d_lat++) {
    for (let d_lng = -cell_radius; d_lng <= cell_radius; d_lng++) {
      let cell = is_map_grid
        ? (spatial_grid as Map<number, CityIndexEntry[]>).get(packSpatialGridKey(center_lat + d_lat, center_lng + d_lng))
        : (spatial_grid as Record<string, CityIndexEntry[]>)[`${center_lat + d_lat},${center_lng + d_lng}`]
      if (!cell)
        continue

      for (let i = 0; i < cell.length; i++) {
        let other = cell[i]
        if (!other || other.key === city.key || !other.coords)
          continue
        if (Math.abs(other.coords[0] - city.coords[0]) > deg_lat_bound || Math.abs(other.coords[1] - city.coords[1]) > deg_lon_bound)
          continue

        let dist = computeHaversineDistanceKm(other.coords[0], other.coords[1], city.coords[0], city.coords[1])
        if (dist > radius_km)
          continue

        let other_primary = primary_alias_cache.get(other.key)
        if (!other_primary) {
          other_primary = buildPrimaryCityNameSet(other, raw_city_name_by_key.get(other.key))
          primary_alias_cache.set(other.key, other_primary)
        }
        if (matchesAliasStemSet(label_set, other_primary))
          return true
      }
    }
  }

  //Return statement
  return false
}
