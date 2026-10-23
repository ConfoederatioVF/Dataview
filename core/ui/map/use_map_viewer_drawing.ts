import { useCallback, useEffect, useRef, useState } from 'react'
import {
  projectLngLatToScreen,
  unprojectScreenToLngLat,
} from '@framework/geopng/polygon_draw_tool.ts'
import { invertEqualEarth } from '@framework/geopng/equal_earth.ts'
import type { ProjectionType } from '@framework/geopng/types.ts'

export interface UseMapViewerDrawingOptions {
  deck_ref: React.RefObject<any>
  draw_points: [number, number][]
  is_drawing: boolean
  is_editing_shape: boolean
  is_mobile: boolean
  on_add_draw_point?: (arg0_point: [number, number]) => void
  on_cancel_draw?: () => void
  on_delete_draw_point?: (arg0_index: number) => void
  on_delete_last_draw_point?: () => void
  on_finish_draw?: () => void
  on_insert_draw_point?: (arg0_index: number, arg1_point: [number, number]) => void
  on_move_draw_point?: (arg0_index: number, arg1_point: [number, number]) => void
  on_set_cursor_lng_lat?: (arg0_coord: [number, number] | null) => void
  projection: ProjectionType
}

/**
 * Hook to manage interactive polygon drawing, vertex placement, vertex dragging, and keyboard shortcuts.
 *
 * @param {UseMapViewerDrawingOptions} arg0_options
 *
 * @returns {object}
 */
