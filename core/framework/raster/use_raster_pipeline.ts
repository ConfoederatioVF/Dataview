import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  AppMode,
  DataFormat,
  DecodedRaster,
} from '@/framework/geopng/types'
import {
  computeRasterDifference,
} from '@/framework/geopng/decoder'
import { ParsedDataLayer } from '@server/layer_parser'
import { interpolateRasters } from '@/framework/geopng/interpolate'
import {
  getSelectorCombinations,
  shiftRasterNorth,
  cullRasterCache,
  fetchRasterKeyframe,
  fetchInterpolatedRasterAsync,
} from './raster_fetch_utils'

// Re-export utilities for external consumers
export {
  getSelectorCombinations,
  shiftRasterNorth,
  cullRasterCache,
  fetchRasterKeyframe,
  fetchInterpolatedRasterAsync,
}

export interface UseRasterPipelineParams {
  activeLayer: ParsedDataLayer | null
  activeLayerId: string | null
  activeVariableSelectors: Record<string, string | string[]>
  appMode: AppMode
  dataFormat: DataFormat
  isHeadlessExport?: boolean
  isPlaying: boolean
  performantMode: boolean
  snapToKeyframes: boolean
  timelineYear: number
}

export interface UseRasterPipelineResult {
  activeFileName: string
  clearCache: () => void
  diffNameA: string
  diffNameB: string
  displayRaster: DecodedRaster | null
  isLoadingRaster: boolean
  rasterA: DecodedRaster | null
  rasterB: DecodedRaster | null
  rasterCacheRef: React.MutableRefObject<Map<string, DecodedRaster>>
  rasterVersion: number
  rawBytesA: Uint8Array | null
  rawBytesB: Uint8Array | null
  setActiveFileName: React.Dispatch<React.SetStateAction<string>>
  setDiffNameA: React.Dispatch<React.SetStateAction<string>>
  setDiffNameB: React.Dispatch<React.SetStateAction<string>>
  setRasterA: React.Dispatch<React.SetStateAction<DecodedRaster | null>>
  setRasterB: React.Dispatch<React.SetStateAction<DecodedRaster | null>>
  setRasterVersion: React.Dispatch<React.SetStateAction<number>>
  setRawBytesA: React.Dispatch<React.SetStateAction<Uint8Array | null>>
  setRawBytesB: React.Dispatch<React.SetStateAction<Uint8Array | null>>
}

/**
 * Custom hook to manage asynchronous raster keyframe loading, memory-capped caching, and interpolation.
 *
 * @param {UseRasterPipelineParams} arg0_params
 *
 * @returns {UseRasterPipelineResult}
 */


