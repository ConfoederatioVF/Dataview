export type DataFormat = 'float32' | 'int32'
export type AppMode = 'Single Image' | 'Image Difference'
export type ProjectionType = 'Equirectangular' | 'Mercator' | 'Globe' | 'EqualEarth'
export type ScaleType = 'linear' | 'pseudo-log'
export type ColorPalette =
  | 'Viridis'
  | 'Plasma'
  | 'Inferno'
  | 'Magma'
  | 'Cividis'
  | 'Turbo'
  | 'Warm'
  | 'Cool'
  | 'CubehelixDefault'
  | 'Rainbow'
  | 'Sinebow'
  | 'Spectral'
  | 'Blues'
  | 'Greens'
  | 'Greys'
  | 'Oranges'
  | 'Purples'
  | 'Reds'
  | 'BuGn'
  | 'BuPu'
  | 'GnBu'
  | 'OrRd'
  | 'PuBu'
  | 'PuBuGn'
  | 'PuRd'
  | 'RdPu'
  | 'YlGn'
  | 'YlGnBu'
  | 'YlOrBr'
  | 'YlOrRd'
  | 'BrBG'
  | 'PRGn'
  | 'PiYG'
  | 'PuOr'
  | 'RdBu'
  | 'RdGy'
  | 'RdYlBu'
  | 'RdYlGn'

export interface ColorSchemeInfo {
  id: ColorPalette
  name: string
  category: 'Sequential (Multi-Hue)' | 'Sequential (Single-Hue)' | 'Diverging' | 'Cyclical'
}
export type BoundsMode = 'Manual' | 'Percentile' | 'Absolute'

export type DownsampleMethod = 'average' | 'minimum' | 'maximum' | 'near'

export interface BinningConfig {
  enabled: boolean
  width: number
  height: number
  method: DownsampleMethod
}

export type SpikeHeightScaleMode = 'linear' | 'percentile' | 'blend'

export interface HeightmapConfig {
  enabled: boolean
  elevationScale: number // height multiplier in meters
  opacity?: number // 0.0 to 1.0 (defaults to 0.9)
  opacityByPercentile?: boolean // tie opacity to cell empirical percentile rank
  opacityByPercentileStrength?: number // 0.0 to 10.0 (pseudo-log ramp, defaults to 1.0)
  resolutionArcmin?: number // resolution / granularity in arcminutes (bounded to 5-arcmin at most)
  heightScaleMode?: SpikeHeightScaleMode // 'linear' (colourbar scale), 'percentile', or 'blend'
  blendWeight?: number // 0.0 (pure linear) to 1.0 (pure percentile), defaults to 0.5
}

export type MapModeId = 'default' | 'country_analysis' | 'spike_map' | 'circle_sizing' | 'historical_borders'

export interface MapModeItem {
  id: MapModeId
  label: string
  active: boolean
}

export type StadesterColorMode = 'growth' | 'population' | 'region' | 'continent'

export interface StadesterDisplayOptions {
  bubble_size?: number
  bubbleSize?: number
  capital_color_mode?: 'state' | 'constant'
  capitalColorMode?: 'state' | 'constant'
  capital_constant_color?: string
  capitalConstantColor?: string
  color_mode?: StadesterColorMode
  colorMode?: StadesterColorMode
  dataset?: 'stadester_1.1' | 'stadester_1.0'
  filled?: boolean
  growth_palette?: string
  growthPalette?: string
  halo?: boolean
  heuristic_culling?: boolean
  heuristicCulling?: boolean
  label_collision?: boolean
  labelCollision?: boolean
  large_city_contrast?: number
  largeCityContrast?: number
  max_cities?: number
  maxCities?: number
  min_pop?: number
  minPop?: number
  mobile_heuristic_culling?: boolean
  mobileHeuristicCulling?: boolean
  opacity?: number
  prefer_least_diacritics?: boolean
  show_capitals?: boolean
  showCapitals?: boolean
  show_capital_underlines?: boolean
  showCapitalUnderlines?: boolean
  show_labels?: boolean
  showLabels?: boolean
  skip_unknown_unicode?: boolean
  strip_parentheses?: boolean
  [key: string]: any
}

