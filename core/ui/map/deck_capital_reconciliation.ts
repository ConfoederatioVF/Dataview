import {
  normalizeCapitalNameStem,
  normalizeCityKey,
  normalizePrimaryCityKey,
} from '../../framework/stadester/city_metadata_framework.ts'
import { stripBracketedPostfixes } from '../../framework/stadester/city_name_framework.ts'

/**
 * Returns the short display label for a city by extracting the first word prior to semicolons or commas,
 * stripping any parenthetical or square-bracketed postfixes first.
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
  let before_semi = stripBracketedPostfixes(name.split(';')[0].trim())
  let first_word = before_semi.split(/[\s,]+/)[0].trim()

  //Return statement
  return first_word || before_semi
}


/**
 * Ray-casting point-in-polygon ring containment test.
 *
 * @param {number} arg0_lon
 * @param {number} arg1_lat
 * @param {number[][]} arg2_ring
 *
 * @returns {boolean}
 */
function isPointInRing (arg0_lon: number, arg1_lat: number, arg2_ring: number[][]): boolean {
  //Convert from parameters
  let lat = arg1_lat
  let lon = arg0_lon
  let ring = arg2_ring

  //Declare local instance variables
  let inside = false

  //Guard clauses
  if (!ring || ring.length < 3)
    return false

  //Function body
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0]
    let yi = ring[i][1]
    let xj = ring[j][0]
    let yj = ring[j][1]
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi)*(lat - yi))/((yj - yi) || 1e-12) + xi))
      inside = !inside
  }

  //Return statement
  return inside
}


/**
 * Checks whether a single coordinate is inside a GeoJSON Polygon or MultiPolygon geometry.
 *
 * @param {number} arg0_lon
 * @param {number} arg1_lat
 * @param {any} arg2_geometry
 *
 * @returns {boolean}
 */
function isPointInGeoJsonGeometry (arg0_lon: number, arg1_lat: number, arg2_geometry: any): boolean {
  //Convert from parameters
  let geometry = arg2_geometry
  let lat = arg1_lat
  let lon = arg0_lon

  //Guard clauses
  if (!geometry || !geometry.type || !geometry.coordinates)
    return true

  //Function body
  let checkPolygonCoords = function (arg0_rings: number[][][]): boolean {
    if (!arg0_rings || arg0_rings.length === 0 || !isPointInRing(lon, lat, arg0_rings[0]))
      return false
    for (let h = 1; h < arg0_rings.length; h++) {
      if (isPointInRing(lon, lat, arg0_rings[h]))
        return false
    }
    return true
  }

  if (geometry.type === 'Polygon') {
    return checkPolygonCoords(geometry.coordinates)
  } else if (geometry.type === 'MultiPolygon') {
    for (let p = 0; p < geometry.coordinates.length; p++) {
      if (checkPolygonCoords(geometry.coordinates[p]))
        return true
    }
    return false
  }

  //Return statement
  return true
}


/**
 * Checks whether a city coordinate lies inside (or within tight coastal grace of) a border feature's
 * GeoJSON polygon and bounding box.
 *
 * @param {number} arg0_lon
 * @param {number} arg1_lat
 * @param {number[]} [arg2_bbox]
 * @param {any} [arg3_geometry]
 * @param {number} [arg4_tol=0.35]
 *
 * @returns {boolean}
 */
