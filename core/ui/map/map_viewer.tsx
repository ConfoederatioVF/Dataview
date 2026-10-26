import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DeckGL from '@deck.gl/react'
import {
  CountryFeature,
  loadCountriesGeoJson,
} from '@framework/geopng/polygon_binning.ts'
import {
  generateEqualEarthGraticule,
  transformGeometryToEqualEarth,
} from '@framework/geopng/equal_earth.ts'
import type { CityPoint } from '@framework/geopng/types.ts'
import { MAP_CONFIG } from '@common'
import { UI_LAYOUT } from '@framework/utils/ui_layout.ts'
import { ClickInfoPanel } from './click_info_panel'
import { CityDetailsPanel } from './city_details_panel'
import { MapmodesTray } from '@ui/rightbar/mapmodes_tray'
import { MapViewerHUD } from '@ui/topbar/map_viewer_hud'
import { useMapClearance } from './use_map_clearance'
import { useMapViewState } from './use_map_view_state'
import { resetSmoothPinchState } from './smooth_controllers'
import { useElevationSpikes } from './use_elevation_spikes'
import { useCircleOverlay } from './use_circle_overlay'
import { useDeckLayers } from './use_deck_layers'
import { useStadesterWorker } from '@framework/stadester/use_stadester_worker'
import { useHistoricalBorders } from './use_historical_borders'
import { HistoricalBorderDetailsPanel } from './historical_border_details_panel'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import { useMapViewerDrawing } from './use_map_viewer_drawing.ts'
import { useMapViewerSampling } from './use_map_viewer_sampling.ts'
import { useMapViewerDetailsNav } from './use_map_viewer_details_nav.ts'
import { useMapViewerContainerEvents } from './use_map_viewer_container_events.ts'
import type { MapViewerProps } from './map_viewer_types.ts'

export type { MapViewerProps }

let EMPTY_ARRAY: any[] = []
let NOOP_FN = () => { }

