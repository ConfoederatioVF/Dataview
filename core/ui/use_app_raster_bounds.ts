import { useMemo } from 'react'
import { DecodedRaster, AppMode, BoundsMode, BinningConfig } from '@framework/geopng/types.ts'
import { computeRasterDifference } from '@framework/geopng/decoder.ts'
import { computeQuantiles } from '@framework/geopng/scales.ts'
import { createBinnedRaster } from '@framework/geopng/downsampling.ts'
import { getActiveLayerMidpoint } from '@framework/raster/legend_utils.ts'
import type { ParsedDataLayer } from '@server/layer_parser.ts'

export interface UseAppRasterBoundsOptions {
  absolute_breaks: string
  active_layer: ParsedDataLayer | null
  active_variable_selectors: Record<string, string | string[]>
  app_mode: AppMode
  binning_config: BinningConfig
  bounds_mode: BoundsMode
  max_val_override: string
  min_val_override: string
  percentile_list: string
  pipeline_display_raster: DecodedRaster | null
  raster_a: DecodedRaster | null
  raster_b: DecodedRaster | null
}

export interface UseAppRasterBoundsResult {
  active_midpoint: number
  active_raster: DecodedRaster | null
  breaks: number[]
  display_raster: DecodedRaster | null
  max_val: number
  min_val: number
}

/**
 * Hook to compute active and display rasters, layer midpoint, and scaled bounds / quantiles.
 *
 * @param {UseAppRasterBoundsOptions} arg0_options
 *
 * @returns {UseAppRasterBoundsResult}
 */
export function useAppRasterBounds (arg0_options: UseAppRasterBoundsOptions): UseAppRasterBoundsResult {
  //Convert from parameters
  let absolute_breaks = arg0_options.absolute_breaks
  let active_layer = arg0_options.active_layer
  let active_variable_selectors = arg0_options.active_variable_selectors
  let app_mode = arg0_options.app_mode
  let binning_config = arg0_options.binning_config
  let bounds_mode = arg0_options.bounds_mode
  let max_val_override = arg0_options.max_val_override
  let min_val_override = arg0_options.min_val_override
  let percentile_list = arg0_options.percentile_list
  let pipeline_display_raster = arg0_options.pipeline_display_raster
  let raster_a = arg0_options.raster_a
  let raster_b = arg0_options.raster_b

  //Function body
  let active_raster = useMemo<DecodedRaster | null>(() => {
    if (app_mode === 'Single Image')
      return raster_a
    if (raster_a && raster_b)
      return computeRasterDifference(raster_a, raster_b)
    return raster_a || raster_b
  }, [app_mode, raster_a, raster_b])

  let display_raster = useMemo<DecodedRaster | null>(() => {
    let base = pipeline_display_raster || active_raster
    if (!base)
      return null
    if (!binning_config.enabled)
      return base
    try {
      return createBinnedRaster(
        base,
        binning_config.width,
        binning_config.height,
        binning_config.method
      )
    } catch (arg0_e) {
      console.error('Failed to bin raster:', arg0_e)
      return base
    }
  }, [active_raster, binning_config, pipeline_display_raster])

  let active_midpoint = useMemo(() => {
    return getActiveLayerMidpoint(active_layer, active_variable_selectors)
  }, [active_layer, active_variable_selectors])

  let { breaks, maxVal: max_val, minVal: min_val } = useMemo(() => {
    let r = display_raster || active_raster
    if (!r)
      return { breaks: [], maxVal: 1, minVal: 0 }

    if (bounds_mode === 'Percentile') {
      let parts = percentile_list
        .split(',')
        .map((arg0_s) => parseFloat(arg0_s.trim()))
        .filter((arg0_n) => !Number.isNaN(arg0_n))
        .map((arg0_p) => arg0_p / 100)

      if (parts.length > 0) {
        let q_breaks = computeQuantiles(r.data, parts)
        let p_max = Math.max(...q_breaks)
        let p_min = Math.min(...q_breaks)
        if (active_midpoint === 0) {
          let abs_max = Math.max(Math.abs(p_min), Math.abs(p_max))
          if (abs_max === 0)
            abs_max = 1
          return { breaks: q_breaks, maxVal: abs_max, minVal: -abs_max }
        }
        return { breaks: q_breaks, maxVal: p_max, minVal: p_min }
      }
    } else if (bounds_mode === 'Absolute') {
      let parts = absolute_breaks
        .split(',')
        .map((arg0_s) => parseFloat(arg0_s.trim()))
        .filter((arg0_n) => !Number.isNaN(arg0_n))
        .sort((arg0_a, arg0_b) => arg0_a - arg0_b)

      if (parts.length >= 2) {
        return {
          breaks: parts,
          maxVal: parts[parts.length - 1],
          minVal: parts[0],
        }
      }
    }

    let parsed_max = max_val_override !== '' ? parseFloat(max_val_override) : r.max
    let parsed_min = min_val_override !== '' ? parseFloat(min_val_override) : r.min

    let safe_max = Number.isFinite(parsed_max) ? parsed_max : r.max
    let safe_min = Number.isFinite(parsed_min) ? parsed_min : r.min

    if (active_midpoint === 0) {
      if (max_val_override !== '' && min_val_override === '') {
        let abs_max = Math.abs(safe_max) || 1
        safe_min = -abs_max
        safe_max = abs_max
      } else if (min_val_override !== '' && max_val_override === '') {
        let abs_max = Math.abs(safe_min) || 1
        safe_min = -abs_max
        safe_max = abs_max
      } else if (min_val_override === '' && max_val_override === '') {
        let abs_max = Math.max(Math.abs(safe_min), Math.abs(safe_max))
        if (abs_max === 0)
          abs_max = 1
        safe_min = -abs_max
        safe_max = abs_max
      }
    }

    return { breaks: [], maxVal: safe_max, minVal: safe_min }
  }, [
    display_raster,
    active_raster,
    bounds_mode,
    percentile_list,
    absolute_breaks,
    min_val_override,
    max_val_override,
    active_midpoint,
  ])

  //Return statement
  return {
    active_midpoint,
    active_raster,
    breaks,
    display_raster,
    max_val,
    min_val,
  }
}
