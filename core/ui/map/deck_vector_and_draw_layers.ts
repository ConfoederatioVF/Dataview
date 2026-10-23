import { COORDINATE_SYSTEM } from '@deck.gl/core'
import {
  GeoJsonLayer,
  PathLayer,
  ScatterplotLayer,
  SolidPolygonLayer,
} from '@deck.gl/layers'
import { CountryFeature } from '@framework/geopng/polygon_binning.ts'
import { transformGeometryToEqualEarth } from '@framework/geopng/equal_earth.ts'
import { sanitizePolygonGeometry } from '@framework/geopng/polygon_sanitizer.ts'
import { projectLngLatToLayerCoords } from '@framework/geopng/polygon_draw_tool.ts'
import type {
  CircleOverlayConfig,
  HeightmapConfig,
  ProjectionType,
} from '@framework/geopng/types.ts'
import { SquareMarkerLayer } from './SquareMarkerLayer'
import { GlobeAntipodeCullExtension } from './layers/GlobeAntipodeCullExtension'
import { hexToRgb } from './deck_layer_palette_utils'
import { ElevationSpikePoint } from './use_elevation_spikes'
import { CirclePixelPoint } from './use_circle_overlay'

export interface BuildElevationSpikesOptions {
  countries_mode?: boolean
  effective_selected_array: CountryFeature[]
  elevation_spikes_data: { points: ElevationSpikePoint[] }
  heightmap_config: HeightmapConfig
  invert_palette?: boolean
  is_cartesian: boolean
  is_drawing: boolean
  palette: any
  projection: ProjectionType
}

export function buildElevationSpikesLayer (arg0_options: BuildElevationSpikesOptions): SolidPolygonLayer | null {
  //Convert from parameters
  let countries_mode = arg0_options.countries_mode
  let effective_selected_array = arg0_options.effective_selected_array
  let elevation_spikes_data = arg0_options.elevation_spikes_data
  let heightmap_config = arg0_options.heightmap_config
  let invert_palette = arg0_options.invert_palette
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let palette = arg0_options.palette
  let projection = arg0_options.projection

  //Guard clauses
  if (!heightmap_config.enabled || !elevation_spikes_data.points || elevation_spikes_data.points.length === 0)
    return null

  //Declare local instance variables
  let spike_key = (countries_mode && effective_selected_array.length > 0)
    ? `iso-${effective_selected_array.map((c) => c.properties.iso_a3 || c.properties.name).sort().join('_') || 'empty'}`
    : 'global'

  //Return statement
  return new SolidPolygonLayer({
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
}


export interface BuildCircleOverlayOptions {
  circle_overlay_config: CircleOverlayConfig
  circle_pixel_data: CirclePixelPoint[]
  is_cartesian: boolean
  is_drawing: boolean
  projection: ProjectionType
}

export function buildCircleOverlayLayers (arg0_options: BuildCircleOverlayOptions): ScatterplotLayer[] {
  //Convert from parameters
  let circle_overlay_config = arg0_options.circle_overlay_config
  let circle_pixel_data = arg0_options.circle_pixel_data
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let projection = arg0_options.projection

  //Guard clauses
  if (!circle_pixel_data || circle_pixel_data.length === 0)
    return []

  //Declare local instance variables
  let halo_w = circle_overlay_config.haloWidth ?? 1
  let stroke_w = circle_overlay_config.strokeWidth || 2

  //Return statement
  return [
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
    }),
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
    }),
  ]
}


