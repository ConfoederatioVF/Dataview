import { AtlasBordersService } from './AtlasBordersService.ts'
import { getPrimaryCityName, isBuggedCityName } from '../framework/stadester/city_name_framework.ts'
import { getCityActiveCapitalRecord } from '../framework/stadester/city_metadata_framework.ts'
import {
  getBuggedCitiesSet,
  isCityInsideStateBBox,
  type CityIndexEntry,
  type CityRenderPoint,
  type CompactCitiesPayload,
  type StadesterQueryOptions,
} from './stadester_types.ts'
import {
  getStateById,
  isStateAcapital,
  resolveCityNameAtYear,
} from './stadester_metadata.ts'
import {
  getNearbyCityKeys,
  loadDataset,
} from './stadester_loader.ts'

export let _cache_authoritative_capitals_by_year = new Map<string, Map<string, { area?: number; color: string; name?: string; state_id?: number | string }>>()
export let _cache_cities_at_year = new Map<string, CityRenderPoint[]>()
export let _cache_compact_cities = new Map<string, CompactCitiesPayload>()

/**
 * Resolves and caches authoritative border capitals mapped to their best/closest contemporaneous cities.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 * @param {number} [arg1_year=1950]
 * @param {number} [arg2_month=1]
 * @param {number} [arg3_day=1]
 * @param {string} [arg4_border_dataset='defacto_borders']
 *
 * @returns {Map<string, { area?: number; color: string; name?: string; state_id?: number | string }>}
 */
