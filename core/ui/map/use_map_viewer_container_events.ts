import { useCallback } from 'react'

export interface UseMapViewerContainerEventsOptions {
  countries_mode?: boolean
  drawing_system: any
  hover_raf_ref: React.MutableRefObject<number | null>
  hovered_city_pos: { x: number; y: number } | null
  is_drawing: boolean
  is_interacting_ref: React.MutableRefObject<boolean>
  on_hover_country?: (arg0_c: any) => void
  pending_pointer_pos_ref: React.MutableRefObject<{ x: number; y: number } | null>
  pending_touch_pos_ref: React.MutableRefObject<{ x: number; y: number } | null>
  sample_pointer_at: (arg0_x: number, arg1_y: number) => void
  set_cursor_pos: (arg0_pos: { x: number; y: number } | null) => void
  set_hovered_city: (arg0_city: any) => void
  set_hovered_city_pos: (arg0_pos: { x: number; y: number } | null) => void
  set_hovered_historical_feature: (arg0_feat: any) => void
  set_inspect_data: (arg0_data: any) => void
  show_tooltips: boolean
  touch_pick_raf_ref: React.MutableRefObject<number | null>
}

/**
 * Hook to manage pointer and touch event orchestration on the outer map container div.
 *
 * @param {UseMapViewerContainerEventsOptions} arg0_options
 *
 * @returns {object}
 */
