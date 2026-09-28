import {
  DataFormat,
  DecodedRaster,
} from '@/framework/geopng/types'
import {
  decodeRawGeoPngBufferAsync,
  buildDecodedRasterResult,
} from '@/framework/geopng/decoder'
import { interpolateRasters } from '@/framework/geopng/interpolate'

/**
 * Computes Cartesian product of selector choices.
 *
 * @param {Record<string, string | string[]>} arg0_selectors
 *
 * @returns {Array<Record<string, string>>}
 */
export function getSelectorCombinations (
  arg0_selectors: Record<string, string | string[]>
): Array<Record<string, string>> {
  //Convert from parameters
  let selectors = arg0_selectors

  //Declare local instance variables
  let combinations: Array<Record<string, string>> = [{}]
  let keys = Object.keys(selectors)

  //Function body
  for (let i = 0; i < keys.length; i++) {
    let k = keys[i]
    let raw_val = selectors[k]
    let val_array = Array.isArray(raw_val) ? raw_val : [raw_val]
    if (val_array.length === 0)
      continue

    let next_combinations: Array<Record<string, string>> = []
    for (let x = 0; x < combinations.length; x++) {
      let current = combinations[x]
      for (let y = 0; y < val_array.length; y++) {
        let v = val_array[y]
        next_combinations.push({
          ...current,
          [k]: v,
        })
      }
    }
    combinations = next_combinations
  }

  //Return statement
  return combinations
}

/**
 * Shifts a decoded raster vertically north by the specified number of pixels.
 *
 * @param {DecodedRaster} arg0_raster
 * @param {number} arg1_pixels
 *
 * @returns {DecodedRaster}
 */
export function shiftRasterNorth (
  arg0_raster: DecodedRaster,
  arg1_pixels: number
): DecodedRaster {
  //Convert from parameters
  let pixels = Math.max(0, Math.round(arg1_pixels))
  let raster = arg0_raster

  //Guard clauses
  if (pixels === 0)
    return raster

  //Declare local instance variables
  let dst_data: Float32Array
  let h = raster.height
  let src_data = raster.data
  let w = raster.width

  //Function body
  dst_data = new Float32Array(w*h)
  dst_data.fill(NaN)

  for (let r = 0; r < h; r++) {
    let src_r = r + pixels
    if (src_r < h) {
      let dst_offset = r*w
      let src_offset = src_r*w
      for (let c = 0; c < w; c++)
        dst_data[dst_offset + c] = src_data[src_offset + c]
    }
  }

  //Return statement
  return buildDecodedRasterResult(
    dst_data,
    w,
    h,
    raster.min,
    raster.max,
    raster.mean,
    raster.stdDev,
    raster.validCount,
    raster.totalCells
  )
}

/**
 * Culls the in-memory raster cache dynamically based on memory pressure and performant mode.
 *
 * @param {Map<string, DecodedRaster>} arg0_cache
 * @param {boolean} [arg1_performant_mode=false]
 * @param {string} [arg2_preserve_key]
 *
 * @returns {void}
 */
/**
 * Culls the in-memory raster cache dynamically based on memory pressure and performant mode.
 *
 * @param {Map<string, DecodedRaster>} arg0_cache
 * @param {boolean} [arg1_performant_mode=false]
 * @param {string | string[]} [arg2_preserve_keys]
 *
 * @returns {void}
 */