export function getAuthoritativeCapitalsAtYear (
  arg0_dataset_name?: string,
  arg1_year?: number,
  arg2_month?: number,
  arg3_day?: number,
  arg4_border_dataset?: string
): Map<string, { area?: number; color: string; name?: string; state_id?: number | string }> {
  //Convert from parameters
  let border_dataset = (arg4_border_dataset) ? arg4_border_dataset : 'defacto_borders'
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
  let day = arg3_day !== undefined ? arg3_day : 1
  let month = arg2_month !== undefined ? arg2_month : 1
  let year = arg1_year !== undefined ? Math.floor(arg1_year) : 1950

  //Declare local instance variables
  let borders: any
  let cache_key = `${dataset_name}:${year}:${month}:${day}:${border_dataset}`
  let capitals_by_city = new Map<string, { area?: number; color: string; name?: string; state_id?: number | string }>()
  let indexed = loadDataset(dataset_name)

  //Guard clauses
  if (_cache_authoritative_capitals_by_year.has(cache_key))
    return _cache_authoritative_capitals_by_year.get(cache_key)!

  //Function body
  try {
    borders = AtlasBordersService.getBordersAtYear(year, { dataset: border_dataset, day, month })
    if ((!borders || !borders.features || borders.features.length === 0) && (border_dataset === 'defacto_borders' || border_dataset === 'detailed_borders'))
      borders = AtlasBordersService.getBordersAtYear(year, { dataset: 'dejure_borders', day, month })

    if (borders && borders.features) {
      for (let i = 0; i < borders.features.length; i++) {
        let feat = borders.features[i]
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

        let candidate_keys = getNearbyCityKeys(dataset_name, cap_lat, cap_lon, 0.20)
        if (p.capkey && !candidate_keys.includes(p.capkey) && indexed[p.capkey])
          candidate_keys.push(p.capkey)

        let best_city: CityIndexEntry | null = null
        let best_score = -1

        for (let x = 0; x < candidate_keys.length; x++) {
          let c = indexed[candidate_keys[x]]
          if (!c || !c.coords)
            continue

          let is_alive = (year >= (c.min_year ?? -99999) && year <= (c.max_year ?? 99999)) ||
            (c.max_year !== undefined && c.max_year >= 1975 && year >= 1975)
          if (!is_alive)
            continue

          if (year < 1975 && c.key.startsWith('ghsl-'))
            continue

          let c_lat = c.coords[0]
          let c_lon = c.coords[1]
          let dist = Math.hypot(c_lon - cap_lon, c_lat - cap_lat)
          if (dist > 0.20)
            continue

          if (feat.bbox) {
            let pad = 1.0
            if (c_lon < feat.bbox[0] - pad || c_lon > feat.bbox[2] + pad || c_lat < feat.bbox[1] - pad || c_lat > feat.bbox[3] + pad)
              continue
          }

          let score = 0
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
          if (year < 1975 && c.key.startsWith('stadester-'))
            score += 25000
          if (year >= 1975 && c.key.startsWith('ghsl-'))
            score += 25000
          if (c.years && c.years.length > 0 && year >= c.years[0] && year <= c.years[c.years.length - 1])
            score += 15000
          if (c.capital_records && c.capital_records.length > 0)
            score += 10000
          if (c.key && !c.key.includes('agglomeration'))
            score += 5000
          score += Math.max(0, Math.round((0.25 - dist) * 5000))
          score += Math.min(1000, Math.round((c.max_pop || 0) / 1000))

          if (score > best_score) {
            best_score = score
            best_city = c
          }
        }

        if (best_city) {
          let cap_color_val = p.polygonFill || p.symbol?.polygonFill || p.fill_color || p.fillColor || p.color || (p.state_id ? getStateById(p.state_id)?.fill_color : null) || '#FFDC00'
          let feat_area = p.area !== undefined ? Number(p.area) : 0
          if (!feat_area && feat.bbox)
            feat_area = Math.max(0, (feat.bbox[2] - feat.bbox[0])*(feat.bbox[3] - feat.bbox[1]))

          let cap_entry = {
            area: feat_area,
            color: cap_color_val,
            name: p.name,
            state_id: p.state_id || p.gwcode,
          }

          let existing_entry = capitals_by_city.get(best_city.key)
          let should_set = true

          if (existing_entry) {
            let city_country = (best_city.country || '').toLowerCase().trim()
            let exist_area = existing_entry.area || 0
            let exist_polity = (existing_entry.name || '').toLowerCase().trim()
            let new_polity = (p.name || '').toLowerCase().trim()
            let exist_matches_country = Boolean(city_country && (exist_polity.includes(city_country) || city_country.includes(exist_polity)))
            let new_matches_country = Boolean(city_country && (new_polity.includes(city_country) || city_country.includes(new_polity)))

            if (exist_matches_country && !new_matches_country) {
              should_set = false
            } else if (!exist_matches_country && new_matches_country) {
              should_set = true
            } else if (exist_area > feat_area) {
              should_set = false
            }
          }

          if (should_set) {
            capitals_by_city.set(best_city.key, cap_entry)
            if (best_city.id && String(best_city.id) !== best_city.key)
              capitals_by_city.set(String(best_city.id), cap_entry)
          }
        }
      }
    }
  } catch (arg0_err) {
    console.error('[StadesterQueries] Error resolving border capitals by coordinate:', arg0_err)
  }

  _cache_authoritative_capitals_by_year.set(cache_key, capitals_by_city)

  //Return statement
  return capitals_by_city
}


/**
 * Retrieves active cities interpolated at a specific historical year.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 * @param {number} [arg1_year=1950]
 * @param {StadesterQueryOptions} [arg2_options]
 *
 * @returns {CityRenderPoint[]}
 */
