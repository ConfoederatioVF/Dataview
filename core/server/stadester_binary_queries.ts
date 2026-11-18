import path from 'path'
import { AtlasBordersService } from './AtlasBordersService.ts'
import {
  isBuggedCityName,
} from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  getCityActiveCapitalRecord,
  normalizeCapitalNameStem,
  normalizePrimaryCityKey,
  parseYearMonthDay,
  resolveHistoricalCityName,
} from '../framework/stadester/city_metadata_framework.ts'
import {
  getBuggedCitiesSet,
  isCityInsideStateBBox,
  type CityRenderPoint,
  type CompactCitiesPayload,
  type StadesterQueryOptions,
} from './stadester_types.ts'
import {
  getStateById,
  isStateAcapital,
} from './stadester_metadata.ts'
import {
  FLAG_HAS_CAPITALS,
  FLAG_HAS_HIST_NAMES,
  FLAG_IS_BUGGED,
  FLAG_IS_GHSL,
  fnv1a32,
  readDetailPackRecord,
  readPackedString,
  type BinaryDatasetStore,
} from './stadester_binary_format.ts'

export let WIRE_MAGIC = 'STADWIRE'

/**
 * Binary-searches a slice of a flat Int16Array for the first index >= target_year.
 *
 * @param {Int16Array} arg0_years
 * @param {number} arg1_offset
 * @param {number} arg2_len
 * @param {number} arg3_target_year
 *
 * @returns {number} Local index within [0, arg2_len]
 */
