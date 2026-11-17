import fs from 'fs'
import { FilepathDefines } from './filepath_defines.ts'
import { cleanCandidateCityString, isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  buildAliasStemSet,
  computeHaversineDistanceKm,
  matchesAliasStemSet,
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
 * @param {number} [arg2_tolerance_deg=2.0]
 *
 * @returns {boolean}
 */
export function isCityInsideStateBBox (
  arg0_city: any,
  arg1_state: any,
  arg2_tolerance_deg: number = 2.0
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
  let effective_tol = span < 1.5 ? Math.min(tol, Math.max(0.5, span*1.5)) : tol
  if (c_lng < minX - effective_tol || c_lng > maxX + effective_tol || c_lat < minY - effective_tol || c_lat > maxY + effective_tol)
    return false

  //Return statement
  return true
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
  let existing_arr: string[] = []
  let merged: string[] = []
  let seen_lower = new Set<string>()

  //Function body
  if (Array.isArray(city.other_names)) {
    existing_arr = city.other_names
  } else if (typeof city.other_names === 'string' && city.other_names.trim()) {
    existing_arr = [city.other_names]
  }

  for (let i = 0; i < existing_arr.length; i++) {
    let clean = String(existing_arr[i] || '').trim()
    let low = clean.toLowerCase()
    if (clean && !seen_lower.has(low)) {
      seen_lower.add(low)
      merged.push(clean)
    }
  }
  for (let i = 0; i < extra_names.length; i++) {
    let clean = String(extra_names[i] || '').trim()
    let low = clean.toLowerCase()
    if (clean && !seen_lower.has(low)) {
      seen_lower.add(low)
      merged.push(clean)
    }
  }

  if (merged.length > 0)
    city.other_names = merged
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
 * Checks whether a candidate displaced label matches another nearby city's primary name within the given radius.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {string} arg1_label
 * @param {Record<string, CityIndexEntry[]>} arg2_spatial_grid
 * @param {Map<string, string>} arg3_raw_city_name_by_key
 * @param {Map<string, AliasStemSet>} arg4_primary_alias_cache
 * @param {number} [arg5_radius_km=25]
 *
 * @returns {boolean}
 */
export function doesLabelMatchAnotherNearbyCity (
  arg0_city: CityIndexEntry,
  arg1_label: string,
  arg2_spatial_grid: Record<string, CityIndexEntry[]>,
  arg3_raw_city_name_by_key: Map<string, string>,
  arg4_primary_alias_cache: Map<string, AliasStemSet>,
  arg5_radius_km: number = 25
): boolean {
  //Convert from parameters
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
  let center_lat = Math.floor(city.coords[0])
  let center_lng = Math.floor(city.coords[1])
  let label_set = buildAliasStemSet(label)
  let self_raw = raw_city_name_by_key.get(city.key) || city.name || ''
  let self_raw_set = buildAliasStemSet(cleanCandidateCityString(self_raw.split(';')[0]))

  //Function body
  if (label_set.aliases.length === 0 && label_set.stems.length === 0)
    return false

  if (matchesAliasStemSet(label_set, self_raw_set))
    return false

  for (let d_lat = -1; d_lat <= 1; d_lat++) {
    for (let d_lng = -1; d_lng <= 1; d_lng++) {
      let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
      if (!cell)
        continue

      for (let i = 0; i < cell.length; i++) {
        let other = cell[i]
        if (!other || other.key === city.key || !other.coords)
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
