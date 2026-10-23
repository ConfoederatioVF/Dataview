import { useCallback, useRef } from 'react'
import {
  CountryFeature,
  findCountryAtLngLat,
  isPointInGeometry,
} from '@framework/geopng/polygon_binning.ts'
import { sampleRasterAt } from '@framework/geopng/sample_raster'
import type {
  DecodedRaster,
  InspectionData,
  ProjectionType,
} from '@framework/geopng/types.ts'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import type { MapDetailsNavEntry } from './map_viewer_anchors.ts'

export interface UseMapViewerSamplingOptions {
  countries_mode?: boolean
  country_features: CountryFeature[]
  custom_vector_features: CountryFeature[]
  custom_vector_visible: boolean
  deck_ref: React.RefObject<any>
  drawn_polygon_feature?: CountryFeature | null
  effective_country_features: CountryFeature[]
  handleMapClick: (click_x: number, click_y: number, info: any) => boolean
  is_drawing: boolean
  is_editing_shape: boolean
  is_historical_borders_active: boolean
  on_close_city_details?: () => void
  on_hover_country?: (country: CountryFeature | null) => void
  on_inspect?: (data: InspectionData | null) => void
  on_select_country?: (country: CountryFeature | null) => void
  on_set_cursor_lng_lat?: (arg0_coord: [number, number] | null) => void
  on_toggle_country?: (country: CountryFeature) => void
  projection: ProjectionType
  raster: DecodedRaster | null
  set_active_panel_type: React.Dispatch<React.SetStateAction<'city' | 'country' | null>>
  set_cursor_pos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  set_hovered_city: React.Dispatch<React.SetStateAction<any>>
  set_hovered_city_pos: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  set_hovered_historical_feature: React.Dispatch<React.SetStateAction<HistoricalBorderFeature | null>>
  set_inspect_data: React.Dispatch<React.SetStateAction<InspectionData | null>>
  set_nav_history: React.Dispatch<React.SetStateAction<MapDetailsNavEntry[]>>
  set_selected_historical_anchor_coord: React.Dispatch<React.SetStateAction<[number, number] | null>>
  set_selected_historical_anchor_screen: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>
  set_selected_historical_feature: React.Dispatch<React.SetStateAction<HistoricalBorderFeature | null>>
}

/**
 * Hook to manage raster sampling, hover picking, and click selection for countries and borders.
 *
 * @param {UseMapViewerSamplingOptions} arg0_options
 *
 * @returns {object}
 */