export function cullRasterCache (
  arg0_cache: Map<string, DecodedRaster>,
  arg1_performant_mode?: boolean,
  arg2_preserve_keys?: string | string[],
  arg3_is_playing?: boolean
): void {
  //Convert from parameters
  let cache = arg0_cache
  let is_playing = Boolean(arg3_is_playing)
  let performant_mode = Boolean(arg1_performant_mode)
  let preserve_keys_raw = arg2_preserve_keys

  //Declare local instance variables
  let is_memory_pressured = false
  let max_allowed_entries: number
  let memory_info = (performance as any)?.memory
  let min_required: number
  let preserve_set = new Set<string>()

  //Function body
  if (typeof preserve_keys_raw === 'string') {
    preserve_set.add(preserve_keys_raw)
  } else if (Array.isArray(preserve_keys_raw)) {
    for (let i = 0; i < preserve_keys_raw.length; i++)
      preserve_set.add(preserve_keys_raw[i])
  }

  if (memory_info && memory_info.jsHeapSizeLimit > 0) {
    let heap_ratio = memory_info.usedJSHeapSize/memory_info.jsHeapSizeLimit
    if (heap_ratio > 0.6)
      is_memory_pressured = true
  }

  min_required = Math.max(1, preserve_set.size)
  max_allowed_entries = (performant_mode || is_playing)
    ? min_required
    : (is_memory_pressured ? Math.max(2, min_required) : Math.max(3, min_required))

  if (cache.size > max_allowed_entries) {
    let all_keys = Array.from(cache.keys())
    for (let i = 0; i < all_keys.length; i++) {
      let k = all_keys[i]
      if (cache.size <= max_allowed_entries)
        break
      if (k.startsWith('raw:') && !preserve_set.has(k))
        cache.delete(k)
    }

    if (cache.size > max_allowed_entries) {
      all_keys = Array.from(cache.keys())
      for (let i = 0; i < all_keys.length; i++) {
        let k = all_keys[i]
        if (cache.size <= max_allowed_entries)
          break
        if (!preserve_set.has(k))
          cache.delete(k)
      }
    }
  }
}

let in_flight_fetches = new Map<string, Promise<DecodedRaster | null>>()

/**
 * Fetches and decodes a single GeoPNG raster from backend API.
 *
 * @param {string} arg0_layer_id
 * @param {number} arg1_year
 * @param {Record<string, string>} arg2_selectors
 * @param {DataFormat} arg3_format
 * @param {Map<string, DecodedRaster>} arg4_cache
 * @param {boolean} [arg5_has_selectors]
 * @param {number | { covariate?: string; x?: number; y?: number }} [arg6_pixel_offset]
 * @param {boolean} [arg7_performant_mode]
 * @param {AbortSignal} [arg8_signal]
 * @param {boolean} [arg9_can_be_uninhabited]
 *
 * @returns {Promise<DecodedRaster | null>}
 */
