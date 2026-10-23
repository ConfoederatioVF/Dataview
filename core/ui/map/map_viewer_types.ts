import type React from 'react'
import type {
  CircleOverlayConfig,
  CityFullRecord,
  CityPoint,
  DecodedRaster,
  HeightmapConfig,
  HistoricalBordersConfig,
  InspectionData,
  MapModeId,
  MapModeItem,
  ProjectionType,
  ScaleType,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import type {
  CountryFeature,
  CountryStats,
} from '@framework/geopng/polygon_binning.ts'
import type { ParsedDataLayer } from '@server/layer_parser.ts'
import type { UserRole } from '@common'

export interface MapViewerProps {
  activeLayerId?: string | null
  activeVariableSelectors?: Record<string, string | string[]>
  analyticsOpen: boolean
  breaks?: number[]
  circleOverlayConfig: CircleOverlayConfig
  colourbarWidth?: number
  countriesMode?: boolean
  countryStats?: CountryStats | null
  cursorLngLat?: [number, number] | null
  customVectorFeatures?: CountryFeature[]
  customVectorVisible?: boolean
  dataLayers?: Record<string, ParsedDataLayer>
  deferredSelectedCountries?: CountryFeature[]
  drawPoints?: [number, number][]
  drawnPolygonFeature?: CountryFeature | null
  heightmapConfig: HeightmapConfig
  hideColourbar?: boolean
  historicalBordersConfig?: HistoricalBordersConfig
  historicalBordersEnabled?: boolean
  hoveredCountry?: CountryFeature | null
  infoPanelOpen?: boolean
  invertPalette?: boolean
  isCalculatingStats?: boolean
  isDrawing?: boolean
  isEditingShape?: boolean
  isLoadingLayers?: boolean
  isMobile?: boolean
  isPlaying?: boolean
  isTimelapseExporting?: boolean
  legendPosition?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'top-centre' | 'bottom-centre'
  legendSubtitle?: string
  legendTitle: string
  logSigma: number
  mapModes: MapModeItem[]
  maxVal: number
  midpoint?: number | null
  minVal: number
  onAddDrawPoint?: (arg0_point: [number, number]) => void
  onCancelDraw?: () => void
  onChangeLegendPosition?: (pos: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right') => void
  onChangeVariableSelector?: (arg0_key: string, arg1_option: string | string[]) => void
  onChangeYear?: (arg0_year: number) => void
  onClearCountries?: () => void
  onClearDrawnPolygon?: () => void
  onCloseCityDetails?: () => void
  onCloseInfoPanel?: () => void
  onDeleteDrawPoint?: (arg0_index: number) => void
  onDeleteLastDrawPoint?: () => void
  onEditPolygon?: (arg0_feature: CountryFeature) => void
  onFinishDraw?: () => void
  onHoverCity?: (city: CityPoint | null, x?: number, y?: number) => void
  onHoverCountry?: (country: CountryFeature | null) => void
  onInsertDrawPoint?: (arg0_index: number, arg1_point: [number, number]) => void
  onInspect?: (data: InspectionData | null) => void
  onMoveDrawPoint?: (arg0_index: number, arg1_point: [number, number]) => void
  onReorderMapModes: (newModes: MapModeItem[]) => void
  onResizeColourbarWidth?: (width: number) => void
  onSelectCity?: (city: CityPoint) => void
  onSelectCountry?: (country: CountryFeature | null) => void
  onSelectLayer?: (arg0_layer_id: string) => void
  onSetCursorLngLat?: (arg0_coord: [number, number] | null) => void
  onToggleAnalytics: () => void
  onToggleCountriesMode?: (enabled: boolean) => void
  onToggleCountry?: (country: CountryFeature) => void
  onToggleDraw?: () => void
  onToggleHistoricalBorders?: (arg0_enabled: boolean) => void
  onToggleMapMode: (id: MapModeId) => void
  onTogglePerformantMode?: (enabled: boolean) => void
  onToggleSettingsDrawer?: (open: boolean) => void
  onToggleUi?: () => void
  onUpdateBreaks?: (breaks: number[]) => void
  opacity: number
  palette: any
  performantMode?: boolean
  pickRadius?: number
  projection: ProjectionType
  raster: DecodedRaster | null
  rasterBounds: [number, number, number, number]
  rasterVersion?: number
  renderedCanvas: HTMLCanvasElement | null
  scaleType: string
  selectedCity?: CityFullRecord | null
  selectedCityKey?: string | null
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
  setCircleOverlayConfig?: React.Dispatch<React.SetStateAction<CircleOverlayConfig>>
  setHeightmapConfig?: React.Dispatch<React.SetStateAction<HeightmapConfig>>
  setHistoricalBordersConfig?: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
  setProjection: (p: ProjectionType) => void
  setStadesterConfig?: React.Dispatch<React.SetStateAction<StadesterConfig>>
  sidebarWidth?: number
  snapToKeyframes?: boolean
  stadesterCities?: CityPoint[]
  stadesterConfig?: StadesterConfig
  timelineYear?: number
  uiVisible?: boolean
  userRole?: UserRole
}
