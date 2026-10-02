import { useMemo } from 'react'
import { COORDINATE_SYSTEM, WebMercatorViewport } from '@deck.gl/core'
import {
  BitmapLayer,
  GeoJsonLayer,
  IconLayer,
  PathLayer,
  PolygonLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
  TextLayer,
} from '@deck.gl/layers'
import { CollisionFilterExtension } from '@deck.gl/extensions'
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
import {
  isGlobePointVisible,
  projectGlobeCoordinates,
} from '@framework/stadester/stadester_heuristics.ts'
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
  REGION_COLOR_MAP,
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
 * Tests whether a 2D point [lng, lat] lies within a polygon coordinate ring using ray-casting.
 *
 * @param {[number, number]} arg0_point - [longitude, latitude] point
 * @param {number[][]} arg1_ring - Array of [longitude, latitude] coordinates forming the ring
 *
 * @returns {boolean} True if point is inside ring
 */
function isPointInPolygonRing (arg0_point: [number, number], arg1_ring: number[][]): boolean {
  //Convert from parameters
  let pt = arg0_point
  let ring = arg1_ring

  //Guard clauses
  if (!ring || ring.length < 3 || !pt)
    return false

  //Declare local instance variables
  let inside = false
  let n = ring.length
  let x = pt[0]
  let y = pt[1]

  //Function body
  for (let i = 0, j = n - 1; i < n; j = i++) {
    let xi = ring[i][0]
    let yi = ring[i][1]
    let xj = ring[j][0]
    let yj = ring[j][1]

    let intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)
    if (intersect)
      inside = !inside
  }

  //Return statement
  return inside
}

/**
 * Tests whether a point [lng, lat] falls within a GeoJSON Polygon or MultiPolygon geometry.
 *
 * @param {[number, number]} arg0_point - [longitude, latitude] point
 * @param {any} arg1_geometry - GeoJSON geometry object
 *
 * @returns {boolean} True if point is inside geometry
 */
function isPointInHistoricalGeometry (arg0_point: [number, number], arg1_geometry: any): boolean {
  //Convert from parameters
  let geom = arg1_geometry
  let pt = arg0_point

  //Guard clauses
  if (!geom || !geom.coordinates || !pt)
    return false

  //Declare local instance variables
  let coords = geom.coordinates

  //Function body
  if (geom.type === 'Polygon') {
    if (!isPointInPolygonRing(pt, coords[0]))
      return false
    for (let i = 1; i < coords.length; i++) {
      if (isPointInPolygonRing(pt, coords[i]))
        return false
    }
    return true
  } else if (geom.type === 'MultiPolygon') {
    for (let p = 0; p < coords.length; p++) {
      let poly = coords[p]
      if (isPointInPolygonRing(pt, poly[0])) {
        let in_hole = false
        for (let h = 1; h < poly.length; h++) {
          if (isPointInPolygonRing(pt, poly[h])) {
            in_hole = true
            break
          }
        }
        if (!in_hole)
          return true
      }
    }
    return false
  }

  //Return statement
  return false
}

/**
 * Calculates squared Euclidean distance from point (px, py) to line segment (x1, y1)-(x2, y2).
 *
 * @param {number} arg0_px
 * @param {number} arg1_py
 * @param {number} arg2_x1
 * @param {number} arg3_y1
 * @param {number} arg4_x2
 * @param {number} arg5_y2
 *
 * @returns {number} Squared distance
 */
function distanceSquaredToSegment (
  arg0_px: number,
  arg1_py: number,
  arg2_x1: number,
  arg3_y1: number,
  arg4_x2: number,
  arg5_y2: number
): number {
  //Convert from parameters
  let px = arg0_px
  let py = arg1_py
  let x1 = arg2_x1
  let y1 = arg3_y1
  let x2 = arg4_x2
  let y2 = arg5_y2

  //Declare local instance variables
  let diff_x: number
  let diff_y: number
  let dpx: number
  let dpy: number
  let dx = x2 - x1
  let dy = y2 - y1
  let len_sq = dx * dx + dy * dy
  let proj_x: number
  let proj_y: number
  let t: number

  //Guard clauses
  if (len_sq === 0) {
    dpx = px - x1
    dpy = py - y1
    return dpx * dpx + dpy * dpy
  }

  //Function body
  t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len_sq))
  proj_x = x1 + t * dx
  proj_y = y1 + t * dy
  diff_x = px - proj_x
  diff_y = py - proj_y

  //Return statement
  return diff_x * diff_x + diff_y * diff_y
}