function lowerBoundInt16Slice (
  arg0_years: Int16Array,
  arg1_offset: number,
  arg2_len: number,
  arg3_target_year: number
): number {
  //Convert from parameters
  let len = arg2_len
  let offset = arg1_offset
  let target_year = arg3_target_year
  let years = arg0_years

  //Declare local instance variables
  let hi = len
  let lo = 0

  //Function body
  for (let i = 0; i < 32 && lo < hi; i++) {
    let mid = (lo + hi) >> 1
    if (years[offset + mid] < target_year) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  //Return statement
  return lo
}


/**
 * Returns HYDE benchmark step interval at a historical year.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
function getHydeInterval (arg0_year: number): number {
  let year = arg0_year
  if (!Number.isFinite(year))
    return 200
  if (year < 0)
    return 1000
  if (year < 1700)
    return 100
  return 10
}


/**
 * Returns maximum allowed temporal interpolation gap between two anchor years.
 *
 * @param {number} arg0_y0
 * @param {number} arg1_y1
 *
 * @returns {number}
 */
function getMaxTemporalGap (arg0_y0: number, arg1_y1: number): number {
  let i0 = getHydeInterval(arg0_y0)
  let i1 = getHydeInterval(arg1_y1)
  let im = getHydeInterval((arg0_y0 + arg1_y1)/2)
  return Math.max(200, i0, i1, im)
}


/**
 * Interpolates city population directly from flat TypedArrays without object or string allocations.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_city_idx
 * @param {number} arg2_target_year
 *
 * @returns {number}
 */
export function interpolateBinaryPopulation (
  arg0_store: BinaryDatasetStore,
  arg1_city_idx: number,
  arg2_target_year: number
): number {
  //Convert from parameters
  let city_idx = arg1_city_idx
  let store = arg0_store
  let target_year = arg2_target_year

  //Declare local instance variables
  let len = store.pop_len[city_idx]
  let off = store.pop_offset[city_idx]
  let vals = store.pop_vals
  let years = store.pop_years

  //Guard clauses
  if (len === 0)
    return 0

  //Function body
  let first_yr = years[off]
  let last_yr = years[off + len - 1]
  if (target_year <= first_yr)
    return vals[off] || 0
  if (target_year >= last_yr)
    return vals[off + len - 1] || 0

  let local_idx = lowerBoundInt16Slice(years, off, len, target_year)
  if (local_idx < len && years[off + local_idx] === target_year)
    return vals[off + local_idx] || 0

  let pop_idx = Math.max(1, local_idx)
  if (pop_idx >= len)
    pop_idx = len - 1

  let y0 = years[off + pop_idx - 1]
  let y1 = years[off + pop_idx]
  let p0 = vals[off + pop_idx - 1] || 0
  let p1 = vals[off + pop_idx] || 0
  let max_gap = getMaxTemporalGap(y0, y1)

  if ((y1 - y0) > max_gap && target_year > y0 && target_year < y1)
    return 0
  if (p0 >= 0.01 && p1 >= 0.01 && y1 > y0) {
    let t = (target_year - y0)/(y1 - y0)
    let log_val = Math.log10(p0) + t*(Math.log10(p1) - Math.log10(p0))
    let calc_pop = Math.pow(10, log_val)
    return calc_pop >= 1 ? Math.round(calc_pop) : Math.round(calc_pop*1000)/1000
  }
  if (p1 >= 0.01)
    return p1
  if (p0 >= 0.01)
    return p0

  //Return statement
  return 0
}


/**
 * Computes continuous annual growth rate directly from flat TypedArrays.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_city_idx
 * @param {number} arg2_target_year
 *
 * @returns {number}
 */
export function computeBinaryGrowthRate (
  arg0_store: BinaryDatasetStore,
  arg1_city_idx: number,
  arg2_target_year: number
): number {
  //Convert from parameters
  let city_idx = arg1_city_idx
  let store = arg0_store
  let target_year = arg2_target_year

  //Declare local instance variables
  let n = store.pop_len[city_idx]
  let off = store.pop_offset[city_idx]
  let vals = store.pop_vals
  let years = store.pop_years

  //Guard clauses
  if (n < 2)
    return 0

  //Function body
  let idx: number
  if (target_year <= years[off]) {
    idx = 1
  } else if (target_year >= years[off + n - 1]) {
    idx = n - 1
  } else {
    idx = Math.max(1, lowerBoundInt16Slice(years, off, n, target_year))
    if (idx >= n)
      idx = n - 1
  }

  let y0 = years[off + idx - 1]
  let y1 = years[off + idx]
  let p0 = vals[off + idx - 1] || 0
  let p1 = vals[off + idx] || 0
  let max_gap = getMaxTemporalGap(y0, y1)

  if (p0 < 0.01 || p1 < 0.01 || y1 <= y0 || (y1 - y0) > max_gap)
    return 0

  let raw_rate = Math.pow(p1/p0, 1/(y1 - y0)) - 1
  if ((y1 - y0) <= 2) {
    let end_k = Math.min(n - 1, idx + 1)
    let start_k = Math.max(1, idx - 2)
    let window_rates: number[] = []

    for (let i = start_k; i <= end_k; i++) {
      let wy0 = years[off + i - 1]
      let wy1 = years[off + i]
      let wp0 = vals[off + i - 1] || 0
      let wp1 = vals[off + i] || 0
      if ((wy1 - wy0) <= 2 && wp0 >= 0.01 && wp1 >= 0.01)
        window_rates.push(Math.pow(wp1/wp0, 1/(wy1 - wy0)) - 1)
    }

    if (window_rates.length >= 3) {
      window_rates.sort((arg0_a, arg1_b) => arg0_a - arg1_b)
      let mid = window_rates.length >> 1
      let median_rate = (window_rates.length % 2 === 1)
        ? window_rates[mid]
        : 0.5*(window_rates[mid - 1] + window_rates[mid])
      if (Math.abs(raw_rate - median_rate) > 0.015)
        return median_rate
    } else if (idx === n - 1 && idx >= 2 && (y0 - years[off + idx - 2]) <= 2) {
      let p_prev2 = vals[off + idx - 2] || 0
      if (p_prev2 >= 0.01) {
        let prev_rate = Math.pow(p0/p_prev2, 1/(y0 - years[off + idx - 2])) - 1
        if (Math.abs(raw_rate - prev_rate) > 0.015)
          return prev_rate
      }
    }
  }

  //Return statement
  return raw_rate
}


/**
 * Collects candidate city indices within a 2-deg spatial grid bounding box around (lat, lon).
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_lat
 * @param {number} arg2_lon
 * @param {number} [arg3_deg_radius=0.25]
 *
 * @returns {number[]}
 */
export function getNearbyBinaryCityIndices (
  arg0_store: BinaryDatasetStore,
  arg1_lat: number,
  arg2_lon: number,
  arg3_deg_radius: number = 0.25
): number[] {
  //Convert from parameters
  let lat = arg1_lat
  let lon = arg2_lon
  let radius = arg3_deg_radius
  let store = arg0_store

  //Declare local instance variables
  let max_cx = Math.min(179, Math.floor((lon + radius + 180)/2))
  let max_cy = Math.min(89, Math.floor((lat + radius + 90)/2))
  let min_cx = Math.max(0, Math.floor((lon - radius + 180)/2))
  let min_cy = Math.max(0, Math.floor((lat - radius + 90)/2))
  let out: number[] = []

  //Function body
  for (let cy = min_cy; cy <= max_cy; cy++) {
    for (let cx = min_cx; cx <= max_cx; cx++) {
      let span = store.cell_map.get(cy*180 + cx)
      if (!span)
        continue
      for (let i = 0; i < span.length; i++) {
        let idx = store.cell_city_indices[span.offset + i]
        if (Math.abs(store.lat[idx] - lat) <= radius && Math.abs(store.lon[idx] - lon) <= radius)
          out.push(idx)
      }
    }
  }

  //Return statement
  return out
}


/**
 * Resolves authoritative border capitals against the binary store using 2-deg spatial cells.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_year
 * @param {number} [arg2_month=1]
 * @param {number} [arg3_day=1]
 * @param {string} [arg4_border_dataset='defacto_borders']
 *
 * @returns {Map<string, { area?: number; city_idx?: number; color: string; name?: string; state_id?: number | string }>}
 */
export function getBinaryAuthoritativeCapitalsAtYear (
  arg0_store: BinaryDatasetStore,
  arg1_year: number,
  arg2_month: number = 1,
  arg3_day: number = 1,
  arg4_border_dataset: string = 'defacto_borders'
): Map<string, { area?: number; city_idx?: number; color: string; name?: string; state_id?: number | string }> {
  //Convert from parameters
  let border_dataset = arg4_border_dataset
  let day = arg3_day
  let month = arg2_month
  let store = arg0_store
  let year = Math.floor(arg1_year)

  //Declare local instance variables
  let capitals_by_city = new Map<string, { area?: number; city_idx?: number; color: string; name?: string; state_id?: number | string }>()

  //Function body
  try {
    let borders = AtlasBordersService.getBordersMetadataAtYear(year, { dataset: border_dataset, day, month })
    if ((!borders || !borders.features || borders.features.length === 0) && (border_dataset === 'defacto_borders' || border_dataset === 'detailed_borders'))
      borders = AtlasBordersService.getBordersMetadataAtYear(year, { dataset: 'dejure_borders', day, month })

    if (!borders || !borders.features)
      return capitals_by_city

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

      let best_idx = -1
      let best_score = -1

      if (p.capkey) {
        let direct_idx = findBinaryCityIndexByKey(store, p.capkey)
        if (direct_idx !== -1) {
          let d_min_yr = store.min_year[direct_idx]
          let d_max_yr = store.max_year[direct_idx]
          let d_alive = (year >= d_min_yr && year <= d_max_yr) || (d_max_yr >= 1975 && year >= 1975)
          let d_ghsl = (store.flags[direct_idx] & FLAG_IS_GHSL) !== 0
          if (d_alive && !(year < 1975 && d_ghsl)) {
            let d_dist = Math.hypot(store.lon[direct_idx] - cap_lon, store.lat[direct_idx] - cap_lat)
            if (d_dist <= 0.15)
              best_idx = direct_idx
          }
        }
      }

      let cand_indices = best_idx === -1 ? getNearbyBinaryCityIndices(store, cap_lat, cap_lon, 0.22) : []
      if (best_idx === -1 && p.capkey) {
        let direct_idx = findBinaryCityIndexByKey(store, p.capkey)
        if (direct_idx !== -1 && !cand_indices.includes(direct_idx))
          cand_indices.push(direct_idx)
      }

      for (let x = 0; x < cand_indices.length; x++) {
        let idx = cand_indices[x]
        let min_yr = store.min_year[idx]
        let max_yr = store.max_year[idx]
        let is_alive = (year >= min_yr && year <= max_yr) || (max_yr >= 1975 && year >= 1975)
        if (!is_alive)
          continue

        let is_ghsl = (store.flags[idx] & FLAG_IS_GHSL) !== 0
        if (year < 1975 && is_ghsl)
          continue

        let c_lat = store.lat[idx]
        let c_lon = store.lon[idx]
        let dist = Math.hypot(c_lon - cap_lon, c_lat - cap_lat)
        if (dist > 0.20)
          continue

        if (feat.bbox) {
          let span = Math.max(Math.abs(feat.bbox[2] - feat.bbox[0]), Math.abs(feat.bbox[3] - feat.bbox[1]))
          let pad = span < 1.5 ? Math.min(0.5, Math.max(0.25, span*0.75)) : 0.5
          if (c_lon < feat.bbox[0] - pad || c_lon > feat.bbox[2] + pad || c_lat < feat.bbox[1] - pad || c_lat > feat.bbox[3] + pad)
            continue
        }

        let c_key = readPackedString(store.key_buf, store.key_offsets, idx)
        let c_id = readPackedString(store.id_buf, store.id_offsets, idx)
        let c_name = readPackedString(store.name_buf, store.name_offsets, idx)
        let c_country = readPackedString(store.country_buf, store.country_offsets, idx)
        let c_cap_recs = store.cap_records_by_idx.get(idx)

        let score = 0
        let c_prim_key = normalizePrimaryCityKey(c_key)
        let p_prim_key = p.capkey ? normalizePrimaryCityKey(p.capkey) : ''
        let is_key_match = Boolean(
          p.capkey &&
          (c_key === p.capkey || c_id === p.capkey || (c_prim_key && p_prim_key && c_prim_key === p_prim_key))
        )
        let is_state_match = Boolean(
          p.state_id !== undefined &&
          c_cap_recs?.some((arg0_rec) => String(arg0_rec.state_id) === String(p.state_id))
        )
        if (is_key_match)
          score += 200000

        let is_name_match = false
        let cap_name_lower = (p.capname || '').toLowerCase().trim()
        if (cap_name_lower) {
          let c_name_lower = c_name.toLowerCase().trim()
          let c_name_nfd = c_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let cap_name_nfd = cap_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let cap_stem = normalizeCapitalNameStem(p.capname || '')
          let clean_c_name = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').split(';')[0].trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/\bsaint\b/g, 'st').replace(/\./g, '')
          let clean_cap_name = cap_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').split(';')[0].trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/\bsaint\b/g, 'st').replace(/\./g, '')
          let c_stem = normalizeCapitalNameStem(c_name)
          let key_base_raw = c_key.replace(/^(stadester|ghsl|oxford)-/i, '').split('-')[0].replace(/\(.*?\)/g, '').trim()
          let key_base_name = key_base_raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let key_base_stem = normalizeCapitalNameStem(key_base_raw)

          if (
            c_name_lower === cap_name_lower ||
            c_name_nfd === cap_name_nfd ||
            clean_c_name === clean_cap_name ||
            (c_stem.length >= 3 && c_stem === cap_stem) ||
            (key_base_name && key_base_name === clean_cap_name) ||
            (key_base_stem.length >= 3 && key_base_stem === cap_stem)
          ) {
            is_name_match = true
          } else {
            let other_str = readPackedString(store.other_buf, store.other_offsets, idx)
            let alias_pool: string[] = other_str ? other_str.split('\x1f') : []
            let hist_recs = store.hist_names_by_idx.get(idx)
            if (hist_recs) {
              for (let h = 0; h < hist_recs.length; h++)
                alias_pool.push(hist_recs[h].name)
            }
            is_name_match = alias_pool.some((arg0_on) => {
              let on_clean = String(arg0_on || '').replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
              let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              let on_stem = normalizeCapitalNameStem(arg0_on || '')
              return (
                on_clean === cap_name_lower ||
                on_nfd === cap_name_nfd ||
                (cap_stem.length >= 3 && on_stem === cap_stem)
              )
            })
          }
        }

        let c_country_l = c_country.toLowerCase().trim()
        let p_name_l = (p.name || '').toLowerCase().trim()
        let is_ghsl_country_coord = Boolean(
          p.capkey?.startsWith('ghsl-') &&
          dist <= 0.12 &&
          c_country_l &&
          p_name_l &&
          (p_name_l.includes(c_country_l) || c_country_l.includes(p_name_l))
        )
        let is_exact_coord_match = dist <= 0.01 || is_ghsl_country_coord || (is_state_match && dist <= 0.20)
        if (!is_key_match && !is_name_match && !is_exact_coord_match)
          continue

        if (is_name_match)
          score += 100000
        if (is_state_match)
          score += 50000
        if (year < 1975 && c_key.startsWith('stadester-'))
          score += 25000
        if (year >= 1975 && is_ghsl)
          score += 25000
        if (year >= min_yr && year <= max_yr)
          score += 15000
        if (c_cap_recs && c_cap_recs.length > 0)
          score += 10000
        if (!c_key.includes('agglomeration'))
          score += 5000
        score += Math.max(0, Math.round((0.25 - dist)*5000))
        score += Math.min(1000, Math.round((store.max_pop[idx] || 0)/1000))

        if (score > best_score) {
          best_score = score
          best_idx = idx
        }
      }

      if (best_idx !== -1) {
        let best_key = readPackedString(store.key_buf, store.key_offsets, best_idx)
        let best_id = readPackedString(store.id_buf, store.id_offsets, best_idx)
        let best_country = readPackedString(store.country_buf, store.country_offsets, best_idx)
        let cap_color_val = p.polygonFill || p.symbol?.polygonFill || p.fill_color || p.fillColor || p.color || (p.state_id ? getStateById(p.state_id)?.fill_color : null) || '#FFDC00'
        let feat_area = p.area !== undefined ? Number(p.area) : 0
        if (!feat_area && feat.bbox)
          feat_area = Math.max(0, (feat.bbox[2] - feat.bbox[0])*(feat.bbox[3] - feat.bbox[1]))

        let cap_entry = {
          area: feat_area,
          city_idx: best_idx,
          color: cap_color_val,
          name: p.name,
          state_id: p.state_id || p.gwcode,
        }

        let existing_entry = capitals_by_city.get(best_key)
        let should_set = true
        if (existing_entry) {
          let city_country = best_country.toLowerCase().trim()
          let exist_area = existing_entry.area || 0
          let exist_polity = (existing_entry.name || '').toLowerCase().trim()
          let new_polity = (p.name || '').toLowerCase().trim()
          let exist_matches_country = Boolean(city_country && (exist_polity.includes(city_country) || city_country.includes(exist_polity)))
          let new_matches_country = Boolean(city_country && (new_polity.includes(city_country) || city_country.includes(new_polity)))

          if (exist_matches_country && !new_matches_country)
            should_set = false
          else if (!exist_matches_country && new_matches_country)
            should_set = true
          else if (exist_area > feat_area)
            should_set = false
        }

        if (should_set) {
          capitals_by_city.set(best_key, cap_entry)
          if (best_id && best_id !== best_key)
            capitals_by_city.set(best_id, cap_entry)
        }
      }
    }
  } catch (arg0_err) {
    console.error('[StadesterBinaryQueries] Error resolving border capitals:', arg0_err)
  }

  //Return statement
  return capitals_by_city
}