export function useRasterPipeline (arg0_params: UseRasterPipelineParams): UseRasterPipelineResult {
  //Convert from parameters
  let active_layer = arg0_params.activeLayer
  let active_layer_id = arg0_params.activeLayerId
  let active_variable_selectors = arg0_params.activeVariableSelectors
  let app_mode = arg0_params.appMode
  let data_format = arg0_params.dataFormat
  let is_headless_export = Boolean(arg0_params.isHeadlessExport)
  let is_playing = arg0_params.isPlaying
  let performant_mode = arg0_params.performantMode
  let snap_to_keyframes = arg0_params.snapToKeyframes
  let timeline_year = arg0_params.timelineYear

  //Declare local instance variables
  let abort_controller_ref = useRef<AbortController | null>(null)
  let active_file_name: string
  let active_layer_id_ref = useRef<string | null>(active_layer_id)
  let clear_cache: () => void
  let diff_name_a: string
  let current_interp_years_ref = useRef<{ next_year: number; prev_year: number } | null>(null)
  let diff_name_b: string
  let display_raster: DecodedRaster | null
  let displayed_year_ref = useRef<number | null>(null)
  let in_flight_fetches_count_ref = useRef<number>(0)
  let interp_buffer_ref = useRef<Float32Array | null>(null)
  let is_loading_raster: boolean
  let last_interp_pair_ref = useRef<{ a: DecodedRaster | null; b: DecodedRaster | null; t: number } | null>(null)
  let last_interp_raster_ref = useRef<DecodedRaster | null>(null)
  let load_req_id_ref = useRef<number>(0)
  let raster_a: DecodedRaster | null
  let raster_b: DecodedRaster | null
  let raster_cache_ref = useRef<Map<string, DecodedRaster>>(new Map())
  let raster_version: number
  let raw_bytes_a: Uint8Array | null
  let raw_bytes_b: Uint8Array | null
  let set_active_file_name: React.Dispatch<React.SetStateAction<string>>
  let set_diff_name_a: React.Dispatch<React.SetStateAction<string>>
  let set_diff_name_b: React.Dispatch<React.SetStateAction<string>>
  let set_is_loading_raster: React.Dispatch<React.SetStateAction<boolean>>
  let set_raster_a: React.Dispatch<React.SetStateAction<DecodedRaster | null>>
  let set_raster_b: React.Dispatch<React.SetStateAction<DecodedRaster | null>>
  let set_raster_version: React.Dispatch<React.SetStateAction<number>>
  let set_raw_bytes_a: React.Dispatch<React.SetStateAction<Uint8Array | null>>
  let set_raw_bytes_b: React.Dispatch<React.SetStateAction<Uint8Array | null>>

  //Function body
  ;[active_file_name, set_active_file_name] = useState<string>('')
  ;[diff_name_a, set_diff_name_a] = useState<string>('')
  ;[diff_name_b, set_diff_name_b] = useState<string>('')
  ;[is_loading_raster, set_is_loading_raster] = useState<boolean>(false)
  ;[raster_a, set_raster_a] = useState<DecodedRaster | null>(null)
  ;[raster_b, set_raster_b] = useState<DecodedRaster | null>(null)
  ;[raster_version, set_raster_version] = useState<number>(0)
  ;[raw_bytes_a, set_raw_bytes_a] = useState<Uint8Array | null>(null)
  ;[raw_bytes_b, set_raw_bytes_b] = useState<Uint8Array | null>(null)

  active_layer_id_ref.current = active_layer_id

  clear_cache = useCallback(() => {
    raster_cache_ref.current.clear()
    current_interp_years_ref.current = null
    last_interp_pair_ref.current = null
    last_interp_raster_ref.current = null
  }, [])

  //Clear cache when performant mode is toggled
  useEffect(() => {
    raster_cache_ref.current.clear()
    current_interp_years_ref.current = null
    last_interp_pair_ref.current = null
    last_interp_raster_ref.current = null
  }, [performant_mode])

  //Prune stale layer entries when active layer changes
  useEffect(() => {
    let current_layer = active_layer_id
    if (current_layer) {
      let cache = raster_cache_ref.current
      let all_keys = Array.from(cache.keys())
      for (let i = 0; i < all_keys.length; i++) {
        let k = all_keys[i]
        if (!k.startsWith(`${current_layer}:`))
          cache.delete(k)
      }
    }
    current_interp_years_ref.current = null
    last_interp_pair_ref.current = null
    last_interp_raster_ref.current = null
  }, [active_layer_id])

  //Fetch raster keyframes on year/layer/selector update
  useEffect(() => {
    if (!active_layer)
      return

    let requested_layer_id = active_layer_id
    if (!requested_layer_id)
      return

    let years = active_layer.available_years || (active_layer as any).years
    if (!years || years.length === 0)
      return

    //Abort any obsolete in-flight requests immediately
    if (abort_controller_ref.current)
      abort_controller_ref.current.abort()

    let controller = new AbortController()
    abort_controller_ref.current = controller

    let can_be_uninhabited = Boolean(active_layer.can_be_uninhabited)
    let current_req_id = ++load_req_id_ref.current
    let layer_pixel_offset = active_layer.pixel_offset

    let prev_year = years[0]
    let next_year = years[years.length - 1]

    for (let i = 0; i < years.length; i++) {
      if (years[i] <= timeline_year)
        prev_year = years[i]
      if (years[i] >= timeline_year) {
        next_year = years[i]
        break
      }
    }

    let primary_year = snap_to_keyframes
      ? Math.abs(timeline_year - prev_year) <= Math.abs(timeline_year - next_year)
        ? prev_year
        : next_year
      : prev_year

    let is_interpolating = !snap_to_keyframes && prev_year !== next_year && timeline_year > prev_year && timeline_year < next_year

    let effective_format: DataFormat = (active_layer.encoding as DataFormat) || (active_layer as any).format || data_format
    let effective_selectors: Record<string, string | string[]> = {}
    let has_selectors = Boolean(active_layer.variable_selectors && Object.keys(active_layer.variable_selectors).length > 0)

    if (has_selectors && active_layer.variable_selectors) {
      let valid_keys = Object.keys(active_layer.variable_selectors)
      for (let i = 0; i < valid_keys.length; i++) {
        let sk = valid_keys[i]
        let sel_def = active_layer.variable_selectors[sk]
        let opt_keys = Object.keys(sel_def.options || {})
        let raw_val = active_variable_selectors[sk]
        let chosen_vals = Array.isArray(raw_val) ? raw_val : [raw_val || opt_keys[0] || '']
        let valid_chosen_vals = chosen_vals.filter((arg0_val) => sel_def.options[arg0_val])
        if (valid_chosen_vals.length === 0 && opt_keys.length > 0)
          valid_chosen_vals = [opt_keys[0]]
        effective_selectors[sk] = valid_chosen_vals
      }
    }

    let po_key = typeof layer_pixel_offset === 'number'
      ? `po${layer_pixel_offset}`
      : (layer_pixel_offset && typeof layer_pixel_offset === 'object' && layer_pixel_offset.covariate
        ? `po${layer_pixel_offset.y || 0}_${layer_pixel_offset.covariate}`
        : 'po0')
    let sel_keys = has_selectors ? Object.keys(effective_selectors).sort() : []
    let sel_part = sel_keys.map((arg0_k) => {
      let val = effective_selectors[arg0_k]
      let str_val = Array.isArray(val) ? val.slice().sort().join(',') : val
      return `${arg0_k}=${str_val}`
    }).join(':')

    let cache_key_a = has_selectors && sel_part.length > 0
      ? `${requested_layer_id}:${sel_part}:${is_interpolating ? prev_year : primary_year}:${effective_format}:${po_key}`
      : `${requested_layer_id}:${is_interpolating ? prev_year : primary_year}:${effective_format}:${po_key}`

    let cache_key_b = has_selectors && sel_part.length > 0
      ? `${requested_layer_id}:${sel_part}:${next_year}:${effective_format}:${po_key}`
      : `${requested_layer_id}:${next_year}:${effective_format}:${po_key}`

    if (is_interpolating) {
      let has_a = raster_cache_ref.current.has(cache_key_a)
      let has_b = raster_cache_ref.current.has(cache_key_b)

      if (has_a && has_b) {
        current_interp_years_ref.current = { next_year, prev_year }
        displayed_year_ref.current = timeline_year
        set_raster_a(raster_cache_ref.current.get(cache_key_a)!)
        set_raster_b(raster_cache_ref.current.get(cache_key_b)!)
        set_active_file_name('')
        set_raster_version((arg0_v) => arg0_v + 1)
        set_is_loading_raster(false)
        cullRasterCache(raster_cache_ref.current, performant_mode, [cache_key_a, cache_key_b], is_playing)
      } else {
        set_is_loading_raster(true)
        in_flight_fetches_count_ref.current++

        Promise.all([
          fetchRasterKeyframe(requested_layer_id, prev_year, effective_selectors, effective_format, raster_cache_ref.current, has_selectors, layer_pixel_offset, performant_mode, controller.signal, can_be_uninhabited),
          fetchRasterKeyframe(requested_layer_id, next_year, effective_selectors, effective_format, raster_cache_ref.current, has_selectors, layer_pixel_offset, performant_mode, controller.signal, can_be_uninhabited),
        ])
          .then(([arg0_primary, arg0_secondary]) => {
            in_flight_fetches_count_ref.current = Math.max(0, in_flight_fetches_count_ref.current - 1)
            if (in_flight_fetches_count_ref.current === 0)
              set_is_loading_raster(false)

            if (active_layer_id_ref.current !== requested_layer_id || load_req_id_ref.current !== current_req_id)
              return

            if (arg0_primary) {
              current_interp_years_ref.current = { next_year, prev_year }
              displayed_year_ref.current = timeline_year
              set_raster_a(arg0_primary)
              if (arg0_secondary)
                set_raster_b(arg0_secondary)
              set_active_file_name('')
              set_raster_version((arg0_v) => arg0_v + 1)
              cullRasterCache(raster_cache_ref.current, performant_mode, [cache_key_a, cache_key_b], is_playing)
            }
          })
          .catch((arg0_err) => {
            in_flight_fetches_count_ref.current = Math.max(0, in_flight_fetches_count_ref.current - 1)
            if (in_flight_fetches_count_ref.current === 0)
              set_is_loading_raster(false)
            if (arg0_err?.name !== 'AbortError')
              console.error('Failed to load raster keyframe pair:', arg0_err)
          })
      }
    } else {
      current_interp_years_ref.current = null
      if (raster_cache_ref.current.has(cache_key_a)) {
        let cached = raster_cache_ref.current.get(cache_key_a)!
        displayed_year_ref.current = primary_year
        set_raster_a(cached)
        set_raster_b(null)
        set_active_file_name('')
        set_raster_version((arg0_v) => arg0_v + 1)
        set_is_loading_raster(false)
      } else {
        set_is_loading_raster(true)
        in_flight_fetches_count_ref.current++

        fetchRasterKeyframe(
          requested_layer_id,
          primary_year,
          effective_selectors,
          effective_format,
          raster_cache_ref.current,
          has_selectors,
          layer_pixel_offset,
          performant_mode,
          controller.signal,
          can_be_uninhabited
        )
          .then((arg0_primary) => {
            in_flight_fetches_count_ref.current = Math.max(0, in_flight_fetches_count_ref.current - 1)
            if (in_flight_fetches_count_ref.current === 0)
              set_is_loading_raster(false)

            if (active_layer_id_ref.current !== requested_layer_id || load_req_id_ref.current !== current_req_id)
              return

            if (arg0_primary) {
              displayed_year_ref.current = primary_year
              set_raster_a(arg0_primary)
              set_raster_b(null)
              set_active_file_name('')
              set_raster_version((arg0_v) => arg0_v + 1)
              cullRasterCache(raster_cache_ref.current, performant_mode, cache_key_a, is_playing)
            }
          })
          .catch((arg0_err) => {
            in_flight_fetches_count_ref.current = Math.max(0, in_flight_fetches_count_ref.current - 1)
            if (in_flight_fetches_count_ref.current === 0)
              set_is_loading_raster(false)
            if (arg0_err?.name !== 'AbortError')
              console.error('Failed to load raster keyframe:', arg0_err)
          })
      }
    }


    //Prefetch upcoming keyframe only when performant mode is OFF and not playing to conserve RAM
    if (!performant_mode && !is_headless_export && !is_playing) {
      let curr_idx = years.indexOf(next_year)
      if (curr_idx !== -1 && curr_idx + 1 < years.length) {
        let future_year = years[curr_idx + 1]
        let schedule_idle = (window as any).requestIdleCallback
          ? (arg0_cb: () => void) => (window as any).requestIdleCallback(arg0_cb, { timeout: 800 })
          : (arg0_cb: () => void) => setTimeout(arg0_cb, 300)

        schedule_idle(() => {
          if (load_req_id_ref.current !== current_req_id)
            return
          fetchRasterKeyframe(
            requested_layer_id,
            future_year,
            effective_selectors,
            effective_format,
            raster_cache_ref.current,
            has_selectors,
            layer_pixel_offset,
            performant_mode,
            undefined,
            can_be_uninhabited
          ).catch(() => {})
        })
      }
    }

    return () => {
      controller.abort()
    }
  }, [
    active_layer,
    active_layer_id,
    active_variable_selectors,
    data_format,
    is_headless_export,
    is_playing,
    performant_mode,
    snap_to_keyframes,
    timeline_year,
  ])

  //Compute active display raster based on app mode (Single Image or Image Difference)
  if (app_mode === 'Image Difference') {
    if (raster_a && raster_b)
      display_raster = computeRasterDifference(raster_a, raster_b)
    else
      display_raster = raster_a
  } else {
    if (!snap_to_keyframes && raster_a && raster_b) {
      let years = active_layer?.available_years || (active_layer as any)?.years || []
      let p_yr = years[0]
      let n_yr = years[years.length - 1]
      for (let i = 0; i < years.length; i++) {
        if (years[i] <= timeline_year)
          p_yr = years[i]
        if (years[i] >= timeline_year) {
          n_yr = years[i]
          break
        }
      }
      if (
        p_yr !== n_yr &&
        timeline_year > p_yr &&
        timeline_year < n_yr &&
        current_interp_years_ref.current &&
        current_interp_years_ref.current.prev_year === p_yr &&
        current_interp_years_ref.current.next_year === n_yr
      ) {
        let t = (timeline_year - p_yr)/(n_yr - p_yr)
        let last_interp = last_interp_pair_ref.current

        let t_diff_threshold = is_playing ? 0.015 : 0.0001
        if (
          last_interp &&
          last_interp.a === raster_a &&
          last_interp.b === raster_b &&
          Math.abs(last_interp.t - t) < t_diff_threshold &&
          last_interp_raster_ref.current
        ) {
          display_raster = last_interp_raster_ref.current
        } else {
          let req_len = raster_a.width*raster_a.height
          if (!interp_buffer_ref.current || interp_buffer_ref.current.length !== req_len)
            interp_buffer_ref.current = new Float32Array(req_len)

          let filter_uninhabited = !active_layer?.can_be_uninhabited
          display_raster = interpolateRasters(raster_a, raster_b, t, filter_uninhabited, interp_buffer_ref.current)
          last_interp_pair_ref.current = { a: raster_a, b: raster_b, t }
          last_interp_raster_ref.current = display_raster
        }
      } else {
        display_raster = raster_a
      }
    } else {
      display_raster = raster_a
    }
  }

  //Return statement
  return {
    activeFileName: active_file_name,
    clearCache: clear_cache,
    diffNameA: diff_name_a,
    diffNameB: diff_name_b,
    displayRaster: display_raster,
    isLoadingRaster: is_loading_raster,
    rasterA: raster_a,
    rasterB: raster_b,
    rasterCacheRef: raster_cache_ref,
    rasterVersion: raster_version,
    rawBytesA: raw_bytes_a,
    rawBytesB: raw_bytes_b,
    setActiveFileName: set_active_file_name,
    setDiffNameA: set_diff_name_a,
    setDiffNameB: set_diff_name_b,
    setRasterA: set_raster_a,
    setRasterB: set_raster_b,
    setRasterVersion: set_raster_version,
    setRawBytesA: set_raw_bytes_a,
    setRawBytesB: set_raw_bytes_b,
  }
}
