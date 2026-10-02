import { projectEqualEarth } from '../geopng/equal_earth'
import { SmoothGlobeViewport } from './SmoothGlobeViewport'
import {
  computeViewportBoundingBox,
  getZoomPopulationThreshold,
  getEraDisplayFloor,
  isGlobePointVisible,
  projectGlobeCoordinates,
  projectMercatorCoordinates,
} from './stadester_heuristics.ts'

export interface WorkerCityInput {
  area?: number
  colour?: [number, number, number]
  coords: [number, number] // [lat, lon]
  country?: string
  density?: number
  growthRate?: number
  id: number | string
  isCapital?: boolean
  capitalColor?: [number, number, number, number] | string
  capitalOf?: string
  capitalStateId?: number | string
  capital_state_name?: string
  key: string
  name: string
  other_names?: string | string[]
  population: number
  region?: string
}

export interface WorkerProcessedPoint {
  capitalColor?: [number, number, number, number]
  capitalOf?: string
  capitalStateId?: number | string
  color: [number, number, number, number]
  country?: string
  growthRate?: number
  isCapital?: boolean
  key: string
  name: string
  pixelRadius: number
  population: number
  position: [number, number, number]
  projection?: string
  rawCoords?: [number, number]
  region?: string
  shortName: string
}

export interface WorkerPlacedLabel {
  capitalColor?: [number, number, number, number]
  capitalOf?: string
  capitalStateId?: number | string
  isCapital?: boolean
  key: string
  name: string
  pixelRadius: number
  population: number
  position: [number, number, number]
  projection?: string
  rawCoords?: [number, number]
  shortName: string
}

export type WorkerInMessage =
  | {
      cities: WorkerCityInput[]
      type: 'SET_DATA'
      year: number
    }
  | {
      bubbleSize: number
      colorMode: 'growth' | 'population' | 'region' | 'continent'
      displayOptions?: StadesterDisplayOptions
      growthPalette: string
      isHalo: boolean
      labelCollision: boolean
      largeCityContrast?: number
      projection: string
      reqId: number
      showLabels: boolean
      type: 'LAYOUT_VIEWPORT'
      viewState: any
      windowH: number
      windowW: number
    }

export type WorkerOutMessage =
  | {
      labels: WorkerPlacedLabel[]
      points: WorkerProcessedPoint[]
      reqId: number
      type: 'LAYOUT_RESULT'
    }
  | {
      error: string
      reqId: number
      type: 'LAYOUT_ERROR'
    }

let current_cities: WorkerCityInput[] = []
let current_year = 1950

let parseHexColorToRgba = function (
  arg0_hex?: string | [number, number, number, number],
  arg1_alpha = 255
): [number, number, number, number] | undefined {
  if (!arg0_hex)
    return undefined
  if (Array.isArray(arg0_hex))
    return arg0_hex
  if (typeof arg0_hex !== 'string')
    return undefined

  let clean = arg0_hex.replace('#', '').trim()
  if (clean.length === 3)
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]

  if (clean.length >= 6) {
    let r = parseInt(clean.substring(0, 2), 16)
    let g = parseInt(clean.substring(2, 4), 16)
    let b = parseInt(clean.substring(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b))
      return [r, g, b, arg1_alpha]
  }

  return undefined
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

let REGION_COLOR_MAP: Record<string, [number, number, number]> = {
  africa: [249, 115, 22],
  central_asia: [168, 85, 247],
  eastasia: [239, 68, 68],
  eastern_europe_and_russia: [59, 130, 246],
  europe: [99, 102, 241],
  indian_subcontinent: [236, 72, 153],
  latin_america: [16, 185, 129],
  maghreb_egypt: [234, 179, 8],
  middle_east: [217, 119, 6],
  northern_america: [14, 165, 233],
  oceania: [20, 184, 166],
  south_asia: [236, 72, 153],
  southeast_asia: [139, 92, 246],
  sub_saharan_africa: [249, 115, 22],
}

