import { projectEqualEarth } from '../geopng/equal_earth.ts'
import { SmoothGlobeViewport } from './SmoothGlobeViewport.ts'
import {
  computeViewportBoundingBox,
  getZoomPopulationThreshold,
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
  coords?: [number, number]
  country?: string
  growthRate?: number
  isCapital?: boolean
  key: string
  name: string
  other_names?: string | string[]
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
  country?: string
  isCapital?: boolean
  key: string
  name: string
  other_names?: string | string[]
  pixelRadius: number
  population: number
  position: [number, number, number]
  projection?: string
  rawCoords?: [number, number]
  shortName: string
}

export interface WorkerBinaryAttributes {
  fillColors: Uint8Array
  length: number
  lineColors: Uint8Array
  positions: Float32Array
  radii: Float32Array
}

export type WorkerInMessage =
  | {
      cities: WorkerCityInput[]
      type: 'APPEND_DATA'
      year: number
    }
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
      heuristicCulling?: boolean
      isHalo: boolean
      isMobile?: boolean
      labelCollision: boolean
      largeCityContrast?: number
      opacity?: number
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
      binaryAttributes?: WorkerBinaryAttributes
      labels: WorkerPlacedLabel[]
      points?: WorkerProcessedPoint[]
      pointsChanged: boolean
      reqId: number
      type: 'LAYOUT_RESULT'
    }
  | {
      error: string
      reqId: number
      type: 'LAYOUT_ERROR'
    }

let FINE_COLS = 180
let FINE_ROWS = 90
let FINE_CELLS = 16200
let MACRO_COLS = 36
let MACRO_CELLS = 648

let cached_data_version = -1
let cached_display_opts_key = ''
let cached_point_key = ''
let cached_points: WorkerProcessedPoint[] = []
let cached_pt_by_city_idx: Array<WorkerProcessedPoint | undefined> = []
let cached_sorted_label_candidates: WorkerProcessedPoint[] = []
let cached_sorted_labels_ready = false
let cap_rgba_cache = new Map<string, [number, number, number, number] | undefined>()
let current_cities: WorkerCityInput[] = []
let current_year = 1950
let data_version = 0
let short_name_cache = new WeakMap<WorkerCityInput, string>()
let worker_fine_has_cap = new Uint8Array(FINE_CELLS)
let worker_fine_lens = new Uint32Array(FINE_CELLS)
let worker_fine_max_pop = new Float64Array(FINE_CELLS)
let worker_fine_offs = new Uint32Array(FINE_CELLS)
let worker_grid_indices = new Uint32Array(0)
let worker_lut_cache = new Map<string, Uint8Array>()
let worker_macro_counts = new Uint32Array(MACRO_CELLS)
let worker_macro_has_cap = new Uint8Array(MACRO_CELLS)
let worker_macro_max_pop = new Float64Array(MACRO_CELLS)

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

  let cache_k = `${arg0_hex}|${arg1_alpha}`
  if (cap_rgba_cache.has(cache_k))
    return cap_rgba_cache.get(cache_k)

  let clean = arg0_hex.replace('#', '').trim()
  if (clean.length === 3)
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]

  let parsed: [number, number, number, number] | undefined = undefined
  if (clean.length >= 6) {
    let r = parseInt(clean.substring(0, 2), 16)
    let g = parseInt(clean.substring(2, 4), 16)
    let b = parseInt(clean.substring(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b))
      parsed = [r, g, b, arg1_alpha]
  }

  cap_rgba_cache.set(cache_k, parsed)
  return parsed
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
      let lut = worker_lut_cache.get(palette)
      if (!lut) {
        lut = getPaletteLUT(palette as ColorPalette)
        worker_lut_cache.set(palette, lut)
      }
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

function getCachedShortCityName (
  arg0_city: WorkerCityInput,
  arg1_display_options?: StadesterDisplayOptions
): string {
  //Convert from parameters
  let city = arg0_city
  let display_options = arg1_display_options

  //Declare local instance variables
  let cached = short_name_cache.get(city)

  //Guard clauses
  if (cached !== undefined)
    return cached

  //Function body
  cached = pickBestCityDisplayName(city.name, city.other_names, display_options)
  short_name_cache.set(city, cached)

  //Return statement
  return cached
}

