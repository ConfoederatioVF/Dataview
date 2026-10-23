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
import { normalizeCityKey } from '@framework/stadester/city_metadata_framework.ts'
import { MAP_CONFIG } from '@common'
import {
  EquirectangularTileset2D,
  WarpedTileBitmapLayer,
  TesselatedBitmapLayer,
} from './deck_layers'
import { ElevationSpikePoint } from './use_elevation_spikes'
import { CirclePixelPoint } from './use_circle_overlay'
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
  let is_cities_enabled = Boolean(options.stadesterConfig?.enabled)
  let is_mobile = Boolean(options.isMobile)
  let projection = options.projection
  let stadester_cities = options.stadesterCities

  let stadester_points_data = useMemo(() => {
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
    is_cities_enabled,
    stadester_cities,
    b_scale,
    color_mode,
    growth_palette,
    is_mobile,
    projection,
  ])

  //Return statement
  return useMemo(() => {
    //Declare local instance variables
    let acapital_state_ids = new Set<string>()
    let active_capitals_by_key = new Map<string, any>()
    let active_capitals_by_name = new Map<string, any>()
    let active_capitals_list: any[] = []
    let active_polity_names = new Set<string>()
    let active_state_capitals_by_sid = new Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>()
    let active_state_ids = new Set<string>()
    let authoritative_capitals_by_city = new Map<string, any>()
    let basemap = options.basemap
    let border_features_by_id = new Map<string, any>()
    let border_features_by_name = new Map<string, any>()
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

    if (options.historicalBordersData && options.historicalBordersData.features) {
      for (let i = 0; i < options.historicalBordersData.features.length; i++) {
        let feat = options.historicalBordersData.features[i]
        let p = feat.properties
        if (!p)
          continue

        let s_id = p.state_id !== undefined ? String(p.state_id) : (p.id !== undefined ? String(p.id) : undefined)

        if (p.id !== undefined)
          border_features_by_id.set(String(p.id), feat)
        if (feat.id !== undefined)
          border_features_by_id.set(String(feat.id), feat)
        if (p.state_id !== undefined)
          border_features_by_id.set(String(p.state_id), feat)
        if (p.name)
          border_features_by_name.set(p.name.toLowerCase().trim(), feat)

        if (s_id)
          active_state_ids.add(s_id)
        if (p.state_id !== undefined)
          active_state_ids.add(String(p.state_id))
        if (p.id !== undefined)
          active_state_ids.add(String(p.id))
        if (p.name)
          active_polity_names.add(p.name.toLowerCase().trim())
        if (p.name_long)
          active_polity_names.add(p.name_long.toLowerCase().trim())

        if (p.is_acapital) {
          if (s_id)
            acapital_state_ids.add(s_id)
        } else if (p.capname || p.capkey || p.cap_coords || (p.caplong !== undefined && p.caplat !== undefined)) {
          let polity_color = p.fill_color ||
            p.fillColor ||
            p.color ||
            p.symbol?.polygonFill ||
            p.symbol?.fillColor ||
            p.symbol?.strokeColor ||
            p.strokeColor

          let cap_lat: number | undefined
          let cap_lon: number | undefined
          if (p.cap_coords && Array.isArray(p.cap_coords) && p.cap_coords.length >= 2) {
            cap_lon = p.cap_coords[0]
            cap_lat = p.cap_coords[1]
          } else if (p.caplong !== undefined && p.caplat !== undefined) {
            cap_lon = Number(p.caplong)
            cap_lat = Number(p.caplat)
          }

          let feat_area = p.area !== undefined ? Number(p.area) : 0
          if (!feat_area && (feat as any).bbox) {
            let b = (feat as any).bbox
            feat_area = Math.max(0, (b[2] - b[0])*(b[3] - b[1]))
          }

          let cap_entry = {
            area: feat_area,
            bbox: (feat as any).bbox || p.bbox,
            cap_coords: (cap_lon !== undefined && cap_lat !== undefined) ? [cap_lon, cap_lat] as [number, number] : undefined,
            capkey: p.capkey,
            capname: p.capname,
            color: polity_color,
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
            if (!existing_k || (cap_entry.area > (existing_k.area || 0))) {
              active_capitals_by_key.set(p.capkey, cap_entry)
              active_capitals_by_key.set(p.capkey.toLowerCase().trim(), cap_entry)
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
                if (n_clean)
                  active_capitals_by_name.set(n_clean, cap_entry)
              }
            }
          }
        }
      }
    }

    if (selected_countries && selected_countries.length > 0) {
      effective_selected_array = [...selected_countries]
      if (options.selectedHistoricalFeature) {
        let hist_feat = options.selectedHistoricalFeature as unknown as CountryFeature
        let already_in = effective_selected_array.some((arg0_c: any) =>
          arg0_c === hist_feat ||
          (arg0_c.id !== undefined && hist_feat.id !== undefined && arg0_c.id === hist_feat.id) ||
          (arg0_c.properties?.id !== undefined && hist_feat.properties?.id !== undefined && arg0_c.properties.id === hist_feat.properties.id) ||
          (arg0_c.properties?.gwcode !== undefined && hist_feat.properties?.gwcode !== undefined && arg0_c.properties.gwcode === hist_feat.properties.gwcode) ||
          (arg0_c.properties?.name && hist_feat.properties?.name && arg0_c.properties.name === hist_feat.properties.name)
        )
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

    //6. Historical Statistical Borders (CShapes-2.0 & atlas.naissance)
    is_historical_hovered_selected = Boolean(
      options.hoveredHistoricalFeature && effective_selected_array.some((arg0_c: any) => {
        let hf = options.hoveredHistoricalFeature!
        return (
          arg0_c === hf ||
          (arg0_c.id !== undefined && hf.id !== undefined && arg0_c.id === hf.id) ||
          (arg0_c.properties?.id !== undefined && hf.properties?.id !== undefined && arg0_c.properties.id === hf.properties.id) ||
          (arg0_c.properties?.gwcode !== undefined && hf.properties?.gwcode !== undefined && arg0_c.properties.gwcode === hf.properties.gwcode) ||
          (arg0_c.properties?.name && hf.properties?.name && arg0_c.properties.name === hf.properties.name)
        )
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
    let is_worker_points_matching_proj = Boolean(
      options.stadesterPoints &&
      options.stadesterPoints.length > 0 &&
      (!options.stadesterPoints[0]?.projection || options.stadesterPoints[0]?.projection === projection)
    )
    let effective_points = is_worker_points_matching_proj
      ? options.stadesterPoints!
      : stadester_points_data

    //Pre-match active capitals to cities by coordinate proximity and key
    if (active_capitals_list.length > 0 && effective_points && effective_points.length > 0) {
      let timeline_yr = options.timelineYear
      let pts_by_key = new Map<string, number>()
      let pts_by_name = new Map<string, number[]>()
      let pts_grid = new Map<string, number[]>()

      for (let i = 0; i < effective_points.length; i++) {
        let c = effective_points[i]
        let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : undefined))
        let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : undefined))
        if (c_lat === undefined || c_lon === undefined)
          continue

        let cell = `${Math.floor(c_lon)}_${Math.floor(c_lat)}`
        let b = pts_grid.get(cell)
        if (!b) {
          b = []
          pts_grid.set(cell, b)
        }
        b.push(i)

        if (c.key) {
          pts_by_key.set(c.key, i)
          let clean_k = normalizeCityKey(c.key)
          if (clean_k)
            pts_by_key.set(clean_k, i)
        }
        if (c.id) {
          pts_by_key.set(String(c.id), i)
          let clean_id = normalizeCityKey(String(c.id))
          if (clean_id)
            pts_by_key.set(clean_id, i)
        }

        if (c.name) {
          let c_name_lower = c.name.toLowerCase().trim()
          let c_name_nfd = c_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let clean_c = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')

          let add_point_name = function (arg0_nm: string) {
            if (!arg0_nm)
              return
            let arr = pts_by_name.get(arg0_nm)
            if (!arr) {
              arr = []
              pts_by_name.set(arg0_nm, arr)
            }
            arr.push(i)
          }

          add_point_name(c_name_lower)
          add_point_name(c_name_nfd)
          add_point_name(clean_c)
        }

        if (c.other_names && Array.isArray(c.other_names)) {
          for (let x = 0; x < c.other_names.length; x++) {
            let on = c.other_names[x]
            let on_clean = on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
            let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
            let arr = pts_by_name.get(on_clean) || pts_by_name.get(on_nfd) || pts_by_name.get(clean_on)
            if (!arr) {
              arr = []
              pts_by_name.set(on_clean, arr)
              pts_by_name.set(on_nfd, arr)
              pts_by_name.set(clean_on, arr)
            }
            arr.push(i)
          }
        }
      }

      for (let i = 0; i < active_capitals_list.length; i++) {
        let cap = active_capitals_list[i]
        let best_city: any = null
        let best_score = -1
        let candidate_indices = new Set<number>()

        if (cap.cap_coords) {
          let min_cx = Math.floor(cap.cap_coords[0] - 0.25)
          let max_cx = Math.floor(cap.cap_coords[0] + 0.25)
          let min_cy = Math.floor(cap.cap_coords[1] - 0.25)
          let max_cy = Math.floor(cap.cap_coords[1] + 0.25)

          for (let x = min_cx; x <= max_cx; x++)
            for (let y = min_cy; y <= max_cy; y++) {
              let bucket = pts_grid.get(`${x}_${y}`)
              if (bucket)
                for (let z = 0; z < bucket.length; z++)
                  candidate_indices.add(bucket[z])
            }
        }

        if (cap.capkey) {
          let idx = pts_by_key.get(cap.capkey) ?? pts_by_key.get(normalizeCityKey(cap.capkey))
          if (idx !== undefined)
            candidate_indices.add(idx)
        }

        if (cap.capname) {
          let cap_name_lower = cap.capname.toLowerCase().trim()
          let cap_name_nfd = cap_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let clean_cap = cap_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
          let list = pts_by_name.get(cap_name_lower) || pts_by_name.get(cap_name_nfd) || pts_by_name.get(clean_cap)
          if (list)
            for (let x = 0; x < list.length; x++)
              candidate_indices.add(list[x])
        }

        let all_candidates = Array.from(candidate_indices)
        for (let x = 0; x < all_candidates.length; x++) {
          let j = all_candidates[x]
          let c = effective_points[j]
          let c_lat = c.rawCoords ? c.rawCoords[1] : (c.lat !== undefined ? c.lat : (c.coords ? c.coords[0] : undefined))
          let c_lon = c.rawCoords ? c.rawCoords[0] : (c.lon !== undefined ? c.lon : (c.coords ? c.coords[1] : undefined))
          if (c_lat === undefined || c_lon === undefined)
            continue

          if (timeline_yr !== undefined) {
            if (c.min_year !== undefined && timeline_yr < c.min_year)
              continue
            if (c.max_year !== undefined && c.max_year < 1975 && timeline_yr > c.max_year + 25)
              continue
            if (typeof c.population === 'number' && c.population <= 0)
              continue
            if (timeline_yr < 1975 && c.key && c.key.startsWith('ghsl-'))
              continue
          }

          if (cap.cap_coords) {
            if (Math.abs(c_lon - cap.cap_coords[0]) > 0.20 || Math.abs(c_lat - cap.cap_coords[1]) > 0.20)
              continue
          }

          let dist = cap.cap_coords ? Math.hypot(c_lon - cap.cap_coords[0], c_lat - cap.cap_coords[1]) : 999
          if (dist > 0.20)
            continue

          if (cap.bbox) {
            let pad = 1.0
            if (c_lon < cap.bbox[0] - pad || c_lon > cap.bbox[2] + pad || c_lat < cap.bbox[1] - pad || c_lat > cap.bbox[3] + pad)
              continue
          }

          let score = 0
          if (cap.capkey && (c.key === cap.capkey || c.id === cap.capkey))
            score += 200000
          let clean_c_key = normalizeCityKey(c.key || '')
          let clean_cap_key = normalizeCityKey(cap.capkey || '')
          if (clean_cap_key && clean_c_key && clean_cap_key === clean_c_key)
            score += 100000
          let c_name_lower = (c.name || '').toLowerCase().trim()
          let c_name_nfd = c_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          let cap_name_lower = (cap.capname || '').toLowerCase().trim()
          let cap_name_nfd = cap_name_lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

          let is_name_match = false
          if (cap_name_lower) {
            let clean_c_name = c_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
            let clean_cap_name = cap_name_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
            if (
              c_name_lower === cap_name_lower ||
              c_name_nfd === cap_name_nfd ||
              clean_c_name === clean_cap_name ||
              clean_c_name.startsWith(clean_cap_name) ||
              clean_cap_name.startsWith(clean_c_name)
            ) {
              is_name_match = true
            } else if (c.other_names && Array.isArray(c.other_names)) {
              is_name_match = c.other_names.some((arg0_on: string) => {
                let on_clean = arg0_on.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
                let on_lower = arg0_on.toLowerCase().trim()
                let on_nfd = on_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                let clean_on = on_nfd.replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '')
                return on_lower === cap_name_lower || on_nfd === cap_name_nfd || clean_on === clean_cap_name
              })
            }
          }

          if (is_name_match)
            score += 50000
          if (c.isCapital || c.is_capital)
            score += 10000
          if (cap.cap_coords)
            score += Math.max(0, Math.round((0.30 - dist) * 1000000))
          score += Math.max(0, Math.round((0.25 - dist) * 5000))
          score += Math.min(1000, Math.round((c.population || 0) / 1000))

          if (score > best_score) {
            best_score = score
            best_city = c
          }
        }

        if (best_city) {
          let existing = authoritative_capitals_by_city.get(best_city.key)
          let should_set = true

          if (existing) {
            let city_country = (best_city.country || '').toLowerCase().trim()
            let exist_area = (existing as any).area || 0
            let exist_polity = (existing.polity_name || '').toLowerCase().trim()
            let new_polity = (cap.polity_name || '').toLowerCase().trim()
            let exist_matches_country = Boolean(city_country && (exist_polity.includes(city_country) || city_country.includes(exist_polity)))
            let new_area = cap.area || 0
            let new_matches_country = Boolean(city_country && (new_polity.includes(city_country) || city_country.includes(new_polity)))

            if (exist_matches_country && !new_matches_country) {
              should_set = false
            } else if (!exist_matches_country && new_matches_country) {
              should_set = true
            } else if (exist_area > new_area) {
              should_set = false
            }
          }

          if (should_set) {
            if (best_city.key)
              authoritative_capitals_by_city.set(best_city.key, cap)
            if (best_city.id)
              authoritative_capitals_by_city.set(String(best_city.id), cap)
          }
        }
      }
    }

    let city_layers = buildStadesterCityLayers({
      acapital_state_ids,
      active_capitals_by_key,
      active_capitals_by_name,
      active_capitals_list,
      active_polity_names,
      active_state_capitals_by_sid,
      active_state_ids,
      authoritative_capitals_by_city,
      effective_points,
      hoveredCity: options.hoveredCity,
      is_cartesian,
      is_drawing,
      is_mobile,
      onHoverCity: options.onHoverCity,
      onSelectCity: options.onSelectCity,
      projection,
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
    stadester_points_data,
    options.stadesterPoints,
    options.stadesterLabels,
    options.stadesterConfig,
    options.selectedCityKey,
    options.onSelectCity,
    options.onHoverCity,
    options.hoveredCity,
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