export function isCityInsideBorderFeature (
  arg0_lon: number,
  arg1_lat: number,
  arg2_bbox?: number[],
  arg3_geometry?: any,
  arg4_tol: number = 0.35
): boolean {
  //Convert from parameters
  let bbox = arg2_bbox
  let geometry = arg3_geometry
  let lat = arg1_lat
  let lon = arg0_lon
  let tol = arg4_tol

  //Guard clauses
  if (!Number.isFinite(lon) || !Number.isFinite(lat))
    return false

  //Function body
  if (bbox && Array.isArray(bbox) && bbox.length >= 4) {
    let span = Math.max(Math.abs(bbox[2] - bbox[0]), Math.abs(bbox[3] - bbox[1]))
    let effective_pad = span < 1.5 ? Math.min(tol, Math.max(0.2, span*0.5)) : tol
    if (lon < bbox[0] - effective_pad || lon > bbox[2] + effective_pad || lat < bbox[1] - effective_pad || lat > bbox[3] + effective_pad)
      return false
  }

  if (geometry && geometry.coordinates) {
    if (isPointInGeoJsonGeometry(lon, lat, geometry))
      return true
    //Allow tight 0.14 deg coastal/border-simplification probe around coastline vertices
    let r = Math.min(0.14, tol)
    let offsets: Array<[number, number]> = [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [r, -r], [-r, r], [-r, -r]]
    for (let k = 0; k < offsets.length; k++) {
      if (isPointInGeoJsonGeometry(lon + offsets[k][0], lat + offsets[k][1], geometry))
        return true
    }
    return false
  }

  //Return statement
  return true
}


/**
 * Checks whether a city object matches an authoritative capital name via its display name, key prefix, or aliases.
 *
 * @param {any} arg0_city
 * @param {string} [arg1_cap_name]
 *
 * @returns {boolean}
 */
export function doesCityMatchCapitalName (arg0_city: any, arg1_cap_name?: string): boolean {
  //Convert from parameters
  let cap_name = arg1_cap_name
  let city = arg0_city

  //Guard clauses
  if (!city || !cap_name)
    return false

  //Declare local instance variables
  let cap_lower = cap_name.toLowerCase().trim()
  let cap_nfd = cap_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let cap_stem = normalizeCapitalNameStem(cap_name)
  let clean_cap = cap_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').split(';')[0].trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/\bsaint\b/g, 'st').replace(/\./g, '')
  let clean_cap_strip_h = clean_cap.replace(/h$/, '')
  let candidate_names: string[] = []

  //Function body
  if (city.name)
    candidate_names.push(String(city.name))
  if (city.shortName)
    candidate_names.push(String(city.shortName))
  if (city.key) {
    let key_base = String(city.key).replace(/^(stadester|ghsl|oxford)-/i, '').split('-')[0].replace(/\(.*?\)/g, '').trim()
    if (key_base)
      candidate_names.push(key_base)
  }
  if (Array.isArray(city.other_names)) {
    for (let i = 0; i < city.other_names.length; i++)
      candidate_names.push(String(city.other_names[i]))
  } else if (typeof city.other_names === 'string') {
    candidate_names.push(city.other_names)
  }
  if (Array.isArray(city.historical_names)) {
    for (let i = 0; i < city.historical_names.length; i++) {
      if (city.historical_names[i]?.name)
        candidate_names.push(String(city.historical_names[i].name))
    }
  }

  for (let i = 0; i < candidate_names.length; i++) {
    let raw_cand = candidate_names[i]
    let parts = raw_cand.split(';')
    for (let x = 0; x < parts.length; x++) {
      let c_lower = parts[x].toLowerCase().trim()
      if (!c_lower)
        continue
      let c_nfd = c_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      let c_stem = normalizeCapitalNameStem(parts[x])
      let clean_c = c_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/\bsaint\b/g, 'st').replace(/\./g, '')
      let clean_c_strip_h = clean_c.replace(/h$/, '')
      if (
        c_lower === cap_lower ||
        c_nfd === cap_nfd ||
        clean_c === clean_cap ||
        (cap_stem.length >= 3 && c_stem === cap_stem) ||
        (clean_c_strip_h.length >= 3 && clean_c_strip_h === clean_cap_strip_h)
      )
        return true
    }
  }

  //Return statement
  return false
}


/**
 * Indexes active border capitals against the current city point list by spatial grid, primary key, and name stem.
 *
 * @param {any[]} arg0_active_capitals_list
 * @param {any[]} arg1_effective_points
 * @param {number} [arg2_timeline_yr]
 *
 * @returns {Map<string, any>}
 */
