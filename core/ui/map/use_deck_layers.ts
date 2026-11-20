import { useMemo } from 'react'
import { COORDINATE_SYSTEM } from '@deck.gl/core'
import {
  BitmapLayer,
  GeoJsonLayer,
  PathLayer,
  PolygonLayer,
} from '@deck.gl/layers'
import { TileLayer } from '@deck.gl/geo-layers'
import { CountryFeature } from '@framework/geopng/polygon_binning.ts'
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
import { GlobeAntipodeCullExtension } from './layers/GlobeAntipodeCullExtension'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import {
  normalizeCapitalNameStem,
  normalizePrimaryCityKey,
} from '@framework/stadester/city_metadata_framework.ts'
import {
  buildAuthoritativeCapitalsByCity,
  reconcileCitiesWithAuthoritativeBorders,
} from './deck_capital_reconciliation.ts'
import { MAP_CONFIG } from '@common'
import {
  EquirectangularTileset2D,
  WarpedTileBitmapLayer,
  TesselatedBitmapLayer,
} from './deck_layers'
import { ElevationSpikePoint } from './use_elevation_spikes'
import { CirclePixelPoint } from './use_circle_overlay'
import type { WorkerBinaryAttributes } from '@framework/stadester/stadester.worker.ts'
import {
  buildStadesterCityLayers,
  buildStadesterCityPoints,
} from './deck_stadester_layers.ts'
import {
  buildCircleOverlayLayers,
  buildCountryHighlightLayers,
  buildCustomVectorLayer,
  buildDrawToolLayers,
  buildDrawnPolygonLayer,
  buildElevationSpikesLayer,
} from './deck_vector_and_draw_layers.ts'

//Basemaps driven by MAP_CONFIG (config/map.json5)
let esri_basemap_urls_obj: Record<string, string> = {}
for (let i = 0; i < MAP_CONFIG.basemapLayers.length; i++) {
  let local_layer = MAP_CONFIG.basemapLayers[i]
  if (local_layer.url)
    esri_basemap_urls_obj[local_layer.id] = local_layer.url
}