export interface StadesterConfig {
  bubbleSize: number
  capitalColorMode?: 'state' | 'constant'
  capitalConstantColor?: string
  colorMode: StadesterColorMode
  dataset: 'stadester_1.1' | 'stadester_1.0'
  display_options?: StadesterDisplayOptions
  enabled: boolean
  filled?: boolean
  growthPalette?: string
  halo?: boolean
  heuristicCulling?: boolean
  labelCollision: boolean
  largeCityContrast?: number
  maxCities: number
  minPop: number
  opacity?: number
  showCapitals?: boolean
  showCapitalUnderlines?: boolean
  showLabels: boolean
}

export interface CityPoint {
  area?: number
  colour?: [number, number, number]
  coords: [number, number] // [lat, lng]
  country?: string
  density?: number
  growthRate?: number
  historical_names?: Array<{ date: string; name: string; year_frac: number }>
  id: number | string
  isCapital?: boolean
  is_capital?: boolean
  capitalColor?: [number, number, number, number] | string
  capital_color?: string
  capitalOf?: string
  capitalStateId?: number | string
  capital_state_name?: string
  capital_state_id?: number | string
  key: string
  lat?: number
  lon?: number
  name: string
  other_names?: string | string[]
  pixelRadius?: number
  population: number
  region?: string
  shortName?: string
}

export interface CityFullRecord {
  angel_region?: string
  area?: Record<string, number>
  capital?: Record<string, number | string>
  capitalColor?: [number, number, number, number] | string
  capital_color?: string
  capitalOf?: string
  capital_state_name?: string
  capital_state_id?: number | string
  centre_density?: Record<string, number>
  clark_region?: string
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: Record<string, number>
  elevation?: number
  historical_names?: Array<{ date: string; name: string; year_frac: number }>
  id?: number | string
  isCapital?: boolean
  is_capital?: boolean
  key: string
  name: string
  name_coords?: Record<string, [number, number]>
  name_peaks?: Record<string, number>
  original_names?: string | string[]
  other_names?: string | string[]
  pixel_coords?: [number, number]
  population?: Record<string, number>
  position?: string
  'prov.'?: string
  region?: string
  rni?: Record<string, number>
  type?: string
}

export interface HistoricalBordersDisplayOptions {
  fill_opacity?: number
  fill_opacity_range?: [number, number]
  fill_opacity_step?: number
  fillOpacity?: number
  fillOpacityRange?: [number, number]
  fillOpacityStep?: number
  stroke_color?: string
  stroke_colour?: string
  stroke_width?: number
  stroke_width_range?: [number, number]
  stroke_width_step?: number
  strokeColor?: string
  strokeColour?: string
  strokeWidth?: number
  strokeWidthRange?: [number, number]
  strokeWidthStep?: number
}

export interface HistoricalBordersConfig {
  dataset?: string
  display_options?: HistoricalBordersDisplayOptions
  enabled: boolean
  fillOpacity: number
  fillOpacityRange?: [number, number]
  fillOpacityStep?: number
  strokeColor: string
  strokeWidth: number
  strokeWidthRange?: [number, number]
  strokeWidthStep?: number
}

export let DEFAULT_HISTORICAL_BORDERS_CONFIG: HistoricalBordersConfig = {
  dataset: 'dejure_borders',
  enabled: false,
  fillOpacity: 0.25,
  fillOpacityRange: [0.0, 0.5],
  fillOpacityStep: 0.05,
  strokeColor: '#ffffff',
  strokeWidth: 1.25,
  strokeWidthRange: [0.5, 5.0],
  strokeWidthStep: 0.25,
}


/**
 * Normalises a historical border dataset identifier to either 'dejure_borders' or 'defacto_borders'.
 *
 * @param {string} [arg0_dataset]
 * @param {'dejure_borders' | 'defacto_borders'} [arg1_fallback='dejure_borders']
 *
 * @returns {'dejure_borders' | 'defacto_borders'}
 */