export function getCitiesAtYear (
  arg0_dataset_name?: string,
  arg1_year?: number,
  arg2_options?: StadesterQueryOptions
): CityRenderPoint[] {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
  let options = (arg2_options) ? arg2_options : {}
  let target_year = arg1_year !== undefined ? arg1_year : 1950

  //Declare local instance variables
  let active_state_ids: Set<number>
  let all_city_keys: string[]
  let bugged_set: Set<string>
  let cache_key = `${dataset_name}:${target_year}:${options.month !== undefined ? options.month : 1}:${options.day !== undefined ? options.day : 1}:${options.min_pop !== undefined ? Math.max(0.01, options.min_pop) : 0.01}:${options.max_cities !== undefined ? options.max_cities : 4000}:${options.bbox ? options.bbox.join(',') : ''}:${options.color_mode || 'growth'}:${options.preserve_capitals !== false}`
  let cshapes_capitals_by_city_key = new Map<string, { color?: string; name?: string; state_id?: number | string }>()
  let indexed = loadDataset(dataset_name)
  let max_cities = options.max_cities !== undefined ? options.max_cities : 4000
  let min_pop = options.min_pop !== undefined ? Math.max(0.01, options.min_pop) : 0.01
  let result_cities: CityRenderPoint[] = []

  //Guard clauses
  if (!indexed || Object.keys(indexed).length === 0)
    return []

  if (_cache_cities_at_year.has(cache_key))
    return _cache_cities_at_year.get(cache_key)!

  //Function body
  active_state_ids = options.active_state_ids || AtlasBordersService.getActiveStateIdsAtDate(
    Math.floor(target_year),
    options.month,
    options.day
  )
  bugged_set = getBuggedCitiesSet()
  all_city_keys = Object.keys(indexed)

  //Pre-resolve authoritative border capitals by coordinate proximity across all eras
  cshapes_capitals_by_city_key = getAuthoritativeCapitalsAtYear(
    dataset_name,
    target_year,
    options.month,
    options.day,
    options.dataset || 'defacto_borders'
  )

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

    let cs_cap = cshapes_capitals_by_city_key.get(city.key)
    let cap_state = cap_rec?.state_id ? getStateById(cap_rec.state_id) : null
    let is_capital_val = Boolean(cs_cap || (cap_rec && cap_state))

    //Protect active capitals from population threshold culling
    if (!is_capital_val && pop < min_pop)
      continue

    let cap_color_val = (cs_cap?.color && cs_cap.color !== '#FFDC00')
      ? cs_cap.color
      : (cap_state?.fill_color || cs_cap?.color || null)
    let cap_state_id = cs_cap?.state_id || cap_rec?.state_id || undefined
    let polity_name = cs_cap?.name || cap_state?.name || undefined

    //Resolve conflicting capital polities in favour of larger country / country-matching polity
    if (cs_cap && cap_state && String(cs_cap.state_id) !== String(cap_rec?.state_id)) {
      let city_country = (city.country || '').toLowerCase().trim()
      let cs_name = (cs_cap.name || '').toLowerCase().trim()
      let cs_state = cs_cap.state_id !== undefined ? getStateById(cs_cap.state_id) : null
      let cs_bbox_area = cs_state?.bbox ? Math.max(0, (cs_state.bbox[2] - cs_state.bbox[0])*(cs_state.bbox[3] - cs_state.bbox[1])) : 0
      let cs_matches = Boolean(city_country && (cs_name.includes(city_country) || city_country.includes(cs_name)))
      let state_name = (cap_state.name || '').toLowerCase().trim()
      let state_bbox_area = cap_state.bbox ? Math.max(0, (cap_state.bbox[2] - cap_state.bbox[0])*(cap_state.bbox[3] - cap_state.bbox[1])) : 0
      let state_matches = Boolean(city_country && (state_name.includes(city_country) || city_country.includes(state_name)))

      if (state_matches && !cs_matches) {
        cap_color_val = cap_state.fill_color || cap_color_val
        cap_state_id = cap_rec?.state_id ?? undefined
        polity_name = cap_state.name
      } else if (!state_matches && cs_matches) {
        cap_color_val = (cs_cap.color && cs_cap.color !== '#FFDC00') ? cs_cap.color : (cs_state?.fill_color || cap_color_val)
        cap_state_id = cs_cap.state_id
        polity_name = cs_cap.name
      } else if (state_bbox_area > cs_bbox_area) {
        cap_color_val = cap_state.fill_color || cap_color_val
        cap_state_id = cap_rec?.state_id ?? undefined
        polity_name = cap_state.name
      } else {
        cap_color_val = (cs_cap.color && cs_cap.color !== '#FFDC00') ? cs_cap.color : (cs_state?.fill_color || cap_color_val)
        cap_state_id = cs_cap.state_id
        polity_name = cs_cap.name
      }
    }
    let resolved_date = (options.month !== undefined || options.day !== undefined)
      ? `${Math.floor(target_year)}.${options.month || 1}.${options.day || 1}`
      : target_year
    let resolved_name = resolveCityNameAtYear(city, resolved_date)

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

  //Apply max_cities limit, but ensure active capitals are always preserved (unless preserve_capitals is false)
  if (max_cities > 0 && max_cities < result_cities.length) {
    if (options.preserve_capitals !== false) {
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
    } else {
      result_cities = result_cities.slice(0, max_cities)
    }
  }

  if (_cache_cities_at_year.size >= 100) {
    let oldest_key = _cache_cities_at_year.keys().next().value
    if (oldest_key !== undefined)
      _cache_cities_at_year.delete(oldest_key)
  }
  _cache_cities_at_year.set(cache_key, result_cities)

  //Return statement
  return result_cities
}