function resolveRegionColorRgb (arg0_region?: string, arg1_coords?: [number, number]): [number, number, number] {
  //Convert from parameters
  let coords = arg1_coords
  let reg = (arg0_region || '').toLowerCase().trim()

  //Guard clauses
  if (reg && REGION_COLOR_MAP[reg])
    return REGION_COLOR_MAP[reg]

  if (coords && Array.isArray(coords) && coords.length >= 2) {
    let lat = coords[0]
    let lon = coords[1]

    if (lat < -10 && lon > 110)
      return REGION_COLOR_MAP.oceania
    if (lat > 18 && lon >= 98 && lon <= 150)
      return REGION_COLOR_MAP.eastasia
    if (lat > 0 && lat <= 25 && lon >= 90 && lon < 150)
      return REGION_COLOR_MAP.southeast_asia
    if (lat > 5 && lat < 38 && lon > 60 && lon < 90)
      return REGION_COLOR_MAP.indian_subcontinent
    if (lat > 40 && lon >= 30 && lon <= 180)
      return REGION_COLOR_MAP.eastern_europe_and_russia
    if (lat > 35 && lat < 72 && lon > -15 && lon < 30)
      return REGION_COLOR_MAP.europe
    if (lat > 15 && lat <= 36 && lon > 25 && lon < 60)
      return REGION_COLOR_MAP.middle_east
    if (lat > 20 && lat <= 37 && lon > -18 && lon < 35)
      return REGION_COLOR_MAP.maghreb_egypt
    if (lat <= 20 && lon > -20 && lon < 55)
      return REGION_COLOR_MAP.sub_saharan_africa
    if (lat > 15 && lon > -170 && lon < -50)
      return REGION_COLOR_MAP.northern_america
    if (lat <= 15 && lon > -120 && lon < -30)
      return REGION_COLOR_MAP.latin_america
  }

  //Return statement
  return [239, 68, 68]
}

import { getPaletteLUT } from '../geopng/palettes'
import { ColorPalette, StadesterDisplayOptions } from '@framework/geopng/types.ts'
import { pickBestCityDisplayName } from './stadester_utils.ts'

function getGrowthRgb (arg0_rate: number, arg1_palette?: string): [number, number, number] {
  //Convert from parameters
  let palette = (arg1_palette) ? arg1_palette : 'Rainbow'
  let r = arg0_rate

  if (palette !== 'Rainbow') {
    try {
      let lut = getPaletteLUT(palette as ColorPalette)
      let norm_t = Math.max(0, Math.min(1, (r - (-0.05)) / (0.08 - (-0.05))))
      let lut_idx = Math.min(255, Math.max(0, Math.round(norm_t * 255)))
      return [lut[lut_idx * 3], lut[lut_idx * 3 + 1], lut[lut_idx * 3 + 2]]
    } catch (_err) {
      //Fallback to rainbow
    }
  }

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
      return [
        Math.round(c_lo[0] + t * (c_hi[0] - c_lo[0])),
        Math.round(c_lo[1] + t * (c_hi[1] - c_lo[1])),
        Math.round(c_lo[2] + t * (c_hi[2] - c_lo[2])),
      ]
    }
  }

  return RAINBOW_GROWTH_STOPS[4][1]
}

function getPopRgb (arg0_pop: number): [number, number, number] {
  let p = Math.max(1, arg0_pop)
  let t = Math.max(0, Math.min(1, (Math.log10(p) - 3.7) / 3.6))
  let r = Math.round(Math.min(255, 13 + t * 240))
  let g = Math.round(Math.min(255, 8 + t * 210))
  let b = Math.round(Math.max(0, 135 - t * 100))
  return [r, g, b]
}

function getShortCityLabel (arg0_name: string): string {
  if (!arg0_name)
    return ''
  let primary_name = arg0_name.split(';')[0].trim()
  return primary_name
}

let latest_viewport_msg: (WorkerInMessage & { type: 'LAYOUT_VIEWPORT' }) | null = null

