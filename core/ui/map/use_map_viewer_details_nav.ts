import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CityFullRecord,
  CityPoint,
  ProjectionType,
} from '@framework/geopng/types.ts'
import type { CountryFeature } from '@framework/geopng/polygon_binning.ts'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import { projectEqualEarth } from '@framework/geopng/equal_earth.ts'
import { projectLngLatToScreen } from '@framework/geopng/polygon_draw_tool.ts'
import {
  calculateSelectedCityAnchor,
  calculateSelectedHistoricalAnchor,
  type MapDetailsNavEntry,
} from './map_viewer_anchors.ts'

export interface UseMapViewerDetailsNavOptions {
  deck_ref: React.RefObject<any>
  drawn_polygon_feature?: CountryFeature | null
  historical_borders_result: any
  is_drawing: boolean
  on_clear_countries?: () => void
  on_clear_drawn_polygon?: () => void
  on_close_city_details?: () => void
  on_edit_polygon?: (arg0_feature: CountryFeature) => void
  on_select_city?: (city: CityPoint) => void
  on_select_country?: (country: CountryFeature | null) => void
  on_toggle_country?: (country: CountryFeature) => void
  proj_view_states: any
  projection: ProjectionType
  selected_city?: CityFullRecord | null
  selected_city_key?: string | null
  selected_countries?: CountryFeature[]
  selected_country?: CountryFeature | null
  set_proj_view_states: React.Dispatch<React.SetStateAction<any>>
  timeline_year?: number
}

/**
 * Hook to manage selected city/country details panels, screen anchor tracking, and navigation history.
 *
 * @param {UseMapViewerDetailsNavOptions} arg0_options
 *
 * @returns {object}
 */