export let normaliseBorderDatasetId = function (
  arg0_dataset?: string,
  arg1_fallback: 'dejure_borders' | 'defacto_borders' = 'dejure_borders'
): 'dejure_borders' | 'defacto_borders' {
  //Convert from parameters
  let dataset = arg0_dataset
  let fallback = arg1_fallback

  //Guard clauses
  if (!dataset)
    return fallback

  //Function body
  if (dataset === 'defacto_borders' || dataset === 'detailed_borders')
    return 'defacto_borders'

  if (dataset === 'dejure_borders' || dataset === 'simplified_borders' || dataset === 'statistical_borders')
    return 'dejure_borders'

  //Return statement
  return fallback
}


/**
 * Resolves default border appearance and slider ranges from a layer or display_options config object.
 *
 * @param {any} arg0_source
 * @param {Partial<HistoricalBordersConfig>} [arg1_fallback]
 *
 * @returns {Pick<HistoricalBordersConfig, 'fillOpacity' | 'fillOpacityRange' | 'fillOpacityStep' | 'strokeColor' | 'strokeWidth' | 'strokeWidthRange' | 'strokeWidthStep'>}
 */
export let resolveHistoricalBordersAppearance = function (
  arg0_source: any,
  arg1_fallback?: Partial<HistoricalBordersConfig>
): Pick<
  HistoricalBordersConfig,
  'fillOpacity' | 'fillOpacityRange' | 'fillOpacityStep' | 'strokeColor' | 'strokeWidth' | 'strokeWidthRange' | 'strokeWidthStep'
