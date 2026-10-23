import { normalizeCityKey } from '@framework/stadester/city_metadata_framework.ts'

/**
 * Returns the short display label for a city by extracting the first word prior to semicolons or commas.
 *
 * @param {string} arg0_name
 *
 * @returns {string}
 */
export function getShortCityLabel (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return ''

  //Function body
  let before_semi = name.split(';')[0].trim()
  let first_word = before_semi.split(/[\s,]+/)[0].trim()

  //Return statement
  return first_word || before_semi
}


/**
 * Reconciles a city's capital status against authoritative active historical borders features.
 * Historical borders (state_capitals.json via AtlasBordersService) are the single source of truth.
 *
 * @param {any} arg0_city - City point object
 * @param {Map<string, any>} arg1_capitals_by_key - Authoritative active capitals indexed by key
 * @param {Map<string, any>} arg2_capitals_by_name - Authoritative active capitals indexed by name
 * @param {Set<string>} arg3_acapital_state_ids - State IDs explicitly marked as acapital
 * @param {Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>} arg4_state_capitals_by_sid - Active state capitals by state ID
 * @param {Set<string>} [arg5_active_state_ids] - State IDs active in current historical borders
 * @param {Set<string>} [arg6_active_polity_names] - Polity names active in current historical borders
 * @param {Map<string, any>} [arg7_authoritative_capitals_by_city] - Pre-matched authoritative capitals by city key/id
 * @param {Array<any>} [arg8_active_capitals_list] - Authoritative active capitals list with coordinates
 *
 * @returns {any} Reconciled city object
 */
