import { useMemo } from 'react'
import { COORDINATE_SYSTEM } from '@deck.gl/core'
import {
  BitmapLayer,
  GeoJsonLayer,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer,
} from '@deck.gl/layers'
import { TileLayer } from '@deck.gl/geo-layers'
import { CountryFeature } from '@framework/geopng/polygon_binning.ts'
import {
  transformGeometryToEqualEarth,
  projectEqualEarth,
} from '@framework/geopng/equal_earth.ts'
import { projectLngLatToLayerCoords } from '@framework/geopng/polygon_draw_tool.ts'
import {
  DecodedRaster,
  ProjectionType,
  HeightmapConfig,
  CircleOverlayConfig,
  CityPoint,
  HistoricalBordersConfig,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { createHistoricalBordersDeckLayer } from './use_historical_borders_layer'
import { UnderlinedTextLayer } from './underlined_text_layer'
import { GlobeAntipodeCullExtension } from './layers/GlobeAntipodeCullExtension'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import { normalizeCityKey } from '@framework/stadester/city_metadata_framework.ts'
import { MAP_CONFIG } from '@common'
import {
  EquirectangularTileset2D,
  WarpedTileBitmapLayer,
  TesselatedBitmapLayer,
} from './deck_layers'
import { ElevationSpikePoint } from './use_elevation_spikes'
import { CirclePixelPoint } from './use_circle_overlay'

import * as d3Chromatic from 'd3-scale-chromatic'

import {
  resolveRegionColorHex,
  hexToRgb,
  ensureContrastAgainstDark,
} from './deck_layer_palette_utils'

function getShortCityLabel (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return ''

  //Function body
  let before_semi = name.split(';')[0].trim()
  let first_word = before_semi.split(/[\s,]+/)[0].trim()

  //Return statement
  return first_word || before_semi
}

/**
 * Reconciles a city's capital status against authoritative active historical borders features.
 * Historical borders (state_capitals.json via AtlasBordersService) are the single source of truth.
 *
 * @param {any} arg0_city - City point object
 * @param {Map<string, any>} arg1_capitals_by_key - Authoritative active capitals indexed by key
 * @param {Map<string, any>} arg2_capitals_by_name - Authoritative active capitals indexed by name
 * @param {Set<string>} arg3_acapital_state_ids - State IDs explicitly marked as acapital
 * @param {Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>} arg4_state_capitals_by_sid - Active state capitals by state ID
 * @param {Set<string>} [arg5_active_state_ids] - State IDs active in current historical borders
 * @param {Set<string>} [arg6_active_polity_names] - Polity names active in current historical borders
 * @param {Map<string, any>} [arg7_authoritative_capitals_by_city] - Pre-matched authoritative capitals by city key/id
 * @param {Array<any>} [arg8_active_capitals_list] - Authoritative active capitals list with coordinates
 *
 * @returns {any} Reconciled city object
 */
function reconcileCapitalWithAuthoritativeBorders (
  arg0_city: any,
  arg1_capitals_by_key: Map<string, any>,
  arg2_capitals_by_name: Map<string, any>,
  arg3_acapital_state_ids: Set<string>,
  arg4_state_capitals_by_sid: Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>,
  arg5_active_state_ids?: Set<string>,
  arg6_active_polity_names?: Set<string>,
  arg7_authoritative_capitals_by_city?: Map<string, any>,
  arg8_active_capitals_list?: Array<any>
): any {
  //Convert from parameters
  let acapital_state_ids = arg3_acapital_state_ids
  let active_capitals_list = arg8_active_capitals_list
  let active_polity_names = arg6_active_polity_names
  let active_state_ids = arg5_active_state_ids
  let authoritative_capitals_by_city = arg7_authoritative_capitals_by_city
  let capitals_by_key = arg1_capitals_by_key
  let capitals_by_name = arg2_capitals_by_name
  let city = arg0_city
  let state_capitals_by_sid = arg4_state_capitals_by_sid

  //Guard clauses
  if (!city)
    return city

  //Declare local instance variables
  let active_cap: { cap_coords?: [number, number]; capkey?: string; capname?: string } | undefined
  let best_cap: any = null
  let best_dist: number = 999
  let c_id = city.id ? String(city.id) : undefined
  let c_key = city.key ? String(city.key) : undefined
  let c_lat = city.rawCoords ? city.rawCoords[1] : (city.lat !== undefined ? city.lat : (city.coords ? city.coords[0] : undefined))
  let c_lon = city.rawCoords ? city.rawCoords[0] : (city.lon !== undefined ? city.lon : (city.coords ? city.coords[1] : undefined))
  let c_name = (city.name || '').toLowerCase().trim()
  let c_name_nfd = c_name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let c_short = (city.shortName || getShortCityLabel(city.name || '')).toLowerCase().trim()
  let c_short_nfd = c_short.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let has_polity_by_id: boolean
  let has_polity_by_name: boolean
  let is_same_key: boolean
  let is_same_name: boolean
  let match: any = null
  let pad: number = 3.5
  let polity_name_lower: string
  let resolved_color: any
  let sid_str = city.capitalStateId !== undefined ? String(city.capitalStateId) : (city.capital_state_id !== undefined ? String(city.capital_state_id) : undefined)

  //Function body
  //0. Match by pre-computed authoritative capital
  if (authoritative_capitals_by_city) {
    if (c_key && authoritative_capitals_by_city.has(c_key)) {
      match = authoritative_capitals_by_city.get(c_key)
    } else if (c_id && authoritative_capitals_by_city.has(c_id)) {
      match = authoritative_capitals_by_city.get(c_id)
    }
  }

  //1. Match by authoritative capital key
  if (!match) {
    if (c_key && capitals_by_key.has(c_key)) {
      match = capitals_by_key.get(c_key)
    } else if (c_key && capitals_by_key.has(c_key.toLowerCase().trim())) {
      match = capitals_by_key.get(c_key.toLowerCase().trim())
    } else if (c_id && capitals_by_key.has(c_id)) {
      match = capitals_by_key.get(c_id)
    } else if (c_id && capitals_by_key.has(c_id.toLowerCase().trim())) {
      match = capitals_by_key.get(c_id.toLowerCase().trim())
    }
  }

  //2. Match by city name if no key match
  if (!match && c_name) {
    if (capitals_by_name.has(c_name)) {
      match = capitals_by_name.get(c_name)
    } else if (c_short && capitals_by_name.has(c_short)) {
      match = capitals_by_name.get(c_short)
    } else if (capitals_by_name.has(c_name_nfd)) {
      match = capitals_by_name.get(c_name_nfd)
    } else if (c_short_nfd && capitals_by_name.has(c_short_nfd)) {
      match = capitals_by_name.get(c_short_nfd)
    } else {
      let clean_c = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
      if (clean_c && capitals_by_name.has(clean_c)) {
        match = capitals_by_name.get(clean_c)
      }
    }
    if (!match && city.other_names && Array.isArray(city.other_names)) {
      for (let on of city.other_names) {
        let on_clean = on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let on_lower = on_clean
        let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        if (capitals_by_name.has(on_lower)) {
          match = capitals_by_name.get(on_lower)
          break
        } else if (capitals_by_name.has(on_nfd)) {
          match = capitals_by_name.get(on_nfd)
          break
        } else if (clean_on && capitals_by_name.has(clean_on)) {
          match = capitals_by_name.get(clean_on)
          break
        }
      }
    }
  }

  //3. If candidate match found, verify spatial plausibility against match.bbox
  if (match && match.bbox && c_lon !== undefined && c_lat !== undefined) {
    if (
      c_lon < match.bbox[0] - pad ||
      c_lon > match.bbox[2] + pad ||
      c_lat < match.bbox[1] - pad ||
      c_lat > match.bbox[3] + pad
    ) {
      match = null
    }
  }

  //4. If matched with authoritative capital, ensure isCapital is true with enriched metadata
  if (match) {
    resolved_color = match.color || city.capitalColor || city.capital_color || '#FFDC00'
    return {
      ...city,
      capitalColor: resolved_color,
      capital_color: resolved_color,
      capitalOf: match.polity_name || city.capitalOf || city.capital_state_name,
      capitalStateId: match.state_id !== undefined ? match.state_id : city.capitalStateId,
      capital_state_id: match.state_id !== undefined ? match.state_id : city.capital_state_id,
      capital_state_name: match.polity_name || city.capital_state_name || city.capitalOf,
      isCapital: true,
      is_capital: true,
    }
  }

  //5. If city claims isCapital but its polity no longer exists or has another authoritative capital:
  if (city.isCapital || city.is_capital) {
    //Verify that the claimed polity exists at this point in time
    if (active_state_ids && active_state_ids.size > 0) {
      polity_name_lower = (city.capitalOf || city.capital_state_name || '').toLowerCase().trim()
      has_polity_by_id = Boolean(sid_str && active_state_ids.has(sid_str))
      has_polity_by_name = Boolean(polity_name_lower && active_polity_names && active_polity_names.has(polity_name_lower))

      if (!has_polity_by_id && !has_polity_by_name) {
        return {
          ...city,
          capitalColor: undefined,
          capital_color: undefined,
          isCapital: false,
          is_capital: false,
        }
      }
    }

    if (sid_str) {
      if (acapital_state_ids.has(sid_str)) {
        return {
          ...city,
          capitalColor: undefined,
          capital_color: undefined,
          isCapital: false,
          is_capital: false,
        }
      }

      active_cap = state_capitals_by_sid.get(sid_str)
      if (active_cap && (active_cap.capkey || active_cap.capname || active_cap.cap_coords)) {
        let is_same_coord = false
        if (active_cap.cap_coords && (c_lon !== undefined && c_lat !== undefined)) {
          is_same_coord = Math.hypot(c_lon - active_cap.cap_coords[0], c_lat - active_cap.cap_coords[1]) <= 0.20
        }
        let clean_active_key = normalizeCityKey(active_cap.capkey || '')
        let clean_c_key = normalizeCityKey(c_key || '')
        is_same_key = Boolean(
          (active_cap.capkey && (active_cap.capkey === c_key || active_cap.capkey === c_id)) ||
          (clean_active_key && clean_c_key && clean_active_key === clean_c_key)
        )
        let clean_cap_name = (active_cap.capname || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        let clean_c_name = (c_name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        let clean_c_short = (c_short || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
        is_same_name = Boolean(
          clean_cap_name &&
          (clean_cap_name === clean_c_name ||
           clean_cap_name === clean_c_short ||
           clean_c_name.startsWith(clean_cap_name) ||
           clean_cap_name.startsWith(clean_c_name))
        )
        if (!is_same_key && !is_same_name && !is_same_coord) {
          return {
            ...city,
            capitalColor: undefined,
            capital_color: undefined,
            isCapital: false,
            is_capital: false,
          }
        }
      }
    }
  }

  //Return statement
  return city
}


let RAINBOW_GROWTH_STOPS: Array<[number, [number, number, number]]> = [
  [0.08, [232, 121, 249]],
  [0.06, [239, 68, 68]],
  [0.03, [251, 146, 60]],
  [0.01, [253, 224, 71]],
  [0.00, [198, 219, 85]],
  [-0.02, [69, 207, 119]],
  [-0.04, [72, 156, 240]],
  [-0.05, [93, 96, 226]],
]



function getGrowthRgb (arg0_rate: number, arg1_palette?: string): [number, number, number] {
  //Convert from parameters
  let palette = arg1_palette || 'Rainbow'
  let r = arg0_rate

  //If Rainbow default, use calibrated heat/cool continuous piecewise interpolation matching Anita's cityhistory
  if (palette === 'Rainbow' || !palette) {
    if (r >= RAINBOW_GROWTH_STOPS[0][0])
      return RAINBOW_GROWTH_STOPS[0][1]
    let last_idx = RAINBOW_GROWTH_STOPS.length - 1
    if (r <= RAINBOW_GROWTH_STOPS[last_idx][0])
      return RAINBOW_GROWTH_STOPS[last_idx][1]

    for (let i = 0; i < last_idx; i++) {
      let hi = RAINBOW_GROWTH_STOPS[i][0]
      let lo = RAINBOW_GROWTH_STOPS[i + 1][0]
      if (r <= hi && r >= lo) {
        let t = (hi === lo) ? 0 : (r - lo) / (hi - lo)
        let c_hi = RAINBOW_GROWTH_STOPS[i][1]
        let c_lo = RAINBOW_GROWTH_STOPS[i + 1][1]
        let res_r = Math.round(c_lo[0] + t * (c_hi[0] - c_lo[0]))
        let res_g = Math.round(c_lo[1] + t * (c_hi[1] - c_lo[1]))
        let res_b = Math.round(c_lo[2] + t * (c_hi[2] - c_lo[2]))
        return [res_r, res_g, res_b]
      }
    }
    return RAINBOW_GROWTH_STOPS[4][1]
  }

  //D3 continuous colour interpolation from -0.05 to +0.08
  let interpolator = (d3Chromatic as any)[`interpolate${palette}`]
  if (interpolator) {
    let t = Math.max(0, Math.min(1, (r - (-0.05))/(0.08 - (-0.05))))
    let color_str = interpolator(t)
    let match = color_str.match(/\d+/g)
    if (match && match.length >= 3)
      return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)]
  }

  return [232, 121, 249]
}

function getPopRgb (arg0_pop: number): [number, number, number] {
  let p = Math.max(1, arg0_pop)
  let t = Math.max(0, Math.min(1, (Math.log10(p) - 3.7)/3.6))
  let r = Math.round(Math.min(255, 13 + t*240))
  let g = Math.round(Math.min(255, 8 + t*210))
  let b = Math.round(Math.max(0, 135 - t*100))
  return [r, g, b]
}

//Basemaps driven by MAP_CONFIG (config/map.json5)
let esri_basemap_urls_obj: Record<string, string> = {}
for (let i = 0; i < MAP_CONFIG.basemapLayers.length; i++) {
  let local_layer = MAP_CONFIG.basemapLayers[i]
  if (local_layer.url)
    esri_basemap_urls_obj[local_layer.id] = local_layer.url
}

export interface UseDeckLayersParams {
  activeLayerId?: string | null
  projection: ProjectionType
  rasterVersion?: number
  basemap: string
  landGeoJson: any
  equalEarthLandGeoJson: any
  showGraticule: boolean
  graticulePaths: { path: [number, number][] }[]
  renderedCanvas: HTMLCanvasElement | null
  rasterBounds: [number, number, number, number]
  opacity: number
  heightmapConfig: HeightmapConfig
  elevationSpikesData: { points: ElevationSpikePoint[] }
  circleOverlayConfig: CircleOverlayConfig
  circlePixelData: CirclePixelPoint[]
  raster: DecodedRaster | null
  palette: any
  invertPalette?: boolean
  isMobile?: boolean
  minVal: number
  maxVal: number
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
  countriesMode?: boolean
  hoveredCountry?: CountryFeature | null
  stadesterConfig?: StadesterConfig
  stadesterCities?: CityPoint[]
  stadesterLabels?: any[]
  stadesterPoints?: any[]
  selectedCityKey?: string | null
  hoveredCity?: CityPoint | null
  onSelectCity?: (city: CityPoint, coord?: [number, number], screen_x?: number, screen_y?: number) => void
  onHoverCity?: (city: CityPoint | null, x?: number, y?: number) => void
  historicalBordersConfig?: HistoricalBordersConfig
  historicalBordersData?: {
    features: HistoricalBorderFeature[]
    type: 'FeatureCollection'
  } | null
  selectedHistoricalFeature?: HistoricalBorderFeature | null
  hoveredHistoricalFeature?: HistoricalBorderFeature | null
  onSelectHistoricalFeature?: (arg0_feature: HistoricalBorderFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  onHoverHistoricalFeature?: (arg0_feature: HistoricalBorderFeature | null, arg1_x?: number, arg2_y?: number) => void
  customVectorFeatures?: CountryFeature[]
  customVectorVisible?: boolean
  cursorLngLat?: [number, number] | null
  drawPoints?: [number, number][]
  drawnPolygonFeature?: CountryFeature | null
  isDrawing?: boolean
  onFinishDraw?: () => void
  onHoverCustomVectorFeature?: (arg0_feature: CountryFeature | null, arg1_x?: number, arg2_y?: number) => void
  onSelectCustomVectorFeature?: (arg0_feature: CountryFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  onSelectDrawnPolygon?: (arg0_feature: CountryFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  timelineYear?: number
  viewport?: any
  viewState?: any
}

/**
 * Hook to assemble the deck.gl layer stack across 2D/3D projections.
 * Composes basemaps, graticules, raster surface, elevation spikes, equal-area circles, and country masks.
 *
 * @param {UseDeckLayersParams} arg0_options
 * @returns {Array}
 */
export let useDeckLayers = function (arg0_options: UseDeckLayersParams): any[] {
  //Convert from parameters
  let options = (arg0_options) ? arg0_options : ({} as UseDeckLayersParams)

  //Memoize Stadestér points to prevent GPU buffer re-uploading on mouse moves
  let b_scale = (options.stadesterConfig?.bubbleSize !== undefined) ? options.stadesterConfig.bubbleSize : 1
  let color_mode = options.stadesterConfig?.colorMode || 'growth'
  let growth_palette = options.stadesterConfig?.growthPalette || 'Rainbow'
  let is_cities_enabled = Boolean(options.stadesterConfig?.enabled)
  let is_mobile = Boolean(options.isMobile)
  let projection = options.projection
  let stadester_cities = options.stadesterCities

  let stadester_points_data = useMemo(() => {
    if (!is_cities_enabled || !stadester_cities || stadester_cities.length === 0)
      return []

    return stadester_cities.map((city) => {
      let c_lat = (city.lat !== undefined) ? city.lat : city.coords[0]
      let c_lon = (city.lon !== undefined) ? city.lon : city.coords[1]
      let fill_color: [number, number, number, number] = [255, 255, 255, 220]
      let px = c_lon
      let py = c_lat

      if (projection === 'EqualEarth') {
        let projected = projectEqualEarth(c_lon, c_lat)
        px = projected[0]
        py = projected[1]
      }

      // Equal-area pixel radius scaled by sqrt(population) with calibrated minimum bubble size for mobile / desktop
      let min_radius = (is_mobile ? 2.0 : 3.25) * b_scale
      let pop_scaled = (is_mobile ? 0.70 : 1.0) * b_scale
      let pop_radius = Math.sqrt(Math.max(0, city.population)) * 0.0115 * pop_scaled
      let max_radius = is_mobile ? 32.0 : 65.0
      let pixel_radius = Math.max(min_radius, Math.min(max_radius, min_radius + pop_radius))

      if (color_mode === 'growth') {
        let growth_rate = (city.growthRate !== undefined) ? city.growthRate : 0
        let growth_rgb = getGrowthRgb(growth_rate, growth_palette)
        fill_color = [growth_rgb[0], growth_rgb[1], growth_rgb[2], 220]
      } else if (color_mode === 'population') {
        let pop_rgb = getPopRgb(city.population)
        fill_color = [pop_rgb[0], pop_rgb[1], pop_rgb[2], 220]
      } else if (color_mode === 'region' || color_mode === 'continent') {
        let reg_hex = resolveRegionColorHex(city.region, [c_lat, c_lon])
        let reg_rgb = hexToRgb(reg_hex)
        fill_color = [reg_rgb[0], reg_rgb[1], reg_rgb[2], 220]
      }

      // Truncate name to the first word prior to semicolon
      let short_name = getShortCityLabel(city.name)

      return {
        ...city,
        color: fill_color,
        pixelRadius: pixel_radius,
        position: [px, py, 0] as [number, number, number],
        projection: projection,
        rawCoords: [c_lon, c_lat],
        shortName: short_name,
      }
    })
  }, [
    is_cities_enabled,
    stadester_cities,
    b_scale,
    color_mode,
    growth_palette,
    is_mobile,
    projection,
  ])

  //Return statement
  return useMemo(() => {
    //Declare local instance variables
    let acapital_state_ids = new Set<string>()
    let active_capitals_by_key = new Map<string, any>()
    let active_capitals_by_name = new Map<string, any>()
    let active_capitals_list: any[] = []
    let active_polity_names = new Set<string>()
    let active_state_capitals_by_sid = new Map<string, { capkey?: string; capname?: string }>()
    let active_state_ids = new Set<string>()
    let authoritative_capitals_by_city = new Map<string, any>()
    let basemap = options.basemap
    let border_features_by_id = new Map<string, any>()
    let border_features_by_name = new Map<string, any>()
    let circle_overlay_config = options.circleOverlayConfig
    let circle_pixel_data = options.circlePixelData
    let countries_mode = options.countriesMode
    let cursor_lng_lat = options.cursorLngLat
    let custom_vector_features = options.customVectorFeatures
    let custom_vector_visible = options.customVectorVisible !== false
    let draw_points = options.drawPoints || []
    let drawn_polygon_feature = options.drawnPolygonFeature
    let effective_selected_array: CountryFeature[] = []
    let elevation_spikes_data = options.elevationSpikesData
    let equal_earth_land_geo_json = options.equalEarthLandGeoJson
    let graticule_paths = options.graticulePaths
    let halo_w: number
    let heightmap_config = options.heightmapConfig
    let hov_key: string
    let hovered_country = options.hoveredCountry
    let hovered_data: any
    let invert_palette = options.invertPalette
    let is_cartesian: boolean
    let is_drawing = Boolean(options.isDrawing)
    let is_hovered_already_selected: boolean
    let is_mobile = Boolean(options.isMobile)
    let land_data: any
    let land_geo_json = options.landGeoJson
    let layers_array: any[] = []
    let max_val = options.maxVal
    let min_val = options.minVal
    let opacity = options.opacity
    let palette = options.palette
    let projection = options.projection
    let raster = options.raster
    let raster_bounds = options.rasterBounds
    let rendered_canvas = options.renderedCanvas
    let selected_countries = options.selectedCountries
    let selected_country = options.selectedCountry
    let selected_data: any
    let selected_key: string
    let show_graticule = options.showGraticule
    let spike_key: string
    let stroke_w: number

    is_cartesian = (projection === 'Equirectangular' || projection === 'EqualEarth')

    if (options.historicalBordersData && options.historicalBordersData.features) {
      for (let i = 0; i < options.historicalBordersData.features.length; i++) {
        let feat = options.historicalBordersData.features[i]
        let p = feat.properties
        if (!p)
          continue

        let s_id = p.state_id !== undefined ? String(p.state_id) : (p.id !== undefined ? String(p.id) : undefined)

        if (p.id !== undefined)
          border_features_by_id.set(String(p.id), feat)
        if (feat.id !== undefined)
          border_features_by_id.set(String(feat.id), feat)
        if (p.state_id !== undefined)
          border_features_by_id.set(String(p.state_id), feat)
        if (p.name)
          border_features_by_name.set(p.name.toLowerCase().trim(), feat)

        if (s_id)
          active_state_ids.add(s_id)
        if (p.state_id !== undefined)
          active_state_ids.add(String(p.state_id))
        if (p.id !== undefined)
          active_state_ids.add(String(p.id))
        if (p.name)
          active_polity_names.add(p.name.toLowerCase().trim())
        if (p.name_long)
          active_polity_names.add(p.name_long.toLowerCase().trim())

        if (p.is_acapital) {
          if (s_id)
            acapital_state_ids.add(s_id)
        } else if (p.capname || p.capkey || p.cap_coords || (p.caplong !== undefined && p.caplat !== undefined)) {
          let polity_color = p.symbol?.polygonFill ||
            p.symbol?.fillColor ||
            p.fillColor ||
            p.color ||
            p.symbol?.strokeColor ||
            p.strokeColor

          let cap_lat: number | undefined
          let cap_lon: number | undefined
          if (p.cap_coords && Array.isArray(p.cap_coords) && p.cap_coords.length >= 2) {
            cap_lon = p.cap_coords[0]
            cap_lat = p.cap_coords[1]
          } else if (p.caplong !== undefined && p.caplat !== undefined) {
            cap_lon = Number(p.caplong)
            cap_lat = Number(p.caplat)
          }

          let cap_entry = {
            bbox: (feat as any).bbox || p.bbox,
            cap_coords: (cap_lon !== undefined && cap_lat !== undefined) ? [cap_lon, cap_lat] as [number, number] : undefined,
            capkey: p.capkey,
            capname: p.capname,
            color: polity_color,
            polity_name: p.name,
            state_id: p.state_id,
          }

          active_capitals_list.push(cap_entry)

          if (s_id)
            active_state_capitals_by_sid.set(s_id, {
              cap_coords: cap_entry.cap_coords,
              capkey: p.capkey,
              capname: p.capname,
            })

          if (p.capkey) {
            active_capitals_by_key.set(p.capkey, cap_entry)
            active_capitals_by_key.set(p.capkey.toLowerCase().trim(), cap_entry)
          }
          if (p.capname) {
            let names = p.capname.split(/[,/]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
            for (let n of names) {
              active_capitals_by_name.set(n, cap_entry)
              let n_nfd = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
              let n_clean = n_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
              if (n_clean)
                active_capitals_by_name.set(n_clean, cap_entry)
            }
          }
        }
      }
    }

    if (selected_countries && selected_countries.length > 0) {
      effective_selected_array = selected_countries
    } else if (selected_country) {
      effective_selected_array = [selected_country]
    }

    //1. Basemap Layer
    if (basemap === 'none' || projection === 'EqualEarth') {
      if (projection !== 'EqualEarth') {
        layers_array.push(
          new PolygonLayer({
            id: `ocean-base-${projection}`,
            data: [
              {
                polygon: [
                  [-180, -90],
                  [180, -90],
                  [180, 90],
                  [-180, 90],
                  [-180, -90],
                ],
              },
            ],
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            _imageCoordinateSystem: (projection === 'Globe') ? 'lnglat' : undefined,
            filled: true,
            getPolygon: (d: any) => d.polygon,
            getFillColor: [14, 18, 26, 255],
            stroked: false,
            parameters: { depthTest: false },
          })
        )
      }

      land_data = (projection === 'EqualEarth') ? equal_earth_land_geo_json : land_geo_json
      if (land_data) {
        layers_array.push(
          new GeoJsonLayer({
            id: `ne-land-${projection}`,
            data: land_data,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            filled: true,
            getFillColor: [32, 36, 46, 255],
            stroked: true,
            getLineColor: [55, 62, 78, 255],
            getLineWidth: 1,
            lineWidthUnits: 'pixels',
            parameters: { depthTest: false },
            extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
          })
        )
      }
    } else {
      if (projection === 'Mercator') {
        layers_array.push(
          new TileLayer({
            id: `esri-basemap-mercator-${basemap}`,
            data: esri_basemap_urls_obj[basemap],
            maxCacheByteSize: 32*1024*1024,
            maxCacheSize: 60,
            maxZoom: 18,
            minZoom: 0,
            refinementStrategy: 'no-overlap',
            tileSize: 256,
            renderSubLayers: (props: any) => {
              let local_bounding_box = props.tile.boundingBox
              return new BitmapLayer(props, {
                data: undefined,
                image: props.data,
                bounds: [
                  local_bounding_box[0][0],
                  local_bounding_box[0][1],
                  local_bounding_box[1][0],
                  local_bounding_box[1][1],
                ],
              })
            },
          })
        )
      } else if (projection === 'Globe') {
        layers_array.push(
          new TileLayer({
            id: `esri-basemap-globe-${basemap}`,
            data: esri_basemap_urls_obj[basemap],
            maxCacheByteSize: 32*1024*1024,
            maxCacheSize: 60,
            maxZoom: 18,
            minZoom: 0,
            refinementStrategy: 'no-overlap',
            tileSize: 256,
            renderSubLayers: (props: any) => {
              let local_bounding_box = props.tile.boundingBox
              return new BitmapLayer(props, {
                data: undefined,
                image: props.data,
                bounds: [
                  local_bounding_box[0][0],
                  local_bounding_box[0][1],
                  local_bounding_box[1][0],
                  local_bounding_box[1][1],
                ],
                _imageCoordinateSystem: 'cartesian',
              })
            },
          })
        )
      } else if (projection === 'Equirectangular') {
        layers_array.push(
          new TileLayer({
            id: `esri-basemap-equirectangular-${basemap}`,
            data: esri_basemap_urls_obj[basemap],
            TilesetClass: EquirectangularTileset2D,
            maxCacheByteSize: 32*1024*1024,
            maxCacheSize: 60,
            maxZoom: 18,
            minZoom: 0,
            refinementStrategy: 'no-overlap',
            tileSize: 256,
            renderSubLayers: (props: any) => {
              let local_bbox = props.tile.bbox
              if (!local_bbox)
                return null
              return new WarpedTileBitmapLayer(props, {
                data: undefined,
                image: props.data,
                bounds: [local_bbox.west, local_bbox.south, local_bbox.east, local_bbox.north],
              })
            },
          })
        )
      }
    }

    //2. Graticule Lines Layer
    if (show_graticule) {
      layers_array.push(
        new PathLayer({
          id: `graticule-layer-${projection}`,
          data: graticule_paths,
          getPath: (d: any) => d.path,
          getColor: [255, 255, 255, 38],
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          widthUnits: 'pixels',
          widthMinPixels: 1,
          widthMaxPixels: 1,
          getWidth: 1,
          pickable: false,
        })
      )
    }

    //3. GeoPNG Raster Layer
    if (rendered_canvas) {
      layers_array.push(
        new TesselatedBitmapLayer({
          id: `geopng-raster-${projection}-${options.activeLayerId ?? 'default'}-${options.rasterVersion ?? 0}-${heightmap_config.enabled ? '3d' : '2d'}-${heightmap_config.elevationScale}`,
          bounds: raster_bounds,
          image: rendered_canvas,
          opacity: opacity,
          pickable: true,
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          _imageCoordinateSystem: (projection === 'Globe') ? 'lnglat' : undefined,
          projection,
          heightmapEnabled: heightmap_config.enabled,
          elevationScale: heightmap_config.elevationScale,
          rasterData: raster?.data,
          rasterWidth: raster?.width,
          rasterHeight: raster?.height,
          minVal: min_val,
          maxVal: max_val,
          parameters: {
            depthTest: true,
            polygonOffset: [-2, -2],
          } as any,
          textureParameters: {
            minFilter: 'nearest',
            magFilter: 'nearest',
            mipmapFilter: 'nearest',
          },
        })
      )
    }

    //4. 3D Elevation Spikes
    if (heightmap_config.enabled && elevation_spikes_data.points && elevation_spikes_data.points.length > 0) {
      spike_key = (countries_mode && effective_selected_array.length > 0)
        ? `iso-${effective_selected_array.map((c) => c.properties.iso_a3 || c.properties.name).sort().join('_') || 'empty'}`
        : 'global'

      layers_array.push(
        new SolidPolygonLayer({
          id: `elevation-spikes-${projection}-${spike_key}-${heightmap_config.resolutionArcmin ?? 60}-${heightmap_config.heightScaleMode ?? 'linear'}-${heightmap_config.blendWeight ?? 0.5}`,
          data: elevation_spikes_data.points,
          getPolygon: (d: any) => d.polygon,
          getElevation: (d: any) => d.elevation,
          getFillColor: (d: any) => d.color,
          updateTriggers: {
            getPolygon: [elevation_spikes_data.points, spike_key, countries_mode, effective_selected_array.length, heightmap_config.resolutionArcmin],
            getElevation: [elevation_spikes_data.points, spike_key, heightmap_config.elevationScale, heightmap_config.resolutionArcmin, heightmap_config.heightScaleMode, heightmap_config.blendWeight],
            getFillColor: [elevation_spikes_data.points, spike_key, palette, invert_palette, heightmap_config.opacity, heightmap_config.opacityByPercentile, heightmap_config.opacityByPercentileStrength],
          },
          extruded: true,
          flatShading: true,
          opacity: 1,
          elevationScale: 1,
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          pickable: !is_drawing,
          material: {
            ambient: 0.35,
            diffuse: 0.7,
            shininess: 40,
            specularColor: [85, 90, 100],
          },
        })
      )
    }

    //5. High-Value Equal-Area Circle Pixels
    if (circle_pixel_data.length > 0) {
      stroke_w = circle_overlay_config.strokeWidth || 2
      halo_w = circle_overlay_config.haloWidth ?? 1

      layers_array.push(
        new ScatterplotLayer({
          id: `circle-pixels-halo-${projection}-${stroke_w}-${halo_w}`,
          data: circle_pixel_data,
          getPosition: (d: any) => d.position,
          getRadius: (d: any) => d.radius,
          filled: false,
          stroked: true,
          getLineColor: [0, 0, 0, 255],
          getLineWidth: stroke_w + halo_w*2,
          lineWidthUnits: 'pixels',
          radiusUnits: (is_cartesian) ? 'common' : 'meters',
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          pickable: false,
          parameters: { depthTest: false },
        })
      )

      layers_array.push(
        new ScatterplotLayer({
          id: `circle-pixels-stroke-${projection}-${stroke_w}`,
          data: circle_pixel_data,
          getPosition: (d: any) => d.position,
          getRadius: (d: any) => d.radius,
          filled: false,
          stroked: true,
          getLineColor: (d: any) => d.color,
          getLineWidth: stroke_w,
          lineWidthUnits: 'pixels',
          radiusUnits: (is_cartesian) ? 'common' : 'meters',
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          pickable: !is_drawing,
          parameters: { depthTest: false },
        })
      )
    }

    //6. Selected Countries Highlight
    let non_historical_selected_array = effective_selected_array.filter((arg0_c: any) => {
      let is_historical = Boolean(
        options.historicalBordersConfig?.enabled &&
        (arg0_c.properties?.gwcode !== undefined ||
         arg0_c.raw_feature !== undefined ||
         (options.selectedHistoricalFeature && (
           arg0_c.id === options.selectedHistoricalFeature.id ||
           arg0_c.properties?.id === options.selectedHistoricalFeature.properties?.id ||
           arg0_c.properties?.gwcode === options.selectedHistoricalFeature.properties?.gwcode
         )))
      )
      return !is_historical
    })

    if (non_historical_selected_array.length > 0) {
      selected_data = (projection === 'EqualEarth')
        ? non_historical_selected_array.map((c) => ({
            ...c,
            geometry: transformGeometryToEqualEarth(c.geometry),
          }))
        : non_historical_selected_array.map((c) => ({ ...c, geometry: { ...c.geometry } }))

      selected_key = non_historical_selected_array
        .map((c) => (c.properties.iso_a3 && c.properties.iso_a3 !== '-99' ? c.properties.iso_a3 : c.properties.name))
        .join('_')

      layers_array.push(
        new GeoJsonLayer({
          id: `countries-selected-${projection}-${selected_key}`,
          data: selected_data,
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          filled: true,
          getFillColor: [240, 60, 60, 30],
          stroked: true,
          getLineColor: [240, 60, 60, 220],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          updateTriggers: {
            getFillColor: [selected_key],
            getLineColor: [selected_key],
          },
          parameters: { depthTest: false },
          extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
        })
      )
    }

    //7. Hovered Country Highlight in Countries Mode
    is_hovered_already_selected = effective_selected_array.some(
      (c) =>
        (c.properties.iso_a3 && c.properties.iso_a3 !== '-99' && c.properties.iso_a3 === hovered_country?.properties.iso_a3) ||
        c.properties.name === hovered_country?.properties.name
    )

    if (!is_drawing && countries_mode && hovered_country && !is_hovered_already_selected) {
      hov_key = (hovered_country.properties.iso_a3 && hovered_country.properties.iso_a3 !== '-99')
        ? hovered_country.properties.iso_a3
        : (hovered_country.properties.adm0_a3 || hovered_country.properties.name || 'hov')

      hovered_data = (projection === 'EqualEarth')
        ? [{ ...hovered_country, geometry: transformGeometryToEqualEarth(hovered_country.geometry) }]
        : [{ ...hovered_country, geometry: { ...hovered_country.geometry } }]

      layers_array.push(
        new GeoJsonLayer({
          id: `country-hovered-${projection}-${hov_key}`,
          data: hovered_data,
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          filled: true,
          getFillColor: [255, 255, 255, 45],
          stroked: true,
          getLineColor: [255, 255, 255, 220],
          getLineWidth: 1.5,
          lineWidthUnits: 'pixels',
          parameters: { depthTest: false },
          extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
        })
      )
    }

    //8. Historical Statistical Borders (CShapes-2.0 & atlas.naissance)
    let historical_borders_layer = createHistoricalBordersDeckLayer({
      config: options.historicalBordersConfig,
      historicalBordersData: options.historicalBordersData,
      hoveredHistoricalId: options.hoveredHistoricalFeature?.id || options.hoveredHistoricalFeature?.properties?.id,
      isDrawing: is_drawing,
      onHoverHistoricalFeature: options.onHoverHistoricalFeature,
      onSelectHistoricalFeature: options.onSelectHistoricalFeature,
      projection,
      selectedHistoricalId: options.selectedHistoricalFeature?.id || options.selectedHistoricalFeature?.properties?.id,
      timelineYear: options.timelineYear || 1950,
    })
    if (historical_borders_layer) {
      if (Array.isArray(historical_borders_layer)) {
        for (let i = 0; i < historical_borders_layer.length; i++)
          if (historical_borders_layer[i])
            layers_array.push(historical_borders_layer[i])
      } else {
        layers_array.push(historical_borders_layer)
      }
    }

    //8b. Custom Vector Layer (.naissance / .geojson)
    if (custom_vector_features && custom_vector_features.length > 0 && custom_vector_visible) {
      let custom_vector_data = (projection === 'EqualEarth')
        ? custom_vector_features.map((arg0_f) => ({
            ...arg0_f,
            geometry: transformGeometryToEqualEarth(arg0_f.geometry),
          }))
        : custom_vector_features

      layers_array.push(
        new GeoJsonLayer({
          id: `custom-vector-layer-${projection}`,
          data: custom_vector_data,
          pickable: !is_drawing,
          stroked: true,
          filled: true,
          getFillColor: (arg0_d: any) => {
            let alpha = 110
            if (arg0_d.properties?.symbol?.polygonOpacity !== undefined) {
              alpha = Math.round(arg0_d.properties.symbol.polygonOpacity * 255)
            }
            if (arg0_d.properties?.color) {
              let c = arg0_d.properties.color
              if (Array.isArray(c) && c.length >= 3)
                return [c[0], c[1], c[2], alpha]
              if (typeof c === 'string' && c.startsWith('#')) {
                let rgb = hexToRgb(c)
                return [rgb[0], rgb[1], rgb[2], alpha]
              }
            }
            return [56, 189, 248, alpha]
          },
          getLineColor: (arg0_d: any) => {
            if (arg0_d.properties?.color) {
              let c = arg0_d.properties.color
              if (Array.isArray(c) && c.length >= 3)
                return [c[0], c[1], c[2], 220]
              if (typeof c === 'string' && c.startsWith('#')) {
                let rgb = hexToRgb(c)
                return [rgb[0], rgb[1], rgb[2], 220]
              }
            }
            return [56, 189, 248, 220]
          },
          getLineWidth: 1.5,
          lineWidthUnits: 'pixels',
          autoHighlight: true,
          highlightColor: [255, 255, 255, 70],
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          onClick: (arg0_info: any) => {
            if (is_drawing)
              return false
            if (arg0_info.object && options.onSelectCustomVectorFeature) {
              options.onSelectCustomVectorFeature(
                arg0_info.object,
                arg0_info.coordinate ? [arg0_info.coordinate[0], arg0_info.coordinate[1]] : undefined,
                arg0_info.x,
                arg0_info.y
              )
            }
            return true
          },
          onHover: (arg0_info: any) => {
            if (is_drawing)
              return
            if (options.onHoverCustomVectorFeature) {
              options.onHoverCustomVectorFeature(arg0_info.object || null, arg0_info.x, arg0_info.y)
            }
          },
          _subLayerProps: {
            'polygons-fill': {
              pickable: !is_drawing,
              parameters: {
                cullMode: 'none',
                depthMask: false,
                depthTest: false,
              },
            },
            'polygons-stroke': {
              pickable: !is_drawing,
              parameters: {
                depthMask: false,
                depthTest: false,
              },
            },
          },
          parameters: {
            cullMode: 'none',
            depthMask: false,
            depthTest: false,
          },
        })
      )
    }

    //8c. Finalized User-Drawn Measurement Polygon
    if (drawn_polygon_feature && !is_drawing) {
      let drawn_data = (projection === 'EqualEarth')
        ? [{
            ...drawn_polygon_feature,
            geometry: transformGeometryToEqualEarth(drawn_polygon_feature.geometry),
          }]
        : [drawn_polygon_feature]

      layers_array.push(
        new GeoJsonLayer({
          id: `drawn-polygon-layer-${projection}`,
          data: drawn_data,
          pickable: !is_drawing,
          autoHighlight: !is_drawing,
          highlightColor: [255, 255, 255, 70],
          stroked: true,
          filled: true,
          getFillColor: [200, 40, 40, 45],
          getLineColor: [200, 40, 40, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          onClick: (arg0_info: any) => {
            if (is_drawing)
              return false
            if (arg0_info.object && options.onSelectDrawnPolygon) {
              options.onSelectDrawnPolygon(
                arg0_info.object,
                arg0_info.coordinate ? [arg0_info.coordinate[0], arg0_info.coordinate[1]] : undefined,
                arg0_info.x,
                arg0_info.y
              )
            }
            return true
          },
          _subLayerProps: {
            'polygons-fill': {
              pickable: !is_drawing,
              parameters: {
                cullMode: 'none',
                depthMask: false,
                depthTest: false,
              },
            },
            'polygons-stroke': {
              pickable: !is_drawing,
              parameters: {
                depthMask: false,
                depthTest: false,
              },
            },
          },
          parameters: {
            cullMode: 'none',
            depthMask: false,
            depthTest: false,
          },
        })
      )
    }

    //8d. In-Progress Polygon Draw Tool (Vertices, Elastic Path, and Area Fill Preview)
    if (is_drawing && draw_points.length > 0) {
      let live_path_coords: [number, number][] = draw_points.map((arg0_pt) =>
        projectLngLatToLayerCoords(arg0_pt[0], arg0_pt[1], projection)
      )
      if (cursor_lng_lat) {
        live_path_coords.push(projectLngLatToLayerCoords(cursor_lng_lat[0], cursor_lng_lat[1], projection))
      }

      //Preview fill
      if (live_path_coords.length >= 3) {
        layers_array.push(
          new PolygonLayer({
            id: `draw-tool-preview-${projection}`,
            data: [{ polygon: live_path_coords }],
            getFillColor: [200, 40, 40, 30],
            stroked: false,
            pickable: false,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            parameters: {
              depthMask: false,
              depthTest: false,
            },
          })
        )
      }

      //Elastic path
      layers_array.push(
        new PathLayer({
          id: `draw-tool-path-${projection}`,
          data: [{ path: live_path_coords }],
          getColor: [200, 40, 40, 220],
          getWidth: 2,
          widthUnits: 'pixels',
          pickable: false,
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          parameters: {
            depthMask: false,
            depthTest: false,
          },
        })
      )

      //Vertices
      let vertex_data = draw_points.map((arg0_pt, arg1_idx) => {
        let coords = projectLngLatToLayerCoords(arg0_pt[0], arg0_pt[1], projection)
        return {
          idx: arg1_idx,
          position: [coords[0], coords[1], 0],
        }
      })

      layers_array.push(
        new ScatterplotLayer({
          id: `draw-tool-vertices-${projection}`,
          data: vertex_data,
          getPosition: (arg0_d: any) => arg0_d.position,
          getRadius: (arg0_d: any) => (arg0_d.idx === 0 ? (draw_points.length >= 3 ? 10 : 8) : 5),
          radiusUnits: 'pixels',
          getFillColor: (arg0_d: any) => (arg0_d.idx === 0 ? [255, 220, 0, 255] : [200, 40, 40, 255]),
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          pickable: is_drawing,
          onClick: (arg0_info: any) => {
            if (is_drawing && draw_points.length >= 3 && arg0_info.object?.idx === 0) {
              if (options.onFinishDraw)
                options.onFinishDraw()
              return true
            }
            return false
          },
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          parameters: {
            depthMask: false,
            depthTest: false,
          },
        })
      )
    }

    //9. Stadestér Historical Cities
    let is_worker_points_matching_proj = Boolean(
      options.stadesterPoints &&
      options.stadesterPoints.length > 0 &&
      (!options.stadesterPoints[0]?.projection || options.stadesterPoints[0]?.projection === projection)
    )
    let effective_points = is_worker_points_matching_proj
      ? options.stadesterPoints!
      : stadester_points_data

    //Pre-match active capitals to cities by coordinate proximity and key
    if (active_capitals_list.length > 0 && effective_points && effective_points.length > 0) {
      let timeline_yr = options.timelineYear
      let pts_by_key = new Map<string, number>()
      let pts_by_name = new Map<string, number[]>()
      let pts_grid = new Map<string, number[]>()

      for (let i = 0; i < effective_points.length; i++) {
        let c = effective_points[i]
        let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : undefined))
        let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : undefined))
        if (c_lat === undefined || c_lon === undefined)
          continue

        let cell = `${Math.floor(c_lon)}_${Math.floor(c_lat)}`
        let b = pts_grid.get(cell)
        if (!b) {
          b = []
          pts_grid.set(cell, b)
        }
        b.push(i)

        if (c.key) {
          pts_by_key.set(c.key, i)
          let clean_k = normalizeCityKey(c.key)
          if (clean_k)
            pts_by_key.set(clean_k, i)
        }
        if (c.id) {
          pts_by_key.set(String(c.id), i)
          let clean_id = normalizeCityKey(String(c.id))
          if (clean_id)
            pts_by_key.set(clean_id, i)
        }

        if (c.name) {
          let c_name_lower = c.name.toLowerCase().trim()
          let c_name_nfd = c_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let clean_c = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')

          let add_point_name = function (arg0_nm: string) {
            if (!arg0_nm)
              return
            let arr = pts_by_name.get(arg0_nm)
            if (!arr) {
              arr = []
              pts_by_name.set(arg0_nm, arr)
            }
            arr.push(i)
          }

          add_point_name(c_name_lower)
          add_point_name(c_name_nfd)
          add_point_name(clean_c)
        }

        if (c.other_names && Array.isArray(c.other_names)) {
          for (let x = 0; x < c.other_names.length; x++) {
            let on = c.other_names[x]
            let on_clean = on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
            let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
            let arr = pts_by_name.get(on_clean) || pts_by_name.get(on_nfd) || pts_by_name.get(clean_on)
            if (!arr) {
              arr = []
              pts_by_name.set(on_clean, arr)
              pts_by_name.set(on_nfd, arr)
              pts_by_name.set(clean_on, arr)
            }
            arr.push(i)
          }
        }
      }

      for (let i = 0; i < active_capitals_list.length; i++) {
        let cap = active_capitals_list[i]
        let best_city: any = null
        let best_score = -1
        let candidate_indices = new Set<number>()

        if (cap.cap_coords) {
          let min_cx = Math.floor(cap.cap_coords[0] - 0.25)
          let max_cx = Math.floor(cap.cap_coords[0] + 0.25)
          let min_cy = Math.floor(cap.cap_coords[1] - 0.25)
          let max_cy = Math.floor(cap.cap_coords[1] + 0.25)

          for (let x = min_cx; x <= max_cx; x++)
            for (let y = min_cy; y <= max_cy; y++) {
              let bucket = pts_grid.get(`${x}_${y}`)
              if (bucket)
                for (let z = 0; z < bucket.length; z++)
                  candidate_indices.add(bucket[z])
            }
        }

        if (cap.capkey) {
          let idx = pts_by_key.get(cap.capkey) ?? pts_by_key.get(normalizeCityKey(cap.capkey))
          if (idx !== undefined)
            candidate_indices.add(idx)
        }

        if (cap.capname) {
          let cap_name_lower = cap.capname.toLowerCase().trim()
          let cap_name_nfd = cap_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let clean_cap = cap_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
          let list = pts_by_name.get(cap_name_lower) || pts_by_name.get(cap_name_nfd) || pts_by_name.get(clean_cap)
          if (list)
            for (let x = 0; x < list.length; x++)
              candidate_indices.add(list[x])
        }

        let all_candidates = Array.from(candidate_indices)
        for (let x = 0; x < all_candidates.length; x++) {
          let j = all_candidates[x]
          let c = effective_points[j]
          let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : undefined))
          let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : undefined))
          if (c_lat === undefined || c_lon === undefined)
            continue

          //Skip temporally displaced cities (cities from another era/time period)
          if (timeline_yr !== undefined) {
            if (c.min_year !== undefined && timeline_yr < c.min_year)
              continue
            if (c.max_year !== undefined && c.max_year < 1975 && timeline_yr > c.max_year + 25)
              continue
            if (typeof c.population === 'number' && c.population <= 0)
              continue
            if (timeline_yr < 1975 && c.key && c.key.startsWith('ghsl-'))
              continue
          }

          if (cap.cap_coords) {
            if (Math.abs(c_lon - cap.cap_coords[0]) > 0.20 || Math.abs(c_lat - cap.cap_coords[1]) > 0.20)
              continue
          }

          let dist = cap.cap_coords ? Math.hypot(c_lon - cap.cap_coords[0], c_lat - cap.cap_coords[1]) : 999
          if (dist > 0.20)
            continue

          if (cap.bbox) {
            let pad = 1.0
            if (c_lon < cap.bbox[0] - pad || c_lon > cap.bbox[2] + pad || c_lat < cap.bbox[1] - pad || c_lat > cap.bbox[3] + pad)
              continue
          }

          let score = 0
          if (cap.capkey && (c.key === cap.capkey || c.id === cap.capkey))
            score += 200000
          let clean_c_key = normalizeCityKey(c.key || '')
          let clean_cap_key = normalizeCityKey(cap.capkey || '')
          if (clean_cap_key && clean_c_key && clean_cap_key === clean_c_key)
            score += 100000
          let c_name_lower = (c.name || '').toLowerCase().trim()
          let c_name_nfd = c_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let cap_name_lower = (cap.capname || '').toLowerCase().trim()
          let cap_name_nfd = cap_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

          let is_name_match = false
          if (cap_name_lower) {
            let clean_c_name = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
            let clean_cap_name = cap_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
            if (
              c_name_lower === cap_name_lower ||
              c_name_nfd === cap_name_nfd ||
              clean_c_name === clean_cap_name ||
              clean_c_name.startsWith(clean_cap_name) ||
              clean_cap_name.startsWith(clean_c_name)
            ) {
              is_name_match = true
            } else if (c.other_names && Array.isArray(c.other_names)) {
              is_name_match = c.other_names.some((arg0_on: string) => {
                let on_clean = arg0_on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
                let on_lower = on_clean
                let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
                return on_lower === cap_name_lower || on_nfd === cap_name_nfd || clean_on === clean_cap_name
              })
            }
          }

          if (is_name_match)
            score += 50000
          if (c.isCapital || c.is_capital)
            score += 10000
          if (c.key && !c.key.includes('agglomeration'))
            score += 5000
          score += Math.max(0, Math.round((0.25 - dist) * 5000))
          score += Math.min(1000, Math.round((c.population || 0) / 1000))

          if (score > best_score) {
            best_score = score
            best_city = c
          }
        }

        if (best_city) {
          if (best_city.key)
            authoritative_capitals_by_city.set(best_city.key, cap)
          if (best_city.id)
            authoritative_capitals_by_city.set(String(best_city.id), cap)
        }
      }
    }

    //Reconcile capital cities isomorphically with authoritative historical border features
    if ((active_capitals_by_key.size > 0 || active_capitals_by_name.size > 0 || active_capitals_list.length > 0 || acapital_state_ids.size > 0 || active_state_ids.size > 0) && effective_points && effective_points.length > 0) {
      effective_points = effective_points.map((arg0_c: any) =>
        reconcileCapitalWithAuthoritativeBorders(
          arg0_c,
          active_capitals_by_key,
          active_capitals_by_name,
          acapital_state_ids,
          active_state_capitals_by_sid,
          active_state_ids,
          active_polity_names,
          authoritative_capitals_by_city,
          active_capitals_list
        )
      )
    }

    if (options.stadesterConfig?.enabled && effective_points.length > 0) {
      let is_firefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent)
      let is_halo = options.stadesterConfig.halo !== false && !options.stadesterConfig.filled
      let is_labels_visible = (options.stadesterConfig.showLabels !== undefined) ? options.stadesterConfig.showLabels : true

      let circle_opacity = (options.stadesterConfig.opacity !== undefined) ? options.stadesterConfig.opacity : 0.7
      let fill_alpha = Math.round(255 * circle_opacity)
      let stroke_alpha = Math.min(255, Math.round(255 * Math.min(1.0, circle_opacity * 1.25)))

      // City circles layer (ScatterplotLayer for Chrome/WebKit, TextLayer for Firefox)
      if (is_firefox) {
        layers_array.push(
          new TextLayer({
            id: `stadester-cities-${projection}`,
            data: effective_points,
            getText: () => (is_halo) ? '○' : '●',
            characterSet: ['●', '○'],
            fontFamily: 'Segoe UI Symbol, Arial, sans-serif',
            fontSettings: { buffer: 8, fontSize: 128, sdf: true },
            getPosition: (d: any) => d.position,
            getSize: (d: any) => d.pixelRadius * 2,
            getColor: (d: any) => {
              let is_region_highlighted = Boolean(
                options.hoveredCity?.region &&
                d.region &&
                (d.region === options.hoveredCity.region ||
                 d.region.toLowerCase().includes(options.hoveredCity.region.toLowerCase()) ||
                 options.hoveredCity.region.toLowerCase().includes(d.region.toLowerCase()))
              )
              if (is_region_highlighted) {
                let r = Math.round(d.color[0] * 0.7 + 255 * 0.3)
                let g = Math.round(d.color[1] * 0.7 + 255 * 0.3)
                let b = Math.round(d.color[2] * 0.7 + 255 * 0.3)
                return [r, g, b, Math.min(255, fill_alpha + 35)]
              }
              return [d.color[0], d.color[1], d.color[2], (is_halo) ? stroke_alpha : fill_alpha]
            },
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            sizeUnits: 'pixels',
            sizeScale: 1,
            sizeMinPixels: is_mobile ? 4.5 : 6.5,
            sizeMaxPixels: is_mobile ? 65.0 : 130.0,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            billboard: true,
            pickable: !is_drawing,
            autoHighlight: !is_drawing,
            highlightColor: [255, 255, 255, 100],
            background: false,
            onClick: (info: any) => {
              if (is_drawing)
                return false
              if (info.object && options.onSelectCity)
                options.onSelectCity(
                  info.object,
                  info.coordinate ? [info.coordinate[0], info.coordinate[1]] : undefined,
                  info.x,
                  info.y
                )
              return true
            },
            onHover: (info: any) => {
              if (is_drawing)
                return
              if (options.onHoverCity)
                options.onHoverCity(info.object || null, info.x, info.y)
            },
            parameters: {
              cullMode: 'none',
              depthMask: false,
              depthTest: false,
            },
          })
        )
      } else {
        layers_array.push(
          new ScatterplotLayer({
            id: `stadester-cities-${projection}`,
            data: effective_points,
            getPosition: (d: any) => d.position,
            getRadius: (d: any) => d.pixelRadius,
            getFillColor: (d: any) => {
              let is_region_highlighted = Boolean(
                options.hoveredCity?.region &&
                d.region &&
                (d.region === options.hoveredCity.region ||
                 d.region.toLowerCase().includes(options.hoveredCity.region.toLowerCase()) ||
                 options.hoveredCity.region.toLowerCase().includes(d.region.toLowerCase()))
              )
              if (is_region_highlighted) {
                let r = Math.round(d.color[0] * 0.7 + 255 * 0.3)
                let g = Math.round(d.color[1] * 0.7 + 255 * 0.3)
                let b = Math.round(d.color[2] * 0.7 + 255 * 0.3)
                return [r, g, b, Math.min(255, fill_alpha + 35)]
              }
              return [d.color[0], d.color[1], d.color[2], fill_alpha]
            },
            getLineColor: (d: any) => {
              let is_region_highlighted = Boolean(
                options.hoveredCity?.region &&
                d.region &&
                (d.region === options.hoveredCity.region ||
                 d.region.toLowerCase().includes(options.hoveredCity.region.toLowerCase()) ||
                 options.hoveredCity.region.toLowerCase().includes(d.region.toLowerCase()))
              )
              if (is_region_highlighted) {
                let r = Math.round(d.color[0] * 0.7 + 255 * 0.3)
                let g = Math.round(d.color[1] * 0.7 + 255 * 0.3)
                let b = Math.round(d.color[2] * 0.7 + 255 * 0.3)
                return [r, g, b, 255]
              }
              return [d.color[0], d.color[1], d.color[2], stroke_alpha]
            },
            getLineWidth: 1.5,
            lineWidthUnits: 'pixels',
            lineWidthMinPixels: 1.5,
            stroked: is_halo,
            filled: !is_halo,
            radiusUnits: 'pixels',
            radiusMinPixels: is_mobile ? 2.0 : 3.25,
            radiusMaxPixels: is_mobile ? 32.0 : 65.0,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            billboard: true,
            pickable: !is_drawing,
            autoHighlight: !is_drawing,
            highlightColor: [255, 255, 255, 100],
            onClick: (info: any) => {
              if (is_drawing)
                return false
              if (info.object && options.onSelectCity)
                options.onSelectCity(
                  info.object,
                  info.coordinate ? [info.coordinate[0], info.coordinate[1]] : undefined,
                  info.x,
                  info.y
                )
              return true
            },
            onHover: (info: any) => {
              if (is_drawing)
                return
              if (options.onHoverCity)
                options.onHoverCity(info.object || null, info.x, info.y)
            },
            parameters: {
              cullMode: 'none',
              depthMask: false,
              depthTest: false,
            },
          })
        )
      }

      // City selection highlight ring
      if (options.selectedCityKey) {
        let selected_city_item = effective_points.find((c: any) => c.key === options.selectedCityKey)
        if (selected_city_item) {
          if (is_firefox) {
            layers_array.push(
              new TextLayer({
                id: `stadester-selected-ring-${projection}`,
                data: [selected_city_item],
                getText: () => '○',
                characterSet: ['○'],
                fontFamily: 'Segoe UI Symbol, Arial, sans-serif',
                fontSettings: { buffer: 8, fontSize: 128, sdf: true },
                getPosition: (d: any) => d.position,
                getSize: (d: any) => (is_mobile ? (d.pixelRadius * 0.70 + 2.5) : (d.pixelRadius + 4)) * 2,
                getColor: [239, 68, 68, 255],
                getTextAnchor: 'middle',
                getAlignmentBaseline: 'center',
                sizeUnits: 'pixels',
                sizeScale: 1,
                coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
                billboard: true,
                background: false,
                parameters: {
                  cullMode: 'none',
                  depthMask: false,
                  depthTest: false,
                },
                pickable: false,
              })
            )
          } else {
            layers_array.push(
              new ScatterplotLayer({
                id: `stadester-selected-ring-${projection}`,
                data: [selected_city_item],
                getPosition: (d: any) => d.position,
                getRadius: (d: any) => is_mobile ? (d.pixelRadius * 0.70 + 2.5) : (d.pixelRadius + 4),
                stroked: true,
                filled: false,
                getLineColor: [239, 68, 68, 255],
                getLineWidth: 2.5,
                lineWidthUnits: 'pixels',
                radiusUnits: 'pixels',
                coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
                billboard: true,
                parameters: {
                  cullMode: 'none',
                  depthMask: false,
                  depthTest: false,
                },
                pickable: false,
              })
            )
          }
        }
      }

      // City text labels
      if (is_labels_visible) {
        let visible_label_cities = options.stadesterLabels

        if (visible_label_cities && visible_label_cities.length > 0) {
          if (visible_label_cities[0]?.projection && visible_label_cities[0].projection !== projection)
            visible_label_cities = undefined
        }

        if (visible_label_cities && visible_label_cities.length > 0) {
          visible_label_cities = visible_label_cities.filter((arg0_c: any) =>
            arg0_c &&
            arg0_c.position &&
            Number.isFinite(arg0_c.position[0]) &&
            Number.isFinite(arg0_c.position[1]) &&
            typeof arg0_c.shortName === 'string' &&
            arg0_c.shortName.trim().length > 0
          )

          //Reconcile capital cities isomorphically with authoritative historical border features
          if (active_capitals_by_key.size > 0 || active_capitals_by_name.size > 0 || active_capitals_list.length > 0 || acapital_state_ids.size > 0 || active_state_ids.size > 0) {
            visible_label_cities = visible_label_cities.map((arg0_c: any) =>
              reconcileCapitalWithAuthoritativeBorders(
                arg0_c,
                active_capitals_by_key,
                active_capitals_by_name,
                acapital_state_ids,
                active_state_capitals_by_sid,
                active_state_ids,
                active_polity_names,
                authoritative_capitals_by_city,
                active_capitals_list
              )
            )
          }
        }

        if (visible_label_cities && visible_label_cities.length > 0) {
          layers_array.push(
            new UnderlinedTextLayer({
              id: `stadester-labels-${projection}`,
              data: visible_label_cities,
              getPosition: (d: any) => d.position,
              getText: (d: any) => d.shortName,
              getSize: (d: any) => Math.max(10, Math.min(15, 9 + Math.log10(Math.max(1000, d.population))*0.9)),
              sizeUnits: 'pixels',
              sizeMinPixels: 9,
              isUnderlined: (d: any) => Boolean(d.isCapital && options.stadesterConfig?.showCapitals !== false && options.stadesterConfig?.showCapitalUnderlines !== false),
              getUnderlineColor: (d: any) => {
                if (!d.isCapital || options.stadesterConfig?.showCapitals === false || options.stadesterConfig?.showCapitalUnderlines === false)
                  return [0, 0, 0, 0]

                let cap_rgb: [number, number, number] = [255, 220, 0]
                let color_mode = options.stadesterConfig?.capitalColorMode || 'state'
                let constant_color = options.stadesterConfig?.capitalConstantColor || '#FFDC00'

                if (color_mode === 'constant') {
                  cap_rgb = hexToRgb(constant_color)
                } else if (Array.isArray(d.capitalColor) && d.capitalColor.length >= 3) {
                  cap_rgb = [d.capitalColor[0], d.capitalColor[1], d.capitalColor[2]]
                } else if (typeof d.capitalColor === 'string' && d.capitalColor.startsWith('#')) {
                  cap_rgb = hexToRgb(d.capitalColor)
                } else {
                  cap_rgb = hexToRgb(constant_color)
                }
                let contrast_rgb = ensureContrastAgainstDark(cap_rgb, 155)
                return [contrast_rgb[0], contrast_rgb[1], contrast_rgb[2], 255]
              },
              getColor: (d: any) => {
                if (!d.isCapital || options.stadesterConfig?.showCapitals === false)
                  return [255, 255, 255, 255]

                let cap_rgb: [number, number, number] = [255, 220, 0]
                let color_mode = options.stadesterConfig?.capitalColorMode || 'state'
                let constant_color = options.stadesterConfig?.capitalConstantColor || '#FFDC00'

                if (color_mode === 'constant') {
                  cap_rgb = hexToRgb(constant_color)
                } else if (Array.isArray(d.capitalColor) && d.capitalColor.length >= 3) {
                  cap_rgb = [d.capitalColor[0], d.capitalColor[1], d.capitalColor[2]]
                } else if (typeof d.capitalColor === 'string' && d.capitalColor.startsWith('#')) {
                  cap_rgb = hexToRgb(d.capitalColor)
                } else {
                  cap_rgb = hexToRgb(constant_color)
                }
                let contrast_rgb = ensureContrastAgainstDark(cap_rgb, 155)
                return [contrast_rgb[0], contrast_rgb[1], contrast_rgb[2], 255]
              },
              getTextAnchor: 'start',
              getAlignmentBaseline: 'center',
              updateTriggers: {
                getColor: [
                  visible_label_cities,
                  options.stadesterConfig?.showCapitals,
                  options.stadesterConfig?.capitalColorMode,
                  options.stadesterConfig?.capitalConstantColor,
                ],
                getUnderlineColor: [
                  visible_label_cities,
                  options.stadesterConfig?.showCapitals,
                  options.stadesterConfig?.showCapitalUnderlines,
                  options.stadesterConfig?.capitalColorMode,
                  options.stadesterConfig?.capitalConstantColor,
                ],
                isUnderlined: [
                  visible_label_cities,
                  options.stadesterConfig?.showCapitals,
                  options.stadesterConfig?.showCapitalUnderlines,
                ],
              },
              getPixelOffset: (d: any) => [d.pixelRadius + 8, 0],
              background: true,
              getBackgroundColor: [10, 15, 25, 220],
              backgroundPadding: [4, 2],
              backgroundBorderRadius: 2,
              fontFamily: 'Karla, sans-serif',
              fontWeight: 600,
              billboard: true,
              coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
              characterSet: 'auto',
              pickable: !is_drawing,
              autoHighlight: !is_drawing,
              highlightColor: [255, 255, 255, 60],
              onClick: (info: any) => {
                if (is_drawing)
                  return false
                if (info.object && options.onSelectCity)
                  options.onSelectCity(
                    info.object,
                    info.coordinate ? [info.coordinate[0], info.coordinate[1]] : undefined,
                    info.x,
                    info.y
                  )
                return true
              },
              onHover: (info: any) => {
                if (is_drawing)
                  return
                if (options.onHoverCity)
                  options.onHoverCity(info.object || null, info.x, info.y)
              },
              parameters: {
                cullMode: 'none',
                depthMask: false,
                depthTest: false,
              },
            })
          )
        }
      }
    }

    //Return statement
    return layers_array
  }, [
    options.projection,
    options.basemap,
    options.landGeoJson,
    options.equalEarthLandGeoJson,
    options.showGraticule,
    options.graticulePaths,
    options.renderedCanvas,
    options.rasterBounds,
    options.opacity,
    options.heightmapConfig,
    options.elevationSpikesData,
    options.circleOverlayConfig,
    options.circlePixelData,
    options.raster,
    options.palette,
    options.invertPalette,
    options.isMobile,
    options.minVal,
    options.maxVal,
    options.selectedCountry,
    options.selectedCountries,
    options.countriesMode,
    options.hoveredCountry,
    stadester_points_data,
    options.stadesterPoints,
    options.stadesterLabels,
    options.stadesterConfig,
    options.selectedCityKey,
    options.onSelectCity,
    options.onHoverCity,
    options.hoveredCity,
    options.historicalBordersData,
    options.historicalBordersConfig,
    options.selectedHistoricalFeature,
    options.hoveredHistoricalFeature,
    options.onSelectHistoricalFeature,
    options.onHoverHistoricalFeature,
    options.timelineYear,
    options.activeLayerId,
    options.rasterVersion,
    options.customVectorFeatures,
    options.customVectorVisible,
    options.drawnPolygonFeature,
    options.isDrawing,
    options.drawPoints,
    options.cursorLngLat,
    options.onFinishDraw,
    options.onSelectCustomVectorFeature,
    options.onHoverCustomVectorFeature,
    options.onSelectDrawnPolygon,
  ])
}
