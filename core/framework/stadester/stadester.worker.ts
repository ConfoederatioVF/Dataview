import { StadesterDisplayOptions } from '@framework/geopng/types.ts'
import { projectEqualEarth } from '../geopng/equal_earth.ts'
import {
  buildAuthoritativeCapitalsByCity,
  reconcileCitiesWithAuthoritativeBorders,
} from '../../ui/map/deck_capital_reconciliation.ts'
import { SmoothGlobeViewport } from './SmoothGlobeViewport.ts'
import { getGrowthRgb, getPopRgb, resolveRegionColorRgb } from './stadester_colours.ts'
import {
  computeViewportBoundingBox,
  getZoomPopulationThreshold,
  projectGlobeCoordinates,
  projectMercatorCoordinates,
} from './stadester_heuristics.ts'
import { pickBestCityDisplayName } from './stadester_utils.ts'
import {
  buildBorderLookup,
  buildCappedViewportCities,
  decodeBinaryCitiesWire,
  isGeoBBoxContained,
  scaleGeoBBox,
  type BorderLookup,
  type CompactBorderFeature,
} from './stadester_wire_decoder.ts'

export interface WorkerCityInput {
  area?: number
  capitalColor?: [number, number, number, number] | string
  capitalOf?: string
  capitalStateId?: number | string
  capital_color?: [number, number, number, number] | string
  capital_state_id?: number | string
  capital_state_name?: string
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: number
  growthRate?: number
  id: number | string
  isCapital?: boolean
  is_capital?: boolean
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
  rawCapitalColor?: string
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

export interface WorkerPickTable {
  capitalColors: (string | null)[]
  capitalOfs: (string | null)[]
  capitalStateIds: Int32Array
  countries: (string | null)[]
  growthRates: Float32Array
  isCapitals: Uint8Array
  keys: string[]
  lats: Float32Array
  lons: Float32Array
  names: string[]
  populations: Float32Array
  regions: (string | null)[]
}

export type WorkerInMessage =
  | {
      cities: WorkerCityInput[]
      type: 'APPEND_DATA'
      year: number
    }
  | {
      restoreBase: boolean
      type: 'CANCEL_VIEWPORT'
    }
  | {
      features: CompactBorderFeature[]
      type: 'SET_BORDERS_CONTEXT'
      year: number
    }
  | {
      cities: WorkerCityInput[]
      type: 'SET_DATA'
      year: number
    }
  | {
      bbox: [number, number, number, number]
      coalesceMs?: number
      colorMode: string
      dataset: string
      day?: number
      maxCities: number
      minPop: number
      month?: number
      normZoom: number
      streamId: number
      streamMinCitiesThreshold?: number
      type: 'STREAM_VIEWPORT'
      year: number
    }
  | {
      bubbleSize: number
      colorMode: 'growth' | 'population' | 'region' | 'continent'
      displayOptions?: StadesterDisplayOptions
      growthPalette: string
      heuristicCulling?: boolean
      includePointsArray?: boolean
      isHalo: boolean
      isMobile?: boolean
      labelCollision: boolean
      largeCityContrast?: number
      opacity?: number
      populationPalette?: string
      projection: string
      regionPalette?: string
      reqId: number
      selectedCityKey?: string | null
      showLabels: boolean
      type: 'LAYOUT_VIEWPORT'
      viewState: any
      windowH: number
      windowW: number
    }

export type WorkerOutMessage =
  | {
      binaryAttributes?: WorkerBinaryAttributes
      isFromStream?: boolean
      labels: WorkerPlacedLabel[]
      pickTable?: WorkerPickTable
      points?: WorkerProcessedPoint[]
      pointsChanged: boolean
      projection?: string
      reconciledInWorker: boolean
      reqId: number
      selectedCityPoint?: WorkerProcessedPoint | null
      streamId?: number
      totalCount: number
      type: 'LAYOUT_RESULT'
    }
  | {
      error: string
      reqId: number
      type: 'LAYOUT_ERROR'
    }

interface WorkerViewportCacheEntry {
  bbox: [number, number, number, number]
  cities: WorkerCityInput[]
  meta_key: string
  zoom: number
}

let FINE_CELLS = 16200
let FINE_COLS = 180
let FINE_ROWS = 90
let MACRO_CELLS = 648
let MACRO_COLS = 36

let active_stream_abort: AbortController | null = null
let active_stream_id = 0
let active_stream_timer: ReturnType<typeof setTimeout> | null = null
let active_viewport_entry: WorkerViewportCacheEntry | null = null
let active_viewport_max_cities = 4000
let base_cities: WorkerCityInput[] = []
let borders_version = 0
let cached_data_version = -1
let cached_display_opts_key = ''
let cached_point_key = ''
let cached_points: WorkerProcessedPoint[] = []
let cached_pt_by_city_idx: Array<WorkerProcessedPoint | undefined> = []
let cached_pt_by_key = new Map<string, WorkerProcessedPoint>()
let cached_sorted_label_candidates: WorkerProcessedPoint[] = []
let cached_sorted_labels_ready = false
let cached_style_cache_key = ''
let cap_rgba_cache = new Map<string, [number, number, number, number] | undefined>()
let current_cities: WorkerCityInput[] = []
let current_year = 1950
let data_version = 0
let last_layout_msg: (WorkerInMessage & { type: 'LAYOUT_VIEWPORT' }) | null = null
let raw_active_cities: WorkerCityInput[] = []
let short_name_cache = new WeakMap<WorkerCityInput, string>()
let styled_point_cache = new Map<string, WorkerProcessedPoint>()
let worker_border_lookup: BorderLookup | null = null
let worker_fine_has_cap = new Uint8Array(FINE_CELLS)
let worker_fine_lens = new Uint32Array(FINE_CELLS)
let worker_fine_max_pop = new Float64Array(FINE_CELLS)
let worker_fine_offs = new Uint32Array(FINE_CELLS)
let worker_grid_indices = new Uint32Array(0)
let worker_macro_counts = new Uint32Array(MACRO_CELLS)
let worker_macro_has_cap = new Uint8Array(MACRO_CELLS)
let worker_macro_max_pop = new Float64Array(MACRO_CELLS)
let worker_viewport_cache: WorkerViewportCacheEntry[] = []


/**
 * Parses a hex colour string or RGBA tuple into an RGBA tuple with caching.
 *
 * @param {string | [number, number, number, number]} [arg0_hex]
 * @param {number} [arg1_alpha=255]
 *
 * @returns {[number, number, number, number] | undefined}
 */
function parseHexColorToRgba (
  arg0_hex?: string | [number, number, number, number],
  arg1_alpha: number = 255
): [number, number, number, number] | undefined {
  //Convert from parameters
  let alpha = arg1_alpha
  let hex = arg0_hex

  //Guard clauses
  if (!hex)
    return undefined
  if (Array.isArray(hex))
    return hex
  if (typeof hex !== 'string')
    return undefined

  //Declare local instance variables
  let cache_k = `${hex}|${alpha}`

  //Function body
  if (cap_rgba_cache.has(cache_k))
    return cap_rgba_cache.get(cache_k)

  let clean = hex.replace('#', '').trim()
  if (clean.length === 3)
    clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2]