/**
 * Tests whether a point [lng, lat] is within max_dist degrees of any segment in a polygon ring.
 *
 * @param {[number, number]} arg0_point
 * @param {number[][]} arg1_ring
 * @param {number} arg2_max_dist
 *
 * @returns {boolean} True if point is near ring
 */
function isPointNearPolygonRing (arg0_point: [number, number], arg1_ring: number[][], arg2_max_dist: number): boolean {
  //Convert from parameters
  let max_dist = arg2_max_dist
  let pt = arg0_point
  let ring = arg1_ring

  //Guard clauses
  if (!ring || ring.length < 2 || !pt)
    return false

  //Declare local instance variables
  let max_dist_sq = max_dist * max_dist
  let px = pt[0]
  let py = pt[1]

  //Function body
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let d_sq = distanceSquaredToSegment(px, py, ring[i][0], ring[i][1], ring[j][0], ring[j][1])
    if (d_sq <= max_dist_sq)
      return true
  }

  //Return statement
  return false
}

/**
 * Tests whether a point [lng, lat] is within max_dist degrees of a GeoJSON Polygon / MultiPolygon geometry.
 *
 * @param {[number, number]} arg0_point
 * @param {any} arg1_geometry
 * @param {number} arg2_max_dist
 *
 * @returns {boolean} True if point is within max_dist
 */
function isPointNearHistoricalGeometry (arg0_point: [number, number], arg1_geometry: any, arg2_max_dist: number): boolean {
  //Convert from parameters
  let geom = arg1_geometry
  let max_dist = arg2_max_dist
  let pt = arg0_point

  //Guard clauses
  if (!geom || !geom.coordinates || !pt)
    return false

  //Declare local instance variables
  let coords = geom.coordinates

  //Function body
  if (geom.type === 'Polygon') {
    for (let r = 0; r < coords.length; r++) {
      if (isPointNearPolygonRing(pt, coords[r], max_dist))
        return true
    }
  } else if (geom.type === 'MultiPolygon') {
    for (let p = 0; p < coords.length; p++) {
      let poly = coords[p]
      for (let r = 0; r < poly.length; r++) {
        if (isPointNearPolygonRing(pt, poly[r], max_dist))
          return true
      }
    }
  }

  //Return statement
  return false
}

/**
 * Verifies if a capital city falls within its target state's active border polygon on screen.
 * Accommodates coastal settlements with 0.35° spatial tolerance for generalized boundary polygons.
 * Enriches the capital city with its parent polity's rendered polygon colour.
 *
 * @param {any} arg0_city - City object
 * @param {Map<string, any>} arg1_features_by_id - Map of state IDs to feature
 * @param {Map<string, any>} arg2_features_by_name - Map of state names to feature
 *
 * @returns {boolean} True if the city is inside or near the target polygon
 */
