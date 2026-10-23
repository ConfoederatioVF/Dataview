import { useCallback, useEffect, useMemo, useState } from 'react'
import { ParsedDataLayer } from '@server/layer_parser.ts'
import {
  isBorderDatasetMatch,
  HistoricalBordersConfig,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { applyLayerLegend } from '@framework/raster/legend_utils.ts'
import { onConfigUpdate, onLayersUpdate } from '@framework/config/config_hot_reload'
import type { ColorPalette, DataFormat, MapModeItem, ScaleType } from '@framework/geopng/types.ts'

/**
 * Resolves the default variable selectors for a given data layer, preserving valid existing options.
 *
 * @param {ParsedDataLayer | null} arg0_layer
 * @param {Record<string, string | string[]>} [arg1_existing_selectors={}]
 *
 * @returns {Record<string, string[]>}
 */
export function getDefaultSelectorsForLayer (
  arg0_layer: ParsedDataLayer | null,
  arg1_existing_selectors?: Record<string, string | string[]>
): Record<string, string[]> {
  //Convert from parameters
  let existing_selectors = (arg1_existing_selectors) ? arg1_existing_selectors : {}
  let layer = arg0_layer

  //Declare local instance variables
  let all_selector_keys: string[]
  let default_selectors: Record<string, string[]> = {}

  //Guard clauses
  if (!layer || !layer.variable_selectors)
    return default_selectors

  //Function body
  all_selector_keys = Object.keys(layer.variable_selectors)
  for (let i = 0; i < all_selector_keys.length; i++) {
    let local_curr: string | string[]
    let local_def = layer.variable_selectors[all_selector_keys[i]]
    let local_key = all_selector_keys[i]
    let local_valid_options = (local_def && local_def.options) ? Object.keys(local_def.options) : []

    local_curr = existing_selectors[local_key]
    if (local_curr) {
      let local_values = Array.isArray(local_curr) ? local_curr : [local_curr]
      let local_valid_values = local_values.filter((arg0_val) => local_valid_options.includes(arg0_val))

      if (local_valid_values.length > 0) {
        default_selectors[local_key] = local_valid_values
        continue
      }
    }

    if (local_valid_options.length > 0)
      default_selectors[local_key] = [local_valid_options[0]]
  }

  //Return statement
  return default_selectors
}


export interface UseAppLayersSyncOptions {
  default_data_layers: string[]
  default_stadester_enabled: boolean
  is_mobile: boolean
  raster_pipeline_ref?: React.MutableRefObject<any>
  set_color_palette: React.Dispatch<React.SetStateAction<ColorPalette>>
  set_data_format: React.Dispatch<React.SetStateAction<DataFormat>>
  set_historical_borders_config: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
  set_invert_palette: React.Dispatch<React.SetStateAction<boolean>>
  set_legend_subtitle: React.Dispatch<React.SetStateAction<string>>
  set_legend_title: React.Dispatch<React.SetStateAction<string>>
  set_log_sigma: React.Dispatch<React.SetStateAction<number>>
  set_map_modes: React.Dispatch<React.SetStateAction<MapModeItem[]>>
  set_max_val_override: React.Dispatch<React.SetStateAction<string>>
  set_min_val_override: React.Dispatch<React.SetStateAction<string>>
  set_scale_type: React.Dispatch<React.SetStateAction<ScaleType>>
  set_stadester_config: React.Dispatch<React.SetStateAction<StadesterConfig>>
}

/**
 * Hook to manage data layers, HMR hot reloads, variable selectors, and active layer coordination.
 *
 * @param {UseAppLayersSyncOptions} arg0_options
 *
 * @returns {object}
 */
export function useAppLayersSync (arg0_options: UseAppLayersSyncOptions) {
  //Convert from parameters
  let default_data_layers = arg0_options.default_data_layers
  let default_stadester_enabled = arg0_options.default_stadester_enabled
  let is_mobile = arg0_options.is_mobile
  let raster_pipeline_ref = arg0_options.raster_pipeline_ref
  let set_color_palette = arg0_options.set_color_palette
  let set_data_format = arg0_options.set_data_format
  let set_historical_borders_config = arg0_options.set_historical_borders_config
  let set_invert_palette = arg0_options.set_invert_palette
  let set_legend_subtitle = arg0_options.set_legend_subtitle
  let set_legend_title = arg0_options.set_legend_title
  let set_log_sigma = arg0_options.set_log_sigma
  let set_map_modes = arg0_options.set_map_modes
  let set_max_val_override = arg0_options.set_max_val_override
  let set_min_val_override = arg0_options.set_min_val_override
  let set_scale_type = arg0_options.set_scale_type
  let set_stadester_config = arg0_options.set_stadester_config

  //Declare local instance variables
  let [layers, set_layers] = useState<Record<string, ParsedDataLayer>>({})
  let [active_layer_id, set_active_layer_id] = useState<string | null>('default_basemap')
  let [active_variable_selectors, set_active_variable_selectors] = useState<Record<string, string | string[]>>({
    gender: ['t'],
    profession: ['agriculture'],
  })
  let [is_loading_layers, set_is_loading_layers] = useState<boolean>(false)

  //Function body
  let active_layer = useMemo<ParsedDataLayer | null>(() => {
    if (!active_layer_id)
      return null
    if (layers[active_layer_id])
      return layers[active_layer_id]
    if (active_layer_id.includes('.')) {
      let parent_id = active_layer_id.split('.')[0]
      let parent = layers[parent_id]
      if (parent && parent.sub_layers) {
        let sub = parent.sub_layers.find((arg0_s) => arg0_s.id === active_layer_id)
        if (sub)
          return sub
      }
    }
    return null
  }, [active_layer_id, layers])

  let available_keyframes = useMemo<number[]>(() => {
    if (!active_layer || !active_layer.available_years)
      return []
    return active_layer.available_years
  }, [active_layer])

  let handle_change_variable_selector = useCallback((arg0_key: string, arg1_option: string | string[]) => {
    let key = arg0_key
    let option = arg1_option

    set_active_variable_selectors((arg0_prev) => ({
      ...arg0_prev,
      [key]: option,
    }))
    set_max_val_override('')
    set_min_val_override('')
    if (raster_pipeline_ref?.current?.setRasterVersion)
      raster_pipeline_ref.current.setRasterVersion((arg0_v: number) => arg0_v + 1)
  }, [set_max_val_override, set_min_val_override, raster_pipeline_ref])

  let handle_select_layer = useCallback((arg0_layer_id: string) => {
    let layer_id = arg0_layer_id

    if (layer_id === 'lfpr')
      layer_id = 'lfpr.lfpr_female'
    if (layer_id === 'statistical_borders' || layer_id === 'simplified_borders' || layer_id === 'detailed_borders') {
      set_historical_borders_config((arg0_prev) => {
        let is_currently_active = arg0_prev.enabled && isBorderDatasetMatch(arg0_prev.dataset, layer_id)
        if (is_currently_active) {
          return {
            ...arg0_prev,
            enabled: false,
          }
        }
        return {
          ...arg0_prev,
          dataset: layer_id,
          enabled: true,
        }
      })
      return
    }

    let target_layer = layers[layer_id]
    if (layer_id.includes('.') && (!target_layer || !target_layer.variable_selectors)) {
      let parent_id = layer_id.split('.')[0]
      let parent = layers[parent_id]
      if (parent && parent.sub_layers) {
        let sub = parent.sub_layers.find((arg0_s) => arg0_s.id === layer_id)
        if (sub)
          target_layer = sub
      }
    }

    let next_selectors = getDefaultSelectorsForLayer(target_layer, active_variable_selectors)

    set_active_layer_id(layer_id)
    set_active_variable_selectors(next_selectors)

    if (target_layer) {
      applyLayerLegend(
        target_layer,
        next_selectors,
        set_color_palette,
        set_invert_palette,
        set_scale_type,
        set_legend_title,
        set_legend_subtitle,
        set_log_sigma
      )
      if (target_layer.encoding)
        set_data_format(target_layer.encoding)
    }

    if (raster_pipeline_ref?.current) {
      if (target_layer?.type === 'vector.basemap' || layer_id === 'default_basemap' || layer_id === 'basemap_only')
        raster_pipeline_ref.current.setRasterA(null)
      raster_pipeline_ref.current.setActiveFileName('')
      raster_pipeline_ref.current.setDiffNameA('')
      raster_pipeline_ref.current.setDiffNameB('')
      raster_pipeline_ref.current.setRasterVersion((arg0_v: number) => arg0_v + 1)
    }

    set_max_val_override('')
    set_min_val_override('')
  }, [
    active_variable_selectors,
    layers,
    raster_pipeline_ref,
    set_color_palette,
    set_data_format,
    set_historical_borders_config,
    set_invert_palette,
    set_legend_subtitle,
    set_legend_title,
    set_log_sigma,
    set_max_val_override,
    set_min_val_override,
    set_scale_type,
  ])

  useEffect(() => {
    let p = raster_pipeline_ref?.current
    if (p && (p.activeFileName || p.diffNameA || p.diffNameB))
      return
    if (active_layer) {
      applyLayerLegend(
        active_layer,
        active_variable_selectors,
        set_color_palette,
        set_invert_palette,
        set_scale_type,
        set_legend_title,
        set_legend_subtitle,
        set_log_sigma
      )
      if (active_layer.encoding)
        set_data_format(active_layer.encoding)
    }
  }, [
    active_layer,
    active_variable_selectors,
    raster_pipeline_ref,
    set_color_palette,
    set_data_format,
    set_invert_palette,
    set_legend_subtitle,
    set_legend_title,
    set_log_sigma,
    set_scale_type,
  ])

  useEffect(() => {
    if (active_layer && active_layer.variable_selectors) {
      let sel_keys = Object.keys(active_layer.variable_selectors)
      set_active_variable_selectors((arg0_prev) => {
        let changed = false
        let updated = { ...arg0_prev }
        for (let i = 0; i < sel_keys.length; i++) {
          let sk = sel_keys[i]
          let curr = updated[sk]
          let is_empty = curr === undefined || curr === null || (Array.isArray(curr) && curr.length === 0) || curr === ''
          let opt_keys = Object.keys(active_layer!.variable_selectors![sk].options)
          let is_valid = false
          if (!is_empty) {
            let curr_arr = Array.isArray(curr) ? curr : [curr]
            is_valid = curr_arr.some((arg0_val) => opt_keys.includes(arg0_val))
          }
          if (is_empty || !is_valid) {
            if (opt_keys.length > 0) {
              updated[sk] = [opt_keys[0]]
              changed = true
            }
          }
        }
        return changed ? updated : arg0_prev
      })
    }
  }, [active_layer])

  useEffect(() => {
    let cancelled = false
    let fetchLayers = async function () {
      set_is_loading_layers(true)
      try {
        let resp = await fetch('/api/layers')
        if (resp.ok) {
          let data = await resp.json()
          if (!cancelled && data && data.layers) {
            set_layers(data.layers)
            ;(window as any).__layersLoaded = true
            let layer_keys = Object.keys(data.layers)
            let stadester_layer = data.layers.stadester || data.layers['stadester_1.1'] || data.layers['stadester_1.0']
            if (stadester_layer && stadester_layer.display_options) {
              let opts = stadester_layer.display_options
              set_stadester_config((arg0_prev) => ({
                ...arg0_prev,
                bubbleSize: opts.bubble_size ?? opts.bubbleSize ?? arg0_prev.bubbleSize,
                capitalColorMode: opts.capital_color_mode ?? opts.capitalColorMode ?? arg0_prev.capitalColorMode,
                capitalConstantColor: opts.capital_constant_color ?? opts.capitalConstantColor ?? arg0_prev.capitalConstantColor,
                colorMode: opts.color_mode ?? opts.colorMode ?? arg0_prev.colorMode,
                dataset: opts.dataset ?? arg0_prev.dataset,
                display_options: opts,
                enabled: arg0_prev.enabled ?? default_stadester_enabled,
                filled: opts.filled ?? arg0_prev.filled,
                growthPalette: opts.growth_palette ?? opts.growthPalette ?? arg0_prev.growthPalette,
                halo: opts.halo ?? arg0_prev.halo,
                heuristicCulling: is_mobile
                  ? (opts.mobile_heuristic_culling ?? opts.mobileHeuristicCulling ?? true)
                  : (opts.heuristic_culling ?? opts.heuristicCulling ?? arg0_prev.heuristicCulling ?? false),
                labelCollision: opts.label_collision ?? opts.labelCollision ?? arg0_prev.labelCollision,
                largeCityContrast: opts.large_city_contrast ?? opts.largeCityContrast ?? arg0_prev.largeCityContrast,
                maxCities: opts.max_cities ?? opts.maxCities ?? arg0_prev.maxCities,
                minPop: opts.min_pop ?? opts.minPop ?? arg0_prev.minPop,
                opacity: opts.opacity ?? arg0_prev.opacity,
                showCapitals: opts.show_capitals ?? opts.showCapitals ?? arg0_prev.showCapitals,
                showCapitalUnderlines: opts.show_capital_underlines ?? opts.showCapitalUnderlines ?? arg0_prev.showCapitalUnderlines,
                showLabels: opts.show_labels ?? opts.showLabels ?? arg0_prev.showLabels,
              }))
            }
            if (layer_keys.length > 0) {
              let configured_default_raster = default_data_layers.find((arg0_k) =>
                layer_keys.includes(arg0_k) && !arg0_k.includes('border') && !arg0_k.includes('stadester')
              )
              let default_key = configured_default_raster || (layer_keys.includes('GDP_nominal_pc') ? 'GDP_nominal_pc' : layer_keys[0])
              set_active_layer_id((arg0_prev) => (arg0_prev && data.layers[arg0_prev] ? arg0_prev : default_key))
            }
          }
        }
      } catch (arg0_err) {
        console.error('Failed to fetch data layers:', arg0_err)
      } finally {
        if (!cancelled)
          set_is_loading_layers(false)
      }
    }
    fetchLayers()
    return () => {
      cancelled = true
    }
  }, [default_data_layers, default_stadester_enabled, is_mobile, set_stadester_config])

  useEffect(() => {
    let unsubscribe = onLayersUpdate((arg0_next_layers) => {
      if (arg0_next_layers && typeof arg0_next_layers === 'object') {
        set_layers(arg0_next_layers)
        let stadester_layer = arg0_next_layers.stadester || arg0_next_layers['stadester_1.1'] || arg0_next_layers['stadester_1.0']
        if (stadester_layer && stadester_layer.display_options) {
          let opts = stadester_layer.display_options
          set_stadester_config((arg0_prev) => ({
            ...arg0_prev,
            bubbleSize: opts.bubble_size ?? opts.bubbleSize ?? arg0_prev.bubbleSize,
            capitalColorMode: opts.capital_color_mode ?? opts.capitalColorMode ?? arg0_prev.capitalColorMode,
            capitalConstantColor: opts.capital_constant_color ?? opts.capitalConstantColor ?? arg0_prev.capitalConstantColor,
            colorMode: opts.color_mode ?? opts.colorMode ?? arg0_prev.colorMode,
            dataset: opts.dataset ?? arg0_prev.dataset,
            display_options: opts,
            filled: opts.filled ?? arg0_prev.filled,
            growthPalette: opts.growth_palette ?? opts.growthPalette ?? arg0_prev.growthPalette,
            halo: opts.halo ?? arg0_prev.halo,
            heuristicCulling: is_mobile
              ? (opts.mobile_heuristic_culling ?? opts.mobileHeuristicCulling ?? true)
              : (opts.heuristic_culling ?? opts.heuristicCulling ?? arg0_prev.heuristicCulling ?? false),
            labelCollision: opts.label_collision ?? opts.labelCollision ?? arg0_prev.labelCollision,
            largeCityContrast: opts.large_city_contrast ?? opts.largeCityContrast ?? arg0_prev.largeCityContrast,
            maxCities: opts.max_cities ?? opts.maxCities ?? arg0_prev.maxCities,
            minPop: opts.min_pop ?? opts.minPop ?? arg0_prev.minPop,
            opacity: opts.opacity ?? arg0_prev.opacity,
            showCapitals: opts.show_capitals ?? opts.showCapitals ?? arg0_prev.showCapitals,
            showCapitalUnderlines: opts.show_capital_underlines ?? opts.showCapitalUnderlines ?? arg0_prev.showCapitalUnderlines,
            showLabels: opts.show_labels ?? opts.showLabels ?? arg0_prev.showLabels,
          }))
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [is_mobile, set_stadester_config])

  useEffect(() => {
    let unsubscribe = onConfigUpdate('mapmodes', (arg0_next_mapmodes) => {
      if (arg0_next_mapmodes && Array.isArray(arg0_next_mapmodes.modes)) {
        set_map_modes((arg0_prev) => {
          return arg0_next_mapmodes.modes.map((arg0_m: any) => {
            let existing = arg0_prev.find((arg0_p) => arg0_p.id === arg0_m.id)
            return {
              active: existing ? existing.active : (arg0_m.active ?? false),
              description: arg0_m.description,
              id: arg0_m.id,
              label: arg0_m.label,
            }
          })
        })
      }
    })

    return () => {
      unsubscribe()
    }
  }, [set_map_modes])

  //Return statement
  return {
    active_layer,
    active_layer_id,
    active_variable_selectors,
    available_keyframes,
    handle_change_variable_selector,
    handle_select_layer,
    is_loading_layers,
    layers,
    set_active_layer_id,
    set_active_variable_selectors,
    set_is_loading_layers,
    set_layers,
  }
}