  let parsed: [number, number, number, number] | undefined = undefined
  if (clean.length >= 6) {
    let r = parseInt(clean.substring(0, 2), 16)
    let g = parseInt(clean.substring(2, 4), 16)
    let b = parseInt(clean.substring(4, 6), 16)
    if (!isNaN(r) && !isNaN(g) && !isNaN(b))
      parsed = [r, g, b, alpha]
  }

  cap_rgba_cache.set(cache_k, parsed)

  //Return statement
  return parsed
}


/**
 * Formats a hex colour string or RGBA tuple into a compact hex string for `WorkerPickTable`.
 *
 * @param {string | [number, number, number, number]} [arg0_val]
 *
 * @returns {string | null}
 */
function toHexColorString (arg0_val?: string | [number, number, number, number]): string | null {
  //Convert from parameters
  let val = arg0_val

  //Guard clauses
  if (!val)
    return null
  if (typeof val === 'string')
    return val
  if (!Array.isArray(val) || val.length < 3)
    return null

  //Function body
  let toHex = (arg0_n: number) => Math.max(0, Math.min(255, Math.round(arg0_n))).toString(16).padStart(2, '0')

  //Return statement
  return `#${toHex(val[0])}${toHex(val[1])}${toHex(val[2])}`
}


/**
 * Resolves and WeakMap-caches the best display name for a settlement under current display options.
 *
 * @param {WorkerCityInput} arg0_city
 * @param {StadesterDisplayOptions} [arg1_display_options]
 *
 * @returns {string}
 */
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


