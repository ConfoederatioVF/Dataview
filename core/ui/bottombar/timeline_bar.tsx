import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { UfDate, TIMELINE_MILESTONES, type UfDateObject } from '@framework/utils/uf_date.ts'
import { Icon } from '@ui/components/icon'
import { Slider } from '@ui/components/slider'
import { HistoricalDatePicker } from './historical_date_picker'
import { useLocalisation } from '@localisation'

export interface TimelineBarProps {
  availableKeyframes?: number[]
  currentYear: number
  isLoading?: boolean
  isMobile?: boolean
  isPlaying: boolean
  maxYear?: number
  minYear?: number
  onChangePlaybackSpeed?: (arg0_speed: number) => void
  onChangeYear: (arg0_year: number) => void
  onClose?: () => void
  onTogglePlay: () => void
  onToggleSnapToKeyframes?: (arg0_snap: boolean) => void
  playbackSpeed?: number
  snapToKeyframes?: boolean
  style?: React.CSSProperties
}

/**
 * TimelineBar component docked at the bottom of Dataview for scrubbing through historical rasters.
 *
 * @param {TimelineBarProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let TimelineBar: React.FC<TimelineBarProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    availableKeyframes: available_keyframes = [],
    currentYear: current_year,
    isLoading: is_loading = false,
    isMobile: is_mobile = false,
    isPlaying: is_playing,
    maxYear: max_year = 2025,
    minYear: min_year = -10000,
    onChangePlaybackSpeed: on_change_playback_speed,
    onChangeYear: on_change_year,
    onClose: on_close,
    onTogglePlay: on_toggle_play,
    onToggleSnapToKeyframes: on_toggle_snap_to_keyframes,
    playbackSpeed: playback_speed = 1,
    snapToKeyframes: snap_to_keyframes = false,
    style,
  } = props

  //Declare local instance variables
  let anim_frame_ref = useRef<number | null>(null)
  let current_year_ref = useRef<number>(current_year)
  let date_obj: { day: number; month: number; year: number }
  let format_string: (template: string, ...args: any[]) => string
  let formatted_date: string
  let handle_jump_year: (arg0_year: number) => void
  let handle_select_exact_date: (arg0_date: UfDateObject) => void
  let handle_slider_change: (arg0_val: number[]) => void
  let handle_step_backward: () => void
  let handle_step_forward: () => void
  let is_collapsed: boolean
  let is_date_picker_open: boolean
  let is_loading_ref = useRef<boolean>(is_loading)
  let is_looping: boolean
  let is_looping_ref = useRef<boolean>(false)
  let is_settings_open: boolean
  let keyframe_positions: { left_pct: number; year: number }[]
  let keyframes_ref = useRef<number[]>(available_keyframes)
  let last_snap_time_ref = useRef<number>(0)
  let last_tick_ref = useRef<number>(performance.now())
  let legend_bottom_clearance: number
  let load_duration_estimate_ref = useRef<number>(1.8)
  let load_start_time_ref = useRef<number>(0)
  let loading_pct: number
  let loading_time_remaining: number
  let loading_visible: boolean
  let localisation: ReturnType<typeof useLocalisation>
  let on_change_year_ref = useRef(on_change_year)
  let on_toggle_play_ref = useRef(on_toggle_play)
  let set_is_collapsed: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_date_picker_open: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_looping: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_settings_open: React.Dispatch<React.SetStateAction<boolean>>
  let set_legend_bottom_clearance: React.Dispatch<React.SetStateAction<number>>
  let set_loading_pct: React.Dispatch<React.SetStateAction<number>>
  let set_loading_time_remaining: React.Dispatch<React.SetStateAction<number>>
  let set_loading_visible: React.Dispatch<React.SetStateAction<boolean>>
  let settings_popover_ref = useRef<HTMLDivElement | null>(null)
  let slider_normalised_val: number
  let snap_ref = useRef<boolean>(snap_to_keyframes)
  let speed_options = [0.5, 1, 2, 5, 10]
  let t: ReturnType<typeof useLocalisation>['t']

  //Function body
  localisation = useLocalisation()
  format_string = localisation.formatString
  t = localisation.t
  ;[is_collapsed, set_is_collapsed] = useState(false)
  ;[is_date_picker_open, set_is_date_picker_open] = useState(false)
  ;[is_looping, set_is_looping] = useState(false)
  ;[is_settings_open, set_is_settings_open] = useState(false)
  ;[legend_bottom_clearance, set_legend_bottom_clearance] = useState(0)
  ;[loading_pct, set_loading_pct] = useState(0)
  ;[loading_time_remaining, set_loading_time_remaining] = useState(1.8)
  ;[loading_visible, set_loading_visible] = useState(false)

  current_year_ref.current = current_year
  is_loading_ref.current = is_loading
  is_looping_ref.current = is_looping
  keyframes_ref.current = available_keyframes
  on_change_year_ref.current = on_change_year
  on_toggle_play_ref.current = on_toggle_play
  snap_ref.current = snap_to_keyframes

  //Dynamic loading progress tracking and estimation
  useEffect(() => {
    let fade_timeout: NodeJS.Timeout | null = null
    let interval: NodeJS.Timeout | null = null

    if (is_loading) {
      set_loading_visible(true)
      load_start_time_ref.current = performance.now()
      set_loading_pct(12)
      set_loading_time_remaining(Math.max(0.2, Math.round(load_duration_estimate_ref.current*10)/10))

      interval = setInterval(() => {
        let elapsed_sec = (performance.now() - load_start_time_ref.current)/1000
        let est_total = Math.max(0.8, load_duration_estimate_ref.current)
        let pct = Math.min(96, Math.round((1 - Math.exp(-elapsed_sec/(est_total*0.7)))*100))
        let rem = Math.max(0.1, Math.round((est_total - elapsed_sec)*10)/10)

        set_loading_pct(Math.max(12, pct))
        set_loading_time_remaining(rem)
      }, 80)
    } else if (load_start_time_ref.current > 0) {
      let actual_sec = (performance.now() - load_start_time_ref.current)/1000
      if (actual_sec > 0.2)
        load_duration_estimate_ref.current = Math.min(6.0, Math.max(0.8, load_duration_estimate_ref.current*0.7 + actual_sec*0.3))

      set_loading_pct(100)
      set_loading_time_remaining(0)

      fade_timeout = setTimeout(() => {
        set_loading_visible(false)
        load_start_time_ref.current = 0
      }, 250)
    }

    return () => {
      if (interval)
        clearInterval(interval)
      if (fade_timeout)
        clearTimeout(fade_timeout)
    }
  }, [is_loading])

  //Close settings pop-out on click outside
  useEffect(() => {
    if (!is_settings_open)
      return

    let handle_click_outside = function (arg0_e: MouseEvent) {
      if (
        settings_popover_ref.current &&
        !settings_popover_ref.current.contains(arg0_e.target as Node)
      ) {
        set_is_settings_open(false)
      }
    }

    document.addEventListener('mousedown', handle_click_outside)
    return () => {
      document.removeEventListener('mousedown', handle_click_outside)
    }
  }, [is_settings_open])

  date_obj = useMemo(() => {
    return UfDate.fromFractionalYear(current_year)
  }, [current_year])

  formatted_date = useMemo(() => {
    return UfDate.formatDate(date_obj)
  }, [date_obj])

  slider_normalised_val = useMemo(() => {
    return Math.round(UfDate.yearToTimelinePosition(current_year)*1000)
  }, [current_year])

  keyframe_positions = useMemo(() => {
    let list: { left_pct: number; year: number }[] = []
    for (let i = 0; i < available_keyframes.length; i++) {
      let yr = available_keyframes[i]
      if (yr >= min_year && yr <= max_year) {
        let pct = UfDate.yearToTimelinePosition(yr)*100
        list.push({ left_pct: pct, year: yr })
      }
    }
    return list
  }, [available_keyframes, min_year, max_year])

  handle_jump_year = useCallback(
    function (arg0_year: number) {
      let yr = Math.max(min_year, Math.min(max_year, arg0_year))
      on_change_year(yr)
    },
    [min_year, max_year, on_change_year]
  )

  handle_select_exact_date = useCallback(
    function (arg0_date: UfDateObject) {
      let frac_year = UfDate.toFractionalYear(arg0_date)
      handle_jump_year(frac_year)
    },
    [handle_jump_year]
  )

  handle_step_backward = useCallback(() => {
    if (available_keyframes.length > 0) {
      let prev_candidates = available_keyframes.filter((arg0_y) => arg0_y < current_year - 0.05)
      if (prev_candidates.length > 0) {
        let prev = prev_candidates[prev_candidates.length - 1]
        handle_jump_year(prev)
        return
      }
    }
    handle_jump_year(current_year - 1)
  }, [available_keyframes, current_year, handle_jump_year])

  handle_step_forward = useCallback(() => {
    if (available_keyframes.length > 0) {
      let next_candidates = available_keyframes.filter((arg0_y) => arg0_y > current_year + 0.05)
      if (next_candidates.length > 0) {
        let next = next_candidates[0]
        handle_jump_year(next)
        return
      }
    }
    handle_jump_year(current_year + 1)
  }, [available_keyframes, current_year, handle_jump_year])

  handle_slider_change = useCallback(
    function (arg0_val: number[]) {
      let norm_val = Math.max(0, Math.min(1000, arg0_val[0]))/1000
      let mapped_year = UfDate.timelinePositionToYear(norm_val)

      if (snap_to_keyframes && available_keyframes.length > 0) {
        let closest = available_keyframes[0]
        let min_dist = Math.abs(mapped_year - closest)
        for (let i = 1; i < available_keyframes.length; i++) {
          let dist = Math.abs(mapped_year - available_keyframes[i])
          if (dist < min_dist) {
            min_dist = dist
            closest = available_keyframes[i]
          }
        }
        on_change_year(closest)
      } else {
        on_change_year(mapped_year)
      }
    },
    [snap_to_keyframes, available_keyframes, on_change_year]
  )

  //Animation playback loop: decoupled from React state closure to eliminate race conditions
  useEffect(() => {
    if (!is_playing) {
      if (anim_frame_ref.current)
        cancelAnimationFrame(anim_frame_ref.current)
      return
    }

    last_tick_ref.current = performance.now()
    last_snap_time_ref.current = performance.now()

    let tick = function (arg0_now: number) {
      if (is_loading_ref.current) {
        last_tick_ref.current = arg0_now
        last_snap_time_ref.current = arg0_now
        anim_frame_ref.current = requestAnimationFrame(tick)
        return
      }

      let delta_ms = arg0_now - last_tick_ref.current
      last_tick_ref.current = arg0_now

      if (snap_ref.current && keyframes_ref.current.length > 0) {
        let snap_interval = Math.max(100, 400/playback_speed)
        if (arg0_now - last_snap_time_ref.current >= snap_interval) {
          last_snap_time_ref.current = arg0_now
          let curr = current_year_ref.current
          let kfs = keyframes_ref.current
          let next_candidates = kfs.filter((arg0_y) => arg0_y > curr + 0.05)
          if (next_candidates.length > 0) {
            on_change_year_ref.current(next_candidates[0])
          } else if (is_looping_ref.current) {
            on_change_year_ref.current(kfs[0])
          } else {
            on_change_year_ref.current(kfs[kfs.length - 1])
            on_toggle_play_ref.current()
            return
          }
        }
      } else {
        let delta_pos = (delta_ms/1000)*(1/25)*playback_speed
        let curr_pos = UfDate.yearToTimelinePosition(current_year_ref.current)
        let next_pos = curr_pos + delta_pos
        if (next_pos >= 1) {
          if (is_looping_ref.current) {
            next_pos = 0
            let next_year = UfDate.timelinePositionToYear(next_pos)
            on_change_year_ref.current(next_year)
          } else {
            let end_year = UfDate.timelinePositionToYear(1)
            on_change_year_ref.current(end_year)
            on_toggle_play_ref.current()
            return
          }
        } else {
          let next_year = UfDate.timelinePositionToYear(next_pos)
          on_change_year_ref.current(next_year)
        }
      }

      anim_frame_ref.current = requestAnimationFrame(tick)
    }

    anim_frame_ref.current = requestAnimationFrame(tick)

    return () => {
      if (anim_frame_ref.current)
        cancelAnimationFrame(anim_frame_ref.current)
    }
  }, [is_playing, playback_speed])

  //Track bottom clearance above legend card when docked at bottom
  useEffect(() => {
    let updateLegendClearance = () => {
      //Declare local instance variables
      let legend_el: HTMLElement | null
      let next_clearance: number
      let rect: DOMRect
      let vp_height: number

      legend_el = document.getElementById('dataview-legend-card-container')
      if (is_mobile && legend_el) {
        rect = legend_el.getBoundingClientRect()
        vp_height = (typeof window !== 'undefined' && window.visualViewport)
          ? window.visualViewport.height
          : (typeof window !== 'undefined' ? window.innerHeight : 800)
        if (rect.height > 0 && rect.top > vp_height / 2) {
          next_clearance = Math.max(0, vp_height - rect.top) + 8
          set_legend_bottom_clearance((arg0_prev) => (Math.abs(arg0_prev - next_clearance) > 1 ? next_clearance : arg0_prev))
          return
        }
      }
      set_legend_bottom_clearance((arg0_prev) => (arg0_prev === 0 ? 0 : 0))
    }

    updateLegendClearance()
    window.addEventListener('resize', updateLegendClearance)
    let ro = new ResizeObserver(updateLegendClearance)
    let mo = new MutationObserver(() => {
      updateLegendClearance()
      let l_el = document.getElementById('dataview-legend-card-container')
      if (l_el)
        ro.observe(l_el)
    })
    let legend_el = document.getElementById('dataview-legend-card-container')
    if (legend_el)
      ro.observe(legend_el)
    if (typeof document !== 'undefined' && document.body)
      mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      ro.disconnect()
      window.removeEventListener('resize', updateLegendClearance)
    }
  }, [])

  //Return statement
  return (
    <div
      id="dataview-timelinebar-container"
      style={is_mobile ? {
        left: '8px',
        right: '8px',
        width: 'calc(100vw - 16px)',
        ...style,
        bottom: `${Math.max(12, legend_bottom_clearance)}px`,
      } : {
        left: 0,
        marginLeft: 'auto',
        marginRight: 'auto',
        right: 0,
        width: 'min(1100px, calc(100vw - 64px))',
        ...style,
        bottom: `${Math.max(12, legend_bottom_clearance)}px`,
      }}
      className={`${is_mobile ? 'fixed' : 'absolute'} z-30 pointer-events-auto select-none font-sans`}
    >
      <div className="bg-card/95 backdrop-blur-md border border-border shadow-2xl p-2.5 transition-all">
        {/* Top Header Row: Date Badge, Controls, & Settings */}
        {is_mobile ? (
          <div className="flex flex-col gap-2 pb-2 border-b border-border/60">
            {/* Row 1: Play/Timelapse controls on the left, Chevron & Close on the right */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-1.5 min-w-0">
                {/* Play/Pause Button */}
                <button
                  type="button"
                  onClick={on_toggle_play}
                  className="h-7 w-7 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer shrink-0"
                  title={is_playing ? t.timeline.pause : t.timeline.play}
                >
                  <Icon name={is_playing ? 'pause' : 'play_arrow'} />
                </button>

                {/* Step Backward */}
                <button
                  type="button"
                  onClick={handle_step_backward}
                  className="h-7 w-7 flex items-center justify-center bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors cursor-pointer shrink-0"
                  title={t.timeline.stepBackward}
                >
                  <Icon name="skip_previous" />
                </button>

                {/* Step Forward */}
                <button
                  type="button"
                  onClick={handle_step_forward}
                  className="h-7 w-7 flex items-center justify-center bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors cursor-pointer shrink-0"
                  title={t.timeline.stepForward}
                >
                  <Icon name="skip_next" />
                </button>

                {/* Settings Pop-out Toggle */}
                <div className="relative shrink-0" ref={settings_popover_ref}>
                  <button
                    type="button"
                    onClick={() => set_is_settings_open((arg0_prev) => !arg0_prev)}
                    className={`h-7 w-7 flex items-center justify-center border transition-colors cursor-pointer ${
                      is_settings_open
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-muted/60 hover:bg-muted text-foreground border border-border'
                    }`}
                    title={t.timeline.settings}
                  >
                    <Icon name="settings" className="text-sm" />
                  </button>

                  {/* Settings Pop-out Dialog */}
                  {is_settings_open && (
                    <div className="absolute bottom-9 left-0 z-50 w-72 bg-card/95 backdrop-blur-md border border-border p-3 shadow-2xl space-y-3">
                      <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                        <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                          <Icon name="settings" className="text-sm text-primary" />
                          {t.timeline.settings}
                        </span>
                        <button
                          type="button"
                          onClick={() => set_is_settings_open(false)}
                          className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
                        >
                          <Icon name="close" className="text-xs" />
                        </button>
                      </div>

                      {/* Playback Speed */}
                      <div>
                        <label className="text-[11px] text-muted-foreground block mb-1">{t.timeline.speed}</label>
                        <div className="grid grid-cols-5 gap-1 border border-border bg-muted/30 p-0.5 text-xs font-mono">
                          {speed_options.map((arg0_spd) => (
                            <button
                              key={arg0_spd}
                              type="button"
                              onClick={() => on_change_playback_speed && on_change_playback_speed(arg0_spd)}
                              className={`py-1 text-center transition-colors cursor-pointer ${
                                playback_speed === arg0_spd
                                  ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                              }`}
                            >
                              {arg0_spd}×
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Keyframe Snapping */}
                      <div className="pt-2 border-t border-border/40">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium text-foreground">{t.timeline.snap}</div>
                            <div className="text-[10px] text-muted-foreground">{t.timeline.snapDescription}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => on_toggle_snap_to_keyframes && on_toggle_snap_to_keyframes(!snap_to_keyframes)}
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                              snap_to_keyframes ? 'bg-primary justify-end' : 'bg-muted justify-start border border-border'
                            }`}
                          >
                            <div className="w-4 h-4 rounded-full bg-card shadow-xs transition-all" />
                          </button>
                        </div>
                      </div>

                      {/* Loop Playback */}
                      <div className="pt-2 border-t border-border/40">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-medium text-foreground">{t.timeline.loop}</div>
                            <div className="text-[10px] text-muted-foreground">{t.timeline.loopDescription}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => set_is_looping((arg0_prev) => !arg0_prev)}
                            className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                              is_looping ? 'bg-primary justify-end' : 'bg-muted justify-start border border-border'
                            }`}
                          >
                            <div className="w-4 h-4 rounded-full bg-card shadow-xs transition-all" />
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Loading Indicator */}
                {loading_visible && (
                  <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/15 border border-primary/40 text-primary text-[10px] font-mono shadow-xs truncate">
                    <Icon name="sync" className={`text-xs ${is_loading ? 'animate-spin' : ''}`} />
                    <span>{loading_pct >= 100 ? t.timeline.rasterReady : `${loading_pct}%`}</span>
                  </div>
                )}
              </div>

              {/* Right Controls: Chevron and Close */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => set_is_collapsed((arg0_prev) => !arg0_prev)}
                  className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                  title={is_collapsed ? t.timeline.expandScrubber : t.timeline.collapseScrubber}
                >
                  <Icon name={is_collapsed ? 'expand_less' : 'expand_more'} />
                </button>
                {on_close && (
                  <button
                    type="button"
                    onClick={on_close}
                    className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation"
                    title={t.timeline.closeTimeline}
                    aria-label={t.timeline.closeTimeline}
                  >
                    <Icon name="close" size="1.1rem" />
                  </button>
                )}
              </div>
            </div>

            {/* Row 2: Date Picker full-width underneath */}
            <div className="relative flex items-center justify-center w-full">
              <button
                type="button"
                onClick={() => set_is_date_picker_open((arg0_prev) => !arg0_prev)}
                className={`w-full flex items-center justify-center gap-2 bg-background/90 hover:bg-background border px-4 py-1 shadow-inner pointer-events-auto cursor-pointer transition-colors group ${
                  is_date_picker_open ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/50'
                }`}
                title={t.timeline.selectExactDate}
              >
                <Icon name="event" className="text-primary text-sm group-hover:scale-105 transition-transform" />
                <span className="text-sm font-bold tracking-tight text-foreground font-mono">
                  {formatted_date}
                </span>
                <Icon
                  name={is_date_picker_open ? 'expand_less' : 'expand_more'}
                  className="text-muted-foreground text-xs group-hover:text-primary transition-colors ml-0.5"
                />
              </button>

              <HistoricalDatePicker
                currentYear={current_year}
                isOpen={is_date_picker_open}
                maxYear={max_year}
                minYear={min_year}
                onClose={() => set_is_date_picker_open(false)}
                onSelectDate={handle_select_exact_date}
              />
            </div>
          </div>
        ) : (
          <div className="relative flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 pb-2 border-b border-border/60 min-h-[36px]">
            <div className="flex items-center gap-2">
              {/* Play/Pause Button */}
              <button
                type="button"
                onClick={on_toggle_play}
                className="h-7 w-7 flex items-center justify-center bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm cursor-pointer"
                title={is_playing ? t.timeline.pause : t.timeline.play}
              >
                <Icon name={is_playing ? 'pause' : 'play_arrow'} />
              </button>

              {/* Step Backward */}
              <button
                type="button"
                onClick={handle_step_backward}
                className="h-7 w-7 flex items-center justify-center bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors cursor-pointer"
                title={t.timeline.stepBackward}
              >
                <Icon name="skip_previous" />
              </button>

              {/* Step Forward */}
              <button
                type="button"
                onClick={handle_step_forward}
                className="h-7 w-7 flex items-center justify-center bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors cursor-pointer"
                title={t.timeline.stepForward}
              >
                <Icon name="skip_next" />
              </button>

              {/* Settings Pop-out Toggle */}
              <div className="relative" ref={settings_popover_ref}>
                <button
                  type="button"
                  onClick={() => set_is_settings_open((arg0_prev) => !arg0_prev)}
                  className={`h-7 w-7 flex items-center justify-center border transition-colors cursor-pointer ${
                    is_settings_open
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/60 hover:bg-muted text-foreground border border-border'
                  }`}
                  title={t.timeline.settings}
                >
                  <Icon name="settings" className="text-sm" />
                </button>

                {/* Settings Pop-out Dialog */}
                {is_settings_open && (
                  <div className="absolute bottom-9 left-0 z-50 w-72 bg-card/95 backdrop-blur-md border border-border p-3 shadow-2xl space-y-3">
                    <div className="flex items-center justify-between border-b border-border/60 pb-1.5">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Icon name="settings" className="text-sm text-primary" />
                        {t.timeline.settings}
                      </span>
                      <button
                        type="button"
                        onClick={() => set_is_settings_open(false)}
                        className="text-muted-foreground hover:text-foreground text-xs cursor-pointer"
                      >
                        <Icon name="close" className="text-xs" />
                      </button>
                    </div>

                    {/* Playback Speed */}
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-1">{t.timeline.speed}</label>
                      <div className="grid grid-cols-5 gap-1 border border-border bg-muted/30 p-0.5 text-xs font-mono">
                        {speed_options.map((arg0_spd) => (
                          <button
                            key={arg0_spd}
                            type="button"
                            onClick={() => on_change_playback_speed && on_change_playback_speed(arg0_spd)}
                            className={`py-1 text-center transition-colors cursor-pointer ${
                              playback_speed === arg0_spd
                                ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                            }`}
                          >
                            {arg0_spd}×
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Keyframe Snapping */}
                    <div className="pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-medium text-foreground">{t.timeline.snap}</div>
                          <div className="text-[10px] text-muted-foreground">{t.timeline.snapDescription}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => on_toggle_snap_to_keyframes && on_toggle_snap_to_keyframes(!snap_to_keyframes)}
                          className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                            snap_to_keyframes ? 'bg-primary justify-end' : 'bg-muted justify-start border border-border'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-card shadow-xs transition-all" />
                        </button>
                      </div>
                    </div>

                    {/* Loop Playback */}
                    <div className="pt-2 border-t border-border/40">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-medium text-foreground">{t.timeline.loop}</div>
                          <div className="text-[10px] text-muted-foreground">{t.timeline.loopDescription}</div>
                        </div>
                        <button
                          type="button"
                          onClick={() => set_is_looping((arg0_prev) => !arg0_prev)}
                          className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                            is_looping ? 'bg-primary justify-end' : 'bg-muted justify-start border border-border'
                          }`}
                        >
                          <div className="w-4 h-4 rounded-full bg-card shadow-xs transition-all" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Loading Indicator with Percentage and Estimated Remaining Time */}
              {loading_visible && (
                <div className="flex items-center gap-2 px-2.5 py-0.5 bg-primary/15 border border-primary/40 text-primary text-[11px] font-mono shadow-xs transition-opacity duration-200">
                  <Icon name="sync" className={`text-xs ${is_loading ? 'animate-spin' : ''}`} />
                  <span>
                    {loading_pct >= 100 ? t.timeline.rasterReady : format_string(t.timeline.loadingRaster, loading_pct, loading_time_remaining.toFixed(1))}
                  </span>
                  <div className="w-14 h-1.5 bg-primary/20 border border-primary/30 overflow-hidden shrink-0">
                    <div
                      className="h-full bg-primary transition-all duration-100 ease-out"
                      style={{ width: `${loading_pct}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Centre Date Badge with Interactive Historical Date Picker */}
            <div className="sm:absolute sm:left-1/2 sm:-translate-x-1/2 flex items-center justify-center">
              <button
                type="button"
                onClick={() => set_is_date_picker_open((arg0_prev) => !arg0_prev)}
                className={`flex items-center gap-2 bg-background/90 hover:bg-background border px-4 py-1 shadow-inner pointer-events-auto cursor-pointer transition-colors group ${
                  is_date_picker_open ? 'border-primary ring-1 ring-primary/40' : 'border-border hover:border-primary/50'
                }`}
                title={t.timeline.selectExactDate}
              >
                <Icon name="event" className="text-primary text-sm group-hover:scale-105 transition-transform" />
                <span className="text-sm font-bold tracking-tight text-foreground font-mono">
                  {formatted_date}
                </span>
                <Icon
                  name={is_date_picker_open ? 'expand_less' : 'expand_more'}
                  className="text-muted-foreground text-xs group-hover:text-primary transition-colors ml-0.5"
                />
              </button>

              <HistoricalDatePicker
                currentYear={current_year}
                isOpen={is_date_picker_open}
                maxYear={max_year}
                minYear={min_year}
                onClose={() => set_is_date_picker_open(false)}
                onSelectDate={handle_select_exact_date}
              />
            </div>

            {/* Right Controls: Collapse Toggle */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => set_is_collapsed((arg0_prev) => !arg0_prev)}
                className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer"
                title={is_collapsed ? t.timeline.expandScrubber : t.timeline.collapseScrubber}
              >
                <Icon name={is_collapsed ? 'expand_less' : 'expand_more'} />
              </button>
              {is_mobile && on_close && (
                <button
                  type="button"
                  onClick={on_close}
                  className="h-7 w-7 flex items-center justify-center text-muted-foreground hover:text-foreground cursor-pointer touch-manipulation"
                  title={t.timeline.closeTimeline}
                  aria-label={t.timeline.closeTimeline}
                >
                  <Icon name="close" size="1.1rem" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Scrubber Track and Keyframe Ticks */}
        {!is_collapsed && (
          <div className="pt-2 px-1">
            <div className="relative flex items-center h-6">
              {/* Keyframe tick marks */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-2 pointer-events-none z-0">
                {keyframe_positions.map((arg0_kf) => (
                  <div
                    key={arg0_kf.year}
                    style={{ left: `${arg0_kf.left_pct}%` }}
                    className="absolute top-0 bottom-0 w-[1px] bg-primary/40 hover:bg-primary z-0"
                    title={`Raster Keyframe: ${UfDate.formatYear(arg0_kf.year)}`}
                  />
                ))}
              </div>

              {/* Logarithmic Range Slider */}
              <Slider
                min={0}
                max={1000}
                step={1}
                value={[slider_normalised_val]}
                onValueChange={handle_slider_change}
                className="w-full relative z-10 cursor-pointer"
              />
            </div>

            {/* Labels under slider track: positioned according to milestone percentages */}
            <div className="relative h-4 mt-1 text-[10px] text-muted-foreground font-mono">
              {TIMELINE_MILESTONES.map((arg0_m, arg0_idx) => {
                let align_class = arg0_idx === 0
                  ? 'left-0 text-left'
                  : arg0_idx === TIMELINE_MILESTONES.length - 1
                  ? 'right-0 text-right'
                  : '-translate-x-1/2 text-center'
                return (
                  <span
                    key={arg0_m.label}
                    style={
                      arg0_idx > 0 && arg0_idx < TIMELINE_MILESTONES.length - 1
                        ? { left: `${arg0_m.pos*100}%` }
                        : undefined
                    }
                    className={`absolute top-0 cursor-pointer hover:text-foreground transition-colors ${align_class} ${
                      arg0_idx > 0 && arg0_idx < TIMELINE_MILESTONES.length - 1 ? 'hidden sm:inline-block' : ''
                    }`}
                    onClick={() => handle_jump_year(arg0_m.year)}
                    title={format_string(t.timeline.jumpToMilestone, arg0_m.label)}
                  >
                    {arg0_m.label}
                  </span>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default TimelineBar