export interface BuildCustomVectorOptions {
  custom_vector_features?: CountryFeature[]
  custom_vector_visible: boolean
  is_cartesian: boolean
  is_drawing: boolean
  onHoverCustomVectorFeature?: (arg0_feature: CountryFeature | null, arg1_x?: number, arg2_y?: number) => void
  onSelectCustomVectorFeature?: (arg0_feature: CountryFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  projection: ProjectionType
}

export function buildCustomVectorLayer (arg0_options: BuildCustomVectorOptions): GeoJsonLayer | null {
  //Convert from parameters
  let custom_vector_features = arg0_options.custom_vector_features
  let custom_vector_visible = arg0_options.custom_vector_visible
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let onHoverCustomVectorFeature = arg0_options.onHoverCustomVectorFeature
  let onSelectCustomVectorFeature = arg0_options.onSelectCustomVectorFeature
  let projection = arg0_options.projection

  //Guard clauses
  if (!custom_vector_features || custom_vector_features.length === 0 || !custom_vector_visible)
    return null

  //Function body
  let custom_vector_data = (projection === 'EqualEarth')
    ? custom_vector_features.map((arg0_f) => ({
        ...arg0_f,
        geometry: transformGeometryToEqualEarth(sanitizePolygonGeometry(arg0_f.geometry)),
      }))
    : custom_vector_features.map((arg0_f) => ({
        ...arg0_f,
        geometry: sanitizePolygonGeometry(arg0_f.geometry),
      }))

  //Return statement
  return new GeoJsonLayer({
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
      if (arg0_info.object && onSelectCustomVectorFeature) {
        onSelectCustomVectorFeature(
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
      if (onHoverCustomVectorFeature) {
        onHoverCustomVectorFeature(arg0_info.object || null, arg0_info.x, arg0_info.y)
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
          cullMode: 'none',
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
}


export interface BuildDrawnPolygonOptions {
  drawn_polygon_feature?: CountryFeature | null
  is_cartesian: boolean
  is_drawing: boolean
  onSelectDrawnPolygon?: (arg0_feature: CountryFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  projection: ProjectionType
}

export function buildDrawnPolygonLayer (arg0_options: BuildDrawnPolygonOptions): GeoJsonLayer | null {
  //Convert from parameters
  let drawn_polygon_feature = arg0_options.drawn_polygon_feature
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let onSelectDrawnPolygon = arg0_options.onSelectDrawnPolygon
  let projection = arg0_options.projection

  //Guard clauses
  if (!drawn_polygon_feature || is_drawing)
    return null

  //Function body
  let drawn_data = (projection === 'EqualEarth')
    ? [{
        ...drawn_polygon_feature,
        geometry: transformGeometryToEqualEarth(drawn_polygon_feature.geometry),
      }]
    : [drawn_polygon_feature]

  //Return statement
  return new GeoJsonLayer({
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
      if (arg0_info.object && onSelectDrawnPolygon) {
        onSelectDrawnPolygon(
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
          cullMode: 'none',
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
}


export interface BuildCountryHighlightOptions {
  countries_mode?: boolean
  effective_selected_array: CountryFeature[]
  hovered_country?: CountryFeature | null
  is_cartesian: boolean
  is_drawing: boolean
  projection: ProjectionType
}

export function buildCountryHighlightLayers (arg0_options: BuildCountryHighlightOptions): GeoJsonLayer[] {
  //Convert from parameters
  let countries_mode = arg0_options.countries_mode
  let effective_selected_array = arg0_options.effective_selected_array
  let hovered_country = arg0_options.hovered_country
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let projection = arg0_options.projection

  //Declare local instance variables
  let layers: GeoJsonLayer[] = []

  //8c-2. Selected Countries Highlight (Unified across Modern Natural Earth and Atlas Historical Borders)
  if (effective_selected_array.length > 0) {
    let selected_data = (projection === 'EqualEarth')
      ? effective_selected_array.map((arg0_c: any) => {
          let geom = (arg0_c.raw_feature && arg0_c.raw_feature.geometry) ? arg0_c.raw_feature.geometry : arg0_c.geometry
          return {
            ...arg0_c,
            geometry: transformGeometryToEqualEarth(sanitizePolygonGeometry(geom)),
          }
        })
      : effective_selected_array.map((arg0_c: any) => {
          let geom = (arg0_c.raw_feature && arg0_c.raw_feature.geometry) ? arg0_c.raw_feature.geometry : arg0_c.geometry
          return {
            ...arg0_c,
            geometry: sanitizePolygonGeometry(geom),
          }
        })

    let selected_key = effective_selected_array
      .map((arg0_c: any) => {
        let iso = arg0_c.properties?.iso_a3
        if (iso && iso !== '-99')
          return iso
        if (arg0_c.properties?.gwcode !== undefined && arg0_c.properties?.gwcode !== null)
          return `gw_${arg0_c.properties.gwcode}`
        if (arg0_c.id !== undefined && arg0_c.id !== null)
          return String(arg0_c.id)
        if (arg0_c.properties?.id !== undefined && arg0_c.properties?.id !== null)
          return String(arg0_c.properties.id)
        return arg0_c.properties?.name || 'sel'
      })
      .join('_')

    layers.push(
      new GeoJsonLayer({
        id: `countries-selected-${projection}-${selected_key}`,
        data: selected_data,
        coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
        filled: true,
        getFillColor: [200, 40, 40, 35],
        stroked: true,
        getLineColor: [200, 40, 40, 255],
        getLineWidth: 2.5,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 2,
        updateTriggers: {
          getFillColor: [selected_key],
          getLineColor: [selected_key],
        },
        parameters: { depthTest: false },
        extensions: (projection === 'Globe') ? [new GlobeAntipodeCullExtension({ cullThreshold: -0.005 })] : [],
      })
    )
  }

  //8c-3. Hovered Country Highlight in Countries Mode
  let is_hovered_already_selected = effective_selected_array.some((arg0_c: any) => {
    if (!hovered_country)
      return false
    return (
      (arg0_c.properties?.iso_a3 && arg0_c.properties.iso_a3 !== '-99' && arg0_c.properties.iso_a3 === hovered_country.properties?.iso_a3) ||
      (arg0_c.id !== undefined && hovered_country.id !== undefined && arg0_c.id === hovered_country.id) ||
      (arg0_c.properties?.id !== undefined && hovered_country.properties?.id !== undefined && arg0_c.properties.id === hovered_country.properties.id) ||
      (arg0_c.properties?.gwcode !== undefined && hovered_country.properties?.gwcode !== undefined && arg0_c.properties.gwcode === hovered_country.properties.gwcode) ||
      Boolean(arg0_c.properties?.name && hovered_country.properties?.name && arg0_c.properties.name === hovered_country.properties.name)
    )
  })

  if (!is_drawing && countries_mode && hovered_country && !is_hovered_already_selected) {
    let hov_key = (hovered_country.properties?.iso_a3 && hovered_country.properties.iso_a3 !== '-99')
      ? hovered_country.properties.iso_a3
      : (hovered_country.properties?.gwcode !== undefined && hovered_country.properties?.gwcode !== null)
        ? `gw_${hovered_country.properties.gwcode}`
        : (hovered_country.properties?.adm0_a3 || (hovered_country.id !== undefined && hovered_country.id !== null ? String(hovered_country.id) : '') || hovered_country.properties?.name || 'hov')

    let hov_geom = (hovered_country as any).raw_feature?.geometry || hovered_country.geometry
    let clean_hov_geom = sanitizePolygonGeometry(hov_geom)
    let hovered_data = (projection === 'EqualEarth')
      ? [{ ...hovered_country, geometry: transformGeometryToEqualEarth(clean_hov_geom) }]
      : [{ ...hovered_country, geometry: clean_hov_geom }]

    layers.push(
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

  //Return statement
  return layers
}


export interface BuildDrawToolLayersOptions {
  cursor_lng_lat?: [number, number] | null
  dragged_vertex_index?: number | null
  draw_points: [number, number][]
  hovered_vertex_index?: number | null
  is_cartesian: boolean
  is_drawing: boolean
  is_editing_shape: boolean
  onFinishDraw?: () => void
  projection: ProjectionType
}

export function buildDrawToolLayers (arg0_options: BuildDrawToolLayersOptions): any[] {
  //Convert from parameters
  let cursor_lng_lat = arg0_options.cursor_lng_lat
  let dragged_vertex_index = arg0_options.dragged_vertex_index ?? null
  let draw_points = arg0_options.draw_points || []
  let hovered_vertex_index = arg0_options.hovered_vertex_index ?? null
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let is_editing_shape = arg0_options.is_editing_shape
  let onFinishDraw = arg0_options.onFinishDraw
  let projection = arg0_options.projection

  //Guard clauses
  if (!is_drawing || draw_points.length === 0)
    return []

  //Declare local instance variables
  let layers: any[] = []
  let draw_points_layer_coords: [number, number][] = draw_points.map((arg0_pt) =>
    projectLngLatToLayerCoords(arg0_pt[0], arg0_pt[1], projection)
  )

  //Preview fill (only placed vertices, never rubberband cursor, with unique id per vertex count)
  if (draw_points_layer_coords.length >= 3) {
    let closed_preview_coords = [...draw_points_layer_coords, draw_points_layer_coords[0]]
    let preview_geojson_data = [
      {
        geometry: {
          coordinates: [closed_preview_coords],
          type: 'Polygon',
        },
        properties: {},
        type: 'Feature',
      },
    ]

    layers.push(
      new GeoJsonLayer({
        id: `draw-tool-preview-${projection}-${draw_points.length}`,
        data: preview_geojson_data as any,
        filled: true,
        stroked: false,
        pickable: false,
        getFillColor: [200, 40, 40, 30],
        coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
        updateTriggers: {
          getFillColor: [draw_points.length, is_editing_shape],
        },
        _subLayerProps: {
          'polygons-fill': {
            parameters: {
              cullMode: 'none',
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

  //Elastic path or closed polygon perimeter
  let path_data = (is_editing_shape && draw_points_layer_coords.length >= 3)
    ? [...draw_points_layer_coords, draw_points_layer_coords[0]]
    : (cursor_lng_lat && !is_editing_shape
      ? [...draw_points_layer_coords, projectLngLatToLayerCoords(cursor_lng_lat[0], cursor_lng_lat[1], projection)]
      : draw_points_layer_coords)

  layers.push(
    new PathLayer({
      id: `draw-tool-path-${projection}`,
      data: [{ path: path_data }],
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

  //Vertices as sharp uniform red squares
  let vertex_data = draw_points.map((arg0_pt, arg1_idx) => {
    let coords = projectLngLatToLayerCoords(arg0_pt[0], arg0_pt[1], projection)
    return {
      idx: arg1_idx,
      position: [coords[0], coords[1], 0],
    }
  })

  layers.push(
    new SquareMarkerLayer({
      id: `draw-tool-vertices-${projection}`,
      data: vertex_data,
      getPosition: (arg0_d: any) => arg0_d.position,
      getRadius: (arg0_d: any) => {
        let is_active = (arg0_d.idx === hovered_vertex_index || arg0_d.idx === dragged_vertex_index)
        return is_active ? 5.5 : 4.5
      },
      radiusUnits: 'pixels',
      getFillColor: [200, 40, 40, 255],
      stroked: true,
      getLineColor: (arg0_d: any) => {
        let is_active = (arg0_d.idx === hovered_vertex_index || arg0_d.idx === dragged_vertex_index)
        return is_active ? [255, 255, 255, 255] : [255, 255, 255, 220]
      },
      getLineWidth: (arg0_d: any) => {
        let is_active = (arg0_d.idx === hovered_vertex_index || arg0_d.idx === dragged_vertex_index)
        return is_active ? 2 : 1.5
      },
      lineWidthUnits: 'pixels',
      pickable: is_drawing,
      updateTriggers: {
        getLineColor: [hovered_vertex_index, dragged_vertex_index],
        getLineWidth: [hovered_vertex_index, dragged_vertex_index],
        getRadius: [hovered_vertex_index, dragged_vertex_index],
      },
      onClick: (arg0_info: any) => {
        if (is_drawing && draw_points.length >= 3 && !is_editing_shape && arg0_info.object?.idx === 0) {
          if (onFinishDraw)
            onFinishDraw()
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

  //Return statement
  return layers
}