/**
 * Evaluates active cities at a year using the binary TypedArray store with spatial cell pruning
 * and early max_pop cutoff for global top-K queries.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {string} arg1_dataset_name
 * @param {number} arg2_year
 * @param {StadesterQueryOptions} arg3_options
 * @param {Map<string, { area?: number; city_idx?: number; color: string; name?: string; state_id?: number | string }>} arg4_auth_capitals
 *
 * @returns {CityRenderPoint[]}
 */
export function queryBinaryCitiesAtYear (
  arg0_store: BinaryDatasetStore,
  _arg1_dataset_name: string,
  arg2_year: number,
  arg3_options: StadesterQueryOptions,
  arg4_auth_capitals: Map<string, { area?: number; city_idx?: number; color?: string; name?: string; state_id?: number | string }>
): CityRenderPoint[] {
  //Convert from parameters
  let auth_capitals = arg4_auth_capitals
  let options = arg3_options
  let store = arg0_store
  let target_year = arg2_year

  //Declare local instance variables
  let active_state_ids = options.active_state_ids || AtlasBordersService.getActiveStateIdsAtDate(
    Math.floor(target_year),
    options.month,
    options.day
  )
  let auth_city_idx_set = new Set<number>()
  let bbox = options.bbox
  let count = store.count
  let max_cities = options.max_cities !== undefined ? options.max_cities : 4000
  let min_pop = options.min_pop !== undefined ? Math.max(0.01, options.min_pop) : 0.01
  let preserve_capitals = options.preserve_capitals !== false
  let result_cities: CityRenderPoint[] = []
  let state_lookup_cache = new Map<string | number, any>()

  let getCachedState = function (arg0_sid: string | number): any {
    if (state_lookup_cache.has(arg0_sid))
      return state_lookup_cache.get(arg0_sid)
    let st = getStateById(arg0_sid)
    state_lookup_cache.set(arg0_sid, st)
    return st
  }

  //Pre-collect authoritative capital indices in O(K_auth)
  for (let [, cap_info] of auth_capitals) {
    if (cap_info.city_idx !== undefined)
      auth_city_idx_set.add(cap_info.city_idx)
  }

  //Pass 1: Zero-string-allocation numeric selection via bounded min-heap + capital candidates
  let cap_candidates: number[] = []
  let cap_pops: number[] = []
  let cap_seen = new Set<number>()
  let heap_idxs: number[] = []
  let heap_pops: number[] = []
  let heap_seen = new Set<number>()

  let heapPush = function (arg0_idx: number, arg1_pop: number): void {
    if (heap_seen.has(arg0_idx))
      return
    if (max_cities > 0 && heap_idxs.length >= max_cities) {
      if (arg1_pop <= heap_pops[0])
        return
      heap_seen.delete(heap_idxs[0])
      heap_seen.add(arg0_idx)
      heap_idxs[0] = arg0_idx
      heap_pops[0] = arg1_pop
      let cur = 0
      let h_len = heap_idxs.length
      for (let z = 0; z < 32; z++) {
        let l = (cur << 1) + 1
        let r = l + 1
        let smallest = cur
        if (l < h_len && heap_pops[l] < heap_pops[smallest])
          smallest = l
        if (r < h_len && heap_pops[r] < heap_pops[smallest])
          smallest = r
        if (smallest === cur)
          break
        let tmp_i = heap_idxs[cur]
        let tmp_p = heap_pops[cur]
        heap_idxs[cur] = heap_idxs[smallest]
        heap_pops[cur] = heap_pops[smallest]
        heap_idxs[smallest] = tmp_i
        heap_pops[smallest] = tmp_p
        cur = smallest
      }
      return
    }

    heap_seen.add(arg0_idx)
    let cur = heap_idxs.length
    heap_idxs.push(arg0_idx)
    heap_pops.push(arg1_pop)
    for (let z = 0; cur > 0 && z < 32; z++) {
      let parent = (cur - 1) >> 1
      if (heap_pops[parent] <= heap_pops[cur])
        break
      let tmp_i = heap_idxs[cur]
      let tmp_p = heap_pops[cur]
      heap_idxs[cur] = heap_idxs[parent]
      heap_pops[cur] = heap_pops[parent]
      heap_idxs[parent] = tmp_i
      heap_pops[parent] = tmp_p
      cur = parent
    }
  }

  let checkNumericCandidate = function (arg0_idx: number): void {
    let idx = arg0_idx
    if ((store.flags[idx] & FLAG_IS_BUGGED) !== 0 || store.pop_len[idx] === 0)
      return

    let c_lat = store.lat[idx]
    let c_lon = store.lon[idx]
    if (bbox) {
      if (bbox[0] <= bbox[2]) {
        if (c_lon < bbox[0] || c_lon > bbox[2] || c_lat < bbox[1] || c_lat > bbox[3])
          return
      } else {
        if ((c_lon < bbox[0] && c_lon > bbox[2]) || c_lat < bbox[1] || c_lat > bbox[3])
          return
      }
    }

    let is_auth_cap = auth_city_idx_set.has(idx)
    let start_yr = store.min_year[idx]
    let end_yr = store.max_year[idx]
    let is_in_range = (target_year >= start_yr && target_year <= end_yr) ||
      (end_yr >= 1975 && target_year >= 1975 && target_year <= 2026) ||
      is_auth_cap
    if (!is_in_range)
      return

    let pop = interpolateBinaryPopulation(store, idx, target_year)
    if (pop < 0.01) {
      if (is_auth_cap)
        pop = store.pop_vals[store.pop_offset[idx]] || 1000
      else
        return
    }

    let has_cap_flag = is_auth_cap || (store.flags[idx] & FLAG_HAS_CAPITALS) !== 0
    if (has_cap_flag) {
      if (!cap_seen.has(idx)) {
        cap_seen.add(idx)
        cap_candidates.push(idx)
        cap_pops.push(pop)
      }
      return
    }

    if (pop < min_pop)
      return

    heapPush(idx, pop)
  }

  //1a. Evaluate potential capitals first when preserve_capitals is enabled
  if (preserve_capitals) {
    for (let i = 0; i < store.capital_city_indices.length; i++)
      checkNumericCandidate(store.capital_city_indices[i])
    for (let idx of auth_city_idx_set)
      checkNumericCandidate(idx)
  }

  //1b. Scan spatial cells (when bbox given) or global sorted max_pop order with early break
  if (bbox) {
    let min_cy = Math.max(0, Math.min(89, Math.floor((bbox[1] + 90)/2)))
    let max_cy = Math.max(0, Math.min(89, Math.floor((bbox[3] + 90)/2)))
    let west = bbox[0]
    let east = bbox[2]
    let lon_ranges: Array<[number, number]> = west <= east
      ? [[Math.max(0, Math.floor((west + 180)/2)), Math.min(179, Math.floor((east + 180)/2))]]
      : [[Math.max(0, Math.floor((west + 180)/2)), 179], [0, Math.min(179, Math.floor((east + 180)/2))]]

    for (let cy = min_cy; cy <= max_cy; cy++) {
      for (let r = 0; r < lon_ranges.length; r++) {
        for (let cx = lon_ranges[r][0]; cx <= lon_ranges[r][1]; cx++) {
          let span = store.cell_map.get(cy*180 + cx)
          if (!span)
            continue
          let cell_cutoff = (max_cities > 0 && heap_idxs.length >= max_cities) ? Math.max(min_pop, heap_pops[0]) : min_pop
          for (let i = 0; i < span.length; i++) {
            let idx = store.cell_city_indices[span.offset + i]
            if (store.max_pop[idx] < cell_cutoff)
              break
            checkNumericCandidate(idx)
          }
        }
      }
    }
  } else {
    for (let i = 0; i < count; i++) {
      let mp = store.max_pop[i]
      if (mp < min_pop)
        break
      if (max_cities > 0 && heap_idxs.length >= max_cities && mp <= heap_pops[0])
        break
      checkNumericCandidate(i)
    }
  }

  //Pass 2: Hydrate strings, growth, historical names, and active capital status ONLY for selected indices
  let hydrateWinner = function (arg0_idx: number, arg1_pop: number): void {
    let idx = arg0_idx
    let pop = arg1_pop
    let c_lat = store.lat[idx]
    let c_lon = store.lon[idx]
    let c_key = readPackedString(store.key_buf, store.key_offsets, idx)
    let cs_cap = auth_capitals.get(c_key)

    let cap_rec = null
    if ((store.flags[idx] & FLAG_HAS_CAPITALS) !== 0) {
      let recs = store.cap_records_by_idx.get(idx)
      if (recs && recs.length > 0) {
        cap_rec = getCityActiveCapitalRecord({ capital_records: recs }, target_year, (arg0_sid, arg0_y_frac) => {
          let sid_num = Number(arg0_sid)
          let state = getCachedState(arg0_sid)
          if (!state || isStateAcapital(arg0_sid))
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
          if (!isCityInsideStateBBox({ coords: [c_lat, c_lon], key: c_key }, state, 0.75))
            return false
          return true
        })
      }
    }

    let cap_state = cap_rec?.state_id ? getCachedState(cap_rec.state_id) : null
    let is_capital_val = Boolean(cs_cap || (cap_rec && cap_state))
    if (!is_capital_val && pop < min_pop)
      return

    let growth_rate = computeBinaryGrowthRate(store, idx, target_year)
    let c_country = readPackedString(store.country_buf, store.country_offsets, idx)
    let c_id = readPackedString(store.id_buf, store.id_offsets, idx)
    let c_name = readPackedString(store.name_buf, store.name_offsets, idx)
    let c_other_str = readPackedString(store.other_buf, store.other_offsets, idx)
    let r_idx = store.region_idx[idx]
    let c_region = (r_idx !== 65535 && r_idx < store.regions.length) ? store.regions[r_idx] : undefined

    let cap_color_val = (cs_cap?.color && cs_cap.color !== '#FFDC00')
      ? cs_cap.color
      : (cap_state?.fill_color || cs_cap?.color || null)
    let cap_state_id = cs_cap?.state_id || cap_rec?.state_id || undefined
    let polity_name = cs_cap?.name || cap_state?.name || undefined

    if (cs_cap && cap_state && String(cs_cap.state_id) !== String(cap_rec?.state_id)) {
      let city_country = c_country.toLowerCase().trim()
      let cs_name = (cs_cap.name || '').toLowerCase().trim()
      let cs_state = cs_cap.state_id !== undefined ? getCachedState(cs_cap.state_id) : null
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

    let resolved_name = c_name
    let hist_recs = (store.flags[idx] & FLAG_HAS_HIST_NAMES) !== 0 ? store.hist_names_by_idx.get(idx) : undefined
    if (hist_recs && hist_recs.length > 0) {
      let resolved_date = (options.month !== undefined || options.day !== undefined)
        ? `${Math.floor(target_year)}.${options.month || 1}.${options.day || 1}`
        : target_year
      resolved_name = resolveHistoricalCityName({ historical_names: hist_recs, key: c_key, name: c_name } as any, resolved_date)
    }

    result_cities.push({
      capital_color: cap_color_val || undefined,
      capital_state_id: cap_state_id,
      capital_state_name: polity_name,
      capitalOf: polity_name,
      coords: [c_lat, c_lon],
      country: c_country || undefined,
      growthRate: growth_rate,
      historical_names: hist_recs,
      id: c_id || c_key,
      is_capital: is_capital_val,
      isCapital: is_capital_val,
      key: c_key,
      metadata_name: c_name,
      name: resolved_name,
      other_names: c_other_str ? c_other_str.split('\x1f') : undefined,
      population: pop,
      region: c_region,
    })
  }

  for (let i = 0; i < cap_candidates.length; i++)
    hydrateWinner(cap_candidates[i], cap_pops[i])
  for (let i = 0; i < heap_idxs.length; i++)
    hydrateWinner(heap_idxs[i], heap_pops[i])

  result_cities.sort((arg0_a, arg1_b) => arg1_b.population - arg0_a.population)

  if (max_cities > 0 && max_cities < result_cities.length) {
    if (preserve_capitals) {
      let top_cities = result_cities.slice(0, max_cities)
      let capitals_outside_slice = result_cities.slice(max_cities).filter((arg0_c) => arg0_c.isCapital)
      if (capitals_outside_slice.length > 0) {
        let non_capitals: CityRenderPoint[] = []
        let preserved_list: CityRenderPoint[] = []
        for (let i = 0; i < top_cities.length; i++) {
          if (top_cities[i].isCapital)
            preserved_list.push(top_cities[i])
          else
            non_capitals.push(top_cities[i])
        }
        let slots_for_non_capitals = Math.max(0, max_cities - preserved_list.length - capitals_outside_slice.length)
        result_cities = [...preserved_list, ...capitals_outside_slice, ...non_capitals.slice(0, slots_for_non_capitals)]
        result_cities.sort((arg0_a, arg1_b) => arg1_b.population - arg0_a.population)
      } else {
        result_cities = top_cities
      }
    } else {
      result_cities = result_cities.slice(0, max_cities)
    }
  }

  //Return statement
  return result_cities
}


/**
 * Performs O(1) FNV-1a bucket lookup for a city key or exact normalised name in the binary store.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {string} arg1_key
 *
 * @returns {number} City index or -1
 */
export function findBinaryCityIndexByKey (arg0_store: BinaryDatasetStore, arg1_key: string): number {
  //Convert from parameters
  let raw_key = arg1_key
  let store = arg0_store

  //Guard clauses
  if (!raw_key || store.count === 0)
    return -1

  //Declare local instance variables
  let bare_key = raw_key.replace(/^(stadester-|ghsl-|oxford-)/i, '')
  let bare_nfd = bare_key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  let has_country_hyphen = bare_nfd.includes('-')
  let clean_city_name = !has_country_hyphen
    ? bare_nfd.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    : ''
  let primary_key = normalizePrimaryCityKey(raw_key)
  let raw_nfd = raw_key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
  let probes = [
    raw_key,
    bare_key,
    'stadester-' + bare_key,
    'ghsl-' + bare_key,
    'oxford-' + bare_key,
    raw_nfd,
    bare_nfd,
    'stadester-' + bare_nfd,
    primary_key,
    clean_city_name,
  ]

  //Function body
  for (let p = 0; p < probes.length; p++) {
    let probe = probes[p]
    if (!probe)
      continue
    let h = fnv1a32(probe)
    let bucket = h & store.hash_mask
    let ptr = store.hash_bucket_heads[bucket]
    for (let z = 0; ptr !== -1 && z < 64; z++) {
      if (store.hash_entry_hashes[ptr] === h) {
        let c_idx = store.hash_entry_city[ptr]
        let c_key = readPackedString(store.key_buf, store.key_offsets, c_idx)
        let c_id = readPackedString(store.id_buf, store.id_offsets, c_idx)
        let c_name_nfd = readPackedString(store.name_buf, store.name_offsets, c_idx).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        let c_name_clean = c_name_nfd.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
        let c_key_nfd = c_key.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
        let c_bare_nfd = c_key_nfd.replace(/^(stadester-|ghsl-|oxford-)/, '')
        let c_primary = normalizePrimaryCityKey(c_key)
        if (
          c_key === probe ||
          c_id === probe ||
          c_key_nfd === probe ||
          c_bare_nfd === probe ||
          c_primary === probe ||
          (!has_country_hyphen && (c_name_nfd === probe || c_name_clean === probe))
        ) {
          return c_idx
        }
      }
      ptr = store.hash_entry_next[ptr]
    }
  }

  //Return statement
  return -1
}


/**
 * Resolves full historical city details in O(1) via hash/spatial lookup and pread from shard detail pack.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {string} arg1_dataset_name
 * @param {string} [arg2_city_key]
 * @param {number | string} [arg3_year]
 * @param {number} [arg4_month]
 * @param {number} [arg5_day]
 * @param {object} [arg6_options]
 *
 * @returns {any | null}
 */
export function queryBinaryCityByKey (
  arg0_store: BinaryDatasetStore,
  _arg1_dataset_name: string,
  arg2_city_key?: string,
  arg3_year?: number | string,
  arg4_month?: number,
  arg5_day?: number,
  arg6_options?: { coords?: [number, number]; country?: string; dataset?: string; name?: string; state_id?: number | string }
): any | null {
  //Convert from parameters
  let city_key = arg2_city_key || ''
  let day = arg5_day
  let month = arg4_month
  let options = (arg6_options) ? arg6_options : {}
  let store = arg0_store
  let year = arg3_year

  //Declare local instance variables
  let bugged_set = getBuggedCitiesSet()
  let found_idx = -1

  //Guard clauses
  if (!city_key && !options.coords)
    return null
  if (city_key && isBuggedCityName(city_key, bugged_set))
    return null

  //Function body
  if (city_key)
    found_idx = findBinaryCityIndexByKey(store, city_key)

  if (found_idx === -1 && options.name)
    found_idx = findBinaryCityIndexByKey(store, options.name)

  if (found_idx === -1 && !options.coords && (city_key || options.name)) {
    let key_city = ''
    let key_country = ''
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
    let resolved = AtlasBordersService.findCityCoordsByName(options.name || key_city || city_key, options.country || key_country)
    if (resolved && resolved.coords) {
      options = { ...options, coords: [resolved.coords[1], resolved.coords[0]] }
      if (resolved.key)
        found_idx = findBinaryCityIndexByKey(store, resolved.key)
    }
  }

  if (found_idx === -1 && options.coords) {
    let nearby = getNearbyBinaryCityIndices(store, options.coords[0], options.coords[1], 0.35)
    let best_score = -1e12
    let search_name = (options.name || city_key || '').toLowerCase().trim()
    let search_nfd = search_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    let req_yr = (year !== undefined && year !== null)
      ? (typeof year === 'number' ? Math.floor(year) : parseYearMonthDay(year).year)
      : undefined

    for (let i = 0; i < nearby.length; i++) {
      let idx = nearby[i]
      if ((store.flags[idx] & FLAG_IS_BUGGED) !== 0)
        continue
      let d_km = computeHaversineDistanceKm(store.lat[idx], store.lon[idx], options.coords[0], options.coords[1])
      if (d_km > 35)
        continue
      let e_name = readPackedString(store.name_buf, store.name_offsets, idx).toLowerCase().trim()
      let e_nfd = e_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      let score = Math.max(0, Math.round((35 - d_km)*10000))
      if (search_name && (e_name === search_name || e_nfd === search_nfd))
        score += 1000000000
      else if (search_nfd && (e_nfd.includes(search_nfd) || search_nfd.includes(e_nfd)))
        score += 500000000
      if (req_yr !== undefined) {
        let min_y = store.min_year[idx]
        let max_y = store.max_year[idx]
        if ((req_yr >= min_y && req_yr <= max_y) || (max_y >= 1975 && req_yr >= 1975))
          score += 50000000
      }
      if (options.country) {
        let e_c = readPackedString(store.country_buf, store.country_offsets, idx).toLowerCase().trim()
        let req_c = options.country.toLowerCase().trim()
        if (e_c === req_c || req_c.includes(e_c) || e_c.includes(req_c))
          score += 10000000
      }
      score += Math.min(store.max_pop[idx] || 0, 999999)
      if (score > best_score) {
        best_score = score
        found_idx = idx
      }
    }
  }

  if (found_idx === -1 || (store.flags[found_idx] & FLAG_IS_BUGGED) !== 0)
    return null

  let hydrateRecord = function (arg0_idx: number): any {
    let idx = arg0_idx
    let s_idx = store.shard_idx[idx]
    let detail: any = null
    if (s_idx !== 65535 && s_idx < store.shard_files.length) {
      let pack_path = path.join(store.dataset_dir, 'shards', store.shard_files[s_idx])
      detail = readDetailPackRecord(pack_path, store.detail_offset[idx], store.detail_len[idx])
    }
    let key_str = readPackedString(store.key_buf, store.key_offsets, idx)
    let name_str = readPackedString(store.name_buf, store.name_offsets, idx)
    let country_str = readPackedString(store.country_buf, store.country_offsets, idx)
    let id_str = readPackedString(store.id_buf, store.id_offsets, idx)
    let other_str = readPackedString(store.other_buf, store.other_offsets, idx)
    let r_idx = store.region_idx[idx]
    let reg_str = (r_idx !== 65535 && r_idx < store.regions.length) ? store.regions[r_idx] : undefined

    if (!detail) {
      let pop_obj: Record<string, number> = {}
      let yrs: number[] = []
      let p_off = store.pop_offset[idx]
      let p_len = store.pop_len[idx]
      for (let x = 0; x < p_len; x++) {
        let yr = store.pop_years[p_off + x]
        yrs.push(yr)
        pop_obj[String(yr)] = store.pop_vals[p_off + x]
      }
      detail = {
        coords: [store.lat[idx], store.lon[idx]],
        country: country_str || undefined,
        id: id_str || key_str,
        key: key_str,
        max_pop: store.max_pop[idx],
        max_year: store.max_year[idx],
        min_year: store.min_year[idx],
        name: name_str,
        other_names: other_str ? other_str.split('\x1f') : undefined,
        population: pop_obj,
        region: reg_str,
        years: yrs,
      }
    }

    detail.name = name_str || detail.name
    detail.metadata_name = name_str
    let cap_recs = store.cap_records_by_idx.get(idx)
    if (cap_recs)
      detail.capital_records = cap_recs
    let hist_recs = store.hist_names_by_idx.get(idx)
    if (hist_recs)
      detail.historical_names = hist_recs
    return detail
  }

  let entry = hydrateRecord(found_idx)
  let cp_idx = store.counterpart_idx[found_idx]
  let cp = (cp_idx >= 0 && cp_idx < store.count) ? hydrateRecord(cp_idx) : null

  let effective_year = (year !== undefined && year !== null) ? year : 1950
  let num_yr = typeof effective_year === 'number' ? Math.floor(effective_year) : parseYearMonthDay(effective_year).year
  let num_mo = month !== undefined ? month : (typeof effective_year === 'string' ? parseYearMonthDay(effective_year).month : undefined)
  let num_day = day !== undefined ? day : (typeof effective_year === 'string' ? parseYearMonthDay(effective_year).day : undefined)
  let active_state_ids = AtlasBordersService.getActiveStateIdsAtDate(num_yr, num_mo, num_day)

  let cap_rec = getCityActiveCapitalRecord(entry, effective_year, (arg0_sid, arg0_y_frac) => {
    let sid_num = Number(arg0_sid)
    let state = getStateById(arg0_sid)
    if (!state || isStateAcapital(arg0_sid))
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
    if (!isCityInsideStateBBox(entry, state, 0.75))
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
      let cshapes_capitals = getBinaryAuthoritativeCapitalsAtYear(
        store,
        num_yr,
        num_mo ?? 1,
        num_day ?? 1,
        options.dataset || 'defacto_borders'
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

          if (state_matches && !cap_matches)
            should_override = false
          else if (state_area > cap_area && !cap_matches)
            should_override = false
        }
        if (should_override) {
          cap_color = cap_info.color
          cap_sid = cap_info.state_id
          is_capital = true
          polity_name = cap_info.name
        }
      }
    } catch {
      //Ignore borders lookup error
    }
  }

  let merged_pop = cp?.population ? { ...cp.population, ...entry.population } : entry.population
  let merged_area = cp?.area ? { ...cp.area, ...entry.area } : entry.area
  let merged_density = cp?.density ? { ...cp.density, ...entry.density } : entry.density
  let merged_other_names = entry.other_names
  if (entry.other_names && cp?.other_names && Array.isArray(entry.other_names) && Array.isArray(cp.other_names))
    merged_other_names = Array.from(new Set([...entry.other_names, ...cp.other_names]))
  else if (!merged_other_names && cp?.other_names)
    merged_other_names = cp.other_names

  let raw_sources: string[] = []
  if (Array.isArray(entry.sources)) {
    for (let i = 0; i < entry.sources.length; i++)
      raw_sources.push(entry.sources[i])
  } else if (typeof entry.type === 'string' && entry.type) {
    raw_sources.push(entry.type)
  }
  if (cp) {
    if (Array.isArray(cp.sources)) {
      for (let i = 0; i < cp.sources.length; i++)
        raw_sources.push(cp.sources[i])
    } else if (typeof cp.type === 'string' && cp.type) {
      raw_sources.push(cp.type)
    }
  }
  let merged_sources = raw_sources.length > 0
    ? Array.from(new Set(raw_sources.map((arg0_s) => String(arg0_s || '').trim()).filter(Boolean)))
    : undefined

  //Return statement
  return {
    ...entry,
    area: merged_area,
    capital_color: cap_color,
    capital_state_id: cap_sid,
    capital_state_name: polity_name,
    capitalColor: cap_color,
    capitalOf: polity_name,
    capitalStateId: cap_sid,
    counterpart_key: cp?.key,
    density: merged_density,
    is_capital: is_capital,
    isCapital: is_capital,
    name: resolveHistoricalCityName(entry, effective_year),
    other_names: merged_other_names,
    population: merged_pop,
    sources: merged_sources,
  }
}