export async function fetchSingleDecodedRasterAsync (
  arg0_layer_id: string,
  arg1_year: number,
  arg2_selectors: Record<string, string>,
  arg3_format: DataFormat,
  arg4_cache: Map<string, DecodedRaster>,
  arg5_has_selectors?: boolean,
  arg6_pixel_offset?: number | { covariate?: string; x?: number; y?: number },
  arg7_performant_mode?: boolean,
  arg8_signal?: AbortSignal,
  arg9_can_be_uninhabited?: boolean
): Promise<DecodedRaster | null> {
  //Convert from parameters
  let cache = arg4_cache
  let can_be_uninhabited = Boolean(arg9_can_be_uninhabited)
  let format = arg3_format
  let has_selectors = Boolean(arg5_has_selectors)
  let layer_id = arg0_layer_id
  let performant_mode = Boolean(arg7_performant_mode)
  let pixel_offset = arg6_pixel_offset
  let selectors = arg2_selectors
  let signal = arg8_signal
  let year = arg1_year

  //Declare local instance variables
  let cache_key: string
  let pending_promise: Promise<DecodedRaster | null>
  let po_key = typeof pixel_offset === 'number'
    ? `po${pixel_offset}`
    : (pixel_offset && typeof pixel_offset === 'object' && pixel_offset.covariate
      ? `po${pixel_offset.y || 0}_${pixel_offset.covariate}`
      : 'po0')
  let sel_keys = has_selectors ? Object.keys(selectors).sort() : []
  let sel_part = sel_keys.map((arg0_k) => `${arg0_k}=${selectors[arg0_k]}`).join(':')

  //Construct cache_key
  cache_key = has_selectors && sel_part.length > 0
    ? `${layer_id}:${sel_part}:${year}:${format}:${po_key}`
    : `${layer_id}:${year}:${format}:${po_key}`

  //Guard clauses
  if (cache.has(cache_key))
    return cache.get(cache_key)!

  if (signal?.aborted) {
    in_flight_fetches.delete(cache_key)
    return null
  }

  if (in_flight_fetches.has(cache_key))
    return in_flight_fetches.get(cache_key)!

  if (signal)
    signal.addEventListener('abort', () => in_flight_fetches.delete(cache_key), { once: true })

  pending_promise = (async () => {
    try {
      let query_params = new URLSearchParams({
        layer: layer_id,
        year: year.toString(),
      })
      if (has_selectors) {
        for (let i = 0; i < sel_keys.length; i++) {
          let sk = sel_keys[i]
          if (selectors[sk])
            query_params.set(sk, selectors[sk])
        }
      }

      let resp = await fetch(`/api/raster/file?${query_params.toString()}`, { signal })
      if (!resp.ok)
        return null

      let buf = await resp.arrayBuffer()
      let uint8 = new Uint8Array(buf)
      let is_stadester_layer = layer_id === 'population_total' ||
        layer_id === 'population_rural' ||
        layer_id === 'population_urban' ||
        layer_id === 'population_density' ||
        layer_id.includes('stadester')
      let min_threshold = is_stadester_layer ? 0.01 : undefined
      let decoded = await decodeRawGeoPngBufferAsync(uint8, format, min_threshold)

      //Apply pixel offset if configured
      if (typeof pixel_offset === 'number' && pixel_offset !== 0) {
        decoded = shiftRasterNorth(decoded, pixel_offset)
      } else if (typeof pixel_offset === 'object' && pixel_offset !== null && pixel_offset.covariate) {
        let covariate_id = pixel_offset.covariate
        let raw_covariate: DecodedRaster | null = null
        let raw_key = `raw:${covariate_id}:${year}:${format}`
        let y_offset = pixel_offset.y ? Math.max(0, Math.round(pixel_offset.y)) : 0

        if (cache.has(raw_key)) {
          raw_covariate = cache.get(raw_key)!
        } else {
          try {
            let cov_resp = await fetch(`/api/raster/file?layer=${covariate_id}&year=${year.toString()}`, { signal })
            if (cov_resp.ok) {
              let cov_buf = await cov_resp.arrayBuffer()
              let is_cov_stadester = covariate_id === 'population_total' ||
                covariate_id === 'population_rural' ||
                covariate_id === 'population_urban' ||
                covariate_id === 'population_density' ||
                covariate_id.includes('stadester')
              let cov_threshold = is_cov_stadester ? 0.01 : undefined
              raw_covariate = await decodeRawGeoPngBufferAsync(new Uint8Array(cov_buf), format, cov_threshold)
              if (!performant_mode)
                cache.set(raw_key, raw_covariate)
            }
          } catch (arg0_cov_err) {
            console.error(`Failed to fetch raw covariate ${covariate_id}:`, arg0_cov_err)
          }
        }

        if (raw_covariate && raw_covariate.data.length === decoded.data.length && y_offset > 0) {
          let cov_data = raw_covariate.data
          let h = decoded.height
          let len = decoded.data.length
          let new_total = new Float32Array(len)
          let shifted_cov = shiftRasterNorth(raw_covariate, y_offset)
          let shifted_cov_data = shifted_cov.data
          let tot_data = decoded.data
          let w = decoded.width

          new_total.fill(NaN)

          for (let r = 0; r < h; r++) {
            let row_offset = r*w
            for (let c = 0; c < w; c++) {
              let i = row_offset + c
              let t_val = tot_data[i]
              let c_val = cov_data[i]
              let sc_val = shifted_cov_data[i]

              let rural = Math.max(0, (Number.isNaN(t_val) ? 0 : t_val) - (Number.isNaN(c_val) ? 0 : c_val))

              if ((rural < 0.01 || Number.isNaN(rural)) && !Number.isNaN(c_val) && c_val >= 0.01 && Number.isNaN(sc_val)) {
                let count = 0
                let sum = 0
                for (let dr = -2; dr <= 2; dr++) {
                  let nr = r + dr
                  if (nr >= 0 && nr < h) {
                    let n_row_offset = nr*w
                    for (let dc = -2; dc <= 2; dc++) {
                      let nc = c + dc
                      if (nc >= 0 && nc < w) {
                        let ni = n_row_offset + nc
                        let nu = cov_data[ni]
                        let nt = tot_data[ni]
                        if (Number.isNaN(nu) && !Number.isNaN(nt) && nt >= 0.01) {
                          sum += nt
                          count++
                        }
                      }
                    }
                  }
                }
                if (count > 0)
                  rural = Math.round(sum/count)
              }

              let tot = rural + (Number.isNaN(sc_val) ? 0 : sc_val)
              if (tot >= 0.01)
                new_total[i] = tot
            }
          }
          decoded = buildDecodedRasterResult(new_total, decoded.width, decoded.height)
        }
      }

      //Mask uninhabited cells (<0.01) in Stadestér population rasters
      if (is_stadester_layer) {
        let d = decoded.data
        let len = d.length
        let has_under_threshold = false
        for (let i = 0; i < len; i++) {
          let p = d[i]
          if (!Number.isNaN(p) && p < 0.01) {
            d[i] = NaN
            has_under_threshold = true
          }
        }
        if (has_under_threshold)
          decoded = buildDecodedRasterResult(d, decoded.width, decoded.height)
      }

      let is_pop_layer = (
        layer_id === 'population_total' ||
        layer_id.endsWith('.population_total') ||
        layer_id === 'population_rural' ||
        layer_id.endsWith('.population_rural') ||
        layer_id === 'population_urban' ||
        layer_id.endsWith('.population_urban') ||
        layer_id === 'population_density' ||
        layer_id.endsWith('.population_density')
      )

      //Mask uninhabited cells as NaN if layer requires human habitation
      if (!can_be_uninhabited && !is_pop_layer) {
        let pop_raster = await fetchSingleDecodedRasterAsync(
          'population_total',
          year,
          {},
          'float32',
          cache,
          false,
          undefined,
          performant_mode,
          signal,
          true
        )
        let pop_data = pop_raster?.data
        if (pop_data && pop_data.length === decoded.data.length) {
          let d = decoded.data
          let len = d.length
          for (let i = 0; i < len; i++) {
            let p = pop_data[i]
            if (p < 0.01 || Number.isNaN(p))
              d[i] = NaN
          }
          decoded = buildDecodedRasterResult(d, decoded.width, decoded.height)
        }
      }

      cache.set(cache_key, decoded)
      cullRasterCache(cache, performant_mode, cache_key)
      return decoded
    } catch (arg0_e: any) {
      if (arg0_e?.name !== 'AbortError')
        console.error(`Failed to fetch raster for ${layer_id} at year ${year}:`, arg0_e)
      return null
    } finally {
      in_flight_fetches.delete(cache_key)
    }
  })()

  in_flight_fetches.set(cache_key, pending_promise)
  return pending_promise
}