export function useMapViewerSampling (arg0_options: UseMapViewerSamplingOptions) {
  //Convert from parameters
  let countries_mode = arg0_options.countries_mode
  let country_features = arg0_options.country_features
  let custom_vector_features = arg0_options.custom_vector_features
  let custom_vector_visible = arg0_options.custom_vector_visible
  let deck_ref = arg0_options.deck_ref
  let drawn_polygon_feature = arg0_options.drawn_polygon_feature
  let effective_country_features = arg0_options.effective_country_features
  let handleMapClick = arg0_options.handleMapClick
  let is_drawing = arg0_options.is_drawing
  let is_historical_borders_active = arg0_options.is_historical_borders_active
  let on_close_city_details = arg0_options.on_close_city_details
  let on_hover_country = arg0_options.on_hover_country
  let on_inspect = arg0_options.on_inspect
  let on_select_country = arg0_options.on_select_country
  let on_set_cursor_lng_lat = arg0_options.on_set_cursor_lng_lat
  let on_toggle_country = arg0_options.on_toggle_country
  let projection = arg0_options.projection
  let raster = arg0_options.raster
  let set_active_panel_type = arg0_options.set_active_panel_type
  let set_cursor_pos = arg0_options.set_cursor_pos
  let set_hovered_city = arg0_options.set_hovered_city
  let set_hovered_city_pos = arg0_options.set_hovered_city_pos
  let set_hovered_historical_feature = arg0_options.set_hovered_historical_feature
  let set_inspect_data = arg0_options.set_inspect_data
  let set_nav_history = arg0_options.set_nav_history
  let set_selected_historical_anchor_coord = arg0_options.set_selected_historical_anchor_coord
  let set_selected_historical_anchor_screen = arg0_options.set_selected_historical_anchor_screen
  let set_selected_historical_feature = arg0_options.set_selected_historical_feature

  //Declare local instance variables
  let hover_raf_ref = useRef<number | null>(null)
  let is_interacting_ref = useRef<boolean>(false)
  let last_country_ref = useRef<CountryFeature | null>(null)
  let last_hovered_country_code_ref = useRef<string | null | undefined>(null)
  let pending_pointer_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let pending_touch_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let touch_pick_raf_ref = useRef<number | null>(null)

  //Function body
  let sample_raster_at = useCallback(
    (coordX: number, coordY: number): InspectionData | null => {
      return sampleRasterAt(
        coordX,
        coordY,
        raster,
        projection,
        effective_country_features,
        Boolean(countries_mode || is_historical_borders_active),
        last_country_ref.current
      )
    },
    [raster, effective_country_features, projection, countries_mode, is_historical_borders_active]
  )

  let sample_pointer_at = useCallback(
    (arg0_x: number, arg1_y: number) => {
      let x = arg0_x
      let y = arg1_y

      if (!deck_ref.current)
        return

      let deck_inst = deck_ref.current?.deck || deck_ref.current
      let viewports = deck_inst?.getViewports ? deck_inst.getViewports() : []
      let vp = viewports[0]
      let insp: InspectionData | null = null
      let unprojected_coord: [number, number] | null = null

      if (vp && typeof vp.unproject === 'function') {
        try {
          let pt = vp.unproject([x, y], { targetZ: 0 })
          if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1]))
            unprojected_coord = [pt[0], pt[1]]
        } catch {
          // Ignore unproject calculation errors
        }
      }

      if (is_drawing) {
        set_inspect_data(null)
        set_hovered_city(null)
        set_hovered_city_pos(null)
        set_hovered_historical_feature(null)
        last_hovered_country_code_ref.current = null
        if (on_hover_country)
          on_hover_country(null)
        return
      }

      if (unprojected_coord) {
        insp = sample_raster_at(unprojected_coord[0], unprojected_coord[1])
        set_inspect_data(insp)
      } else {
        set_inspect_data(null)
      }

      let pick_info = deck_ref.current.pickObject({ x, y })
      if (pick_info) {
        if (pick_info.coordinate && !unprojected_coord) {
          insp = sample_raster_at(pick_info.coordinate[0], pick_info.coordinate[1])
          set_inspect_data(insp)
        }
        if (
          pick_info.layer?.id?.includes('historical-borders') ||
          pick_info.layer?.id?.includes('custom-vector') ||
          pick_info.layer?.id?.includes('drawn-polygon') ||
          (pick_info.object && (
            pick_info.object.properties?.gwcode !== undefined ||
            pick_info.object.properties?.keyframes !== undefined ||
            pick_info.object.properties?.is_custom !== undefined ||
            pick_info.object.properties?.is_drawn !== undefined
          ))
        ) {
          set_hovered_historical_feature(pick_info.object || null)
        } else if (insp && custom_vector_visible && custom_vector_features.length > 0) {
          let hover_custom = findCountryAtLngLat(insp.lng, insp.lat, custom_vector_features)
          set_hovered_historical_feature(hover_custom as unknown as HistoricalBorderFeature || null)
        } else if (insp && drawn_polygon_feature && isPointInGeometry(insp.lng, insp.lat, drawn_polygon_feature.geometry)) {
          set_hovered_historical_feature(drawn_polygon_feature as unknown as HistoricalBorderFeature)
        } else {
          set_hovered_historical_feature((arg0_prev) => (arg0_prev ? null : null))
        }
      } else {
        if (insp && custom_vector_visible && custom_vector_features.length > 0) {
          let hover_custom = findCountryAtLngLat(insp.lng, insp.lat, custom_vector_features)
          set_hovered_historical_feature(hover_custom as unknown as HistoricalBorderFeature || null)
        } else if (insp && drawn_polygon_feature && isPointInGeometry(insp.lng, insp.lat, drawn_polygon_feature.geometry)) {
          set_hovered_historical_feature(drawn_polygon_feature as unknown as HistoricalBorderFeature)
        } else {
          set_hovered_historical_feature((arg0_prev) => (arg0_prev ? null : null))
        }
      }

      if ((countries_mode || is_historical_borders_active) && on_hover_country) {
        let next_code = insp?.countryName || null
        if (last_hovered_country_code_ref.current !== next_code) {
          last_hovered_country_code_ref.current = next_code
          let local_country = (insp && effective_country_features.length > 0)
            ? findCountryAtLngLat(insp.lng, insp.lat, effective_country_features)
            : null
          on_hover_country(local_country)
        }
      }
    },
    [countries_mode, custom_vector_features, custom_vector_visible, deck_ref, drawn_polygon_feature, effective_country_features, is_drawing, is_historical_borders_active, on_hover_country, sample_raster_at, set_hovered_city, set_hovered_city_pos, set_hovered_historical_feature, set_inspect_data]
  )

  let handle_hover = useCallback(
    (arg0_info: any) => {
      let info = arg0_info

      if (is_drawing || is_interacting_ref.current || !info)
        return

      if (
        info.layer?.id?.includes('historical-borders') ||
        info.layer?.id?.includes('custom-vector') ||
        info.layer?.id?.includes('drawn-polygon') ||
        (info.object && (
          info.object.properties?.gwcode !== undefined ||
          info.object.properties?.keyframes !== undefined ||
          info.object.properties?.is_custom !== undefined ||
          info.object.properties?.is_drawn !== undefined
        ))
      ) {
        set_hovered_historical_feature(info.object || null)
      } else {
        set_hovered_historical_feature((arg0_prev) => (arg0_prev ? null : null))
      }
    },
    [is_drawing, set_hovered_historical_feature]
  )

  let handle_click = useCallback(
    (info: any) => {
      if (is_drawing) {
        let click_x = info.x
        let click_y = info.y
        if (click_x === undefined || click_y === undefined)
          return

        if (handleMapClick(click_x, click_y, info))
          return
      }

      if (info.layer?.id?.includes('stadester') || (info.object && (info.object.coords || info.object.rawCoords)))
        return

      if (
        info.layer?.id?.includes('historical-borders') ||
        info.layer?.id?.includes('custom-vector') ||
        info.layer?.id?.includes('drawn-polygon') ||
        (info.object && (
          info.object.properties?.gwcode !== undefined ||
          info.object.properties?.keyframes !== undefined ||
          info.object.properties?.is_custom !== undefined ||
          info.object.properties?.is_drawn !== undefined
        ))
      ) {
        let hist_feat = ((info.object && info.object.raw_feature) ? info.object.raw_feature : info.object) as HistoricalBorderFeature
        set_nav_history([])
        set_active_panel_type('country')
        if (on_close_city_details)
          on_close_city_details()
        set_selected_historical_feature(hist_feat)
        if (info.coordinate) {
          set_selected_historical_anchor_coord([info.coordinate[0], info.coordinate[1]])
        }
        if (info.x !== undefined && info.y !== undefined) {
          set_selected_historical_anchor_screen({ x: info.x, y: info.y })
        }
        if (on_select_country) {
          on_select_country(hist_feat as unknown as CountryFeature)
        } else if (on_toggle_country) {
          on_toggle_country(hist_feat as unknown as CountryFeature)
        }
        return
      }

      let x_coord: number | null = null
      let y_coord: number | null = null

      if (info.coordinate) {
        x_coord = info.coordinate[0]
        y_coord = info.coordinate[1]
      } else if (info.x !== undefined && info.y !== undefined && deck_ref.current) {
        let deck_inst = deck_ref.current?.deck || deck_ref.current
        let viewports = deck_inst?.getViewports ? deck_inst.getViewports() : []
        let vp = viewports[0]
        if (vp && typeof vp.unproject === 'function') {
          try {
            let pt = vp.unproject([info.x, info.y], { targetZ: 0 })
            if (pt && Number.isFinite(pt[0]) && Number.isFinite(pt[1])) {
              x_coord = pt[0]
              y_coord = pt[1]
            }
          } catch {
            // Ignore unproject calculation errors
          }
        }
      }

      if (x_coord === null || y_coord === null)
        return

      let insp = sample_raster_at(x_coord, y_coord)
      set_inspect_data(insp)
      set_cursor_pos({ x: info.x, y: info.y })
      if (on_inspect)
        on_inspect(insp)

      if (insp && custom_vector_visible && custom_vector_features.length > 0) {
        let custom_feat = findCountryAtLngLat(insp.lng, insp.lat, custom_vector_features)
        if (custom_feat) {
          let hist_feat = custom_feat as unknown as HistoricalBorderFeature
          set_nav_history([])
          set_active_panel_type('country')
          if (on_close_city_details)
            on_close_city_details()
          set_selected_historical_feature(hist_feat)
          set_selected_historical_anchor_coord([insp.lng, insp.lat])
          if (info.x !== undefined && info.y !== undefined) {
            set_selected_historical_anchor_screen({ x: info.x, y: info.y })
          }
          if (on_select_country) {
            on_select_country(custom_feat)
          } else if (on_toggle_country) {
            on_toggle_country(custom_feat)
          }
          return
        }
      }

      if (insp && drawn_polygon_feature) {
        if (isPointInGeometry(insp.lng, insp.lat, drawn_polygon_feature.geometry)) {
          let hist_feat = drawn_polygon_feature as unknown as HistoricalBorderFeature
          set_nav_history([])
          set_active_panel_type('country')
          if (on_close_city_details)
            on_close_city_details()
          set_selected_historical_feature(hist_feat)
          set_selected_historical_anchor_coord([insp.lng, insp.lat])
          if (info.x !== undefined && info.y !== undefined) {
            set_selected_historical_anchor_screen({ x: info.x, y: info.y })
          }
          if (on_select_country) {
            on_select_country(drawn_polygon_feature)
          } else if (on_toggle_country) {
            on_toggle_country(drawn_polygon_feature)
          }
          return
        }
      }

      let target_countries = effective_country_features.length > 0 ? effective_country_features : country_features
      if (insp && target_countries.length > 0) {
        let local_country = findCountryAtLngLat(insp.lng, insp.lat, target_countries)
        if (local_country) {
          if (on_toggle_country) {
            on_toggle_country(local_country)
          } else if (on_select_country) {
            on_select_country(local_country)
          }
        }
      }
    },
    [
      country_features,
      custom_vector_features,
      custom_vector_visible,
      deck_ref,
      drawn_polygon_feature,
      effective_country_features,
      handleMapClick,
      is_drawing,
      on_close_city_details,
      on_inspect,
      on_select_country,
      on_toggle_country,
      sample_raster_at,
      set_active_panel_type,
      set_cursor_pos,
      set_inspect_data,
      set_nav_history,
      set_selected_historical_anchor_coord,
      set_selected_historical_anchor_screen,
      set_selected_historical_feature,
    ]
  )

  //Return statement
  return {
    handle_click,
    handle_hover,
    hover_raf_ref,
    is_interacting_ref,
    pending_pointer_pos_ref,
    pending_touch_pos_ref,
    sample_pointer_at,
    sample_raster_at,
    touch_pick_raf_ref,
  }
}
