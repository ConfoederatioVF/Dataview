import { CountryFeature } from './polygon_binning.ts'
import { calculateFeatureArea } from './polygon_area.ts'
import { invertEqualEarth, projectEqualEarth } from './equal_earth.ts'
import { ProjectionType } from './types.ts'

export { invertEqualEarth, projectEqualEarth }

/**
 * Unprojects 2D screen client pixels into geographic [lng, lat] coordinates across map projections.
 *
 * @param {number} arg0_x - Screen X coordinate
 * @param {number} arg1_y - Screen Y coordinate
 * @param {any} arg2_deck - Deck.gl instance or ref
 * @param {ProjectionType} arg3_projection - Active map projection
 *
 * @returns {[number, number] | null} [lng, lat] coordinate pair in degrees
 */
export let unprojectScreenToLngLat = function (
  arg0_x: number,
  arg1_y: number,
  arg2_deck: any,
  arg3_projection: ProjectionType
): [number, number] | null {
  //Convert from parameters
  let deck = arg2_deck
  let projection = arg3_projection
  let x = arg0_x
  let y = arg1_y

  //Guard clauses
  if (!deck)
    return null

  //Declare local instance variables
  let deck_inst = deck?.deck || deck
  let pt: [number, number] | null = null
  let viewports = deck_inst?.getViewports ? deck_inst.getViewports() : []
  let vp = viewports[0]

  //Function body
  if (!vp || typeof vp.unproject !== 'function')
    return null

  try {
    let unprojected = vp.unproject([x, y], { targetZ: 0 })
    if (unprojected && Number.isFinite(unprojected[0]) && Number.isFinite(unprojected[1])) {
      if (projection === 'EqualEarth') {
        pt = invertEqualEarth(unprojected[0], unprojected[1])
      } else {
        pt = [unprojected[0], unprojected[1]]
      }
    }
  } catch (arg0_err) {
    console.error('[PolygonDrawTool] Failed to unproject screen point:', arg0_err)
    return null
  }

  //Return statement
  return pt
}

/**
 * Projects a geographic [lng, lat] coordinate into the coordinate system used by deck.gl layers.
 *
 * @param {number} arg0_lng
 * @param {number} arg1_lat
 * @param {ProjectionType} arg2_projection
 *
 * @returns {[number, number]}
 */
export let projectLngLatToLayerCoords = function (
  arg0_lng: number,
  arg1_lat: number,
  arg2_projection: ProjectionType
): [number, number] {
  //Convert from parameters
  let lat = arg1_lat
  let lng = arg0_lng
  let projection = arg2_projection

  //Function body
  if (projection === 'EqualEarth')
    return projectEqualEarth(lng, lat)

  //Return statement
  return [lng, lat]
}

/**
 * Projects [lng, lat] coordinate to screen pixels using deck.gl viewport.
 *
 * @param {[number, number]} arg0_coord
 * @param {any} arg1_deck
 * @param {ProjectionType} arg2_projection
 *
 * @returns {[number, number] | null}
 */
export let projectLngLatToScreen = function (
  arg0_coord: [number, number],
  arg1_deck: any,
  arg2_projection: ProjectionType
): [number, number] | null {
  //Convert from parameters
  let coord = arg0_coord
  let deck = arg1_deck
  let projection = arg2_projection

  //Guard clauses
  if (!deck || !coord)
    return null

  //Declare local instance variables
  let deck_inst = deck?.deck || deck
  let layer_coords = projectLngLatToLayerCoords(coord[0], coord[1], projection)
  let viewports = deck_inst?.getViewports ? deck_inst.getViewports() : []
  let vp = viewports[0]

  //Function body
  if (!vp || typeof vp.project !== 'function')
    return null

  try {
    let projected = vp.project([layer_coords[0], layer_coords[1], 0])
    if (projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1]))
      return [projected[0], projected[1]]
  } catch {
    return null
  }

  //Return statement
  return null
}

/**
 * Creates a valid GeoJSON CountryFeature from an array of vertices.
 * Automatically closes the polygon loop and computes the geodesic area in square kilometres.
 *
 * @param {[number, number][]} arg0_points - Array of [lng, lat] vertices
 * @param {string} [arg1_name] - Optional custom name for the drawn polygon
 *
 * @returns {CountryFeature}
 */
export let createDrawnPolygonFeature = function (
  arg0_points: [number, number][],
  arg1_name?: string
): CountryFeature {
  //Convert from parameters
  let custom_name = arg1_name
  let points = arg0_points

  //Declare local instance variables
  let area_km2: number
  let closed_points: [number, number][]
  let default_name: string
  let feat_id: string
  let feature: CountryFeature

  //Function body
  closed_points = points.slice()
  if (
    closed_points.length > 0 &&
    (closed_points[0][0] !== closed_points[closed_points.length - 1][0] ||
      closed_points[0][1] !== closed_points[closed_points.length - 1][1])
  ) {
    closed_points.push([closed_points[0][0], closed_points[0][1]])
  }

  feat_id = `drawn_polygon_${Date.now()}`
  feature = {
    geometry: {
      coordinates: [closed_points],
      type: 'Polygon',
    },
    id: feat_id,
    properties: {
      id: feat_id,
      is_custom: true,
      is_drawn: true,
      name: custom_name || 'Drawn Area',
    },
    type: 'Feature',
  }

  area_km2 = calculateFeatureArea(feature)
  default_name = custom_name || `Drawn Area (${Math.round(area_km2).toLocaleString()} km²)`

  feature.properties.area = Math.round(area_km2)
  feature.properties.area_sq_km = Math.round(area_km2)
  feature.properties.calculated_area = Math.round(area_km2)
  feature.properties.name = default_name
  feature.properties.name_long = `Custom Drawn Polygon (${Math.round(area_km2).toLocaleString()} km²)`

  //Return statement
  return feature
}