function isCapitalInsideTargetPolygon (
  arg0_city: any,
  arg1_features_by_id: Map<string, any>,
  arg2_features_by_name: Map<string, any>
): boolean {
  //Convert from parameters
  let city = arg0_city
  let features_by_id = arg1_features_by_id
  let features_by_name = arg2_features_by_name

  //Guard clauses
  if (!city || !city.isCapital)
    return false

  //Declare local instance variables
  let bbox: [number, number, number, number] | undefined
  let geom: any
  let is_inside: boolean
  let polity_color: any
  let pt_coords: [number, number] | undefined
  let target_feature: any

  //Function body
  if (city.rawCoords && Array.isArray(city.rawCoords) && city.rawCoords.length >= 2) {
    pt_coords = [city.rawCoords[0], city.rawCoords[1]]
  } else if (city.coords && Array.isArray(city.coords) && city.coords.length >= 2) {
    pt_coords = [city.coords[0], city.coords[1]]
  } else if (city.position && Array.isArray(city.position) && city.position.length >= 2) {
    pt_coords = [city.position[0], city.position[1]]
  }

  if (!pt_coords)
    return true

  if (city.capitalStateId !== undefined && city.capitalStateId !== null) {
    target_feature = features_by_id.get(String(city.capitalStateId))
  }
  if (!target_feature && city.capital_state_id !== undefined && city.capital_state_id !== null) {
    target_feature = features_by_id.get(String(city.capital_state_id))
  }
  if (!target_feature && city.capitalOf && typeof city.capitalOf === 'string') {
    target_feature = features_by_name.get(city.capitalOf.toLowerCase().trim())
  }
  if (!target_feature && city.capital_state_name && typeof city.capital_state_name === 'string') {
    target_feature = features_by_name.get(city.capital_state_name.toLowerCase().trim())
  }
  if (!target_feature && (city.capitalOf || city.capital_state_name)) {
    let search_name = (city.capitalOf || city.capital_state_name || '').toLowerCase().trim()
    for (let [f_name, feat] of features_by_name.entries()) {
      if (f_name === search_name || f_name.includes(search_name) || search_name.includes(f_name)) {
        target_feature = feat
        break
      }
    }
  }

  //If no target polygon feature is active on screen, retain default capital status
  if (!target_feature)
    return true

  bbox = target_feature.bbox
  if (bbox && bbox.length >= 4) {
    if (pt_coords[0] < bbox[0] - 0.35 || pt_coords[0] > bbox[2] + 0.35 ||
        pt_coords[1] < bbox[1] - 0.35 || pt_coords[1] > bbox[3] + 0.35) {
      return false
    }
  }

  geom = target_feature.geometry
  if (!geom)
    return false

  is_inside = isPointInHistoricalGeometry(pt_coords, geom) || isPointNearHistoricalGeometry(pt_coords, geom, 0.35)
  if (!is_inside)
    return false

  //Enrich capital city with the active border polygon's fill or stroke colour
  polity_color = target_feature.properties?.symbol?.polygonFill ||
    target_feature.properties?.symbol?.fillColor ||
    target_feature.properties?.fillColor ||
    target_feature.properties?.color ||
    target_feature.properties?.symbol?.strokeColor ||
    target_feature.properties?.strokeColor

  if (polity_color && (!city.capitalColor || city.capitalColor === '#FFDC00' || Array.isArray(city.capitalColor))) {
    city.capitalColor = polity_color
  }

  //Return statement
  return true
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

let circle_atlas_url: string | null = null

let CIRCLE_ICON_MAPPING = {
  circle: {
    height: 128,
    mask: true,
    width: 128,
    x: 0,
    y: 0,
  },
  halo: {
    height: 128,
    mask: true,
    width: 128,
    x: 128,
    y: 0,
  },
}

/**
 * Creates or retrieves a cached base64 PNG data URL containing masked circular textures for city points.
 *
 * @returns {string}
 */
function getCircleAtlasUrl (): string {
  //Guard clauses
  if (typeof document === 'undefined')
    return ''

  if (circle_atlas_url)
    return circle_atlas_url

  //Declare local instance variables
  let c = document.createElement('canvas')
  let ctx: CanvasRenderingContext2D | null

  //Function body
  c.width = 256
  c.height = 128
  ctx = c.getContext('2d')
  if (!ctx)
    return ''

  //1. Filled circular dot at (0, 0)
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(64, 64, 60, 0, Math.PI * 2)
  ctx.fill()

  //2. Halo circular ring at (128, 0)
  ctx.lineWidth = 14
  ctx.strokeStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(192, 64, 54, 0, Math.PI * 2)
  ctx.stroke()

  circle_atlas_url = c.toDataURL('image/png')

  //Return statement
  return circle_atlas_url
}

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
  onSelectCity?: (city: CityPoint) => void
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

      // Equal-area pixel radius scaled by sqrt(population) with guaranteed minimum bubble size for smaller settlements:
      let min_radius = 3.25 * b_scale
      let pop_radius = Math.sqrt(Math.max(0, city.population)) * 0.0115 * b_scale
      let pixel_radius = Math.max(min_radius, Math.min(65.0, min_radius + pop_radius))

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
    projection,
  ])

  //Return statement
  return useMemo(() => {
    //Declare local instance variables
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
        if (feat.properties?.id !== undefined)
          border_features_by_id.set(String(feat.properties.id), feat)
        if (feat.id !== undefined)
          border_features_by_id.set(String(feat.id), feat)
        if (feat.properties?.state_id !== undefined)
          border_features_by_id.set(String(feat.properties.state_id), feat)
        if (feat.properties?.name)
          border_features_by_name.set(feat.properties.name.toLowerCase().trim(), feat)
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
          pickable: true,
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
          pickable: true,
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

    if (countries_mode && hovered_country && !is_hovered_already_selected) {
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
          pickable: true,
          stroked: true,
          filled: true,
          getFillColor: (arg0_d: any) => {
            if (arg0_d.properties?.color) {
              let c = arg0_d.properties.color
              if (Array.isArray(c) && c.length >= 3)
                return [c[0], c[1], c[2], 40]
              if (typeof c === 'string' && c.startsWith('#')) {
                let rgb = hexToRgb(c)
                return [rgb[0], rgb[1], rgb[2], 40]
              }
            }
            return [56, 189, 248, 35]
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
            if (options.onHoverCustomVectorFeature) {
              options.onHoverCustomVectorFeature(arg0_info.object || null, arg0_info.x, arg0_info.y)
            }
          },
          parameters: {
            depthMask: false,
            depthTest: false,
          },
        })
      )
    }

    //8c. Finalized User-Drawn Measurement Polygon
    if (drawn_polygon_feature) {
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
          pickable: true,
          stroked: true,
          filled: true,
          getFillColor: [200, 40, 40, 45],
          getLineColor: [200, 40, 40, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          autoHighlight: true,
          highlightColor: [255, 255, 255, 70],
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          onClick: (arg0_info: any) => {
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
          parameters: {
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
          getRadius: (arg0_d: any) => (arg0_d.idx === 0 ? 8 : 5),
          radiusUnits: 'pixels',
          getFillColor: (arg0_d: any) => (arg0_d.idx === 0 ? [255, 220, 0, 255] : [200, 40, 40, 255]),
          stroked: true,
          getLineColor: [255, 255, 255, 255],
          getLineWidth: 2,
          lineWidthUnits: 'pixels',
          pickable: false,
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

    //Validate capital cities against target border polygon on screen (ONLY for capital cities)
    if (border_features_by_id.size > 0 && effective_points && effective_points.length > 0) {
      effective_points = effective_points.map((arg0_c: any) => {
        if (!arg0_c.isCapital)
          return arg0_c

        let is_valid = isCapitalInsideTargetPolygon(arg0_c, border_features_by_id, border_features_by_name)
        if (!is_valid) {
          return {
            ...arg0_c,
            capitalColor: undefined,
            isCapital: false,
          }
        }
        return arg0_c
      })
    }

    if (options.stadesterConfig?.enabled && effective_points.length > 0) {
      let is_collision_active = (options.stadesterConfig.labelCollision !== undefined) ? options.stadesterConfig.labelCollision : true
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
            sizeMinPixels: is_mobile ? 12.0 : 6.5,
            sizeMaxPixels: 130.0,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            billboard: true,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 100],
            background: false,
            onClick: (info: any) => {
              if (info.object && options.onSelectCity)
                options.onSelectCity(info.object)
              return true
            },
            onHover: (info: any) => {
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
            radiusMinPixels: is_mobile ? 6.5 : 3.25,
            radiusMaxPixels: 65.0,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            billboard: true,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 100],
            onClick: (info: any) => {
              if (info.object && options.onSelectCity)
                options.onSelectCity(info.object)
              return true
            },
            onHover: (info: any) => {
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
                getSize: (d: any) => (d.pixelRadius + 4) * 2,
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
                getRadius: (d: any) => d.pixelRadius + 4,
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

          //Validate capital cities against target border polygon on screen (ONLY for capital cities)
          if (border_features_by_id.size > 0) {
            visible_label_cities = visible_label_cities.map((arg0_c: any) => {
              if (!arg0_c.isCapital)
                return arg0_c

              let is_valid = isCapitalInsideTargetPolygon(arg0_c, border_features_by_id, border_features_by_name)
              if (!is_valid) {
                return {
                  ...arg0_c,
                  capitalColor: undefined,
                  isCapital: false,
                }
              }
              return arg0_c
            })
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
              pickable: true,
              autoHighlight: true,
              highlightColor: [255, 255, 255, 60],
              onClick: (info: any) => {
                if (info.object && options.onSelectCity)
                  options.onSelectCity(info.object)
                return true
              },
              onHover: (info: any) => {
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
    options.onSelectCustomVectorFeature,
    options.onHoverCustomVectorFeature,
    options.onSelectDrawnPolygon,
  ])
}