export function useMapViewerDrawing (arg0_options: UseMapViewerDrawingOptions) {
  //Convert from parameters
  let deck_ref = arg0_options.deck_ref
  let draw_points = arg0_options.draw_points
  let is_drawing = arg0_options.is_drawing
  let is_editing_shape = arg0_options.is_editing_shape
  let is_mobile = arg0_options.is_mobile
  let on_add_draw_point = arg0_options.on_add_draw_point
  let on_cancel_draw = arg0_options.on_cancel_draw
  let on_delete_draw_point = arg0_options.on_delete_draw_point
  let on_delete_last_draw_point = arg0_options.on_delete_last_draw_point
  let on_finish_draw = arg0_options.on_finish_draw
  let on_insert_draw_point = arg0_options.on_insert_draw_point
  let on_move_draw_point = arg0_options.on_move_draw_point
  let on_set_cursor_lng_lat = arg0_options.on_set_cursor_lng_lat
  let projection = arg0_options.projection

  //Declare local instance variables
  let [dragged_vertex_idx, set_dragged_vertex_idx] = useState<number | null>(null)
  let [hovered_vertex_idx, set_hovered_vertex_idx] = useState<number | null>(null)

  let drag_end_time_ref = useRef<number>(0)
  let drag_start_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let dragged_vertex_idx_ref = useRef<number | null>(null)
  let has_dragged_ref = useRef<boolean>(false)
  let last_map_click_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let last_map_click_time_ref = useRef<number>(0)
  let last_vertex_tap_ref = useRef<{ index: number; time: number; x: number; y: number } | null>(null)
  let point_just_deleted_ref = useRef<boolean>(false)
  let suppress_click_ref = useRef<boolean>(false)

  //Function body
  let get_vertex_at_screen_pos = useCallback(
    (arg0_x: number, arg1_y: number, arg2_threshold?: number): number => {
      let threshold = arg2_threshold ?? (is_mobile ? 28 : 14)
      let x = arg0_x
      let y = arg1_y

      if (!deck_ref.current || draw_points.length === 0)
        return -1

      let closest_dist_sq = threshold * threshold
      let closest_idx = -1

      for (let i = 0; i < draw_points.length; i++) {
        let pt_screen = projectLngLatToScreen(draw_points[i], deck_ref.current, projection)
        if (pt_screen) {
          let dist_sq = (x - pt_screen[0]) * (x - pt_screen[0]) + (y - pt_screen[1]) * (y - pt_screen[1])
          if (dist_sq <= closest_dist_sq) {
            closest_dist_sq = dist_sq
            closest_idx = i
          }
        }
      }

      return closest_idx
    },
    [deck_ref, draw_points, is_mobile, projection]
  )

  let get_edge_at_screen_pos = useCallback(
    (arg0_x: number, arg1_y: number, arg2_threshold?: number): number => {
      let threshold = arg2_threshold ?? (is_mobile ? 20 : 10)
      let x = arg0_x
      let y = arg1_y

      if (!deck_ref.current || draw_points.length < 3)
        return -1

      let closest_dist = threshold
      let closest_edge_idx = -1

      for (let i = 0; i < draw_points.length; i++) {
        let pt1_screen = projectLngLatToScreen(draw_points[i], deck_ref.current, projection)
        let pt2_screen = projectLngLatToScreen(draw_points[(i + 1) % draw_points.length], deck_ref.current, projection)
        if (pt1_screen && pt2_screen) {
          let dx = pt2_screen[0] - pt1_screen[0]
          let dy = pt2_screen[1] - pt1_screen[1]
          let len_sq = dx * dx + dy * dy
          let dist: number
          if (len_sq === 0) {
            dist = Math.hypot(x - pt1_screen[0], y - pt1_screen[1])
          } else {
            let t = Math.max(0, Math.min(1, ((x - pt1_screen[0]) * dx + (y - pt1_screen[1]) * dy) / len_sq))
            dist = Math.hypot(x - (pt1_screen[0] + t * dx), y - (pt1_screen[1] + t * dy))
          }
          if (dist <= closest_dist) {
            closest_dist = dist
            closest_edge_idx = i
          }
        }
      }

      return closest_edge_idx
    },
    [deck_ref, draw_points, is_mobile, projection]
  )

  useEffect(() => {
    let handleWindowPointerUp = () => {
      if (dragged_vertex_idx_ref.current !== null) {
        if (has_dragged_ref.current) {
          drag_end_time_ref.current = Date.now()
          suppress_click_ref.current = true
          setTimeout(() => {
            suppress_click_ref.current = false
          }, 450)
          last_vertex_tap_ref.current = null
        }
        dragged_vertex_idx_ref.current = null
        drag_start_pos_ref.current = null
        has_dragged_ref.current = false
        set_dragged_vertex_idx(null)
      }
    }

    window.addEventListener('pointerup', handleWindowPointerUp)
    return () => {
      window.removeEventListener('pointerup', handleWindowPointerUp)
    }
  }, [])

  useEffect(() => {
    if (!is_drawing)
      return

    let handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (on_cancel_draw)
          on_cancel_draw()
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        if (on_delete_last_draw_point)
          on_delete_last_draw_point()
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (draw_points.length >= 3 && on_finish_draw)
          on_finish_draw()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [is_drawing, draw_points.length, on_cancel_draw, on_delete_last_draw_point, on_finish_draw])

  let handlePointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.pointerType === 'mouse')
        return

      let rect = e.currentTarget.getBoundingClientRect()
      let x = e.clientX - rect.left
      let y = e.clientY - rect.top
      let is_touch = e.pointerType === 'touch' || is_mobile
      let hit_radius = is_touch ? 28 : 14

      if (is_drawing && draw_points.length > 0) {
        let v_idx = get_vertex_at_screen_pos(x, y, hit_radius)
        if (v_idx >= 0) {
          if (!is_editing_shape && draw_points.length >= 3 && v_idx === 0)
            return

          e.stopPropagation()
          try {
            e.currentTarget.setPointerCapture(e.pointerId)
          } catch {
            // Ignore pointer capture error
          }
          dragged_vertex_idx_ref.current = v_idx
          drag_start_pos_ref.current = { x, y }
          has_dragged_ref.current = false
          set_dragged_vertex_idx(v_idx)
          return
        }

        if (is_editing_shape && on_insert_draw_point) {
          let edge_idx = get_edge_at_screen_pos(x, y, is_touch ? 20 : 10)
          if (edge_idx >= 0) {
            let map_pt = unprojectScreenToLngLat(x, y, deck_ref.current, projection)
            if (map_pt) {
              e.stopPropagation()
              try {
                e.currentTarget.setPointerCapture(e.pointerId)
              } catch {
                // Ignore pointer capture error
              }
              on_insert_draw_point(edge_idx + 1, map_pt)
              dragged_vertex_idx_ref.current = edge_idx + 1
              drag_start_pos_ref.current = { x, y }
              has_dragged_ref.current = true
              set_dragged_vertex_idx(edge_idx + 1)
              return
            }
          }
        }
      }
    },
    [deck_ref, draw_points.length, get_edge_at_screen_pos, get_vertex_at_screen_pos, is_drawing, is_editing_shape, is_mobile, on_insert_draw_point, projection]
  )

  let handleTouchStartCapture = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (is_drawing && draw_points.length > 0) {
        let touch = e.touches[0]
        if (!touch)
          return
        let rect = e.currentTarget.getBoundingClientRect()
        let x = touch.clientX - rect.left
        let y = touch.clientY - rect.top
        let v_idx = get_vertex_at_screen_pos(x, y, 28)
        if (v_idx === 0 && !is_editing_shape && draw_points.length >= 3)
          return
        if (v_idx >= 0) {
          e.stopPropagation()
          return
        }
        if (is_editing_shape) {
          let edge_idx = get_edge_at_screen_pos(x, y, 20)
          if (edge_idx >= 0) {
            e.stopPropagation()
            return
          }
        }
      }
    },
    [draw_points.length, get_edge_at_screen_pos, get_vertex_at_screen_pos, is_drawing, is_editing_shape]
  )

  let handleDoubleClickCapture = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      let now = Date.now()
      if (point_just_deleted_ref.current || now - drag_end_time_ref.current < 450) {
        e.preventDefault()
        e.stopPropagation()
        return
      }

      let rect = e.currentTarget.getBoundingClientRect()
      let x = e.clientX - rect.left
      let y = e.clientY - rect.top
      let v_idx = get_vertex_at_screen_pos(x, y, is_mobile ? 28 : 16)

      if (is_drawing) {
        if (v_idx >= 0) {
          e.preventDefault()
          e.stopPropagation()
          point_just_deleted_ref.current = true
          setTimeout(() => {
            point_just_deleted_ref.current = false
          }, 350)
          if (on_delete_draw_point)
            on_delete_draw_point(v_idx)
          return
        }

        if (!is_editing_shape && draw_points.length >= 3) {
          e.preventDefault()
          e.stopPropagation()
          if (on_finish_draw)
            on_finish_draw()
        }
      }
    },
    [draw_points.length, get_vertex_at_screen_pos, is_drawing, is_editing_shape, is_mobile, on_delete_draw_point, on_finish_draw]
  )

  let handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, x: number, y: number): boolean => {
      if (!is_drawing)
        return false

      if (dragged_vertex_idx_ref.current !== null) {
        let cur_idx = dragged_vertex_idx_ref.current
        let start_pos = drag_start_pos_ref.current
        if (start_pos) {
          let dist_sq = (x - start_pos.x) ** 2 + (y - start_pos.y) ** 2
          if (dist_sq > 4) {
            has_dragged_ref.current = true
          }
        }

        let new_map_pt = unprojectScreenToLngLat(x, y, deck_ref.current, projection)
        if (new_map_pt && on_move_draw_point) {
          on_move_draw_point(cur_idx, new_map_pt)
        }
        return true
      }

      let is_touch = e.pointerType === 'touch' || is_mobile
      let hov_v = get_vertex_at_screen_pos(x, y, is_touch ? 28 : 14)
      set_hovered_vertex_idx((arg0_prev) => (arg0_prev !== hov_v ? hov_v : arg0_prev))

      if (deck_ref.current) {
        let draw_pt = unprojectScreenToLngLat(x, y, deck_ref.current, projection)
        if (draw_pt && on_set_cursor_lng_lat)
          on_set_cursor_lng_lat(draw_pt)
      }
      return false
    },
    [deck_ref, get_vertex_at_screen_pos, is_drawing, is_mobile, on_move_draw_point, on_set_cursor_lng_lat, projection]
  )

  let handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, x: number, y: number): void => {
      let is_touch = e.pointerType === 'touch' || is_mobile

      if (is_drawing && !is_editing_shape && draw_points.length >= 3 && !has_dragged_ref.current) {
        let origin_hit = get_vertex_at_screen_pos(x, y, is_touch ? 32 : 24) === 0 || dragged_vertex_idx_ref.current === 0
        if (origin_hit) {
          suppress_click_ref.current = true
          setTimeout(() => {
            suppress_click_ref.current = false
          }, 120)
          dragged_vertex_idx_ref.current = null
          drag_start_pos_ref.current = null
          set_dragged_vertex_idx(null)
          if (on_finish_draw)
            on_finish_draw()
          return
        }
      }

      if (dragged_vertex_idx_ref.current !== null) {
        let released_idx = dragged_vertex_idx_ref.current
        let did_drag = has_dragged_ref.current

        if (did_drag) {
          drag_end_time_ref.current = Date.now()
          suppress_click_ref.current = true
          setTimeout(() => {
            suppress_click_ref.current = false
          }, 450)
          last_vertex_tap_ref.current = null
        } else {
          let now = Date.now()
          if (now - drag_end_time_ref.current < 450) {
            dragged_vertex_idx_ref.current = null
            drag_start_pos_ref.current = null
            has_dragged_ref.current = false
            set_dragged_vertex_idx(null)
            return
          }
          let last_tap = last_vertex_tap_ref.current
          if (
            last_tap &&
            last_tap.index === released_idx &&
            now - last_tap.time < 380 &&
            Math.hypot(x - last_tap.x, y - last_tap.y) < 25
          ) {
            last_vertex_tap_ref.current = null
            suppress_click_ref.current = true
            point_just_deleted_ref.current = true
            setTimeout(() => {
              suppress_click_ref.current = false
              point_just_deleted_ref.current = false
            }, 350)
            if (on_delete_draw_point)
              on_delete_draw_point(released_idx)
          } else {
            last_vertex_tap_ref.current = { index: released_idx, time: now, x, y }
          }
        }

        dragged_vertex_idx_ref.current = null
        drag_start_pos_ref.current = null
        set_dragged_vertex_idx(null)
      }
    },
    [draw_points.length, get_vertex_at_screen_pos, is_drawing, is_editing_shape, is_mobile, on_delete_draw_point, on_finish_draw]
  )

  let handleTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>): boolean => {
      if (is_drawing) {
        if (dragged_vertex_idx_ref.current !== null) {
          let touch = e.touches[0]
          if (touch) {
            let rect = e.currentTarget.getBoundingClientRect()
            let x = touch.clientX - rect.left
            let y = touch.clientY - rect.top
            let cur_idx = dragged_vertex_idx_ref.current
            let start_pos = drag_start_pos_ref.current
            if (start_pos) {
              let dist_sq = (x - start_pos.x) ** 2 + (y - start_pos.y) ** 2
              if (dist_sq > 4) {
                has_dragged_ref.current = true
              }
            }

            let new_map_pt = unprojectScreenToLngLat(x, y, deck_ref.current, projection)
            if (new_map_pt && on_move_draw_point) {
              on_move_draw_point(cur_idx, new_map_pt)
            }
          }
        }
        return true
      }
      return false
    },
    [deck_ref, is_drawing, on_move_draw_point, projection]
  )

  let handleTouchEnd = useCallback(
    (e: React.TouchEvent<HTMLDivElement>): void => {
      if (is_drawing && !is_editing_shape && draw_points.length >= 3 && !has_dragged_ref.current) {
        let touch = e.changedTouches ? e.changedTouches[0] : null
        let rect = e.currentTarget.getBoundingClientRect()
        let x = touch ? touch.clientX - rect.left : (drag_start_pos_ref.current?.x ?? 0)
        let y = touch ? touch.clientY - rect.top : (drag_start_pos_ref.current?.y ?? 0)
        let origin_hit = get_vertex_at_screen_pos(x, y, 32) === 0 || dragged_vertex_idx_ref.current === 0
        if (origin_hit) {
          suppress_click_ref.current = true
          setTimeout(() => {
            suppress_click_ref.current = false
          }, 120)
          dragged_vertex_idx_ref.current = null
          drag_start_pos_ref.current = null
          set_dragged_vertex_idx(null)
          if (on_finish_draw)
            on_finish_draw()
          return
        }
      }

      if (is_drawing && dragged_vertex_idx_ref.current !== null) {
        let released_idx = dragged_vertex_idx_ref.current
        let did_drag = has_dragged_ref.current

        if (did_drag) {
          drag_end_time_ref.current = Date.now()
          suppress_click_ref.current = true
          setTimeout(() => {
            suppress_click_ref.current = false
          }, 450)
          last_vertex_tap_ref.current = null
        } else {
          let touch = e.changedTouches ? e.changedTouches[0] : null
          let rect = e.currentTarget.getBoundingClientRect()
          let x = touch ? touch.clientX - rect.left : (drag_start_pos_ref.current?.x ?? 0)
          let y = touch ? touch.clientY - rect.top : (drag_start_pos_ref.current?.y ?? 0)
          let now = Date.now()
          if (now - drag_end_time_ref.current < 450) {
            dragged_vertex_idx_ref.current = null
            drag_start_pos_ref.current = null
            has_dragged_ref.current = false
            set_dragged_vertex_idx(null)
            return
          }
          let last_tap = last_vertex_tap_ref.current
          if (
            last_tap &&
            last_tap.index === released_idx &&
            now - last_tap.time < 380 &&
            Math.hypot(x - last_tap.x, y - last_tap.y) < 25
          ) {
            last_vertex_tap_ref.current = null
            suppress_click_ref.current = true
            point_just_deleted_ref.current = true
            setTimeout(() => {
              suppress_click_ref.current = false
              point_just_deleted_ref.current = false
            }, 350)
            if (on_delete_draw_point)
              on_delete_draw_point(released_idx)
          } else {
            last_vertex_tap_ref.current = { index: released_idx, time: now, x, y }
          }
        }

        dragged_vertex_idx_ref.current = null
        drag_start_pos_ref.current = null
        set_dragged_vertex_idx(null)
      }
    },
    [draw_points.length, get_vertex_at_screen_pos, is_drawing, is_editing_shape, on_delete_draw_point, on_finish_draw]
  )

  let handleMapClick = useCallback(
    (click_x: number, click_y: number, info: any): boolean => {
      if (!is_drawing)
        return false

      if (suppress_click_ref.current || has_dragged_ref.current || Date.now() - drag_end_time_ref.current < 450)
        return true

      let now = Date.now()
      let last_click_time = last_map_click_time_ref.current
      let last_click_pos = last_map_click_pos_ref.current
      last_map_click_time_ref.current = now
      last_map_click_pos_ref.current = { x: click_x, y: click_y }

      if (
        !is_editing_shape &&
        draw_points.length >= 3 &&
        now - last_click_time < 400 &&
        last_click_pos &&
        Math.hypot(click_x - last_click_pos.x, click_y - last_click_pos.y) < 25
      ) {
        if (on_finish_draw)
          on_finish_draw()
        return true
      }

      let clicked_vertex_idx = get_vertex_at_screen_pos(click_x, click_y, is_mobile ? 28 : 14)

      if (draw_points.length >= 3 && !is_editing_shape) {
        let origin_hit_radius = is_mobile ? 32 : 24
        let is_origin_hit = clicked_vertex_idx === 0 || info.object?.idx === 0
        if (!is_origin_hit && deck_ref.current) {
          let start_screen = projectLngLatToScreen(draw_points[0], deck_ref.current, projection)
          if (start_screen) {
            let dist = Math.hypot(click_x - start_screen[0], click_y - start_screen[1])
            if (dist <= origin_hit_radius) {
              is_origin_hit = true
            }
          }
        }
        if (is_origin_hit) {
          if (on_finish_draw)
            on_finish_draw()
          return true
        }
      }

      if (clicked_vertex_idx >= 0)
        return true

      if (is_editing_shape)
        return true

      let map_pt = unprojectScreenToLngLat(click_x, click_y, deck_ref.current, projection)
      if (!map_pt && info.coordinate) {
        if (projection === 'EqualEarth') {
          map_pt = invertEqualEarth(info.coordinate[0], info.coordinate[1])
        } else {
          map_pt = [info.coordinate[0], info.coordinate[1]]
        }
      }
      if (map_pt && on_add_draw_point) {
        on_add_draw_point(map_pt)
      }
      return true
    },
    [deck_ref, draw_points.length, get_vertex_at_screen_pos, is_drawing, is_editing_shape, is_mobile, on_add_draw_point, on_finish_draw, projection]
  )

  //Return statement
  return {
    drag_end_time_ref,
    drag_start_pos_ref,
    dragged_vertex_idx,
    dragged_vertex_idx_ref,
    get_edge_at_screen_pos,
    get_vertex_at_screen_pos,
    handleDoubleClickCapture,
    handleMapClick,
    handlePointerDownCapture,
    handlePointerMove,
    handlePointerUp,
    handleTouchEnd,
    handleTouchMove,
    handleTouchStartCapture,
    has_dragged_ref,
    hovered_vertex_idx,
    point_just_deleted_ref,
    set_dragged_vertex_idx,
    set_hovered_vertex_idx,
    suppress_click_ref,
  }
}
