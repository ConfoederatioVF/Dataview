import { COORDINATE_SYSTEM } from '@deck.gl/core'
import { ScatterplotLayer, TextLayer } from '@deck.gl/layers'
import * as d3Chromatic from 'd3-scale-chromatic'
import { projectEqualEarth } from '@framework/geopng/equal_earth.ts'
import type { CityPoint, ProjectionType, StadesterConfig } from '@framework/geopng/types.ts'
import { UnderlinedTextLayer } from './underlined_text_layer'
import {
  getCapitalColorRgba,
  hexToRgb,
  resolveRegionColorHex,
} from './deck_layer_palette_utils'
import {
  getShortCityLabel,
  reconcileCapitalWithAuthoritativeBorders,
  reconcileCitiesWithAuthoritativeBorders,
} from './deck_capital_reconciliation.ts'

export function getGrowthRgb (arg0_rate: number, arg1_palette?: string): [number, number, number] {
  //Convert from parameters
  let palette = (arg1_palette) ? arg1_palette : 'Rainbow'
  let r = arg0_rate

  //Guard clauses
  if (!Number.isFinite(r))
    return [160, 160, 160]

  //Function body
  //D3 continuous colour interpolation from -0.05 to +0.08
  let interpolator = (d3Chromatic as any)[`interpolate${palette}`]
  if (interpolator) {
    let t = Math.max(0, Math.min(1, (r - (-0.05))/(0.08 - (-0.05))))
    let color_str = interpolator(t)
    let match = color_str.match(/\d+/g)
    if (match && match.length >= 3)
      return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)]
  }

  //Return statement
  return [232, 121, 249]
}


export function getPopRgb (arg0_pop: number): [number, number, number] {
  //Convert from parameters
  let pop = arg0_pop

  //Function body
  let p = Math.max(1, pop)
  let t = Math.max(0, Math.min(1, (Math.log10(p) - 3.7)/3.6))
  let r = Math.round(Math.min(255, 13 + t*240))
  let g = Math.round(Math.min(255, 8 + t*210))
  let b = Math.round(Math.max(0, 135 - t*100))

  //Return statement
  return [r, g, b]
}


export interface BuildStadesterPointsOptions {
  b_scale: number
  color_mode: string
  growth_palette: string
  is_cities_enabled: boolean
  is_mobile: boolean
  projection: ProjectionType
  stadester_cities?: CityPoint[]
}

/**
 * Builds memoized Stadestér city points formatted for Deck.gl coordinate space and visual styling.
 *
 * @param {BuildStadesterPointsOptions} arg0_options
 *
 * @returns {any[]}
 */
