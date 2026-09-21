import React, { useState, useEffect, useMemo, useCallback, useDeferredValue } from 'react'
import {
  AppMode,
  DataFormat,
  ScaleType,
  ColorPalette,
  BoundsMode,
  ProjectionType,
  DecodedRaster,
  BinningConfig,
  HeightmapConfig,
  CircleOverlayConfig,
  MapModeItem,
  MapModeId,
  CityPoint,
  CityFullRecord,
  HistoricalBordersConfig,
  DEFAULT_HISTORICAL_BORDERS_CONFIG,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { decodeRawGeoPngBufferAsync, computeRasterDifference } from '@framework/geopng/decoder.ts'
import { computeQuantiles } from '@framework/geopng/scales.ts'
import { createBinnedRaster } from '@framework/geopng/downsampling.ts'
import { CountryFeature } from '@framework/geopng/polygon_binning.ts'
import { useCountryStatsAsync } from '@framework/geopng/use_country_stats_async.ts'
import { MAP_CONFIG, MAPMODES_CONFIG, PERMISSIONS_CONFIG, UserRole, isPublicBuild, isRoleAllowed } from '@common'
import { SidebarControls } from '@ui/leftbar/sidebar_controls'
import { MapViewer } from '@ui/map/map_viewer'
import { AnalyticsDrawer } from '@ui/rightbar/analytics_drawer'
import { TimelineBar } from '@ui/bottombar/timeline_bar'
import { MobileNavBar } from '@ui/bottombar/mobile_nav_bar'
import { VideoExportModal, type StartTimelapseExportOptions } from '@ui/export/video_export_modal'
import { ParsedDataLayer } from '@server/layer_parser.ts'
import { Icon } from '@ui/components/icon'
import { useStadesterCities, fetchStadesterCitiesAsync } from '@ui/map/use_stadester_cities'
import { useRasterPipeline, fetchRasterKeyframe, fetchInterpolatedRasterAsync } from '@framework/raster/use_raster_pipeline.ts'
import { useRasterRenderer } from '@framework/raster/use_raster_renderer.ts'
import { useTimelapseExportOrchestrator } from '@ui/export/use_timelapse_export_orchestrator.ts'
import { applyLayerLegend } from '@framework/raster/legend_utils.ts'
import { useAppLayoutState } from './use_app_layout_state'
import { useHeadlessExport } from './export/use_headless_export'
import { onConfigUpdate, onLayersUpdate } from '@framework/config/config_hot_reload'

/**
 * Resolves the default variable selectors for a given data layer, preserving valid existing options.
 *
 * @param {ParsedDataLayer | null} arg0_layer
 * @param {Record<string, string | string[]>} [arg1_existing_selectors={}]
 *
 * @returns {Record<string, string[]>}
 */
export let getDefaultSelectorsForLayer = function (
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

/**
 * Main application root component managing raster datasets, map layers, and reactive view state.
 *
 * @returns {React.ReactElement}
 */
export let App: React.FC = function () {
  //Function body
  let layout_state = useAppLayoutState()
  let {
    activeMobileTab: active_mobile_tab,
    colourbarWidth: colourbar_width,
    isHeadlessExport: is_headless_export,
    isMobile: is_mobile,
    isSmallScreen: is_small_screen,
    isTablet: is_tablet,
    isTouch: is_touch,
    legendPosition: legend_position,
    setActiveMobileTab: set_active_mobile_tab,
    setColourbarWidth: set_colourbar_width,
    setLegendPosition: set_legend_position,
    setSidebarBottomClearance: set_sidebar_bottom_clearance,
    setSidebarWidth: set_sidebar_width,
    setUiVisible: set_ui_visible,
    sidebarBottomClearance: sidebar_bottom_clearance,
    sidebarTopClearance: sidebar_top_clearance,
    sidebarWidth: sidebar_width,
    uiVisible: ui_visible,
  } = layout_state
  let [app_mode, set_app_mode] = useState<AppMode>('Single Image')
  let [data_format, set_data_format] = useState<DataFormat>('float32')
  let [projection, set_projection] = useState<ProjectionType>('Mercator')
  let [scale_type, set_scale_type] = useState<ScaleType>('pseudo-log')
  let [log_sigma, set_log_sigma] = useState<number>(1.0)
  let [color_palette, set_color_palette] = useState<ColorPalette>('Plasma')
  let [invert_palette, set_invert_palette] = useState<boolean>(false)
  let [bounds_mode, set_bounds_mode] = useState<BoundsMode>('Manual')
  let [min_val_override, set_min_val_override] = useState<string>('')
  let [max_val_override, set_max_val_override] = useState<string>('')
  let [percentile_list, set_percentile_list] = useState<string>(
    MAP_CONFIG.defaultPercentileBreaks || '0, 1, 5, 25, 50, 75, 95, 99, 100'
  )
  let [absolute_breaks, set_absolute_breaks] = useState<string>('0, 10, 50, 100, 500, 1000')
  let [legend_title, set_legend_title] = useState<string>('Value')
  let [legend_subtitle, set_legend_subtitle] = useState<string>('')
  let [opacity, set_opacity] = useState<number>(0.85)
  let [performant_mode, set_performant_mode] = useState<boolean>(false)

  let [binning_config, set_binning_config] = useState<BinningConfig>({
    enabled: false,
    height: 360,
    method: 'average',
    width: 720,
  })
  let [heightmap_config, set_heightmap_config] = useState<HeightmapConfig>({
    blendWeight: 0.5,
    elevationScale: 800000,
    enabled: false,
    heightScaleMode: 'linear',
    opacity: 0.9,
    opacityByPercentile: false,
    opacityByPercentileStrength: 1.0,
    resolutionArcmin: 60,
  })

  let [info_panel_open, set_info_panel_open] = useState<boolean>(false)
  let [circle_overlay_config, set_circle_overlay_config] = useState<CircleOverlayConfig>({
    baseRadius: 1.0,
    enabled: false,
    haloWidth: 1,
    percentileCutoff: 99,
    strokeWidth: 2,
  })
  let [stadester_config, set_stadester_config] = useState<StadesterConfig>({
    bubbleSize: 0.4,
    colorMode: 'growth',
    dataset: 'stadester_1.1',
    enabled: false,
    filled: true,
    growthPalette: 'Rainbow',
    halo: false,
    labelCollision: true,
    maxCities: 4000,
    minPop: 0,
    opacity: 0.7,
    showLabels: true,
  })
  let [selected_city_key, set_selected_city_key] = useState<string | null>(null)
  let [historical_borders_config, set_historical_borders_config] = useState<HistoricalBordersConfig>(DEFAULT_HISTORICAL_BORDERS_CONFIG)

  let [map_modes, set_map_modes] = useState<MapModeItem[]>(() =>
    MAPMODES_CONFIG.modes.map((arg0_m) => ({
      active: arg0_m.active ?? false,
      id: arg0_m.id,
      label: arg0_m.label,
    }))
  )

  let [analytics_open, set_analytics_open] = useState<boolean>(false)
  let [settings_drawer_open, set_settings_drawer_open] = useState<boolean>(false)
  let [selected_countries, set_selected_countries] = useState<CountryFeature[]>([])
  let [hovered_country, set_hovered_country] = useState<CountryFeature | null>(null)
  let [countries_mode, set_countries_mode] = useState<boolean>(false)
  let [inspect_data, set_inspect_data] = useState<any>(null)

  let [layers, set_layers] = useState<Record<string, ParsedDataLayer>>({})
  let [active_layer_id, set_active_layer_id] = useState<string | null>('default_basemap')
  let [active_variable_selectors, set_active_variable_selectors] = useState<Record<string, string | string[]>>({
    gender: ['t'],
    profession: ['agriculture'],
  })
  let [is_loading_layers, set_is_loading_layers] = useState<boolean>(false)
  let default_app_role: UserRole = (PERMISSIONS_CONFIG.default_role as UserRole) || 'default'
  let [user_role, set_user_role] = useState<UserRole>(() => {
    if (isPublicBuild())
      return 'default'
    return isRoleAllowed(default_app_role) ? default_app_role : 'default'
  })
  let [timeline_year, set_timeline_year] = useState<number>(1950)
  let [is_playing, set_is_playing] = useState<boolean>(false)
  let [playback_speed, set_playback_speed] = useState<number>(1)
  let [snap_to_keyframes, set_snap_to_keyframes] = useState<boolean>(false)
  let [video_export_open, set_video_export_open] = useState<boolean>(false)

  let handle_change_user_role = useCallback(
    function (arg0_role: UserRole) {
      let role = arg0_role
      if (isRoleAllowed(role))
        set_user_role(role)
      else
        console.warn(`[Permissions] Role switch to '${role}' not permitted in current instance.`)
    },
    []
  )
  useEffect(() => {
    let search_params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    let url_proj = search_params?.get('projection') as ProjectionType | null
    if (url_proj && ['EqualEarth', 'Mercator', 'Globe', 'Equirectangular'].includes(url_proj))
      set_projection(url_proj)
  }, [])

  useEffect(() => {
    let updateAppHeight = () => {
      let h = (typeof window !== 'undefined' && window.visualViewport)
        ? window.visualViewport.height
        : (typeof window !== 'undefined' ? window.innerHeight : 800)
      if (typeof document !== 'undefined')
        document.documentElement.style.setProperty('--app-height', `${h}px`)
    }

    updateAppHeight()
    window.addEventListener('resize', updateAppHeight)
    window.addEventListener('orientationchange', updateAppHeight)
    if (typeof window !== 'undefined' && window.visualViewport) {
      window.visualViewport.addEventListener('resize', updateAppHeight)
      window.visualViewport.addEventListener('scroll', updateAppHeight)
    }

    return () => {
      window.removeEventListener('resize', updateAppHeight)
      window.removeEventListener('orientationchange', updateAppHeight)
      if (typeof window !== 'undefined' && window.visualViewport) {
        window.visualViewport.removeEventListener('resize', updateAppHeight)
        window.visualViewport.removeEventListener('scroll', updateAppHeight)
      }
    }
  }, [])

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

  //Raster pipeline hook: handles background loading, keyframes, caching, and downsampling
  let {
    activeFileName: active_file_name,
    clearCache: clear_raster_cache,
    diffNameA: diff_name_a,
    diffNameB: diff_name_b,
    displayRaster: pipeline_display_raster,
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
  } = useRasterPipeline({
    activeLayer: active_layer,
    activeLayerId: active_layer_id,
    activeVariableSelectors: active_variable_selectors,
    appMode: app_mode,
    dataFormat: data_format,
    isHeadlessExport: is_headless_export,
    isPlaying: is_playing,
    performantMode: performant_mode,
    snapToKeyframes: snap_to_keyframes,
    timelineYear: timeline_year,
  })

  useEffect(() => {
    clear_raster_cache()
  }, [performant_mode, active_layer_id, clear_raster_cache])

  //Server-side timelapse export orchestrator hook
  let {
    cancelTimelapseExport: handle_stop_timelapse_export,
    isTimelapseExporting: is_timelapse_exporting,
    startTimelapseExport: handle_start_timelapse_export,
    timelapseExportPct: timelapse_export_pct,
    timelapseExportResult: timelapse_export_result,
    timelapseExportStatus: timelapse_export_status,
  } = useTimelapseExportOrchestrator({
    activeLayer: active_layer,
    activeLayerId: active_layer_id,
    activeVariableSelectors: active_variable_selectors,
    layers: layers,
    legendPosition: legend_position,
    projection: projection,
    setIsPlaying: set_is_playing,
    setVideoExportOpen: set_video_export_open,
  })

  let stadester_result = useStadesterCities({
    config: stadester_config,
    isPlaying: is_playing,
    performantMode: performant_mode,
    selectedCityKey: selected_city_key,
    year: Math.round(timeline_year),
  })
  let stadester_cities: CityPoint[] = stadester_result.cities
  let selected_city_record: CityFullRecord | null = stadester_result.selectedCity

  useEffect(() => {
    ; (window as any).setStadesterConfig = set_stadester_config
      ; (window as any).stadesterConfig = stadester_config
      ; (window as any).setActiveLayerId = set_active_layer_id
      ; (window as any).setSelectedCityKey = set_selected_city_key
      ; (window as any).selectedCityRecord = selected_city_record
      ; (window as any).selectedCityKey = selected_city_key
  }, [set_stadester_config, stadester_config, set_active_layer_id, set_selected_city_key, selected_city_record, selected_city_key])

  let handle_close_city_details = useCallback(() => {
    set_selected_city_key(null)
  }, [])

  let handle_select_city = useCallback((arg0_city: CityPoint | null) => {
    let city = arg0_city
    if (!city) {
      set_selected_city_key(null)
    } else {
      set_selected_city_key(city.key)
    }
  }, [])

  let handle_app_inspect = useCallback(
    (arg0_data: any) => {
      let insp_data = arg0_data
      if (!analytics_open)
        return
      set_inspect_data(insp_data)
    },
    [analytics_open]
  )

  //Headless export hook for server render keyframes
  useHeadlessExport({
    activeLayer: active_layer,
    dataFormat: data_format,
    isHeadlessExport: is_headless_export,
    layers: layers,
    performantMode: performant_mode,
    rasterCacheRef: raster_cache_ref,
    setActiveLayerId: set_active_layer_id,
    setActiveVariableSelectors: set_active_variable_selectors,
    setColorPalette: set_color_palette,
    setInvertPalette: set_invert_palette,
    setLegendSubtitle: set_legend_subtitle,
    setLegendTitle: set_legend_title,
    setLogSigma: set_log_sigma,
    setRasterA: set_raster_a,
    setRasterB: set_raster_b,
    setRasterVersion: set_raster_version,
    setScaleType: set_scale_type,
    setTimelineYear: set_timeline_year,
    snapToKeyframes: snap_to_keyframes,
    stadesterConfig: stadester_config,
  })

  let deferred_selected_countries = useDeferredValue(selected_countries)

  let handle_change_variable_selector = useCallback((arg0_key: string, arg1_option: string | string[]) => {
    //Convert from parameters
    let key = arg0_key
    let option = arg1_option

    //Function body
    set_active_variable_selectors((arg0_prev) => ({
      ...arg0_prev,
      [key]: option,
    }))
    set_max_val_override('')
    set_min_val_override('')
    set_raster_version((arg0_v: number) => arg0_v + 1)
  }, [set_max_val_override, set_min_val_override, set_raster_version])

  let handle_select_layer = useCallback((arg0_layer_id: string) => {
    //Convert from parameters
    let layer_id = arg0_layer_id

    //Function body
    if (layer_id === 'lfpr')
      layer_id = 'lfpr.lfpr_female'
    if (layer_id === 'statistical_borders') {
      set_historical_borders_config((arg0_prev) => ({
        ...arg0_prev,
        enabled: !arg0_prev.enabled,
      }))
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

    if (target_layer?.type === 'vector.basemap' || layer_id === 'default_basemap' || layer_id === 'basemap_only')
      set_raster_a(null)

    set_active_file_name('')
    set_diff_name_a('')
    set_diff_name_b('')
    set_max_val_override('')
    set_min_val_override('')
    set_raster_version((arg0_v: number) => arg0_v + 1)
  }, [
    active_variable_selectors,
    layers,
    set_active_file_name,
    set_color_palette,
    set_data_format,
    set_diff_name_a,
    set_diff_name_b,
    set_historical_borders_config,
    set_invert_palette,
    set_legend_subtitle,
    set_legend_title,
    set_log_sigma,
    set_max_val_override,
    set_min_val_override,
    set_raster_a,
    set_raster_version,
    set_scale_type,
  ])

  useEffect(() => {
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
  }, [active_layer, active_variable_selectors])

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
              ; (window as any).__layersLoaded = true
            let layer_keys = Object.keys(data.layers)
            let stadester_layer = data.layers.stadester || data.layers['stadester_1.1'] || data.layers['stadester_1.0']
            if (stadester_layer && stadester_layer.display_options) {
              let opts = stadester_layer.display_options
              set_stadester_config((arg0_prev) => ({
                ...arg0_prev,
                bubbleSize: opts.bubble_size ?? arg0_prev.bubbleSize,
                colorMode: opts.color_mode ?? arg0_prev.colorMode,
                dataset: opts.dataset ?? arg0_prev.dataset,
                display_options: opts,
                filled: opts.filled ?? arg0_prev.filled,
                growthPalette: opts.growth_palette ?? arg0_prev.growthPalette,
                halo: opts.halo ?? arg0_prev.halo,
                labelCollision: opts.label_collision ?? arg0_prev.labelCollision,
                maxCities: opts.max_cities ?? arg0_prev.maxCities,
                minPop: opts.min_pop ?? arg0_prev.minPop,
                opacity: opts.opacity ?? arg0_prev.opacity,
                showLabels: opts.show_labels ?? arg0_prev.showLabels,
              }))
            }
            if (layer_keys.length > 0) {
              let default_key = layer_keys.includes('GDP_nominal_pc') ? 'GDP_nominal_pc' : layer_keys[0]
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
  }, [])

  //Hot reload layers definitions and descriptions in real time without full-page reload
  useEffect(() => {
    let unsubscribe = onLayersUpdate((arg0_next_layers) => {
      if (arg0_next_layers && typeof arg0_next_layers === 'object') {
        set_layers(arg0_next_layers)
        let stadester_layer = arg0_next_layers.stadester || arg0_next_layers['stadester_1.1'] || arg0_next_layers['stadester_1.0']
        if (stadester_layer && stadester_layer.display_options) {
          let opts = stadester_layer.display_options
          set_stadester_config((arg0_prev) => ({
            ...arg0_prev,
            bubbleSize: opts.bubble_size ?? arg0_prev.bubbleSize,
            colorMode: opts.color_mode ?? arg0_prev.colorMode,
            dataset: opts.dataset ?? arg0_prev.dataset,
            display_options: opts,
            filled: opts.filled ?? arg0_prev.filled,
            growthPalette: opts.growth_palette ?? arg0_prev.growthPalette,
            halo: opts.halo ?? arg0_prev.halo,
            labelCollision: opts.label_collision ?? arg0_prev.labelCollision,
            maxCities: opts.max_cities ?? arg0_prev.maxCities,
            minPop: opts.min_pop ?? arg0_prev.minPop,
            opacity: opts.opacity ?? arg0_prev.opacity,
            showLabels: opts.show_labels ?? arg0_prev.showLabels,
          }))
        }
      }
    })

    return () => {
      unsubscribe()
    }
  }, [])

  //Hot reload map modes descriptions and labels in real time
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
  }, [])

  useEffect(() => {
    let cancelled = false
    let redecode = async function () {
      if (raw_bytes_a) {
        let decoded_a = await decodeRawGeoPngBufferAsync(raw_bytes_a, data_format)
        if (!cancelled)
          set_raster_a(decoded_a)
      }
      if (raw_bytes_b) {
        let decoded_b = await decodeRawGeoPngBufferAsync(raw_bytes_b, data_format)
        if (!cancelled)
          set_raster_b(decoded_b)
      }
      if (!cancelled)
        set_raster_version((arg0_v: number) => arg0_v + 1)
    }
    redecode()
    return () => {
      cancelled = true
    }
  }, [data_format, raw_bytes_a, raw_bytes_b, set_raster_a, set_raster_b, set_raster_version])

  let handle_file_upload = useCallback(
    async function (arg0_file: File, arg1_target: 'single' | 'diff_a' | 'diff_b') {
      let file = arg0_file
      let target = arg1_target
      try {
        let buffer = await file.arrayBuffer()
        let uint8 = new Uint8Array(buffer)
        let decoded = await decodeRawGeoPngBufferAsync(uint8, data_format)

        if (target === 'single') {
          set_active_file_name(file.name)
          set_raw_bytes_a(uint8)
          set_raster_a(decoded)
        } else if (target === 'diff_a') {
          set_diff_name_a(file.name)
          set_raw_bytes_a(uint8)
          set_raster_a(decoded)
        } else if (target === 'diff_b') {
          set_diff_name_b(file.name)
          set_raw_bytes_b(uint8)
          set_raster_b(decoded)
        }
        set_raster_version((arg0_v: number) => arg0_v + 1)
      } catch (arg0_err) {
        console.error('Failed to load GeoPNG file:', arg0_err)
      }
    },
    [data_format, set_active_file_name, set_diff_name_a, set_diff_name_b, set_raster_a, set_raster_b, set_raster_version, set_raw_bytes_a, set_raw_bytes_b]
  )

  let handle_toggle_snap_to_keyframes = useCallback(
    function (arg0_snap: boolean) {
      let snap = arg0_snap
      set_snap_to_keyframes(snap)
      if (snap && available_keyframes.length > 0) {
        let closest = available_keyframes[0]
        let min_dist = Math.abs(timeline_year - closest)
        for (let i = 1; i < available_keyframes.length; i++) {
          let dist = Math.abs(timeline_year - available_keyframes[i])
          if (dist < min_dist) {
            min_dist = dist
            closest = available_keyframes[i]
          }
        }
        set_timeline_year(closest)
      }
    },
    [available_keyframes, timeline_year]
  )

  let handle_force_refresh_analytics = useCallback(() => {
    set_raster_version((arg0_v: number) => arg0_v + 1)
  }, [set_raster_version])

  let active_raster = useMemo<DecodedRaster | null>(() => {
    if (app_mode === 'Single Image')
      return raster_a
    if (raster_a && raster_b)
      return computeRasterDifference(raster_a, raster_b)
    return raster_a
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

    return { breaks: [], maxVal: safe_max, minVal: safe_min }
  }, [display_raster, active_raster, bounds_mode, percentile_list, absolute_breaks, min_val_override, max_val_override])

  let handle_toggle_country = useCallback((arg0_c: CountryFeature) => {
    let c = arg0_c
    set_selected_countries((arg0_prev) => {
      let exists = arg0_prev.some(
        (arg0_x) =>
          (arg0_x.properties.iso_a3 && arg0_x.properties.iso_a3 !== '-99' && arg0_x.properties.iso_a3 === c.properties.iso_a3) ||
          arg0_x.properties.name === c.properties.name
      )
      if (exists) {
        return arg0_prev.filter(
          (arg0_x) =>
            !(
              (arg0_x.properties.iso_a3 && arg0_x.properties.iso_a3 !== '-99' && arg0_x.properties.iso_a3 === c.properties.iso_a3) ||
              arg0_x.properties.name === c.properties.name
            )
        )
      }
      return [...arg0_prev, c]
    })
  }, [])

  let handle_clear_countries = useCallback(() => {
    set_selected_countries((arg0_prev) => (arg0_prev.length === 0 ? arg0_prev : []))
  }, [])

  let handle_select_country = useCallback(
    (arg0_c: CountryFeature | null) => {
      let c = arg0_c
      if (!c) {
        set_selected_countries((arg0_prev) => (arg0_prev.length === 0 ? arg0_prev : []))
      } else {
        set_selected_countries((arg0_prev) => {
          if (
            arg0_prev.length === 1 &&
            (arg0_prev[0] === c ||
              ((arg0_prev[0] as any).id !== undefined &&
                (arg0_prev[0] as any).id === (c as any).id &&
                arg0_prev[0].properties?.name === c.properties?.name &&
                arg0_prev[0].geometry === c.geometry))
          )
            return arg0_prev
          return [c]
        })
      }
    },
    []
  )

  let handle_toggle_countries_mode = useCallback((arg0_enabled: boolean) => {
    let enabled = arg0_enabled
    set_countries_mode(enabled)
    set_map_modes((arg0_prev) =>
      arg0_prev.map((arg0_m) => (arg0_m.id === 'country_analysis' ? { ...arg0_m, active: enabled } : arg0_m))
    )
  }, [])

  useEffect(() => {
    set_map_modes((arg0_prev) =>
      arg0_prev.map((arg0_m) =>
        arg0_m.id === 'historical_borders' ? { ...arg0_m, active: historical_borders_config.enabled } : arg0_m
      )
    )
  }, [historical_borders_config.enabled])

  let handle_toggle_map_mode = useCallback((arg0_id: MapModeId) => {
    let id = arg0_id
    if (id === 'historical_borders') {
      set_historical_borders_config((arg0_prev) => ({
        ...arg0_prev,
        enabled: !arg0_prev.enabled,
      }))
    }
    set_map_modes((arg0_prev) => {
      let circle_active: boolean
      let country_active: boolean
      let spike_active: boolean
      let updated = arg0_prev.map((arg0_m) => (arg0_m.id === id ? { ...arg0_m, active: !arg0_m.active } : arg0_m))

      country_active = updated.find((arg0_m) => arg0_m.id === 'country_analysis')?.active ?? false
      spike_active = updated.find((arg0_m) => arg0_m.id === 'spike_map')?.active ?? false
      circle_active = updated.find((arg0_m) => arg0_m.id === 'circle_sizing')?.active ?? false

      set_countries_mode(country_active)
      set_heightmap_config((arg0_h) => ({ ...arg0_h, enabled: spike_active }))
      set_circle_overlay_config((arg0_c) => ({ ...arg0_c, enabled: circle_active }))
      return updated
    })
  }, [])

  let handle_reorder_map_modes = useCallback((arg0_new_modes: MapModeItem[]) => {
    let new_modes = arg0_new_modes
    set_map_modes(new_modes)
  }, [set_map_modes])

  let handle_update_breaks = useCallback((arg0_new_breaks: number[]) => {
    let new_breaks = arg0_new_breaks
    set_bounds_mode('Absolute')
    set_absolute_breaks(new_breaks.map((arg0_n) => (Math.round(arg0_n * 1000) / 1000).toString()).join(', '))
  }, [set_absolute_breaks, set_bounds_mode])

  let active_countries = useMemo<CountryFeature[]>(() => {
    if (selected_countries.length > 0)
      return selected_countries
    if (countries_mode && hovered_country)
      return [hovered_country]
    return []
  }, [countries_mode, selected_countries, hovered_country])

  let is_hover_only = selected_countries.length === 0 && Boolean(hovered_country)

  let { countryStats: country_stats, isCalculatingStats: is_calculating_stats } = useCountryStatsAsync({
    activeCountries: active_countries,
    activeRaster: display_raster || active_raster,
    isHoverOnly: is_hover_only,
  })

  //Raster GPU-backed Canvas renderer hook with explicit texture release
  let { rasterBounds: raster_bounds, renderedCanvas: rendered_canvas } = useRasterRenderer({
    activeCountries: active_countries,
    activeLayerId: active_layer_id,
    activeRaster: display_raster || active_raster,
    breaks: breaks,
    colorPalette: color_palette,
    countriesMode: countries_mode,
    countryStats: country_stats,
    invertPalette: invert_palette,
    logSigma: log_sigma,
    maxVal: max_val,
    minVal: min_val,
    projection: projection,
    rasterVersion: raster_version,
    scaleType: scale_type,
  })

  //Return statement
  return (
    <div
      id="dataview-app-root"
      style={{
        height: 'var(--app-height, 100dvh)',
        maxHeight: 'var(--app-height, 100dvh)',
      }}
      className="relative w-screen w-[100dvw] overflow-hidden bg-background text-foreground font-sans"
    >
      {/* Live Timelapse Recording HUD */}
      {!is_headless_export && is_timelapse_exporting && (
        <div id="timelapse-recording-hud" className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3.5 px-5 py-2.5 rounded-full bg-card/95 backdrop-blur-md border border-red-500/50 shadow-2xl text-foreground select-none">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
          </span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-red-400">Rendering Timelapse on Server</span>
              <span className="text-xs font-mono text-muted-foreground">({timelapse_export_pct}%)</span>
            </div>
            <span className="text-[11px] text-muted-foreground truncate max-w-sm">{timelapse_export_status}</span>
          </div>
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-primary transition-all duration-150" style={{ width: `${timelapse_export_pct}%` }} />
          </div>
          <button
            type="button"
            onClick={handle_stop_timelapse_export}
            className="ml-1 px-3 py-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold text-xs flex items-center gap-1.5 rounded-full shadow-xs cursor-pointer transition-colors"
            title="Cancel timelapse render job on server"
          >
            <Icon name="stop" className="text-sm" />
            <span>Cancel</span>
          </button>
        </div>
      )}

      {/* Export Result Toast Banner */}
      {!is_headless_export && timelapse_export_result && (
        <div className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-lg bg-card/95 backdrop-blur-md border border-emerald-500/40 shadow-2xl text-foreground max-w-md">
          <Icon name="check_circle" className="text-emerald-400 text-xl flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-emerald-400">Timelapse Saved to Server!</div>
            <div className="text-[11px] text-muted-foreground truncate" title={timelapse_export_result.path}>
              File: <span className="font-mono text-foreground">{timelapse_export_result.filename}</span>
            </div>
            <div className="text-[10px] text-muted-foreground">
              Size: {(timelapse_export_result.sizeBytes / (1024 * 1024)).toFixed(2)} MB • Saved in exports/
            </div>
          </div>
          <button
            type="button"
            onClick={() => { }}
            className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      )}

      {/* Main Map Viewer */}
      <div className="absolute inset-0 w-full h-full overflow-hidden">
        <MapViewer
          raster={display_raster || active_raster}
          renderedCanvas={rendered_canvas}
          rasterBounds={raster_bounds}
          projection={projection}
          setProjection={set_projection}
          opacity={opacity}
          palette={color_palette}
          invertPalette={invert_palette}
          minVal={min_val}
          maxVal={max_val}
          legendTitle={legend_title}
          legendSubtitle={legend_subtitle}
          hideColourbar={Boolean(active_layer?.hide_colourbar)}
          scaleType={scale_type}
          logSigma={log_sigma}
          breaks={breaks}
          onUpdateBreaks={handle_update_breaks}
          mapModes={map_modes}
          onToggleMapMode={handle_toggle_map_mode}
          onReorderMapModes={handle_reorder_map_modes}
          heightmapConfig={heightmap_config}
          setHeightmapConfig={set_heightmap_config}
          circleOverlayConfig={circle_overlay_config}
          setCircleOverlayConfig={set_circle_overlay_config}
          historicalBordersConfig={historical_borders_config}
          setHistoricalBordersConfig={set_historical_borders_config}
          isMobile={is_mobile}
          analyticsOpen={is_mobile ? active_mobile_tab === 'analytics' : analytics_open}
          onToggleAnalytics={() => {
            if (is_mobile) {
              set_active_mobile_tab((arg0_prev) => arg0_prev === 'analytics' ? null : 'analytics')
            } else {
              set_analytics_open((arg0_prev) => !arg0_prev)
            }
          }}
          selectedCountry={selected_countries[0] || null}
          selectedCountries={selected_countries}
          deferredSelectedCountries={deferred_selected_countries}
          countryStats={country_stats}
          isCalculatingStats={is_calculating_stats}
          onSelectCountry={handle_select_country}
          onToggleCountry={handle_toggle_country}
          onClearCountries={handle_clear_countries}
          countriesMode={countries_mode}
          onToggleCountriesMode={handle_toggle_countries_mode}
          hoveredCountry={hovered_country}
          onHoverCountry={set_hovered_country}
          settingsDrawerOpen={is_mobile ? (active_mobile_tab === 'settings' || settings_drawer_open) : settings_drawer_open}
          onToggleSettingsDrawer={(arg0_open) => {
            set_settings_drawer_open(arg0_open)
            if (is_mobile)
              set_active_mobile_tab(arg0_open ? 'settings' : null)
          }}
          sidebarWidth={sidebar_width}
          colourbarWidth={colourbar_width}
          onResizeColourbarWidth={set_colourbar_width}
          infoPanelOpen={info_panel_open}
          onToggleInfoPanel={() => set_info_panel_open((arg0_prev) => !arg0_prev)}
          onCloseInfoPanel={() => set_info_panel_open(false)}
          activeLayerId={active_layer_id}
          activeVariableSelectors={active_variable_selectors}
          dataLayers={layers}
          isLoadingLayers={is_loading_layers || is_loading_raster}
          onChangeVariableSelector={handle_change_variable_selector}
          onInspect={handle_app_inspect}
          onSelectLayer={handle_select_layer}
          rasterVersion={raster_version}
          onToggleUi={() => set_ui_visible((arg0_prev) => !arg0_prev)}
          uiVisible={!is_headless_export && ui_visible && !is_timelapse_exporting}
          isTimelapseExporting={is_timelapse_exporting || is_headless_export}
          legendPosition={legend_position}
          onChangeLegendPosition={set_legend_position}
          onCloseCityDetails={handle_close_city_details}
          onSelectCity={handle_select_city}
          performantMode={performant_mode}
          onTogglePerformantMode={set_performant_mode}
          selectedCity={selected_city_record}
          selectedCityKey={selected_city_key}
          setStadesterConfig={set_stadester_config}
          stadesterCities={stadester_cities}
          stadesterConfig={stadester_config}
          timelineYear={timeline_year}
          userRole={user_role}
          onChangeYear={set_timeline_year}
        />

        {/* ECharts Analytical View Panel (Top Right) */}
        <AnalyticsDrawer
          isOpen={!is_headless_export && ui_visible && !is_timelapse_exporting && (is_mobile ? active_mobile_tab === 'analytics' : analytics_open)}
          isMobile={is_mobile}
          onToggleOpen={() => {
            set_analytics_open(false)
            if (is_mobile)
              set_active_mobile_tab(null)
          }}
          raster={display_raster || active_raster}
          scaleType={scale_type}
          logSigma={log_sigma}
          minOverride={min_val_override !== '' ? parseFloat(min_val_override) : undefined}
          maxOverride={max_val_override !== '' ? parseFloat(max_val_override) : undefined}
          selectedCountry={selected_countries[0] || null}
          selectedCountries={selected_countries}
          onSelectCountry={handle_select_country}
          onClearCountries={handle_clear_countries}
          countryStats={country_stats}
          isCalculatingStats={is_calculating_stats}
          isSettingsDrawerOpen={settings_drawer_open}
          rasterKey={raster_version}
          onForceRefresh={handle_force_refresh_analytics}
          activeLayer={active_layer}
          activeVariableSelectors={active_variable_selectors}
          citiesMode={stadester_config.enabled}
          currentYear={timeline_year}
          inspectData={inspect_data}
          onSelectCity={(arg0_key) => {
            set_selected_city_key(arg0_key)
          }}
          onChangeYear={set_timeline_year}
          stadesterDataset={stadester_config.dataset}
          userRole={user_role}
        />
      </div>

      {/* Historical Timeline Scrubber Bar */}
      {(ui_visible || is_timelapse_exporting || is_headless_export) && (!is_mobile || active_mobile_tab === 'timeline' || is_timelapse_exporting || is_headless_export) && (
        <TimelineBar
          availableKeyframes={available_keyframes}
          currentYear={timeline_year}
          isLoading={is_loading_raster || (stadester_config.enabled && stadester_result.isLoading)}
          isMobile={is_mobile}
          isPlaying={is_playing}
          maxYear={available_keyframes.length > 0 ? available_keyframes[available_keyframes.length - 1] : 2025}
          minYear={available_keyframes.length > 0 ? available_keyframes[0] : -10000}
          onChangePlaybackSpeed={set_playback_speed}
          onChangeYear={set_timeline_year}
          onClose={() => set_active_mobile_tab(null)}
          onTogglePlay={() => set_is_playing((arg0_prev) => !arg0_prev)}
          onToggleSnapToKeyframes={handle_toggle_snap_to_keyframes}
          playbackSpeed={playback_speed}
          snapToKeyframes={snap_to_keyframes}
          style={is_mobile ? {
            left: '8px',
            right: '8px',
            width: 'calc(100vw - 16px)',
          } : {
            left: 0,
            marginLeft: 'auto',
            marginRight: 'auto',
            right: 0,
            width: 'min(1100px, calc(100vw - 64px))',
          }}
        />
      )}

      {/* Floating Sidebar Controls Dock */}
      {!is_headless_export && ui_visible && !is_timelapse_exporting && (!is_mobile || active_mobile_tab === 'sidebar') && (
        <SidebarControls
          activeFileName={active_file_name}
          activeLayerId={active_layer_id}
          activeVariableSelectors={active_variable_selectors}
          appMode={app_mode}
          binningConfig={binning_config}
          bottomClearance={sidebar_bottom_clearance}
          boundsMode={bounds_mode}
          topClearance={sidebar_top_clearance}
          circleOverlayConfig={circle_overlay_config}
          colorPalette={color_palette}
          dataFormat={data_format}
          diffNameA={diff_name_a}
          diffNameB={diff_name_b}
          heightmapConfig={heightmap_config}
          historicalBordersConfig={historical_borders_config}
          infoPanelOpen={info_panel_open}
          invertPalette={invert_palette}
          isMobile={is_mobile}
          isLoadingLayers={is_loading_layers || is_loading_raster}
          layers={layers}
          legendSubtitle={legend_subtitle}
          legendTitle={legend_title}
          logSigma={log_sigma}
          mapModes={map_modes}
          maxValOverride={max_val_override}
          minValOverride={min_val_override}
          onChangeUserRole={handle_change_user_role}
          onChangeVariableSelector={handle_change_variable_selector}
          onClose={() => set_active_mobile_tab(null)}
          onFileUpload={handle_file_upload}
          onOpenVideoExport={() => {
            if (!isPublicBuild() && user_role === 'developer')
              set_video_export_open(true)
          }}
          onSelectLayer={handle_select_layer}
          onToggleInfoPanel={() => set_info_panel_open((arg0_prev) => !arg0_prev)}
          onToggleMapMode={handle_toggle_map_mode}
          onWidthChange={set_sidebar_width}
          opacity={opacity}
          percentileList={percentile_list}
          absoluteBreaks={absolute_breaks}
          scaleType={scale_type}
          selectedCountries={deferred_selected_countries}
          setAbsoluteBreaks={set_absolute_breaks}
          setAppMode={set_app_mode}
          setBinningConfig={set_binning_config}
          setBoundsMode={set_bounds_mode}
          setColorPalette={set_color_palette}
          setDataFormat={set_data_format}
          setInvertPalette={set_invert_palette}
          setLegendSubtitle={set_legend_subtitle}
          setLegendTitle={set_legend_title}
          setLogSigma={set_log_sigma}
          setMaxValOverride={set_max_val_override}
          setMinValOverride={set_min_val_override}
          setOpacity={set_opacity}
          setPercentileList={set_percentile_list}
          setScaleType={set_scale_type}
          stadesterConfig={stadester_config}
          userRole={user_role}
          width={sidebar_width}
        />
      )}

      {/* Developer Video Export Modal */}
      {!isPublicBuild() && user_role === 'developer' && (
        <VideoExportModal
          activeLayerId={active_layer_id}
          availableKeyframes={available_keyframes}
          availableLayers={layers}
          colorPalette={color_palette}
          currentProjection={projection}
          isOpen={video_export_open}
          legendSubtitle={legend_subtitle}
          legendTitle={legend_title}
          maxVal={max_val}
          maxYear={available_keyframes.length > 0 ? available_keyframes[available_keyframes.length - 1] : 2025}
          minVal={min_val}
          minYear={available_keyframes.length > 0 ? available_keyframes[0] : -10000}
          onClose={() => set_video_export_open(false)}
          onStartTimelapseExport={handle_start_timelapse_export}
          renderedCanvas={rendered_canvas}
          timelineYear={timeline_year}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      {is_mobile && ui_visible && !is_headless_export && !is_timelapse_exporting && (
        <MobileNavBar
          activeTab={active_mobile_tab}
          onSelectTab={(arg0_tab) => {
            set_active_mobile_tab(arg0_tab)
            if (arg0_tab === 'analytics') {
              set_analytics_open(true)
              set_settings_drawer_open(false)
            } else if (arg0_tab === 'settings') {
              set_settings_drawer_open(true)
              set_analytics_open(false)
            } else {
              set_analytics_open(false)
              set_settings_drawer_open(false)
            }
          }}
        />
      )}
    </div>
  )
}

export default App
