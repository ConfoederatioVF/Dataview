import { COORDINATE_SYSTEM } from '@deck.gl/core'
import { GeoJsonLayer } from '@deck.gl/layers'
import { transformGeometryToEqualEarth } from '@framework/geopng/equal_earth.ts'
import { GlobeAntipodeCullExtension } from './layers/GlobeAntipodeCullExtension'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import type { HistoricalBordersConfig, ProjectionType } from '@framework/geopng/types.ts'

export interface HistoricalBordersLayerOptions {
  config?: HistoricalBordersConfig
  hoveredHistoricalId?: string | number | null
  historicalBordersData?: {
    features: HistoricalBorderFeature[]
    type: 'FeatureCollection'
  } | null
  isDrawing?: boolean
  onHoverHistoricalFeature?: (arg0_feature: HistoricalBorderFeature | null, arg1_x?: number, arg2_y?: number) => void
  onSelectHistoricalFeature?: (arg0_feature: HistoricalBorderFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  projection: ProjectionType
  selectedHistoricalId?: string | number | null
  timelineYear: number
}

/**
 * Parses a hex colour string into an [r, g, b, a] tuple.
 *
 * @param {string} arg0_hex
 * @param {number} [arg1_alpha=255]
 *
 * @returns {[number, number, number, number]}
 */
function parseHexToRgba (arg0_hex: string, arg1_alpha: number = 255): [number, number, number, number] {
  //Convert from parameters
  let alpha = arg1_alpha
  let hex = (arg0_hex || '#d4af37').replace('#', '')

  //Function body
  if (hex.length === 3)
    hex = hex.split('').map((arg0_c) => arg0_c + arg0_c).join('')

  let num = parseInt(hex, 16)
  if (Number.isNaN(num))
    return [212, 175, 55, alpha]

  //Return statement
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha]
}

let cached_layer_data_map: WeakMap<object, Map<string, any[]>> = new WeakMap()

/**
 * Builds deck.gl GeoJsonLayers rendering temporally sliced historical borders from CShapes-2.0 and atlas.naissance.
 * Memoises transformed geometries and isolates hover and selection into lightweight overlay layers for optimal FPS.
 *
 * @param {HistoricalBordersLayerOptions} arg0_options
 *
 * @returns {GeoJsonLayer[] | null}
 */
