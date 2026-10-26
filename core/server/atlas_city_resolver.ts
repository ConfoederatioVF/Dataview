import fs from 'fs'
import path from 'path'

export interface CityCoordRecord {
  coords: [number, number]
  country?: string
  key: string
  name: string
  other_names?: string[]
}

export interface StateCapitalInfo {
  cap_coords?: [number, number]
  capkey?: string
  capname?: string
  fill_color?: string
  is_acapital: boolean
  state_id?: number
}

let capital_info_cache: Map<string, StateCapitalInfo> = new Map()
let city_coords_by_key: Map<string, CityCoordRecord> = new Map()
let city_coords_by_norm_name: Map<string, CityCoordRecord[]> = new Map()
let city_coords_loaded = false
let city_coords_spatial_grid: Map<string, CityCoordRecord[]> = new Map()
let city_name_coords_cache: Map<string, { coords?: [number, number]; key?: string } | null> = new Map()
let contemp_city_cache: Map<string, { coords?: [number, number]; key: string }> = new Map()
let state_capitals_data: Record<number, { acapital: boolean; fill?: string; timeline?: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }> }> | null = null
let state_capitals_mtime = 0
let states_by_clean_name: Map<string, Array<{ start_year: number; state_id: number; stop_year: number }>> = new Map()
let states_name_map: Map<string, Array<{ start_year: number; state_id: number; stop_year: number }>> | null = null

/**
 * Loads and indexes all city coordinates from data/stadester/all_cities_coords.json.
 *
 * @returns {void}
 */