> {
  //Convert from parameters
  let fallback = (arg1_fallback) ? arg1_fallback : DEFAULT_HISTORICAL_BORDERS_CONFIG
  let source = (arg0_source && typeof arg0_source === 'object') ? arg0_source : {}

  //Declare local instance variables
  let fill_opacity: number
  let fill_opacity_range: [number, number]
  let fill_opacity_step: number
  let raw_fill_opacity: any
  let raw_fill_range: any
  let raw_fill_step: any
  let raw_opts: Record<string, any>
  let raw_stroke_color: any
  let raw_stroke_range: any
  let raw_stroke_step: any
  let raw_stroke_width: any
  let stroke_color: string
  let stroke_width: number
  let stroke_width_range: [number, number]
  let stroke_width_step: number

  //Function body
  raw_opts = {
    ...(source.appearance && typeof source.appearance === 'object' ? source.appearance : {}),
    ...(source.border_appearance && typeof source.border_appearance === 'object' ? source.border_appearance : {}),
    ...(source.display_options && typeof source.display_options === 'object' ? source.display_options : {}),
    ...source,
  }

  raw_stroke_range =
    raw_opts.stroke_width_range ??
    raw_opts.strokeWidthRange ??
    raw_opts.width_range ??
    raw_opts.widthRange ??
    raw_opts.stroke_range ??
    raw_opts.strokeRange ??
    (raw_opts.stroke_width && typeof raw_opts.stroke_width === 'object' ? raw_opts.stroke_width.range : undefined) ??
    (raw_opts.strokeWidth && typeof raw_opts.strokeWidth === 'object' ? raw_opts.strokeWidth.range : undefined)

  if (
    Array.isArray(raw_stroke_range) &&
    raw_stroke_range.length >= 2 &&
    Number.isFinite(Number(raw_stroke_range[0])) &&
    Number.isFinite(Number(raw_stroke_range[1]))
  ) {
    let min_w = Math.max(0, Number(raw_stroke_range[0]))
    let max_w = Math.max(0, Number(raw_stroke_range[1]))
    stroke_width_range = [Math.min(min_w, max_w), Math.max(min_w, max_w)]
  } else {
    stroke_width_range = fallback.strokeWidthRange || DEFAULT_HISTORICAL_BORDERS_CONFIG.strokeWidthRange || [0.5, 5.0]
  }

  raw_fill_range =
    raw_opts.fill_opacity_range ??
    raw_opts.fillOpacityRange ??
    raw_opts.opacity_range ??
    raw_opts.opacityRange ??
    raw_opts.fill_range ??
    raw_opts.fillRange ??
    raw_opts.slider_range ??
    raw_opts.sliderRange ??
    (raw_opts.fill_opacity && typeof raw_opts.fill_opacity === 'object' ? raw_opts.fill_opacity.range : undefined) ??
    (raw_opts.fillOpacity && typeof raw_opts.fillOpacity === 'object' ? raw_opts.fillOpacity.range : undefined)

  if (
    Array.isArray(raw_fill_range) &&
    raw_fill_range.length >= 2 &&
    Number.isFinite(Number(raw_fill_range[0])) &&
    Number.isFinite(Number(raw_fill_range[1]))
  ) {
    let raw_a = Number(raw_fill_range[0])
    let raw_b = Number(raw_fill_range[1])
    let norm_a = (raw_a > 1 || raw_b > 1) ? raw_a / 100 : raw_a
    let norm_b = (raw_a > 1 || raw_b > 1) ? raw_b / 100 : raw_b
    let clamped_a = Math.min(1, Math.max(0, norm_a))
    let clamped_b = Math.min(1, Math.max(0, norm_b))
    fill_opacity_range = [Math.min(clamped_a, clamped_b), Math.max(clamped_a, clamped_b)]
  } else {
    fill_opacity_range = fallback.fillOpacityRange || DEFAULT_HISTORICAL_BORDERS_CONFIG.fillOpacityRange || [0.0, 0.5]
  }

  raw_stroke_color =
    raw_opts.stroke_colour ??
    raw_opts.stroke_color ??
    raw_opts.strokeColour ??
    raw_opts.strokeColor ??
    raw_opts.colour ??
    raw_opts.color
  stroke_color = (typeof raw_stroke_color === 'string' && raw_stroke_color.trim().length > 0)
    ? raw_stroke_color.trim()
    : (fallback.strokeColor || DEFAULT_HISTORICAL_BORDERS_CONFIG.strokeColor)

  raw_stroke_width = (raw_opts.stroke_width && typeof raw_opts.stroke_width === 'object')
    ? raw_opts.stroke_width.default
    : (raw_opts.stroke_width ??
       (raw_opts.strokeWidth && typeof raw_opts.strokeWidth === 'object' ? raw_opts.strokeWidth.default : raw_opts.strokeWidth) ??
       raw_opts.width)
  if (raw_stroke_width !== undefined && Number.isFinite(Number(raw_stroke_width))) {
    stroke_width = Math.min(stroke_width_range[1], Math.max(stroke_width_range[0], Number(raw_stroke_width)))
  } else {
    let fb_w = fallback.strokeWidth ?? DEFAULT_HISTORICAL_BORDERS_CONFIG.strokeWidth
    stroke_width = Math.min(stroke_width_range[1], Math.max(stroke_width_range[0], fb_w))
  }

  raw_fill_opacity = (raw_opts.fill_opacity && typeof raw_opts.fill_opacity === 'object')
    ? raw_opts.fill_opacity.default
    : (raw_opts.fill_opacity ??
       (raw_opts.fillOpacity && typeof raw_opts.fillOpacity === 'object' ? raw_opts.fillOpacity.default : raw_opts.fillOpacity) ??
       raw_opts.opacity)
  if (raw_fill_opacity !== undefined && Number.isFinite(Number(raw_fill_opacity))) {
    let num_op = Number(raw_fill_opacity)
    let norm_op = (num_op > 1) ? num_op / 100 : num_op
    fill_opacity = Math.min(fill_opacity_range[1], Math.max(fill_opacity_range[0], norm_op))
  } else {
    let fb_op = fallback.fillOpacity ?? DEFAULT_HISTORICAL_BORDERS_CONFIG.fillOpacity
    fill_opacity = Math.min(fill_opacity_range[1], Math.max(fill_opacity_range[0], fb_op))
  }

  raw_stroke_step = raw_opts.stroke_width_step ?? raw_opts.strokeWidthStep
  if (raw_stroke_step !== undefined && Number.isFinite(Number(raw_stroke_step)) && Number(raw_stroke_step) > 0) {
    stroke_width_step = Number(raw_stroke_step)
  } else if (
    Math.round(stroke_width_range[0]*100) % 25 !== 0 ||
    Math.round(stroke_width_range[1]*100) % 25 !== 0 ||
    Math.round(stroke_width*100) % 25 !== 0
  ) {
    stroke_width_step = 0.05
  } else {
    stroke_width_step = fallback.strokeWidthStep ?? DEFAULT_HISTORICAL_BORDERS_CONFIG.strokeWidthStep ?? 0.25
  }

  raw_fill_step = raw_opts.fill_opacity_step ?? raw_opts.fillOpacityStep
  if (raw_fill_step !== undefined && Number.isFinite(Number(raw_fill_step)) && Number(raw_fill_step) > 0) {
    fill_opacity_step = Number(raw_fill_step)
  } else if (
    Math.round(fill_opacity_range[0]*100) % 5 !== 0 ||
    Math.round(fill_opacity_range[1]*100) % 5 !== 0 ||
    Math.round(fill_opacity*100) % 5 !== 0
  ) {
    fill_opacity_step = 0.01
  } else {
    fill_opacity_step = fallback.fillOpacityStep ?? DEFAULT_HISTORICAL_BORDERS_CONFIG.fillOpacityStep ?? 0.05
  }

  //Return statement
  return {
    fillOpacity: fill_opacity,
    fillOpacityRange: fill_opacity_range,
    fillOpacityStep: fill_opacity_step,
    strokeColor: stroke_color,
    strokeWidth: stroke_width,
    strokeWidthRange: stroke_width_range,
    strokeWidthStep: stroke_width_step,
  }
}