export function reconcileCapitalWithAuthoritativeBorders (
  arg0_city: any,
  arg1_capitals_by_key: Map<string, any>,
  arg2_capitals_by_name: Map<string, any>,
  arg3_acapital_state_ids: Set<string>,
  arg4_state_capitals_by_sid: Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>,
  arg5_active_state_ids?: Set<string>,
  arg6_active_polity_names?: Set<string>,
  arg7_authoritative_capitals_by_city?: Map<string, any>,
  arg8_active_capitals_list?: Array<any>
): any {
  //Convert from parameters
  let acapital_state_ids = arg3_acapital_state_ids
  let active_capitals_list = arg8_active_capitals_list
  let active_polity_names = arg6_active_polity_names
  let active_state_ids = arg5_active_state_ids
  let authoritative_capitals_by_city = arg7_authoritative_capitals_by_city
  let capitals_by_key = arg1_capitals_by_key
  let capitals_by_name = arg2_capitals_by_name
  let city = arg0_city
  let state_capitals_by_sid = arg4_state_capitals_by_sid

  //Guard clauses
  if (!city)
    return city

  //Declare local instance variables
  let active_cap: { cap_coords?: [number, number]; capkey?: string; capname?: string } | undefined
  let best_cap: any = null
  let best_dist: number = 999
  let c_id = city.id ? String(city.id) : undefined
  let c_key = city.key ? String(city.key) : undefined
  let c_lat = city.rawCoords ? city.rawCoords[1] : (city.lat !== undefined ? city.lat : (city.coords ? city.coords[0] : undefined))
  let c_lon = city.rawCoords ? city.rawCoords[0] : (city.lon !== undefined ? city.lon : (city.coords ? city.coords[1] : undefined))
  let c_name = (city.name || '').toLowerCase().trim()
  let c_name_nfd = c_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let c_short = (city.shortName || getShortCityLabel(city.name || '')).toLowerCase().trim()
  let c_short_nfd = c_short.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let cand_country: string
  let cap_dist: number
  let has_polity_by_id: boolean
  let has_polity_by_name: boolean
  let is_capkey_match: boolean
  let is_direct_polity_match: boolean
  let is_same_key: boolean
  let is_same_name: boolean
  let match: any = null
  let match_capkey: string
  let match_polity: string
  let pad: number = 3.5
  let polity_name_lower: string
  let resolved_color: any
  let sid_str = city.capitalStateId !== undefined ? String(city.capitalStateId) : (city.capital_state_id !== undefined ? String(city.capital_state_id) : undefined)

  //Function body
  //0. Match by pre-computed authoritative capital
  if (authoritative_capitals_by_city) {
    if (c_key && authoritative_capitals_by_city.has(c_key)) {
      match = authoritative_capitals_by_city.get(c_key)
    } else if (c_id && authoritative_capitals_by_city.has(c_id)) {
      match = authoritative_capitals_by_city.get(c_id)
    }
  }

  //1. Match by authoritative capital key
  if (!match) {
    if (c_key && capitals_by_key.has(c_key)) {
      match = capitals_by_key.get(c_key)
    } else if (c_key && capitals_by_key.has(c_key.toLowerCase().trim())) {
      match = capitals_by_key.get(c_key.toLowerCase().trim())
    } else if (c_id && capitals_by_key.has(c_id)) {
      match = capitals_by_key.get(c_id)
    } else if (c_id && capitals_by_key.has(c_id.toLowerCase().trim())) {
      match = capitals_by_key.get(c_id.toLowerCase().trim())
    }
  }

  //2. Match by city name if no key match
  if (!match && c_name) {
    if (capitals_by_name.has(c_name)) {
      match = capitals_by_name.get(c_name)
    } else if (c_short && capitals_by_name.has(c_short)) {
      match = capitals_by_name.get(c_short)
    } else if (capitals_by_name.has(c_name_nfd)) {
      match = capitals_by_name.get(c_name_nfd)
    } else if (c_short_nfd && capitals_by_name.has(c_short_nfd)) {
      match = capitals_by_name.get(c_short_nfd)
    } else {
      let clean_c = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
      if (clean_c && capitals_by_name.has(clean_c)) {
        match = capitals_by_name.get(clean_c)
      }
    }
    if (!match && city.other_names && Array.isArray(city.other_names)) {
      for (let on of city.other_names) {
        let on_clean = on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let on_lower = on_clean
        let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        if (capitals_by_name.has(on_lower)) {
          match = capitals_by_name.get(on_lower)
          break
        } else if (capitals_by_name.has(on_nfd)) {
          match = capitals_by_name.get(on_nfd)
          break
        } else if (clean_on && capitals_by_name.has(clean_on)) {
          match = capitals_by_name.get(clean_on)
          break
        }
      }
    }
  }

  //3. If candidate match found, verify spatial plausibility against match.cap_coords, match.bbox and country compatibility
  if (match && match.cap_coords && c_lon !== undefined && c_lat !== undefined) {
    cap_dist = Math.hypot(c_lon - match.cap_coords[0], c_lat - match.cap_coords[1])
    if (cap_dist > 0.25) {
      match = null
    }
  }

  if (match && match.bbox && c_lon !== undefined && c_lat !== undefined) {
    if (
      c_lon < match.bbox[0] - pad ||
      c_lon > match.bbox[2] + pad ||
      c_lat < match.bbox[1] - pad ||
      c_lat > match.bbox[3] + pad
    ) {
      match = null
    }
  }

  if (match) {
    cand_country = (city.country || '').toLowerCase().trim()
    match_polity = (match.polity_name || '').toLowerCase().trim()
    match_capkey = (match.capkey || '').toLowerCase().trim()
    if (cand_country && match_polity) {
      is_direct_polity_match = cand_country === match_polity || match_polity.includes(cand_country) || cand_country.includes(match_polity)
      is_capkey_match = Boolean(match_capkey && match_capkey.includes(cand_country))
      if (!is_direct_polity_match && !is_capkey_match) {
        let current_cap_of = (city.capitalOf || city.capital_state_name || '').toLowerCase().trim()
        if (current_cap_of && (current_cap_of === cand_country || current_cap_of.includes(cand_country) || cand_country.includes(current_cap_of))) {
          match = null
        } else {
          cap_dist = (match.cap_coords && c_lon !== undefined && c_lat !== undefined)
            ? Math.hypot(c_lon - match.cap_coords[0], c_lat - match.cap_coords[1])
            : 999
          if (cap_dist > 0.5)
            match = null
        }
      }
    }
  }

  //4. If matched with authoritative capital, ensure isCapital is true with enriched metadata
  if (match) {
    resolved_color = (match.color && match.color !== '#FFDC00')
      ? match.color
      : (city.capitalColor || city.capital_color || match.color || '#FFDC00')
    return {
      ...city,
      capitalColor: resolved_color,
      capital_color: resolved_color,
      capitalOf: match.polity_name || city.capitalOf || city.capital_state_name,
      capitalStateId: match.state_id !== undefined ? match.state_id : city.capitalStateId,
      capital_state_id: match.state_id !== undefined ? match.state_id : city.capital_state_id,
      capital_state_name: match.polity_name || city.capital_state_name || city.capitalOf,
      isCapital: true,
      is_capital: true,
    }
  }

  //5. If city claims isCapital but its polity no longer exists or has another authoritative capital:
  if (city.isCapital || city.is_capital) {
    //Verify that the claimed polity exists at this point in time
    if (active_state_ids && active_state_ids.size > 0) {
      polity_name_lower = (city.capitalOf || city.capital_state_name || '').toLowerCase().trim()
      has_polity_by_id = Boolean(sid_str && active_state_ids.has(sid_str))
      has_polity_by_name = Boolean(polity_name_lower && active_polity_names && active_polity_names.has(polity_name_lower))

      if (!has_polity_by_id && !has_polity_by_name) {
        return {
          ...city,
          capitalColor: undefined,
          capital_color: undefined,
          capitalOf: undefined,
          capitalStateId: undefined,
          capital_state_id: undefined,
          capital_state_name: undefined,
          isCapital: false,
          is_capital: false,
        }
      }
    }

    if (sid_str) {
      if (acapital_state_ids.has(sid_str)) {
        return {
          ...city,
          capitalColor: undefined,
          capital_color: undefined,
          capitalOf: undefined,
          capitalStateId: undefined,
          capital_state_id: undefined,
          capital_state_name: undefined,
          isCapital: false,
          is_capital: false,
        }
      }

      active_cap = state_capitals_by_sid.get(sid_str)
      if (active_cap && (active_cap.capkey || active_cap.capname || active_cap.cap_coords)) {
        let is_same_coord = false
        if (active_cap.cap_coords && (c_lon !== undefined && c_lat !== undefined)) {
          is_same_coord = Math.hypot(c_lon - active_cap.cap_coords[0], c_lat - active_cap.cap_coords[1]) <= 0.03
        }
        let clean_active_key = normalizeCityKey(active_cap.capkey || '')
        let clean_city_key = normalizeCityKey(city.key || '')
        is_same_key = Boolean(
          (active_cap.capkey && (city.key === active_cap.capkey || String(city.id) === active_cap.capkey)) ||
          (clean_active_key && clean_city_key && clean_active_key === clean_city_key)
        )
        let clean_active_name = (active_cap.capname || '').toLowerCase().trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
        let clean_c_name = c_name.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
        is_same_name = Boolean(
          clean_active_name &&
          (clean_c_name === clean_active_name ||
           clean_c_name.startsWith(clean_active_name) ||
           clean_active_name.startsWith(clean_c_name))
        )

        if (!is_same_key && !is_same_name && !is_same_coord) {
          return {
            ...city,
            capitalColor: undefined,
            capital_color: undefined,
            capitalOf: undefined,
            capitalStateId: undefined,
            capital_state_id: undefined,
            capital_state_name: undefined,
            isCapital: false,
            is_capital: false,
          }
        }
      }
    }
  }

  //Return statement
  return city
}