function processViewportLayout (arg0_msg: WorkerInMessage & { type: 'LAYOUT_VIEWPORT' }) {
  //Convert from parameters
  let msg = arg0_msg
  let {
    bubbleSize: b_scale,
    colorMode: color_mode,
    displayOptions: display_options,
    heuristicCulling: is_heuristic_culling = true,
    isHalo: is_halo,
    isMobile: is_mobile,
    labelCollision: is_collision_active,
    largeCityContrast: large_city_contrast,
    opacity: circle_opacity = 0.7,
    projection,
    reqId: req_id,
    showLabels: is_labels_visible,
    viewState: view_state,
    windowH: window_h,
    windowW: window_w,
  } = msg

    try {
      let opts_key = display_options ? JSON.stringify(display_options) : ''
      if (opts_key !== cached_display_opts_key) {
        cached_display_opts_key = opts_key
        short_name_cache = new WeakMap<WorkerCityInput, string>()
      }

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
      let thresholds = getZoomPopulationThreshold(zoom, projection, window_w, window_h, current_year)
      let bbox = computeViewportBoundingBox(view_state, projection, window_w, window_h)
      let [w, s, east_bound, n] = bbox

      let contrast = (large_city_contrast !== undefined) ? large_city_contrast : 1.0
      let zoom_bucket = Math.round(zoom*4)
      let static_point_key = `${data_version}:${color_mode}:${msg.growthPalette}:${b_scale}:${contrast}:${circle_opacity}:${Boolean(is_mobile)}:${projection}:${zoom_bucket}:${opts_key}`
      let points_changed = true
      let processed_points: WorkerProcessedPoint[] = []
      let zoom_factor = Math.max(1.0, Math.min(1.8, 1.0 + (is_cartesian ? (zoom - 2.8)*0.12 : (is_globe ? (zoom - 3.0)*0.08 : (zoom - 1.2)*0.08))))

      if (static_point_key === cached_point_key && cached_data_version === data_version) {
        points_changed = false
        processed_points = cached_points
      } else {
        // 1-3. Build Deck.gl scatterplot points for ALL valid settlements (zero dot capacity culling)
        cached_pt_by_city_idx = new Array(current_cities.length)

        for (let i = 0; i < current_cities.length; i++) {
          let c = current_cities[i]
          if (!c || !c.coords || !Number.isFinite(c.coords[0]) || !Number.isFinite(c.coords[1]))
            continue
          if (c.population === undefined || c.population === null || isNaN(c.population) || c.population < 0.01)
            continue

          let c_lat = c.coords[0]
          let c_lon = c.coords[1]
          let is_cap = Boolean(c.isCapital)

          let fill_color: [number, number, number, number] = [255, 255, 255, 220]
          let px = c_lon
          let py = c_lat

          if (projection === 'EqualEarth') {
            let projected = projectEqualEarth(c_lon, c_lat)
            px = projected[0]
            py = projected[1]
          }

          if (!Number.isFinite(px) || !Number.isFinite(py))
            continue

          let mobile_scale = is_mobile ? 0.70 : 1.0
          let min_radius = (is_mobile ? 2.0 : 3.25)*b_scale*Math.min(1.4, zoom_factor)
          let pop_scaled = Math.pow(Math.max(0, c.population)/100000, 0.5*contrast)*3.6*b_scale*mobile_scale
          let pixel_radius = Math.max(min_radius, Math.min(is_mobile ? 32.0 : 65.0, (min_radius + pop_scaled)*zoom_factor))

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
            coords: [c_lat, c_lon],
            country: c.country,
            growthRate: c.growthRate,
            isCapital: is_cap,
            key: c.key,
            name: c.name,
            other_names: c.other_names,
            pixelRadius: pixel_radius,
            population: c.population,
            position: [px, py, 0],
            projection: projection,
            rawCoords: [c_lon, c_lat],
            region: c.region,
            shortName: getCachedShortCityName(c, display_options),
          }

          cached_pt_by_city_idx[i] = pt
          processed_points.push(pt)
        }

        //Sort points ascending so smaller cities are drawn first and larger cities render in front
        processed_points.sort((arg0_a, arg0_b) => {
          let a_pop = (arg0_a.population !== undefined && !isNaN(arg0_a.population)) ? arg0_a.population : 0
          let b_pop = (arg0_b.population !== undefined && !isNaN(arg0_b.population)) ? arg0_b.population : 0
          if (a_pop !== b_pop)
            return a_pop - b_pop

          let a_rad = (arg0_a.pixelRadius !== undefined && !isNaN(arg0_a.pixelRadius)) ? arg0_a.pixelRadius : 0
          let b_rad = (arg0_b.pixelRadius !== undefined && !isNaN(arg0_b.pixelRadius)) ? arg0_b.pixelRadius : 0
          return a_rad - b_rad
        })

        cached_data_version = data_version
        cached_point_key = static_point_key
        cached_points = processed_points
        cached_sorted_label_candidates = []
        cached_sorted_labels_ready = false
      }

      // 4. Hierarchical 2-level spatial pruning + heuristic culling + O(1) collision grid for city labels only
      let placed_labels: WorkerPlacedLabel[] = []

      if (is_labels_visible && processed_points.length > 0) {
        let active_label_candidates: WorkerProcessedPoint[]
        let apply_pop_floor = false
        let lat_span = n - s
        let lon_span = (w <= east_bound) ? (east_bound - w) : ((180 - w) + (east_bound + 180))
        let use_spatial_labels = (!is_globe && current_cities.length > 1000 && worker_grid_indices.length > 0 && (lon_span < 180 || lat_span < 120))

        if (use_spatial_labels) {
          let intersecting_macro_cities = 0
          let lon_ranges: Array<[number, number]> = (w <= east_bound)
            ? [[Math.max(0, Math.min(FINE_COLS - 1, Math.floor((w + 180)/2))), Math.max(0, Math.min(FINE_COLS - 1, Math.floor((east_bound + 180)/2)))]]
            : [[Math.max(0, Math.min(FINE_COLS - 1, Math.floor((w + 180)/2))), FINE_COLS - 1], [0, Math.max(0, Math.min(FINE_COLS - 1, Math.floor((east_bound + 180)/2)))]]
          let min_cy = Math.max(0, Math.min(FINE_ROWS - 1, Math.floor((s + 90)/2)))
          let max_cy = Math.max(0, Math.min(FINE_ROWS - 1, Math.floor((n + 90)/2)))
          let min_my = Math.floor(min_cy/5)
          let max_my = Math.floor(max_cy/5)

          for (let my = min_my; my <= max_my; my++) {
            for (let r = 0; r < lon_ranges.length; r++) {
              let min_mx = Math.floor(lon_ranges[r][0]/5)
              let max_mx = Math.floor(lon_ranges[r][1]/5)
              for (let mx = min_mx; mx <= max_mx; mx++)
                intersecting_macro_cities += worker_macro_counts[my*MACRO_COLS + mx]
            }
          }

          active_label_candidates = []
          apply_pop_floor = Boolean(is_heuristic_culling && intersecting_macro_cities > thresholds.maxLabels && thresholds.labelMinPop > 1)

          for (let my = min_my; my <= max_my; my++) {
            let fy_start = Math.max(min_cy, my*5)
            let fy_end = Math.min(max_cy, my*5 + 4)

            for (let r = 0; r < lon_ranges.length; r++) {
              let r_cx_min = lon_ranges[r][0]
              let r_cx_max = lon_ranges[r][1]
              let min_mx = Math.floor(r_cx_min/5)
              let max_mx = Math.floor(r_cx_max/5)

              for (let mx = min_mx; mx <= max_mx; mx++) {
                let mid = my*MACRO_COLS + mx
                if (worker_macro_counts[mid] === 0)
                  continue
                if (apply_pop_floor && worker_macro_has_cap[mid] === 0 && worker_macro_max_pop[mid] < thresholds.labelMinPop)
                  continue

                let fx_start = Math.max(r_cx_min, mx*5)
                let fx_end = Math.min(r_cx_max, mx*5 + 4)

                for (let cy = fy_start; cy <= fy_end; cy++) {
                  for (let cx = fx_start; cx <= fx_end; cx++) {
                    let fid = cy*FINE_COLS + cx
                    let f_len = worker_fine_lens[fid]
                    if (f_len === 0)
                      continue
                    if (apply_pop_floor && worker_fine_has_cap[fid] === 0 && worker_fine_max_pop[fid] < thresholds.labelMinPop)
                      continue

                    let f_off = worker_fine_offs[fid]
                    for (let k = 0; k < f_len; k++) {
                      let pt = cached_pt_by_city_idx[worker_grid_indices[f_off + k]]
                      if (!pt)
                        continue
                      //Fine cell buckets store capitals first then descending population
                      if (apply_pop_floor && !pt.isCapital && pt.population < thresholds.labelMinPop)
                        break

                      let c_lat = pt.coords ? pt.coords[0] : pt.position[1]
                      let c_lon = pt.coords ? pt.coords[1] : pt.position[0]
                      if (w <= east_bound) {
                        if (c_lon < w || c_lon > east_bound || c_lat < s || c_lat > n)
                          continue
                      } else {
                        if ((c_lon < w && c_lon > east_bound) || c_lat < s || c_lat > n)
                          continue
                      }

                      active_label_candidates.push(pt)
                    }
                  }
                }
              }
            }
          }

          active_label_candidates.sort((arg0_a, arg0_b) => {
            if (arg0_a.isCapital && !arg0_b.isCapital)
              return -1
            if (!arg0_a.isCapital && arg0_b.isCapital)
              return 1
            return arg0_b.population - arg0_a.population
          })
        } else {
          if (!cached_sorted_labels_ready) {
            cached_sorted_label_candidates = [...processed_points].sort((arg0_a, arg0_b) => {
              if (arg0_a.isCapital && !arg0_b.isCapital)
                return -1
              if (!arg0_a.isCapital && arg0_b.isCapital)
                return 1
              return arg0_b.population - arg0_a.population
            })
            cached_sorted_labels_ready = true
          }
          active_label_candidates = cached_sorted_label_candidates
          apply_pop_floor = Boolean(is_heuristic_culling && active_label_candidates.length > thresholds.maxLabels && thresholds.labelMinPop > 1)
        }

        let max_candidates = is_heuristic_culling
          ? Math.min(active_label_candidates.length, thresholds.maxLabelCandidates)
          : active_label_candidates.length

        let cell_h = 32
        let cell_w = 72
        let collision_grid = new Map<number, number[]>()
        let placed_boxes: Array<[number, number, number, number]> = []
        let scale = Math.pow(2, zoom)
        let scanned = 0

        for (let i = 0; i < active_label_candidates.length && scanned < max_candidates; i++) {
          let cand = active_label_candidates[i]

          if (!use_spatial_labels) {
            let c_lat = cand.coords ? cand.coords[0] : cand.position[1]
            let c_lon = cand.coords ? cand.coords[1] : cand.position[0]

            if (!is_globe) {
              if (w <= east_bound) {
                if (c_lon < w || c_lon > east_bound || c_lat < s || c_lat > n)
                  continue
              } else {
                if ((c_lon < w && c_lon > east_bound) || c_lat < s || c_lat > n)
                  continue
              }
            }

            if (apply_pop_floor && !cand.isCapital && cand.population < thresholds.labelMinPop)
              continue
          }

          scanned++

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

          let font_size = Math.max(10, Math.min(15, 9 + Math.log10(Math.max(1000, cand.population || 1000))*0.9))
          let text_w = label_text.length*(font_size*0.58) + 12
          let text_h = font_size + 4
          let r = cand.pixelRadius

          let box_x1 = sx + r + 4
          let box_y1 = sy - text_h / 2
          let box_x2 = box_x1 + text_w
          let box_y2 = box_y1 + text_h

          let gx1 = Math.floor((box_x1 - 4) / cell_w)
          let gx2 = Math.floor((box_x2 + 4) / cell_w)
          let gy1 = Math.floor((box_y1 - 2) / cell_h)
          let gy2 = Math.floor((box_y2 + 2) / cell_h)

          if (is_collision_active) {
            let collides = false
            for (let gx = gx1; gx <= gx2 && !collides; gx++) {
              for (let gy = gy1; gy <= gy2 && !collides; gy++) {
                let cell_key = ((gx + 512) << 12) | ((gy + 512) & 0xFFF)
                let cell_boxes = collision_grid.get(cell_key)
                if (!cell_boxes)
                  continue
                for (let b = 0; b < cell_boxes.length; b++) {
                  let pb = placed_boxes[cell_boxes[b]]
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
              }
            }
            if (collides)
              continue
          }

          let box_idx = placed_boxes.length
          placed_boxes.push([box_x1, box_y1, box_x2, box_y2])
          for (let gx = gx1; gx <= gx2; gx++) {
            for (let gy = gy1; gy <= gy2; gy++) {
              let cell_key = ((gx + 512) << 12) | ((gy + 512) & 0xFFF)
              let bucket = collision_grid.get(cell_key)
              if (!bucket) {
                bucket = []
                collision_grid.set(cell_key, bucket)
              }
              bucket.push(box_idx)
            }
          }

          placed_labels.push({
            capitalColor: cand.capitalColor,
            capitalOf: cand.capitalOf,
            capitalStateId: cand.capitalStateId,
            country: cand.country,
            isCapital: cand.isCapital,
            key: cand.key,
            name: cand.name,
            other_names: cand.other_names,
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

      //Sort placed labels ascending so smaller city labels render first and larger city labels render in front
      placed_labels.sort((arg0_a, arg0_b) => {
        let a_pop = (arg0_a.population !== undefined && !isNaN(arg0_a.population)) ? arg0_a.population : 0
        let b_pop = (arg0_b.population !== undefined && !isNaN(arg0_b.population)) ? arg0_b.population : 0
        return a_pop - b_pop
      })

      if (!points_changed) {
        self.postMessage({
          labels: placed_labels,
          pointsChanged: false,
          reqId: req_id,
          type: 'LAYOUT_RESULT',
        } as WorkerOutMessage)
        return
      }

      //Pack zero-copy TypedArray attributes for direct GPU upload in ScatterplotLayer
      let p_len = processed_points.length
      let bin_positions = new Float32Array(p_len * 3)
      let bin_radii = new Float32Array(p_len)
      let bin_fill_colors = new Uint8Array(p_len * 4)
      let bin_line_colors = new Uint8Array(p_len * 4)
      let fill_alpha = Math.round(255 * circle_opacity)
      let stroke_alpha = Math.min(255, Math.round(255 * Math.min(1.0, circle_opacity * 1.25)))

      for (let i = 0; i < p_len; i++) {
        let pt = processed_points[i]
        bin_positions[i * 3] = pt.position[0]
        bin_positions[i * 3 + 1] = pt.position[1]
        bin_positions[i * 3 + 2] = pt.position[2]
        bin_radii[i] = pt.pixelRadius
        bin_fill_colors[i * 4] = pt.color[0]
        bin_fill_colors[i * 4 + 1] = pt.color[1]
        bin_fill_colors[i * 4 + 2] = pt.color[2]
        bin_fill_colors[i * 4 + 3] = fill_alpha
        bin_line_colors[i * 4] = pt.color[0]
        bin_line_colors[i * 4 + 1] = pt.color[1]
        bin_line_colors[i * 4 + 2] = pt.color[2]
        bin_line_colors[i * 4 + 3] = stroke_alpha
      }

      self.postMessage(
        {
          binaryAttributes: {
            fillColors: bin_fill_colors,
            length: p_len,
            lineColors: bin_line_colors,
            positions: bin_positions,
            radii: bin_radii,
          },
          labels: placed_labels,
          points: processed_points,
          pointsChanged: true,
          reqId: req_id,
          type: 'LAYOUT_RESULT',
        } as WorkerOutMessage,
        {
          transfer: [
            bin_positions.buffer,
            bin_radii.buffer,
            bin_fill_colors.buffer,
            bin_line_colors.buffer,
          ],
        }
      )
    } catch (arg0_err) {
      self.postMessage({
        error: arg0_err instanceof Error ? arg0_err.message : String(arg0_err),
        reqId: req_id,
        type: 'LAYOUT_ERROR',
      } as WorkerOutMessage)
    }
}

/**
 * Rebuilds the dense 2-level spatial index (10°x10° macro blocks and 2°x2° fine cells) over `current_cities`.
 */
function rebuildWorkerSpatialGrid (): void {
  //Declare local instance variables
  let cursors = new Uint32Array(FINE_CELLS)
  let n_cities = current_cities.length
  let running_offset = 0
  let valid_count = 0

  //Function body
  worker_fine_has_cap.fill(0)
  worker_fine_lens.fill(0)
  worker_fine_max_pop.fill(0)
  worker_fine_offs.fill(0)
  worker_macro_counts.fill(0)
  worker_macro_has_cap.fill(0)
  worker_macro_max_pop.fill(0)

  if (n_cities === 0) {
    worker_grid_indices = new Uint32Array(0)
    return
  }

  for (let i = 0; i < n_cities; i++) {
    let c = current_cities[i]
    if (!c || !c.coords || !Number.isFinite(c.coords[0]) || !Number.isFinite(c.coords[1]))
      continue
    if (c.population === undefined || c.population === null || isNaN(c.population) || c.population < 0.01)
      continue

    let cx = Math.max(0, Math.min(FINE_COLS - 1, Math.floor((c.coords[1] + 180)/2)))
    let cy = Math.max(0, Math.min(FINE_ROWS - 1, Math.floor((c.coords[0] + 90)/2)))
    let fid = cy*FINE_COLS + cx
    let mid = Math.floor(cy/5)*MACRO_COLS + Math.floor(cx/5)

    worker_fine_lens[fid]++
    worker_macro_counts[mid]++
    valid_count++

    if (c.population > worker_fine_max_pop[fid])
      worker_fine_max_pop[fid] = c.population
    if (c.population > worker_macro_max_pop[mid])
      worker_macro_max_pop[mid] = c.population
    if (c.isCapital) {
      worker_fine_has_cap[fid] = 1
      worker_macro_has_cap[mid] = 1
    }
  }

  for (let i = 0; i < FINE_CELLS; i++) {
    worker_fine_offs[i] = running_offset
    cursors[i] = running_offset
    running_offset += worker_fine_lens[i]
  }

  worker_grid_indices = new Uint32Array(valid_count)

  for (let i = 0; i < n_cities; i++) {
    let c = current_cities[i]
    if (!c || !c.coords || !Number.isFinite(c.coords[0]) || !Number.isFinite(c.coords[1]))
      continue
    if (c.population === undefined || c.population === null || isNaN(c.population) || c.population < 0.01)
      continue

    let cx = Math.max(0, Math.min(FINE_COLS - 1, Math.floor((c.coords[1] + 180)/2)))
    let cy = Math.max(0, Math.min(FINE_ROWS - 1, Math.floor((c.coords[0] + 90)/2)))
    let fid = cy*FINE_COLS + cx

    worker_grid_indices[cursors[fid]++] = i
  }

  //Ensure every fine cell with capitals orders capitals before non-capitals while keeping descending population
  for (let i = 0; i < FINE_CELLS; i++) {
    let f_len = worker_fine_lens[i]
    if (f_len <= 1 || worker_fine_has_cap[i] === 0)
      continue

    let f_off = worker_fine_offs[i]
    let bucket = worker_grid_indices.subarray(f_off, f_off + f_len)
    bucket.sort((arg0_a, arg0_b) => {
      let a_city = current_cities[arg0_a]
      let b_city = current_cities[arg0_b]
      let a_cap = a_city.isCapital ? 1 : 0
      let b_cap = b_city.isCapital ? 1 : 0
      if (a_cap !== b_cap)
        return b_cap - a_cap

      return (b_city.population || 0) - (a_city.population || 0)
    })
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
    let cities_arr = Array.isArray(msg.cities) ? [...msg.cities] : []
    cities_arr.sort((arg0_a, arg0_b) => (arg0_b.population || 0) - (arg0_a.population || 0))
    current_cities = cities_arr
    current_year = msg.year
    data_version++
    cached_data_version = -1
    cached_point_key = ''
    cached_points = []
    cached_pt_by_city_idx = []
    cached_sorted_label_candidates = []
    cached_sorted_labels_ready = false
    short_name_cache = new WeakMap<WorkerCityInput, string>()
    cap_rgba_cache.clear()
    rebuildWorkerSpatialGrid()
    return
  }

  if (msg.type === 'APPEND_DATA') {
    if (msg.year !== current_year)
      return

    let delta_arr = Array.isArray(msg.cities) ? msg.cities : []
    if (delta_arr.length === 0)
      return

    for (let i = 0; i < delta_arr.length; i++)
      current_cities.push(delta_arr[i])

    current_cities.sort((arg0_a, arg0_b) => (arg0_b.population || 0) - (arg0_a.population || 0))
    data_version++
    cached_data_version = -1
    cached_point_key = ''
    cached_points = []
    cached_pt_by_city_idx = []
    cached_sorted_label_candidates = []
    cached_sorted_labels_ready = false
    rebuildWorkerSpatialGrid()
    return
  }

  if (msg.type === 'LAYOUT_VIEWPORT') {
    processViewportLayout(msg)
  }
}