export function useMapViewerContainerEvents (arg0_options: UseMapViewerContainerEventsOptions) {
  //Convert from parameters
  let countries_mode = arg0_options.countries_mode
  let drawing_system = arg0_options.drawing_system
  let hover_raf_ref = arg0_options.hover_raf_ref
  let hovered_city_pos = arg0_options.hovered_city_pos
  let is_drawing = arg0_options.is_drawing
  let is_interacting_ref = arg0_options.is_interacting_ref
  let on_hover_country = arg0_options.on_hover_country
  let pending_pointer_pos_ref = arg0_options.pending_pointer_pos_ref
  let pending_touch_pos_ref = arg0_options.pending_touch_pos_ref
  let sample_pointer_at = arg0_options.sample_pointer_at
  let set_cursor_pos = arg0_options.set_cursor_pos
  let set_hovered_city = arg0_options.set_hovered_city
  let set_hovered_city_pos = arg0_options.set_hovered_city_pos
  let set_hovered_historical_feature = arg0_options.set_hovered_historical_feature
  let set_inspect_data = arg0_options.set_inspect_data
  let show_tooltips = arg0_options.show_tooltips
  let touch_pick_raf_ref = arg0_options.touch_pick_raf_ref

  //Function body
  let on_pointer_leave = useCallback(() => {
    if (hover_raf_ref.current !== null) {
      cancelAnimationFrame(hover_raf_ref.current)
      hover_raf_ref.current = null
    }
    pending_pointer_pos_ref.current = null
    set_cursor_pos(null)
    set_hovered_city(null)
    set_hovered_city_pos(null)
    set_hovered_historical_feature(null)
    set_inspect_data(null)
    if (countries_mode && on_hover_country)
      on_hover_country(null)
  }, [countries_mode, hover_raf_ref, on_hover_country, pending_pointer_pos_ref, set_cursor_pos, set_hovered_city, set_hovered_city_pos, set_hovered_historical_feature, set_inspect_data])

  let on_pointer_move = useCallback((arg0_e: React.PointerEvent<HTMLDivElement>) => {
    let e = arg0_e
    let rect = e.currentTarget.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top

    let target_el = e.target as HTMLElement | null
    let is_over_map = target_el ? Boolean(target_el.closest('#deckgl-overlay') || target_el.id === 'dataview-map-container') : true

    if (!is_over_map) {
      if (hover_raf_ref.current !== null) {
        cancelAnimationFrame(hover_raf_ref.current)
        hover_raf_ref.current = null
      }
      pending_pointer_pos_ref.current = null
      set_cursor_pos(null)
      set_hovered_city(null)
      set_hovered_city_pos(null)
      set_hovered_historical_feature(null)
      set_inspect_data(null)
      return
    }

    set_cursor_pos({ x, y })
    if (hovered_city_pos)
      set_hovered_city_pos({ x, y })

    if (drawing_system.handlePointerMove(e, x, y))
      return

    if (e.buttons !== 0 || is_interacting_ref.current || (!show_tooltips && !is_drawing))
      return

    pending_pointer_pos_ref.current = { x, y }
    if (hover_raf_ref.current !== null)
      return

    hover_raf_ref.current = requestAnimationFrame(() => {
      hover_raf_ref.current = null
      if (is_interacting_ref.current)
        return
      let cur_pos = pending_pointer_pos_ref.current
      if (cur_pos)
        sample_pointer_at(cur_pos.x, cur_pos.y)
    })
  }, [drawing_system, hover_raf_ref, hovered_city_pos, is_drawing, is_interacting_ref, pending_pointer_pos_ref, sample_pointer_at, set_cursor_pos, set_hovered_city, set_hovered_city_pos, set_hovered_historical_feature, set_inspect_data, show_tooltips])

  let on_pointer_up = useCallback((arg0_e: React.PointerEvent<HTMLDivElement>) => {
    let e = arg0_e
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // Ignore pointer capture release error
    }
    is_interacting_ref.current = false
    let rect = e.currentTarget.getBoundingClientRect()
    let x = e.clientX - rect.left
    let y = e.clientY - rect.top
    drawing_system.handlePointerUp(e, x, y)
  }, [drawing_system, is_interacting_ref])

  let on_pointer_cancel = useCallback((arg0_e: React.PointerEvent<HTMLDivElement>) => {
    let e = arg0_e
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }
    } catch {
      // Ignore pointer release error
    }
    drawing_system.set_dragged_vertex_idx(null)
    drawing_system.dragged_vertex_idx_ref.current = null
    drawing_system.drag_start_pos_ref.current = null
  }, [drawing_system])

  let on_touch_start = useCallback((arg0_e: React.TouchEvent<HTMLDivElement>) => {
    let e = arg0_e
    if (!show_tooltips || is_drawing)
      return
    let touch = e.touches[0]
    if (!touch)
      return
    let rect = e.currentTarget.getBoundingClientRect()
    let x = touch.clientX - rect.left
    let y = touch.clientY - rect.top
    set_cursor_pos({ x, y })
    if (hovered_city_pos)
      set_hovered_city_pos({ x, y })

    pending_touch_pos_ref.current = { x, y }
    if (touch_pick_raf_ref.current !== null) {
      cancelAnimationFrame(touch_pick_raf_ref.current)
      touch_pick_raf_ref.current = null
    }
    touch_pick_raf_ref.current = requestAnimationFrame(() => {
      touch_pick_raf_ref.current = null
      let cur_pos = pending_touch_pos_ref.current
      if (cur_pos)
        sample_pointer_at(cur_pos.x, cur_pos.y)
    })
  }, [hovered_city_pos, is_drawing, pending_touch_pos_ref, sample_pointer_at, set_cursor_pos, set_hovered_city_pos, show_tooltips, touch_pick_raf_ref])

  let on_touch_move = useCallback((arg0_e: React.TouchEvent<HTMLDivElement>) => {
    let e = arg0_e
    if (drawing_system.handleTouchMove(e))
      return

    if (!show_tooltips)
      return
    let touch = e.touches[0]
    if (!touch)
      return
    let rect = e.currentTarget.getBoundingClientRect()
    let x = touch.clientX - rect.left
    let y = touch.clientY - rect.top
    set_cursor_pos({ x, y })
    if (hovered_city_pos)
      set_hovered_city_pos({ x, y })

    pending_touch_pos_ref.current = { x, y }
    if (touch_pick_raf_ref.current !== null)
      return

    touch_pick_raf_ref.current = requestAnimationFrame(() => {
      touch_pick_raf_ref.current = null
      let cur_pos = pending_touch_pos_ref.current
      if (cur_pos)
        sample_pointer_at(cur_pos.x, cur_pos.y)
    })
  }, [drawing_system, hovered_city_pos, pending_touch_pos_ref, sample_pointer_at, set_cursor_pos, set_hovered_city_pos, show_tooltips, touch_pick_raf_ref])

  let on_touch_end = useCallback((arg0_e: React.TouchEvent<HTMLDivElement>) => {
    let e = arg0_e
    if (touch_pick_raf_ref.current !== null) {
      cancelAnimationFrame(touch_pick_raf_ref.current)
      touch_pick_raf_ref.current = null
    }
    pending_touch_pos_ref.current = null
    drawing_system.handleTouchEnd(e)
  }, [drawing_system, touch_pick_raf_ref, pending_touch_pos_ref])

  //Return statement
  return {
    on_pointer_cancel,
    on_pointer_leave,
    on_pointer_move,
    on_pointer_up,
    on_touch_end,
    on_touch_move,
    on_touch_start,
  }
}
