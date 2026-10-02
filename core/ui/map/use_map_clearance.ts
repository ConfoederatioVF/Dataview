/**
 * Clearance and bounding rect calculation hook for MapViewer overlays and HUD elements.
 */

import { useState, useEffect } from 'react'
import { UI_LAYOUT } from '@framework/utils/ui_layout.ts'
import type { MapModeItem } from '@framework/geopng/types.ts'

export interface MapClearanceOptions {
  analyticsOpen?: boolean
  flyoutOpen?: boolean
  mapModes?: MapModeItem[]
  uiVisible?: boolean
}

export interface MapClearanceResult {
  colourbarClearance: number
  effectiveMapmodesBottom: number
  mapmodesBounds: { height: number; left: number; right: number; top: number; width: number } | null
  mapmodesClearance: number
  mapmodesHeight: number
  mapmodesOverlapsTimeline: boolean
  mapmodesTakenRight: number
  mapmodesWidth: number
  timelineBounds: { left: number; right: number; top: number } | null
  timelineClearance: number
  topRightTaken: number
  topbarClearance: number
}

/**
 * Monitors DOM bounding boxes to compute clearances for HUD overlays around the timeline and mapmodes tray.
 *
 * @param {MapClearanceOptions} [arg0_options]
 *
 * @returns {MapClearanceResult}
 */