/**
 * Aborts any in-flight worker viewport stream and clears pending chunk coalesce timers.
 *
 * @returns {void}
 */
function abortActiveViewportStream (): void {
  //Function body
  if (active_stream_timer !== null) {
    clearTimeout(active_stream_timer)
    active_stream_timer = null
  }
  if (active_stream_abort) {
    active_stream_abort.abort()
    active_stream_abort = null
  }
}


/**
 * Reconciles `raw_active_cities` against `worker_border_lookup` off the main thread,
 * updates `current_cities`, invalidates derived point caches, and rebuilds the worker spatial grid.
 *
 * @returns {void}
 */
function applyReconciledActiveCities (): void {
  //Declare local instance variables
  let bl = worker_border_lookup
  let has_borders = Boolean(
    bl && (
      bl.active_capitals_by_key.size > 0 ||
      bl.active_capitals_by_name.size > 0 ||
      bl.active_capitals_list.length > 0 ||
      bl.acapital_state_ids.size > 0 ||
      bl.active_state_ids.size > 0
    )
  )
  let reconciled: WorkerCityInput[]

  //Function body
  if (has_borders && bl && raw_active_cities.length > 0) {
    let auth_by_city = buildAuthoritativeCapitalsByCity(
      bl.active_capitals_list,
      raw_active_cities,
      current_year
    )
    reconciled = reconcileCitiesWithAuthoritativeBorders(
      raw_active_cities,
      bl.active_capitals_by_key,
      bl.active_capitals_by_name,
      bl.acapital_state_ids,
      bl.active_state_capitals_by_sid,
      bl.active_state_ids,
      bl.active_polity_names,
      auth_by_city,
      bl.active_capitals_list,
      bl.polity_features
    )
  } else {
    reconciled = raw_active_cities.slice()
  }

  reconciled.sort((arg0_a, arg0_b) => (arg0_b.population || 0) - (arg0_a.population || 0))
  current_cities = reconciled
  data_version++
  cached_data_version = -1
  cached_point_key = ''
  cached_points = []
  cached_pt_by_city_idx = []
  cached_pt_by_key.clear()
  cached_sorted_label_candidates = []
  cached_sorted_labels_ready = false
  rebuildWorkerSpatialGrid()
}


/**
 * Rebuilds the dense 2-level spatial index (10°x10° macro blocks and 2°x2° fine cells) over `current_cities`.
 *
 * @returns {void}
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
    if (c.isCapital || c.is_capital) {
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
      let a_cap = (a_city.isCapital || a_city.is_capital) ? 1 : 0
      let b_cap = (b_city.isCapital || b_city.is_capital) ? 1 : 0
      if (a_cap !== b_cap)
        return b_cap - a_cap

      return (b_city.population || 0) - (a_city.population || 0)
    })
  }
}


/**
 * Computes point projection/styling, label placement with 2-level spatial pruning,
 * and posts zero-copy binary GPU attributes (plus compact pick table or points array).
 *
 * @param {WorkerInMessage & { type: 'LAYOUT_VIEWPORT' }} arg0_msg
 * @param {boolean} [arg1_is_from_stream=false]
 * @param {number} [arg2_stream_id]
 *
 * @returns {void}
 */
