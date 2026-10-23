import { useCallback, useMemo, useState } from 'react'
import {
  CountryFeature,
} from '@framework/geopng/polygon_binning.ts'
import {
  CustomVectorDataset,
  parseCustomVectorText,
  sliceCustomVectorDataset,
} from '@framework/geopng/custom_vector_service.ts'
import { createDrawnPolygonFeature } from '@framework/geopng/polygon_draw_tool.ts'
import type { MapModeItem } from '@framework/geopng/types.ts'

export interface UseAppDrawStateOptions {
  set_inspect_data: React.Dispatch<React.SetStateAction<any>>
  set_map_modes?: React.Dispatch<React.SetStateAction<MapModeItem[]>>
  set_selected_city_key: React.Dispatch<React.SetStateAction<string | null>>
  set_timeline_year: (arg0_yr: number) => void
  timeline_year: number
}

/**
 * Checks whether two CountryFeatures reference the exact same geopolitical polygon entity.
 *
 * @param {CountryFeature} arg0_a
 * @param {CountryFeature} arg1_b
 *
 * @returns {boolean}
 */
export function matchesCountryFeature (arg0_a: CountryFeature, arg1_b: CountryFeature): boolean {
  //Convert from parameters
  let a = arg0_a
  let b = arg1_b

  //Guard clauses
  if (a === b)
    return true
  if (a.id !== undefined && b.id !== undefined && a.id === b.id)
    return true
  if (a.properties?.id !== undefined && b.properties?.id !== undefined && a.properties.id === b.properties.id)
    return true
  if (a.properties?.gwcode !== undefined && b.properties?.gwcode !== undefined && a.properties.gwcode === b.properties.gwcode)
    return true
  if (a.properties?.iso_a3 && a.properties.iso_a3 !== '-99' && a.properties.iso_a3 === b.properties?.iso_a3)
    return true

  //Return statement
  return Boolean(a.properties?.name && b.properties?.name && a.properties.name === b.properties.name)
}


/**
 * Hook to manage custom vector files, user polygon drawing state, and country selection perimeters.
 *
 * @param {UseAppDrawStateOptions} arg0_options
 *
 * @returns {object}
 */
