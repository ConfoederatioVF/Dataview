import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppMode,
  BinningConfig,
  BoundsMode,
  CircleOverlayConfig,
  CityFullRecord,
  CityPoint,
  ColorPalette,
  DataFormat,
  DEFAULT_HISTORICAL_BORDERS_CONFIG,
  DecodedRaster,
  HeightmapConfig,
  HistoricalBordersConfig,
  MapModeId,
  MapModeItem,
  ProjectionType,
  ScaleType,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { useCountryStatsAsync } from '@framework/geopng/use_country_stats_async.ts'
import { MAP_CONFIG, MAPMODES_CONFIG, PERMISSIONS_CONFIG, UserRole, isPublicBuild, isRoleAllowed } from '@common'
import { SidebarControls } from '@ui/leftbar/sidebar_controls'
import { MapViewer } from '@ui/map/map_viewer'
import { AnalyticsDrawer } from '@ui/rightbar/analytics_drawer'
import { TimelineBar } from '@ui/bottombar/timeline_bar'
import { MobileNavBar } from '@ui/bottombar/mobile_nav_bar'
import { VideoExportModal } from '@ui/export/video_export_modal'
import { Icon } from '@ui/components/icon'
import { useStadesterCities } from '@ui/map/use_stadester_cities'
import { useRasterPipeline } from '@framework/raster/use_raster_pipeline.ts'
import { useRasterRenderer } from '@framework/raster/use_raster_renderer.ts'
import { useTimelapseExportOrchestrator } from '@ui/export/use_timelapse_export_orchestrator.ts'
import { useLocalisation } from '@localisation'
import { useAppLayoutState } from './use_app_layout_state'
import { useHeadlessExport } from './export/use_headless_export'
import { getDefaultSelectorsForLayer, useAppLayersSync } from './use_app_layers_sync'
import { useAppDrawState } from './use_app_draw_state'
import { useAppFileUpload } from './use_app_file_upload'
import { useAppRasterBounds } from './use_app_raster_bounds'

export { getDefaultSelectorsForLayer }

/**
 * Main application root component managing raster datasets, map layers, and reactive view state.
 *
 * @returns {React.ReactElement}
 */