export function buildStadesterCityPoints (arg0_options: BuildStadesterPointsOptions): any[] {
  //Convert from parameters
  let b_scale = arg0_options.b_scale
  let color_mode = arg0_options.color_mode
  let growth_palette = arg0_options.growth_palette
  let is_cities_enabled = arg0_options.is_cities_enabled
  let is_mobile = arg0_options.is_mobile
  let projection = arg0_options.projection
  let stadester_cities = arg0_options.stadester_cities

  //Guard clauses
  if (!is_cities_enabled || !stadester_cities || stadester_cities.length === 0)
    return []

  //Function body
  return stadester_cities.map((city) => {
    let c_lat = (city.lat !== undefined) ? city.lat : city.coords[0]
    let c_lon = (city.lon !== undefined) ? city.lon : city.coords[1]
    let fill_color: [number, number, number, number] = [255, 255, 255, 220]
    let px = c_lon
    let py = c_lat

    if (projection === 'EqualEarth') {
      let projected = projectEqualEarth(c_lon, c_lat)
      px = projected[0]
      py = projected[1]
    }

    // Equal-area pixel radius scaled by sqrt(population) with calibrated minimum bubble size for mobile / desktop
    let min_radius = (is_mobile ? 2.0 : 3.25) * b_scale
    let pop_scaled = (is_mobile ? 0.70 : 1.0) * b_scale
    let pop_radius = Math.sqrt(Math.max(0, city.population)) * 0.0115 * pop_scaled
    let max_radius = is_mobile ? 32.0 : 65.0
    let pixel_radius = Math.max(min_radius, Math.min(max_radius, min_radius + pop_radius))

    if (color_mode === 'growth') {
      let growth_rate = (city.growthRate !== undefined) ? city.growthRate : 0
      let growth_rgb = getGrowthRgb(growth_rate, growth_palette)
      fill_color = [growth_rgb[0], growth_rgb[1], growth_rgb[2], 220]
    } else if (color_mode === 'population') {
      let pop_rgb = getPopRgb(city.population)
      fill_color = [pop_rgb[0], pop_rgb[1], pop_rgb[2], 220]
    } else if (color_mode === 'region' || color_mode === 'continent') {
      let reg_hex = resolveRegionColorHex(city.region, [c_lat, c_lon])
      let reg_rgb = hexToRgb(reg_hex)
      fill_color = [reg_rgb[0], reg_rgb[1], reg_rgb[2], 220]
    }

    // Truncate name to the first word prior to semicolon
    let short_name = getShortCityLabel(city.name)

    return {
      ...city,
      color: fill_color,
      pixelRadius: pixel_radius,
      position: [px, py, 0] as [number, number, number],
      projection: projection,
      rawCoords: [c_lon, c_lat],
      shortName: short_name,
    }
  })
}


export interface BuildStadesterCityLayersOptions {
  acapital_state_ids: Set<string>
  active_capitals_by_key: Map<string, any>
  active_capitals_by_name: Map<string, any>
  active_capitals_list: any[]
  active_polity_names: Set<string>
  active_state_capitals_by_sid: Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>
  active_state_ids: Set<string>
  authoritative_capitals_by_city: Map<string, any>
  effective_points: any[]
  hoveredCity?: CityPoint | null
  is_cartesian: boolean
  is_drawing: boolean
  is_mobile: boolean
  onHoverCity?: (city: CityPoint | null, x?: number, y?: number) => void
  onSelectCity?: (city: CityPoint, coord?: [number, number], screen_x?: number, screen_y?: number) => void
  projection: ProjectionType
  selectedCityKey?: string | null
  stadesterConfig?: StadesterConfig
  stadesterLabels?: any[]
}

/**
 * Builds all Deck.gl layers for Stadestér cities: circles/markers, selection ring, and text labels.
 *
 * @param {BuildStadesterCityLayersOptions} arg0_options
 *
 * @returns {any[]}
 */