export function useAppDrawState (arg0_options: UseAppDrawStateOptions) {
  //Convert from parameters
  let set_inspect_data = arg0_options.set_inspect_data
  let set_map_modes = arg0_options.set_map_modes
  let set_selected_city_key = arg0_options.set_selected_city_key
  let set_timeline_year = arg0_options.set_timeline_year
  let timeline_year = arg0_options.timeline_year

  //Declare local instance variables
  let [countries_mode, set_countries_mode] = useState<boolean>(false)
  let [cursor_lng_lat, set_cursor_lng_lat] = useState<[number, number] | null>(null)
  let [custom_vector_dataset, set_custom_vector_dataset] = useState<CustomVectorDataset | null>(null)
  let [custom_vector_visible, set_custom_vector_visible] = useState<boolean>(true)
  let [draw_points, set_draw_points] = useState<[number, number][]>([])
  let [drawn_polygon_feature, set_drawn_polygon_feature] = useState<CountryFeature | null>(null)
  let [hovered_country, set_hovered_country] = useState<CountryFeature | null>(null)
  let [is_drawing, set_is_drawing] = useState<boolean>(false)
  let [is_editing_shape, set_is_editing_shape] = useState<boolean>(false)
  let [selected_countries, set_selected_countries] = useState<CountryFeature[]>([])

  //Function body
  let active_countries = useMemo<CountryFeature[]>(() => {
    if (selected_countries.length > 0)
      return selected_countries
    return []
  }, [selected_countries])

  let custom_vector_features = useMemo<CountryFeature[]>(() => {
    if (!custom_vector_dataset)
      return []
    return sliceCustomVectorDataset(custom_vector_dataset, timeline_year)
  }, [custom_vector_dataset, timeline_year])

  let handle_upload_custom_vector = useCallback(
    (arg0_file: File) => {
      let file = arg0_file
      let reader = new FileReader()

      reader.onload = (arg0_e) => {
        let text = arg0_e.target?.result
        if (typeof text === 'string') {
          try {
            let dataset = parseCustomVectorText(text, file.name)
            set_custom_vector_dataset(dataset)
            set_custom_vector_visible(true)
            if (dataset.targetYear !== undefined) {
              set_timeline_year(dataset.targetYear)
            } else if (dataset.maxYear !== undefined) {
              set_timeline_year(dataset.maxYear)
            }
          } catch (arg0_err) {
            console.error('[CustomVector] Failed to parse file:', arg0_err)
          }
        }
      }
      reader.readAsText(file)
    },
    [set_timeline_year]
  )

  let handle_remove_custom_vector = useCallback(() => {
    set_custom_vector_dataset(null)
  }, [])

  let handle_select_country = useCallback(
    (arg0_c: CountryFeature | null) => {
      let c = arg0_c

      //Guard clauses
      if (is_drawing && c && !c.properties?.is_drawn)
        return

      if (!c) {
        set_selected_countries((arg0_prev) => (arg0_prev.length === 0 ? arg0_prev : []))
        set_inspect_data(null)
      } else {
        set_selected_countries((arg0_prev) => {
          if (c.properties?.is_drawn)
            return [c]
          if (arg0_prev.length === 1 && matchesCountryFeature(arg0_prev[0], c))
            return arg0_prev
          return [c]
        })
      }
    },
    [is_drawing, set_inspect_data]
  )

  let handle_toggle_country = useCallback(
    (arg0_c: CountryFeature) => {
      let c = arg0_c

      //Guard clauses
      if (is_drawing)
        return

      set_selected_countries((arg0_prev) => {
        let exists = arg0_prev.some((arg0_x) => matchesCountryFeature(arg0_x, c))
        if (exists)
          return arg0_prev.filter((arg0_x) => !matchesCountryFeature(arg0_x, c))

        return [...arg0_prev, c]
      })
    },
    [is_drawing]
  )

  let handle_clear_countries = useCallback(() => {
    set_selected_countries((arg0_prev) => (arg0_prev.length === 0 ? arg0_prev : []))
    set_inspect_data(null)
  }, [set_inspect_data])

  let handle_toggle_countries_mode = useCallback(
    (arg0_enabled: boolean) => {
      let enabled = arg0_enabled
      set_countries_mode(enabled)
      if (set_map_modes) {
        set_map_modes((arg0_prev) =>
          arg0_prev.map((arg0_m) => (arg0_m.id === 'country_analysis' ? { ...arg0_m, active: enabled } : arg0_m))
        )
      }
    },
    [set_map_modes]
  )

  let handle_toggle_draw = useCallback(() => {
    set_is_editing_shape(false)
    set_is_drawing((arg0_prev) => {
      let next = !arg0_prev
      if (next) {
        set_cursor_lng_lat(null)
        set_draw_points([])
        set_drawn_polygon_feature(null)
        set_hovered_country(null)
        set_inspect_data(null)
        set_selected_city_key(null)
        set_selected_countries([])
      }
      return next
    })
  }, [set_inspect_data, set_selected_city_key])

  let handle_cancel_draw = useCallback(() => {
    set_cursor_lng_lat(null)
    set_draw_points([])
    set_is_drawing(false)
    set_is_editing_shape(false)
  }, [])

  let handle_add_draw_point = useCallback((arg0_pt: [number, number]) => {
    let pt = arg0_pt
    set_draw_points((arg0_prev) => [...arg0_prev, pt])
  }, [])

  let handle_move_draw_point = useCallback((arg0_index: number, arg1_pt: [number, number]) => {
    let index = arg0_index
    let pt = arg1_pt

    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1]))
      return

    set_draw_points((arg0_prev) => {
      if (index < 0 || index >= arg0_prev.length)
        return arg0_prev
      let next = arg0_prev.slice()
      next[index] = [pt[0], pt[1]]
      return next
    })
  }, [])

  let handle_insert_draw_point = useCallback((arg0_index: number, arg1_pt: [number, number]) => {
    let index = arg0_index
    let pt = arg1_pt

    if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1]))
      return

    set_draw_points((arg0_prev) => {
      let next = arg0_prev.slice()
      next.splice(index, 0, [pt[0], pt[1]])
      return next
    })
  }, [])

  let handle_delete_draw_point = useCallback((arg0_index: number) => {
    let index = arg0_index

    set_draw_points((arg0_prev) => {
      if (is_editing_shape && arg0_prev.length <= 3)
        return arg0_prev
      if (index < 0 || index >= arg0_prev.length)
        return arg0_prev
      let next = arg0_prev.slice()
      next.splice(index, 1)
      return next
    })
  }, [is_editing_shape])

  let handle_delete_last_draw_point = useCallback(() => {
    set_draw_points((arg0_prev) => {
      if (is_editing_shape && arg0_prev.length <= 3)
        return arg0_prev
      return arg0_prev.slice(0, -1)
    })
  }, [is_editing_shape])

  let handle_edit_drawn_polygon = useCallback((arg0_feature?: CountryFeature) => {
    let feat = arg0_feature || drawn_polygon_feature

    if (!feat || !feat.geometry)
      return

    let coords: [number, number][] = []
    let geom: any = feat.geometry

    if (geom.type === 'Polygon' && Array.isArray(geom.coordinates) && geom.coordinates[0]) {
      let ring = geom.coordinates[0] as [number, number][]
      if (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) {
        coords = ring.slice(0, -1)
      } else {
        coords = ring.slice()
      }
    }

    set_draw_points(coords)
    set_drawn_polygon_feature(null)
    set_selected_countries((arg0_prev) => arg0_prev.filter((arg0_f) => !arg0_f.properties?.is_drawn))
    set_is_editing_shape(true)
    set_is_drawing(true)
  }, [drawn_polygon_feature])

  let handle_finish_draw = useCallback(() => {
    if (draw_points.length < 3)
      return

    let polygon_feat = createDrawnPolygonFeature(draw_points)
    set_drawn_polygon_feature(polygon_feat)
    set_is_drawing(false)
    set_is_editing_shape(false)
    set_draw_points([])
    set_cursor_lng_lat(null)
    handle_select_country(polygon_feat)
  }, [draw_points, handle_select_country])

  let handle_clear_drawn_polygon = useCallback(() => {
    set_drawn_polygon_feature(null)
    set_is_editing_shape(false)
    set_selected_countries((arg0_prev) => arg0_prev.filter((arg0_f) => !arg0_f.properties?.is_drawn))
  }, [])

  //Return statement
  return {
    active_countries,
    countries_mode,
    cursor_lng_lat,
    custom_vector_dataset,
    custom_vector_features,
    custom_vector_visible,
    draw_points,
    drawn_polygon_feature,
    handle_add_draw_point,
    handle_cancel_draw,
    handle_clear_countries,
    handle_clear_drawn_polygon,
    handle_delete_draw_point,
    handle_delete_last_draw_point,
    handle_edit_drawn_polygon,
    handle_finish_draw,
    handle_insert_draw_point,
    handle_move_draw_point,
    handle_remove_custom_vector,
    handle_select_country,
    handle_toggle_countries_mode,
    handle_toggle_country,
    handle_toggle_draw,
    handle_upload_custom_vector,
    hovered_country,
    is_drawing,
    is_editing_shape,
    selected_countries,
    set_countries_mode,
    set_cursor_lng_lat,
    set_custom_vector_dataset,
    set_custom_vector_visible,
    set_draw_points,
    set_drawn_polygon_feature,
    set_hovered_country,
    set_is_drawing,
    set_is_editing_shape,
    set_selected_countries,
  }
}