export let App: React.FC = function () {
  //Function body
  let { t } = useLocalisation()
  let layout_state = useAppLayoutState()
  let {
    activeMobileTab: active_mobile_tab,
    colourbarWidth: colourbar_width,
    isHeadlessExport: is_headless_export,
    isMobile: is_mobile,
    legendPosition: legend_position,
    setActiveMobileTab: set_active_mobile_tab,
    setColourbarWidth: set_colourbar_width,
    setLegendPosition: set_legend_position,
    setSidebarWidth: set_sidebar_width,
    setUiVisible: set_ui_visible,
    sidebarBottomClearance: sidebar_bottom_clearance,
    sidebarTopClearance: sidebar_top_clearance,
    sidebarWidth: sidebar_width,
    uiVisible: ui_visible,
  } = layout_state

  let [absolute_breaks, set_absolute_breaks] = useState<string>('0, 10, 50, 100, 500, 1000')
  let [analytics_open, set_analytics_open] = useState<boolean>(false)
  let [app_mode, set_app_mode] = useState<AppMode>('Single Image')
  let [binning_config, set_binning_config] = useState<BinningConfig>({
    enabled: false,
    height: 360,
    method: 'average',
    width: 720,
  })
  let [bounds_mode, set_bounds_mode] = useState<BoundsMode>('Manual')
  let [circle_overlay_config, set_circle_overlay_config] = useState<CircleOverlayConfig>({
    baseRadius: 1.0,
    enabled: false,
    haloWidth: 1,
    percentileCutoff: 99,
    strokeWidth: 2,
  })
  let [color_palette, set_color_palette] = useState<ColorPalette>('Plasma')
  let [data_format, set_data_format] = useState<DataFormat>('float32')

  let default_data_layers = useMemo(() => MAP_CONFIG.defaultDataLayers ?? ['detailed_borders', 'stadester'], [])
  let default_borders_enabled = default_data_layers.includes('detailed_borders') || default_data_layers.includes('simplified_borders') || default_data_layers.includes('historical_borders') || default_data_layers.includes('statistical_borders')
  let default_border_dataset = default_data_layers.includes('detailed_borders') ? 'detailed_borders' : (default_data_layers.includes('simplified_borders') ? 'simplified_borders' : 'detailed_borders')
  let default_stadester_enabled = default_data_layers.includes('stadester') || default_data_layers.includes('stadester_cities') || default_data_layers.includes('stadester_1.1')

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
  let [historical_borders_config, set_historical_borders_config] = useState<HistoricalBordersConfig>({
    ...DEFAULT_HISTORICAL_BORDERS_CONFIG,
    dataset: default_border_dataset,
    enabled: default_borders_enabled,
  })
  let [info_panel_open, set_info_panel_open] = useState<boolean>(false)
  let [inspect_data, set_inspect_data] = useState<any>(null)
  let [invert_palette, set_invert_palette] = useState<boolean>(false)
  let [is_playing, set_is_playing] = useState<boolean>(false)
  let [legend_subtitle, set_legend_subtitle] = useState<string>('')
  let [legend_title, set_legend_title] = useState<string>('Value')
  let [log_sigma, set_log_sigma] = useState<number>(1.0)
  let [map_modes, set_map_modes] = useState<MapModeItem[]>(() =>
    MAPMODES_CONFIG.modes.map((arg0_m) => ({
      active: arg0_m.active ?? false,
      id: arg0_m.id,
      label: arg0_m.label,
    }))
  )
  let [max_val_override, set_max_val_override] = useState<string>('')
  let [min_val_override, set_min_val_override] = useState<string>('')
  let [opacity, set_opacity] = useState<number>(0.85)
  let [percentile_list, set_percentile_list] = useState<string>(
    MAP_CONFIG.defaultPercentileBreaks || '0, 1, 5, 25, 50, 75, 95, 99, 100'
  )
  let [performant_mode, set_performant_mode] = useState<boolean>(false)
  let [playback_speed, set_playback_speed] = useState<number>(1)
  let [projection, set_projection] = useState<ProjectionType>('Mercator')
  let [scale_type, set_scale_type] = useState<ScaleType>('pseudo-log')
  let [selected_city_key, set_selected_city_key] = useState<string | null>(null)
  let [selected_city_point, set_selected_city_point] = useState<CityPoint | null>(null)
  let [settings_drawer_open, set_settings_drawer_open] = useState<boolean>(false)
  let [snap_to_keyframes, set_snap_to_keyframes] = useState<boolean>(false)
  let [stadester_config, set_stadester_config] = useState<StadesterConfig>(() => ({
    bubbleSize: 0.4,
    capitalColorMode: 'state',
    capitalConstantColor: '#FFDC00',
    colorMode: 'growth',
    dataset: 'stadester_1.1',
    enabled: default_stadester_enabled,
    filled: true,
    growthPalette: 'Rainbow',
    halo: false,
    heuristicCulling: true,
    labelCollision: true,
    maxCities: 4000,
    minPop: 0.01,
    opacity: 0.7,
    showCapitals: true,
    showCapitalUnderlines: true,
    showLabels: true,
  }))
  let [timeline_year, set_timeline_year] = useState<number>(1950)
  let default_app_role: UserRole = (PERMISSIONS_CONFIG.default_role as UserRole) || 'default'
  let [user_role, set_user_role] = useState<UserRole>(() => {
    if (isPublicBuild())
      return 'default'
    return isRoleAllowed(default_app_role) ? default_app_role : 'default'
  })
  let [video_export_open, set_video_export_open] = useState<boolean>(false)

  let raster_pipeline_ref = useRef<any>(null)

  let {
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
  } = useAppLayersSync({
    default_data_layers,
    default_stadester_enabled,
    is_mobile,
    raster_pipeline_ref,
    set_color_palette,
    set_data_format,
    set_historical_borders_config,
    set_invert_palette,
    set_legend_subtitle,
    set_legend_title,
    set_log_sigma,
    set_map_modes,
    set_max_val_override,
    set_min_val_override,
    set_scale_type,
    set_stadester_config,
  })

  let {
    active_countries,
    countries_mode,
    cursor_lng_lat,
    custom_vector_dataset,
    custom_vector_features,
    custom_vector_visible,
    draw_points,
    drawn_polygon_feature,
    handle_add_draw_point,
    handle_cancel_draw,
    handle_clear_countries,
    handle_clear_drawn_polygon,
    handle_delete_draw_point,
    handle_delete_last_draw_point,
    handle_edit_drawn_polygon,
    handle_finish_draw,
    handle_insert_draw_point,
    handle_move_draw_point,
    handle_remove_custom_vector,
    handle_select_country,
    handle_toggle_countries_mode,
    handle_toggle_country,
    handle_toggle_draw,
    handle_upload_custom_vector,
    hovered_country,
    is_drawing,
    is_editing_shape,
    selected_countries,
    set_cursor_lng_lat,
    set_custom_vector_visible,
    set_hovered_country,
  } = useAppDrawState({
    set_inspect_data,
    set_map_modes,
    set_selected_city_key,
    set_timeline_year,
    timeline_year,
  })

  let deferred_selected_countries = useDeferredValue(selected_countries)

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
  raster_pipeline_ref.current = {
    activeFileName: active_file_name,
    diffNameA: diff_name_a,
    diffNameB: diff_name_b,
    setActiveFileName: set_active_file_name,
    setDiffNameA: set_diff_name_a,
    setDiffNameB: set_diff_name_b,
    setRasterA: set_raster_a,
    setRasterVersion: set_raster_version,
  }

  let {
    active_midpoint,
    active_raster,
    breaks,
    display_raster,
    max_val,
    min_val,
  } = useAppRasterBounds({
    absolute_breaks,
    active_layer,
    active_variable_selectors,
    app_mode,
    binning_config,
    bounds_mode,
    max_val_override,
    min_val_override,
    percentile_list,
    pipeline_display_raster,
    raster_a,
    raster_b,
  })

  useEffect(() => {
    clear_raster_cache()
  }, [performant_mode, active_layer_id, clear_raster_cache])

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
    year: timeline_year,
  })
  let stadester_cities: CityPoint[] = stadester_result.cities
  let selected_city_record: CityFullRecord | null = stadester_result.selectedCity
  let effective_selected_city = useMemo<CityFullRecord | null>(() => {
    if (selected_city_record && selected_city_point && (selected_city_record.key === selected_city_point.key || String(selected_city_record.id) === String(selected_city_point.id))) {
      return {
        ...selected_city_point,
        ...selected_city_record,
        capitalColor: selected_city_record.capitalColor || (selected_city_record as any).capital_color || selected_city_point.capitalColor || (selected_city_point as any).capital_color,
        capitalOf: selected_city_record.capitalOf || (selected_city_record as any).capital_state_name || selected_city_point.capitalOf || (selected_city_point as any).capital_state_name,
        capitalStateId: (selected_city_record as any).capitalStateId || (selected_city_record as any).capital_state_id || (selected_city_point as any).capitalStateId || (selected_city_point as any).capital_state_id,
        capital_color: (selected_city_record as any).capital_color || selected_city_record.capitalColor || (selected_city_point as any).capital_color || selected_city_point.capitalColor,
        capital_state_id: (selected_city_record as any).capital_state_id || (selected_city_record as any).capital_state_id || (selected_city_point as any).capital_state_id || (selected_city_point as any).capitalStateId,
        capital_state_name: (selected_city_record as any).capital_state_name || selected_city_record.capitalOf || (selected_city_point as any).capital_state_name || selected_city_point.capitalOf,
        coords: selected_city_record.coords || selected_city_point.coords,
        isCapital: (selected_city_point.isCapital !== undefined) ? selected_city_point.isCapital : Boolean(selected_city_record.isCapital || (selected_city_record as any).is_capital),
        is_capital: (selected_city_point.isCapital !== undefined) ? selected_city_point.isCapital : Boolean((selected_city_record as any).is_capital || selected_city_record.isCapital),
        rawCoords: (selected_city_record as any).rawCoords || (selected_city_point as any).rawCoords,
      } as unknown as CityFullRecord
    }
    if (selected_city_point)
      return selected_city_point as unknown as CityFullRecord
    if (selected_city_record)
      return selected_city_record
    return null
  }, [selected_city_record, selected_city_point])

  useEffect(() => {
    ; (window as any).setStadesterConfig = set_stadester_config
      ; (window as any).stadesterConfig = stadester_config
      ; (window as any).setActiveLayerId = set_active_layer_id
      ; (window as any).setSelectedCityKey = set_selected_city_key
      ; (window as any).selectedCityRecord = effective_selected_city
      ; (window as any).selectedCityKey = selected_city_key
  }, [set_stadester_config, stadester_config, set_active_layer_id, set_selected_city_key, effective_selected_city, selected_city_key])

  let handle_close_city_details = useCallback(() => {
    set_selected_city_key(null)
    set_selected_city_point(null)
  }, [])

  let handle_select_city = useCallback((arg0_city: CityPoint | null) => {
    if (is_drawing)
      return
    let city = arg0_city
    if (!city) {
      set_selected_city_key(null)
      set_selected_city_point(null)
    } else {
      set_selected_city_key(city.key)
      set_selected_city_point(city)
    }
  }, [is_drawing])

  let handle_app_inspect = useCallback(
    (arg0_data: any) => {
      let insp_data = arg0_data
      if (!analytics_open)
        return
      set_inspect_data(insp_data)
    },
    [analytics_open]
  )

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

  let { countryStats: country_stats, isCalculatingStats: is_calculating_stats } = useCountryStatsAsync({
    activeCountries: active_countries,
    activeRaster: display_raster || active_raster,
    isHoverOnly: false,
  })

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
    midpoint: active_midpoint,
    minVal: min_val,
    projection: projection,
    rasterVersion: raster_version,
    scaleType: scale_type,
  })

  let handle_change_year = useCallback((arg0_year: number) => {
    let yr = arg0_year === 0 ? 1 : arg0_year
    set_timeline_year(yr)
  }, [])

  let handle_change_user_role = useCallback((arg0_role: UserRole) => {
    let role = arg0_role
    if (isRoleAllowed(role))
      set_user_role(role)
    else
      console.warn(`[Permissions] Role switch to '${role}' not permitted in current instance.`)
  }, [])

  useEffect(() => {
    let search_params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null
    let url_proj = search_params?.get('projection') as ProjectionType | null
    if (url_proj && ['EqualEarth', 'Mercator', 'Globe', 'Equirectangular'].includes(url_proj))
      set_projection(url_proj)
  }, [])

  let prev_is_mobile_culling_ref = useRef(is_mobile)
  useEffect(() => {
    if (prev_is_mobile_culling_ref.current !== is_mobile) {
      prev_is_mobile_culling_ref.current = is_mobile
      if (is_mobile) {
        set_stadester_config((arg0_prev) => ({
          ...arg0_prev,
          heuristicCulling: true,
        }))
      }
    }
  }, [is_mobile])

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

  let { handle_file_upload } = useAppFileUpload({
    active_file_name,
    app_mode,
    data_format,
    diff_name_a,
    diff_name_b,
    raw_bytes_a,
    raw_bytes_b,
    set_active_file_name,
    set_active_layer_id,
    set_bounds_mode,
    set_diff_name_a,
    set_diff_name_b,
    set_legend_subtitle,
    set_legend_title,
    set_max_val_override,
    set_min_val_override,
    set_raster_a,
    set_raster_b,
    set_raster_version,
    set_raw_bytes_a,
    set_raw_bytes_b,
    t,
  })

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

      handle_toggle_countries_mode(country_active)
      set_heightmap_config((arg0_h) => ({ ...arg0_h, enabled: spike_active }))
      set_circle_overlay_config((arg0_c) => ({ ...arg0_c, enabled: circle_active }))
      return updated
    })
  }, [handle_toggle_countries_mode])

  let handle_reorder_map_modes = useCallback((arg0_new_modes: MapModeItem[]) => {
    let new_modes = arg0_new_modes
    set_map_modes(new_modes)
  }, [set_map_modes])

  let handle_update_breaks = useCallback((arg0_new_breaks: number[]) => {
    let new_breaks = arg0_new_breaks
    set_bounds_mode('Absolute')
    set_absolute_breaks(new_breaks.map((arg0_n) => (Math.round(arg0_n * 1000) / 1000).toString()).join(', '))
  }, [set_absolute_breaks, set_bounds_mode])

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
          midpoint={active_midpoint}
          legendTitle={legend_title}
          legendSubtitle={legend_subtitle}
          hideColourbar={Boolean(active_layer?.hide_colourbar && !active_file_name && !diff_name_a && !diff_name_b)}
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
          cursorLngLat={cursor_lng_lat}
          customVectorFeatures={custom_vector_features}
          customVectorVisible={custom_vector_visible}
          drawPoints={draw_points}
          drawnPolygonFeature={drawn_polygon_feature}
          historicalBordersConfig={historical_borders_config}
          setHistoricalBordersConfig={set_historical_borders_config}
          isDrawing={is_drawing}
          isEditingShape={is_editing_shape}
          isMobile={is_mobile}
          onAddDrawPoint={handle_add_draw_point}
          onCancelDraw={handle_cancel_draw}
          onClearDrawnPolygon={handle_clear_drawn_polygon}
          onDeleteDrawPoint={handle_delete_draw_point}
          onDeleteLastDrawPoint={handle_delete_last_draw_point}
          onEditPolygon={handle_edit_drawn_polygon}
          onFinishDraw={handle_finish_draw}
          onInsertDrawPoint={handle_insert_draw_point}
          onMoveDrawPoint={handle_move_draw_point}
          onSetCursorLngLat={set_cursor_lng_lat}
          onToggleDraw={handle_toggle_draw}
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
          isLoadingLayers={is_loading_layers}
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
          selectedCity={effective_selected_city}
          selectedCityKey={selected_city_key}
          setStadesterConfig={set_stadester_config}
          stadesterCities={stadester_cities}
          stadesterConfig={stadester_config}
          isPlaying={is_playing}
          snapToKeyframes={snap_to_keyframes}
          timelineYear={timeline_year}
          userRole={user_role}
          onChangeYear={handle_change_year}
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
          countryStats={selected_countries.length > 0 ? country_stats : null}
          isCalculatingStats={selected_countries.length > 0 && is_calculating_stats}
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
          onChangeYear={handle_change_year}
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
          onChangeYear={handle_change_year}
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
          customVectorDataset={custom_vector_dataset}
          customVectorVisible={custom_vector_visible}
          dataFormat={data_format}
          diffNameA={diff_name_a}
          diffNameB={diff_name_b}
          heightmapConfig={heightmap_config}
          historicalBordersConfig={historical_borders_config}
          infoPanelOpen={info_panel_open}
          invertPalette={invert_palette}
          isMobile={is_mobile}
          isLoadingLayers={is_loading_layers}
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
          onRemoveCustomVector={handle_remove_custom_vector}
          onSelectLayer={handle_select_layer}
          onToggleCustomVectorVisible={set_custom_vector_visible}
          onToggleInfoPanel={() => set_info_panel_open((arg0_prev) => !arg0_prev)}
          onToggleMapMode={handle_toggle_map_mode}
          onUploadCustomVector={handle_upload_custom_vector}
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