export function createHistoricalBordersDeckLayer (
  arg0_options: HistoricalBordersLayerOptions
): GeoJsonLayer[] | null {
  //Convert from parameters
  let options = (arg0_options) ? arg0_options : ({} as HistoricalBordersLayerOptions)
  let borders_data = options.historicalBordersData
  let config = options.config
  let hovered_id = options.hoveredHistoricalId
  let on_hover = options.onHoverHistoricalFeature
  let on_select = options.onSelectHistoricalFeature
  let projection = options.projection
  let selected_id = options.selectedHistoricalId
  let timeline_year = options.timelineYear

  //Declare local instance variables
  let base_layer: GeoJsonLayer
  let base_rgba: [number, number, number, number]
  let date_tag: string | number
  let feature_count: number
  let fill_alpha: number
  let fill_opacity: number
  let hovered_feat: any
  let is_cartesian: boolean
  let is_drawing: boolean = Boolean(options.isDrawing)
  let layer_data: any[]
  let layer_id: string
  let layers_array: GeoJsonLayer[] = []
  let proj_map: Map<string, any[]>
  let selected_feat: any
  let stroke_color: string
  let stroke_width: number

  //Guard clauses
  if (!borders_data || !borders_data.features || borders_data.features.length === 0)
    return null

  //Function body
  feature_count = borders_data.features.length
  fill_opacity = (config?.fillOpacity !== undefined) ? config.fillOpacity : 0.0
  fill_alpha = Math.round(fill_opacity * 255)
  is_cartesian = (projection === 'Equirectangular' || projection === 'EqualEarth')
  stroke_color = config?.strokeColor || '#d4af37'
  stroke_width = (config?.strokeWidth !== undefined) ? config.strokeWidth : 1.25
  base_rgba = parseHexToRgba(stroke_color, 200)

  date_tag = borders_data.features[0]?.properties?.date || timeline_year
  layer_id = `historical-borders-${projection}-${timeline_year}-${date_tag}-${feature_count}`

  //Retrieve or create memoised layer data with stable reference across renders
  if (!cached_layer_data_map.has(borders_data))
    cached_layer_data_map.set(borders_data, new Map())

  proj_map = cached_layer_data_map.get(borders_data)!
  if (proj_map.has(projection)) {
    layer_data = proj_map.get(projection)!
  } else {
    if (projection === 'EqualEarth') {
      layer_data = borders_data.features.map((arg0_f) => ({
        ...arg0_f,
        geometry: transformGeometryToEqualEarth(arg0_f.geometry),
        raw_feature: arg0_f,
      }))
    } else {
      layer_data = borders_data.features.map((arg0_f) => ({
        ...arg0_f,
        raw_feature: arg0_f,
      }))
    }
    proj_map.set(projection, layer_data)
  }

  //1. Base historical borders layer (static GPU buffers, no per-hover attribute updates)
  base_layer = new GeoJsonLayer({
    id: layer_id,
    data: layer_data,
    coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
    pickable: !is_drawing,
    autoHighlight: !is_drawing,
    highlightColor: [255, 255, 255, 50],
    stroked: true,
    filled: fill_alpha > 0,
    lineWidthUnits: 'pixels',
    lineWidthMinPixels: 1,
    getLineWidth: stroke_width,
    getLineColor: base_rgba,
    getFillColor: (arg0_d: any) => {
      let polity_color = arg0_d.properties?.symbol?.polygonFill || arg0_d.properties?.symbol?.fillColor || arg0_d.properties?.fillColor || arg0_d.properties?.color
      if (polity_color && fill_alpha > 0)
        return parseHexToRgba(polity_color, fill_alpha)

      return [0, 0, 0, 0]
    },
    updateTriggers: {
      getFillColor: [stroke_color, fill_opacity],
      getLineColor: [stroke_color],
      getLineWidth: [stroke_width],
    },
    onClick: (arg0_info: any) => {
      if (is_drawing)
        return false
      if (arg0_info.object && on_select) {
        let coord: [number, number] | undefined = arg0_info.coordinate
          ? [arg0_info.coordinate[0], arg0_info.coordinate[1]]
          : undefined
        let raw_feat = arg0_info.object.raw_feature || arg0_info.object
        on_select(raw_feat, coord, arg0_info.x, arg0_info.y)
        return true
      }
      return false
    },
    onHover: (arg0_info: any) => {
      if (is_drawing)
        return
      if (on_hover) {
        let raw_feat = arg0_info.object?.raw_feature || arg0_info.object || null
        on_hover(raw_feat, arg0_info.x, arg0_info.y)
      }
    },
    extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
    parameters: {
      depthTest: false,
    },
  })
  layers_array.push(base_layer)

  //2. Selected historical feature overlay (single feature, zero impact on base layer)
  if (selected_id) {
    selected_feat = layer_data.find((arg0_d: any) =>
      arg0_d.id === selected_id ||
      arg0_d.properties?.id === selected_id ||
      arg0_d.properties?.gwcode === selected_id ||
      arg0_d.raw_feature?.id === selected_id ||
      arg0_d.raw_feature?.properties?.id === selected_id ||
      arg0_d.raw_feature?.properties?.gwcode === selected_id
    )

    if (selected_feat) {
      layers_array.push(
        new GeoJsonLayer({
          id: `historical-borders-selected-${projection}-${selected_id}`,
          data: [selected_feat],
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          pickable: false,
          stroked: true,
          filled: true,
          getLineWidth: Math.max(stroke_width * 2.0, 2.5),
          getLineColor: [220, 38, 38, 255],
          getFillColor: [220, 38, 38, Math.max(fill_alpha, 55)],
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 2,
          extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
          parameters: {
            depthTest: false,
          },
        })
      )
    }
  }

  //3. Hovered historical feature outline overlay (single feature stroke outline)
  if (!is_drawing && hovered_id && hovered_id !== selected_id) {
    hovered_feat = layer_data.find((arg0_d: any) =>
      arg0_d.id === hovered_id ||
      arg0_d.properties?.id === hovered_id ||
      arg0_d.properties?.gwcode === hovered_id ||
      arg0_d.raw_feature?.id === hovered_id ||
      arg0_d.raw_feature?.properties?.id === hovered_id ||
      arg0_d.raw_feature?.properties?.gwcode === hovered_id
    )

    if (hovered_feat) {
      layers_array.push(
        new GeoJsonLayer({
          id: `historical-borders-hovered-${projection}-${hovered_id}`,
          data: [hovered_feat],
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          pickable: false,
          stroked: true,
          filled: false,
          getLineWidth: Math.max(stroke_width * 1.5, 2.0),
          getLineColor: [255, 255, 255, 240],
          lineWidthUnits: 'pixels',
          lineWidthMinPixels: 1.5,
          extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
          parameters: {
            depthTest: false,
          },
        })
      )
    }
  }

  //Return statement
  return layers_array
}