export interface UseDeckLayersParams {
  activeLayerId?: string | null
  basemap: string
  circleOverlayConfig: CircleOverlayConfig
  circlePixelData: CirclePixelPoint[]
  countriesMode?: boolean
  cursorLngLat?: [number, number] | null
  customVectorFeatures?: CountryFeature[]
  customVectorVisible?: boolean
  draggedVertexIndex?: number | null
  drawPoints?: [number, number][]
  drawnPolygonFeature?: CountryFeature | null
  elevationSpikesData: { points: ElevationSpikePoint[] }
  equalEarthLandGeoJson: any
  graticulePaths: { path: [number, number][] }[]
  heightmapConfig: HeightmapConfig
  historicalBordersConfig?: HistoricalBordersConfig
  historicalBordersData?: {
    count?: number
    date?: string
    features: HistoricalBorderFeature[]
    tag?: string
    type: 'FeatureCollection'
    year?: number
    [key: string]: any
  } | null
  hoveredCity?: CityPoint | null
  hoveredCountry?: CountryFeature | null
  hoveredHistoricalFeature?: HistoricalBorderFeature | null
  hoveredVertexIndex?: number | null
  invertPalette?: boolean
  isDrawing?: boolean
  isEditingShape?: boolean
  isMobile?: boolean
  landGeoJson: any
  maxVal: number
  minVal: number
  onFinishDraw?: () => void
  onHoverCity?: (city: CityPoint | null, x?: number, y?: number) => void
  onHoverCustomVectorFeature?: (arg0_feature: CountryFeature | null, arg1_x?: number, arg2_y?: number) => void
  onHoverHistoricalFeature?: (arg0_feature: HistoricalBorderFeature | null, arg1_x?: number, arg2_y?: number) => void
  onSelectCity?: (city: CityPoint, coord?: [number, number], screen_x?: number, screen_y?: number) => void
  onSelectCustomVectorFeature?: (arg0_feature: CountryFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  onSelectDrawnPolygon?: (arg0_feature: CountryFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  onSelectHistoricalFeature?: (arg0_feature: HistoricalBorderFeature, arg1_coord?: [number, number], arg2_x?: number, arg3_y?: number) => void
  opacity: number
  palette: any
  projection: ProjectionType
  raster: DecodedRaster | null
  rasterBounds: [number, number, number, number]
  rasterVersion?: number
  renderedCanvas: HTMLCanvasElement | null
  selectedCityKey?: string | null
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
  selectedHistoricalFeature?: HistoricalBorderFeature | null
  showGraticule: boolean
  stadesterBinaryAttributes?: WorkerBinaryAttributes
  stadesterCities?: CityPoint[]
  stadesterConfig?: StadesterConfig
  stadesterLabels?: any[]
  stadesterPoints?: any[]
  timelineYear?: number
  viewState?: any
  viewport?: any
}

/**
 * Hook to assemble the deck.gl layer stack across 2D/3D projections.
 * Composes basemaps, graticules, raster surface, elevation spikes, equal-area circles, and country masks.
 *
 * @param {UseDeckLayersParams} arg0_options
 *
 * @returns {Array}
 */
export function useDeckLayers (arg0_options: UseDeckLayersParams): any[] {
  //Convert from parameters
  let options = (arg0_options) ? arg0_options : ({} as UseDeckLayersParams)

  //Memoize Stadestér points to prevent GPU buffer re-uploading on mouse moves
  let b_scale = (options.stadesterConfig?.bubbleSize !== undefined) ? options.stadesterConfig.bubbleSize : 1
  let color_mode = options.stadesterConfig?.colorMode || 'growth'
  let growth_palette = options.stadesterConfig?.growthPalette || 'Rainbow'
  let hovered_city_region = (color_mode === 'region' || color_mode === 'continent')
    ? (options.hoveredCity?.region ? options.hoveredCity.region.toLowerCase().trim() : null)
    : null
  let is_cities_enabled = Boolean(options.stadesterConfig?.enabled)
  let is_labels_visible = (options.stadesterConfig?.showLabels !== undefined) ? options.stadesterConfig.showLabels : true
  let is_mobile = Boolean(options.isMobile)
  let projection = options.projection
  let stadester_cities = options.stadesterCities
  let is_worker_points_matching_proj = Boolean(
    options.stadesterPoints &&
    options.stadesterPoints.length > 0 &&
    (!options.stadesterPoints[0]?.projection || options.stadesterPoints[0]?.projection === projection)
  )

  let stadester_points_data = useMemo(() => {
    if (is_worker_points_matching_proj)
      return []
    return buildStadesterCityPoints({
      b_scale,
      color_mode,
      growth_palette,
      is_cities_enabled,
      is_mobile,
      projection,
      stadester_cities,
    })
  }, [
    is_worker_points_matching_proj,
    is_cities_enabled,
    stadester_cities,
    b_scale,
    color_mode,
    growth_palette,
    is_mobile,
    projection,
  ])

  let effective_points = is_worker_points_matching_proj
    ? options.stadesterPoints!
    : stadester_points_data

  let border_lookup = useMemo(() => {
    let acapital_state_ids = new Set<string>()
    let active_capitals_by_key = new Map<string, any>()
    let active_capitals_by_name = new Map<string, any>()
    let active_capitals_list: any[] = []
    let active_polity_names = new Set<string>()
    let active_state_capitals_by_sid = new Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>()
    let active_state_ids = new Set<string>()
    let polity_features_by_name = new Map<string, any>()
    let polity_features_by_sid = new Map<string, any>()

    if (options.historicalBordersData && options.historicalBordersData.features) {
      for (let i = 0; i < options.historicalBordersData.features.length; i++) {
        let feat = options.historicalBordersData.features[i]
        let p = feat.properties
        if (!p)
          continue

        let polity_color = p.polygonFill ||
          p.symbol?.polygonFill ||
          p.fill_color ||
          p.fillColor ||
          p.color ||
          p.symbol?.fillColor ||
          p.symbol?.strokeColor ||
          p.strokeColor
        let s_id = p.state_id !== undefined ? String(p.state_id) : (p.id !== undefined ? String(p.id) : undefined)
        let feat_bbox = (feat as any).bbox || p.bbox
        let feat_area = p.area !== undefined ? Number(p.area) : 0
        if (!feat_area && feat_bbox && Array.isArray(feat_bbox) && feat_bbox.length >= 4)
          feat_area = Math.max(0, (feat_bbox[2] - feat_bbox[0])*(feat_bbox[3] - feat_bbox[1]))

        let feat_meta = {
          area: feat_area,
          bbox: feat_bbox,
          color: polity_color,
          geometry: feat.geometry,
          polity_name: p.name,
          state_id: p.state_id ?? p.id,
        }

        if (s_id) {
          active_state_ids.add(s_id)
          if (!polity_features_by_sid.has(s_id) || feat_area > (polity_features_by_sid.get(s_id)?.area || 0))
            polity_features_by_sid.set(s_id, feat_meta)
        }
        if (p.state_id !== undefined) {
          let raw_sid = String(p.state_id)
          active_state_ids.add(raw_sid)
          if (!polity_features_by_sid.has(raw_sid) || feat_area > (polity_features_by_sid.get(raw_sid)?.area || 0))
            polity_features_by_sid.set(raw_sid, feat_meta)
        }
        if (p.id !== undefined) {
          let raw_id = String(p.id)
          active_state_ids.add(raw_id)
          if (!polity_features_by_sid.has(raw_id) || feat_area > (polity_features_by_sid.get(raw_id)?.area || 0))
            polity_features_by_sid.set(raw_id, feat_meta)
        }
        if (p.name) {
          let nl = p.name.toLowerCase().trim()
          active_polity_names.add(nl)
          if (!polity_features_by_name.has(nl) || feat_area > (polity_features_by_name.get(nl)?.area || 0))
            polity_features_by_name.set(nl, feat_meta)
        }
        if (p.name_long) {
          let nll = p.name_long.toLowerCase().trim()
          active_polity_names.add(nll)
          if (!polity_features_by_name.has(nll) || feat_area > (polity_features_by_name.get(nll)?.area || 0))
            polity_features_by_name.set(nll, feat_meta)
        }

        if (p.is_acapital) {
          if (s_id)
            acapital_state_ids.add(s_id)
        } else if (p.capname || p.capkey || p.cap_coords || (p.caplong !== undefined && p.caplat !== undefined)) {
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
            area: feat_area,
            bbox: feat_bbox,
            cap_coords: (cap_lon !== undefined && cap_lat !== undefined) ? [cap_lon, cap_lat] as [number, number] : undefined,
            capkey: p.capkey,
            capname: p.capname,
            color: polity_color,
            geometry: feat.geometry,
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
            let existing_k = active_capitals_by_key.get(p.capkey)
            let prim_k = normalizePrimaryCityKey(p.capkey)
            if (!existing_k || (cap_entry.area > (existing_k.area || 0))) {
              active_capitals_by_key.set(p.capkey, cap_entry)
              active_capitals_by_key.set(p.capkey.toLowerCase().trim(), cap_entry)
              if (prim_k)
                active_capitals_by_key.set(prim_k, cap_entry)
            }
          }
          if (p.capname) {
            let names = p.capname.split(/[,/]/).map((s: string) => s.trim().toLowerCase()).filter(Boolean)
            for (let n of names) {
              let existing_n = active_capitals_by_name.get(n)
              if (!existing_n || (cap_entry.area > (existing_n.area || 0))) {
                active_capitals_by_name.set(n, cap_entry)
                let n_nfd = n.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                let n_clean = n_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
                let n_stem = normalizeCapitalNameStem(n)
                if (n_clean)
                  active_capitals_by_name.set(n_clean, cap_entry)
                if (n_stem)
                  active_capitals_by_name.set(n_stem, cap_entry)
              }
            }
          }
        }
      }
    }

    return {
      acapital_state_ids,
      active_capitals_by_key,
      active_capitals_by_name,
      active_capitals_list,
      active_polity_names,
      active_state_capitals_by_sid,
      active_state_ids,
      polity_features: {
        by_name: polity_features_by_name,
        by_sid: polity_features_by_sid,
      },
    }
  }, [options.historicalBordersData])

  let capital_source_points = (stadester_cities && stadester_cities.length > 0) ? stadester_cities : effective_points

  let authoritative_capitals_by_city = useMemo(() => {
    return buildAuthoritativeCapitalsByCity(
      border_lookup.active_capitals_list,
      capital_source_points,
      options.timelineYear
    )
  }, [border_lookup.active_capitals_list, capital_source_points, options.timelineYear])

  let reconciled_capital_patch_map = useMemo(() => {
    let patch_map = new Map<string, any>()
    if (!capital_source_points || capital_source_points.length === 0)
      return patch_map
    if (
      border_lookup.active_capitals_by_key.size === 0 &&
      border_lookup.active_capitals_by_name.size === 0 &&
      border_lookup.active_capitals_list.length === 0 &&
      border_lookup.acapital_state_ids.size === 0 &&
      border_lookup.active_state_ids.size === 0
    ) {
      return patch_map
    }

    let reconciled_all = reconcileCitiesWithAuthoritativeBorders(
      capital_source_points,
      border_lookup.active_capitals_by_key,
      border_lookup.active_capitals_by_name,
      border_lookup.acapital_state_ids,
      border_lookup.active_state_capitals_by_sid,
      border_lookup.active_state_ids,
      border_lookup.active_polity_names,
      authoritative_capitals_by_city,
      border_lookup.active_capitals_list,
      border_lookup.polity_features
    )
    for (let i = 0; i < reconciled_all.length; i++) {
      let c = reconciled_all[i]
      if (c && c.key)
        patch_map.set(c.key, c)
    }
    return patch_map
  }, [capital_source_points, border_lookup, authoritative_capitals_by_city])

  let reconciled_stadester_labels = useMemo(() => {
    if (!is_cities_enabled || !is_labels_visible || !options.stadesterLabels || options.stadesterLabels.length === 0)
      return []
    if (options.stadesterLabels[0]?.projection && options.stadesterLabels[0].projection !== projection)
      return []

    let visible_label_cities = options.stadesterLabels.filter((arg0_c: any) =>
      arg0_c &&
      arg0_c.position &&
      Number.isFinite(arg0_c.position[0]) &&
      Number.isFinite(arg0_c.position[1]) &&
      typeof arg0_c.shortName === 'string' &&
      arg0_c.shortName.trim().length > 0
    )

    if (visible_label_cities.length === 0)
      return []

    if (
      border_lookup.active_capitals_by_key.size > 0 ||
      border_lookup.active_capitals_by_name.size > 0 ||
      border_lookup.active_capitals_list.length > 0 ||
      border_lookup.acapital_state_ids.size > 0 ||
      border_lookup.active_state_ids.size > 0
    ) {
      if (reconciled_capital_patch_map.size > 0) {
        let missing_indices: number[] = []
        let missing_items: any[] = []
        let patched_labels = new Array(visible_label_cities.length)

        for (let i = 0; i < visible_label_cities.length; i++) {
          let lbl = visible_label_cities[i]
          let patched = lbl.key ? reconciled_capital_patch_map.get(lbl.key) : undefined
          if (patched) {
            patched_labels[i] = {
              ...lbl,
              capitalColor: patched.capitalColor,
              capitalOf: patched.capitalOf,
              capitalStateId: patched.capitalStateId,
              capital_color: patched.capital_color,
              capital_state_id: patched.capital_state_id,
              capital_state_name: patched.capital_state_name,
              isCapital: patched.isCapital,
              is_capital: patched.is_capital,
            }
          } else {
            missing_indices.push(i)
            missing_items.push(lbl)
          }
        }

        if (missing_items.length > 0) {
          let reconciled_missing = reconcileCitiesWithAuthoritativeBorders(
            missing_items,
            border_lookup.active_capitals_by_key,
            border_lookup.active_capitals_by_name,
            border_lookup.acapital_state_ids,
            border_lookup.active_state_capitals_by_sid,
            border_lookup.active_state_ids,
            border_lookup.active_polity_names,
            authoritative_capitals_by_city,
            border_lookup.active_capitals_list
          )
          for (let i = 0; i < missing_indices.length; i++)
            patched_labels[missing_indices[i]] = reconciled_missing[i]
        }
        visible_label_cities = patched_labels
      } else {
        visible_label_cities = reconcileCitiesWithAuthoritativeBorders(
          visible_label_cities,
          border_lookup.active_capitals_by_key,
          border_lookup.active_capitals_by_name,
          border_lookup.acapital_state_ids,
          border_lookup.active_state_capitals_by_sid,
          border_lookup.active_state_ids,
          border_lookup.active_polity_names,
          authoritative_capitals_by_city,
          border_lookup.active_capitals_list
        )
      }
    }

    visible_label_cities.sort((arg0_a: any, arg0_b: any) => {
      let a_pop = (arg0_a.population !== undefined && !isNaN(arg0_a.population)) ? arg0_a.population : 0
      let b_pop = (arg0_b.population !== undefined && !isNaN(arg0_b.population)) ? arg0_b.population : 0
      return a_pop - b_pop
    })

    return visible_label_cities
  }, [
    is_cities_enabled,
    is_labels_visible,
    options.stadesterLabels,
    projection,
    border_lookup,
    authoritative_capitals_by_city,
    reconciled_capital_patch_map,
  ])

  //Return statement
  return useMemo(() => {
    //Declare local instance variables
    let basemap = options.basemap
    let circle_overlay_config = options.circleOverlayConfig
    let circle_pixel_data = options.circlePixelData
    let countries_mode = options.countriesMode
    let cursor_lng_lat = options.cursorLngLat
    let custom_vector_features = options.customVectorFeatures
    let custom_vector_visible = options.customVectorVisible !== false
    let dragged_vertex_index = options.draggedVertexIndex ?? null
    let draw_points = options.drawPoints || []
    let drawn_polygon_feature = options.drawnPolygonFeature
    let effective_selected_array: CountryFeature[] = []
    let elevation_spikes_data = options.elevationSpikesData
    let equal_earth_land_geo_json = options.equalEarthLandGeoJson
    let graticule_paths = options.graticulePaths
    let heightmap_config = options.heightmapConfig
    let hovered_country = options.hoveredCountry
    let hovered_vertex_index = options.hoveredVertexIndex ?? null
    let invert_palette = options.invertPalette
    let is_cartesian: boolean
    let is_drawing = Boolean(options.isDrawing)
    let is_editing_shape = Boolean(options.isEditingShape)
    let is_historical_hovered_selected: boolean
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
    let show_graticule = options.showGraticule

    is_cartesian = (projection === 'Equirectangular' || projection === 'EqualEarth')

    if (selected_countries && selected_countries.length > 0) {
      effective_selected_array = [...selected_countries]
      if (options.selectedHistoricalFeature) {
        let hist_feat = options.selectedHistoricalFeature as unknown as CountryFeature
        let hist_id = (hist_feat.id !== undefined && hist_feat.id !== null)
          ? String(hist_feat.id).replace(/^naissance_/, '')
          : (hist_feat.properties?.id !== undefined && hist_feat.properties?.id !== null ? String(hist_feat.properties.id).replace(/^naissance_/, '') : '')
        let hist_name = hist_feat.properties?.name

        let already_in = effective_selected_array.some((arg0_c: any) => {
          if (arg0_c === hist_feat)
            return true
          let c_id = (arg0_c.id !== undefined && arg0_c.id !== null)
            ? String(arg0_c.id).replace(/^naissance_/, '')
            : (arg0_c.properties?.id !== undefined && arg0_c.properties?.id !== null ? String(arg0_c.properties.id).replace(/^naissance_/, '') : '')
          if (c_id && hist_id && c_id === hist_id)
            return true
          if (hist_name && arg0_c.properties?.name && arg0_c.properties.name === hist_name)
            return true
          return false
        })
        if (!already_in)
          effective_selected_array.push(hist_feat)
      }
    } else if (selected_country) {
      effective_selected_array = [selected_country]
    } else if (options.selectedHistoricalFeature) {
      effective_selected_array = [options.selectedHistoricalFeature as unknown as CountryFeature]
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
          pickable: !is_drawing,
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
    let elevation_spikes_layer = buildElevationSpikesLayer({
      countries_mode,
      effective_selected_array,
      elevation_spikes_data,
      heightmap_config,
      invert_palette,
      is_cartesian,
      is_drawing,
      palette,
      projection,
    })
    if (elevation_spikes_layer)
      layers_array.push(elevation_spikes_layer)

    //5. High-Value Equal-Area Circle Pixels
    let circle_layers = buildCircleOverlayLayers({
      circle_overlay_config,
      circle_pixel_data,
      is_cartesian,
      is_drawing,
      projection,
    })
    for (let i = 0; i < circle_layers.length; i++)
      layers_array.push(circle_layers[i])

    //6. Historical Statistical Borders (atlas_dejure.naissance & atlas_defacto.naissance)
    is_historical_hovered_selected = Boolean(
      options.hoveredHistoricalFeature && effective_selected_array.some((arg0_c: any) => {
        let hf = options.hoveredHistoricalFeature!
        if (arg0_c === hf)
          return true
        let c_id = (arg0_c.id !== undefined && arg0_c.id !== null)
          ? String(arg0_c.id).replace(/^naissance_/, '')
          : (arg0_c.properties?.id !== undefined && arg0_c.properties?.id !== null ? String(arg0_c.properties.id).replace(/^naissance_/, '') : '')
        let hf_id = (hf.id !== undefined && hf.id !== null)
          ? String(hf.id).replace(/^naissance_/, '')
          : (hf.properties?.id !== undefined && hf.properties?.id !== null ? String(hf.properties.id).replace(/^naissance_/, '') : '')
        if (c_id && hf_id && c_id === hf_id)
          return true
        if (hf.properties?.name && arg0_c.properties?.name && arg0_c.properties.name === hf.properties.name)
          return true
        return false
      })
    )

    let historical_borders_layer = createHistoricalBordersDeckLayer({
      config: options.historicalBordersConfig,
      historicalBordersData: options.historicalBordersData,
      hoveredHistoricalId: !is_historical_hovered_selected ? (options.hoveredHistoricalFeature?.id || options.hoveredHistoricalFeature?.properties?.id) : null,
      isDrawing: is_drawing,
      onHoverHistoricalFeature: options.onHoverHistoricalFeature,
      onSelectHistoricalFeature: options.onSelectHistoricalFeature,
      projection,
      selectedHistoricalId: null,
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
    let custom_vector_layer = buildCustomVectorLayer({
      custom_vector_features,
      custom_vector_visible,
      is_cartesian,
      is_drawing,
      onHoverCustomVectorFeature: options.onHoverCustomVectorFeature,
      onSelectCustomVectorFeature: options.onSelectCustomVectorFeature,
      projection,
    })
    if (custom_vector_layer)
      layers_array.push(custom_vector_layer)

    //8c. Finalized User-Drawn Measurement Polygon
    let drawn_polygon_layer = buildDrawnPolygonLayer({
      drawn_polygon_feature,
      is_cartesian,
      is_drawing,
      onSelectDrawnPolygon: options.onSelectDrawnPolygon,
      projection,
    })
    if (drawn_polygon_layer)
      layers_array.push(drawn_polygon_layer)

    //8c-2 / 8c-3. Country Highlights
    let highlight_layers = buildCountryHighlightLayers({
      countries_mode,
      effective_selected_array,
      hovered_country,
      is_cartesian,
      is_drawing,
      projection,
    })
    for (let i = 0; i < highlight_layers.length; i++)
      layers_array.push(highlight_layers[i])

    //8d. In-Progress Polygon Draw Tool (Vertices, Elastic Path, and Area Fill Preview)
    let draw_tool_layers = buildDrawToolLayers({
      cursor_lng_lat,
      dragged_vertex_index,
      draw_points,
      hovered_vertex_index,
      is_cartesian,
      is_drawing,
      is_editing_shape,
      onFinishDraw: options.onFinishDraw,
      projection,
    })
    for (let i = 0; i < draw_tool_layers.length; i++)
      layers_array.push(draw_tool_layers[i])

    //9. Stadestér Historical Cities
    let city_layers = buildStadesterCityLayers({
      acapital_state_ids: border_lookup.acapital_state_ids,
      active_capitals_by_key: border_lookup.active_capitals_by_key,
      active_capitals_by_name: border_lookup.active_capitals_by_name,
      active_capitals_list: border_lookup.active_capitals_list,
      active_polity_names: border_lookup.active_polity_names,
      active_state_capitals_by_sid: border_lookup.active_state_capitals_by_sid,
      active_state_ids: border_lookup.active_state_ids,
      authoritative_capitals_by_city,
      binary_attributes: options.stadesterBinaryAttributes,
      effective_points,
      hovered_region: hovered_city_region,
      is_cartesian,
      is_drawing,
      is_mobile,
      onHoverCity: options.onHoverCity,
      onSelectCity: options.onSelectCity,
      polity_features: border_lookup.polity_features,
      projection,
      reconciled_labels: reconciled_stadester_labels,
      selectedCityKey: options.selectedCityKey,
      stadesterConfig: options.stadesterConfig,
      stadesterLabels: options.stadesterLabels,
    })
    for (let i = 0; i < city_layers.length; i++)
      layers_array.push(city_layers[i])

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
    effective_points,
    options.stadesterBinaryAttributes,
    reconciled_stadester_labels,
    border_lookup,
    authoritative_capitals_by_city,
    options.stadesterConfig,
    options.selectedCityKey,
    options.onSelectCity,
    options.onHoverCity,
    hovered_city_region,
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
    options.draggedVertexIndex,
    options.drawnPolygonFeature,
    options.drawPoints,
    options.cursorLngLat,
    options.hoveredVertexIndex,
    options.isDrawing,
    options.isEditingShape,
    options.onFinishDraw,
    options.onSelectCustomVectorFeature,
    options.onHoverCustomVectorFeature,
    options.onSelectDrawnPolygon,
  ])
}