/**
 * Main map viewer component rendering multi-projection deck.gl views with 2D/3D overlays.
 *
 * @param {MapViewerProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let MapViewer: React.FC<MapViewerProps> = function (arg0_props: MapViewerProps) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as MapViewerProps)
  let analytics_open = props.analyticsOpen
  let breaks = props.breaks
  let circle_overlay_config = props.circleOverlayConfig
  let colourbar_width = props.colourbarWidth
  let countries_mode = props.countriesMode
  let country_stats = props.countryStats
  let cursor_lng_lat = props.cursorLngLat
  let custom_vector_features = props.customVectorFeatures || EMPTY_ARRAY
  let custom_vector_visible = props.customVectorVisible !== false
  let draw_points = props.drawPoints || EMPTY_ARRAY
  let drawn_polygon_feature = props.drawnPolygonFeature
  let heightmap_config = props.heightmapConfig
  let hide_colourbar = Boolean(props.hideColourbar)
  let historical_borders_config = props.historicalBordersConfig
  let hovered_country = props.hoveredCountry
  let info_panel_open = props.infoPanelOpen ?? false
  let invert_palette = props.invertPalette
  let is_calculating_stats = props.isCalculatingStats
  let is_drawing = Boolean(props.isDrawing)
  let is_editing_shape = Boolean(props.isEditingShape)
  let is_mobile = props.isMobile ?? false
  let is_playing = props.isPlaying ?? false
  let is_timelapse_exporting = props.isTimelapseExporting ?? false
  let legend_position = ((props.legendPosition || 'top-left') as string).replace('centre', 'center') as 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  let legend_subtitle = props.legendSubtitle
  let legend_title = props.legendTitle
  let log_sigma = props.logSigma
  let map_modes = props.mapModes
  let max_val = props.maxVal
  let midpoint = props.midpoint
  let min_val = props.minVal
  let on_add_draw_point = props.onAddDrawPoint
  let on_cancel_draw = props.onCancelDraw
  let on_change_legend_position = props.onChangeLegendPosition
  let on_clear_countries = props.onClearCountries
  let on_clear_drawn_polygon = props.onClearDrawnPolygon
  let on_close_city_details = props.onCloseCityDetails
  let on_close_info_panel = props.onCloseInfoPanel
  let on_delete_draw_point = props.onDeleteDrawPoint
  let on_delete_last_draw_point = props.onDeleteLastDrawPoint
  let on_edit_polygon = props.onEditPolygon
  let on_finish_draw = props.onFinishDraw
  let on_hover_city = props.onHoverCity
  let on_hover_country = props.onHoverCountry
  let on_insert_draw_point = props.onInsertDrawPoint
  let on_inspect = props.onInspect
  let on_move_draw_point = props.onMoveDrawPoint
  let on_reorder_map_modes = props.onReorderMapModes
  let on_resize_colourbar_width = props.onResizeColourbarWidth
  let on_select_city = props.onSelectCity
  let on_select_country = props.onSelectCountry
  let on_set_cursor_lng_lat = props.onSetCursorLngLat
  let on_toggle_analytics = props.onToggleAnalytics
  let on_toggle_countries_mode = props.onToggleCountriesMode
  let on_toggle_country = props.onToggleCountry
  let on_toggle_draw = props.onToggleDraw
  let on_toggle_map_mode = props.onToggleMapMode
  let on_toggle_performant_mode = props.onTogglePerformantMode
  let on_toggle_settings_drawer = props.onToggleSettingsDrawer
  let on_toggle_ui = props.onToggleUi
  let on_update_breaks = props.onUpdateBreaks
  let opacity = props.opacity
  let palette = props.palette
  let performant_mode = props.performantMode ?? false
  let pick_radius = props.pickRadius
  let projection = props.projection
  let raster = props.raster
  let raster_bounds = props.rasterBounds
  let raster_version = props.rasterVersion
  let rendered_canvas = props.renderedCanvas
  let scale_type = props.scaleType
  let selected_city = props.selectedCity
  let selected_city_key = props.selectedCityKey
  let selected_countries = props.selectedCountries
  let selected_country = props.selectedCountry
  let set_circle_overlay_config = props.setCircleOverlayConfig
  let set_heightmap_config = props.setHeightmapConfig
  let set_historical_borders_config = props.setHistoricalBordersConfig
  let set_projection = props.setProjection
  let set_stadester_config = props.setStadesterConfig
  let sidebar_width = props.sidebarWidth
  let snap_to_keyframes = props.snapToKeyframes ?? false
  let stadester_cities = props.stadesterCities
  let stadester_config = props.stadesterConfig
  let timeline_year = props.timelineYear
  let ui_visible = props.uiVisible !== undefined ? props.uiVisible : true

  //Declare local instance variables
  let active_layer: any = null
  let circle_pixel_data: any
  let container_ref = useRef<HTMLDivElement>(null)
  let deck_ref = useRef<any>(null)
  let default_desktop_pick_radius: number
  let default_touch_pick_radius: number
  let effective_pick_radius: number
  let elevation_spikes_data: any
  let equal_earth_land_geo_json: any
  let graticule_paths: { path: [number, number][] }[]
  let handle_reset_view: () => void
  let layers: any[]
  let safe_handle_view_state_change: (arg0_e: any) => void

  //Function body
  default_desktop_pick_radius = MAP_CONFIG.desktopPickRadius ?? 2
  default_touch_pick_radius = MAP_CONFIG.touchPickRadius ?? 18
  effective_pick_radius = (pick_radius !== undefined) ? pick_radius : (is_mobile ? default_touch_pick_radius : default_desktop_pick_radius)

  let [internal_flyout_open, set_internal_flyout_open] = useState(false)
  let flyout_open = (props.settingsDrawerOpen !== undefined) ? props.settingsDrawerOpen : internal_flyout_open
  let set_flyout_open = on_toggle_settings_drawer || set_internal_flyout_open

  let [hovered_city, set_hovered_city] = useState<CityPoint | null>(null)
  let [hovered_city_pos, set_hovered_city_pos] = useState<{ x: number; y: number } | null>(null)
  let [hovered_historical_feature, set_hovered_historical_feature] = useState<HistoricalBorderFeature | null>(null)

  let border_dataset = historical_borders_config?.dataset || (props.activeLayerId && props.activeLayerId.includes('border') ? props.activeLayerId : 'statistical_borders')
  let is_historical_borders_active = Boolean(
    historical_borders_config?.enabled ||
    props.historicalBordersEnabled ||
    props.activeLayerId === 'statistical_borders' ||
    props.activeLayerId === 'simplified_borders' ||
    props.activeLayerId === 'detailed_borders' ||
    (props.activeLayerId && props.activeLayerId.includes('border')) ||
    map_modes.find((arg0_m) => arg0_m.id === 'historical_borders')?.active
  )

  let historical_borders_result = useHistoricalBorders(
    props.activeLayerId,
    timeline_year || 1950,
    is_historical_borders_active,
    border_dataset,
    { isPlaying: is_playing, snapToKeyframes: snap_to_keyframes }
  )

  let drawing_system = useMapViewerDrawing({
    deck_ref,
    draw_points,
    is_drawing,
    is_editing_shape,
    is_mobile,
    on_add_draw_point,
    on_cancel_draw,
    on_delete_draw_point,
    on_delete_last_draw_point,
    on_finish_draw,
    on_insert_draw_point,
    on_move_draw_point,
    on_set_cursor_lng_lat,
    projection,
  })
  let {
    dragged_vertex_idx,
    dragged_vertex_idx_ref,
    handleDoubleClickCapture,
    handleMapClick,
    handlePointerDownCapture,
    handleTouchStartCapture,
    hovered_vertex_idx,
  } = drawing_system

  useEffect(() => {
    set_hovered_city(null)
    set_hovered_city_pos(null)
  }, [stadester_config?.enabled, props.activeLayerId, map_modes, projection])

  let clearance = useMapClearance({
    analyticsOpen: analytics_open,
    flyoutOpen: flyout_open,
    mapModes: map_modes,
    uiVisible: ui_visible,
  })
  let {
    colourbarClearance: colourbar_clearance,
    effectiveMapmodesBottom: effective_mapmodes_bottom,
    mapmodesBounds: mapmodes_bounds,
    mapmodesClearance: mapmodes_clearance,
    mapmodesHeight: mapmodes_height,
    mapmodesTakenRight: mapmodes_taken_right,
    mapmodesWidth: mapmodes_width,
    timelineBounds: timeline_bounds,
    timelineClearance: timeline_clearance,
    topRightTaken: top_right_taken,
    topbarClearance: topbar_clearance,
  } = clearance

  let view_state_mgmt = useMapViewState({
    heightmapConfig: heightmap_config,
    projection,
  })
  let {
    cameraTilt: camera_tilt,
    effectiveViewState: effective_view_state,
    handleResetView: raw_handle_reset_view,
    handleViewStateChange: handle_view_state_change,
    projViewStates: proj_view_states,
    setProjViewStates: set_proj_view_states,
    views,
  } = view_state_mgmt

  safe_handle_view_state_change = useCallback(
    (arg0_e: any) => {
      let e = arg0_e
      if (dragged_vertex_idx_ref.current !== null)
        return
      handle_view_state_change(e)
    },
    [dragged_vertex_idx_ref, handle_view_state_change]
  )

  let details_nav = useMapViewerDetailsNav({
    deck_ref,
    drawn_polygon_feature,
    historical_borders_result,
    is_drawing,
    on_clear_countries,
    on_clear_drawn_polygon,
    on_close_city_details,
    on_edit_polygon,
    on_select_city,
    on_select_country,
    on_toggle_country,
    proj_view_states,
    projection,
    selected_city,
    selected_city_key,
    selected_countries,
    selected_country,
    set_proj_view_states,
    timeline_year,
  })
  let {
    active_panel_type,
    handle_center_selected_city,
    handle_clear_polygon,
    handle_close_all_details,
    handle_edit_polygon,
    handle_map_select_city,
    handle_nav_back,
    handle_select_city_from_country,
    handle_select_country_from_city,
    nav_history,
    selected_city_anchor,
    selected_historical_anchor,
    selected_historical_feature,
    set_active_panel_type,
    set_nav_history,
    set_selected_historical_anchor_coord,
    set_selected_historical_anchor_screen,
    set_selected_historical_feature,
  } = details_nav

  let [basemap, set_basemap] = useState<string>(MAP_CONFIG.basemapLayers[0]?.id || 'dark')
  let [show_graticule, set_show_graticule] = useState(true)
  let [show_tooltips, set_show_tooltips] = useState(true)
  let [inspect_data, set_inspect_data] = useState<any>(null)
  let [cursor_pos, set_cursor_pos] = useState<{ x: number; y: number } | null>(null)

  let [land_geo_json, set_land_geo_json] = useState<any>(null)
  let [country_features, set_country_features] = useState<CountryFeature[]>([])

  useEffect(() => {
    fetch('/data/ne_50m_land.geojson')
      .then((r) => r.json())
      .then((data) => set_land_geo_json(data))
      .catch((err) => console.error('Failed to load land geojson:', err))

    loadCountriesGeoJson().then((feats) => set_country_features(feats))
  }, [])

  equal_earth_land_geo_json = useMemo(() => {
    if (!land_geo_json)
      return null
    try {
      return {
        features: land_geo_json.features.map((f: any) => ({
          ...f,
          geometry: transformGeometryToEqualEarth(f.geometry),
        })),
        type: 'FeatureCollection',
      }
    } catch {
      return land_geo_json
    }
  }, [land_geo_json])

  graticule_paths = useMemo(() => {
    if (projection === 'EqualEarth')
      return generateEqualEarthGraticule(10, 20)

    let lat_interval = MAP_CONFIG.mapDefines?.graticule?.latInterval || 10
    let lng_interval = MAP_CONFIG.mapDefines?.graticule?.lngInterval || 20
    let paths_array: { path: [number, number][] }[] = []

    for (let i = -80; i <= 80; i += lat_interval) {
      let local_line: [number, number][] = []
      for (let x = -180; x <= 180; x += 5)
        local_line.push([x, i])
      paths_array.push({ path: local_line })
    }

    for (let i = -180; i <= 180; i += lng_interval) {
      let local_line: [number, number][] = []
      for (let x = -85; x <= 85; x += 5)
        local_line.push([i, x])
      paths_array.push({ path: local_line })
    }

    return paths_array
  }, [projection])

  let effective_country_features = useMemo(() => {
    if (is_historical_borders_active && historical_borders_result.bordersData?.features && historical_borders_result.bordersData.features.length > 0)
      return historical_borders_result.bordersData.features as unknown as CountryFeature[]
    return country_features
  }, [is_historical_borders_active, historical_borders_result.bordersData, country_features])

  let sampling_system = useMapViewerSampling({
    countries_mode,
    country_features,
    custom_vector_features,
    custom_vector_visible,
    deck_ref,
    drawn_polygon_feature,
    effective_country_features,
    handleMapClick,
    is_drawing,
    is_editing_shape,
    is_historical_borders_active,
    on_close_city_details,
    on_hover_country,
    on_inspect,
    on_select_country,
    on_set_cursor_lng_lat,
    on_toggle_country,
    projection,
    raster,
    set_active_panel_type,
    set_cursor_pos,
    set_hovered_city,
    set_hovered_city_pos,
    set_hovered_historical_feature,
    set_inspect_data,
    set_nav_history,
    set_selected_historical_anchor_coord,
    set_selected_historical_anchor_screen,
    set_selected_historical_feature,
  })
  let {
    handle_click,
    handle_hover,
    hover_raf_ref,
    is_interacting_ref,
    pending_pointer_pos_ref,
    pending_touch_pos_ref,
    sample_pointer_at,
    touch_pick_raf_ref,
  } = sampling_system

  let container_events = useMapViewerContainerEvents({
    countries_mode,
    drawing_system,
    hover_raf_ref,
    hovered_city_pos,
    is_drawing,
    is_interacting_ref,
    on_hover_country,
    pending_pointer_pos_ref,
    pending_touch_pos_ref,
    sample_pointer_at,
    set_cursor_pos,
    set_hovered_city,
    set_hovered_city_pos,
    set_hovered_historical_feature,
    set_inspect_data,
    show_tooltips,
    touch_pick_raf_ref,
  })
  let {
    on_pointer_cancel,
    on_pointer_leave,
    on_pointer_move,
    on_pointer_up,
    on_touch_end,
    on_touch_move,
    on_touch_start,
  } = container_events

  handle_reset_view = useCallback(() => {
    resetSmoothPinchState()
    if (hover_raf_ref.current !== null) {
      cancelAnimationFrame(hover_raf_ref.current)
      hover_raf_ref.current = null
    }
    if (touch_pick_raf_ref.current !== null) {
      cancelAnimationFrame(touch_pick_raf_ref.current)
      touch_pick_raf_ref.current = null
    }
    pending_pointer_pos_ref.current = null
    pending_touch_pos_ref.current = null
    is_interacting_ref.current = false
    set_inspect_data(null)
    set_cursor_pos(null)
    set_hovered_city(null)
    set_hovered_city_pos(null)
    set_hovered_historical_feature(null)
    raw_handle_reset_view()
  }, [hover_raf_ref, is_interacting_ref, pending_pointer_pos_ref, pending_touch_pos_ref, raw_handle_reset_view, touch_pick_raf_ref])

  elevation_spikes_data = useElevationSpikes({
    countriesMode: countries_mode,
    countryStats: country_stats,
    heightmapConfig: heightmap_config,
    invertPalette: invert_palette,
    logSigma: log_sigma,
    maxVal: max_val,
    minVal: min_val,
    palette,
    projection,
    raster,
    scaleType: scale_type,
    selectedCountries: selected_countries,
    selectedCountry: selected_country,
  })

  circle_pixel_data = useCircleOverlay({
    circleOverlayConfig: circle_overlay_config,
    countriesMode: countries_mode,
    heightmapConfig: heightmap_config,
    invertPalette: invert_palette,
    maxVal: max_val,
    minVal: min_val,
    palette,
    projection,
    raster,
    selectedCountries: selected_countries,
    selectedCountry: selected_country,
  })

  let worker_result = useStadesterWorker({
    cities: stadester_cities || [],
    config: stadester_config,
    projection,
    viewState: proj_view_states[projection],
    year: timeline_year || 1950,
  })

  layers = useDeckLayers({
    activeLayerId: props.activeLayerId,
    basemap,
    circleOverlayConfig: circle_overlay_config,
    circlePixelData: circle_pixel_data,
    countriesMode: countries_mode,
    cursorLngLat: cursor_lng_lat,
    customVectorFeatures: custom_vector_features,
    customVectorVisible: custom_vector_visible,
    draggedVertexIndex: dragged_vertex_idx,
    drawPoints: draw_points,
    drawnPolygonFeature: drawn_polygon_feature,
    elevationSpikesData: elevation_spikes_data,
    equalEarthLandGeoJson: equal_earth_land_geo_json,
    graticulePaths: graticule_paths,
    heightmapConfig: heightmap_config,
    historicalBordersConfig: historical_borders_config,
    historicalBordersData: is_historical_borders_active ? historical_borders_result.bordersData : null,
    hoveredCity: hovered_city,
    hoveredCountry: hovered_country,
    hoveredHistoricalFeature: hovered_historical_feature,
    hoveredVertexIndex: hovered_vertex_idx,
    invertPalette: invert_palette,
    isDrawing: is_drawing,
    isEditingShape: is_editing_shape,
    isMobile: is_mobile,
    landGeoJson: land_geo_json,
    maxVal: max_val,
    minVal: min_val,
    onFinishDraw: on_finish_draw,
    onHoverCity: (arg0_city, arg1_x, arg2_y) => {
      if (is_drawing)
        return
      set_hovered_city(arg0_city)
      if (arg1_x !== undefined && arg2_y !== undefined)
        set_hovered_city_pos({ x: arg1_x, y: arg2_y })
      if (on_hover_city)
        on_hover_city(arg0_city, arg1_x, arg2_y)
    },
    onHoverCustomVectorFeature: (feat) => {
      if (is_drawing)
        return
      set_hovered_historical_feature(feat as unknown as HistoricalBorderFeature | null)
    },
    onHoverHistoricalFeature: (feat) => {
      if (is_drawing)
        return
      set_hovered_historical_feature(feat)
    },
    onSelectCity: handle_map_select_city,
    onSelectCustomVectorFeature: (feat, coord, x, y) => {
      if (is_drawing)
        return
      let hist_feat = feat as unknown as HistoricalBorderFeature
      set_nav_history([])
      set_active_panel_type('country')
      if (on_close_city_details)
        on_close_city_details()
      set_selected_historical_feature(hist_feat)
      if (coord)
        set_selected_historical_anchor_coord([coord[0], coord[1]])
      if (x !== undefined && y !== undefined)
        set_selected_historical_anchor_screen({ x, y })
      if (on_toggle_country)
        on_toggle_country(feat)
      else if (on_select_country)
        on_select_country(feat)
    },
    onSelectDrawnPolygon: (feat, coord, x, y) => {
      if (is_drawing)
        return
      let hist_feat = feat as unknown as HistoricalBorderFeature
      set_nav_history([])
      set_active_panel_type('country')
      if (on_close_city_details)
        on_close_city_details()
      set_selected_historical_feature(hist_feat)
      if (coord)
        set_selected_historical_anchor_coord([coord[0], coord[1]])
      if (x !== undefined && y !== undefined)
        set_selected_historical_anchor_screen({ x, y })
      if (on_toggle_country)
        on_toggle_country(feat)
      else if (on_select_country)
        on_select_country(feat)
    },
    onSelectHistoricalFeature: (feat, coord, x, y) => {
      if (is_drawing)
        return
      set_nav_history([])
      set_active_panel_type('country')
      if (on_close_city_details)
        on_close_city_details()
      set_selected_historical_feature(feat)
      if (coord)
        set_selected_historical_anchor_coord([coord[0], coord[1]])
      if (x !== undefined && y !== undefined)
        set_selected_historical_anchor_screen({ x, y })
      if (on_toggle_country)
        on_toggle_country(feat as unknown as CountryFeature)
      else if (on_select_country)
        on_select_country(feat as unknown as CountryFeature)
    },
    opacity,
    palette,
    projection,
    raster,
    rasterBounds: raster_bounds,
    rasterVersion: raster_version,
    renderedCanvas: rendered_canvas,
    selectedCityKey: selected_city_key,
    selectedCountries: selected_countries,
    selectedCountry: selected_country,
    selectedHistoricalFeature: selected_historical_feature,
    showGraticule: show_graticule,
    stadesterCities: stadester_cities,
    stadesterConfig: stadester_config,
    stadesterLabels: worker_result.labels,
    stadesterPoints: worker_result.points,
    timelineYear: timeline_year || 1950,
  })

  if (props.activeLayerId && props.dataLayers) {
    active_layer = props.dataLayers[props.activeLayerId] || null
    if (!active_layer && props.activeLayerId.includes('.')) {
      let parent_id = props.activeLayerId.split('.')[0]
      let parent = props.dataLayers[parent_id]
      if (parent && parent.sub_layers) {
        active_layer = parent.sub_layers.find((arg0_sub: any) => arg0_sub.id === props.activeLayerId) || null
      }
    }
  }

  //Return statement
  return (
    <div
      ref={container_ref}
      id="dataview-map-container"
      className="relative w-full h-full overflow-hidden select-none bg-background font-sans"
      style={{ imageRendering: 'pixelated', touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDownCapture={handlePointerDownCapture}
      onTouchStartCapture={handleTouchStartCapture}
      onDoubleClickCapture={handleDoubleClickCapture}
      onPointerLeave={on_pointer_leave}
      onPointerMove={on_pointer_move}
      onPointerUp={on_pointer_up}
      onPointerCancel={on_pointer_cancel}
      onTouchStart={on_touch_start}
      onTouchMove={on_touch_move}
      onTouchEnd={on_touch_end}
    >
      <DeckGL
        ref={deck_ref}
        id="deckgl-overlay"
        style={{ touchAction: 'none' }}
        views={views}
        viewState={effective_view_state}
        onViewStateChange={safe_handle_view_state_change}
        onInteractionStateChange={(arg0_state: any) => {
          let state = arg0_state
          let is_active = Boolean(state.isDragging || state.isPanning || state.isRotating || state.isZooming)
          is_interacting_ref.current = is_active
          if (is_active) {
            if (hover_raf_ref.current !== null) {
              cancelAnimationFrame(hover_raf_ref.current)
              hover_raf_ref.current = null
            }
          }
        }}
        controller={false}
        layers={layers}
        onClick={handle_click}
        onHover={handle_hover}
        pickingRadius={effective_pick_radius}
        onAfterRender={() => {
          if (typeof window !== 'undefined') {
            ; (window as any).__deckRendered = true
              ; (window as any).deck = deck_ref.current
          }
        }}
        getCursor={({ isHovering }) => {
          if (dragged_vertex_idx !== null)
            return 'grabbing'
          if (is_drawing) {
            if (hovered_vertex_idx !== null && hovered_vertex_idx >= 0)
              return 'grab'
            return is_editing_shape ? 'default' : 'crosshair'
          }
          return isHovering ? 'crosshair' : 'grab'
        }}
      />

      {/* Unified Floating Tooltip Container (HUD Inspector & Stadestér City) */}
      {ui_visible && show_tooltips && !selected_city && !is_drawing && (
        <ClickInfoPanel
          activeLayer={active_layer}
          activeVariableSelectors={props.activeVariableSelectors}
          hoveredCity={hovered_city}
          hoveredHistoricalFeature={hovered_historical_feature}
          info={inspect_data}
          pos={cursor_pos || hovered_city_pos}
          stadesterConfig={stadester_config}
        />
      )}

      {/* Stadestér City Details Panel (Floating on desktop) */}
      {ui_visible && !is_mobile && selected_city && active_panel_type !== 'country' && (
        <CityDetailsPanel
          anchorPos={selected_city_anchor}
          bordersData={historical_borders_result.bordersData}
          city={selected_city}
          currentYear={timeline_year || 2025}
          onBack={nav_history.length > 0 ? handle_nav_back : undefined}
          onCenterCity={handle_center_selected_city}
          onClose={handle_close_all_details}
          onSelectCountry={handle_select_country_from_city}
          sidebarWidth={sidebar_width}
        />
      )}

      {/* Historical Country Details Panel (Floating on desktop) */}
      {ui_visible && !is_mobile && selected_historical_feature && active_panel_type !== 'city' && (
        <HistoricalBorderDetailsPanel
          anchorPos={selected_historical_anchor}
          cities={stadester_cities}
          countryStats={country_stats}
          currentYear={timeline_year || 1950}
          dejure={Boolean(
            selected_historical_feature?.properties?.dejure ??
            (historical_borders_config?.dataset
              ? (props.dataLayers?.[historical_borders_config.dataset]?.dejure ?? (historical_borders_config.dataset === 'simplified_borders' || historical_borders_config.dataset === 'statistical_borders'))
              : undefined)
          )}
          feature={selected_historical_feature}
          isCalculatingStats={is_calculating_stats}
          onBack={nav_history.length > 0 ? handle_nav_back : undefined}
          onClearPolygon={handle_clear_polygon}
          onEditPolygon={handle_edit_polygon}
          onSelectCity={handle_select_city_from_country}
          raster={raster}
          onClose={handle_close_all_details}
          onJumpToYear={(yr) => {
            if (props.onChangeYear)
              props.onChangeYear(yr)
          }}
          onOpenAnalytics={() => {
            if (!analytics_open && on_toggle_analytics)
              on_toggle_analytics()
          }}
          sidebarWidth={sidebar_width}
        />
      )}

      {/* Top Left: Value Colourbar & Information Flyout Container, Top Right Tools */}
      {(() => {
        let has_canvas = Boolean(rendered_canvas)
        let is_country_relative = Boolean(
          countries_mode &&
          ((selected_countries && selected_countries.length > 0) || Boolean(hovered_country)) &&
          country_stats &&
          country_stats.validCount > 0 &&
          Number.isFinite(country_stats.min) &&
          Number.isFinite(country_stats.max) &&
          country_stats.max > country_stats.min
        )
        let legend_min = (is_country_relative) ? country_stats!.min : min_val
        let legend_max = (is_country_relative) ? country_stats!.max : max_val
        if (is_country_relative && midpoint === 0) {
          let abs_max = Math.max(Math.abs(legend_min), Math.abs(legend_max))
          if (abs_max === 0)
            abs_max = 1
          legend_min = -abs_max
          legend_max = abs_max
        }
        let legend_breaks = (is_country_relative) ? undefined : breaks
        let legend_country_name = (is_country_relative) ? country_stats!.name : undefined

        let current_sidebar_width = sidebar_width ?? UI_LAYOUT.sidebarWidth
        if (is_timelapse_exporting || is_mobile)
          current_sidebar_width = 0
        let current_colourbar_width = colourbar_width ?? 336
        let colourbar_left = (is_timelapse_exporting || is_mobile)
          ? UI_LAYOUT.margin
          : UI_LAYOUT.margin + current_sidebar_width + UI_LAYOUT.gap

        return (
          <MapViewerHUD
            activeLayerId={props.activeLayerId}
            analyticsOpen={analytics_open}
            basemap={basemap}
            cameraTilt={camera_tilt}
            circleOverlayConfig={circle_overlay_config}
            colorPalette={palette}
            colourbarLeft={colourbar_left}
            colourbarWidth={current_colourbar_width}
            drawPointsCount={draw_points.length}
            effectiveMapmodesBottom={effective_mapmodes_bottom}
            flyoutOpen={flyout_open}
            hasCanvas={has_canvas}
            hasDrawnPolygon={Boolean(drawn_polygon_feature)}
            heightmapConfig={heightmap_config}
            hideColourbar={hide_colourbar}
            hoveredCity={hovered_city}
            infoPanelOpen={info_panel_open}
            inspectData={inspect_data}
            invertPalette={invert_palette}
            isDrawing={is_drawing}
            isEditingShape={is_editing_shape}
            isMobile={is_mobile}
            isTimelapseExporting={is_timelapse_exporting}
            legendBreaks={legend_breaks}
            legendCountryName={legend_country_name || undefined}
            legendMax={legend_max}
            legendMin={legend_min}
            midpoint={midpoint}
            legendPosition={legend_position}
            legendSubtitle={legend_subtitle}
            legendTitle={legend_title}
            logSigma={log_sigma}
            mapModes={map_modes}
            mapmodesBounds={mapmodes_bounds}
            mapmodesClearance={mapmodes_clearance}
            mapmodesHeight={mapmodes_height}
            mapmodesTakenRight={mapmodes_taken_right}
            mapmodesWidth={mapmodes_width}
            onCancelDraw={on_cancel_draw}
            onChangeLegendPosition={on_change_legend_position}
            onClearDrawnPolygon={on_clear_drawn_polygon}
            onCloseInfoPanel={on_close_info_panel}
            onDeleteLastDrawPoint={on_delete_last_draw_point}
            onDoubleClick={handle_reset_view}
            onFinishDraw={on_finish_draw}
            onResizeColourbarWidth={on_resize_colourbar_width}
            onToggleAnalytics={on_toggle_analytics}
            onToggleDraw={on_toggle_draw}
            onTogglePerformantMode={on_toggle_performant_mode}
            onToggleTooltips={() => set_show_tooltips((arg0_prev) => !arg0_prev)}
            onToggleUi={on_toggle_ui}
            onUpdateBreaks={on_update_breaks}
            performantMode={performant_mode}
            projection={projection}
            raster={raster}
            rasterVersion={raster_version}
            scaleType={scale_type}
            selectedCountries={selected_countries}
            setBasemap={set_basemap}
            setFlyoutOpen={set_flyout_open}
            setProjection={set_projection}
            setShowGraticule={set_show_graticule}
            showGraticule={show_graticule}
            showTooltips={show_tooltips}
            stadesterCities={stadester_cities}
            stadesterConfig={stadester_config}
            timelineBounds={timeline_bounds}
            timelineClearance={timeline_clearance}
            topRightTaken={top_right_taken}
            topbarClearance={topbar_clearance}
            uiVisible={ui_visible}
          />
        )
      })()}

      {/* Bottom Right Tray: Unified Mapmodes with Inline Settings */}
      {ui_visible && (
        <MapmodesTray
          activeLayerId={props.activeLayerId}
          activeVariableSelectors={props.activeVariableSelectors}
          allCountries={effective_country_features.length > 0 ? effective_country_features : country_features}
          analyticsOpen={props.analyticsOpen}
          bottomClearance={effective_mapmodes_bottom}
          legendPosition={legend_position}
          circleOverlayConfig={circle_overlay_config}
          countriesMode={Boolean(countries_mode)}
          countryStats={country_stats}
          heightmapConfig={heightmap_config}
          historicalBordersConfig={historical_borders_config}
          setHistoricalBordersConfig={set_historical_borders_config}
          isCalculatingStats={is_calculating_stats}
          isLoadingLayers={props.isLoadingLayers}
          layers={props.dataLayers}
          mapModes={map_modes}
          onChangeVariableSelector={props.onChangeVariableSelector}
          raster={raster}
          onClearCountries={on_clear_countries || NOOP_FN}
          onClearPolygon={handle_clear_polygon}
          onCloseCity={handle_close_all_details}
          onCloseHistoricalFeature={handle_close_all_details}
          onEditPolygon={handle_edit_polygon}
          onJumpToYear={(yr) => {
            if (props.onChangeYear)
              props.onChangeYear(yr)
          }}
          onReorderMapModes={on_reorder_map_modes}
          onSelectLayer={props.onSelectLayer}
          onToggleCountriesMode={on_toggle_countries_mode}
          onToggleCountry={on_toggle_country || NOOP_FN}
          onToggleMapMode={on_toggle_map_mode}
          onSelectCountry={handle_select_country_from_city}
          selectedCity={active_panel_type !== 'country' ? selected_city : null}
          selectedCountries={selected_countries || EMPTY_ARRAY}
          selectedHistoricalFeature={active_panel_type !== 'city' ? selected_historical_feature : null}
          onSelectCity={handle_select_city_from_country}
          setCircleOverlayConfig={set_circle_overlay_config || NOOP_FN}
          setHeightmapConfig={set_heightmap_config || NOOP_FN}
          setStadesterConfig={set_stadester_config}
          settingsOpen={flyout_open}
          stadesterCities={stadester_cities}
          stadesterCityCount={stadester_cities?.length || 0}
          stadesterConfig={stadester_config}
          timelineYear={timeline_year || 1950}
          userRole={props.userRole}
          isMobile={is_mobile}
        />
      )}
    </div>
  )
}

export default MapViewer
