import fs from 'fs'
import { FilepathDefines } from './filepath_defines.ts'
import { AtlasBordersService } from './AtlasBordersService.ts'
import {
  computeHaversineDistanceKm,
  getCityActiveCapitalRecord,
  isCityCapitalAtYear as isCityCapitalAtYearFramework,
  normalizeCityAlias,
  normalizeCityKey,
  normalizeMetadataEntry,
  parseYearMonthDay,
  resolveHistoricalCityName,
  type CityMetadataEntry,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'
import {
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  type CityIndexEntry,
} from './stadester_types.ts'

let city_metadata_cache: CityMetadataEntry[] | null = null
let city_metadata_mtime = 0
let state_capitals_cache: Record<string, any> | null = null
let states_by_id: Map<string | number, any> | null = null

/**
 * Retrieves state metadata by state ID from the cached data/atlas/temp/states.json registry.
 *
 * @param {string | number} arg0_state_id
 *
 * @returns {any | null}
 */
export function getStateById (arg0_state_id: string | number): any {
  //Convert from parameters
  let state_id = arg0_state_id

  //Guard clauses
  if (state_id === undefined || state_id === null)
    return null

  //Function body
  if (!states_by_id) {
    states_by_id = new Map()
    let states_path = FilepathDefines.get().filepaths.atlas_states
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
            states_by_id.set(s.state_id, s)
            states_by_id.set(String(s.state_id), s)
          }
        }
      } catch (arg0_err) {
        console.warn('[StadesterMetadata] Failed to load states.json:', arg0_err)
      }
    }
  }

  //Return statement
  return states_by_id.get(state_id) || states_by_id.get(String(state_id)) || null
}


/**
 * Retrieves the authoritative state_capitals.json mapping.
 *
 * @returns {Record<string, any>}
 */
export function getStateCapitals (): Record<string, any> {
  //Declare local instance variables
  let file_path = FilepathDefines.get().filepaths.stadester_capitals

  //Guard clauses
  if (state_capitals_cache)
    return state_capitals_cache

  //Function body
  if (fs.existsSync(file_path)) {
    try {
      state_capitals_cache = JSON.parse(fs.readFileSync(file_path, 'utf-8'))
    } catch {
      state_capitals_cache = {}
    }
  } else {
    state_capitals_cache = {}
  }

  //Return statement
  return state_capitals_cache || {}
}


/**
 * Checks whether a state is marked as acapital in state_capitals.json.
 *
 * @param {string | number} arg0_state_id
 *
 * @returns {boolean}
 */
export function isStateAcapital (arg0_state_id: string | number): boolean {
  //Convert from parameters
  let state_id = arg0_state_id

  //Guard clauses
  if (state_id === undefined || state_id === null)
    return false

  //Declare local instance variables
  let sc = getStateCapitals()
  let sid_str = String(state_id)

  //Return statement
  return Boolean(sc[sid_str]?.acapital)
}


/**
 * Evaluates whether a city was a capital at target historical year, validating state existence.
 *
 * @param {any} arg0_city
 * @param {number | string} [arg1_year]
 * @param {Set<number>} [arg2_active_state_ids]
 *
 * @returns {boolean}
 */