/**
 * Returns top N largest cities at a specific year for chart visualisations.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 * @param {number} [arg1_year=1950]
 * @param {number} [arg2_limit=20]
 *
 * @returns {CityRenderPoint[]}
 */
export function getLargestCitiesAtYear (
  arg0_dataset_name?: string,
  arg1_year?: number,
  arg2_limit?: number
): CityRenderPoint[] {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
  let limit = arg2_limit !== undefined ? arg2_limit : 20
  let year = arg1_year !== undefined ? arg1_year : 1950

  //Declare local instance variables
  let raw_cities: CityRenderPoint[]

  //Function body
  raw_cities = getCitiesAtYear(dataset_name, year, {
    max_cities: limit,
    min_pop: 0.01,
    preserve_capitals: false,
  })
  raw_cities.sort((arg0_a, arg0_b) => arg0_b.population - arg0_a.population)
  raw_cities = raw_cities.slice(0, limit)

  for (let i = 0; i < raw_cities.length; i++) {
    raw_cities[i].name = getPrimaryCityName(raw_cities[i].name, raw_cities[i].population)
  }

  //Return statement
  return raw_cities
}


/**
 * Returns compact columnar arrays for fast transfer and minimal JSON serialization overhead.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 * @param {number} [arg1_year=1950]
 * @param {StadesterQueryOptions} [arg2_options]
 *
 * @returns {CompactCitiesPayload}
 */
export function getCompactCitiesAtYear (
  arg0_dataset_name?: string,
  arg1_year?: number,
  arg2_options?: StadesterQueryOptions
): CompactCitiesPayload {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
  let options = (arg2_options) ? arg2_options : {}
  let year = arg1_year !== undefined ? arg1_year : 1950

  //Declare local instance variables
  let cache_key = `${dataset_name}:${year}:${options.month !== undefined ? options.month : 1}:${options.day !== undefined ? options.day : 1}:${options.min_pop !== undefined ? Math.max(0.01, options.min_pop) : 0.01}:${options.max_cities !== undefined ? options.max_cities : 4000}:${options.bbox ? options.bbox.join(',') : ''}:${options.color_mode || 'growth'}`
  let capital_colors: (string | null)[]
  let capital_names: (string | null)[]
  let capital_state_ids: (number | null)[]
  let capitals: number[]
  let cities: CityRenderPoint[]
  let coords: number[]
  let countries: (string | undefined)[]
  let growth: number[]
  let keys: string[]
  let len: number
  let names: string[]
  let payload: CompactCitiesPayload
  let pops: number[]
  let regions: (string | undefined)[]

  //Guard clauses
  if (_cache_compact_cities.has(cache_key))
    return _cache_compact_cities.get(cache_key)!

  //Function body
  cities = getCitiesAtYear(dataset_name, year, options)
  len = cities.length
  capital_colors = new Array(len)
  capital_names = new Array(len)
  capital_state_ids = new Array(len)
  capitals = new Array(len)
  coords = new Array(len * 2)
  countries = new Array(len)
  growth = new Array(len)
  keys = new Array(len)
  names = new Array(len)
  pops = new Array(len)
  regions = new Array(len)

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

  payload = {
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

  if (_cache_compact_cities.size >= 100) {
    let oldest_key = _cache_compact_cities.keys().next().value
    if (oldest_key !== undefined)
      _cache_compact_cities.delete(oldest_key)
  }
  _cache_compact_cities.set(cache_key, payload)

  //Return statement
  return payload
}
