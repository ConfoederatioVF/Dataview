import fs from 'fs'
import path from 'path'
import { AtlasBordersService } from './AtlasBordersService.ts'
import { indexHistoricalCities, loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { getPrimaryCityName, isCorruptedCityName, isBuggedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  getCityActiveCapitalRecord,
  isCityCapitalAtYear,
  normalizeCityAlias,
  normalizeCityKey,
  normalizeMetadataEntry,
  parseYearMonthDay,
  resolveHistoricalCityName,
  type CapitalRecord,
  type CityMetadataEntry,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'

let bugged_cities_set: Set<string> | null = null
let bugged_cities_mtime = 0

/**
 * Loads and returns the set of bugged city names from data/stadester/bugged_cities.txt.
 *
 * @returns {Set<string>}
 */
export function getBuggedCitiesSet (): Set<string> {
  let file_path = path.resolve(process.cwd(), 'data/stadester/bugged_cities.txt')

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

  //Guard clauses
  if (!key)
    return ''

  //Declare local instance variables
  let city_part: string
  let country: string
  let full: string
  let parts: string[]
  let primary_city: string

  //Function body
  parts = key.replace(/^(stadester|ghsl|oxford)-/i, '').split('-')
  country = parts.length > 1 ? parts[parts.length - 1] : ''
  city_part = parts.slice(0, parts.length - 1).join('-')
  primary_city = city_part.split(';')[0].replace(/\(.*?\)/g, '').trim()
  full = (primary_city + (country ? '-' + country : '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

  //Return statement
  return full
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
  historical_names?: HistoricalNameRecord[]
  id: number | string
  key: string
  max_pop: number
  max_year: number
  metadata_name?: string
  min_year: number
  name: string
  original_names?: string | string[]
  other_names?: string | string[]
  population?: Record<string, number>
  region?: string
  years: number[]
}

export interface StadesterQueryOptions {
  active_state_ids?: Set<number>
  bbox?: [number, number, number, number] // [west, south, east, north]
  color_mode?: 'growth' | 'population' | 'region' | 'continent'
  day?: number
  max_cities?: number
  min_pop?: number
  month?: number
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
      // Indexed Stadester city: [lat, lon]
      c_lat = Number(city.coords[0])
      c_lng = Number(city.coords[1])
    } else {
      // Metadata entry: [lng, lat]
      c_lat = Number(city.coords[1])
      c_lng = Number(city.coords[0])
    }
  }

  if (c_lat === null || c_lng === null || isNaN(c_lat) || isNaN(c_lng))
    return true

  let [minX, minY, maxX, maxY] = state.bbox
  if (c_lng < minX - tol || c_lng > maxX + tol || c_lat < minY - tol || c_lat > maxY + tol)
    return false

  //Return statement
  return true
}

export let StadesterService = {
  city_metadata: null as CityMetadataEntry[] | null,
  city_metadata_mtime: 0,
  datasets: new Map<string, Record<string, CityIndexEntry>>(),
  lite_cache_paths: new Map<string, string>(),
  state_capitals_mtime: 0,
  states_by_id: null as Map<string | number, any> | null,

  /**
   * Retrieves state metadata by state ID from the cached data/atlas/temp/states.json registry.
   *
   * @param {string | number} arg0_state_id
   *
   * @returns {any | null}
   */
  getStateById: function (arg0_state_id: string | number): any {
    //Convert from parameters
    let state_id = arg0_state_id

    //Guard clauses
    if (state_id === undefined || state_id === null)
      return null

    //Function body
    if (!StadesterService.states_by_id) {
      StadesterService.states_by_id = new Map()
      let states_path = path.resolve(process.cwd(), 'data/atlas/temp/states.json')
      if (fs.existsSync(states_path)) {
        try {
          let list = JSON.parse(fs.readFileSync(states_path, 'utf-8'))
          if (Array.isArray(list)) {
            for (let i = 0; i < list.length; i++) {
              let s = list[i]
              if (s.start_date) {
                s._start_frac = parseYearMonthDay(s.start_date).year_frac
              } else {
                s._start_frac = s.start_year !== undefined ? s.start_year : -99999
              }
              if (s.stop_date) {
                s._stop_frac = parseYearMonthDay(s.stop_date).year_frac
              } else {
                s._stop_frac = s.stop_year !== undefined ? s.stop_year : 99999
              }
              StadesterService.states_by_id.set(s.state_id, s)
              StadesterService.states_by_id.set(String(s.state_id), s)
            }
          }
        } catch (arg0_err) {
          console.warn('[StadesterService] Failed to load states.json:', arg0_err)
        }
      }
    }

    //Return statement
    return StadesterService.states_by_id.get(state_id) || StadesterService.states_by_id.get(String(state_id)) || null
  },

  /**
   * Evaluates whether a city was a capital at target historical year, validating state existence.
   *
   * @param {any} arg0_city
   * @param {number | string} [arg1_year]
   * @param {Set<number>} [arg2_active_state_ids]
   *
   * @returns {boolean}
   */
  isCityCapitalAtYear: function (
    arg0_city: any,
    arg1_year?: number | string,
    arg2_active_state_ids?: Set<number>
  ): boolean {
    //Convert from parameters
    let active_state_ids = arg2_active_state_ids
    let city = arg0_city
    let year = arg1_year

    //Guard clauses
    if (!city)
      return false

    //Declare local instance variables
    if (!active_state_ids && (year !== undefined && year !== null)) {
      let num_yr = typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year
      let num_mo = typeof year === 'string' ? parseYearMonthDay(year).month : undefined
      let num_day = typeof year === 'string' ? parseYearMonthDay(year).day : undefined
      active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)
    }

    //Return statement
    return isCityCapitalAtYear(city, year, (arg0_sid, arg0_y_frac) => {
      let sid_num = Number(arg0_sid)
      let state = StadesterService.getStateById(arg0_sid)
      if (!state)
        return false
      let start_bound = state._start_frac !== undefined ? state._start_frac : (state.start_year !== undefined ? state.start_year : -99999)
      let stop_bound = state._stop_frac !== undefined ? state._stop_frac : (state.stop_year !== undefined ? state.stop_year : 99999)
      let is_time_valid = (arg0_y_frac >= start_bound && arg0_y_frac <= stop_bound) ||
        (Math.floor(arg0_y_frac) >= (state.start_year ?? -99999) && Math.floor(arg0_y_frac) <= (state.stop_year ?? 99999))
      if (!is_time_valid)
        return false
      if (active_state_ids && active_state_ids.size > 0) {
        if (!active_state_ids.has(sid_num) && !state.is_contemporary && !(state.stop_year >= 2020 && arg0_y_frac >= 1975))
          return false
      }
      if (!isCityInsideStateBBox(city, state, 3.5))
        return false
      return true
    })
  },

  /**
   * Resolves the fill colour of the corresponding state for a capital city.
   *
   * @param {any} arg0_city
   * @param {number | string} [arg1_year]
   * @param {Set<number>} [arg2_active_state_ids]
   *
   * @returns {string | null} Hex fill colour or null
   */
  getCityCapitalColorAtYear: function (
    arg0_city: any,
    arg1_year?: number | string,
    arg2_active_state_ids?: Set<number>
  ): string | null {
    //Convert from parameters
    let active_state_ids = arg2_active_state_ids
    let city = arg0_city
    let year = arg1_year

    //Guard clauses
    if (!city)
      return null

    //Declare local instance variables
    if (!active_state_ids && (year !== undefined && year !== null)) {
      let num_yr = typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year
      let num_mo = typeof year === 'string' ? parseYearMonthDay(year).month : undefined
      let num_day = typeof year === 'string' ? parseYearMonthDay(year).day : undefined
      active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)
    }

    let cap_rec = getCityActiveCapitalRecord(city, year, (arg0_sid, arg0_y_frac) => {
      let sid_num = Number(arg0_sid)
      let state = StadesterService.getStateById(arg0_sid)
      if (!state)
        return false
      let start_bound = state._start_frac !== undefined ? state._start_frac : (state.start_year !== undefined ? state.start_year : -99999)
      let stop_bound = state._stop_frac !== undefined ? state._stop_frac : (state.stop_year !== undefined ? state.stop_year : 99999)
      let is_time_valid = (arg0_y_frac >= start_bound && arg0_y_frac <= stop_bound) ||
        (Math.floor(arg0_y_frac) >= (state.start_year ?? -99999) && Math.floor(arg0_y_frac) <= (state.stop_year ?? 99999))
      if (!is_time_valid)
        return false
      if (active_state_ids && active_state_ids.size > 0) {
        if (!active_state_ids.has(sid_num) && !state.is_contemporary && !(state.stop_year >= 2020 && arg0_y_frac >= 1975))
          return false
      }
      if (!isCityInsideStateBBox(city, state, 3.5))
        return false
      return true
    })

    if (!cap_rec || !cap_rec.state_id)
      return null

    let state = StadesterService.getStateById(cap_rec.state_id)

    //Return statement
    return state?.fill_color || null
  },

  /**
   * Applies metadata from data/stadester/city_metadata.json to indexed cities.
   * Finds the nearest Stadestér city to each specified [lng, lat] point and inherits metadata.
   * Also binds to agglomeration counterparts within 25 km sharing the city name.
   *
   * @param {Record<string, CityIndexEntry>} arg0_indexed_record
   */
  applyCityMetadata: function (arg0_indexed_record: Record<string, CityIndexEntry>): void {
    //Convert from parameters
    let indexed = arg0_indexed_record

    //Declare local instance variables
    let all_keys = Object.keys(indexed)
    let meta_list = StadesterService.loadCityMetadata()
    let spatial_grid: Record<string, CityIndexEntry[]> = {}

    //Guard clauses
    if (!meta_list || meta_list.length === 0 || all_keys.length === 0)
      return

    //Function body
    //1. Construct spatial grid with 1-degree bins (~111km) for fast local lookup
    for (let x = 0; x < all_keys.length; x++) {
      let city = indexed[all_keys[x]]
      if (city.coords && Array.isArray(city.coords)) {
        let bin_lat = Math.floor(city.coords[0])
        let bin_lng = Math.floor(city.coords[1])
        let bin_key = `${bin_lat},${bin_lng}`
        if (!spatial_grid[bin_key])
          spatial_grid[bin_key] = []
        spatial_grid[bin_key].push(city)
      }
    }

    //2. Bind metadata to matching cities and counterparts
    for (let i = 0; i < meta_list.length; i++) {
      let best_city: CityIndexEntry | null = null
      let meta = meta_list[i]
      let min_dist = 999999
      let target_lat = meta.coords[1]
      let target_lng = meta.coords[0]

      //A. Check direct key match if specified
      if (meta.key && indexed[meta.key]) {
        best_city = indexed[meta.key]
        min_dist = 0
      }

      //B. Fast spatial grid search in 3x3 surrounding cells
      if (!best_city) {
        let center_lat = Math.floor(target_lat)
        let center_lng = Math.floor(target_lng)

        for (let d_lat = -1; d_lat <= 1; d_lat++) {
          for (let d_lng = -1; d_lng <= 1; d_lng++) {
            let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
            if (cell) {
              for (let c = 0; c < cell.length; c++) {
                let candidate = cell[c]
                let dist = computeHaversineDistanceKm(candidate.coords[0], candidate.coords[1], target_lat, target_lng)
                if (dist < min_dist) {
                  min_dist = dist
                  best_city = candidate
                }
              }
            }
          }
        }
      }

      //C. Inherit metadata if nearest city is within 50 km threshold
      if (best_city && min_dist <= 50) {
        let is_exact_coord_match = min_dist <= 0.1
        let local_best_name = normalizeCityAlias(best_city.name || '')
        let local_meta_name = normalizeCityAlias(meta.name || '')

        let best_aliases = [
          local_best_name,
          ...(Array.isArray(best_city.other_names) ? best_city.other_names.map(normalizeCityAlias) : (typeof best_city.other_names === 'string' ? [normalizeCityAlias(best_city.other_names)] : [])),
        ].filter(Boolean)

        let meta_aliases = [
          local_meta_name,
          ...(Array.isArray((meta as any).other_names) ? (meta as any).other_names.map(normalizeCityAlias) : (typeof (meta as any).other_names === 'string' ? [normalizeCityAlias((meta as any).other_names)] : [])),
        ].filter(Boolean)

        let is_name_match = meta_aliases.some((ma) => best_aliases.includes(ma))

        if (!is_exact_coord_match && !is_name_match)
          continue

        if (is_exact_coord_match && meta.name)
          best_city.name = meta.name

        if (meta.historical_names && meta.historical_names.length > 0)
          best_city.historical_names = StadesterService.mergeHistoricalNames(best_city.historical_names, meta.historical_names)

        if (meta.capital_records && meta.capital_records.length > 0) {
          if (!best_city.capital) {
            best_city.capital = meta.capital as any
            best_city.capital_records = meta.capital_records
          } else {
            let existing_cap: Record<string, string | number | null> = { ...(best_city.capital || {}) }
            let raw_meta_cap = meta.capital || {}
            let all_meta_keys = Object.keys(raw_meta_cap)
            for (let m = 0; m < all_meta_keys.length; m++) {
              let d_key = all_meta_keys[m]
              let incoming_val = raw_meta_cap[d_key]
              if (existing_cap[d_key] === undefined || (incoming_val !== null && incoming_val !== undefined)) {
                existing_cap[d_key] = incoming_val
              }
            }
            best_city.capital = existing_cap
            best_city.capital_records = Object.keys(existing_cap).map((arg0_d) => {
              let p = parseYearMonthDay(arg0_d)
              return {
                date: arg0_d,
                state_id: (existing_cap[arg0_d] !== undefined && existing_cap[arg0_d] !== null) ? Number(existing_cap[arg0_d]) : null,
                year_frac: p.year_frac,
              }
            }).sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)
          }
        }

        //Also associate related agglomeration or pre/post-1975 counterpart cities in local grid cells
        let center_lat = Math.floor(target_lat)
        let center_lng = Math.floor(target_lng)

        for (let d_lat = -1; d_lat <= 1; d_lat++) {
          for (let d_lng = -1; d_lng <= 1; d_lng++) {
            let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
            if (cell) {
              for (let c = 0; c < cell.length; c++) {
                let other = cell[c]
                if (other.key === best_city.key)
                  continue

                let dist = computeHaversineDistanceKm(other.coords[0], other.coords[1], target_lat, target_lng)
                if (dist <= 25) {
                  let is_era_counterpart =
                    (best_city.key.startsWith('stadester-') && other.key.startsWith('ghsl-')) ||
                    (best_city.key.startsWith('ghsl-') && other.key.startsWith('stadester-'))

                  let is_agg_counterpart = Boolean(
                    (other.is_agglomeration && (other.is_agglomeration_of === local_best_name || other.is_agglomeration_of === local_meta_name))
                  )

                  if (!is_era_counterpart && !is_agg_counterpart)
                    continue

                  let other_aliases = [
                    normalizeCityAlias(other.name || ''),
                    ...(Array.isArray(other.other_names) ? other.other_names.map(normalizeCityAlias) : (typeof other.other_names === 'string' ? [normalizeCityAlias(other.other_names)] : [])),
                  ].filter(Boolean)

                  let is_counterpart_name_match = is_agg_counterpart || meta_aliases.some((ma) => other_aliases.includes(ma))
                  if (is_counterpart_name_match) {
                    if (meta.historical_names && meta.historical_names.length > 0)
                      other.historical_names = StadesterService.mergeHistoricalNames(other.historical_names, meta.historical_names)
                    if (meta.capital_records && meta.capital_records.length > 0) {
                      if (!other.capital) {
                        other.capital = meta.capital as any
                        other.capital_records = meta.capital_records
                      } else {
                        let existing_other_cap: Record<string, string | number | null> = { ...(other.capital || {}) }
                        let raw_meta_cap = meta.capital || {}
                        let all_m_keys = Object.keys(raw_meta_cap)
                        for (let m = 0; m < all_m_keys.length; m++) {
                          let d_key = all_m_keys[m]
                          let incoming_val = raw_meta_cap[d_key]
                          if (existing_other_cap[d_key] === undefined || (incoming_val !== null && incoming_val !== undefined)) {
                            existing_other_cap[d_key] = incoming_val
                          }
                        }
                        other.capital = existing_other_cap
                        other.capital_records = Object.keys(existing_other_cap).map((arg0_d) => {
                          let p = parseYearMonthDay(arg0_d)
                          return {
                            date: arg0_d,
                            state_id: (existing_other_cap[arg0_d] !== undefined && existing_other_cap[arg0_d] !== null) ? Number(existing_other_cap[arg0_d]) : null,
                            year_frac: p.year_frac,
                          }
                        }).sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`[StadesterService] Successfully bound ${meta_list.length} historical city metadata entries.`)
  },

  /**
   * Binds authoritative state capital timelines from data/stadester/state_capitals.json directly to indexed cities.
   *
   * @param {Record<string, CityIndexEntry>} arg0_indexed_record
   */
  applyStateCapitals: function (arg0_indexed_record: Record<string, CityIndexEntry>): void {
    //Convert from parameters
    let indexed = arg0_indexed_record

    //Declare local instance variables
    let all_city_intervals: Array<[CityIndexEntry, Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }> ]>
    let all_keys: string[]
    let all_state_ids: string[]
    let city_intervals = new Map<CityIndexEntry, Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }>>()
    let file_path = path.resolve(process.cwd(), 'data/stadester/state_capitals.json')
    let name_country_to_city = new Map<string, CityIndexEntry[]>()
    let norm_key_to_cities = new Map<string, CityIndexEntry[]>()
    let state_capitals: Record<string, { acapital: boolean; timeline?: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }> }>
    let updated_count = 0

    //Guard clauses
    if (!fs.existsSync(file_path))
      return

    //Function body
    try {
      let stats = fs.statSync(file_path)
      StadesterService.state_capitals_mtime = stats.mtimeMs
      state_capitals = JSON.parse(fs.readFileSync(file_path, 'utf-8'))
    } catch (arg0_err) {
      console.warn('[StadesterService] Failed to load state_capitals.json:', arg0_err)
      return
    }

    all_keys = Object.keys(indexed)

    norm_key_to_cities = new Map()
    for (let i = 0; i < all_keys.length; i++) {
      let city = indexed[all_keys[i]]
      let n_k = normalizeCityKey(all_keys[i])
      if (!norm_key_to_cities.has(n_k))
        norm_key_to_cities.set(n_k, [])
      norm_key_to_cities.get(n_k)!.push(city)

      let primary_nk = getPrimaryCityNormKey(all_keys[i])
      if (primary_nk && primary_nk !== n_k) {
        if (!norm_key_to_cities.has(primary_nk))
          norm_key_to_cities.set(primary_nk, [])
        norm_key_to_cities.get(primary_nk)!.push(city)
      }

      let nc_key = `${(city.name || '').toLowerCase().trim()}|${(city.country || '').toLowerCase().trim()}`
      if (!name_country_to_city.has(nc_key)) {
        name_country_to_city.set(nc_key, [])
      }
      name_country_to_city.get(nc_key)!.push(city)
    }

    //1. Ingest existing city capital records as baseline intervals
    for (let x = 0; x < all_keys.length; x++) {
      let city = indexed[all_keys[x]]
      if (city.capital_records && city.capital_records.length > 0) {
        let ivs: Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }> = []
        for (let y = 0; y < city.capital_records.length; y++) {
          let rec = city.capital_records[y]
          if (rec.state_id !== null && rec.state_id !== undefined) {
            let next_rec = (y + 1 < city.capital_records.length) ? city.capital_records[y + 1] : null
            let stop_date = next_rec ? next_rec.date : '2026.1.1'
            let stop_frac = next_rec ? next_rec.year_frac : 2026
            ivs.push({
              is_authoritative: false,
              start_date: rec.date,
              start_frac: rec.year_frac,
              state_id: Number(rec.state_id),
              stop_date: stop_date,
              stop_frac: stop_frac,
            })
          }
        }
        if (ivs.length > 0) {
          city_intervals.set(city, ivs)
        }
      }
    }

    //2. Ingest authoritative state_capitals.json intervals
    all_state_ids = Object.keys(state_capitals)
    for (let z = 0; z < all_state_ids.length; z++) {
      let state_id = all_state_ids[z]
      let sc_entry = state_capitals[state_id]
      if (!sc_entry || sc_entry.acapital || !sc_entry.timeline || sc_entry.timeline.length === 0)
        continue

      let s_id_num = Number(state_id)

      for (let a = 0; a < sc_entry.timeline.length; a++) {
        let tl_item = sc_entry.timeline[a]
        if (!tl_item.start)
          continue

        let target_cities: CityIndexEntry[] = []

        if (tl_item.key && indexed[tl_item.key])
          target_cities.push(indexed[tl_item.key])

        if (tl_item.key) {
          let n_k = normalizeCityKey(tl_item.key)
          let matches = norm_key_to_cities.get(n_k)
          if (matches) {
            for (let m = 0; m < matches.length; m++) {
              if (!target_cities.includes(matches[m]))
                target_cities.push(matches[m])
            }
          }
          let primary_nk = getPrimaryCityNormKey(tl_item.key)
          if (primary_nk) {
            let primary_matches = norm_key_to_cities.get(primary_nk)
            if (primary_matches) {
              for (let m = 0; m < primary_matches.length; m++) {
                if (!target_cities.includes(primary_matches[m]))
                  target_cities.push(primary_matches[m])
              }
            }
          }
        }

        if (target_cities.length === 0 && tl_item.city) {
          let clean_c = tl_item.city.toLowerCase().trim()
          for (let [nc, city_list] of name_country_to_city) {
            if (nc.startsWith(`${clean_c}|`)) {
              for (let m = 0; m < city_list.length; m++) {
                if (!target_cities.includes(city_list[m]))
                  target_cities.push(city_list[m])
              }
              break
            }
          }
        }

        for (let tc = 0; tc < target_cities.length; tc++) {
          let target_city = target_cities[tc]
          let state = StadesterService.getStateById(s_id_num)
          if (state && !isCityInsideStateBBox(target_city, state, 3.5))
            continue

          if (!city_intervals.has(target_city)) {
            city_intervals.set(target_city, [])
          }
          let s_p = parseYearMonthDay(tl_item.start)
          let e_p = tl_item.stop ? parseYearMonthDay(tl_item.stop) : { date: '2026.1.1', year_frac: 2026 }
          city_intervals.get(target_city)!.push({
            is_authoritative: true,
            start_date: tl_item.start.trim(),
            start_frac: tl_item.start_frac !== undefined ? tl_item.start_frac : s_p.year_frac,
            state_id: s_id_num,
            stop_date: tl_item.stop ? tl_item.stop.trim() : '2026.1.1',
            stop_frac: tl_item.stop_frac !== undefined ? tl_item.stop_frac : e_p.year_frac,
          })
        }
      }
    }

    //3. Resolve discrete capital dictionary and records for each city
    all_city_intervals = Array.from(city_intervals.entries())
    for (let b = 0; b < all_city_intervals.length; b++) {
      let city = all_city_intervals[b][0]
      let intervals = all_city_intervals[b][1]
      let pts: Array<{ date: string; year_frac: number }> = []
      let seen_fracs = new Set<number>()

      for (let c = 0; c < intervals.length; c++) {
        let iv = intervals[c]
        if (!seen_fracs.has(iv.start_frac)) {
          seen_fracs.add(iv.start_frac)
          pts.push({ date: iv.start_date, year_frac: iv.start_frac })
        }
        if (!seen_fracs.has(iv.stop_frac)) {
          seen_fracs.add(iv.stop_frac)
          pts.push({ date: iv.stop_date, year_frac: iv.stop_frac })
        }
      }

      pts.sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)

      let cap_dict: Record<string, number | null> = {}
      let prev_sid: number | null | undefined = undefined

      for (let c = 0; c < pts.length; c++) {
        let p = pts[c]
        let sample_frac = p.year_frac >= 2026 ? 2026 : p.year_frac + 0.0001
        let matching_ivs = intervals.filter((arg0_iv) => sample_frac >= arg0_iv.start_frac && (sample_frac <= arg0_iv.stop_frac || (arg0_iv.stop_frac >= 2026 && p.year_frac >= 2026)))
        let active_iv: { is_authoritative?: boolean; start_frac?: number; state_id: number; stop_frac?: number } | null = null

        if (matching_ivs.length > 0) {
          let auth_ivs = matching_ivs.filter((arg0_iv) => arg0_iv.is_authoritative)
          let candidates = auth_ivs.length > 0 ? auth_ivs : matching_ivs

          candidates.sort((arg0_a, arg0_b) => {
            let state_a = StadesterService.getStateById(arg0_a.state_id)
            let state_b = StadesterService.getStateById(arg0_b.state_id)
            let inside_a = state_a ? (isCityInsideStateBBox(city, state_a, 3.5) ? 1 : 0) : 1
            let inside_b = state_b ? (isCityInsideStateBBox(city, state_b, 3.5) ? 1 : 0) : 1
            if (inside_a !== inside_b)
              return inside_b - inside_a

            let dur_a = (arg0_a.stop_frac !== undefined && arg0_a.start_frac !== undefined) ? (arg0_a.stop_frac - arg0_a.start_frac) : 99999
            let dur_b = (arg0_b.stop_frac !== undefined && arg0_b.start_frac !== undefined) ? (arg0_b.stop_frac - arg0_b.start_frac) : 99999
            return dur_a - dur_b
          })
          active_iv = candidates[0]
        }

        let sid = active_iv ? active_iv.state_id : null
        if (sid !== prev_sid) {
          cap_dict[p.date] = sid
          prev_sid = sid
        }
      }

      city.capital = cap_dict as any
      city.capital_records = Object.keys(cap_dict).map((arg0_dk) => {
        let parsed = parseYearMonthDay(arg0_dk)
        return {
          date: arg0_dk,
          state_id: cap_dict[arg0_dk],
          year_frac: parsed.year_frac,
        }
      }).sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)
      updated_count++
    }

    console.log(`[StadesterService] Successfully bound authoritative state capitals to ${updated_count} cities.`)
  },

  /**
   * Loads and normalises city metadata from data/stadester/city_metadata.json into memory.
   *
   * @returns {CityMetadataEntry[]}
   */
  loadCityMetadata: function (): CityMetadataEntry[] {
    //Declare local instance variables
    let file_path = path.resolve(process.cwd(), 'data/stadester/city_metadata.json')
    let normalized_list: CityMetadataEntry[] = []

    //Guard clauses
    if (!fs.existsSync(file_path))
      return []

    try {
      let stats = fs.statSync(file_path)
      if (StadesterService.city_metadata && stats.mtimeMs <= StadesterService.city_metadata_mtime)
        return StadesterService.city_metadata

      //Function body
      let content = fs.readFileSync(file_path, 'utf-8')
      let raw_json = JSON.parse(content)

      if (Array.isArray(raw_json)) {
        for (let i = 0; i < raw_json.length; i++) {
          let item = normalizeMetadataEntry(raw_json[i])
          if (item)
            normalized_list.push(item)
        }
      } else if (raw_json && typeof raw_json === 'object') {
        let keys = Object.keys(raw_json)
        for (let i = 0; i < keys.length; i++) {
          let item = normalizeMetadataEntry(raw_json[keys[i]], keys[i])
          if (item)
            normalized_list.push(item)
        }
      }

      StadesterService.city_metadata = normalized_list
      StadesterService.city_metadata_mtime = stats.mtimeMs
      console.log(`[StadesterService] Loaded ${normalized_list.length} city metadata entries from ${file_path}`)
      return normalized_list
    } catch (arg0_err) {
      console.warn('[StadesterService] Failed to load city_metadata.json:', arg0_err)
      return StadesterService.city_metadata || []
    }
  },

  /**
   * Merges two historical name records chronologically, preserving rich multi-entry timelines.
   * Ensures that modern placeholder entries (e.g. single 1975 entries) never overwrite earlier historical names.
   *
   * @param {HistoricalNameRecord[]} [arg0_existing]
   * @param {HistoricalNameRecord[]} [arg1_incoming]
   *
   * @returns {HistoricalNameRecord[]}
   */
  mergeHistoricalNames: function (
    arg0_existing?: HistoricalNameRecord[],
    arg1_incoming?: HistoricalNameRecord[]
  ): HistoricalNameRecord[] {
    //Convert from parameters
    let existing = arg0_existing
    let incoming = arg1_incoming

    //Guard clauses
    if (!incoming || incoming.length === 0)
      return existing || []
    if (!existing || existing.length === 0)
      return incoming

    //Declare local instance variables
    let all_records: HistoricalNameRecord[]
    let existing_min_year = 9999
    let incoming_min_year = 9999
    let merged_timeline: HistoricalNameRecord[] = []

    //Function body
    for (let i = 0; i < existing.length; i++) {
      let y = (existing[i].year_frac !== undefined && existing[i].year_frac !== null)
        ? existing[i].year_frac
        : parseYearMonthDay(existing[i].date).year_frac
      if (y < existing_min_year)
        existing_min_year = y
    }
    for (let i = 0; i < incoming.length; i++) {
      let y = (incoming[i].year_frac !== undefined && incoming[i].year_frac !== null)
        ? incoming[i].year_frac
        : parseYearMonthDay(incoming[i].date).year_frac
      if (y < incoming_min_year)
        incoming_min_year = y
    }

    if (existing.length > 1 && incoming.length === 1 && incoming_min_year >= 1900 && existing_min_year < 1900)
      return existing

    if (incoming.length > 1 && existing.length === 1 && existing_min_year >= 1900 && incoming_min_year < 1900)
      return incoming

    all_records = [...existing, ...incoming]
    for (let i = 0; i < all_records.length; i++) {
      if (all_records[i].year_frac === undefined || all_records[i].year_frac === null)
        all_records[i].year_frac = parseYearMonthDay(all_records[i].date).year_frac
    }
    all_records.sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)

    for (let x = 0; x < all_records.length; x++) {
      let rec = all_records[x]
      let last = merged_timeline[merged_timeline.length - 1]

      if (last) {
        if (Math.abs(rec.year_frac - last.year_frac) < 0.05) {
          if (rec.date.length > last.date.length)
            merged_timeline[merged_timeline.length - 1] = rec
          continue
        }
        if (last.name.toLowerCase().trim() === rec.name.toLowerCase().trim())
          continue
      }

      merged_timeline.push(rec)
    }

    //Return statement
    return merged_timeline
  },

  /**
   * Resolves a city's historical name at the specified year or date.
   *
   * @param {CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[] }} arg0_city
   * @param {number | string} [arg1_year]
   *
   * @returns {string}
   */
  resolveCityNameAtYear: function (
    arg0_city: CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[] },
    arg1_year?: number | string
  ): string {
    //Convert from parameters
    let city = arg0_city
    let year = arg1_year

    //Guard clauses
    if (!city)
      return ''

    //Return statement
    return resolveHistoricalCityName(city, year)
  },

  /**
   * Resolves the absolute path to a Stadestér JSON dataset file.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   *
   * @returns {string}
   */
  getDatasetFilePath: function (arg0_dataset_name?: string): string {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

    //Declare local instance variables
    let base_dir = path.resolve(process.cwd(), 'data/stadester')
    let file_name = dataset_name.endsWith('.json') ? dataset_name : `${dataset_name}.json`

    //Return statement
    return path.join(base_dir, file_name)
  },

  /**
   * Loads and indexes a Stadestér dataset into server memory.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   *
   * @returns {Record<string, CityIndexEntry>}
   */
  loadDataset: function (arg0_dataset_name?: string): Record<string, CityIndexEntry> {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

    //Declare local instance variables
    let all_city_keys: string[]
    let file_path = StadesterService.getDatasetFilePath(dataset_name)
    let indexed_record: Record<string, CityIndexEntry> = {}
    let raw_data: Record<string, any>
    let raw_text: string

    //Guard clauses
    let meta_file_path = path.resolve(process.cwd(), 'data/stadester/city_metadata.json')
    if (fs.existsSync(meta_file_path)) {
      let meta_stat = fs.statSync(meta_file_path)
      if (meta_stat.mtimeMs > StadesterService.city_metadata_mtime) {
        StadesterService.datasets.delete(dataset_name)
      }
    }

    let sc_file_path = path.resolve(process.cwd(), 'data/stadester/state_capitals.json')
    if (fs.existsSync(sc_file_path)) {
      let sc_stat = fs.statSync(sc_file_path)
      if (sc_stat.mtimeMs > StadesterService.state_capitals_mtime) {
        StadesterService.datasets.delete(dataset_name)
      }
    }

    if (StadesterService.datasets.has(dataset_name))
      return StadesterService.datasets.get(dataset_name)!

    if (!fs.existsSync(file_path)) {
      console.warn(`[StadesterService] Dataset file not found: ${file_path}`)
      return {}
    }

    //Check lite disk cache for pre-resolved names
    let cache_dir = path.resolve(process.cwd(), 'data/stadester/cache')
    let lite_file_path = path.join(cache_dir, `${dataset_name}_lite.json`)
    let lite_name_map = new Map<string, string>()

    if (fs.existsSync(lite_file_path)) {
      try {
        let lite_data = JSON.parse(fs.readFileSync(lite_file_path, 'utf-8'))
        if (Array.isArray(lite_data)) {
          for (let i = 0; i < lite_data.length; i++) {
            if (lite_data[i].key && lite_data[i].name) {
              if (!isCorruptedCityName(lite_data[i].name))
                lite_name_map.set(lite_data[i].key, lite_data[i].name)
            }
          }
          console.log(`[StadesterService] Loaded ${lite_name_map.size} pre-resolved city names from ${lite_file_path}`)
        }
      } catch (arg0_err) {
        console.warn('[StadesterService] Failed to read lite cache for names:', arg0_err)
      }
    }

    //Function body
    loadGhslCsvNames()
    console.log(`[StadesterService] Indexing dataset ${dataset_name} from ${file_path}...`)
    raw_text = fs.readFileSync(file_path, 'utf-8')
    raw_data = JSON.parse(raw_text)
    raw_text = ''
    indexHistoricalCities(raw_data)
    all_city_keys = Object.keys(raw_data)

    for (let i = 0; i < all_city_keys.length; i++) {
      let key = all_city_keys[i]
      let c = raw_data[key]
      let pop_obj = c.population || {}
      let pop_years = Object.keys(pop_obj).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
      let min_yr = pop_years.length > 0 ? pop_years[0] : 0
      let max_yr = pop_years.length > 0 ? pop_years[pop_years.length - 1] : 0
      let max_p = 0

      for (let x = 0; x < pop_years.length; x++) {
        let p_val = pop_obj[pop_years[x]] || 0
        if (p_val > max_p)
          max_p = p_val
      }

      let cached_name = lite_name_map.get(key)
      let clean_display_name = (cached_name && !isCorruptedCityName(cached_name))
        ? cached_name
        : resolveCityDisplayName(key, c.name || key, c.coords, max_p, c.id)

      if (key === 'stadester-London (Greater London)-United Kingdom' ||
          (c.coords && Math.abs(c.coords[0] - 51.5134) < 0.01 && Math.abs(c.coords[1] - (-0.08925)) < 0.01)) {
        clean_display_name = 'City of London'
      }

      indexed_record[key] = {
        area: c.area,
        colour: c.colour,
        coords: c.coords,
        country: c.country,
        density: c.density,
        elevation: c.elevation,
        id: c.id !== undefined ? c.id : i + 1,
        key: c.key || key,
        max_pop: max_p,
        max_year: max_yr,
        min_year: min_yr,
        name: clean_display_name,
        original_names: c.original_names,
        other_names: c.other_names,
        population: pop_obj,
        region: c.region,
        years: pop_years,
      }
      delete raw_data[key]
    }

    raw_data = {} as any

    if (!indexed_record['stadester-Vaduz-Liechtenstein']) {
      indexed_record['stadester-Vaduz-Liechtenstein'] = {
        coords: [47.141, 9.521],
        country: 'Liechtenstein',
        elevation: 455,
        id: 'stadester-Vaduz-Liechtenstein',
        key: 'stadester-Vaduz-Liechtenstein',
        max_pop: 5700,
        max_year: 2020,
        min_year: 1400,
        name: 'Vaduz',
        original_names: ['vaduz'],
        other_names: ['Vaduz'],
        population: {
          '1400': 300,
          '1500': 400,
          '1600': 500,
          '1700': 600,
          '1800': 800,
          '1900': 1000,
          '1910': 1300,
          '1920': 1400,
          '1930': 1600,
          '1940': 2000,
          '1950': 2700,
          '1960': 3400,
          '1970': 3900,
          '1980': 4600,
          '1990': 4900,
          '2000': 5000,
          '2010': 5200,
          '2020': 5700,
        },
        years: [1400, 1500, 1600, 1700, 1800, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
      }
    }

    StadesterService.applyCityMetadata(indexed_record)
    StadesterService.applyStateCapitals(indexed_record)
    StadesterService.datasets.set(dataset_name, indexed_record)
    console.log(`[StadesterService] Successfully indexed ${all_city_keys.length} cities for ${dataset_name}.`)

    //Ensure lite cache exists on disk
    try {
      StadesterService.ensureLiteCache(dataset_name)
    } catch (arg0_cache_err) {
      console.warn('[StadesterService] Failed to ensure lite cache:', arg0_cache_err)
    }

    //Return statement
    return indexed_record
  },

  /**
   * Ensures the lightweight static index cache exists on disk for immediate rendering.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   *
   * @returns {string} - Absolute path to cached lite JSON file
   */
  ensureLiteCache: function (arg0_dataset_name?: string): string {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

    //Declare local instance variables
    let cache_dir = path.resolve(process.cwd(), 'data/stadester/cache')
    let lite_file_path = path.join(cache_dir, `${dataset_name}_lite.json`)
    let source_file_path = StadesterService.getDatasetFilePath(dataset_name)

    //Guard clauses
    let meta_file_path = path.resolve(process.cwd(), 'data/stadester/city_metadata.json')
    if (fs.existsSync(lite_file_path) && fs.existsSync(source_file_path)) {
      let is_meta_newer = false
      let lite_stat = fs.statSync(lite_file_path)
      let src_stat = fs.statSync(source_file_path)

      if (fs.existsSync(meta_file_path)) {
        let meta_stat = fs.statSync(meta_file_path)
        if (meta_stat.mtimeMs > lite_stat.mtimeMs)
          is_meta_newer = true
      }

      if (!is_meta_newer && lite_stat.mtimeMs >= src_stat.mtimeMs && lite_stat.size > 1000)
        return lite_file_path
    }

    //Function body
    if (!fs.existsSync(cache_dir))
      fs.mkdirSync(cache_dir, { recursive: true })

    let indexed = StadesterService.loadDataset(dataset_name)
    let all_keys = Object.keys(indexed)
    let lite_array: any[] = []

    for (let i = 0; i < all_keys.length; i++) {
      let c = indexed[all_keys[i]]
      lite_array.push({
        colour: c.colour,
        coords: c.coords,
        country: c.country,
        historical_names: c.historical_names,
        id: c.id,
        key: c.key,
        max_pop: c.max_pop,
        max_year: c.max_year,
        metadata_name: c.metadata_name,
        min_year: c.min_year,
        name: c.name,
        other_names: c.other_names,
        region: c.region,
      })
    }

    fs.writeFileSync(lite_file_path, JSON.stringify(lite_array), 'utf-8')
    console.log(`[StadesterService] Pre-cached lightweight index for ${dataset_name}: ${lite_file_path} (${(fs.statSync(lite_file_path).size / (1024*1024)).toFixed(2)} MB)`)

    //Return statement
    return lite_file_path
  },

  /**
   * Retrieves active cities interpolated at a specific historical year.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {number} [arg1_year=1950]
   * @param {StadesterQueryOptions} [arg2_options]
   *
   * @returns {CityRenderPoint[]}
   */
  getCitiesAtYear: function (
    arg0_dataset_name?: string,
    arg1_year?: number,
    arg2_options?: StadesterQueryOptions
  ): CityRenderPoint[] {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let options = (arg2_options) ? arg2_options : {}
    let target_year = arg1_year !== undefined ? arg1_year : 1950

    //Declare local instance variables
    let active_state_ids = options.active_state_ids || AtlasBordersService.getActiveStateIdsAtDate(
      Math.floor(target_year),
      options.month,
      options.day
    )
    let all_city_keys: string[]
    let cshapes_capitals_by_city_key = new Map<string, { color?: string; name: string; state_id?: number | string }>()
    let indexed = StadesterService.loadDataset(dataset_name)
    let max_cities = options.max_cities !== undefined ? options.max_cities : 4000
    let min_pop = options.min_pop !== undefined ? Math.max(0.01, options.min_pop) : 0.01
    let result_cities: CityRenderPoint[] = []

    //Guard clauses
    if (!indexed || Object.keys(indexed).length === 0)
      return []

    //Function body
    let bugged_set = getBuggedCitiesSet()
    all_city_keys = Object.keys(indexed)

    //Pre-resolve authoritative border capitals by coordinate proximity across all eras
    try {
      let borders = AtlasBordersService.getBordersAtYear(target_year, { dataset: options.dataset || 'detailed_borders' })
      if ((!borders || !borders.features || borders.features.length === 0) && (!options.dataset || options.dataset === 'detailed_borders')) {
        borders = AtlasBordersService.getBordersAtYear(target_year, { dataset: 'statistical_borders' })
      }
      if (borders && borders.features) {
        for (let feat of borders.features) {
          let p = feat.properties
          if (!p || p.is_acapital)
            continue
          let cap_lat: number | undefined
          let cap_lon: number | undefined
          if (p.cap_coords && Array.isArray(p.cap_coords) && p.cap_coords.length >= 2) {
            cap_lon = p.cap_coords[0]
            cap_lat = p.cap_coords[1]
          } else if (p.caplong !== undefined && p.caplat !== undefined) {
            cap_lon = Number(p.caplong)
            cap_lat = Number(p.caplat)
          }

          if (cap_lat === undefined || cap_lon === undefined)
            continue

          let best_city: CityIndexEntry | null = null
          let best_score = -1

          for (let j = 0; j < all_city_keys.length; j++) {
            let c = indexed[all_city_keys[j]]
            if (!c.coords)
              continue

            let is_alive = (target_year >= (c.min_year ?? -99999) && target_year <= (c.max_year ?? 99999)) ||
              (c.max_year !== undefined && c.max_year >= 1975 && target_year >= 1975)

            let c_lat = c.coords[0]
            let c_lon = c.coords[1]
            let dist = Math.hypot(c_lon - cap_lon, c_lat - cap_lat)
            if (dist > 0.45)
              continue

            if (feat.bbox) {
              let pad = 1.0
              if (c_lon < feat.bbox[0] - pad || c_lon > feat.bbox[2] + pad || c_lat < feat.bbox[1] - pad || c_lat > feat.bbox[3] + pad)
                continue
            }

            let score = 0
            if (is_alive)
              score += 100000

            if (p.capkey && (c.key === p.capkey || c.id === p.capkey))
              score += 200000

            let c_name_lower = (c.name || '').toLowerCase().trim()
            let c_name_nfd = c_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            let cap_name_lower = (p.capname || '').toLowerCase().trim()
            let cap_name_nfd = cap_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

            let is_name_match = false
            if (cap_name_lower) {
              let clean_c_name = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
              let clean_cap_name = cap_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
              let clean_c_strip_h = clean_c_name.replace(/h$/, '')
              let clean_cap_strip_h = clean_cap_name.replace(/h$/, '')
              if (
                c_name_lower === cap_name_lower ||
                c_name_nfd === cap_name_nfd ||
                clean_c_name === clean_cap_name ||
                clean_c_strip_h === clean_cap_strip_h ||
                clean_c_name.startsWith(clean_cap_name) ||
                clean_cap_name.startsWith(clean_c_name)
              ) {
                is_name_match = true
              } else if (c.other_names && Array.isArray(c.other_names)) {
                is_name_match = c.other_names.some((arg0_on: string) => {
                  let on_clean = arg0_on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
                  let on_lower = on_clean
                  let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                  let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
                  return on_lower === cap_name_lower || on_nfd === cap_name_nfd || clean_on === clean_cap_name || clean_on.replace(/h$/, '') === clean_cap_strip_h
                })
              }
            }

            if (is_name_match)
              score += 50000
            if (target_year < 1975 && c.key.startsWith('stadester-'))
              score += 25000
            if (target_year >= 1975 && c.key.startsWith('ghsl-'))
              score += 25000
            if (c.years && c.years.length > 0 && target_year >= c.years[0] && target_year <= c.years[c.years.length - 1])
              score += 15000
            if (c.capital_records && c.capital_records.length > 0)
              score += 10000
            if (c.key && !c.key.includes('agglomeration'))
              score += 5000
            score += Math.max(0, Math.round((0.5 - dist) * 2000))
            score += Math.min(1000, Math.round((c.max_pop || 0) / 1000))

            if (score > best_score) {
              best_score = score
              best_city = c
            }
          }

          if (best_city) {
            let cap_color_val = p.symbol?.polygonFill || p.symbol?.fillColor || p.color || p.fillColor || '#FFDC00'
            cshapes_capitals_by_city_key.set(best_city.key, {
              color: cap_color_val,
              name: p.name,
              state_id: p.state_id || p.gwcode,
            })
          }
        }
      }
    } catch (arg0_err) {
      console.error('[StadesterService] Error resolving border capitals by coordinate:', arg0_err)
    }

    for (let i = 0; i < all_city_keys.length; i++) {
      let city = indexed[all_city_keys[i]]
      let pop_years = city.years

      if (pop_years.length === 0 || !city.coords)
        continue

      if (isBuggedCityName(city.name, bugged_set) || (city.key && isBuggedCityName(city.key, bugged_set)))
        continue

      if (options.bbox) {
        let b = options.bbox
        let c_lat = city.coords[0]
        let c_lon = city.coords[1]
        if (b[0] <= b[2]) {
          if (c_lon < b[0] || c_lon > b[2] || c_lat < b[1] || c_lat > b[3])
            continue
        } else {
          if ((c_lon < b[0] && c_lon > b[2]) || c_lat < b[1] || c_lat > b[3])
            continue
        }
      }

      let start_yr = city.min_year
      let end_yr = city.max_year

      //Allow cities alive at target_year (with 1975+ extension for modern metropolitan entries)
      let is_in_range = (target_year >= start_yr && target_year <= end_yr) ||
        (end_yr >= 1975 && target_year >= 1975 && target_year <= 2026) ||
        cshapes_capitals_by_city_key.has(city.key)

      if (!is_in_range)
        continue

      let pop = 0
      let prev_yr = pop_years[0]
      let next_yr = pop_years[pop_years.length - 1]
      let growth_rate = 0

      //Interpolate population
      if (city.population && city.population[String(target_year)] !== undefined) {
        pop = city.population[String(target_year)]
      } else if (target_year <= start_yr) {
        pop = city.population ? (city.population[String(start_yr)] || 0) : 0
      } else if (target_year >= end_yr) {
        pop = city.population ? (city.population[String(end_yr)] || 0) : 0
      } else {
        for (let x = 0; x < pop_years.length - 1; x++) {
          if (target_year >= pop_years[x] && target_year <= pop_years[x + 1]) {
            prev_yr = pop_years[x]
            next_yr = pop_years[x + 1]
            break
          }
        }

        let p0 = city.population ? (city.population[String(prev_yr)] || 0) : 0
        let p1 = city.population ? (city.population[String(next_yr)] || 0) : 0

        if (p0 >= 0.01 && p1 >= 0.01 && next_yr > prev_yr) {
          let t = (target_year - prev_yr)/(next_yr - prev_yr)
          let log_val = Math.log10(p0) + t*(Math.log10(p1) - Math.log10(p0))
          let calc_pop = Math.pow(10, log_val)
          pop = calc_pop >= 1 ? Math.round(calc_pop) : Math.round(calc_pop * 1000) / 1000
        } else if (p1 >= 0.01) {
          pop = p1
        } else if (p0 >= 0.01) {
          pop = p0
        } else {
          pop = 0
        }
      }

      //Calculate continuous annual growth rate around target_year (logarithmic slope)
      if (city.population && pop_years.length > 1) {
        let g_next_yr = pop_years[pop_years.length - 1]
        let g_prev_yr = pop_years[0]

        if (target_year <= pop_years[0]) {
          g_prev_yr = pop_years[0]
          g_next_yr = pop_years[1]
        } else if (target_year >= pop_years[pop_years.length - 1]) {
          g_prev_yr = pop_years[pop_years.length - 2]
          g_next_yr = pop_years[pop_years.length - 1]
        } else {
          for (let x = 0; x < pop_years.length - 1; x++) {
            if (target_year >= pop_years[x] && target_year <= pop_years[x + 1]) {
              g_prev_yr = pop_years[x]
              g_next_yr = pop_years[x + 1]
              break
            }
          }
        }

        let gp0 = city.population[String(g_prev_yr)] || 0
        let gp1 = city.population[String(g_next_yr)] || 0

        if (gp0 >= 0.01 && gp1 >= 0.01 && g_next_yr > g_prev_yr) {
          growth_rate = Math.pow(gp1/gp0, 1/(g_next_yr - g_prev_yr)) - 1
        }
      }

      if (pop < 0.01) {
        if (cshapes_capitals_by_city_key.has(city.key)) {
          pop = city.population ? (city.population[String(start_yr)] || 1000) : 1000
        } else {
          continue
        }
      }

      //Resolve area and density at target year if available
      let area_val: number | undefined = undefined
      let density_val: number | undefined = undefined

      if (city.area) {
        if (city.area[String(target_year)] !== undefined) {
          area_val = city.area[String(target_year)]
        } else {
          let area_keys = Object.keys(city.area).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
          for (let y = area_keys.length - 1; y >= 0; y--) {
            if (area_keys[y] <= target_year) {
              area_val = city.area[String(area_keys[y])]
              break
            }
          }
          if (area_val === undefined && area_keys.length > 0)
            area_val = city.area[String(area_keys[0])]
        }
      }

      if (city.density) {
        if (city.density[String(target_year)] !== undefined) {
          density_val = city.density[String(target_year)]
        } else {
          let density_keys = Object.keys(city.density).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
          for (let z = density_keys.length - 1; z >= 0; z--) {
            if (density_keys[z] <= target_year) {
              density_val = city.density[String(density_keys[z])]
              break
            }
          }
          if (density_val === undefined && density_keys.length > 0)
            density_val = city.density[String(density_keys[0])]
        }
      }

      let cap_rec = getCityActiveCapitalRecord(city, target_year, (arg0_sid, arg0_y_frac) => {
        let sid_num = Number(arg0_sid)
        let state = StadesterService.getStateById(arg0_sid)
        if (!state)
          return false
        let start_bound = state._start_frac !== undefined ? state._start_frac : (state.start_year !== undefined ? state.start_year : -99999)
        let stop_bound = state._stop_frac !== undefined ? state._stop_frac : (state.stop_year !== undefined ? state.stop_year : 99999)
        let is_time_valid = (arg0_y_frac >= start_bound && arg0_y_frac <= stop_bound) ||
          (Math.floor(arg0_y_frac) >= (state.start_year ?? -99999) && Math.floor(arg0_y_frac) <= (state.stop_year ?? 99999))
        if (!is_time_valid)
          return false
        if (active_state_ids && active_state_ids.size > 0) {
          if (!active_state_ids.has(sid_num) && !state.is_contemporary && !(state.stop_year >= 2020 && arg0_y_frac >= 1975))
            return false
        }
        if (!isCityInsideStateBBox(city, state, 3.5))
          return false
        return true
      })

      let cs_cap = cshapes_capitals_by_city_key.get(city.key)
      let cap_state = cap_rec?.state_id ? StadesterService.getStateById(cap_rec.state_id) : null
      let is_capital_val = Boolean(cs_cap || (cap_rec && cap_state))

      //Protect active capitals from population threshold culling
      if (!is_capital_val && pop < min_pop)
        continue

      let cap_color_val = cs_cap?.color || cap_state?.fill_color || null
      let cap_state_id = cs_cap?.state_id || cap_rec?.state_id || undefined
      let polity_name = cs_cap?.name || cap_state?.name || undefined
      let resolved_name = StadesterService.resolveCityNameAtYear(city, target_year)

      result_cities.push({
        area: area_val,
        capital_color: cap_color_val || undefined,
        capital_state_id: cap_state_id,
        capital_state_name: polity_name,
        capitalOf: polity_name,
        colour: city.colour,
        coords: city.coords,
        country: city.country,
        density: density_val,
        growthRate: growth_rate,
        historical_names: city.historical_names,
        id: city.id,
        is_capital: is_capital_val,
        isCapital: is_capital_val,
        key: city.key,
        metadata_name: city.metadata_name,
        name: resolved_name,
        other_names: city.other_names,
        population: pop,
        region: city.region,
      })
    }

    //Sort descending by population
    result_cities.sort((arg0_a, arg0_b) => arg0_b.population - arg0_a.population)

    //Apply max_cities limit, but ensure active capitals are always preserved
    if (max_cities > 0 && max_cities < result_cities.length) {
      let top_cities = result_cities.slice(0, max_cities)
      let capitals_outside_slice = result_cities.slice(max_cities).filter((c) => c.isCapital)
      if (capitals_outside_slice.length > 0) {
        let non_capitals: CityRenderPoint[] = []
        let preserved_list: CityRenderPoint[] = []
        for (let i = 0; i < top_cities.length; i++) {
          if (top_cities[i].isCapital) {
            preserved_list.push(top_cities[i])
          } else {
            non_capitals.push(top_cities[i])
          }
        }
        let slots_for_non_capitals = Math.max(0, max_cities - preserved_list.length - capitals_outside_slice.length)
        result_cities = [...preserved_list, ...capitals_outside_slice, ...non_capitals.slice(0, slots_for_non_capitals)]
        result_cities.sort((arg0_a, arg0_b) => arg0_b.population - arg0_a.population)
      } else {
        result_cities = top_cities
      }
    }

    //Return statement
    return result_cities
  },

  /**
   * Retrieves a single city by its key or name and returns full historical details.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {string} [arg1_city_key]
   * @param {number | string} [arg2_year]
   * @param {number} [arg3_month]
   * @param {number} [arg4_day]
   * @param {object} [arg5_options]
   *
   * @returns {any | null}
   */
  getCityByKey: function (
    arg0_dataset_name?: string,
    arg1_city_key?: string,
    arg2_year?: number | string,
    arg3_month?: number,
    arg4_day?: number,
    arg5_options?: { coords?: [number, number]; country?: string; dataset?: string; state_id?: number | string }
  ): any | null {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let city_key = arg1_city_key || ''
    let year = arg2_year
    let month = arg3_month
    let day = arg4_day
    let options = (arg5_options) ? arg5_options : {}

    //Declare local instance variables
    let all_keys: string[]
    let bugged_set = getBuggedCitiesSet()
    let candidates: CityIndexEntry[] = []
    let city_key_lower: string
    let city_key_nfd: string
    let clean_search_city: string = ''
    let enrichCity: (arg0_entry: CityIndexEntry) => any
    let found: CityIndexEntry | undefined
    let indexed = StadesterService.loadDataset(dataset_name)
    let key_city: string = ''
    let key_country: string = ''
    let scoreCandidate: (arg0_entry: CityIndexEntry) => number
    let stripped_key: string
    let stripped_key_nfd: string

    //Decompose composite keys (e.g. stadester-Tripoli-Libya -> city "Tripoli", country "Libya")
    if (city_key.includes('-')) {
      let parts = city_key.split('-')
      if (parts.length >= 3 && (parts[0] === 'stadester' || parts[0] === 'ghsl' || parts[0] === 'oxford')) {
        key_city = parts[1]
        key_country = parts.slice(2).join('-')
      } else if (parts.length >= 2) {
        key_city = parts[0]
        key_country = parts.slice(1).join('-')
      }
    }

    //If coords not provided, resolve coordinates from city name and country
    if (!options.coords && (city_key || (options as any).name)) {
      let search_city = (options as any).name || key_city || city_key
      let search_country = options.country || key_country
      let resolved = AtlasBordersService.findCityCoordsByName(search_city, search_country)
      if (resolved && resolved.coords) {
        options.coords = [resolved.coords[1], resolved.coords[0]]
        if (resolved.key && indexed[resolved.key]) {
          candidates.push(indexed[resolved.key])
        }
      }
    }

    //Guard clauses
    if ((!city_key && !options.coords) || !indexed)
      return null

    if (city_key && isBuggedCityName(city_key, bugged_set))
      return null

    enrichCity = function (arg0_entry: CityIndexEntry): any {
      let entry = arg0_entry
      if (year === undefined || year === null)
        return entry

      let num_yr = typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year
      let num_mo = month !== undefined ? month : (typeof year === 'string' ? parseYearMonthDay(year).month : undefined)
      let num_day = day !== undefined ? day : (typeof year === 'string' ? parseYearMonthDay(year).day : undefined)
      let active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)

      let cap_rec = getCityActiveCapitalRecord(entry, year, (arg0_sid, arg0_y_frac) => {
        let sid_num = Number(arg0_sid)
        let state = StadesterService.getStateById(arg0_sid)
        if (!state)
          return false
        let start_bound = state._start_frac !== undefined ? state._start_frac : (state.start_year !== undefined ? state.start_year : -99999)
        let stop_bound = state._stop_frac !== undefined ? state._stop_frac : (state.stop_year !== undefined ? state.stop_year : 99999)
        let is_time_valid = (arg0_y_frac >= start_bound && arg0_y_frac <= stop_bound) ||
          (Math.floor(arg0_y_frac) >= (state.start_year ?? -99999) && Math.floor(arg0_y_frac) <= (state.stop_year ?? 99999))
        if (!is_time_valid)
          return false
        if (active_state_ids && active_state_ids.size > 0) {
          if (!active_state_ids.has(sid_num) && !state.is_contemporary && !(state.stop_year >= 2020 && arg0_y_frac >= 1975))
            return false
        }
        if (!isCityInsideStateBBox(entry, state, 3.5))
          return false
        return true
      })

      let cap_state = cap_rec?.state_id ? StadesterService.getStateById(cap_rec.state_id) : null
      let cap_color: string | undefined = cap_state?.fill_color || undefined
      let cap_sid: number | string | undefined = cap_rec?.state_id || undefined
      let is_capital = Boolean(cap_rec && cap_state)
      let polity_name = cap_state?.name || undefined

      if (num_yr !== undefined && entry.coords) {
        try {
          let border_dataset = options.dataset || 'detailed_borders'
          let cshapes_borders = AtlasBordersService.getBordersAtYear(num_yr, { dataset: border_dataset })
          if (!cshapes_borders?.features || cshapes_borders.features.length === 0) {
            cshapes_borders = AtlasBordersService.getBordersAtYear(num_yr, { dataset: 'statistical_borders' })
          }
          if (cshapes_borders && cshapes_borders.features) {
            let c_lat = entry.coords[0]
            let c_lon = entry.coords[1]
            for (let feat of cshapes_borders.features) {
              let p = feat.properties
              if (!p || p.is_acapital)
                continue
              let cap_lon: number | undefined
              let cap_lat: number | undefined
              if (p.cap_coords && Array.isArray(p.cap_coords) && p.cap_coords.length >= 2) {
                cap_lon = p.cap_coords[0]
                cap_lat = p.cap_coords[1]
              } else if (p.caplong !== undefined && p.caplat !== undefined) {
                cap_lon = Number(p.caplong)
                cap_lat = Number(p.caplat)
              }
              if (cap_lon === undefined || cap_lat === undefined)
                continue
              let dist = Math.hypot(c_lon - cap_lon, c_lat - cap_lat)
              if (dist <= 0.45) {
                cap_color = p.color || p.fillColor || '#FFDC00'
                cap_sid = p.state_id || p.gwcode
                is_capital = true
                polity_name = p.name
                break
              }
            }
          }
        } catch {
          //Ignore CShapes lookup error
        }
      }

      return {
        ...entry,
        capital_color: cap_color,
        capital_state_id: cap_sid,
        capital_state_name: polity_name,
        capitalColor: cap_color,
        capitalOf: polity_name,
        is_capital: is_capital,
        isCapital: is_capital,
        name: StadesterService.resolveCityNameAtYear(entry, year),
      }
    }

    //Check direct key match
    found = indexed[city_key] || indexed['stadester-' + city_key] || indexed['ghsl-' + city_key] || indexed['oxford-' + city_key]

    //Check key match with diacritic normalization (e.g. stadester-Riyadh-Saudi Arabia <-> stadester-Riyâdh-Saudi Arabia)
    all_keys = Object.keys(indexed)
    city_key_lower = city_key.toLowerCase().trim()
    city_key_nfd = city_key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    stripped_key = city_key_lower.replace(/^(stadester-|ghsl-|oxford-)/, '')
    stripped_key_nfd = stripped_key.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    clean_search_city = (key_city || stripped_key).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')

    if (!found && city_key_nfd) {
      for (let i = 0; i < all_keys.length; i++) {
        let entry_k = all_keys[i]
        let norm_k = entry_k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        if (norm_k === city_key_nfd) {
          found = indexed[entry_k]
          break
        }
      }
    }

    if (found) {
      if (isBuggedCityName(found.name, bugged_set) || (found.key && isBuggedCityName(found.key, bugged_set)))
        return null

      candidates.push(found)

      //Also find contemporaneous counterpart if found is temporally displaced for requested year
      if (year !== undefined && year !== null && found.coords) {
        let req_yr = typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year
        let is_displaced = (found.key.startsWith('ghsl-') && req_yr < 1975) || (found.key.startsWith('stadester-') && req_yr >= 1975)
        if (is_displaced) {
          let f_lat = found.coords[0]
          let f_lng = found.coords[1]
          for (let k in indexed) {
            let other = indexed[k]
            if (!other.coords || other.key === found.key)
              continue
            let is_target_era = (found.key.startsWith('ghsl-') && other.key.startsWith('stadester-')) ||
              (found.key.startsWith('stadester-') && other.key.startsWith('ghsl-'))
            if (!is_target_era)
              continue
            let d = computeHaversineDistanceKm(other.coords[0], other.coords[1], f_lat, f_lng)
            if (d <= 35) {
              candidates.push(other)
            }
          }
        }
      }
    }

    //Fallback linear search by key, id or name
    for (let i = 0; i < all_keys.length; i++) {
      let entry = indexed[all_keys[i]]
      if (found && entry.key === found.key)
        continue
      let e_name_lower = entry.name ? entry.name.toLowerCase().trim() : ''
      let e_meta_lower = entry.metadata_name ? entry.metadata_name.toLowerCase().trim() : ''
      let is_match = false

      if (
        entry.key === city_key ||
        String(entry.id) === city_key ||
        entry.name === city_key ||
        e_name_lower === city_key_lower ||
        e_name_lower === stripped_key ||
        e_meta_lower === city_key_lower ||
        e_meta_lower === stripped_key
      ) {
        is_match = true
      } else if (entry.other_names && Array.isArray(entry.other_names)) {
        if (entry.other_names.some((arg0_on: string) => {
          let on_clean = arg0_on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
          let on_lower = on_clean
          let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
          let is_name_eq = on_lower === city_key_lower || on_lower === stripped_key || on_lower === key_city.toLowerCase() ||
            (clean_search_city && clean_search_city === clean_on)
          if (is_name_eq) {
            let country_cand = key_country || options.country
            if (!country_cand)
              return true
            let c_cand_norm = country_cand.toLowerCase().trim()
            let e_c_norm = (entry.country || '').toLowerCase().trim()
            return e_c_norm === c_cand_norm || c_cand_norm.includes(e_c_norm) || e_c_norm.includes(c_cand_norm)
          }
          return false
        })) {
          is_match = true
        }
      }

      if (!is_match && stripped_key_nfd && entry.name) {
        let e_name_nfd = entry.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        if (e_name_nfd === stripped_key_nfd)
          is_match = true
      }

      if (is_match) {
        if (!isBuggedCityName(entry.name, bugged_set) && !(entry.key && isBuggedCityName(entry.key, bugged_set)))
          candidates.push(entry)
      }
    }

    if (options.coords) {
      let opt_lat = options.coords[0]
      let opt_lng = options.coords[1]
      for (let i = 0; i < all_keys.length; i++) {
        let entry = indexed[all_keys[i]]
        if (!entry.coords)
          continue
        let d = computeHaversineDistanceKm(entry.coords[0], entry.coords[1], opt_lat, opt_lng)
        if (d <= 35) {
          if (!candidates.includes(entry) && !isBuggedCityName(entry.name, bugged_set))
            candidates.push(entry)
        }
      }
    }

    if (candidates.length > 0) {
      scoreCandidate = function (arg0_entry: CityIndexEntry): number {
        let score = 0
        let req_yr = (year !== undefined && year !== null)
          ? (typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year)
          : undefined

        if (options.coords && arg0_entry.coords) {
          let d_km = computeHaversineDistanceKm(arg0_entry.coords[0], arg0_entry.coords[1], options.coords[0], options.coords[1])
          if (d_km <= 35) {
            score += 100000000
            score += Math.max(0, Math.round((35 - d_km) * 10000))
          }
        }

        if (req_yr !== undefined) {
          let is_alive = (req_yr >= (arg0_entry.min_year ?? -99999) && req_yr <= (arg0_entry.max_year ?? 99999)) ||
            (arg0_entry.max_year !== undefined && arg0_entry.max_year >= 1975 && req_yr >= 1975)
          if (is_alive)
            score += 50000000

          if (req_yr < 1975 && arg0_entry.key.startsWith('stadester-'))
            score += 20000000
          if (req_yr >= 1975 && arg0_entry.key.startsWith('ghsl-'))
            score += 20000000
        }

        if (options.state_id !== undefined && arg0_entry.capital_records) {
          let req_sid = Number(options.state_id)
          let has_sid = arg0_entry.capital_records.some((arg0_cr) => arg0_cr.state_id === req_sid)
          if (has_sid)
            score += 10000000
        }
        if (options.country && arg0_entry.country) {
          let req_country = options.country.toLowerCase().trim()
          let entry_country = arg0_entry.country.toLowerCase().trim()
          if (entry_country === req_country || req_country.includes(entry_country) || entry_country.includes(req_country))
            score += 1000000
        }
        if (arg0_entry.key.startsWith('stadester-'))
          score += 10000
        score += Math.min(arg0_entry.max_pop || 0, 999999)
        return score
      }

      candidates.sort((arg0_a, arg0_b) => scoreCandidate(arg0_b) - scoreCandidate(arg0_a))

      //Return statement
      return enrichCity(candidates[0])
    }

    //Return statement
    return null
  },

  /**
   * Returns top N largest cities at a specific year for chart visualisations.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {number} [arg1_year=1950]
   * @param {number} [arg2_limit=20]
   *
   * @returns {CityRenderPoint[]}
   */
  getLargestCitiesAtYear: function (
    arg0_dataset_name?: string,
    arg1_year?: number,
    arg2_limit?: number
  ): CityRenderPoint[] {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let limit = arg2_limit !== undefined ? arg2_limit : 20
    let year = arg1_year !== undefined ? arg1_year : 1950

    //Declare local instance variables
    let raw_cities = StadesterService.getCitiesAtYear(dataset_name, year, { max_cities: limit, min_pop: 0.01 })

    //Function body
    for (let i = 0; i < raw_cities.length; i++) {
      raw_cities[i].name = getPrimaryCityName(raw_cities[i].name, raw_cities[i].population)
    }

    //Return statement
    return raw_cities
  },

  /**
   * Returns compact columnar arrays for fast transfer and minimal JSON serialization overhead.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {number} [arg1_year=1950]
   * @param {StadesterQueryOptions} [arg2_options]
   *
   * @returns {CompactCitiesPayload}
   */
  getCompactCitiesAtYear: function (
    arg0_dataset_name?: string,
    arg1_year?: number,
    arg2_options?: StadesterQueryOptions
  ): CompactCitiesPayload {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let options = (arg2_options) ? arg2_options : {}
    let year = arg1_year !== undefined ? arg1_year : 1950

    //Declare local instance variables
    let cities = StadesterService.getCitiesAtYear(dataset_name, year, options)
    let len = cities.length
    let capital_colors: (string | null)[] = new Array(len)
    let capital_names: (string | null)[] = new Array(len)
    let capital_state_ids: (number | null)[] = new Array(len)
    let capitals: number[] = new Array(len)
    let coords: number[] = new Array(len * 2)
    let countries: (string | undefined)[] = new Array(len)
    let growth: number[] = new Array(len)
    let keys: string[] = new Array(len)
    let names: string[] = new Array(len)
    let pops: number[] = new Array(len)
    let regions: (string | undefined)[] = new Array(len)

    //Function body
    for (let i = 0; i < len; i++) {
      let c = cities[i]
      keys[i] = c.key
      names[i] = getPrimaryCityName(c.name, c.population)
      countries[i] = c.country
      coords[i * 2] = c.coords[0]
      coords[i * 2 + 1] = c.coords[1]
      pops[i] = c.population
      growth[i] = c.growthRate !== undefined ? Math.round(c.growthRate * 10000) / 10000 : 0
      regions[i] = c.region
      capitals[i] = c.is_capital ? 1 : 0
      capital_colors[i] = c.capital_color || null
      capital_names[i] = c.capitalOf || c.capital_state_name || null
      capital_state_ids[i] = (c.capital_state_id !== undefined && c.capital_state_id !== null) ? Number(c.capital_state_id) : null
    }

    //Return statement
    return {
      capitals,
      capital_colors,
      capital_names,
      capital_state_ids,
      coords,
      count: len,
      countries,
      growth,
      keys,
      names,
      pops,
      regions,
    }
  },
}