/**
 * Serialises a CompactCitiesPayload into a hybrid binary wire Buffer (`STADWIRE`)
 * with raw TypedArrays for numeric columns and a compact UTF-8 JSON tail for strings.
 *
 * @param {CompactCitiesPayload} arg0_payload
 *
 * @returns {Buffer}
 */
export function packBinaryCitiesResponse (arg0_payload: CompactCitiesPayload): Buffer {
  //Convert from parameters
  let payload = arg0_payload

  //Declare local instance variables
  let count = payload.count || payload.keys.length
  let string_tail_buf = Buffer.from(
    JSON.stringify({
      capital_colors: payload.capital_colors,
      capital_names: payload.capital_names,
      countries: payload.countries,
      keys: payload.keys,
      names: payload.names,
      other_names: payload.other_names,
      regions: payload.regions,
    }),
    'utf8'
  )

  let header_bytes = 16
  let coords_bytes = count*2*4
  let pops_bytes = count*4
  let growth_bytes = count*4
  let caps_bytes = count
  let state_ids_bytes = count*4
  let total_bytes = header_bytes + coords_bytes + pops_bytes + growth_bytes + caps_bytes + state_ids_bytes + string_tail_buf.byteLength
  let out = Buffer.allocUnsafe(total_bytes)

  //Function body
  out.write(WIRE_MAGIC, 0, 8, 'ascii')
  out.writeUInt32LE(count, 8)
  out.writeUInt32LE(string_tail_buf.byteLength, 12)

  let offset = header_bytes
  for (let i = 0; i < count*2; i++) {
    out.writeFloatLE(payload.coords[i] || 0, offset)
    offset += 4
  }
  for (let i = 0; i < count; i++) {
    out.writeFloatLE(payload.pops[i] || 0, offset)
    offset += 4
  }
  for (let i = 0; i < count; i++) {
    out.writeFloatLE(payload.growth[i] || 0, offset)
    offset += 4
  }
  for (let i = 0; i < count; i++) {
    out[offset++] = payload.capitals && payload.capitals[i] ? 1 : 0
  }
  for (let i = 0; i < count; i++) {
    let sid = payload.capital_state_ids ? payload.capital_state_ids[i] : null
    out.writeInt32LE((sid !== null && sid !== undefined && Number.isFinite(Number(sid))) ? Number(sid) : -1, offset)
    offset += 4
  }
  string_tail_buf.copy(out, offset)

  //Return statement
  return out
}
