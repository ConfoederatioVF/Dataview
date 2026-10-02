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
  label_collision?: boolean
  labelCollision?: boolean
  large_city_contrast?: number
  largeCityContrast?: number
  max_cities?: number
  maxCities?: number
  min_pop?: number
  minPop?: number
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

export interface HistoricalBordersConfig {
  dataset?: string
  enabled: boolean
  fillOpacity: number
  strokeColor: string
  strokeWidth: number
}

export let DEFAULT_HISTORICAL_BORDERS_CONFIG: HistoricalBordersConfig = {
  dataset: 'statistical_borders',
  enabled: false,
  fillOpacity: 0.25,
  strokeColor: '#ffffff',
  strokeWidth: 1.25,
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