/**
 * Fetches and decodes a GeoPNG raster (or composited multi-selector sum) from backend API.
 *
 * @param {string} arg0_layer_id
 * @param {number} arg1_year
 * @param {Record<string, string | string[]>} arg2_selectors
 * @param {DataFormat} arg3_format
 * @param {Map<string, DecodedRaster>} arg4_cache
 * @param {boolean} [arg5_has_selectors]
 * @param {number | { covariate?: string; x?: number; y?: number }} [arg6_pixel_offset]
 * @param {boolean} [arg7_performant_mode]
 * @param {AbortSignal} [arg8_signal]
 * @param {boolean} [arg9_can_be_uninhabited]
 *
 * @returns {Promise<DecodedRaster | null>}
 */
export async function fetchRasterKeyframe (
  arg0_layer_id: string,
  arg1_year: number,
  arg2_selectors: Record<string, string | string[]>,
  arg3_format: DataFormat,
  arg4_cache: Map<string, DecodedRaster>,
  arg5_has_selectors?: boolean,
  arg6_pixel_offset?: number | { covariate?: string; x?: number; y?: number },
  arg7_performant_mode?: boolean,
  arg8_signal?: AbortSignal,
  arg9_can_be_uninhabited?: boolean
): Promise<DecodedRaster | null> {
  //Convert from parameters
  let cache = arg4_cache
  let can_be_uninhabited = Boolean(arg9_can_be_uninhabited)
  let format = arg3_format
  let has_selectors = Boolean(arg5_has_selectors)
  let layer_id = arg0_layer_id
  let performant_mode = Boolean(arg7_performant_mode)
  let pixel_offset = arg6_pixel_offset
  let selectors = arg2_selectors
  let signal = arg8_signal
  let year = arg1_year

  //Declare local instance variables
  let combinations = has_selectors ? getSelectorCombinations(selectors) : [{}]
  let composite_cache_key: string
  let composite_promise: Promise<DecodedRaster | null>
  let po_key = typeof pixel_offset === 'number'
    ? `po${pixel_offset}`
    : (pixel_offset && typeof pixel_offset === 'object' && pixel_offset.covariate
      ? `po${pixel_offset.y || 0}_${pixel_offset.covariate}`
      : 'po0')
  let sel_keys = has_selectors ? Object.keys(selectors).sort() : []
  let sel_part = sel_keys.map((arg0_k) => {
    let val = selectors[arg0_k]
    let str_val = Array.isArray(val) ? val.slice().sort().join(',') : val
    return `${arg0_k}=${str_val}`
  }).join(':')

  //Construct composite_cache_key
  composite_cache_key = has_selectors && sel_part.length > 0
    ? `${layer_id}:${sel_part}:${year}:${format}:${po_key}`
    : `${layer_id}:${year}:${format}:${po_key}`

  //Fast path: already in cache
  if (cache.has(composite_cache_key))
    return cache.get(composite_cache_key)!

  if (signal?.aborted) {
    in_flight_fetches.delete(composite_cache_key)
    return null
  }

  if (in_flight_fetches.has(composite_cache_key))
    return in_flight_fetches.get(composite_cache_key)!

  if (signal)
    signal.addEventListener('abort', () => in_flight_fetches.delete(composite_cache_key), { once: true })

  if (combinations.length <= 1) {
    let single_sel = combinations[0] || {}
    return fetchSingleDecodedRasterAsync(
      layer_id,
      year,
      single_sel,
      format,
      cache,
      has_selectors,
      pixel_offset,
      performant_mode,
      signal,
      can_be_uninhabited
    )
  }

  //Multi-select Cartesian composite
  composite_promise = (async () => {
    try {
      let raster_promises = combinations.map((arg0_comb) =>
        fetchSingleDecodedRasterAsync(
          layer_id,
          year,
          arg0_comb,
          format,
          cache,
          has_selectors,
          pixel_offset,
          performant_mode,
          signal,
          can_be_uninhabited
        )
      )
      let results = await Promise.all(raster_promises)
      let valid_rasters = results.filter((arg0_r): arg0_r is DecodedRaster => arg0_r !== null)

      if (valid_rasters.length === 0)
        return null

      let composite: DecodedRaster
      if (valid_rasters.length === 1) {
        composite = valid_rasters[0]
      } else {
        let base = valid_rasters[0]
        let len = base.width*base.height
        let sum_data = new Float32Array(len)

        for (let i = 0; i < valid_rasters.length; i++) {
          let r_data = valid_rasters[i].data
          for (let idx = 0; idx < len; idx++) {
            let v = r_data[idx]
            if (Number.isNaN(v)) {
              sum_data[idx] = NaN
            } else if (!Number.isNaN(sum_data[idx])) {
              sum_data[idx] += v
            }
          }
        }

        composite = buildDecodedRasterResult(sum_data, base.width, base.height)
      }

      cache.set(composite_cache_key, composite)
      cullRasterCache(cache, performant_mode, composite_cache_key)
      return composite
    } catch (arg0_err: any) {
      if (arg0_err?.name !== 'AbortError')
        console.error(`Failed to composite multi-selector raster for ${layer_id}:`, arg0_err)
      return null
    } finally {
      in_flight_fetches.delete(composite_cache_key)
    }
  })()

  in_flight_fetches.set(composite_cache_key, composite_promise)
  return composite_promise
}