export function useMapViewerDetailsNav (arg0_options: UseMapViewerDetailsNavOptions) {
  //Convert from parameters
  let deck_ref = arg0_options.deck_ref
  let drawn_polygon_feature = arg0_options.drawn_polygon_feature
  let historical_borders_result = arg0_options.historical_borders_result
  let is_drawing = arg0_options.is_drawing
  let on_clear_countries = arg0_options.on_clear_countries
  let on_clear_drawn_polygon = arg0_options.on_clear_drawn_polygon
  let on_close_city_details = arg0_options.on_close_city_details
  let on_edit_polygon = arg0_options.on_edit_polygon
  let on_select_city = arg0_options.on_select_city
  let on_select_country = arg0_options.on_select_country
  let on_toggle_country = arg0_options.on_toggle_country
  let proj_view_states = arg0_options.proj_view_states
  let projection = arg0_options.projection
  let selected_city = arg0_options.selected_city
  let selected_city_key = arg0_options.selected_city_key
  let selected_countries = arg0_options.selected_countries
  let selected_country = arg0_options.selected_country
  let set_proj_view_states = arg0_options.set_proj_view_states
  let timeline_year = arg0_options.timeline_year

  //Declare local instance variables
  let [active_panel_type, set_active_panel_type] = useState<'city' | 'country' | null>(null)
  let last_centered_city_key_ref = useRef<string | null>(null)
  let [nav_history, set_nav_history] = useState<MapDetailsNavEntry[]>([])
  let [selected_city_anchor_coord, set_selected_city_anchor_coord] = useState<[number, number] | null>(null)
  let [selected_city_anchor_screen, set_selected_city_anchor_screen] = useState<{ x: number; y: number } | null>(null)
  let [selected_historical_anchor_coord, set_selected_historical_anchor_coord] = useState<[number, number] | null>(null)
  let [selected_historical_anchor_screen, set_selected_historical_anchor_screen] = useState<{ x: number; y: number } | null>(null)
  let [selected_historical_feature, set_selected_historical_feature] = useState<HistoricalBorderFeature | null>(null)

  //Function body
  let center_on_coordinates = useCallback(
    (arg0_lon: number, arg1_lat: number) => {
      let c_lat = arg1_lat
      let c_lon = arg0_lon

      if (!Number.isFinite(c_lon) || !Number.isFinite(c_lat))
        return

      set_proj_view_states((arg0_prev: any) => {
        let current = arg0_prev[projection] || {}
        let updated: any

        if (projection === 'EqualEarth') {
          let proj = projectEqualEarth(c_lon, c_lat)
          updated = { ...current, target: [proj[0], proj[1], 0] }
        } else if (projection === 'Equirectangular') {
          updated = { ...current, target: [c_lon, c_lat, 0] }
        } else if (projection === 'Mercator') {
          updated = { ...current, latitude: Math.max(-85, Math.min(85, c_lat)), longitude: c_lon }
        } else {
          updated = { ...current, latitude: c_lat, longitude: c_lon }
        }

        return { ...arg0_prev, [projection]: updated }
      })
    },
    [projection, set_proj_view_states]
  )

  let handle_center_selected_city = useCallback(() => {
    let c_lat: number | undefined
    let c_lon: number | undefined

    if (selected_city_anchor_coord && Number.isFinite(selected_city_anchor_coord[0]) && Number.isFinite(selected_city_anchor_coord[1])) {
      c_lon = selected_city_anchor_coord[0]
      c_lat = selected_city_anchor_coord[1]
    } else if (selected_city) {
      let city_coords = (selected_city as any).coords
      let city_raw = (selected_city as any).rawCoords

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

    if (c_lon !== undefined && c_lat !== undefined)
      center_on_coordinates(c_lon, c_lat)
  }, [center_on_coordinates, selected_city, selected_city_anchor_coord])

  let selected_city_anchor = useMemo(() => {
    return calculateSelectedCityAnchor({
      deck_ref,
      proj_view_states,
      projection,
      selected_city,
      selected_city_anchor_coord,
    })
  }, [deck_ref, proj_view_states, projection, selected_city, selected_city_anchor_coord])

  let selected_historical_anchor = useMemo(() => {
    return calculateSelectedHistoricalAnchor({
      deck_ref,
      proj_view_states,
      projection,
      selected_historical_anchor_coord,
      selected_historical_feature,
    })
  }, [deck_ref, proj_view_states, projection, selected_historical_anchor_coord, selected_historical_feature])

  let handle_close_all_details = useCallback(() => {
    set_nav_history([])
    set_active_panel_type(null)
    set_selected_city_anchor_coord(null)
    set_selected_city_anchor_screen(null)
    set_selected_historical_feature(null)
    set_selected_historical_anchor_coord(null)
    set_selected_historical_anchor_screen(null)
    if (on_close_city_details)
      on_close_city_details()
    if (on_clear_countries)
      on_clear_countries()
    else if (on_select_country)
      on_select_country(null)
  }, [on_clear_countries, on_close_city_details, on_select_country])

  let handle_clear_polygon = useCallback(() => {
    if (on_clear_drawn_polygon)
      on_clear_drawn_polygon()
    handle_close_all_details()
  }, [on_clear_drawn_polygon, handle_close_all_details])

  let handle_edit_polygon = useCallback((arg0_feat: CountryFeature) => {
    if (on_edit_polygon)
      on_edit_polygon(arg0_feat)
    handle_close_all_details()
  }, [on_edit_polygon, handle_close_all_details])

  let handle_nav_back = useCallback(() => {
    if (nav_history.length === 0)
      return

    let last_index = nav_history.length - 1
    let previous_entry = nav_history[last_index]
    set_nav_history((arg0_prev) => arg0_prev.slice(0, -1))

    if (previous_entry.type === 'city') {
      set_selected_historical_feature(null)
      set_selected_historical_anchor_coord(null)
      set_selected_historical_anchor_screen(null)
      set_active_panel_type('city')
      set_selected_city_anchor_coord(previous_entry.anchorCoord || null)
      set_selected_city_anchor_screen(previous_entry.anchorScreen || null)
      if (previous_entry.city && on_select_city)
        on_select_city(previous_entry.city as CityPoint)
    } else if (previous_entry.type === 'country') {
      set_selected_city_anchor_coord(null)
      set_selected_city_anchor_screen(null)
      if (on_close_city_details)
        on_close_city_details()
      set_active_panel_type('country')
      if (previous_entry.countryFeature) {
        set_selected_historical_feature(previous_entry.countryFeature)
        set_selected_historical_anchor_coord(previous_entry.anchorCoord || null)
        set_selected_historical_anchor_screen(previous_entry.anchorScreen || null)
        if (on_select_country)
          on_select_country(previous_entry.countryFeature as unknown as CountryFeature)
        else if (on_toggle_country)
          on_toggle_country(previous_entry.countryFeature as unknown as CountryFeature)
      }
    }
  }, [nav_history, on_close_city_details, on_select_city, on_select_country, on_toggle_country])

  let handle_select_city_from_country = useCallback(
    (arg0_city: CityPoint) => {
      let city = arg0_city
      let city_anchor_coord: [number, number] | null = null

      if ((city as any).rawCoords && Number.isFinite((city as any).rawCoords[0]) && Number.isFinite((city as any).rawCoords[1])) {
        city_anchor_coord = [(city as any).rawCoords[0], (city as any).rawCoords[1]]
      } else if (city.coords && Number.isFinite(city.coords[0]) && Number.isFinite(city.coords[1])) {
        if (Math.abs(city.coords[0]) > 90 && Math.abs(city.coords[1]) <= 90) {
          city_anchor_coord = [city.coords[0], city.coords[1]]
        } else {
          city_anchor_coord = [city.coords[1], city.coords[0]]
        }
      }

      if (selected_historical_feature) {
        set_nav_history((arg0_prev) => [
          ...arg0_prev,
          {
            anchorCoord: selected_historical_anchor_coord || null,
            anchorScreen: selected_historical_anchor_screen || null,
            countryFeature: selected_historical_feature,
            type: 'country',
          },
        ])
      }
      set_active_panel_type('city')
      set_selected_city_anchor_coord(city_anchor_coord)
      set_selected_city_anchor_screen(null)

      if (city_anchor_coord)
        center_on_coordinates(city_anchor_coord[0], city_anchor_coord[1])

      if (on_select_city)
        on_select_city(city)
    },
    [center_on_coordinates, on_select_city, selected_historical_anchor_coord, selected_historical_anchor_screen, selected_historical_feature]
  )

  let handle_select_country_from_city = useCallback(
    (arg0_state_id?: number | string, arg0_country_name?: string) => {
      let country_name = arg0_country_name
      let state_id = arg0_state_id

      let applyTargetFeature = (arg0_feat: HistoricalBorderFeature) => {
        let feat = arg0_feat
        set_nav_history((arg0_prev) => [
          ...arg0_prev,
          {
            anchorCoord: selected_city_anchor_coord || null,
            anchorScreen: selected_city_anchor_screen || selected_city_anchor || null,
            city: selected_city,
            cityKey: selected_city_key,
            type: 'city',
          },
        ])
        set_active_panel_type('country')
        set_selected_historical_feature(feat)
        if (selected_city_anchor_coord) {
          set_selected_historical_anchor_coord(selected_city_anchor_coord)
        }
        if (selected_city_anchor_screen || selected_city_anchor) {
          set_selected_historical_anchor_screen(selected_city_anchor_screen || selected_city_anchor || null)
        }
        if (on_toggle_country)
          on_toggle_country(feat as unknown as CountryFeature)
        else if (on_select_country)
          on_select_country(feat as unknown as CountryFeature)
      }

      let found: HistoricalBorderFeature | undefined
      if (historical_borders_result.bordersData?.features) {
        let all_f = historical_borders_result.bordersData.features
        if (country_name) {
          let c_norm = country_name.toLowerCase().trim()
          found = all_f.find((arg0_f: any) => {
            let nm = (arg0_f.properties?.name || '').toLowerCase().trim()
            let nml = (arg0_f.properties?.name_long || '').toLowerCase().trim()
            return nm === c_norm || nml === c_norm
          })
        }
        if (!found && state_id !== undefined && state_id !== null) {
          let sid_str = String(state_id).replace(/^naissance_/, '')
          found = all_f.find((arg0_f: any) => {
            let fid = String(arg0_f.id || arg0_f.properties?.id || '').replace(/^naissance_/, '')
            let f_state_id = arg0_f.properties?.state_id !== undefined ? String(arg0_f.properties.state_id) : ''
            return (fid && fid === sid_str) || (f_state_id && f_state_id === sid_str)
          })
        }
        if (!found && country_name) {
          let c_norm = country_name.toLowerCase().trim()
          found = all_f.find((arg0_f: any) => {
            let nm = (arg0_f.properties?.name || '').toLowerCase().trim()
            let nml = (arg0_f.properties?.name_long || '').toLowerCase().trim()
            return nm.includes(c_norm) || c_norm.includes(nm)
          })
        }
        if (!found && state_id !== undefined && state_id !== null) {
          let sid_num = Number(state_id)
          found = all_f.find((arg0_f: any) => arg0_f.properties?.gwcode === sid_num)
        }
      }

      if (found) {
        applyTargetFeature(found)
      } else if (state_id !== undefined || country_name) {
        let params = new URLSearchParams()
        if (timeline_year !== undefined)
          params.set('year', String(timeline_year))
        if (state_id !== undefined && state_id !== null)
          params.set('state_id', String(state_id))
        if (country_name)
          params.set('country', country_name)

        fetch(`/api/atlas/border?${params.toString()}`)
          .then((arg0_res) => (arg0_res.ok ? arg0_res.json() : null))
          .then((arg0_data) => {
            if (arg0_data && (arg0_data.geometry || arg0_data.properties))
              applyTargetFeature(arg0_data)
          })
          .catch((arg0_err) => {
            console.error('[MapViewer] Failed to request border info:', arg0_err)
          })
      }
    },
    [historical_borders_result, on_select_country, on_toggle_country, selected_city, selected_city_anchor, selected_city_anchor_coord, selected_city_anchor_screen, selected_city_key, timeline_year]
  )

  let handle_map_select_city = useCallback(
    (arg0_city: CityPoint, arg1_coord?: [number, number], arg2_screen_x?: number, arg3_screen_y?: number) => {
      let city = arg0_city
      let coord = arg1_coord
      let screen_x = arg2_screen_x
      let screen_y = arg3_screen_y

      if (is_drawing)
        return

      let city_anchor_coord: [number, number] | null = null
      if (coord && Number.isFinite(coord[0]) && Number.isFinite(coord[1])) {
        city_anchor_coord = [coord[0], coord[1]]
      } else if ((city as any).rawCoords && Number.isFinite((city as any).rawCoords[0]) && Number.isFinite((city as any).rawCoords[1])) {
        city_anchor_coord = [(city as any).rawCoords[0], (city as any).rawCoords[1]]
      } else if (city.coords && Number.isFinite(city.coords[0]) && Number.isFinite(city.coords[1])) {
        if (Math.abs(city.coords[0]) > 90 && Math.abs(city.coords[1]) <= 90) {
          city_anchor_coord = [city.coords[0], city.coords[1]]
        } else {
          city_anchor_coord = [city.coords[1], city.coords[0]]
        }
      }

      set_nav_history([])
      set_active_panel_type('city')
      set_selected_city_anchor_coord(city_anchor_coord)
      if (screen_x !== undefined && screen_y !== undefined && Number.isFinite(screen_x) && Number.isFinite(screen_y)) {
        set_selected_city_anchor_screen({ x: screen_x, y: screen_y })
      } else {
        set_selected_city_anchor_screen(null)
      }
      set_selected_historical_feature(null)
      set_selected_historical_anchor_coord(null)
      set_selected_historical_anchor_screen(null)
      if (on_select_city)
        on_select_city(city)
    },
    [is_drawing, on_select_city]
  )

  useEffect(() => {
    if (!selected_countries || selected_countries.length === 0) {
      if (!selected_country && active_panel_type !== 'country')
        set_selected_historical_feature(null)
    }
  }, [selected_countries, selected_country, active_panel_type])

  useEffect(() => {
    if (selected_city && !selected_historical_feature && !active_panel_type) {
      set_active_panel_type('city')
    } else if (!selected_city && active_panel_type === 'city' && nav_history.length === 0) {
      set_active_panel_type(null)
    }
  }, [selected_city, selected_historical_feature, active_panel_type, nav_history.length])

  useEffect(() => {
    if (!selected_historical_feature && active_panel_type === 'country' && nav_history.length === 0) {
      set_active_panel_type(null)
    }
  }, [selected_historical_feature, active_panel_type, nav_history.length])

  useEffect(() => {
    if (is_drawing) {
      set_selected_historical_feature(null)
      set_active_panel_type(null)
    }
  }, [is_drawing])

  useEffect(() => {
    if (drawn_polygon_feature && !is_drawing) {
      let hist_feat = drawn_polygon_feature as unknown as HistoricalBorderFeature
      set_selected_historical_feature(hist_feat)
      set_active_panel_type('country')
      if (drawn_polygon_feature.geometry?.coordinates?.[0]?.[0]) {
        let first_pt = drawn_polygon_feature.geometry.coordinates[0][0]
        set_selected_historical_anchor_coord([first_pt[0], first_pt[1]])
        if (deck_ref.current) {
          let screen = projectLngLatToScreen([first_pt[0], first_pt[1]], deck_ref.current, projection)
          if (screen) {
            set_selected_historical_anchor_screen({ x: screen[0], y: screen[1] })
          }
        }
      }
    }
  }, [drawn_polygon_feature, is_drawing, projection, deck_ref])

  useEffect(() => {
    if (selected_historical_feature && historical_borders_result.bordersData) {
      let current_id = selected_historical_feature.id || selected_historical_feature.properties?.id
      let current_name = selected_historical_feature.properties?.name
      let clean_current_id = (current_id !== undefined && current_id !== null)
        ? String(current_id).replace(/^naissance_/, '')
        : ''

      let updated_feat = historical_borders_result.bordersData.features.find(
        (arg0_f: any) => {
          let f_id = arg0_f.id || arg0_f.properties?.id
          let clean_f_id = (f_id !== undefined && f_id !== null)
            ? String(f_id).replace(/^naissance_/, '')
            : ''
          if (clean_current_id && clean_f_id && clean_current_id === clean_f_id)
            return true
          if (current_name && arg0_f.properties?.name && arg0_f.properties.name === current_name)
            return true
          return false
        }
      )
      if (updated_feat && updated_feat !== selected_historical_feature) {
        let is_same_identity =
          updated_feat.id === selected_historical_feature.id &&
          updated_feat.properties?.name === selected_historical_feature.properties?.name &&
          updated_feat.geometry === selected_historical_feature.geometry

        set_selected_historical_feature(updated_feat)
        if (!is_same_identity) {
          if (on_select_country) {
            on_select_country(updated_feat as unknown as CountryFeature)
          } else if (on_toggle_country) {
            on_toggle_country(updated_feat as unknown as CountryFeature)
          }
        }
      }
    }
  }, [selected_historical_feature, historical_borders_result.bordersData, on_select_country, on_toggle_country])

  useEffect(() => {
    if (selected_city && selected_city.key && selected_city.key !== last_centered_city_key_ref.current) {
      last_centered_city_key_ref.current = selected_city.key

      if (!selected_city_anchor_screen) {
        let c_lat: number | undefined
        let c_lon: number | undefined
        let city_coords = (selected_city as any).coords
        let city_raw = (selected_city as any).rawCoords

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

        if (c_lon !== undefined && c_lat !== undefined) {
          set_selected_city_anchor_coord([c_lon, c_lat])
          center_on_coordinates(c_lon, c_lat)
        }
      }
    } else if (!selected_city) {
      last_centered_city_key_ref.current = null
    }
  }, [selected_city, selected_city_anchor_screen, center_on_coordinates])

  //Return statement
  return {
    active_panel_type,
    center_on_coordinates,
    handle_center_selected_city,
    handle_clear_polygon,
    handle_close_all_details,
    handle_edit_polygon,
    handle_map_select_city,
    handle_nav_back,
    handle_select_city_from_country,
    handle_select_country_from_city,
    nav_history,
    selected_city_anchor,
    selected_city_anchor_coord,
    selected_city_anchor_screen,
    selected_historical_anchor,
    selected_historical_anchor_coord,
    selected_historical_anchor_screen,
    selected_historical_feature,
    set_active_panel_type,
    set_nav_history,
    set_selected_city_anchor_coord,
    set_selected_city_anchor_screen,
    set_selected_historical_anchor_coord,
    set_selected_historical_anchor_screen,
    set_selected_historical_feature,
  }
}