export function useMapClearance (arg0_options?: MapClearanceOptions): MapClearanceResult {
  //Convert from parameters
  let options = (arg0_options) ? arg0_options : {}
  let analytics_open = options.analyticsOpen
  let flyout_open = options.flyoutOpen
  let map_modes = options.mapModes
  let ui_visible = options.uiVisible

  //Declare local instance variables
  let [colourbar_clearance, set_colourbar_clearance] = useState<number>(0)
  let [effective_mapmodes_bottom, set_effective_mapmodes_bottom] = useState<number>(UI_LAYOUT.margin)
  let [mapmodes_bounds, set_mapmodes_bounds] = useState<{ height: number; left: number; right: number; top: number; width: number } | null>(null)
  let [mapmodes_clearance, set_mapmodes_clearance] = useState<number>(UI_LAYOUT.margin)
  let [mapmodes_height, set_mapmodes_height] = useState<number>(0)
  let [mapmodes_overlaps_timeline, set_mapmodes_overlaps_timeline] = useState<boolean>(false)
  let [mapmodes_taken_right, set_mapmodes_taken_right] = useState<number>(0)
  let [mapmodes_width, set_mapmodes_width] = useState<number>(340)
  let [timeline_bounds, set_timeline_bounds] = useState<{ left: number; right: number; top: number } | null>(null)
  let [timeline_clearance, set_timeline_clearance] = useState<number>(128)
  let [top_right_taken, set_top_right_taken] = useState<number>(0)
  let [topbar_clearance, set_topbar_clearance] = useState<number>(112)

  //Function body
  useEffect(() => {
    let updateClearance = () => {
      //Declare local instance variables
      let calculated_mapmodes_clearance: number
      let current_top_right = 0
      let from_bottom: number
      let h: number
      let is_overlapping: boolean
      let l: number
      let legend_el: HTMLElement | null
      let mapmodes_el: HTMLElement | null
      let next_clearance: number
      let next_colourbar_clearance = 0
      let next_mapmodes_bottom: number
      let next_taken: number
      let next_topbar_clearance = 112
      let r: number
      let rect: DOMRect
      let t: number
      let timeline_el: HTMLElement | null
      let timeline_r = 0
      let toolbar_el: HTMLElement | null
      let vp_height: number
      let w: number

      vp_height = (typeof window !== 'undefined' && window.visualViewport)
        ? window.visualViewport.height
        : (typeof window !== 'undefined' ? window.innerHeight : 800)

      //1. Timeline bounds and clearance
      timeline_el = document.getElementById('dataview-timelinebar-container')
      if (timeline_el) {
        rect = timeline_el.getBoundingClientRect()
        from_bottom = vp_height - rect.top
        next_clearance = Math.max(Math.round(from_bottom), 0) + UI_LAYOUT.margin
        timeline_r = Math.round(rect.right)
        set_timeline_clearance((arg0_prev) => (Math.abs(arg0_prev - next_clearance) > 1 ? next_clearance : arg0_prev))
        set_timeline_bounds((arg0_prev) => {
          let rect_l = Math.round(rect.left)
          let rect_r = Math.round(rect.right)
          let rect_t = Math.round(rect.top)
          if (arg0_prev && arg0_prev.left === rect_l && arg0_prev.right === rect_r && arg0_prev.top === rect_t)
            return arg0_prev
          return { left: rect_l, right: rect_r, top: rect_t }
        })
      } else {
        next_clearance = UI_LAYOUT.margin
        set_timeline_clearance((arg0_prev) => (arg0_prev === UI_LAYOUT.margin ? arg0_prev : UI_LAYOUT.margin))
        set_timeline_bounds((arg0_prev) => (arg0_prev === null ? null : null))
      }

      let legend_overlaps = false
      let legend_r = 0

      //2. Colourbar bottom clearance and topbar clearance
      legend_el = document.getElementById('dataview-legend-card-container')
      if (legend_el) {
        rect = legend_el.getBoundingClientRect()
        if (rect.height > 0) {
          if (rect.top > vp_height / 2) {
            next_colourbar_clearance = Math.max(0, vp_height - Math.round(rect.top)) + UI_LAYOUT.gap
            legend_r = Math.round(rect.right)
          } else {
            next_topbar_clearance = Math.max(Math.round(rect.bottom) + UI_LAYOUT.gap, 112)
          }
        }
      }
      set_colourbar_clearance((arg0_prev) => (Math.abs(arg0_prev - next_colourbar_clearance) > 1 ? next_colourbar_clearance : arg0_prev))
      set_topbar_clearance((arg0_prev) => (Math.abs(arg0_prev - next_topbar_clearance) > 1 ? next_topbar_clearance : arg0_prev))

      //3. Mapmodes tray bounds and clearance
      mapmodes_el = document.getElementById('dataview-mapmodes-tray')
      if (mapmodes_el) {
        rect = mapmodes_el.getBoundingClientRect()
        if (rect.width > 0 && rect.left < window.innerWidth) {
          h = Math.round(rect.height)
          l = Math.round(rect.left)
          r = Math.round(rect.right)
          t = Math.round(rect.top)
          w = Math.round(rect.width)

          next_taken = Math.max(window.innerWidth - l, 0)
          set_mapmodes_taken_right((arg0_prev) => (arg0_prev === next_taken ? arg0_prev : next_taken))
          set_mapmodes_bounds((arg0_prev) => {
            if (arg0_prev && arg0_prev.height === h && arg0_prev.left === l && arg0_prev.right === r && arg0_prev.top === t && arg0_prev.width === w)
              return arg0_prev
            return { height: h, left: l, right: r, top: t, width: w }
          })
          set_mapmodes_height((arg0_prev) => (arg0_prev === h ? arg0_prev : h))
          set_mapmodes_width((arg0_prev) => (arg0_prev === w ? arg0_prev : w))

          is_overlapping = Boolean(timeline_r > (window.innerWidth - w - UI_LAYOUT.margin - UI_LAYOUT.gap))
          legend_overlaps = Boolean(legend_r > (window.innerWidth - w - UI_LAYOUT.margin - UI_LAYOUT.gap))
          set_mapmodes_overlaps_timeline((arg0_prev) => (arg0_prev === is_overlapping ? arg0_prev : is_overlapping))

          next_mapmodes_bottom = is_overlapping
            ? Math.max(next_clearance, next_colourbar_clearance)
            : (legend_overlaps ? next_colourbar_clearance : UI_LAYOUT.margin)
          set_effective_mapmodes_bottom((arg0_prev) => (Math.abs(arg0_prev - next_mapmodes_bottom) > 1 ? next_mapmodes_bottom : arg0_prev))

          calculated_mapmodes_clearance = next_mapmodes_bottom + h + UI_LAYOUT.gap
          set_mapmodes_clearance((arg0_prev) => (Math.abs(arg0_prev - calculated_mapmodes_clearance) > 1 ? calculated_mapmodes_clearance : arg0_prev))
        } else {
          set_effective_mapmodes_bottom((arg0_prev) => (arg0_prev === UI_LAYOUT.margin ? arg0_prev : UI_LAYOUT.margin))
          set_mapmodes_bounds((arg0_prev) => (arg0_prev === null ? null : null))
          set_mapmodes_clearance((arg0_prev) => (arg0_prev === next_clearance ? arg0_prev : next_clearance))
          set_mapmodes_height((arg0_prev) => (arg0_prev === 0 ? 0 : 0))
          set_mapmodes_overlaps_timeline((arg0_prev) => (!arg0_prev ? arg0_prev : false))
          set_mapmodes_taken_right((arg0_prev) => (arg0_prev === 0 ? 0 : 0))
        }
      } else {
        set_effective_mapmodes_bottom((arg0_prev) => (arg0_prev === UI_LAYOUT.margin ? arg0_prev : UI_LAYOUT.margin))
        set_mapmodes_bounds((arg0_prev) => (arg0_prev === null ? null : null))
        set_mapmodes_clearance((arg0_prev) => (arg0_prev === next_clearance ? arg0_prev : next_clearance))
        set_mapmodes_height((arg0_prev) => (arg0_prev === 0 ? 0 : 0))
        set_mapmodes_overlaps_timeline((arg0_prev) => (!arg0_prev ? arg0_prev : false))
        set_mapmodes_taken_right((arg0_prev) => (arg0_prev === 0 ? 0 : 0))
      }

      //4. Top-right toolbar (permanent HUD buttons)
      toolbar_el = document.getElementById('dataview-top-right-toolbar')
      if (toolbar_el) {
        rect = toolbar_el.getBoundingClientRect()
        if (rect.width > 0 && rect.left < window.innerWidth)
          current_top_right = Math.max(current_top_right, window.innerWidth - Math.round(rect.left))
      }
      if (ui_visible && current_top_right === 0)
        current_top_right = 44
      set_top_right_taken((arg0_prev) => (arg0_prev === current_top_right ? arg0_prev : current_top_right))
    }

    updateClearance()
    window.addEventListener('resize', updateClearance)
    if (typeof window !== 'undefined' && window.visualViewport)
      window.visualViewport.addEventListener('resize', updateClearance)

    let ro = new ResizeObserver(updateClearance)
    let mo = new MutationObserver(() => {
      updateClearance()
      let l_el = document.getElementById('dataview-legend-card-container')
      let m_el = document.getElementById('dataview-mapmodes-tray')
      let t_el = document.getElementById('dataview-timelinebar-container')
      let tb_el = document.getElementById('dataview-top-right-toolbar')
      if (l_el)
        ro.observe(l_el)
      if (m_el)
        ro.observe(m_el)
      if (t_el)
        ro.observe(t_el)
      if (tb_el)
        ro.observe(tb_el)
    })

    let legend_el = document.getElementById('dataview-legend-card-container')
    let mapmodes_el = document.getElementById('dataview-mapmodes-tray')
    let timeline_el = document.getElementById('dataview-timelinebar-container')
    let toolbar_el = document.getElementById('dataview-top-right-toolbar')
    if (legend_el)
      ro.observe(legend_el)
    if (mapmodes_el)
      ro.observe(mapmodes_el)
    if (timeline_el)
      ro.observe(timeline_el)
    if (toolbar_el)
      ro.observe(toolbar_el)

    if (typeof document !== 'undefined' && document.body)
      mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      ro.disconnect()
      window.removeEventListener('resize', updateClearance)
      if (typeof window !== 'undefined' && window.visualViewport)
        window.visualViewport.removeEventListener('resize', updateClearance)
    }
  }, [flyout_open, analytics_open, ui_visible, map_modes])

  //Return statement
  return {
    colourbarClearance: colourbar_clearance,
    effectiveMapmodesBottom: effective_mapmodes_bottom,
    mapmodesBounds: mapmodes_bounds,
    mapmodesClearance: mapmodes_clearance,
    mapmodesHeight: mapmodes_height,
    mapmodesOverlapsTimeline: mapmodes_overlaps_timeline,
    mapmodesTakenRight: mapmodes_taken_right,
    mapmodesWidth: mapmodes_width,
    timelineBounds: timeline_bounds,
    timelineClearance: timeline_clearance,
    topRightTaken: top_right_taken,
    topbarClearance: topbar_clearance,
  }
}