function processViewportLayout (arg0_msg: WorkerInMessage & { type: 'LAYOUT_VIEWPORT' }) {
  //Convert from parameters
  let msg = arg0_msg
  let {
    bubbleSize: b_scale,
    colorMode: color_mode,
    displayOptions: display_options,
    isHalo: is_halo,
    labelCollision: is_collision_active,
    largeCityContrast: large_city_contrast,
    projection,
    reqId: req_id,
    showLabels: is_labels_visible,
    viewState: view_state,
    windowH: window_h,
    windowW: window_w,
  } = msg

    try {
      let is_cartesian = (projection === 'EqualEarth' || projection === 'Equirectangular')
      let is_globe = (projection === 'Globe')
      let zoom = view_state?.zoom ?? ((is_globe) ? 3 : 1.2)
      let globe_viewport = (is_globe)
        ? new SmoothGlobeViewport({
            bearing: view_state?.bearing ?? 0,
            height: window_h,
            latitude: view_state?.latitude ?? 20,
            longitude: view_state?.longitude ?? 0,
            pitch: view_state?.pitch ?? 0,
            width: window_w,
            zoom,
          })
        : null
      let thresholds = getZoomPopulationThreshold(zoom, projection)
      let era_floor = getEraDisplayFloor(current_year)
      let norm_zoom = (is_cartesian) ? (zoom - 1.2) : ((is_globe) ? (zoom - 1.65) : zoom)
      let effective_min_pop = 0.01
      let bbox = computeViewportBoundingBox(view_state, projection, window_w, window_h)
      let [w, s, east_bound, n] = bbox

      let processed_points: WorkerProcessedPoint[] = []
      let label_candidates: WorkerProcessedPoint[] = []
      let contrast = (large_city_contrast !== undefined) ? large_city_contrast : 1.0
      let zoom_factor = Math.max(1.0, Math.min(1.8, 1.0 + (is_cartesian ? (zoom - 2.8) * 0.12 : (is_globe ? (zoom - 3.0) * 0.08 : (zoom - 1.2) * 0.08))))

      for (let i = 0; i < current_cities.length; i++) {
        let c = current_cities[i]
        if (!c || !c.coords || !Number.isFinite(c.coords[0]) || !Number.isFinite(c.coords[1]))
          continue

        let c_lat = c.coords[0]
        let c_lon = c.coords[1]

        //1. Globe horizon culling (eliminates antipodal cities completely)
        if (is_globe) {
          if (!isGlobePointVisible(c_lon, c_lat, view_state, -0.005, globe_viewport))
            continue
        }

        //2. Viewport bounding box culling (Mercator and Cartesian 2D planes)
        if (!is_globe) {
          if (w <= east_bound) {
            if (c_lon < w || c_lon > east_bound || c_lat < s || c_lat > n)
              continue
          } else {
            //Wraparound dateline
            if ((c_lon < w && c_lon > east_bound) || c_lat < s || c_lat > n)
              continue
          }
        }

        if (c.population === undefined || c.population === null || isNaN(c.population) || c.population < 0.01)
          continue

        let fill_color: [number, number, number, number] = [255, 255, 255, 220]
        let px = c_lon
        let py = c_lat

        if (projection === 'EqualEarth') {
          let projected = projectEqualEarth(c_lon, c_lat)
          px = projected[0]
          py = projected[1]
        }

        // Validate finite coordinates
        if (!Number.isFinite(px) || !Number.isFinite(py))
          continue

        let min_radius = 3.25 * b_scale * Math.min(1.4, zoom_factor)
        let pop_scaled = Math.pow(Math.max(0, c.population) / 100000, 0.5 * contrast) * 3.6 * b_scale
        let pixel_radius = Math.max(min_radius, Math.min(65.0, (min_radius + pop_scaled) * zoom_factor))

        if (color_mode === 'growth') {
          let g_rate = (c.growthRate !== undefined) ? c.growthRate : 0
          let g_rgb = getGrowthRgb(g_rate, msg.growthPalette)
          fill_color = [g_rgb[0], g_rgb[1], g_rgb[2], 220]
        } else if (color_mode === 'population') {
          let p_rgb = getPopRgb(c.population)
          fill_color = [p_rgb[0], p_rgb[1], p_rgb[2], 220]
        } else if (color_mode === 'region' || color_mode === 'continent') {
          let reg_rgb = resolveRegionColorRgb(c.region, [c_lat, c_lon])
          fill_color = [reg_rgb[0], reg_rgb[1], reg_rgb[2], 220]
        }

        let resolved_cap_color = parseHexColorToRgba(c.capitalColor)

        let pt: WorkerProcessedPoint = {
          capitalColor: resolved_cap_color,
          capitalOf: c.capitalOf || c.capital_state_name,
          capitalStateId: c.capitalStateId,
          color: fill_color,
          country: c.country,
          growthRate: c.growthRate,
          isCapital: Boolean(c.isCapital),
          key: c.key,
          name: c.name,
          pixelRadius: pixel_radius,
          population: c.population,
          position: [px, py, 0],
          projection: projection,
          rawCoords: [c_lon, c_lat],
          region: c.region,
          shortName: pickBestCityDisplayName(c.name, c.other_names, display_options),
        }

        processed_points.push(pt)
        label_candidates.push(pt)

        if (processed_points.length >= thresholds.maxBubbles)
          break
      }

      //Place labels
      let placed_labels: WorkerPlacedLabel[] = []

      if (is_labels_visible && label_candidates.length > 0) {
        label_candidates.sort((arg0_a, arg0_b) => {
          if (arg0_a.isCapital && !arg0_b.isCapital)
            return -1
          if (!arg0_a.isCapital && arg0_b.isCapital)
            return 1
          return arg0_b.population - arg0_a.population
        })

        let placed_boxes: Array<[number, number, number, number]> = []
        let scale = Math.pow(2, zoom)

        for (let i = 0; i < label_candidates.length; i++) {
          let cand = label_candidates[i]
          let sx: number
          let sy: number

          if (projection === 'Globe') {
            let proj = projectGlobeCoordinates(cand.position[0], cand.position[1], view_state, window_w, window_h, globe_viewport)
            if (!proj.is_visible)
              continue

            sx = proj.sx
            sy = proj.sy
          } else if (is_cartesian) {
            let target = view_state?.target || [0, 0, 0]
            sx = window_w / 2 + (cand.position[0] - target[0]) * scale
            sy = window_h / 2 - (cand.position[1] - target[1]) * scale
          } else {
            let proj = projectMercatorCoordinates(cand.position[0], cand.position[1], view_state, window_w, window_h)
            if (!proj.is_visible)
              continue

            sx = proj.sx
            sy = proj.sy
          }

          if (sx < -80 || sx > window_w + 80 || sy < -40 || sy > window_h + 40)
            continue

          let label_text = cand.shortName
          if (!label_text)
            continue

          let text_w = label_text.length * 7.2 + 12
          let text_h = 16
          let r = cand.pixelRadius

          let box_x1 = sx + r + 4
          let box_y1 = sy - text_h / 2
          let box_x2 = box_x1 + text_w
          let box_y2 = box_y1 + text_h

          if (is_collision_active) {
            let collides = false
            for (let b = 0; b < placed_boxes.length; b++) {
              let pb = placed_boxes[b]
              if (
                box_x1 < pb[2] + 4 &&
                box_x2 > pb[0] - 4 &&
                box_y1 < pb[3] + 2 &&
                box_y2 > pb[1] - 2
              ) {
                collides = true
                break
              }
            }
            if (collides)
              continue
          }

          placed_boxes.push([box_x1, box_y1, box_x2, box_y2])
          placed_labels.push({
            capitalColor: cand.capitalColor,
            capitalOf: cand.capitalOf,
            capitalStateId: cand.capitalStateId,
            isCapital: cand.isCapital,
            key: cand.key,
            name: cand.name,
            pixelRadius: cand.pixelRadius,
            population: cand.population,
            position: cand.position,
            projection: projection,
            rawCoords: cand.rawCoords,
            shortName: cand.shortName,
          })

          if (placed_labels.length >= thresholds.maxLabels)
            break
        }
      }

      self.postMessage({
        labels: placed_labels,
        points: processed_points,
        reqId: req_id,
        type: 'LAYOUT_RESULT',
      } as WorkerOutMessage)
    } catch (arg0_err) {
      self.postMessage({
        error: arg0_err instanceof Error ? arg0_err.message : String(arg0_err),
        reqId: req_id,
        type: 'LAYOUT_ERROR',
      } as WorkerOutMessage)
    }
}

self.onmessage = function (arg0_e: MessageEvent<WorkerInMessage>) {
  //Convert from parameters
  let e = arg0_e

  //Declare local instance variables
  let msg = e.data

  //Guard clauses
  if (!msg)
    return

  //Function body
  if (msg.type === 'SET_DATA') {
    current_cities = Array.isArray(msg.cities) ? msg.cities : []
    current_year = msg.year
    if (latest_viewport_msg)
      processViewportLayout(latest_viewport_msg)
    return
  }

  if (msg.type === 'LAYOUT_VIEWPORT') {
    latest_viewport_msg = msg
    processViewportLayout(msg)
  }
}
