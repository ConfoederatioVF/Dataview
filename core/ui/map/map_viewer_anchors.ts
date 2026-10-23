import { projectEqualEarth } from '@framework/geopng/equal_earth.ts'
import { isGlobePointVisible } from '@framework/stadester/stadester_heuristics'
import type {
  CityFullRecord,
  CityPoint,
  ProjectionType,
} from '@framework/geopng/types.ts'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'

export interface MapDetailsNavEntry {
  anchorCoord?: [number, number] | null
  anchorScreen?: { x: number; y: number } | null
  city?: CityPoint | CityFullRecord | null
  cityKey?: string | null
  countryFeature?: HistoricalBorderFeature | null
  type: 'city' | 'country'
}

export interface CalculateSelectedCityAnchorOptions {
  deck_ref: React.RefObject<any>
  proj_view_states: Record<string, any>
  projection: ProjectionType
  selected_city?: CityFullRecord | CityPoint | null
  selected_city_anchor_coord?: [number, number] | null
}

/**
 * Calculates screen coordinates { x, y } for anchoring the floating city details panel.
 *
 * @param {CalculateSelectedCityAnchorOptions} arg0_options
 *
 * @returns {{ x: number; y: number } | null}
 */
export function calculateSelectedCityAnchor (arg0_options: CalculateSelectedCityAnchorOptions): { x: number; y: number } | null {
  //Convert from parameters
  let deck_ref = arg0_options.deck_ref
  let proj_view_states = arg0_options.proj_view_states
  let projection = arg0_options.projection
  let selected_city = arg0_options.selected_city
  let selected_city_anchor_coord = arg0_options.selected_city_anchor_coord

  //Guard clauses
  let current_view_state = proj_view_states[projection]
  if (!current_view_state)
    return null
  if (!selected_city && !selected_city_anchor_coord)
    return null
  if (!deck_ref.current)
    return null

  //Function body
  try {
    let vp = deck_ref.current.deck?.getViewports?.()[0]
    if (!vp)
      return null

    let c_lat: number | undefined
    let c_lon: number | undefined

    if (selected_city_anchor_coord && Number.isFinite(selected_city_anchor_coord[0]) && Number.isFinite(selected_city_anchor_coord[1])) {
      c_lon = selected_city_anchor_coord[0]
      c_lat = selected_city_anchor_coord[1]
    } else if (selected_city) {
      let city_raw = (selected_city as any).rawCoords
      let city_coords = (selected_city as any).coords
      if (city_raw && Number.isFinite(city_raw[0]) && Number.isFinite(city_raw[1])) {
        c_lon = city_raw[0]
        c_lat = city_raw[1]
      } else if (city_coords && Number.isFinite(city_coords[0]) && Number.isFinite(city_coords[1])) {
        if (Math.abs(city_coords[0]) > 90 && Math.abs(city_coords[1]) <= 90) {
          c_lon = city_coords[0]
          c_lat = city_coords[1]
        } else {
          c_lat = city_coords[0]
          c_lon = city_coords[1]
        }
      }
    }

    if (c_lon === undefined || c_lat === undefined || !Number.isFinite(c_lon) || !Number.isFinite(c_lat))
      return null

    let px = c_lon
    let py = c_lat
    if (projection === 'EqualEarth') {
      let proj = projectEqualEarth(c_lon, c_lat)
      px = proj[0]
      py = proj[1]
    } else if (projection === 'Globe') {
      if (!isGlobePointVisible(c_lon, c_lat, vp, -0.005))
        return null
    }
    let projected = vp.project(projection === 'EqualEarth' ? [px, py, 0] : [px, py])
    if (projected && projected.length >= 2 && Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
      let is_in_viewport = (
        projected[0] >= 0 &&
        projected[0] <= vp.width &&
        projected[1] >= 0 &&
        projected[1] <= vp.height
      )
      if (is_in_viewport)
        return { x: projected[0], y: projected[1] }
    }
    return null
  } catch {
    // Ignore projection errors
  }

  //Return statement
  return null
}


export interface CalculateSelectedHistoricalAnchorOptions {
  deck_ref: React.RefObject<any>
  proj_view_states: Record<string, any>
  projection: ProjectionType
  selected_historical_anchor_coord?: [number, number] | null
  selected_historical_feature?: HistoricalBorderFeature | null
}

/**
 * Calculates screen coordinates { x, y } for anchoring the floating historical border details panel.
 *
 * @param {CalculateSelectedHistoricalAnchorOptions} arg0_options
 *
 * @returns {{ x: number; y: number } | null}
 */
export function calculateSelectedHistoricalAnchor (
  arg0_options: CalculateSelectedHistoricalAnchorOptions
): { x: number; y: number } | null {
  //Convert from parameters
  let deck_ref = arg0_options.deck_ref
  let proj_view_states = arg0_options.proj_view_states
  let projection = arg0_options.projection
  let selected_historical_anchor_coord = arg0_options.selected_historical_anchor_coord
  let selected_historical_feature = arg0_options.selected_historical_feature

  //Guard clauses
  let current_view_state = proj_view_states[projection]
  if (!current_view_state)
    return null
  if (!selected_historical_feature || !deck_ref.current)
    return null
  if (!selected_historical_anchor_coord)
    return null

  //Function body
  try {
    let vp = deck_ref.current.deck?.getViewports?.()[0]
    if (!vp)
      return null
    let [c_lon, c_lat] = selected_historical_anchor_coord
    let px = c_lon
    let py = c_lat
    if (projection === 'EqualEarth') {
      let proj = projectEqualEarth(c_lon, c_lat)
      px = proj[0]
      py = proj[1]
    } else if (projection === 'Globe') {
      if (!isGlobePointVisible(c_lon, c_lat, vp, -0.005))
        return null
    }
    let projected = vp.project(projection === 'EqualEarth' ? [px, py, 0] : [px, py])
    if (projected && projected.length >= 2 && Number.isFinite(projected[0]) && Number.isFinite(projected[1])) {
      let is_in_viewport = (
        projected[0] >= 0 &&
        projected[0] <= vp.width &&
        projected[1] >= 0 &&
        projected[1] <= vp.height
      )
      if (is_in_viewport)
        return { x: projected[0], y: projected[1] }
    }
  } catch {
    // Ignore projection errors
  }

  //Return statement
  return null
}
