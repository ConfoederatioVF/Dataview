import fs from 'fs'
import { AtlasBordersService } from './AtlasBordersService.ts'
import { FilepathDefines } from './filepath_defines.ts'
import {
  getCityActiveCapitalRecord,
  isCityCapitalAtYear as isCityCapitalAtYearFramework,
  normalizeCityKey,
  parseYearMonthDay,
} from '../framework/stadester/city_metadata_framework.ts'
import {
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  selectBestCapitalCandidateForTimeline,
  type CityIndexEntry,
} from './stadester_types.ts'

let acapital_state_ids_cache: Set<string | number> | null = null
let state_capitals_cache: Record<string, any> | null = null
let states_by_id: Map<string | number, any> | null = null

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
    console.warn('[StadesterCapitals] Failed to load state_capitals.json:', arg0_err)
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

    let c_country_l = (city.country || '').toLowerCase().trim()
    let nc_key = `${(city.name || '').toLowerCase().trim()}|${c_country_l}`
    if (!name_country_to_city.has(nc_key))
      name_country_to_city.set(nc_key, [])
    name_country_to_city.get(nc_key)!.push(city)

    if (Array.isArray(city.other_names)) {
      for (let x = 0; x < city.other_names.length; x++) {
        let on_nc: string = `${String(city.other_names[x] || '').toLowerCase().trim()}|${c_country_l}`
        if (!name_country_to_city.has(on_nc))
          name_country_to_city.set(on_nc, [])
        if (!name_country_to_city.get(on_nc)!.includes(city))
          name_country_to_city.get(on_nc)!.push(city)
      }
    }
    if (Array.isArray(city.historical_names)) {
      for (let x = 0; x < city.historical_names.length; x++) {
        let hn_nc: string = `${String(city.historical_names[x]?.name || '').toLowerCase().trim()}|${c_country_l}`
        if (!name_country_to_city.has(hn_nc))
          name_country_to_city.set(hn_nc, [])
        if (!name_country_to_city.get(hn_nc)!.includes(city))
          name_country_to_city.get(hn_nc)!.push(city)
      }
    }
  }

  for (let x = 0; x < all_keys.length; x++) {
    let city = indexed[all_keys[x]]
    if (city.capital_records && city.capital_records.length > 0) {
      let ivs: Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }> = []
      for (let y = 0; y < city.capital_records.length; y++) {
        let rec = city.capital_records[y]
        if (rec.state_id !== null && rec.state_id !== undefined) {
          let s_id_str = String(rec.state_id)
          if (state_capitals[s_id_str])
            continue
          let rec_state = getStateById(Number(rec.state_id))
          if (rec_state && !isCityInsideStateBBox(city, rec_state, 0.75))
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
      city.capital = {}
      city.capital_records = []
      if (ivs.length > 0)
        city_intervals.set(city, ivs)
    }
  }

  all_state_ids = Object.keys(state_capitals)
  for (let z = 0; z < all_state_ids.length; z++) {
    let state_id = all_state_ids[z]
    let sc_entry = state_capitals[state_id]
    if (!sc_entry || sc_entry.acapital || !sc_entry.timeline || sc_entry.timeline.length === 0)
      continue

    let s_id_num = Number(state_id)
    let state = getStateById(s_id_num)

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
          }
        }
      }

      let s_p = parseYearMonthDay(tl_item.start)
      let e_p = tl_item.stop ? parseYearMonthDay(tl_item.stop) : { date: '2026.1.1', year_frac: 2026 }
      let start_frac_val = tl_item.start_frac !== undefined ? tl_item.start_frac : s_p.year_frac
      let stop_frac_val = tl_item.stop_frac !== undefined ? tl_item.stop_frac : e_p.year_frac
      let best_city = selectBestCapitalCandidateForTimeline(
        target_cities,
        state,
        tl_item.key,
        start_frac_val,
        stop_frac_val
      )

      if (best_city) {
        if (!city_intervals.has(best_city))
          city_intervals.set(best_city, [])
        city_intervals.get(best_city)!.push({
          is_authoritative: true,
          start_date: tl_item.start.trim(),
          start_frac: start_frac_val,
          state_id: s_id_num,
          stop_date: tl_item.stop ? tl_item.stop.trim() : '2026.1.1',
          stop_frac: stop_frac_val,
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

    pts.sort((arg0_a, arg1_b) => arg0_a.year_frac - arg1_b.year_frac)

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

        candidates.sort((arg0_a, arg1_b) => {
          let state_a = getStateById(arg0_a.state_id)
          let state_b = getStateById(arg1_b.state_id)
          let inside_a = state_a ? (isCityInsideStateBBox(city, state_a, 0.75) ? 1 : 0) : 1
          let inside_b = state_b ? (isCityInsideStateBBox(city, state_b, 0.75) ? 1 : 0) : 1
          if (inside_a !== inside_b)
            return inside_b - inside_a

          let dur_a = (arg0_a.stop_frac !== undefined && arg0_a.start_frac !== undefined) ? (arg0_a.stop_frac - arg0_a.start_frac) : 99999
          let dur_b = (arg1_b.stop_frac !== undefined && arg1_b.start_frac !== undefined) ? (arg1_b.stop_frac - arg1_b.start_frac) : 99999
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
    }).sort((arg0_a, arg1_b) => arg0_a.year_frac - arg1_b.year_frac)
    updated_count++
  }

  console.log(`[StadesterCapitals] Successfully bound authoritative state capitals to ${updated_count} cities.`)
}


/**
 * Clears all cached state and state-capital registries from memory.
 *
 * @returns {void}
 */
export function clearStateCapitalsCache (): void {
  //Function body
  acapital_state_ids_cache = null
  state_capitals_cache = null
  states_by_id = null
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

  //Declare local instance variables
  let cap_rec: any
  let state: any

  //Guard clauses
  if (!city)
    return null

  //Function body
  if (!active_state_ids && (year !== undefined && year !== null)) {
    let num_day = typeof year === 'string' ? parseYearMonthDay(year).day : undefined
    let num_mo = typeof year === 'string' ? parseYearMonthDay(year).month : undefined
    let num_yr = typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year
    active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)
  }

  cap_rec = getCityActiveCapitalRecord(
    city,
    year,
    (arg0_sid, arg1_y_frac) => isStateValidForCapitalAtYear(city, arg0_sid, arg1_y_frac, active_state_ids, false)
  )

  if (!cap_rec || !cap_rec.state_id)
    return null

  state = getStateById(cap_rec.state_id)

  //Return statement
  return state?.fill_color || null
}


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
        console.warn('[StadesterCapitals] Failed to load states.json:', arg0_err)
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
  //Guard clauses
  if (state_capitals_cache)
    return state_capitals_cache

  //Declare local instance variables
  let file_path = FilepathDefines.get().filepaths.stadester_capitals

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

  acapital_state_ids_cache = new Set<string | number>()
  let all_sids = Object.keys(state_capitals_cache || {})
  for (let i = 0; i < all_sids.length; i++) {
    let sid_str = all_sids[i]
    if (state_capitals_cache?.[sid_str]?.acapital) {
      acapital_state_ids_cache.add(sid_str)
      let sid_num = Number(sid_str)
      if (Number.isFinite(sid_num))
        acapital_state_ids_cache.add(sid_num)
    }
  }

  //Return statement
  return state_capitals_cache || {}
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

  //Function body
  if (!active_state_ids && (year !== undefined && year !== null)) {
    let num_day = typeof year === 'string' ? parseYearMonthDay(year).day : undefined
    let num_mo = typeof year === 'string' ? parseYearMonthDay(year).month : undefined
    let num_yr = typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year
    active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)
  }

  //Return statement
  return isCityCapitalAtYearFramework(
    city,
    year,
    (arg0_sid, arg1_y_frac) => isStateValidForCapitalAtYear(city, arg0_sid, arg1_y_frac, active_state_ids, true)
  )
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

  //Function body
  if (!acapital_state_ids_cache)
    getStateCapitals()

  //Return statement
  return Boolean(acapital_state_ids_cache && acapital_state_ids_cache.has(state_id))
}