export let ensureCityCoordsLoaded = function (): void {
  //Guard clauses
  if (city_coords_loaded)
    return

  city_coords_loaded = true

  //Declare local instance variables
  let coords_path = path.resolve(process.cwd(), 'data/stadester/all_cities_coords.json')
  let list: any[]
  let raw: any

  //Guard clauses
  if (!fs.existsSync(coords_path))
    return

  //Function body
  try {
    raw = JSON.parse(fs.readFileSync(coords_path, 'utf-8'))
    list = Object.values(raw)

    for (let i = 0; i < list.length; i++) {
      let item = list[i]
      if (!item || !item.key || !Array.isArray(item.coords) || item.coords.length < 2)
        continue

      let rec: CityCoordRecord = {
        coords: [item.coords[0], item.coords[1]],
        country: item.country,
        key: item.key,
        name: item.name || '',
        other_names: item.other_names,
      }

      city_coords_by_key.set(item.key, rec)
      city_coords_by_key.set(item.key.toLowerCase().trim(), rec)

      let norm_key = item.key.replace(/^(stadester|ghsl|oxford)-/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (norm_key && !city_coords_by_key.has(norm_key))
        city_coords_by_key.set(norm_key, rec)

      let names_to_index: string[] = []
      if (item.name)
        names_to_index.push(item.name)
      if (Array.isArray(item.other_names)) {
        for (let x = 0; x < item.other_names.length; x++)
          names_to_index.push(item.other_names[x])
      }

      for (let x = 0; x < names_to_index.length; x++) {
        let n_str = names_to_index[x]
        let n_clean = n_str.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let n_norm = n_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
        let n_strip = n_norm.replace(/^(al|ar|ash|az|an|at|ad|el|er)/, '').replace(/h$/, '')

        let add_name = function (arg0_key: string) {
          if (!arg0_key)
            return
          let arr = city_coords_by_norm_name.get(arg0_key)
          if (!arr) {
            arr = []
            city_coords_by_norm_name.set(arg0_key, arr)
          }
          if (!arr.includes(rec))
            arr.push(rec)
        }

        add_name(n_clean)
        add_name(n_norm)
        add_name(n_strip)
      }

      let cell_x = Math.floor(rec.coords[0])
      let cell_y = Math.floor(rec.coords[1])
      let cell_key = `${cell_x}_${cell_y}`
      let cell_bucket = city_coords_spatial_grid.get(cell_key)
      if (!cell_bucket) {
        cell_bucket = []
        city_coords_spatial_grid.set(cell_key, cell_bucket)
      }
      cell_bucket.push(rec)
    }

    if (!city_coords_by_key.has('stadester-Macau-Macao')) {
      let macau_rec: CityCoordRecord = {
        coords: [113.5439, 22.1987],
        country: 'Macao',
        key: 'stadester-Macau-Macao',
        name: 'Macau',
        other_names: ['Macao', 'Aomen'],
      }
      city_coords_by_key.set('stadester-Macau-Macao', macau_rec)
      city_coords_by_key.set('stadester-macau-macao', macau_rec)
      city_coords_by_key.set('stadester-Macau-Macau', macau_rec)
      city_coords_by_key.set('macaumacao', macau_rec)

      let m_bucket = city_coords_spatial_grid.get('113_22')
      if (!m_bucket) {
        m_bucket = []
        city_coords_spatial_grid.set('113_22', m_bucket)
      }
      m_bucket.push(macau_rec)
    }

    if (!city_coords_by_key.has('stadester-Vaduz-Liechtenstein')) {
      let vaduz_rec: CityCoordRecord = {
        coords: [9.521, 47.141],
        country: 'Liechtenstein',
        key: 'stadester-Vaduz-Liechtenstein',
        name: 'Vaduz',
        other_names: ['Vaduz'],
      }
      city_coords_by_key.set('stadester-Vaduz-Liechtenstein', vaduz_rec)
      city_coords_by_key.set('stadester-vaduz-liechtenstein', vaduz_rec)
      city_coords_by_key.set('vaduzliechtenstein', vaduz_rec)

      let v_bucket = city_coords_spatial_grid.get('9_47')
      if (!v_bucket) {
        v_bucket = []
        city_coords_spatial_grid.set('9_47', v_bucket)
      }
      v_bucket.push(vaduz_rec)
    }
  } catch (arg0_err) {
    console.error('[AtlasBordersService] Error indexing all_cities_coords.json:', arg0_err)
  }

  //Return statement
  return
}


/**
 * Retrieves coordinates for a city key.
 *
 * @param {string} arg0_key
 *
 * @returns {[number, number] | null}
 */
export let getCityCoordsByKey = function (arg0_key: string): [number, number] | null {
  //Convert from parameters
  let key = arg0_key

  //Guard clauses
  if (!key)
    return null

  //Function body
  ensureCityCoordsLoaded()

  let rec = city_coords_by_key.get(key) || city_coords_by_key.get(key.toLowerCase().trim())

  //Return statement
  return rec ? rec.coords : null
}


/**
 * Resolves contemporaneous city key and coordinates for a given key and calendar year.
 *
 * @param {string} arg0_key
 * @param {number} arg1_year
 * @param {[number, number]} [arg2_coords]
 *
 * @returns {{ coords?: [number, number]; key: string }}
 */
export let getContemporaneousCityKey = function (
  arg0_key: string,
  arg1_year: number,
  arg2_coords?: [number, number]
): { coords?: [number, number]; key: string } {
  //Convert from parameters
  let coords = arg2_coords
  let key = arg0_key
  let year = arg1_year

  //Declare local instance variables
  let best: CityCoordRecord | null = null
  let cache_k: string
  let direct_coords: [number, number] | null = null
  let direct_rec: CityCoordRecord | undefined
  let final_result: { coords?: [number, number]; key: string }
  let is_ghsl = false
  let is_stadester = false
  let item: CityCoordRecord | undefined
  let lat = 0
  let lon = 0
  let max_cell_x: number
  let max_cell_y: number
  let min_cell_x: number
  let min_cell_y: number
  let min_d = 999
  let norm_target = ''
  let ref_coords: [number, number] | null = null

  //Guard clauses
  if (!key && !coords)
    return { key: '' }

  cache_k = `${key}_${year < 1975 ? 'hist' : 'mod'}_${coords ? coords.join(',') : ''}`
  if (contemp_city_cache.has(cache_k))
    return contemp_city_cache.get(cache_k)!

  //Function body
  ensureCityCoordsLoaded()

  is_ghsl = key.startsWith('ghsl-')
  is_stadester = key.startsWith('stadester-')
  direct_rec = city_coords_by_key.get(key) || city_coords_by_key.get(key.toLowerCase().trim())
  direct_coords = coords || (direct_rec ? direct_rec.coords : null)

  if (direct_coords && ((is_ghsl && year >= 1975) || (is_stadester && year < 1975))) {
    final_result = { coords: direct_coords, key }
    contemp_city_cache.set(cache_k, final_result)
    return final_result
  }

  norm_target = key.replace(/^(stadester|ghsl|oxford)-/i, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  item = direct_rec || (norm_target ? city_coords_by_key.get(norm_target) : undefined)

  ref_coords = direct_coords || (item ? item.coords : null)
  if (!ref_coords) {
    final_result = { coords: direct_coords || undefined, key }
    contemp_city_cache.set(cache_k, final_result)
    return final_result
  }

  lon = ref_coords[0]
  lat = ref_coords[1]

  min_cell_x = Math.floor(lon - 0.25)
  max_cell_x = Math.floor(lon + 0.25)
  min_cell_y = Math.floor(lat - 0.25)
  max_cell_y = Math.floor(lat + 0.25)

  for (let i = min_cell_x; i <= max_cell_x; i++) {
    for (let x = min_cell_y; x <= max_cell_y; x++) {
      let bucket = city_coords_spatial_grid.get(`${i}_${x}`)
      if (!bucket)
        continue
      for (let y = 0; y < bucket.length; y++) {
        let c = bucket[y]
        if (year < 1975 && !c.key.startsWith('stadester-'))
          continue
        if (year >= 1975 && !c.key.startsWith('ghsl-'))
          continue
        let d = Math.hypot(c.coords[0] - lon, c.coords[1] - lat)
        if (d < 0.20 && d < min_d) {
          min_d = d
          best = c
        }
      }
    }
  }

  final_result = best
    ? { coords: best.coords, key: best.key }
    : { coords: ref_coords, key: item ? item.key : key }

  contemp_city_cache.set(cache_k, final_result)

  //Return statement
  return final_result
}


/**
 * Determines whether city coordinates fall within bounding box.
 *
 * @param {[number, number]} arg0_coords
 * @param {[number, number, number, number]} arg1_bbox
 * @param {number} [arg2_pad=3.5]
 *
 * @returns {boolean}
 */
export let isCityCoordsInsideBbox = function (
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
 * Resolves city coordinates and key from city name and optional country.
 *
 * @param {string} arg0_city_name
 * @param {string} [arg1_country]
 *
 * @returns {{ coords?: [number, number]; key?: string } | null}
 */
export let findCityCoordsByName = function (
  arg0_city_name: string,
  arg1_country?: string
): { coords?: [number, number]; key?: string } | null {
  //Convert from parameters
  let city_name = arg0_city_name
  let country = arg1_country

  //Declare local instance variables
  let best_match: CityCoordRecord | null = null
  let best_score = -1
  let c_clean: string
  let c_lower: string
  let c_norm: string
  let cache_k: string
  let candidate_set = new Set<CityCoordRecord>()
  let clean_matches: CityCoordRecord[] | undefined
  let country_lower: string
  let key_match: CityCoordRecord | undefined
  let lower_matches: CityCoordRecord[] | undefined
  let norm_matches: CityCoordRecord[] | undefined
  let result: { coords?: [number, number]; key?: string } | null = null

  //Guard clauses
  if (!city_name)
    return null

  cache_k = `${city_name}|${country || ''}`
  if (city_name_coords_cache.has(cache_k))
    return city_name_coords_cache.get(cache_k)!

  //Function body
  ensureCityCoordsLoaded()

  c_lower = city_name.toLowerCase().trim()
  c_norm = c_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
  c_clean = c_norm.replace(/^(al|ar|ash|az|an|at|ad|el|er)/, '').replace(/h$/, '')
  country_lower = country ? country.toLowerCase().trim() : ''

  if (!c_norm) {
    city_name_coords_cache.set(cache_k, null)
    return null
  }

  key_match = city_coords_by_key.get(city_name) || city_coords_by_key.get(c_lower)
  if (key_match)
    candidate_set.add(key_match)

  norm_matches = city_coords_by_norm_name.get(c_norm)
  if (norm_matches) {
    for (let i = 0; i < norm_matches.length; i++)
      candidate_set.add(norm_matches[i])
  }

  clean_matches = city_coords_by_norm_name.get(c_clean)
  if (clean_matches) {
    for (let i = 0; i < clean_matches.length; i++)
      candidate_set.add(clean_matches[i])
  }

  lower_matches = city_coords_by_norm_name.get(c_lower)
  if (lower_matches) {
    for (let i = 0; i < lower_matches.length; i++)
      candidate_set.add(lower_matches[i])
  }

  let all_candidates = Array.from(candidate_set)
  for (let i = 0; i < all_candidates.length; i++) {
    let item = all_candidates[i]
    let score = 0
    let i_name = (item.name || '').toLowerCase().trim()
    let i_norm = i_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
    let clean_i = i_norm.replace(/^(al|ar|ash|az|an|at|ad|el|er)/, '').replace(/h$/, '')
    let has_exact = (i_norm === c_norm || i_name === c_lower || (c_clean && c_clean === clean_i))

    if (has_exact) {
      score += 1000
    } else if (item.other_names && Array.isArray(item.other_names)) {
      if (item.other_names.some((arg0_on: string) => {
        let on_clean = arg0_on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let on_norm = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
        let clean_on = on_norm.replace(/^(al|ar|ash|az|an|at|ad|el|er)/, '').replace(/h$/, '')
        return on_clean === c_lower || on_norm === c_norm || (c_clean && c_clean === clean_on)
      })) {
        score += 850
      }
    }

    if (item.key && (item.key === city_name || item.key.toLowerCase().trim() === c_lower))
      score += 2000

    if (score === 0)
      continue

    if (country_lower && item.country) {
      let i_c = item.country.toLowerCase().trim()
      if (i_c === country_lower || country_lower.includes(i_c) || i_c.includes(country_lower))
        score += 200
    }

    if (item.key && item.key.startsWith('stadester-'))
      score += 50

    if (score > best_score) {
      best_score = score
      best_match = item
    }
  }

  result = best_match ? { coords: best_match.coords, key: best_match.key } : null
  city_name_coords_cache.set(cache_k, result)

  //Return statement
  return result
}


/**
 * Resolves the capital information for a state at a specific fractional year.
 *
 * @param {number} arg0_state_id
 * @param {number} arg1_year_frac
 * @param {string} [arg2_entity_name]
 * @param {(state_id: string | number) => any} [arg3_get_state_by_id]
 *
 * @returns {StateCapitalInfo}
 */
export let getStateCapitalInfo = function (
  arg0_state_id: number | undefined,
  arg1_year_frac: number,
  arg2_entity_name?: string,
  arg3_get_state_by_id?: (state_id: string | number) => any
): StateCapitalInfo {
  //Convert from parameters
  let entity_name = arg2_entity_name
  let get_state = arg3_get_state_by_id
  let state_id = arg0_state_id
  let year_frac = arg1_year_frac

  //Declare local instance variables
  let best_diff: number
  let best_iv: any
  let cache_k = `${state_id ?? 'none'}_${year_frac.toFixed(4)}_${entity_name || ''}`
  let candidates: Array<{ start_year: number; state_id: number; stop_year: number }>
  let clean_e: string
  let diff: number
  let effective_state_id: number | undefined
  let file_path: string
  let fill_color: string | undefined
  let info: { acapital: boolean; fill?: string; timeline?: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }> } | undefined
  let is_name_plausible: boolean = true
  let is_state_temporal_match: boolean = true
  let matched_state_id: number | undefined
  let res_info: StateCapitalInfo
  let state: any
  let state_bbox: [number, number, number, number] | undefined
  let states_path: string
  let valid_timeline: Array<{ city: string; key?: string; start: string; start_frac: number; stop: string; stop_frac: number }>

  file_path = path.resolve(process.cwd(), 'data/stadester/state_capitals.json')
  if (fs.existsSync(file_path)) {
    try {
      let stats = fs.statSync(file_path)
      if (!state_capitals_data || stats.mtimeMs > state_capitals_mtime) {
        state_capitals_mtime = stats.mtimeMs
        state_capitals_data = JSON.parse(fs.readFileSync(file_path, 'utf-8'))
        capital_info_cache.clear()
        city_name_coords_cache.clear()
      }
    } catch {
      state_capitals_data = {}
    }
  } else if (!state_capitals_data) {
    state_capitals_data = {}
  }

  //Guard clauses
  if (capital_info_cache.has(cache_k))
    return capital_info_cache.get(cache_k)!

  state = (state_id !== undefined && get_state) ? get_state(state_id) : null
  if (state && (state.start_year !== undefined || state.stop_year !== undefined)) {
    if (year_frac < (state.start_year ?? -99999) - 5 || year_frac > (state.stop_year ?? 99999) + 5)
      is_state_temporal_match = false
  }
  if (state && entity_name) {
    let s_name = (state.name || '').toLowerCase().trim()
    let e_name = entity_name.toLowerCase().trim()
    let s_base = s_name.replace(/\(.*?\)/g, '').trim()
    let e_base = e_name.replace(/\(.*?\)/g, '').trim()
    if (
      !s_name.includes(e_name) &&
      !e_name.includes(s_name) &&
      (!s_base || !e_base || (!s_base.includes(e_base) && !e_base.includes(s_base)))
    ) {
      is_name_plausible = false
    }
  }

  if (state_id !== undefined && is_state_temporal_match && is_name_plausible) {
    info = state_capitals_data ? state_capitals_data[state_id] : undefined
  }

  //Fallback to match by entity name if state_id has no direct capital record or belongs to another polity
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

              let base_s = s_name.replace(/\(.*?\)/g, '').trim()
              if (!states_by_clean_name.has(base_s))
                states_by_clean_name.set(base_s, [])
              states_by_clean_name.get(base_s)!.push({
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

    let direct_matches = states_by_clean_name.get(clean_e)
    if (direct_matches) {
      for (let i = 0; i < direct_matches.length; i++) {
        if (year_frac >= direct_matches[i].start_year && year_frac <= direct_matches[i].stop_year)
          candidates.push(direct_matches[i])
      }
    }

    let has_capital_candidate = candidates.some((c) => {
      let info_c = state_capitals_data ? state_capitals_data[c.state_id] : undefined
      return info_c && !info_c.acapital && info_c.timeline && info_c.timeline.length > 0
    })

    if (!has_capital_candidate && clean_e.length >= 4) {
      for (let [s_name, list] of states_name_map.entries()) {
        let base_s = s_name.replace(/\(.*?\)/g, '').trim()
        let is_match = (base_s.endsWith(' ' + clean_e) || base_s.startsWith(clean_e + ' '))
        if (is_match) {
          for (let x = 0; x < list.length; x++) {
            if (year_frac >= list[x].start_year && year_frac <= list[x].stop_year)
              candidates.push(list[x])
          }
        }
      }
    }

    if (candidates.length > 0 && state_capitals_data) {
      candidates.sort((arg0_a, arg0_b) => {
        let a_info = state_capitals_data![arg0_a.state_id]
        let a_has_tl = a_info && !a_info.acapital && a_info.timeline && a_info.timeline.length > 0 ? 1 : 0
        let b_info = state_capitals_data![arg0_b.state_id]
        let b_has_tl = b_info && !b_info.acapital && b_info.timeline && b_info.timeline.length > 0 ? 1 : 0
        if (b_has_tl !== a_has_tl)
          return b_has_tl - a_has_tl

        let a_state = get_state ? get_state(arg0_a.state_id) : null
        let b_state = get_state ? get_state(arg0_b.state_id) : null
        let a_is_occ = (a_state?.name || '').toLowerCase().includes('occupation') ? 1 : 0
        let b_is_occ = (b_state?.name || '').toLowerCase().includes('occupation') ? 1 : 0
        return a_is_occ - b_is_occ
      })

      for (let k = 0; k < candidates.length; k++) {
        let candidate_info = state_capitals_data[candidates[k].state_id]
        if (candidate_info && (!candidate_info.acapital || !info)) {
          info = candidate_info
          matched_state_id = candidates[k].state_id
          if (!candidate_info.acapital)
            break
        }
      }
    }
  }

  effective_state_id = matched_state_id || state_id
  state = (effective_state_id !== undefined && get_state) ? get_state(effective_state_id) : null
  fill_color = state?.fill_color || (info as any)?.fill

  if (!info) {
    res_info = { fill_color: state?.fill_color, is_acapital: false, state_id: effective_state_id }
    capital_info_cache.set(cache_k, res_info)
    return res_info
  }

  if (info.acapital) {
    res_info = { fill_color: fill_color, is_acapital: true, state_id: effective_state_id }
    capital_info_cache.set(cache_k, res_info)
    return res_info
  }

  if (info.timeline && info.timeline.length > 0) {
    state_bbox = state?.bbox

    valid_timeline = []
    for (let i = 0; i < info.timeline.length; i++) {
      let iv = info.timeline[i]
      if (state_bbox) {
        let c_coords = iv.key ? getCityCoordsByKey(iv.key) : undefined
        if (!c_coords && iv.city) {
          let by_name = findCityCoordsByName(iv.city, state?.country || state?.name)
          if (by_name?.coords)
            c_coords = by_name.coords
        }
        if (c_coords && !isCityCoordsInsideBbox(c_coords, state_bbox, 3.5))
          continue
      }
      valid_timeline.push(iv)
    }

    if (valid_timeline.length === 0) {
      res_info = { fill_color: fill_color, is_acapital: false, state_id: effective_state_id }
      capital_info_cache.set(cache_k, res_info)
      return res_info
    }

    for (let i = 0; i < valid_timeline.length; i++) {
      let iv = valid_timeline[i]
      if (year_frac >= iv.start_frac && year_frac <= iv.stop_frac) {
        let contemp: { coords?: [number, number]; key?: string } = iv.key ? getContemporaneousCityKey(iv.key, year_frac) : { coords: undefined, key: iv.key }
        let c_coords = contemp.coords || (iv.key ? getCityCoordsByKey(iv.key) : undefined)
        if (!c_coords && iv.city) {
          let by_name = findCityCoordsByName(iv.city, state?.country || state?.name)
          if (by_name?.coords) {
            c_coords = by_name.coords
            if (!contemp.key)
              contemp.key = by_name.key
          }
        }
        res_info = { cap_coords: c_coords ? [c_coords[0], c_coords[1]] : undefined, capkey: contemp.key, capname: iv.city, fill_color: fill_color, is_acapital: false, state_id: effective_state_id }
        capital_info_cache.set(cache_k, res_info)
        return res_info
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
    if (year_frac < best_iv.start_frac - 2 || year_frac > best_iv.stop_frac + 2) {
      res_info = { fill_color: fill_color, is_acapital: true, state_id: effective_state_id }
      capital_info_cache.set(cache_k, res_info)
      return res_info
    }

    let contemp_best: { coords?: [number, number]; key?: string } = best_iv.key ? getContemporaneousCityKey(best_iv.key, year_frac) : { coords: undefined, key: best_iv.key }
    let best_coords = contemp_best.coords || (best_iv.key ? getCityCoordsByKey(best_iv.key) : undefined)
    if (!best_coords && best_iv.city) {
      let by_name = findCityCoordsByName(best_iv.city, state?.country || state?.name)
      if (by_name?.coords) {
        best_coords = by_name.coords
        if (!contemp_best.key)
          contemp_best.key = by_name.key
      }
    }
    res_info = { cap_coords: best_coords ? [best_coords[0], best_coords[1]] : undefined, capkey: contemp_best.key, capname: best_iv.city, fill_color: fill_color, is_acapital: false, state_id: effective_state_id }
    capital_info_cache.set(cache_k, res_info)
    return res_info
  }

  res_info = { fill_color: fill_color, is_acapital: false, state_id: effective_state_id }
  capital_info_cache.set(cache_k, res_info)

  //Return statement
  return res_info
}


/**
 * Clears in-memory city and capital resolver caches.
 *
 * @returns {void}
 */
export let clearCityResolverCache = function (): void {
  capital_info_cache.clear()
  city_name_coords_cache.clear()
  contemp_city_cache.clear()
}