/**
 * Reconciles a collection of cities against authoritative active historical borders features.
 * Guarantees that for each designated capital point, only the single city spatially closest
 * to that capital point is designated as capital, and all secondary cities within proximity have
 * their capital status explicitly cleared.
 *
 * @param {any[]} arg0_cities - City points/labels array
 * @param {Map<string, any>} arg1_capitals_by_key - Authoritative active capitals indexed by key
 * @param {Map<string, any>} arg2_capitals_by_name - Authoritative active capitals indexed by name
 * @param {Set<string>} arg3_acapital_state_ids - State IDs explicitly marked as acapital
 * @param {Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>} arg4_state_capitals_by_sid - Active state capitals by state ID
 * @param {Set<string>} [arg5_active_state_ids] - State IDs active in current historical borders
 * @param {Set<string>} [arg6_active_polity_names] - Polity names active in current historical borders
 * @param {Map<string, any>} [arg7_authoritative_capitals_by_city] - Pre-matched authoritative capitals by city key/id
 * @param {Array<any>} [arg8_active_capitals_list] - Authoritative active capitals list with coordinates
 *
 * @returns {any[]} Reconciled cities array
 */
export function reconcileCitiesWithAuthoritativeBorders (
  arg0_cities: any[],
  arg1_capitals_by_key: Map<string, any>,
  arg2_capitals_by_name: Map<string, any>,
  arg3_acapital_state_ids: Set<string>,
  arg4_state_capitals_by_sid: Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>,
  arg5_active_state_ids?: Set<string>,
  arg6_active_polity_names?: Set<string>,
  arg7_authoritative_capitals_by_city?: Map<string, any>,
  arg8_active_capitals_list?: Array<any>
): any[] {
  //Convert from parameters
  let acapital_state_ids = arg3_acapital_state_ids
  let active_capitals_list = arg8_active_capitals_list
  let active_polity_names = arg6_active_polity_names
  let active_state_ids = arg5_active_state_ids
  let authoritative_capitals_by_city = arg7_authoritative_capitals_by_city
  let capitals_by_key = arg1_capitals_by_key
  let capitals_by_name = arg2_capitals_by_name
  let cities = arg0_cities
  let state_capitals_by_sid = arg4_state_capitals_by_sid

  //Guard clauses
  if (!cities || cities.length === 0)
    return cities || []

  //Declare local instance variables
  let assigned_capital_indices = new Set<number>()
  let proximity_radius: number = 0.35
  let reconciled: any[] = []
  let suppressed_capital_indices = new Set<number>()

  //Function body
  //1. First pass: run baseline authoritative reconciliation on each individual city
  for (let i = 0; i < cities.length; i++) {
    let c = cities[i]
    let r = reconcileCapitalWithAuthoritativeBorders(
      c,
      capitals_by_key,
      capitals_by_name,
      acapital_state_ids,
      state_capitals_by_sid,
      active_state_ids,
      active_polity_names,
      authoritative_capitals_by_city,
      active_capitals_list
    )
    reconciled.push(r)
  }

  //2. Spatial resolution: for each designated capital point, assign only the single closest city
  if (active_capitals_list && active_capitals_list.length > 0) {
    for (let i = 0; i < active_capitals_list.length; i++) {
      let cap = active_capitals_list[i]
      if (!cap || !cap.cap_coords)
        continue

      let cap_coords = cap.cap_coords
      let cap_lat = cap_coords[1]
      let cap_lon = cap_coords[0]
      let closest_dist: number = Infinity
      let closest_index: number = -1
      let nearby_indices: number[] = []

      for (let x = 0; x < reconciled.length; x++) {
        let city = reconciled[x]
        let c_lat = city.rawCoords ? city.rawCoords[1] : (city.lat !== undefined ? city.lat : (city.coords ? city.coords[0] : (city.position ? city.position[1] : undefined)))
        let c_lon = city.rawCoords ? city.rawCoords[0] : (city.lon !== undefined ? city.lon : (city.coords ? city.coords[1] : (city.position ? city.position[0] : undefined)))
        if (c_lat === undefined || c_lon === undefined)
          continue

        let dist = Math.hypot(c_lon - cap_lon, c_lat - cap_lat)
        if (dist <= proximity_radius) {
          nearby_indices.push(x)
          if (dist < closest_dist) {
            closest_dist = dist
            closest_index = x
          }
        }
      }

      if (closest_index !== -1) {
        let resolved_color = (cap.color && cap.color !== '#FFDC00') ? cap.color : '#FFDC00'
        let target_city = reconciled[closest_index]
        reconciled[closest_index] = {
          ...target_city,
          capitalColor: resolved_color,
          capitalOf: cap.polity_name || target_city.capitalOf,
          capitalStateId: cap.state_id !== undefined ? cap.state_id : target_city.capitalStateId,
          capital_color: resolved_color,
          capital_state_id: cap.state_id !== undefined ? cap.state_id : target_city.capital_state_id,
          capital_state_name: cap.polity_name || target_city.capital_state_name,
          isCapital: true,
          is_capital: true,
        }
        assigned_capital_indices.add(closest_index)

        //Suppress all other nearby secondary cities within proximity of this designated capital
        for (let y = 0; y < nearby_indices.length; y++) {
          let idx = nearby_indices[y]
          if (idx !== closest_index)
            suppressed_capital_indices.add(idx)
        }
      }
    }
  }

  //3. Clustering suppression: ensure no multiple capitals within proximity radius of each other
  for (let i = 0; i < reconciled.length; i++) {
    let c1 = reconciled[i]
    if (!c1.isCapital && !c1.is_capital)
      continue
    if (suppressed_capital_indices.has(i))
      continue

    let c1_lat = c1.rawCoords ? c1.rawCoords[1] : (c1.lat !== undefined ? c1.lat : (c1.coords ? c1.coords[0] : (c1.position ? c1.position[1] : undefined)))
    let c1_lon = c1.rawCoords ? c1.rawCoords[0] : (c1.lon !== undefined ? c1.lon : (c1.coords ? c1.coords[1] : (c1.position ? c1.position[0] : undefined)))
    if (c1_lat === undefined || c1_lon === undefined)
      continue

    for (let j = i + 1; j < reconciled.length; j++) {
      let c2 = reconciled[j]
      if (!c2.isCapital && !c2.is_capital)
        continue
      if (suppressed_capital_indices.has(j))
        continue

      let c2_lat = c2.rawCoords ? c2.rawCoords[1] : (c2.lat !== undefined ? c2.lat : (c2.coords ? c2.coords[0] : (c2.position ? c2.position[1] : undefined)))
      let c2_lon = c2.rawCoords ? c2.rawCoords[0] : (c2.lon !== undefined ? c2.lon : (c2.coords ? c2.coords[1] : (c2.position ? c2.position[0] : undefined)))
      if (c2_lat === undefined || c2_lon === undefined)
        continue

      let d = Math.hypot(c1_lon - c2_lon, c1_lat - c2_lat)
      if (d <= proximity_radius) {
        //If one is assigned by explicit designated capital point, suppress the other
        if (assigned_capital_indices.has(i) && !assigned_capital_indices.has(j)) {
          suppressed_capital_indices.add(j)
        } else if (!assigned_capital_indices.has(i) && assigned_capital_indices.has(j)) {
          suppressed_capital_indices.add(i)
        } else {
          //Otherwise suppress the one with smaller population
          let pop1 = typeof c1.population === 'number' ? c1.population : 0
          let pop2 = typeof c2.population === 'number' ? c2.population : 0
          if (pop1 >= pop2) {
            suppressed_capital_indices.add(j)
          } else {
            suppressed_capital_indices.add(i)
          }
        }
      }
    }
  }

  //4. Strip capital status from all suppressed secondary cities
  for (let idx of suppressed_capital_indices) {
    if (assigned_capital_indices.has(idx))
      continue

    let city = reconciled[idx]
    if (city && (city.isCapital || city.is_capital)) {
      reconciled[idx] = {
        ...city,
        capitalColor: undefined,
        capitalOf: undefined,
        capitalStateId: undefined,
        capital_color: undefined,
        capital_state_id: undefined,
        capital_state_name: undefined,
        isCapital: false,
        is_capital: false,
      }
    }
  }

  //Return statement
  return reconciled
}