function processViewportLayout (
  arg0_msg: WorkerInMessage & { type: 'LAYOUT_VIEWPORT' },
  arg1_is_from_stream: boolean = false,
  arg2_stream_id?: number
): void {
  //Convert from parameters
  let is_from_stream = arg1_is_from_stream
  let msg = arg0_msg
  let stream_id = arg2_stream_id
  let {
    bubbleSize: b_scale,
    colorMode: color_mode,
    displayOptions: display_options,
    heuristicCulling: is_heuristic_culling = true,
    includePointsArray: include_points_array = false,
    isMobile: is_mobile,
    labelCollision: is_collision_active,
    largeCityContrast: large_city_contrast,
    opacity: circle_opacity = 0.7,
    projection,
    reqId: req_id,
    selectedCityKey: selected_city_key,
    showLabels: is_labels_visible,
    viewState: view_state,
    windowH: window_h,
    windowW: window_w,
  } = msg

  //Function body
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
    let population_palette = msg.populationPalette || 'Plasma'
    let region_palette = msg.regionPalette || 'Default'
    let zoom_bucket = Math.round(zoom*4)
    let style_cache_key = `${current_year}:${borders_version}:${color_mode}:${msg.growthPalette}:${population_palette}:${region_palette}:${b_scale}:${contrast}:${circle_opacity}:${Boolean(is_mobile)}:${projection}:${zoom_bucket}:${opts_key}`
    let static_point_key = `${data_version}:${style_cache_key}:${Boolean(include_points_array)}`
    let points_changed = true
    let processed_points: WorkerProcessedPoint[] = []
    let zoom_factor = Math.max(1.0, Math.min(1.8, 1.0 + (is_cartesian ? (zoom - 2.8)*0.12 : (is_globe ? (zoom - 3.0)*0.08 : (zoom - 1.2)*0.08))))

    if (style_cache_key !== cached_style_cache_key) {
      cached_style_cache_key = style_cache_key
      styled_point_cache.clear()
    }

    if (static_point_key === cached_point_key && cached_data_version === data_version) {
      points_changed = false
      processed_points = cached_points
    } else {
      cached_pt_by_city_idx = new Array(current_cities.length)
      cached_pt_by_key.clear()

      let mobile_scale = is_mobile ? 0.70 : 1.0
      let min_radius = (is_mobile ? 2.0 : 3.25)*b_scale*Math.min(1.4, zoom_factor)
      let max_radius = is_mobile ? 32.0 : 65.0

      for (let i = 0; i < current_cities.length; i++) {
        let c = current_cities[i]
        if (!c || !c.coords || !Number.isFinite(c.coords[0]) || !Number.isFinite(c.coords[1]))
          continue
        if (c.population === undefined || c.population === null || isNaN(c.population) || c.population < 0.01)
          continue

        let is_cap = Boolean(c.isCapital || c.is_capital)
        let raw_cap_hex = toHexColorString(c.capitalColor || c.capital_color) || undefined
        let cap_of_str = c.capitalOf || c.capital_state_name
        let cap_sid = c.capitalStateId ?? c.capital_state_id
        let cached_pt = styled_point_cache.get(c.key)
        let pt: WorkerProcessedPoint

        if (
          cached_pt &&
          cached_pt.population === c.population &&
          Boolean(cached_pt.isCapital) === is_cap &&
          cached_pt.rawCapitalColor === raw_cap_hex &&
          cached_pt.capitalOf === cap_of_str &&
          cached_pt.name === c.name
        ) {
          pt = cached_pt
        } else {
          let c_lat = c.coords[0]
          let c_lon = c.coords[1]
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

          let pop_scaled = Math.pow(Math.max(0, c.population)/100000, 0.5*contrast)*3.6*b_scale*mobile_scale
          let pixel_radius = Math.max(min_radius, Math.min(max_radius, (min_radius + pop_scaled)*zoom_factor))

          if (color_mode === 'growth') {
            let g_rate = (c.growthRate !== undefined) ? c.growthRate : 0
            let g_rgb = getGrowthRgb(g_rate, msg.growthPalette)
            fill_color = [g_rgb[0], g_rgb[1], g_rgb[2], 220]
          } else if (color_mode === 'population') {
            let p_rgb = getPopRgb(c.population, population_palette)
            fill_color = [p_rgb[0], p_rgb[1], p_rgb[2], 220]
          } else if (color_mode === 'region' || color_mode === 'continent') {
            let reg_rgb = resolveRegionColorRgb(c.region, [c_lat, c_lon], region_palette)
            fill_color = [reg_rgb[0], reg_rgb[1], reg_rgb[2], 220]
          }

          let resolved_cap_color = parseHexColorToRgba(c.capitalColor || c.capital_color)

          pt = {
            capitalColor: resolved_cap_color,
            capitalOf: cap_of_str,
            capitalStateId: cap_sid,
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
            rawCapitalColor: raw_cap_hex,
            rawCoords: [c_lon, c_lat],
            region: c.region,
            shortName: getCachedShortCityName(c, display_options),
          }
          styled_point_cache.set(c.key, pt)
        }

        cached_pt_by_city_idx[i] = pt
        cached_pt_by_key.set(pt.key, pt)
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

    //4. Hierarchical 2-level spatial pruning + heuristic culling + O(1) collision grid for city labels
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
          sx = window_w/2 + (cand.position[0] - target[0])*scale
          sy = window_h/2 - (cand.position[1] - target[1])*scale
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
        if (!label_text || label_text.trim().length === 0)
          continue

        let font_size = Math.max(10, Math.min(15, 9 + Math.log10(Math.max(1000, cand.population || 1000))*0.9))
        let text_w = label_text.length*(font_size*0.58) + 12
        let text_h = font_size + 4
        let r = cand.pixelRadius

        let box_x1 = sx + r + 4
        let box_y1 = sy - text_h/2
        let box_x2 = box_x1 + text_w
        let box_y2 = box_y1 + text_h

        let gx1 = Math.floor((box_x1 - 4)/cell_w)
        let gx2 = Math.floor((box_x2 + 4)/cell_w)
        let gy1 = Math.floor((box_y1 - 2)/cell_h)
        let gy2 = Math.floor((box_y2 + 2)/cell_h)

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

    let selected_city_point = selected_city_key ? (cached_pt_by_key.get(selected_city_key) || null) : null

    if (!points_changed) {
      self.postMessage({
        isFromStream: is_from_stream,
        labels: placed_labels,
        pointsChanged: false,
        projection,
        reconciledInWorker: true,
        reqId: req_id,
        selectedCityPoint: selected_city_point,
        streamId: stream_id,
        totalCount: processed_points.length,
        type: 'LAYOUT_RESULT',
      } as WorkerOutMessage)
      return
    }

    //Pack zero-copy TypedArray attributes for direct GPU upload in ScatterplotLayer
    let p_len = processed_points.length
    let bin_positions = new Float32Array(p_len*3)
    let bin_radii = new Float32Array(p_len)
    let bin_fill_colors = new Uint8Array(p_len*4)
    let bin_line_colors = new Uint8Array(p_len*4)
    let fill_alpha = Math.round(255*circle_opacity)
    let stroke_alpha = Math.min(255, Math.round(255*Math.min(1.0, circle_opacity*1.25)))
    let transfers: Transferable[] = [
      bin_positions.buffer,
      bin_radii.buffer,
      bin_fill_colors.buffer,
      bin_line_colors.buffer,
    ]
    let pick_table: WorkerPickTable | undefined = undefined

    if (!include_points_array) {
      let pt_cap_colors: (string | null)[] = new Array(p_len)
      let pt_cap_ofs: (string | null)[] = new Array(p_len)
      let pt_cap_sids = new Int32Array(p_len)
      let pt_countries: (string | null)[] = new Array(p_len)
      let pt_growth = new Float32Array(p_len)
      let pt_is_caps = new Uint8Array(p_len)
      let pt_keys: string[] = new Array(p_len)
      let pt_lats = new Float32Array(p_len)
      let pt_lons = new Float32Array(p_len)
      let pt_names: string[] = new Array(p_len)
      let pt_pops = new Float32Array(p_len)
      let pt_regions: (string | null)[] = new Array(p_len)

      for (let i = 0; i < p_len; i++) {
        let pt = processed_points[i]
        bin_positions[i*3] = pt.position[0]
        bin_positions[i*3 + 1] = pt.position[1]
        bin_positions[i*3 + 2] = pt.position[2]
        bin_radii[i] = pt.pixelRadius
        bin_fill_colors[i*4] = pt.color[0]
        bin_fill_colors[i*4 + 1] = pt.color[1]
        bin_fill_colors[i*4 + 2] = pt.color[2]
        bin_fill_colors[i*4 + 3] = fill_alpha
        bin_line_colors[i*4] = pt.color[0]
        bin_line_colors[i*4 + 1] = pt.color[1]
        bin_line_colors[i*4 + 2] = pt.color[2]
        bin_line_colors[i*4 + 3] = stroke_alpha

        pt_cap_colors[i] = pt.rawCapitalColor || null
        pt_cap_ofs[i] = pt.capitalOf || null
        let raw_sid = Number(pt.capitalStateId)
        pt_cap_sids[i] = (pt.capitalStateId !== undefined && Number.isFinite(raw_sid)) ? raw_sid : -1
        pt_countries[i] = pt.country || null
        pt_growth[i] = pt.growthRate || 0
        pt_is_caps[i] = pt.isCapital ? 1 : 0
        pt_keys[i] = pt.key
        pt_lats[i] = pt.coords ? pt.coords[0] : pt.position[1]
        pt_lons[i] = pt.coords ? pt.coords[1] : pt.position[0]
        pt_names[i] = pt.name
        pt_pops[i] = pt.population
        pt_regions[i] = pt.region || null
      }

      pick_table = {
        capitalColors: pt_cap_colors,
        capitalOfs: pt_cap_ofs,
        capitalStateIds: pt_cap_sids,
        countries: pt_countries,
        growthRates: pt_growth,
        isCapitals: pt_is_caps,
        keys: pt_keys,
        lats: pt_lats,
        lons: pt_lons,
        names: pt_names,
        populations: pt_pops,
        regions: pt_regions,
      }
      transfers.push(
        pt_cap_sids.buffer,
        pt_growth.buffer,
        pt_is_caps.buffer,
        pt_lats.buffer,
        pt_lons.buffer,
        pt_pops.buffer
      )
    } else {
      for (let i = 0; i < p_len; i++) {
        let pt = processed_points[i]
        bin_positions[i*3] = pt.position[0]
        bin_positions[i*3 + 1] = pt.position[1]
        bin_positions[i*3 + 2] = pt.position[2]
        bin_radii[i] = pt.pixelRadius
        bin_fill_colors[i*4] = pt.color[0]
        bin_fill_colors[i*4 + 1] = pt.color[1]
        bin_fill_colors[i*4 + 2] = pt.color[2]
        bin_fill_colors[i*4 + 3] = fill_alpha
        bin_line_colors[i*4] = pt.color[0]
        bin_line_colors[i*4 + 1] = pt.color[1]
        bin_line_colors[i*4 + 2] = pt.color[2]
        bin_line_colors[i*4 + 3] = stroke_alpha
      }
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
        isFromStream: is_from_stream,
        labels: placed_labels,
        pickTable: pick_table,
        points: include_points_array ? processed_points : undefined,
        pointsChanged: true,
        projection,
        reconciledInWorker: true,
        reqId: req_id,
        selectedCityPoint: selected_city_point,
        streamId: stream_id,
        totalCount: p_len,
        type: 'LAYOUT_RESULT',
      } as WorkerOutMessage,
      {
        transfer: transfers,
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
 * Fetches, decodes, merges, reconciles, and emits a zoomed spatial viewport stream inside the Web Worker
 * with 25-entry LRU caching, Chunk 0 fast paint, and configurable chunk coalescing.
 *
 * @param {WorkerInMessage & { type: 'STREAM_VIEWPORT' }} arg0_msg
 *
 * @returns {Promise<void>}
 */
async function handleStreamViewport (
  arg0_msg: WorkerInMessage & { type: 'STREAM_VIEWPORT' }
): Promise<void> {
  //Convert from parameters
  let msg = arg0_msg

  //Declare local instance variables
  let coalesce_ms = Math.max(20, msg.coalesceMs ?? 120)
  let color_mode = msg.colorMode || 'growth'
  let dataset = msg.dataset
  let fetch_bbox = msg.bbox
  let max_cities = msg.maxCities
  let meta_key = `${dataset}:${msg.year}:${color_mode}:${msg.minPop}:${max_cities}`
  let min_pop = Math.max(0.01, msg.minPop)
  let norm_zoom = msg.normZoom
  let stream_id = msg.streamId
  let stream_threshold = msg.streamMinCitiesThreshold ?? 4001

  //Function body
  active_stream_id = stream_id
  active_viewport_max_cities = max_cities

  let commitViewportCities = function (arg0_cities: WorkerCityInput[]): void {
    if (active_stream_id !== stream_id || msg.year !== current_year)
      return
    active_viewport_entry = {
      bbox: fetch_bbox,
      cities: arg0_cities,
      meta_key,
      zoom: norm_zoom,
    }
    raw_active_cities = buildCappedViewportCities(arg0_cities, base_cities, max_cities)
    applyReconciledActiveCities()
    if (last_layout_msg)
      processViewportLayout(last_layout_msg, true, stream_id)
  }

  //Check 25-entry LRU viewport cache inside worker RAM first
  let inner_bbox = scaleGeoBBox(fetch_bbox, 0.72)
  for (let i = worker_viewport_cache.length - 1; i >= 0; i--) {
    let entry = worker_viewport_cache[i]
    if (
      entry.meta_key === meta_key &&
      Math.abs(norm_zoom - entry.zoom) < 0.5 &&
      isGeoBBoxContained(inner_bbox, entry.bbox)
    ) {
      abortActiveViewportStream()
      commitViewportCities(entry.cities)
      return
    }
  }

  abortActiveViewportStream()
  let controller = new AbortController()
  active_stream_abort = controller

  let bbox_param = fetch_bbox.map((arg0_v) => arg0_v.toFixed(3)).join(',')
  let url_params = new URLSearchParams({
    bbox: bbox_param,
    colorMode: color_mode,
    dataset,
    format: 'bin',
    maxCities: String(max_cities),
    minPop: String(min_pop),
    year: String(msg.year),
  })
  if (msg.month !== undefined)
    url_params.set('month', String(msg.month))
  if (msg.day !== undefined)
    url_params.set('day', String(msg.day))
  if (max_cities === 0 || max_cities >= stream_threshold)
    url_params.set('stream', '1')

  try {
    let res = await fetch(`/api/stadester/cities.json?${url_params.toString()}`, {
      signal: controller.signal,
    })
    if (!res.ok || controller.signal.aborted || active_stream_id !== stream_id)
      return

    let content_type = res.headers.get('content-type') || ''
    let is_bin_stream = res.headers.get('x-stadwire-stream') === '1'
    let city_list: WorkerCityInput[] = []
    let emitted_count = 0

    if (content_type.includes('application/octet-stream') && is_bin_stream && res.body) {
      let reader = res.body.getReader()
      let buf = new Uint8Array(0)
      let emitted_first_chunk = false

      let flushCoalesced = function (): void {
        if (active_stream_timer !== null) {
          clearTimeout(active_stream_timer)
          active_stream_timer = null
        }
        if (controller.signal.aborted || active_stream_id !== stream_id)
          return
        if (city_list.length > emitted_count) {
          emitted_count = city_list.length
          commitViewportCities(city_list)
        }
      }

      for (;;) {
        let read_res = await reader.read()
        if (controller.signal.aborted || active_stream_id !== stream_id)
          return

        let value = read_res.value
        if (value && value.byteLength > 0) {
          if (buf.byteLength === 0) {
            buf = value
          } else {
            let combined = new Uint8Array(buf.byteLength + value.byteLength)
            combined.set(buf, 0)
            combined.set(value, buf.byteLength)
            buf = combined
          }

          let cursor = 0
          let decoded_any = false
          for (;;) {
            if (cursor + 4 > buf.byteLength)
              break
            let frame_view = new DataView(buf.buffer, buf.byteOffset + cursor, 4)
            let frame_len = frame_view.getUint32(0, true)
            if (cursor + 4 + frame_len > buf.byteLength)
              break
            let frame_ab = buf.slice(cursor + 4, cursor + 4 + frame_len).buffer
            let chunk_cities = decodeBinaryCitiesWire(frame_ab)
            cursor += 4 + frame_len
            if (chunk_cities && chunk_cities.length > 0) {
              for (let k = 0; k < chunk_cities.length; k++)
                city_list.push(chunk_cities[k] as WorkerCityInput)
              decoded_any = true
            }
          }
          if (cursor > 0)
            buf = cursor < buf.byteLength ? buf.slice(cursor) : new Uint8Array(0)

          if (decoded_any) {
            if (!emitted_first_chunk) {
              emitted_first_chunk = true
              flushCoalesced()
            } else if (active_stream_timer === null) {
              active_stream_timer = setTimeout(() => {
                flushCoalesced()
              }, coalesce_ms)
            }
          }
        }

        if (read_res.done)
          break
      }

      flushCoalesced()
    } else if (content_type.includes('application/octet-stream')) {
      let ab = await res.arrayBuffer()
      if (controller.signal.aborted || active_stream_id !== stream_id)
        return
      let decoded = decodeBinaryCitiesWire(ab)
      if (decoded)
        city_list = decoded as WorkerCityInput[]
      commitViewportCities(city_list)
    }

    if (!controller.signal.aborted && active_stream_id === stream_id) {
      if (worker_viewport_cache.length >= 25)
        worker_viewport_cache.shift()
      worker_viewport_cache.push({
        bbox: fetch_bbox,
        cities: city_list,
        meta_key,
        zoom: norm_zoom,
      })
    }
  } catch (arg0_err: any) {
    if (arg0_err?.name === 'AbortError')
      return
    console.error('[stadester.worker] Viewport stream error:', arg0_err)
  } finally {
    if (active_stream_abort === controller)
      active_stream_abort = null
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
  if (msg.type === 'SET_BORDERS_CONTEXT') {
    worker_border_lookup = buildBorderLookup(msg.features)
    borders_version++
    styled_point_cache.clear()
    if (raw_active_cities.length > 0)
      applyReconciledActiveCities()
    return
  }

  if (msg.type === 'SET_DATA') {
    let year_changed = msg.year !== current_year
    base_cities = Array.isArray(msg.cities) ? [...msg.cities] : []
    current_year = msg.year
    short_name_cache = new WeakMap<WorkerCityInput, string>()
    cap_rgba_cache.clear()

    if (year_changed || base_cities.length === 0) {
      abortActiveViewportStream()
      active_viewport_entry = null
      styled_point_cache.clear()
      raw_active_cities = base_cities.slice()
    } else if (active_viewport_entry && active_viewport_entry.meta_key.includes(`:${current_year}:`)) {
      raw_active_cities = buildCappedViewportCities(active_viewport_entry.cities, base_cities, active_viewport_max_cities)
    } else {
      raw_active_cities = base_cities.slice()
    }

    applyReconciledActiveCities()
    return
  }

  if (msg.type === 'APPEND_DATA') {
    if (msg.year !== current_year)
      return

    let delta_arr = Array.isArray(msg.cities) ? msg.cities : []
    if (delta_arr.length === 0)
      return

    for (let i = 0; i < delta_arr.length; i++)
      base_cities.push(delta_arr[i])

    if (active_viewport_entry && active_viewport_entry.meta_key.includes(`:${current_year}:`))
      raw_active_cities = buildCappedViewportCities(active_viewport_entry.cities, base_cities, active_viewport_max_cities)
    else
      raw_active_cities = base_cities.slice()

    applyReconciledActiveCities()
    return
  }

  if (msg.type === 'STREAM_VIEWPORT') {
    handleStreamViewport(msg).catch((arg0_err) => {
      console.error('[stadester.worker] Unhandled STREAM_VIEWPORT error:', arg0_err)
    })
    return
  }

  if (msg.type === 'CANCEL_VIEWPORT') {
    abortActiveViewportStream()
    let had_viewport = active_viewport_entry !== null
    active_viewport_entry = null
    if (msg.restoreBase && had_viewport) {
      raw_active_cities = base_cities.slice()
      applyReconciledActiveCities()
      if (last_layout_msg)
        processViewportLayout(last_layout_msg, true, active_stream_id)
    }
    return
  }

  if (msg.type === 'LAYOUT_VIEWPORT') {
    last_layout_msg = msg
    processViewportLayout(msg, false)
  }
}
