import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import DeckGL from '@deck.gl/react'
import {
  CountryFeature,
  CountryStats,
  loadCountriesGeoJson,
  findCountryAtLngLat,
  isPointInGeometry,
} from '@framework/geopng/polygon_binning.ts'
import { sampleRasterAt } from '@framework/geopng/sample_raster'
import {
  invertEqualEarth,
  projectEqualEarth,
  transformGeometryToEqualEarth,
  generateEqualEarthGraticule,
} from '@framework/geopng/equal_earth.ts'
import { isGlobePointVisible } from '@framework/stadester/stadester_heuristics'
import {
  DecodedRaster,
  InspectionData,
  ProjectionType,
  HeightmapConfig,
  CircleOverlayConfig,
  MapModeItem,
  MapModeId,
  CityPoint,
  CityFullRecord,
  HistoricalBordersConfig,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { MAP_CONFIG, getPixelOffset } from '@common'
import { UI_LAYOUT } from '@framework/utils/ui_layout.ts'
import { ClickInfoPanel } from './click_info_panel'
import { CityDetailsPanel } from './city_details_panel'
import { MapmodesTray } from '@ui/rightbar/mapmodes_tray'
import { MapViewerHUD } from '@ui/topbar/map_viewer_hud'
import { useMapClearance } from './use_map_clearance'
import { useMapViewState } from './use_map_view_state'
import { resetSmoothPinchState } from './smooth_controllers'
import { useElevationSpikes } from './use_elevation_spikes'
import { ParsedDataLayer } from '@server/layer_parser.ts'
import { UserRole } from '@common'
import { useCircleOverlay } from './use_circle_overlay'
import { useDeckLayers } from './use_deck_layers'
import { useStadesterWorker } from '@framework/stadester/use_stadester_worker'
import { useHistoricalBorders } from './use_historical_borders'
import { HistoricalBorderDetailsPanel } from './historical_border_details_panel'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'

let EMPTY_ARRAY: any[] = [], NOOP_FN = () => { }

export interface MapViewerProps {
  raster: DecodedRaster | null
  renderedCanvas: HTMLCanvasElement | null
  rasterBounds: [number, number, number, number]
  projection: ProjectionType
  setProjection: (p: ProjectionType) => void
  opacity: number
  palette: any
  invertPalette?: boolean
  minVal: number
  maxVal: number
  isMobile?: boolean
  isTimelapseExporting?: boolean
  legendSubtitle?: string
  legendTitle: string
  hideColourbar?: boolean
  scaleType: string
  logSigma: number
  breaks?: number[]
  onUpdateBreaks?: (breaks: number[]) => void
  mapModes: MapModeItem[]
  onToggleMapMode: (id: MapModeId) => void
  onReorderMapModes: (newModes: MapModeItem[]) => void
  heightmapConfig: HeightmapConfig
  setHeightmapConfig?: React.Dispatch<React.SetStateAction<HeightmapConfig>>
  historicalBordersConfig?: HistoricalBordersConfig
  historicalBordersEnabled?: boolean
  setHistoricalBordersConfig?: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
  circleOverlayConfig: CircleOverlayConfig
  setCircleOverlayConfig?: React.Dispatch<React.SetStateAction<CircleOverlayConfig>>
  analyticsOpen: boolean
  onToggleAnalytics: () => void
  selectedCountry?: CountryFeature | null
  selectedCountries?: CountryFeature[]
  deferredSelectedCountries?: CountryFeature[]
  isCalculatingStats?: boolean
  onSelectCountry?: (country: CountryFeature | null) => void
  onToggleCountry?: (country: CountryFeature) => void
  onClearCountries?: () => void
  countriesMode?: boolean
  onToggleCountriesMode?: (enabled: boolean) => void
  hoveredCountry?: CountryFeature | null
  onHoverCountry?: (country: CountryFeature | null) => void
  countryStats?: CountryStats | null
  onInspect?: (data: InspectionData | null) => void
  settingsDrawerOpen?: boolean
  onToggleSettingsDrawer?: (open: boolean) => void
  sidebarWidth?: number
  colourbarWidth?: number
  onResizeColourbarWidth?: (width: number) => void
  infoPanelOpen?: boolean
  onToggleInfoPanel?: () => void
  onCloseInfoPanel?: () => void
  activeLayerId?: string | null
  activeVariableSelectors?: Record<string, string | string[]>
  dataLayers?: Record<string, ParsedDataLayer>
  isLoadingLayers?: boolean
  onChangeVariableSelector?: (arg0_key: string, arg1_option: string | string[]) => void
  onSelectLayer?: (arg0_layer_id: string) => void
  legendPosition?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-centre' | 'bottom-centre'
  onChangeLegendPosition?: (pos: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right') => void
  onCloseCityDetails?: () => void
  onHoverCity?: (city: CityPoint | null, x?: number, y?: number) => void
  onSelectCity?: (city: CityPoint) => void
  onTogglePerformantMode?: (enabled: boolean) => void
  onToggleUi?: () => void
  performantMode?: boolean
  pickRadius?: number
  rasterVersion?: number
  selectedCity?: CityFullRecord | null
  selectedCityKey?: string | null
  setStadesterConfig?: React.Dispatch<React.SetStateAction<StadesterConfig>>
  stadesterCities?: CityPoint[]
  stadesterConfig?: StadesterConfig
  timelineYear?: number
  uiVisible?: boolean
  userRole?: UserRole
  onChangeYear?: (arg0_year: number) => void
  onToggleHistoricalBorders?: (arg0_enabled: boolean) => void
}

/**
 * Main map viewer component rendering multi-projection deck.gl views with 2D/3D overlays.
 *
 * @param {MapViewerProps} arg0_props
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
  let heightmap_config = props.heightmapConfig
  let hide_colourbar = Boolean(props.hideColourbar)
  let historical_borders_config = props.historicalBordersConfig
  let hovered_country = props.hoveredCountry
  let info_panel_open = props.infoPanelOpen ?? false
  let invert_palette = props.invertPalette
  let is_calculating_stats = props.isCalculatingStats
  let is_mobile = props.isMobile ?? false
  let is_timelapse_exporting = props.isTimelapseExporting ?? false
  let legend_position = ((props.legendPosition || 'top-left') as string).replace('centre', 'center') as 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  let legend_subtitle = props.legendSubtitle
  let legend_title = props.legendTitle
  let log_sigma = props.logSigma
  let map_modes = props.mapModes
  let max_val = props.maxVal
  let min_val = props.minVal
  let on_change_legend_position = props.onChangeLegendPosition
  let on_clear_countries = props.onClearCountries
  let on_close_city_details = props.onCloseCityDetails
  let on_close_info_panel = props.onCloseInfoPanel
  let on_hover_city = props.onHoverCity
  let on_hover_country = props.onHoverCountry
  let on_inspect = props.onInspect
  let on_reorder_map_modes = props.onReorderMapModes
  let on_resize_colourbar_width = props.onResizeColourbarWidth
  let on_select_city = props.onSelectCity
  let on_select_country = props.onSelectCountry
  let on_toggle_analytics = props.onToggleAnalytics
  let on_toggle_countries_mode = props.onToggleCountriesMode
  let on_toggle_country = props.onToggleCountry
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
  let handle_click: (info: any) => void
  let handle_hover: (info: any) => void
  let handle_reset_view: () => void
  let hover_raf_ref = useRef<number | null>(null)
  let is_interacting_ref = useRef<boolean>(false)
  let last_country_ref = useRef<CountryFeature | null>(null)
  let last_hovered_country_code_ref = useRef<string | null | undefined>(null)
  let layers: any[]
  let pending_pointer_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let pending_touch_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let sample_pointer_at: (arg0_x: number, arg1_y: number) => void
  let sample_raster_at: (coordX: number, coordY: number) => InspectionData | null
  let sample_touch_at: (arg0_x: number, arg1_y: number) => void
  let touch_pick_raf_ref = useRef<number | null>(null)

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
  let [selected_historical_feature, set_selected_historical_feature] = useState<HistoricalBorderFeature | null>(null)
  let [selected_historical_anchor_coord, set_selected_historical_anchor_coord] = useState<[number, number] | null>(null)
  let [selected_historical_anchor_screen, set_selected_historical_anchor_screen] = useState<{ x: number; y: number } | null>(null)

  let border_dataset = historical_borders_config?.dataset || (props.activeLayerId && props.activeLayerId.includes('border') ? props.activeLayerId : 'statistical_borders')
  let is_historical_borders_active = Boolean(
    historical_borders_config?.enabled ||
    props.historicalBordersEnabled ||
    props.activeLayerId === 'statistical_borders' ||
    props.activeLayerId === 'detailed_borders' ||
    (props.activeLayerId && props.activeLayerId.includes('border')) ||
    map_modes.find((arg0_m) => arg0_m.id === 'historical_borders')?.active
  )

  let historical_borders_result = useHistoricalBorders(
    props.activeLayerId,
    timeline_year || 1950,
    is_historical_borders_active,
    border_dataset
  )

  //Dismiss city hover tooltip when cities overlay is disabled or mode changes
  useEffect(() => {
    set_hovered_city(null)
    set_hovered_city_pos(null)
  }, [stadester_config?.enabled, props.activeLayerId, map_modes, projection])

  useEffect(() => {
    if (!selected_countries || selected_countries.length === 0) {
      if (!selected_country)
        set_selected_historical_feature(null)
    }
  }, [selected_countries, selected_country])

  useEffect(() => {
    if (selected_historical_feature && historical_borders_result.bordersData) {
      let current_gw = selected_historical_feature.properties?.gwcode
      let current_id = selected_historical_feature.id || selected_historical_feature.properties?.id
      let current_name = selected_historical_feature.properties?.name
      let updated_feat = historical_borders_result.bordersData.features.find(
        (arg0_f) =>
          arg0_f.id === current_id ||
          (current_gw !== undefined && arg0_f.properties?.gwcode === current_gw) ||
          (current_id !== undefined && arg0_f.properties?.id === current_id) ||
          (current_name && arg0_f.properties?.name === current_name)
      )
      if (updated_feat && updated_feat !== selected_historical_feature) {
        let is_same_identity =
          updated_feat.id === selected_historical_feature.id &&
          updated_feat.properties?.name === selected_historical_feature.properties?.name &&
          updated_feat.geometry === selected_historical_feature.geometry

        set_selected_historical_feature(updated_feat)
        if (!is_same_identity) {
          if (on_select_country) {
            on_select_country(updated_feat as unknown as CountryFeature)
          } else if (on_toggle_country) {
            on_toggle_country(updated_feat as unknown as CountryFeature)
          }
        }
      }
    }
  }, [selected_historical_feature, historical_borders_result.bordersData, on_select_country, on_toggle_country])

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
    handleDoubleClick: handle_double_click,
    handleResetNorth: handle_reset_north,
    handleResetView: raw_handle_reset_view,
    handleToggleTilt: handle_toggle_tilt,
    handleViewStateChange: handle_view_state_change,
    handleZoomIn: handle_zoom_in,
    handleZoomOut: handle_zoom_out,
    projViewStates: proj_view_states,
    setProjViewStates: set_proj_view_states,
    views,
  } = view_state_mgmt


  let [basemap, set_basemap] = useState<string>(MAP_CONFIG.basemapLayers[0]?.id || 'dark')
  let [show_graticule, set_show_graticule] = useState(true)
  let [show_tooltips, set_show_tooltips] = useState(true)
  let [inspect_data, set_inspect_data] = useState<InspectionData | null>(null)
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

  handle_reset_view = useCallback(() => {
    //1. Clear smooth pinch and two-finger gesture state
    resetSmoothPinchState()

    //2. Cancel any active touch or hover RAF picking
    if (hover_raf_ref.current !== null) {
      cancelAnimationFrame(hover_raf_ref.current)
      hover_raf_ref.current = null
    }
    if (touch_pick_raf_ref.current !== null) {
      cancelAnimationFrame(touch_pick_raf_ref.current)
      touch_pick_raf_ref.current = null
    }

    //3. Clear pending touch & pointer position & interaction flags
    pending_pointer_pos_ref.current = null
    pending_touch_pos_ref.current = null
    is_interacting_ref.current = false

    //4. Dismiss any active inspection tooltips and cursor positions
    set_inspect_data(null)
    set_cursor_pos(null)
    set_hovered_city(null)
    set_hovered_city_pos(null)
    set_hovered_historical_feature(null)

    //5. Invoke underlying view state reset
    raw_handle_reset_view()
  }, [raw_handle_reset_view])

  equal_earth_land_geo_json = useMemo(() => {
    if (!land_geo_json)
      return null
    try {
      return {
        type: 'FeatureCollection',
        features: land_geo_json.features.map((f: any) => ({
          ...f,
          geometry: transformGeometryToEqualEarth(f.geometry),
        })),
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

  sample_raster_at = useCallback(
    (coordX: number, coordY: number): InspectionData | null => {
      return sampleRasterAt(
        coordX,
        coordY,
        raster,
        projection,
        effective_country_features,
        Boolean(countries_mode || is_historical_borders_active),
        last_country_ref.current
      )
    },
    [raster, effective_country_features, projection, countries_mode, is_historical_borders_active]
  )

  sample_pointer_at = useCallback(
    (arg0_x: number, arg1_y: number) => {
      //Convert from parameters
      let x = arg0_x
      let y = arg1_y

      //Guard clauses
      if (!deck_ref.current)
        return

      //Declare local instance variables
      let deck_inst: any
      let insp: InspectionData | null = null
      let pick_info: any
      let unprojected_coord: [number, number] | null = null
      let viewports: any[]
      let vp: any

      //Function body
      deck_inst = deck_ref.current?.deck || deck_ref.current
      viewports = deck_inst?.getViewports ? deck_inst.getViewports() : []
      vp = viewports[0]

      if (vp && typeof vp.unproject === 'function') {
        try {
          let pt = vp.unproject([x, y], { targetZ: 0 })
          if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
            unprojected_coord = [pt[0], pt[1]]
        } catch {
          // Ignore unproject calculation errors
        }
      }

      if (unprojected_coord) {
        insp = sample_raster_at(unprojected_coord[0], unprojected_coord[1])
        set_inspect_data(insp)
      } else {
        set_inspect_data(null)
      }

      pick_info = deck_ref.current.pickObject({ x, y })
      if (pick_info) {
        if (pick_info.coordinate && !unprojected_coord) {
          insp = sample_raster_at(pick_info.coordinate[0], pick_info.coordinate[1])
          set_inspect_data(insp)
        }
        if (pick_info.layer?.id?.includes('historical-borders') || (pick_info.object && (pick_info.object.properties?.gwcode !== undefined || pick_info.object.properties?.keyframes !== undefined))) {
          set_hovered_historical_feature(pick_info.object || null)
        } else {
          set_hovered_historical_feature((arg0_prev) => (arg0_prev ? null : null))
        }
      } else {
        set_hovered_historical_feature((arg0_prev) => (arg0_prev ? null : null))
      }

      if ((countries_mode || is_historical_borders_active) && on_hover_country) {
        let next_code = insp?.countryName || null
        if (last_hovered_country_code_ref.current !== next_code) {
          last_hovered_country_code_ref.current = next_code
          let local_country = (insp && effective_country_features.length > 0)
            ? findCountryAtLngLat(insp.lng, insp.lat, effective_country_features)
            : null
          on_hover_country(local_country)
        }
      }
    },
    [countries_mode, effective_country_features, is_historical_borders_active, on_hover_country, sample_raster_at]
  )

  sample_touch_at = sample_pointer_at

  handle_click = useCallback(
    (info: any) => {
      // Guard clauses: if a city or higher z-index overlay was clicked, intercept and do not click the country behind it
      if (info.layer?.id?.includes('stadester') || (info.object && info.object.coords))
        return

      if (info.layer?.id?.includes('historical-borders') || (info.object && (info.object.properties?.gwcode !== undefined || info.object.properties?.keyframes !== undefined))) {
        let hist_feat = info.object as HistoricalBorderFeature
        set_selected_historical_feature(hist_feat)
        if (info.coordinate) {
          set_selected_historical_anchor_coord([info.coordinate[0], info.coordinate[1]])
        }
        if (info.x !== undefined && info.y !== undefined) {
          set_selected_historical_anchor_screen({ x: info.x, y: info.y })
        }
        if (on_select_country) {
          on_select_country(hist_feat as unknown as CountryFeature)
        } else if (on_toggle_country) {
          on_toggle_country(hist_feat as unknown as CountryFeature)
        }
        return
      }

      let deck_inst: any
      let insp: InspectionData | null
      let viewports: any[]
      let vp: any
      let x_coord: number | null = null
      let y_coord: number | null = null

      if (info.coordinate) {
        x_coord = info.coordinate[0]
        y_coord = info.coordinate[1]
      } else if (info.x !== undefined && info.y !== undefined && deck_ref.current) {
        deck_inst = deck_ref.current?.deck || deck_ref.current
        viewports = deck_inst?.getViewports ? deck_inst.getViewports() : []
        vp = viewports[0]
        if (vp && typeof vp.unproject === 'function') {
          try {
            let pt = vp.unproject([info.x, info.y], { targetZ: 0 })
            if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
              x_coord = pt[0]
              y_coord = pt[1]
            }
          } catch {
            // Ignore unproject calculation errors
          }
        }
      }

      if (x_coord === null || y_coord === null)
        return

      insp = sample_raster_at(x_coord, y_coord)
      set_inspect_data(insp)
      set_cursor_pos({ x: info.x, y: info.y })
      if (on_inspect)
        on_inspect(insp)

      if (insp && country_features.length > 0) {
        let local_country = findCountryAtLngLat(insp.lng, insp.lat, country_features)
        if (local_country) {
          if (on_toggle_country) {
            on_toggle_country(local_country)
          } else if (on_select_country) {
            on_select_country(local_country)
          }
        }
      }
    },
    [sample_raster_at, on_inspect, country_features, on_toggle_country, on_select_country, set_inspect_data, set_cursor_pos]
  )

  handle_hover = useCallback(
    (arg0_info: any) => {
      //Convert from parameters
      let info = arg0_info

      //Guard clauses
      if (is_interacting_ref.current)
        return
      if (!info)
        return

      //Function body
      if (info.layer?.id?.includes('historical-borders') || (info.object && (info.object.properties?.gwcode !== undefined || info.object.properties?.keyframes !== undefined))) {
        set_hovered_historical_feature(info.object || null)
      } else {
        set_hovered_historical_feature((arg0_prev) => (arg0_prev ? null : null))
      }
    },
    []
  )

  elevation_spikes_data = useElevationSpikes({
    heightmapConfig: heightmap_config,
    raster,
    minVal: min_val,
    maxVal: max_val,
    scaleType: scale_type,
    logSigma: log_sigma,
    palette,
    invertPalette: invert_palette,
    projection,
    countriesMode: countries_mode,
    countryStats: country_stats,
    selectedCountries: selected_countries,
    selectedCountry: selected_country,
  })

  circle_pixel_data = useCircleOverlay({
    circleOverlayConfig: circle_overlay_config,
    raster,
    palette,
    invertPalette: invert_palette,
    minVal: min_val,
    maxVal: max_val,
    projection,
    heightmapConfig: heightmap_config,
    countriesMode: countries_mode,
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
    projection,
    rasterVersion: raster_version,
    basemap,
    isMobile: is_mobile,
    landGeoJson: land_geo_json,
    equalEarthLandGeoJson: equal_earth_land_geo_json,
    showGraticule: show_graticule,
    graticulePaths: graticule_paths,
    renderedCanvas: rendered_canvas,
    rasterBounds: raster_bounds,
    opacity,
    heightmapConfig: heightmap_config,
    elevationSpikesData: elevation_spikes_data,
    circleOverlayConfig: circle_overlay_config,
    circlePixelData: circle_pixel_data,
    raster,
    palette,
    invertPalette: invert_palette,
    minVal: min_val,
    maxVal: max_val,
    selectedCountries: selected_countries,
    selectedCountry: selected_country,
    countriesMode: countries_mode,
    hoveredCountry: hovered_country,
    hoveredCity: hovered_city,
    onHoverCity: (arg0_city, arg1_x, arg2_y) => {
      set_hovered_city(arg0_city)
      if (arg1_x !== undefined && arg2_y !== undefined)
        set_hovered_city_pos({ x: arg1_x, y: arg2_y })
      if (on_hover_city)
        on_hover_city(arg0_city, arg1_x, arg2_y)
    },
    onSelectCity: on_select_city,
    selectedCityKey: selected_city_key,
    stadesterCities: stadester_cities,
    stadesterConfig: stadester_config,
    stadesterLabels: worker_result.labels,
    stadesterPoints: worker_result.points,
    historicalBordersConfig: historical_borders_config,
    historicalBordersData: is_historical_borders_active ? historical_borders_result.bordersData : null,
    selectedHistoricalFeature: selected_historical_feature,
    hoveredHistoricalFeature: hovered_historical_feature,
    onSelectHistoricalFeature: (feat, coord, x, y) => {
      set_selected_historical_feature(feat)
      if (coord) {
        set_selected_historical_anchor_coord([coord[0], coord[1]])
      }
      if (x !== undefined && y !== undefined) {
        set_selected_historical_anchor_screen({ x, y })
      }
      if (on_toggle_country) {
        on_toggle_country(feat as unknown as CountryFeature)
      } else if (on_select_country) {
        on_select_country(feat as unknown as CountryFeature)
      }
    },
    onHoverHistoricalFeature: (feat) => {
      set_hovered_historical_feature(feat)
    },
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

  //Compute screen anchor coordinates for selected city panel
  let selected_city_anchor = useMemo(() => {
    if (!selected_city || !selected_city.coords || !deck_ref.current)
      return null
    try {
      let vp = deck_ref.current.deck?.getViewports?.()[0]
      if (!vp)
        return null
      let c_lat = selected_city.coords[0]
      let c_lon = selected_city.coords[1]
      let px = c_lon
      let py = c_lat
      if (projection === 'EqualEarth') {
        let proj = projectEqualEarth(c_lon, c_lat)
        px = proj[0]
        py = proj[1]
      } else if (projection === 'Globe') {
        if (!isGlobePointVisible(c_lon, c_lat, vp, -0.005))
          return null
      }
      let projected = vp.project([px, py])
      if (projected && projected.length >= 2)
        return { x: projected[0], y: projected[1] }
    } catch (e) {
      // Ignore projection errors
    }
  }, [selected_city, projection, proj_view_states])

  //Compute screen anchor coordinates for selected historical borders panel
  let selected_historical_anchor = useMemo(() => {
    if (!selected_historical_feature || !deck_ref.current)
      return selected_historical_anchor_screen || null
    if (!selected_historical_anchor_coord)
      return selected_historical_anchor_screen || null
    try {
      let vp = deck_ref.current.deck?.getViewports?.()[0]
      if (!vp)
        return selected_historical_anchor_screen || null
      let [c_lon, c_lat] = selected_historical_anchor_coord
      let px = c_lon
      let py = c_lat
      if (projection === 'EqualEarth') {
        let proj = projectEqualEarth(c_lon, c_lat)
        px = proj[0]
        py = proj[1]
      } else if (projection === 'Globe') {
        if (!isGlobePointVisible(c_lon, c_lat, vp, -0.005))
          return null
      }
      let projected = vp.project([px, py])
      if (projected && projected.length >= 2)
        return { x: projected[0], y: projected[1] }
    } catch {
      // Ignore projection errors
    }
    return selected_historical_anchor_screen || null
  }, [selected_historical_feature, selected_historical_anchor_coord, selected_historical_anchor_screen, projection, proj_view_states])

  let handle_select_country_from_city = useCallback(
    (arg0_state_id?: number | string, arg0_country_name?: string) => {
      //Convert from parameters
      let country_name = arg0_country_name
      let state_id = arg0_state_id

      //Declare local instance variables
      let applyTargetFeature = function (arg0_feat: any) {
        set_selected_historical_feature(arg0_feat)
        if (selected_city_anchor)
          set_selected_historical_anchor_screen(selected_city_anchor)
        if (selected_city && (selected_city as any).coords)
          set_selected_historical_anchor_coord([(selected_city as any).coords[1], (selected_city as any).coords[0]])
        if (on_select_country) {
          on_select_country(arg0_feat as unknown as CountryFeature)
        } else if (on_toggle_country) {
          on_toggle_country(arg0_feat as unknown as CountryFeature)
        }
      }
      let features = historical_borders_result?.bordersData?.features
      let target_feat: any = null

      //Function body
      if (features && features.length > 0) {
        target_feat = features.find((arg0_f: any) => {
          if (state_id !== undefined && state_id !== null) {
            let sid_str = String(state_id)
            if (String(arg0_f.id) === sid_str ||
                String(arg0_f.properties?.id) === sid_str ||
                String(arg0_f.properties?.state_id) === sid_str) {
              return true
            }
          }
          if (country_name && arg0_f.properties?.name) {
            let fn = arg0_f.properties.name.toLowerCase().trim()
            let cn = country_name.toLowerCase().trim()
            if (fn === cn)
              return true
          }
          return false
        })
        if (!target_feat && country_name) {
          let cn = country_name.toLowerCase().trim()
          target_feat = features.find((arg0_f: any) => {
            if (arg0_f.properties?.name) {
              let fn = arg0_f.properties.name.toLowerCase().trim()
              if (fn.includes(cn) || cn.includes(fn))
                return true
            }
            return false
          })
        }
      }

      if (target_feat) {
        applyTargetFeature(target_feat)
      } else {
        //Asynchronously request border info from the server when detailed borders are not active
        let params = new URLSearchParams()
        params.set('year', String(timeline_year || 1950))
        params.set('dataset', 'detailed_borders')
        if (state_id !== undefined && state_id !== null)
          params.set('state_id', String(state_id))
        if (country_name)
          params.set('name', country_name)

        fetch(`/api/atlas/border?${params.toString()}`)
          .then((arg0_res) => (arg0_res.ok ? arg0_res.json() : null))
          .then((arg0_data) => {
            if (arg0_data && (arg0_data.geometry || arg0_data.properties))
              applyTargetFeature(arg0_data)
          })
          .catch((arg0_err) => {
            console.error('[MapViewer] Failed to request border info:', arg0_err)
          })
      }
    },
    [historical_borders_result, selected_city, selected_city_anchor, timeline_year, on_select_country, on_toggle_country]
  )

  //Return statement
  return (
    <div
      ref={container_ref}
      id="dataview-map-container"
      className="relative w-full h-full overflow-hidden select-none bg-background font-sans"
      style={{ imageRendering: 'pixelated', touchAction: 'none' }}
      onContextMenu={(e) => e.preventDefault()}
      onPointerLeave={() => {
        if (hover_raf_ref.current !== null) {
          cancelAnimationFrame(hover_raf_ref.current)
          hover_raf_ref.current = null
        }
        pending_pointer_pos_ref.current = null
        set_cursor_pos(null)
        set_hovered_city(null)
        set_hovered_city_pos(null)
        set_hovered_historical_feature(null)
        set_inspect_data(null)
        last_hovered_country_code_ref.current = null
        if (countries_mode && on_hover_country)
          on_hover_country(null)
      }}
      onPointerMove={(e) => {
        let rect = e.currentTarget.getBoundingClientRect()
        let x = e.clientX - rect.left
        let y = e.clientY - rect.top

        //Check if cursor is directly over map vs HUD/controls
        let target_el = e.target as HTMLElement | null
        let is_over_map = target_el ? Boolean(target_el.closest('#deckgl-overlay') || target_el.id === 'dataview-map-container') : true

        if (!is_over_map) {
          if (hover_raf_ref.current !== null) {
            cancelAnimationFrame(hover_raf_ref.current)
            hover_raf_ref.current = null
          }
          pending_pointer_pos_ref.current = null
          set_cursor_pos(null)
          set_hovered_city(null)
          set_hovered_city_pos(null)
          set_hovered_historical_feature(null)
          set_inspect_data(null)
          return
        }

        set_cursor_pos({ x, y })
        if (hovered_city_pos)
          set_hovered_city_pos({ x, y })

        //Guard clauses: do not sample during dragging/panning
        if (e.buttons !== 0 || is_interacting_ref.current || !show_tooltips)
          return

        pending_pointer_pos_ref.current = { x, y }
        if (hover_raf_ref.current !== null)
          return

        hover_raf_ref.current = requestAnimationFrame(() => {
          hover_raf_ref.current = null
          if (is_interacting_ref.current)
            return
          let cur_pos = pending_pointer_pos_ref.current
          if (cur_pos)
            sample_pointer_at(cur_pos.x, cur_pos.y)
        })
      }}
      onPointerUp={() => {
        is_interacting_ref.current = false
      }}
      onTouchStart={(e) => {
        if (!show_tooltips)
          return
        let touch = e.touches[0]
        if (!touch)
          return
        let rect = e.currentTarget.getBoundingClientRect()
        let x = touch.clientX - rect.left
        let y = touch.clientY - rect.top
        set_cursor_pos({ x, y })
        if (hovered_city_pos)
          set_hovered_city_pos({ x, y })

        pending_touch_pos_ref.current = { x, y }
        if (touch_pick_raf_ref.current !== null) {
          cancelAnimationFrame(touch_pick_raf_ref.current)
          touch_pick_raf_ref.current = null
        }
        touch_pick_raf_ref.current = requestAnimationFrame(() => {
          touch_pick_raf_ref.current = null
          let cur_pos = pending_touch_pos_ref.current
          if (cur_pos)
            sample_touch_at(cur_pos.x, cur_pos.y)
        })
      }}
      onTouchMove={(e) => {
        if (!show_tooltips)
          return
        let touch = e.touches[0]
        if (!touch)
          return
        let rect = e.currentTarget.getBoundingClientRect()
        let x = touch.clientX - rect.left
        let y = touch.clientY - rect.top
        set_cursor_pos({ x, y })
        if (hovered_city_pos)
          set_hovered_city_pos({ x, y })

        pending_touch_pos_ref.current = { x, y }
        if (touch_pick_raf_ref.current !== null)
          return

        touch_pick_raf_ref.current = requestAnimationFrame(() => {
          touch_pick_raf_ref.current = null
          let cur_pos = pending_touch_pos_ref.current
          if (cur_pos)
            sample_touch_at(cur_pos.x, cur_pos.y)
        })
      }}
      onTouchEnd={() => {
        if (touch_pick_raf_ref.current !== null) {
          cancelAnimationFrame(touch_pick_raf_ref.current)
          touch_pick_raf_ref.current = null
        }
        pending_touch_pos_ref.current = null
      }}
    >
      <DeckGL
        ref={deck_ref}
        id="deckgl-overlay"
        style={{ touchAction: 'none' }}
        views={views}
        viewState={effective_view_state}
        onViewStateChange={handle_view_state_change}
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
        getCursor={({ isHovering }) => ((isHovering) ? 'crosshair' : 'grab')}
      />

      {/* Unified Floating Tooltip Container (HUD Inspector & Stadestér City) */}
      {ui_visible && show_tooltips && !selected_city && (
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
      {ui_visible && !is_mobile && selected_city && (
        <CityDetailsPanel
          anchorPos={selected_city_anchor}
          city={selected_city}
          currentYear={timeline_year || 2025}
          onClose={on_close_city_details || (() => { })}
          onSelectCountry={handle_select_country_from_city}
        />
      )}

      {/* Historical Country Details Panel (Floating on desktop) */}
      {ui_visible && !is_mobile && selected_historical_feature && (
        <HistoricalBorderDetailsPanel
          anchorPos={selected_historical_anchor}
          cities={stadester_cities}
          countryStats={country_stats}
          currentYear={timeline_year || 1950}
          feature={selected_historical_feature}
          isCalculatingStats={is_calculating_stats}
          onSelectCity={on_select_city}
          raster={raster}
          onClose={() => {
            set_selected_historical_feature(null)
            set_selected_historical_anchor_coord(null)
            set_selected_historical_anchor_screen(null)
            if (on_clear_countries) {
              on_clear_countries()
            } else if (on_select_country) {
              on_select_country(null)
            }
          }}
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
              analyticsOpen={analytics_open}
              basemap={basemap}
              cameraTilt={camera_tilt}
              circleOverlayConfig={circle_overlay_config}
              colorPalette={palette}
              colourbarLeft={colourbar_left}
              colourbarWidth={current_colourbar_width}
              flyoutOpen={flyout_open}
              hasCanvas={has_canvas}
              heightmapConfig={heightmap_config}
              hideColourbar={hide_colourbar}
              hoveredCity={hovered_city}
              infoPanelOpen={info_panel_open}
              inspectData={inspect_data}
              invertPalette={invert_palette}
              isMobile={is_mobile}
              isTimelapseExporting={is_timelapse_exporting}
              legendBreaks={legend_breaks}
              legendCountryName={legend_country_name || undefined}
              legendMax={legend_max}
              legendMin={legend_min}
              legendPosition={legend_position}
              legendSubtitle={legend_subtitle}
              legendTitle={legend_title}
              effectiveMapmodesBottom={effective_mapmodes_bottom}
              logSigma={log_sigma}
              mapModes={map_modes}
              mapmodesBounds={mapmodes_bounds}
              mapmodesClearance={mapmodes_clearance}
              mapmodesHeight={mapmodes_height}
              mapmodesTakenRight={mapmodes_taken_right}
              mapmodesWidth={mapmodes_width}
              onChangeLegendPosition={on_change_legend_position}
              onCloseInfoPanel={on_close_info_panel}
              onDoubleClick={handle_reset_view}
              onResizeColourbarWidth={on_resize_colourbar_width}
              onToggleAnalytics={on_toggle_analytics}
              onTogglePerformantMode={on_toggle_performant_mode}
              onToggleUi={on_toggle_ui}
              onUpdateBreaks={on_update_breaks}
              performantMode={performant_mode}
              projection={projection}
              raster={raster}
              scaleType={scale_type}
              selectedCountries={selected_countries}
              setBasemap={set_basemap}
              setFlyoutOpen={set_flyout_open}
              setProjection={set_projection}
              setShowGraticule={set_show_graticule}
              showGraticule={show_graticule}
              showTooltips={show_tooltips}
              onToggleTooltips={() => set_show_tooltips((arg0_prev) => !arg0_prev)}
              stadesterCities={stadester_cities}
              stadesterConfig={stadester_config}
              timelineBounds={timeline_bounds}
              timelineClearance={timeline_clearance}
              topRightTaken={top_right_taken}
              topbarClearance={topbar_clearance}
              uiVisible={ui_visible}
              activeLayerId={props.activeLayerId}
              rasterVersion={raster_version}
            />
          )
        })()}

      {/* Bottom Right Tray: Unified Mapmodes with Inline Settings */}
      {ui_visible && (
        <MapmodesTray
          activeLayerId={props.activeLayerId}
          activeVariableSelectors={props.activeVariableSelectors}
          allCountries={country_features}
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
          onCloseCity={on_close_city_details || NOOP_FN}
          onCloseHistoricalFeature={() => {
            set_selected_historical_feature(null)
            set_selected_historical_anchor_coord(null)
            set_selected_historical_anchor_screen(null)
            if (on_clear_countries) {
              on_clear_countries()
            } else if (on_select_country) {
              on_select_country(null)
            }
          }}
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
          selectedCity={selected_city}
          selectedCountries={selected_countries || EMPTY_ARRAY}
          selectedHistoricalFeature={selected_historical_feature}
          onSelectCity={on_select_city}
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
