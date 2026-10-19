import { useEffect } from 'react'
import {
  ColorPalette,
  DataFormat,
  DecodedRaster,
  ScaleType,
  StadesterConfig,
} from '@/framework/geopng/types'
import { ParsedDataLayer } from '@server/layer_parser'
import { applyLayerLegend } from '@/framework/raster/legend_utils'
import { fetchRasterKeyframe, fetchInterpolatedRasterAsync } from '@/framework/raster/raster_fetch_utils'
import { fetchStadesterCitiesAsync } from '@/ui/map/use_stadester_cities'

export interface UseHeadlessExportParams {
  activeLayer: ParsedDataLayer | null
  dataFormat: DataFormat
  isHeadlessExport: boolean
  layers: Record<string, ParsedDataLayer>
  performantMode: boolean
  rasterCacheRef: React.MutableRefObject<Map<string, DecodedRaster>>
  setActiveLayerId: (arg0_layer_id: string) => void
  setActiveVariableSelectors: React.Dispatch<React.SetStateAction<Record<string, string | string[]>>>
  setColorPalette: (arg0_palette: ColorPalette) => void
  setInvertPalette: (arg0_invert: boolean) => void
  setLegendSubtitle: (arg0_sub: string) => void
  setLegendTitle: (arg0_title: string) => void
  setLogSigma: (arg0_sigma: number) => void
  setRasterA: (arg0_raster: DecodedRaster | null) => void
  setRasterB: (arg0_raster: DecodedRaster | null) => void
  setRasterVersion: React.Dispatch<React.SetStateAction<number>>
  setScaleType: (arg0_scale: ScaleType) => void
  setTimelineYear: (arg0_year: number) => void
  snapToKeyframes: boolean
  stadesterConfig: StadesterConfig
}

/**
 * Registers window.__renderKeyframe for headless video export orchestrators.
 *
 * @param {UseHeadlessExportParams} arg0_params
 *
 * @returns {void}
 */
export function useHeadlessExport (arg0_params: UseHeadlessExportParams): void {
  //Convert from parameters
  let active_layer = arg0_params.activeLayer
  let data_format = arg0_params.dataFormat
  let is_headless_export = arg0_params.isHeadlessExport
  let layers = arg0_params.layers
  let performant_mode = arg0_params.performantMode
  let raster_cache_ref = arg0_params.rasterCacheRef
  let set_active_layer_id = arg0_params.setActiveLayerId
  let set_active_variable_selectors = arg0_params.setActiveVariableSelectors
  let set_color_palette = arg0_params.setColorPalette
  let set_invert_palette = arg0_params.setInvertPalette
  let set_legend_subtitle = arg0_params.setLegendSubtitle
  let set_legend_title = arg0_params.setLegendTitle
  let set_log_sigma = arg0_params.setLogSigma
  let set_raster_a = arg0_params.setRasterA
  let set_raster_b = arg0_params.setRasterB
  let set_raster_version = arg0_params.setRasterVersion
  let set_scale_type = arg0_params.setScaleType
  let set_timeline_year = arg0_params.setTimelineYear
  let snap_to_keyframes = arg0_params.snapToKeyframes
  let stadester_config = arg0_params.stadesterConfig

  //Function body
  useEffect(() => {
    ; (window as any).__renderKeyframe = async (
      arg0_layer_id: string,
      arg0_year: number,
      arg0_selectors?: Record<string, string | string[]>
    ) => {
      let layer_id = arg0_layer_id
      let yr = arg0_year
      let selectors = arg0_selectors || {}

      if (typeof window !== 'undefined')
        (window as any).__deckRendered = false

      set_active_layer_id(layer_id)
      set_timeline_year(yr)
      set_active_variable_selectors(selectors)

      let target_layer: ParsedDataLayer | null = layers[layer_id] || (active_layer?.id === layer_id ? active_layer : null)
      if (!target_layer && layer_id.includes('.')) {
        let parent_id = layer_id.split('.')[0]
        let parent = layers[parent_id]
        if (parent && parent.sub_layers)
          target_layer = parent.sub_layers.find((arg0_s) => arg0_s.id === layer_id) || null
      }

      if (target_layer) {
        applyLayerLegend(
          target_layer,
          selectors,
          set_color_palette,
          set_invert_palette,
          set_scale_type,
          set_legend_title,
          set_legend_subtitle,
          set_log_sigma
        )
      }

      let can_be_uninhabited = Boolean(target_layer?.can_be_uninhabited)
      let has_selectors = Boolean(target_layer?.variable_selectors && Object.keys(target_layer.variable_selectors).length > 0)
      let layer_pixel_offset = target_layer?.pixel_offset
      let layer_threshold = target_layer?.threshold

      if (is_headless_export && raster_cache_ref.current.size > 1)
        raster_cache_ref.current.clear()

      let available_years = target_layer?.available_years || (target_layer as any)?.years || []
      let decoded: DecodedRaster | null = null

      if (available_years.length > 0) {
        decoded = await fetchInterpolatedRasterAsync(
          layer_id,
          yr,
          available_years,
          selectors,
          data_format,
          raster_cache_ref.current,
          has_selectors,
          layer_pixel_offset,
          performant_mode,
          snap_to_keyframes,
          undefined,
          can_be_uninhabited,
          layer_threshold
        )
      } else {
        decoded = await fetchRasterKeyframe(
          layer_id,
          yr,
          selectors,
          data_format,
          raster_cache_ref.current,
          has_selectors,
          layer_pixel_offset,
          performant_mode,
          undefined,
          can_be_uninhabited,
          layer_threshold
        )
      }

      if (decoded) {
        set_raster_a(decoded)
        set_raster_b(null)
        set_raster_version((arg0_v) => arg0_v + 1)
      }

      if (stadester_config.enabled) {
        await fetchStadesterCitiesAsync(
          stadester_config.dataset,
          yr,
          stadester_config.minPop,
          stadester_config.maxCities,
          stadester_config.colorMode
        ).catch(() => {})
      }

      await new Promise((arg0_res) => {
        let check_count = 0
        let check_timer = setInterval(() => {
          check_count++
          if ((window as any).__deckRendered || check_count >= 15) {
            clearInterval(check_timer)
            requestAnimationFrame(() => requestAnimationFrame(arg0_res))
          }
        }, 16)
      })
      await new Promise((arg0_res) => setTimeout(arg0_res, 40))
      return true
    }
  }, [active_layer, data_format, is_headless_export, layers, performant_mode, raster_cache_ref, set_active_layer_id, set_active_variable_selectors, set_color_palette, set_invert_palette, set_legend_subtitle, set_legend_title, set_log_sigma, set_raster_a, set_raster_b, set_raster_version, set_scale_type, set_timeline_year, snap_to_keyframes, stadester_config])
}
