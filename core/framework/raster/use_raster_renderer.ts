import React, { useMemo, useRef, useEffect } from 'react'
import {
  ColorPalette,
  DecodedRaster,
  ProjectionType,
  ScaleType,
} from '@framework/geopng/types'
import { renderRasterToCanvas } from '@framework/geopng/palettes'
import { CountryFeature } from '@framework/geopng/polygon_binning'
import { getPixelOffset } from '@config'

export interface UseRasterRendererParams {
  activeCountries: CountryFeature[]
  activeLayerId?: string | null
  activeRaster: DecodedRaster | null
  breaks?: number[]
  colorPalette: ColorPalette
  countriesMode: boolean
  countryStats?: { max: number; min: number; validCount: number } | null
  invertPalette: boolean
  logSigma: number
  maxVal: number
  midpoint?: number
  minVal: number
  projection: ProjectionType
  rasterVersion?: number
  scaleType: ScaleType
}

export interface UseRasterRendererResult {
  rasterBounds: [number, number, number, number]
  renderedCanvas: HTMLCanvasElement | null
}

/**
 * Custom hook to render decoded raster matrices to GPU-backed Canvas elements with explicit texture release.
 *
 * @param {UseRasterRendererParams} arg0_params
 *
 * @returns {UseRasterRendererResult}
 */
export function useRasterRenderer (arg0_params: UseRasterRendererParams): UseRasterRendererResult {
  //Convert from parameters
  let active_countries = arg0_params.activeCountries
  let active_layer_id = arg0_params.activeLayerId
  let active_raster = arg0_params.activeRaster
  let breaks = arg0_params.breaks
  let color_palette = arg0_params.colorPalette
  let countries_mode = arg0_params.countriesMode
  let country_stats = arg0_params.countryStats
  let invert_palette = arg0_params.invertPalette
  let log_sigma = arg0_params.logSigma
  let max_val = arg0_params.maxVal
  let midpoint = arg0_params.midpoint
  let min_val = arg0_params.minVal
  let projection = arg0_params.projection
  let raster_version = arg0_params.rasterVersion
  let scale_type = arg0_params.scaleType

  //Declare local instance variables
  let buffer_flip_ref = useRef<boolean>(false)
  let canvas_a_ref = useRef<HTMLCanvasElement | null>(null)
  let canvas_b_ref = useRef<HTMLCanvasElement | null>(null)
  let effective_active_countries = countries_mode ? active_countries : null
  let effective_country_stats = countries_mode ? country_stats : null
  let prev_bounds_ref = useRef<[number, number, number, number] | null>(null)

  //Function body
  let result = useMemo(() => {
    //Declare local instance variables
    let canvas: HTMLCanvasElement
    let effective_max: number
    let effective_min: number
    let final_bounds: [number, number, number, number]
    let is_country_isolated: boolean
    let offset: number
    let pixel_height: number
    let pixel_offset: number
    let prev_bounds: [number, number, number, number] | null
    let r = active_raster
    let target_canvas: HTMLCanvasElement | null
    let target_north: number
    let target_south: number

    //Guard clauses
    if (!r) {
      if (canvas_a_ref.current) {
        canvas_a_ref.current.width = 0
        canvas_a_ref.current.height = 0
        canvas_a_ref.current = null
      }
      if (canvas_b_ref.current) {
        canvas_b_ref.current.width = 0
        canvas_b_ref.current.height = 0
        canvas_b_ref.current = null
      }
      return {
        rasterBounds: [-180, -90, 180, 90] as [number, number, number, number],
        renderedCanvas: null,
      }
    }

    //Function body
    is_country_isolated = Boolean(
      countries_mode &&
        effective_active_countries &&
        effective_active_countries.length > 0 &&
        effective_country_stats &&
        effective_country_stats.validCount > 0 &&
        Number.isFinite(effective_country_stats.min) &&
        Number.isFinite(effective_country_stats.max)
    )

    if (is_country_isolated) {
      effective_max = effective_country_stats!.max
      effective_min = effective_country_stats!.min
      if (midpoint === 0) {
        let abs_max = Math.max(Math.abs(effective_min), Math.abs(effective_max))
        if (abs_max === 0)
          abs_max = 1
        effective_min = -abs_max
        effective_max = abs_max
      }
    } else {
      effective_max = max_val
      effective_min = min_val
    }

    //Select double-buffered canvas to notify Deck.gl of image updates without allocations
    target_canvas = buffer_flip_ref.current ? canvas_b_ref.current : canvas_a_ref.current
    if (!target_canvas) {
      target_canvas = document.createElement('canvas')
      if (buffer_flip_ref.current) {
        canvas_b_ref.current = target_canvas
      } else {
        canvas_a_ref.current = target_canvas
      }
    }
    buffer_flip_ref.current = !buffer_flip_ref.current

    let render_res = renderRasterToCanvas(
      r.data,
      r.width,
      r.height,
      {
        activeCountries: is_country_isolated ? effective_active_countries : null,
        breaks,
        invertPalette: invert_palette,
        logSigma: log_sigma,
        maxVal: effective_max,
        midpoint,
        minVal: effective_min,
        palette: color_palette,
        projection,
        scaleType: scale_type,
      },
      target_canvas
    )
    canvas = render_res.canvas

    pixel_height = 180/r.height
    pixel_offset = getPixelOffset(projection)
    offset = pixel_offset*pixel_height
    target_south = -90 + offset
    target_north = 90 + offset
    prev_bounds = prev_bounds_ref.current

    if (
      prev_bounds &&
      prev_bounds[0] === -180 &&
      prev_bounds[1] === target_south &&
      prev_bounds[2] === 180 &&
      prev_bounds[3] === target_north
    ) {
      final_bounds = prev_bounds
    } else {
      final_bounds = [-180, target_south, 180, target_north]
      prev_bounds_ref.current = final_bounds
    }

    return { rasterBounds: final_bounds, renderedCanvas: canvas }
  }, [
    active_layer_id,
    active_raster,
    breaks,
    color_palette,
    countries_mode,
    effective_active_countries,
    effective_country_stats,
    invert_palette,
    log_sigma,
    max_val,
    midpoint,
    min_val,
    projection,
    raster_version,
    scale_type,
  ])

  //Clean up canvas when component unmounts
  useEffect(() => {
    return () => {
      if (canvas_a_ref.current) {
        canvas_a_ref.current.width = 0
        canvas_a_ref.current.height = 0
        canvas_a_ref.current = null
      }
      if (canvas_b_ref.current) {
        canvas_b_ref.current.width = 0
        canvas_b_ref.current.height = 0
        canvas_b_ref.current = null
      }
    }
  }, [])

  //Return statement
  return result
}