export function buildStadesterCityLayers (arg0_options: BuildStadesterCityLayersOptions): any[] {
  //Convert from parameters
  let acapital_state_ids = arg0_options.acapital_state_ids
  let active_capitals_by_key = arg0_options.active_capitals_by_key
  let active_capitals_by_name = arg0_options.active_capitals_by_name
  let active_capitals_list = arg0_options.active_capitals_list
  let active_polity_names = arg0_options.active_polity_names
  let active_state_capitals_by_sid = arg0_options.active_state_capitals_by_sid
  let active_state_ids = arg0_options.active_state_ids
  let authoritative_capitals_by_city = arg0_options.authoritative_capitals_by_city
  let effective_points = arg0_options.effective_points
  let is_cartesian = arg0_options.is_cartesian
  let is_drawing = arg0_options.is_drawing
  let is_mobile = arg0_options.is_mobile
  let options = arg0_options
  let projection = arg0_options.projection

  //Declare local instance variables
  let layers_array: any[] = []

  //Guard clauses
  if (!options.stadesterConfig?.enabled || !effective_points || effective_points.length === 0)
    return []

  //Function body
  let is_firefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent)
  let is_halo = options.stadesterConfig.halo !== false && !options.stadesterConfig.filled
  let is_labels_visible = (options.stadesterConfig.showLabels !== undefined) ? options.stadesterConfig.showLabels : true

  let circle_opacity = (options.stadesterConfig.opacity !== undefined) ? options.stadesterConfig.opacity : 0.7
  let fill_alpha = Math.round(255 * circle_opacity)
  let stroke_alpha = Math.min(255, Math.round(255 * Math.min(1.0, circle_opacity * 1.25)))

  // City circles layer (ScatterplotLayer for Chrome/WebKit, TextLayer for Firefox)
  if (is_firefox) {
    layers_array.push(
      new TextLayer({
        id: `stadester-cities-${projection}`,
        data: effective_points,
        getText: () => (is_halo) ? '○' : '●',
        characterSet: ['●', '○'],
        fontFamily: 'Segoe UI Symbol, Arial, sans-serif',
        fontSettings: { buffer: 8, fontSize: 128, sdf: true },
        getPosition: (d: any) => d.position,
        getSize: (d: any) => d.pixelRadius * 2,
        getColor: (d: any) => {
          let is_region_highlighted = Boolean(
            options.hoveredCity?.region &&
            d.region &&
            (d.region === options.hoveredCity.region ||
             d.region.toLowerCase().includes(options.hoveredCity.region.toLowerCase()) ||
             options.hoveredCity.region.toLowerCase().includes(d.region.toLowerCase()))
          )
          if (is_region_highlighted) {
            let r = Math.round(d.color[0] * 0.7 + 255 * 0.3)
            let g = Math.round(d.color[1] * 0.7 + 255 * 0.3)
            let b = Math.round(d.color[2] * 0.7 + 255 * 0.3)
            return [r, g, b, Math.min(255, fill_alpha + 35)]
          }
          return [d.color[0], d.color[1], d.color[2], (is_halo) ? stroke_alpha : fill_alpha]
        },
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        sizeUnits: 'pixels',
        sizeScale: 1,
        sizeMinPixels: is_mobile ? 4.5 : 6.5,
        sizeMaxPixels: is_mobile ? 65.0 : 130.0,
        coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
        billboard: true,
        pickable: !is_drawing,
        autoHighlight: !is_drawing,
        highlightColor: [255, 255, 255, 100],
        background: false,
        onClick: (info: any) => {
          if (is_drawing)
            return false
          if (info.object && options.onSelectCity)
            options.onSelectCity(
              info.object,
              info.coordinate ? [info.coordinate[0], info.coordinate[1]] : undefined,
              info.x,
              info.y
            )
          return true
        },
        onHover: (info: any) => {
          if (is_drawing)
            return
          if (options.onHoverCity)
            options.onHoverCity(info.object || null, info.x, info.y)
        },
        parameters: {
          cullMode: 'none',
          depthMask: false,
          depthTest: false,
        },
      })
    )
  } else {
    layers_array.push(
      new ScatterplotLayer({
        id: `stadester-cities-${projection}`,
        data: effective_points,
        getPosition: (d: any) => d.position,
        getRadius: (d: any) => d.pixelRadius,
        getFillColor: (d: any) => {
          let is_region_highlighted = Boolean(
            options.hoveredCity?.region &&
            d.region &&
            (d.region === options.hoveredCity.region ||
             d.region.toLowerCase().includes(options.hoveredCity.region.toLowerCase()) ||
             options.hoveredCity.region.toLowerCase().includes(d.region.toLowerCase()))
          )
          if (is_region_highlighted) {
            let r = Math.round(d.color[0] * 0.7 + 255 * 0.3)
            let g = Math.round(d.color[1] * 0.7 + 255 * 0.3)
            let b = Math.round(d.color[2] * 0.7 + 255 * 0.3)
            return [r, g, b, Math.min(255, fill_alpha + 35)]
          }
          return [d.color[0], d.color[1], d.color[2], fill_alpha]
        },
        getLineColor: (d: any) => {
          let is_region_highlighted = Boolean(
            options.hoveredCity?.region &&
            d.region &&
            (d.region === options.hoveredCity.region ||
             d.region.toLowerCase().includes(options.hoveredCity.region.toLowerCase()) ||
             options.hoveredCity.region.toLowerCase().includes(d.region.toLowerCase()))
          )
          if (is_region_highlighted) {
            let r = Math.round(d.color[0] * 0.7 + 255 * 0.3)
            let g = Math.round(d.color[1] * 0.7 + 255 * 0.3)
            let b = Math.round(d.color[2] * 0.7 + 255 * 0.3)
            return [r, g, b, 255]
          }
          return [d.color[0], d.color[1], d.color[2], stroke_alpha]
        },
        getLineWidth: 1.5,
        lineWidthUnits: 'pixels',
        lineWidthMinPixels: 1.5,
        stroked: is_halo,
        filled: !is_halo,
        radiusUnits: 'pixels',
        radiusMinPixels: is_mobile ? 2.0 : 3.25,
        radiusMaxPixels: is_mobile ? 32.0 : 65.0,
        coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
        billboard: true,
        pickable: !is_drawing,
        autoHighlight: !is_drawing,
        highlightColor: [255, 255, 255, 100],
        onClick: (info: any) => {
          if (is_drawing)
            return false
          if (info.object && options.onSelectCity)
            options.onSelectCity(
              info.object,
              info.coordinate ? [info.coordinate[0], info.coordinate[1]] : undefined,
              info.x,
              info.y
            )
          return true
        },
        onHover: (info: any) => {
          if (is_drawing)
            return
          if (options.onHoverCity)
            options.onHoverCity(info.object || null, info.x, info.y)
        },
        parameters: {
          cullMode: 'none',
          depthMask: false,
          depthTest: false,
        },
      })
    )
  }

  // City selection highlight ring
  if (options.selectedCityKey) {
    let selected_city_item = effective_points.find((c: any) => c.key === options.selectedCityKey)
    if (selected_city_item) {
      if (is_firefox) {
        layers_array.push(
          new TextLayer({
            id: `stadester-selected-ring-${projection}`,
            data: [selected_city_item],
            getText: () => '○',
            characterSet: ['○'],
            fontFamily: 'Segoe UI Symbol, Arial, sans-serif',
            fontSettings: { buffer: 8, fontSize: 128, sdf: true },
            getPosition: (d: any) => d.position,
            getSize: (d: any) => (is_mobile ? (d.pixelRadius * 0.70 + 2.5) : (d.pixelRadius + 4)) * 2,
            getColor: [239, 68, 68, 255],
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            sizeUnits: 'pixels',
            sizeScale: 1,
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            billboard: true,
            background: false,
            parameters: {
              cullMode: 'none',
              depthMask: false,
              depthTest: false,
            },
            pickable: false,
          })
        )
      } else {
        layers_array.push(
          new ScatterplotLayer({
            id: `stadester-selected-ring-${projection}`,
            data: [selected_city_item],
            getPosition: (d: any) => d.position,
            getRadius: (d: any) => is_mobile ? (d.pixelRadius * 0.70 + 2.5) : (d.pixelRadius + 4),
            stroked: true,
            filled: false,
            getLineColor: [239, 68, 68, 255],
            getLineWidth: 2.5,
            lineWidthUnits: 'pixels',
            radiusUnits: 'pixels',
            coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
            billboard: true,
            parameters: {
              cullMode: 'none',
              depthMask: false,
              depthTest: false,
            },
            pickable: false,
          })
        )
      }
    }
  }

  // City text labels
  if (is_labels_visible) {
    let visible_label_cities = options.stadesterLabels

    if (visible_label_cities && visible_label_cities.length > 0) {
      if (visible_label_cities[0]?.projection && visible_label_cities[0].projection !== projection)
        visible_label_cities = undefined
    }

    if (visible_label_cities && visible_label_cities.length > 0) {
      visible_label_cities = visible_label_cities.filter((arg0_c: any) =>
        arg0_c &&
        arg0_c.position &&
        Number.isFinite(arg0_c.position[0]) &&
        Number.isFinite(arg0_c.position[1]) &&
        typeof arg0_c.shortName === 'string' &&
        arg0_c.shortName.trim().length > 0
      )

      //Reconcile capital cities isomorphically with authoritative historical border features
      if (active_capitals_by_key.size > 0 || active_capitals_by_name.size > 0 || active_capitals_list.length > 0 || acapital_state_ids.size > 0 || active_state_ids.size > 0) {
        visible_label_cities = reconcileCitiesWithAuthoritativeBorders(
          visible_label_cities,
          active_capitals_by_key,
          active_capitals_by_name,
          acapital_state_ids,
          active_state_capitals_by_sid,
          active_state_ids,
          active_polity_names,
          authoritative_capitals_by_city,
          active_capitals_list
        )
      }
    }

    if (visible_label_cities && visible_label_cities.length > 0) {
      layers_array.push(
        new UnderlinedTextLayer({
          id: `stadester-labels-${projection}`,
          data: visible_label_cities,
          getPosition: (d: any) => d.position,
          getText: (d: any) => d.shortName,
          getSize: (d: any) => Math.max(10, Math.min(15, 9 + Math.log10(Math.max(1000, d.population))*0.9)),
          sizeUnits: 'pixels',
          sizeMinPixels: 9,
          isUnderlined: (d: any) => Boolean(d.isCapital && options.stadesterConfig?.showCapitals !== false && options.stadesterConfig?.showCapitalUnderlines !== false),
          getUnderlineColor: (d: any) => {
            if (!d.isCapital || options.stadesterConfig?.showCapitals === false || options.stadesterConfig?.showCapitalUnderlines === false)
              return [0, 0, 0, 0]

            return getCapitalColorRgba(d, options.stadesterConfig)
          },
          getColor: (d: any) => {
            if (!d.isCapital || options.stadesterConfig?.showCapitals === false)
              return [255, 255, 255, 255]

            return getCapitalColorRgba(d, options.stadesterConfig)
          },
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          updateTriggers: {
            getColor: [
              visible_label_cities,
              options.stadesterConfig?.showCapitals,
              options.stadesterConfig?.capitalColorMode,
              options.stadesterConfig?.capitalConstantColor,
            ],
            getUnderlineColor: [
              visible_label_cities,
              options.stadesterConfig?.showCapitals,
              options.stadesterConfig?.showCapitalUnderlines,
              options.stadesterConfig?.capitalColorMode,
              options.stadesterConfig?.capitalConstantColor,
            ],
            isUnderlined: [
              visible_label_cities,
              options.stadesterConfig?.showCapitals,
              options.stadesterConfig?.showCapitalUnderlines,
            ],
          },
          getPixelOffset: (d: any) => [d.pixelRadius + 8, 0],
          background: true,
          getBackgroundColor: [10, 15, 25, 220],
          backgroundPadding: [4, 2],
          backgroundBorderRadius: 2,
          fontFamily: 'Karla, sans-serif',
          fontWeight: 600,
          billboard: true,
          coordinateSystem: (is_cartesian) ? COORDINATE_SYSTEM.CARTESIAN : COORDINATE_SYSTEM.LNGLAT,
          characterSet: 'auto',
          pickable: !is_drawing,
          autoHighlight: !is_drawing,
          highlightColor: [255, 255, 255, 60],
          onClick: (info: any) => {
            if (is_drawing)
              return false
            if (info.object && options.onSelectCity)
              options.onSelectCity(
                info.object,
                info.coordinate ? [info.coordinate[0], info.coordinate[1]] : undefined,
                info.x,
                info.y
              )
            return true
          },
          onHover: (info: any) => {
            if (is_drawing)
              return
            if (options.onHoverCity)
              options.onHoverCity(info.object || null, info.x, info.y)
          },
          parameters: {
            cullMode: 'none',
            depthMask: false,
            depthTest: false,
          },
        })
      )
    }
  }

  //Return statement
  return layers_array
}