/**
 * Validates whether a state exists at target historical fraction and contains the candidate city bbox.
 *
 * @param {any} arg0_city
 * @param {number | string} arg1_state_id
 * @param {number} arg2_year_frac
 * @param {Set<number>} [arg3_active_state_ids]
 * @param {boolean} [arg4_check_acapital=true]
 *
 * @returns {boolean}
 */
function isStateValidForCapitalAtYear (
  arg0_city: any,
  arg1_state_id: number | string,
  arg2_year_frac: number,
  arg3_active_state_ids?: Set<number>,
  arg4_check_acapital: boolean = true
): boolean {
  //Convert from parameters
  let active_state_ids = arg3_active_state_ids
  let check_acapital = arg4_check_acapital
  let city = arg0_city
  let state_id = arg1_state_id
  let year_frac = arg2_year_frac

  //Declare local instance variables
  let is_time_valid: boolean
  let sid_num = Number(state_id)
  let start_bound: number
  let state = getStateById(state_id)
  let stop_bound: number

  //Guard clauses
  if (!state)
    return false
  if (check_acapital && isStateAcapital(state_id))
    return false

  //Function body
  start_bound = state._start_frac !== undefined ? state._start_frac : (state.start_year !== undefined ? state.start_year : -99999)
  stop_bound = state._stop_frac !== undefined ? state._stop_frac : (state.stop_year !== undefined ? state.stop_year : 99999)
  is_time_valid = (year_frac >= start_bound && year_frac <= stop_bound) ||
    (Math.floor(year_frac) >= (state.start_year ?? -99999) && Math.floor(year_frac) <= (state.stop_year ?? 99999))
  if (!is_time_valid)
    return false

  if (active_state_ids && active_state_ids.size > 0) {
    if (!active_state_ids.has(sid_num) && !state.is_contemporary && !(state.stop_year >= 2020 && year_frac >= 1975))
      return false
  }
  if (!isCityInsideStateBBox(city, state, 0.75))
    return false

  //Return statement
  return true
}
