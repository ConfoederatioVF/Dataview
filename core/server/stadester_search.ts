import { AtlasBordersService } from './AtlasBordersService.ts'
import { isBuggedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  getCityActiveCapitalRecord,
  parseYearMonthDay,
} from '../framework/stadester/city_metadata_framework.ts'
import {
  getBuggedCitiesSet,
  isCityInsideStateBBox,
  type CityIndexEntry,
} from './stadester_types.ts'
import {
  getStateById,
  isStateAcapital,
  resolveCityNameAtYear,
} from './stadester_metadata.ts'
import { loadDataset } from './stadester_loader.ts'
import { getAuthoritativeCapitalsAtYear } from './stadester_queries.ts'

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
export function getCityByKey (
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
  let indexed = loadDataset(dataset_name)
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
    let effective_year = (year !== undefined && year !== null) ? year : 1950

    let num_yr = typeof effective_year === 'number' ? Math.floor(effective_year) : parseYearMonthDay(effective_year).year
    let num_mo = month !== undefined ? month : (typeof effective_year === 'string' ? parseYearMonthDay(effective_year).month : undefined)
    let num_day = day !== undefined ? day : (typeof effective_year === 'string' ? parseYearMonthDay(effective_year).day : undefined)
    let active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)

    let cap_rec = getCityActiveCapitalRecord(entry, effective_year, (arg0_sid, arg0_y_frac) => {
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
      if (!isCityInsideStateBBox(entry, state, 3.5))
        return false
      return true
    })

    let cap_state = cap_rec?.state_id ? getStateById(cap_rec.state_id) : null
    let cap_color: string | undefined = cap_state?.fill_color || undefined
    let cap_sid: number | string | undefined = cap_rec?.state_id || undefined
    let is_capital = Boolean(cap_rec && cap_state)
    let polity_name = cap_state?.name || undefined

    if (num_yr !== undefined && entry.coords) {
      try {
        let cshapes_capitals = getAuthoritativeCapitalsAtYear(
          dataset_name,
          num_yr,
          num_mo,
          num_day,
          options.dataset || 'detailed_borders'
        )
        let cap_info = cshapes_capitals.get(entry.key) || (entry.id ? cshapes_capitals.get(String(entry.id)) : undefined)
        if (cap_info) {
          let should_override = true
          if (cap_state && String(cap_info.state_id) !== String(cap_state.state_id)) {
            let cap_polity = (cap_info.name || '').toLowerCase().trim()
            let cap_state_obj = cap_info.state_id !== undefined ? getStateById(cap_info.state_id) : null
            let cap_area = cap_state_obj?.bbox ? Math.max(0, (cap_state_obj.bbox[2] - cap_state_obj.bbox[0])*(cap_state_obj.bbox[3] - cap_state_obj.bbox[1])) : 0
            let city_country = (entry.country || '').toLowerCase().trim()
            let cap_matches = Boolean(city_country && (cap_polity.includes(city_country) || city_country.includes(cap_polity)))
            let state_polity = (cap_state.name || '').toLowerCase().trim()
            let state_area = cap_state.bbox ? Math.max(0, (cap_state.bbox[2] - cap_state.bbox[0])*(cap_state.bbox[3] - cap_state.bbox[1])) : 0
            let state_matches = Boolean(city_country && (state_polity.includes(city_country) || city_country.includes(state_polity)))

            if (state_matches && !cap_matches) {
              should_override = false
            } else if (state_area > cap_area && !cap_matches) {
              should_override = false
            }
          }

          if (should_override) {
            cap_color = cap_info.color
            cap_sid = cap_info.state_id
            is_capital = true
            polity_name = cap_info.name
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
      capitalStateId: cap_sid,
      is_capital: is_capital,
      isCapital: is_capital,
      name: resolveCityNameAtYear(entry, effective_year),
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
}