export function buildAuthoritativeCapitalsByCity (
  arg0_active_capitals_list: any[],
  arg1_effective_points: any[],
  arg2_timeline_yr?: number
): Map<string, any> {
  //Convert from parameters
  let active_capitals_list = arg0_active_capitals_list
  let effective_points = arg1_effective_points
  let timeline_yr = arg2_timeline_yr

  //Declare local instance variables
  let authoritative_capitals_by_city = new Map<string, any>()
  let pts_grid = new Map<number, number[]>()

  //Guard clauses
  if (!active_capitals_list || active_capitals_list.length === 0 || !effective_points || effective_points.length === 0)
    return authoritative_capitals_by_city

  //Function body
  //Index city coordinates into 1-deg integer grid (all valid matches require dist <= 0.25 from cap_coords)
  for (let i = 0; i < effective_points.length; i++) {
    let c = effective_points[i]
    let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : undefined))
    let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : undefined))
    if (c_lat === undefined || c_lon === undefined)
      continue

    let cell_key = (Math.floor(c_lat) + 256)*1024 + (Math.floor(c_lon) + 512)
    let b = pts_grid.get(cell_key)
    if (!b) {
      b = []
      pts_grid.set(cell_key, b)
    }
    b.push(i)
  }

  for (let i = 0; i < active_capitals_list.length; i++) {
    let cap = active_capitals_list[i]
    if (!cap || !cap.cap_coords)
      continue
    let best_city: any = null
    let best_score = -1
    let candidate_indices: number[] = []

    let min_cx = Math.floor(cap.cap_coords[0] - 0.25)
    let max_cx = Math.floor(cap.cap_coords[0] + 0.25)
    let min_cy = Math.floor(cap.cap_coords[1] - 0.25)
    let max_cy = Math.floor(cap.cap_coords[1] + 0.25)

    for (let x = min_cx; x <= max_cx; x++) {
      for (let y = min_cy; y <= max_cy; y++) {
        let bucket = pts_grid.get((y + 256)*1024 + (x + 512))
        if (bucket) {
          for (let z = 0; z < bucket.length; z++)
            candidate_indices.push(bucket[z])
        }
      }
    }

    let all_candidates = candidate_indices
    for (let x = 0; x < all_candidates.length; x++) {
      let c = effective_points[all_candidates[x]]
      let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : undefined))
      let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : undefined))
      if (c_lat === undefined || c_lon === undefined)
        continue

      if (timeline_yr !== undefined) {
        if (c.min_year !== undefined && timeline_yr < c.min_year)
          continue
        if (c.max_year !== undefined && c.max_year < 1975 && timeline_yr > c.max_year + 25)
          continue
        if (typeof c.population === 'number' && c.population <= 0)
          continue
        if (timeline_yr < 1975 && c.key && c.key.startsWith('ghsl-'))
          continue
      }

      if (cap.cap_coords && (Math.abs(c_lon - cap.cap_coords[0]) > 0.25 || Math.abs(c_lat - cap.cap_coords[1]) > 0.25))
        continue

      let dist = cap.cap_coords ? Math.hypot(c_lon - cap.cap_coords[0], c_lat - cap.cap_coords[1]) : 999
      if (dist > 0.25)
        continue

      if (!isCityInsideBorderFeature(c_lon, c_lat, cap.bbox, cap.geometry, 0.35))
        continue

      let score = 0
      let clean_c_key = normalizeCityKey(c.key || '')
      let clean_cap_key = normalizeCityKey(cap.capkey || '')
      let prim_c_key = normalizePrimaryCityKey(c.key || '')
      let prim_cap_key = normalizePrimaryCityKey(cap.capkey || '')
      let is_key_match = Boolean(
        cap.capkey && (
          c.key === cap.capkey ||
          c.id === cap.capkey ||
          (clean_cap_key && clean_c_key && clean_cap_key === clean_c_key) ||
          (prim_cap_key && prim_c_key && prim_cap_key === prim_c_key)
        )
      )
      if (is_key_match)
        score += (c.key === cap.capkey || c.id === cap.capkey) ? 200000 : 120000

      let is_name_match = doesCityMatchCapitalName(c, cap.capname)
      let c_sid = c.capitalStateId ?? c.capital_state_id
      let is_state_match = Boolean(cap.state_id !== undefined && c_sid !== undefined && String(c_sid) === String(cap.state_id) && dist <= 0.25)
      let c_country_l = (c.country || '').toLowerCase().trim()
      let p_name_l = (cap.polity_name || '').toLowerCase().trim()
      let is_ghsl_country_coord = Boolean(
        cap.capkey?.startsWith('ghsl-') &&
        dist <= 0.12 &&
        c_country_l &&
        p_name_l &&
        (p_name_l.includes(c_country_l) || c_country_l.includes(p_name_l))
      )
      let is_exact_coord_match = dist <= 0.01 || is_ghsl_country_coord || is_state_match

      if (!is_key_match && !is_name_match && !is_exact_coord_match)
        continue

      if (is_name_match)
        score += 150000
      if (is_state_match)
        score += 40000
      if (c.isCapital || c.is_capital)
        score += 10000
      if (cap.cap_coords)
        score += Math.max(0, Math.round((0.25 - dist)*50000))
      score += Math.min(1000, Math.round((c.population || 0)/1000))

      if (score > best_score) {
        best_score = score
        best_city = c
      }
    }

    if (best_city) {
      let existing = authoritative_capitals_by_city.get(best_city.key)
      let should_set = true

      if (existing) {
        let city_country = (best_city.country || '').toLowerCase().trim()
        let exist_area = existing.area || 0
        let exist_polity = (existing.polity_name || '').toLowerCase().trim()
        let new_polity = (cap.polity_name || '').toLowerCase().trim()
        let exist_matches_country = Boolean(city_country && (exist_polity.includes(city_country) || city_country.includes(exist_polity)))
        let new_area = cap.area || 0
        let new_matches_country = Boolean(city_country && (new_polity.includes(city_country) || city_country.includes(new_polity)))

        if (exist_matches_country && !new_matches_country) {
          should_set = false
        } else if (!exist_matches_country && new_matches_country) {
          should_set = true
        } else if (exist_area > new_area) {
          should_set = false
        }
      }

      if (should_set) {
        if (best_city.key)
          authoritative_capitals_by_city.set(best_city.key, cap)
        if (best_city.id)
          authoritative_capitals_by_city.set(String(best_city.id), cap)
      }
    }
  }

  //Return statement
  return authoritative_capitals_by_city
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
 * @param {{ by_name?: Map<string, any>; by_sid?: Map<string, any> }} [arg9_polity_features] - Live polygon metadata keyed by state ID and polity name
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
  arg8_active_capitals_list?: Array<any>,
  arg9_polity_features?: { by_name?: Map<string, any>; by_sid?: Map<string, any> }
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
  let polity_features = arg9_polity_features
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
  let pad: number = 0.35
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
    let prim_key = c_key ? normalizePrimaryCityKey(c_key) : ''
    let prim_id = c_id ? normalizePrimaryCityKey(c_id) : ''
    if (c_key && capitals_by_key.has(c_key)) {
      match = capitals_by_key.get(c_key)
    } else if (c_key && capitals_by_key.has(c_key.toLowerCase().trim())) {
      match = capitals_by_key.get(c_key.toLowerCase().trim())
    } else if (prim_key && capitals_by_key.has(prim_key)) {
      match = capitals_by_key.get(prim_key)
    } else if (c_id && capitals_by_key.has(c_id)) {
      match = capitals_by_key.get(c_id)
    } else if (c_id && capitals_by_key.has(c_id.toLowerCase().trim())) {
      match = capitals_by_key.get(c_id.toLowerCase().trim())
    } else if (prim_id && capitals_by_key.has(prim_id)) {
      match = capitals_by_key.get(prim_id)
    }
  }

  //2. Match by city name if no key match
  if (!match && c_name) {
    let c_stem = normalizeCapitalNameStem(city.name || '')
    let c_short_stem = city.shortName ? normalizeCapitalNameStem(city.shortName) : ''
    if (capitals_by_name.has(c_name)) {
      match = capitals_by_name.get(c_name)
    } else if (c_short && capitals_by_name.has(c_short)) {
      match = capitals_by_name.get(c_short)
    } else if (capitals_by_name.has(c_name_nfd)) {
      match = capitals_by_name.get(c_name_nfd)
    } else if (c_short_nfd && capitals_by_name.has(c_short_nfd)) {
      match = capitals_by_name.get(c_short_nfd)
    } else if (c_stem && capitals_by_name.has(c_stem)) {
      match = capitals_by_name.get(c_stem)
    } else if (c_short_stem && capitals_by_name.has(c_short_stem)) {
      match = capitals_by_name.get(c_short_stem)
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
        let on_stem = normalizeCapitalNameStem(on)
        let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        if (capitals_by_name.has(on_lower)) {
          match = capitals_by_name.get(on_lower)
          break
        } else if (capitals_by_name.has(on_nfd)) {
          match = capitals_by_name.get(on_nfd)
          break
        } else if (on_stem && capitals_by_name.has(on_stem)) {
          match = capitals_by_name.get(on_stem)
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

  if (match && c_lon !== undefined && c_lat !== undefined && (match.bbox || match.geometry)) {
    if (!isCityInsideBorderFeature(c_lon, c_lat, match.bbox, match.geometry, pad))
      match = null
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

  //4. If matched with authoritative capital, ensure isCapital is true with enriched metadata & live polygon colour
  if (match) {
    let match_sid_str = match.state_id !== undefined ? String(match.state_id) : sid_str
    let match_polity_l = (match.polity_name || '').toLowerCase().trim()
    let live_feat = (match_sid_str ? polity_features?.by_sid?.get(match_sid_str) : undefined) ||
      (match_polity_l ? polity_features?.by_name?.get(match_polity_l) : undefined)
    resolved_color = match.color || live_feat?.color || city.capitalColor || city.capital_color || '#FFDC00'
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

  //5. If city claims isCapital: verify polity existence, containment, and inherit live polygon colour
  if (city.isCapital || city.is_capital) {
    polity_name_lower = (city.capitalOf || city.capital_state_name || '').toLowerCase().trim()
    if (active_state_ids && active_state_ids.size > 0) {
      has_polity_by_id = Boolean(sid_str && active_state_ids.has(sid_str))
      has_polity_by_name = Boolean(polity_name_lower && active_polity_names && active_polity_names.has(polity_name_lower))
      if (!has_polity_by_name && active_polity_names && city.country) {
        let country_l = String(city.country).toLowerCase().trim()
        has_polity_by_name = active_polity_names.has(country_l)
      }

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
          is_same_coord = Math.hypot(c_lon - active_cap.cap_coords[0], c_lat - active_cap.cap_coords[1]) <= 0.20
        }
        let clean_active_key = normalizeCityKey(active_cap.capkey || '')
        let clean_city_key = normalizeCityKey(city.key || '')
        let prim_active_key = normalizePrimaryCityKey(active_cap.capkey || '')
        let prim_city_key = normalizePrimaryCityKey(city.key || '')
        is_same_key = Boolean(
          (active_cap.capkey && (city.key === active_cap.capkey || String(city.id) === active_cap.capkey)) ||
          (clean_active_key && clean_city_key && clean_active_key === clean_city_key) ||
          (prim_active_key && prim_city_key && prim_active_key === prim_city_key)
        )
        is_same_name = doesCityMatchCapitalName(city, active_cap.capname)

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

    let live_feat = (sid_str ? polity_features?.by_sid?.get(sid_str) : undefined) ||
      (polity_name_lower ? polity_features?.by_name?.get(polity_name_lower) : undefined)
    if (live_feat) {
      if (c_lon !== undefined && c_lat !== undefined && (live_feat.bbox || live_feat.geometry)) {
        if (!isCityInsideBorderFeature(c_lon, c_lat, live_feat.bbox, live_feat.geometry, pad)) {
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
      if (live_feat.color && (city.capitalColor !== live_feat.color || city.capital_color !== live_feat.color)) {
        return {
          ...city,
          capitalColor: live_feat.color,
          capital_color: live_feat.color,
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
  arg8_active_capitals_list?: Array<any>,
  arg9_polity_features?: { by_name?: Map<string, any>; by_sid?: Map<string, any> }
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
  let polity_features = arg9_polity_features
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
  //0. Pre-index 1-deg cells adjacent to designated capital coordinates so distant non-capitals bypass Pass 1 regex work
  let cap_coord_cells = new Set<number>()
  let has_coordless_cap = false
  if (active_capitals_list && active_capitals_list.length > 0) {
    for (let i = 0; i < active_capitals_list.length; i++) {
      let cap = active_capitals_list[i]
      if (!cap)
        continue
      if (!cap.cap_coords) {
        has_coordless_cap = true
        continue
      }
      let min_gy = Math.floor(cap.cap_coords[1] - proximity_radius)
      let max_gy = Math.floor(cap.cap_coords[1] + proximity_radius)
      let min_gx = Math.floor(cap.cap_coords[0] - proximity_radius)
      let max_gx = Math.floor(cap.cap_coords[0] + proximity_radius)
      for (let gy = min_gy; gy <= max_gy; gy++) {
        for (let gx = min_gx; gx <= max_gx; gx++)
          cap_coord_cells.add((gy + 256)*1024 + (gx + 512))
      }
    }
  } else if (capitals_by_key.size > 0 || capitals_by_name.size > 0) {
    has_coordless_cap = true
  }

  //1. First pass: run baseline authoritative reconciliation on capitals and capital-adjacent cities only
  let rec_lats = new Float64Array(cities.length)
  let rec_lons = new Float64Array(cities.length)
  let rec_valid = new Uint8Array(cities.length)
  let reconciled_grid = new Map<number, number[]>()

  for (let i = 0; i < cities.length; i++) {
    let c = cities[i]
    let c_lat = c ? (c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : (c.position ? c.position[1] : undefined)))) : undefined
    let c_lon = c ? (c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : (c.position ? c.position[0] : undefined)))) : undefined
    let g_key = 0
    if (c_lat !== undefined && c_lon !== undefined) {
      rec_lats[i] = c_lat
      rec_lons[i] = c_lon
      rec_valid[i] = 1
      g_key = (Math.floor(c_lat) + 256)*1024 + (Math.floor(c_lon) + 512)
      let bucket = reconciled_grid.get(g_key)
      if (!bucket) {
        bucket = []
        reconciled_grid.set(g_key, bucket)
      }
      bucket.push(i)
    }

    let can_skip_pass1 = Boolean(
      c &&
      !has_coordless_cap &&
      !c.isCapital &&
      !c.is_capital &&
      rec_valid[i] === 1 &&
      !cap_coord_cells.has(g_key) &&
      !(authoritative_capitals_by_city && ((c.key && authoritative_capitals_by_city.has(c.key)) || (c.id && authoritative_capitals_by_city.has(String(c.id)))))
    )

    if (can_skip_pass1) {
      reconciled.push(c)
      continue
    }

    let r = reconcileCapitalWithAuthoritativeBorders(
      c,
      capitals_by_key,
      capitals_by_name,
      acapital_state_ids,
      state_capitals_by_sid,
      active_state_ids,
      active_polity_names,
      authoritative_capitals_by_city,
      active_capitals_list,
      polity_features
    )
    reconciled.push(r)
  }

  //2. Spatial resolution via 1-deg integer spatial grid: O(M + N) instead of O(M*N)

  if (active_capitals_list && active_capitals_list.length > 0) {
    for (let i = 0; i < active_capitals_list.length; i++) {
      let cap = active_capitals_list[i]
      if (!cap || !cap.cap_coords)
        continue

      let cap_coords = cap.cap_coords
      let cap_lat = cap_coords[1]
      let cap_lon = cap_coords[0]
      let clean_cap_key = normalizeCityKey(cap.capkey || '')
      let prim_cap_key = normalizePrimaryCityKey(cap.capkey || '')
      let closest_score: number = -1
      let closest_index: number = -1
      let nearby_indices: number[] = []

      let min_gy = Math.floor(cap_lat - proximity_radius)
      let max_gy = Math.floor(cap_lat + proximity_radius)
      let min_gx = Math.floor(cap_lon - proximity_radius)
      let max_gx = Math.floor(cap_lon + proximity_radius)

      for (let gy = min_gy; gy <= max_gy; gy++) {
        for (let gx = min_gx; gx <= max_gx; gx++) {
          let bucket = reconciled_grid.get((gy + 256)*1024 + (gx + 512))
          if (!bucket)
            continue

          for (let b = 0; b < bucket.length; b++) {
            let x = bucket[b]
            let c_lat = rec_lats[x]
            let c_lon = rec_lons[x]
            let dist = Math.hypot(c_lon - cap_lon, c_lat - cap_lat)
            if (dist > proximity_radius)
              continue

            let city = reconciled[x]
            nearby_indices.push(x)

            let clean_city_key = normalizeCityKey(city.key || '')
            let prim_city_key = normalizePrimaryCityKey(city.key || '')
            let is_key_match = Boolean(
              (cap.capkey && (city.key === cap.capkey || String(city.id) === cap.capkey)) ||
              (clean_cap_key && clean_city_key && clean_cap_key === clean_city_key) ||
              (prim_cap_key && prim_city_key && prim_cap_key === prim_city_key)
            )
            let is_name_match = doesCityMatchCapitalName(city, cap.capname)
            let c_sid = city.capitalStateId ?? city.capital_state_id
            let is_state_match = Boolean(cap.state_id !== undefined && c_sid !== undefined && String(c_sid) === String(cap.state_id) && dist <= 0.25)
            let c_country_l = (city.country || '').toLowerCase().trim()
            let p_name_l = (cap.polity_name || '').toLowerCase().trim()
            let is_ghsl_coord = Boolean(
              cap.capkey?.startsWith('ghsl-') &&
              dist <= 0.12 &&
              c_country_l &&
              p_name_l &&
              (p_name_l.includes(c_country_l) || c_country_l.includes(p_name_l))
            )
            let is_exact_coord = dist <= 0.01 || is_ghsl_coord || is_state_match

            if (is_key_match || is_name_match || is_exact_coord) {
              let cand_score = (is_key_match ? 100000 : 0) + (is_name_match ? 80000 : 0) + (is_state_match ? 20000 : 0) - Math.round(dist*10000)
              if (cand_score > closest_score) {
                closest_score = cand_score
                closest_index = x
              }
            }
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

        //Suppress only non-distinct secondary cities within proximity of this matched designated capital
        for (let y = 0; y < nearby_indices.length; y++) {
          let idx = nearby_indices[y]
          if (idx === closest_index)
            continue
          let nearby_city = reconciled[idx]
          let nearby_sid = nearby_city?.capitalStateId ?? nearby_city?.capital_state_id
          let same_polity = (cap.state_id === undefined || nearby_sid === undefined || String(nearby_sid) === String(cap.state_id))
          if (same_polity)
            suppressed_capital_indices.add(idx)
        }
      }
    }
  }

  //2b. Polity-level deduplication: guarantee at most one capital city per state/polity
  let by_polity_uid = new Map<string, number[]>()
  for (let i = 0; i < reconciled.length; i++) {
    let c = reconciled[i]
    if (!c || (!c.isCapital && !c.is_capital) || suppressed_capital_indices.has(i))
      continue
    let c_sid = c.capitalStateId ?? c.capital_state_id
    let c_polity = (c.capitalOf || c.capital_state_name || '').toLowerCase().trim()
    let uid = (c_sid !== undefined && c_sid !== null && String(c_sid).length > 0)
      ? `sid:${String(c_sid)}`
      : (c_polity ? `name:${c_polity}` : '')
    if (!uid)
      continue
    if (!by_polity_uid.has(uid))
      by_polity_uid.set(uid, [])
    by_polity_uid.get(uid)!.push(i)
  }

  for (let [, group] of by_polity_uid) {
    if (group.length <= 1)
      continue
    let best_group_idx = group[0]
    let best_group_score = -Infinity

    for (let g = 0; g < group.length; g++) {
      let idx = group[g]
      let c = reconciled[idx]
      let c_sid = c.capitalStateId ?? c.capital_state_id
      let sid_str = (c_sid !== undefined && c_sid !== null) ? String(c_sid) : ''
      let p_name = (c.capitalOf || c.capital_state_name || '').toLowerCase().trim()
      let c_country = (c.country || '').toLowerCase().trim()
      let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : (c.position ? c.position[1] : undefined)))
      let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : (c.position ? c.position[0] : undefined)))
      let live_feat = (sid_str ? polity_features?.by_sid?.get(sid_str) : undefined) ||
        (p_name ? polity_features?.by_name?.get(p_name) : undefined)

      let sc = 0
      if (assigned_capital_indices.has(idx))
        sc += 1000000
      if (live_feat && c_lon !== undefined && c_lat !== undefined && isCityInsideBorderFeature(c_lon, c_lat, live_feat.bbox, live_feat.geometry, 0.35))
        sc += 500000
      if (c_country && p_name && (p_name.includes(c_country) || c_country.includes(p_name)))
        sc += 200000
      if (!String(c.key || '').toLowerCase().includes('(agglomeration)'))
        sc += 50000
      let pop_val = typeof c.population === 'number' ? c.population : 0
      sc += Math.min(20000, Math.round(Math.log10(Math.max(1, pop_val))*3000))

      if (sc > best_group_score) {
        best_group_score = sc
        best_group_idx = idx
      }
    }

    for (let g = 0; g < group.length; g++) {
      let idx = group[g]
      if (idx !== best_group_idx) {
        assigned_capital_indices.delete(idx)
        suppressed_capital_indices.add(idx)
      }
    }
  }

  //3. Clustering suppression via 1-deg spatial grid over surviving capitals only
  let active_cap_grid = new Map<number, number[]>()
  let active_cap_indices: number[] = []
  for (let i = 0; i < reconciled.length; i++) {
    let c1 = reconciled[i]
    if (!rec_valid[i] || (!c1.isCapital && !c1.is_capital) || suppressed_capital_indices.has(i))
      continue
    active_cap_indices.push(i)
    let g_key = (Math.floor(rec_lats[i]) + 256)*1024 + (Math.floor(rec_lons[i]) + 512)
    let bucket = active_cap_grid.get(g_key)
    if (!bucket) {
      bucket = []
      active_cap_grid.set(g_key, bucket)
    }
    bucket.push(i)
  }

  for (let a = 0; a < active_cap_indices.length; a++) {
    let i = active_cap_indices[a]
    if (suppressed_capital_indices.has(i))
      continue
    let c1 = reconciled[i]
    let c1_lat = rec_lats[i]
    let c1_lon = rec_lons[i]
    let min_gy = Math.floor(c1_lat - proximity_radius)
    let max_gy = Math.floor(c1_lat + proximity_radius)
    let min_gx = Math.floor(c1_lon - proximity_radius)
    let max_gx = Math.floor(c1_lon + proximity_radius)

    for (let gy = min_gy; gy <= max_gy; gy++) {
      for (let gx = min_gx; gx <= max_gx; gx++) {
        let bucket = active_cap_grid.get((gy + 256)*1024 + (gx + 512))
        if (!bucket)
          continue
        for (let b = 0; b < bucket.length; b++) {
          let j = bucket[b]
          if (j <= i || suppressed_capital_indices.has(j))
            continue
          let d = Math.hypot(c1_lon - rec_lons[j], c1_lat - rec_lats[j])
          if (d <= proximity_radius) {
            let c2 = reconciled[j]
            if (assigned_capital_indices.has(i) && !assigned_capital_indices.has(j)) {
              suppressed_capital_indices.add(j)
            } else if (!assigned_capital_indices.has(i) && assigned_capital_indices.has(j)) {
              suppressed_capital_indices.add(i)
              break
            } else {
              let pop1 = typeof c1.population === 'number' ? c1.population : 0
              let pop2 = typeof c2.population === 'number' ? c2.population : 0
              if (pop1 >= pop2) {
                suppressed_capital_indices.add(j)
              } else {
                suppressed_capital_indices.add(i)
                break
              }
            }
          }
        }
        if (suppressed_capital_indices.has(i))
          break
      }
      if (suppressed_capital_indices.has(i))
        break
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