/**
 * Determines whether a specified layer ID matches the active historical borders dataset configuration.
 *
 * @param {string} [arg0_config_dataset]
 * @param {string} [arg1_layer_id]
 *
 * @returns {boolean}
 */
export let isBorderDatasetMatch = function (
  arg0_config_dataset?: string,
  arg1_layer_id?: string
): boolean {
  //Convert from parameters
  let config_dataset = arg0_config_dataset
  let layer_id = arg1_layer_id

  //Guard clauses
  if (!layer_id)
    return false

  if (!config_dataset)
    return normaliseBorderDatasetId(layer_id) === 'dejure_borders'

  if (
    layer_id === 'defacto_borders' ||
    layer_id === 'detailed_borders' ||
    layer_id === 'dejure_borders' ||
    layer_id === 'simplified_borders' ||
    layer_id === 'statistical_borders'
  ) {
    return normaliseBorderDatasetId(config_dataset) === normaliseBorderDatasetId(layer_id)
  }

  //Return statement
  return config_dataset === layer_id
}

export interface CircleOverlayConfig {
  enabled: boolean
  percentileCutoff: number // e.g. 99 for P99
  baseRadius: number // base size scale
  strokeWidth: number // coloured stroke width in pixels
  haloWidth: number // black halo width in pixels
}

export interface DecodedRaster {
  data: Float32Array
  width: number
  height: number
  bounds: [number, number, number, number] // [west, south, east, north] (e.g. [-180, -90, 180, 90])
  min: number
  max: number
  mean: number
  stdDev: number
  validCount: number
  totalCells: number
  total?: number // Sum of all valid raster cell values
  histogram?: { bins: number[]; counts: number[]; min: number; max: number }
  quantiles?: Record<number, number>
}

export interface InspectionData {
  pixelX: number
  pixelY: number
  lng: number
  lat: number
  value: number | null
  rawRGBA?: [number, number, number, number]
  countryName?: string | null
}

export interface TransectPoint {
  distanceRatio: number // 0 to 1
  lng: number
  lat: number
  value: number | null
}

export type { CountryFeature } from './polygon_binning.ts'