export function isCityCapitalAtYear (
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
  return isCityCapitalAtYearFramework(city, year, (arg0_sid, arg0_y_frac) => {
    let sid_num = Number(arg0_sid)
    let state = getStateById(arg0_sid)
    if (!state)
      return false
    if (isStateAcapital(arg0_sid))
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
}


/**
 * Resolves the fill colour of the corresponding state for a capital city.
 *
 * @param {any} arg0_city
 * @param {number | string} [arg1_year]
 * @param {Set<number>} [arg2_active_state_ids]
 *
 * @returns {string | null} Hex fill colour or null
 */
export function getCityCapitalColorAtYear (
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
    let state = getStateById(arg0_sid)
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

  let state = getStateById(cap_rec.state_id)

  //Return statement
  return state?.fill_color || null
}


/**
 * Merges two historical name records chronologically, preserving rich multi-entry timelines.
 * Ensures that modern placeholder entries (e.g. single 1975 entries) never overwrite earlier historical names.
 *
 * @param {HistoricalNameRecord[]} [arg0_existing]
 * @param {HistoricalNameRecord[]} [arg1_incoming]
 *
 * @returns {HistoricalNameRecord[]}
 */
export function mergeHistoricalNames (
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
}


/**
 * Resolves a city's historical name at the specified year or date.
 *
 * @param {CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[] }} arg0_city
 * @param {number | string} [arg1_year]
 *
 * @returns {string}
 */
export function resolveCityNameAtYear (
  arg0_city: CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[]; ghsl_name?: string; reconciled_name?: string },
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
}


/**
 * Loads and normalises city metadata from data/stadester/city_metadata.json into memory.
 *
 * @returns {CityMetadataEntry[]}
 */
export function loadCityMetadata (): CityMetadataEntry[] {
  //Declare local instance variables
  let file_path = FilepathDefines.get().filepaths.stadester_metadata
  let normalized_list: CityMetadataEntry[] = []

  //Guard clauses
  if (!fs.existsSync(file_path))
    return []

  try {
    let stats = fs.statSync(file_path)
    if (city_metadata_cache && stats.mtimeMs <= city_metadata_mtime)
      return city_metadata_cache

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

    city_metadata_cache = normalized_list
    city_metadata_mtime = stats.mtimeMs
    console.log(`[StadesterMetadata] Loaded ${normalized_list.length} city metadata entries from ${file_path}`)
    return normalized_list
  } catch (arg0_err) {
    console.warn('[StadesterMetadata] Failed to load city_metadata.json:', arg0_err)
    return city_metadata_cache || []
  }
}


/**
 * Applies metadata from data/stadester/city_metadata.json to indexed cities.
 *
 * @param {Record<string, CityIndexEntry>} arg0_indexed_record
 *
 * @returns {void}
 */
export function applyCityMetadata (arg0_indexed_record: Record<string, CityIndexEntry>): void {
  //Convert from parameters
  let indexed = arg0_indexed_record

  //Declare local instance variables
  let all_keys = Object.keys(indexed)
  let meta_list = loadCityMetadata()
  let spatial_grid: Record<string, CityIndexEntry[]> = {}

  //Guard clauses
  if (!meta_list || meta_list.length === 0 || all_keys.length === 0)
    return

  //Function body
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

  for (let i = 0; i < meta_list.length; i++) {
    let best_city: CityIndexEntry | null = null
    let meta = meta_list[i]
    let min_dist = 999999
    let target_lat = meta.coords[1]
    let target_lng = meta.coords[0]

    if (meta.key && indexed[meta.key]) {
      best_city = indexed[meta.key]
      min_dist = 0
    }

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

      if (is_exact_coord_match && meta.name && !best_city.key.startsWith('ghsl-'))
        best_city.name = meta.name

      if (meta.historical_names && meta.historical_names.length > 0)
        best_city.historical_names = mergeHistoricalNames(best_city.historical_names, meta.historical_names)

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
                    other.historical_names = mergeHistoricalNames(other.historical_names, meta.historical_names)
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

  console.log(`[StadesterMetadata] Successfully bound ${meta_list.length} historical city metadata entries.`)
}


/**
 * Binds authoritative state capital timelines from data/stadester/state_capitals.json directly to indexed cities.
 *
 * @param {Record<string, CityIndexEntry>} arg0_indexed_record
 *
 * @returns {void}
 */
export function applyStateCapitals (arg0_indexed_record: Record<string, CityIndexEntry>): void {
  //Convert from parameters
  let indexed = arg0_indexed_record

  //Declare local instance variables
  let all_city_intervals: Array<[CityIndexEntry, Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }> ]>
  let all_keys: string[]
  let all_state_ids: string[]
  let city_intervals = new Map<CityIndexEntry, Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }>>()
  let file_path = FilepathDefines.get().filepaths.stadester_capitals
  let name_country_to_city = new Map<string, CityIndexEntry[]>()
  let norm_key_to_cities = new Map<string, CityIndexEntry[]>()
  let state_capitals: Record<string, { acapital: boolean; timeline?: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }> }>
  let updated_count = 0

  //Guard clauses
  if (!fs.existsSync(file_path))
    return

  //Function body
  try {
    state_capitals = JSON.parse(fs.readFileSync(file_path, 'utf-8'))
    state_capitals_cache = state_capitals
  } catch (arg0_err) {
    console.warn('[StadesterMetadata] Failed to load state_capitals.json:', arg0_err)
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

  for (let x = 0; x < all_keys.length; x++) {
    let city = indexed[all_keys[x]]
    if (city.capital_records && city.capital_records.length > 0) {
      let ivs: Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }> = []
      for (let y = 0; y < city.capital_records.length; y++) {
        let rec = city.capital_records[y]
        if (rec.state_id !== null && rec.state_id !== undefined) {
          let s_id_str = String(rec.state_id)
          if (state_capitals[s_id_str]?.acapital)
            continue

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
        let state = getStateById(s_id_num)
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
          let state_a = getStateById(arg0_a.state_id)
          let state_b = getStateById(arg0_b.state_id)
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

  console.log(`[StadesterMetadata] Successfully bound authoritative state capitals to ${updated_count} cities.`)
}