/**
 * Fetches and interpolates rasters between bounding keyframe years for arbitrary timeline years.
 *
 * @param {string} arg0_layer_id
 * @param {number} arg1_timeline_year
 * @param {number[]} arg2_available_years
 * @param {Record<string, string | string[]>} arg3_selectors
 * @param {DataFormat} arg4_format
 * @param {Map<string, DecodedRaster>} arg5_cache
 * @param {boolean} [arg6_has_selectors]
 * @param {number | { covariate?: string; x?: number; y?: number }} [arg7_pixel_offset]
 * @param {boolean} [arg8_performant_mode]
 * @param {boolean} [arg9_snap_to_keyframes]
 * @param {AbortSignal} [arg10_signal]
 * @param {boolean} [arg11_can_be_uninhabited]
 *
 * @returns {Promise<DecodedRaster | null>}
 */
export async function fetchInterpolatedRasterAsync (
  arg0_layer_id: string,
  arg1_timeline_year: number,
  arg2_available_years: number[],
  arg3_selectors: Record<string, string | string[]>,
  arg4_format: DataFormat,
  arg5_cache: Map<string, DecodedRaster>,
  arg6_has_selectors?: boolean,
  arg7_pixel_offset?: number | { covariate?: string; x?: number; y?: number },
  arg8_performant_mode?: boolean,
  arg9_snap_to_keyframes?: boolean,
  arg10_signal?: AbortSignal,
  arg11_can_be_uninhabited?: boolean
): Promise<DecodedRaster | null> {
  //Convert from parameters
  let cache = arg5_cache
  let can_be_uninhabited = Boolean(arg11_can_be_uninhabited)
  let format = arg4_format
  let has_selectors = Boolean(arg6_has_selectors)
  let layer_id = arg0_layer_id
  let performant_mode = Boolean(arg8_performant_mode)
  let pixel_offset = arg7_pixel_offset
  let selectors = arg3_selectors
  let signal = arg10_signal
  let snap_to_keyframes = Boolean(arg9_snap_to_keyframes)
  let timeline_year = arg1_timeline_year
  let years = arg2_available_years

  //Guard clauses
  if (!years || years.length === 0)
    return fetchRasterKeyframe(layer_id, timeline_year, selectors, format, cache, has_selectors, pixel_offset, performant_mode, signal, can_be_uninhabited)

  //Declare local instance variables
  let next_year = years[years.length - 1]
  let prev_year = years[0]
  let primary_year: number

  //Function body
  for (let i = 0; i < years.length; i++) {
    if (years[i] <= timeline_year)
      prev_year = years[i]
    if (years[i] >= timeline_year) {
      next_year = years[i]
      break
    }
  }

  if (snap_to_keyframes || prev_year === next_year || timeline_year <= prev_year || timeline_year >= next_year) {
    primary_year = snap_to_keyframes
      ? (Math.abs(timeline_year - prev_year) <= Math.abs(timeline_year - next_year) ? prev_year : next_year)
      : prev_year
    return fetchRasterKeyframe(layer_id, primary_year, selectors, format, cache, has_selectors, pixel_offset, performant_mode, signal, can_be_uninhabited)
  }

  let [r_a, r_b] = await Promise.all([
    fetchRasterKeyframe(layer_id, prev_year, selectors, format, cache, has_selectors, pixel_offset, performant_mode, signal, can_be_uninhabited),
    fetchRasterKeyframe(layer_id, next_year, selectors, format, cache, has_selectors, pixel_offset, performant_mode, signal, can_be_uninhabited),
  ])

  if (r_a && r_b) {
    let t = (timeline_year - prev_year)/(next_year - prev_year)
    return interpolateRasters(r_a, r_b, t, !can_be_uninhabited)
  }

  //Return statement
  return r_a || r_b || null
}

