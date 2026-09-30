import React, { useState, useEffect, useRef, useMemo } from 'react'
import { UfDate, type UfDateObject } from '@framework/utils/uf_date.ts'
import { Icon } from '@ui/components/icon'
import { useLandmarkPresets, LandmarkPreset } from '@common/timeline/landmarks'
import { useLocalisation } from '@localisation'
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@ui/components/tooltip'

export interface HistoricalDatePickerProps {
  currentYear: number
  isOpen: boolean
  maxYear?: number
  minYear?: number
  onClose: () => void
  onSelectDate: (arg0_date: UfDateObject) => void
}

/**
 * Historical date picker popover anchored above the TimelineBar date badge.
 * Provides interactive date selection down to the day across AD and BC.
 *
 * @param {HistoricalDatePickerProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let HistoricalDatePicker: React.FC<HistoricalDatePickerProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let current_year = props.currentYear
  let is_open = props.isOpen
  let max_year = props.maxYear !== undefined ? props.maxYear : 2026
  let min_year = props.minYear !== undefined ? props.minYear : -10000
  let on_close = props.onClose
  let on_select_date = props.onSelectDate

  //Declare local instance variables
  let days_array: number[]
  let days_in_current_month: number
  let effective_year: number
  let format: ReturnType<typeof useLocalisation>['format']
  let handle_apply: () => void
  let handle_day_select: (arg0_d: number) => void
  let handle_era_toggle: (arg0_era: 'AD' | 'BC') => void
  let handle_month_select: (arg0_m: number) => void
  let handle_preset_select: (arg0_preset: LandmarkPreset) => void
  let handle_year_change: (arg0_val: string) => void
  let handle_year_step: (arg0_delta: number) => void
  let is_bookmarks_expanded: boolean
  let landmark_presets: LandmarkPreset[]
  let localisation: ReturnType<typeof useLocalisation>
  let month_short_names: string[]
  let parsed_date: UfDateObject
  let popover_ref = useRef<HTMLDivElement | null>(null)
  let preview_date_str: string
  let selected_day: number
  let selected_era: 'AD' | 'BC'
  let selected_month: number
  let set_is_bookmarks_expanded: React.Dispatch<React.SetStateAction<boolean>>
  let set_selected_day: React.Dispatch<React.SetStateAction<number>>
  let set_selected_era: React.Dispatch<React.SetStateAction<'AD' | 'BC'>>
  let set_selected_month: React.Dispatch<React.SetStateAction<number>>
  let set_year_text: React.Dispatch<React.SetStateAction<string>>
  let t: ReturnType<typeof useLocalisation>['t']
  let year_num: number
  let year_text: string

  //Function body
  landmark_presets = useLandmarkPresets()
  localisation = useLocalisation()
  format = localisation.format
  t = localisation.t
  month_short_names = t.datePicker.monthsShort || [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]

  parsed_date = useMemo(() => {
    return UfDate.fromFractionalYear(current_year)
  }, [current_year])

  ;[is_bookmarks_expanded, set_is_bookmarks_expanded] = useState<boolean>(false)
  ;[selected_day, set_selected_day] = useState<number>(parsed_date.day)
  ;[selected_month, set_selected_month] = useState<number>(parsed_date.month)
  ;[selected_era, set_selected_era] = useState<'AD' | 'BC'>(parsed_date.year < 0 ? 'BC' : 'AD')
  ;[year_text, set_year_text] = useState<string>(String(Math.abs(parsed_date.year || 1)))

  //Synchronise local state when popover opens or current_year changes externally
  useEffect(() => {
    if (!is_open)
      return

    let d = UfDate.fromFractionalYear(current_year)
    set_selected_day(d.day)
    set_selected_month(d.month)
    set_selected_era(d.year < 0 ? 'BC' : 'AD')
    set_year_text(String(Math.abs(d.year || 1)))
  }, [is_open, current_year])

  //Dismiss on click outside
  useEffect(() => {
    if (!is_open)
      return

    let handle_click_outside = function (arg0_e: MouseEvent) {
      if (popover_ref.current && !popover_ref.current.contains(arg0_e.target as Node))
        on_close()
    }

    let handle_key_down = function (arg0_e: KeyboardEvent) {
      if (arg0_e.key === 'Escape')
        on_close()
    }

    document.addEventListener('mousedown', handle_click_outside)
    document.addEventListener('keydown', handle_key_down)

    return () => {
      document.removeEventListener('mousedown', handle_click_outside)
      document.removeEventListener('keydown', handle_key_down)
    }
  }, [is_open, on_close])

  year_num = parseInt(year_text, 10)
  if (Number.isNaN(year_num))
    year_num = 1
  effective_year = selected_era === 'BC' ? -Math.abs(year_num) : Math.abs(year_num)

  days_in_current_month = useMemo(() => {
    return UfDate.getDaysInMonth(effective_year, selected_month)
  }, [effective_year, selected_month])

  //Ensure selected day does not exceed maximum days in month
  useEffect(() => {
    if (selected_day > days_in_current_month)
      set_selected_day(days_in_current_month)
  }, [days_in_current_month, selected_day])

  days_array = useMemo(() => {
    let arr: number[] = []
    for (let i = 1; i <= days_in_current_month; i++)
      arr.push(i)
    return arr
  }, [days_in_current_month])

  preview_date_str = useMemo(() => {
    return UfDate.formatDate({
      day: Math.min(selected_day, days_in_current_month),
      month: selected_month,
      year: effective_year,
    })
  }, [selected_day, selected_month, effective_year, days_in_current_month])

  handle_year_change = function (arg0_val: string) {
    let cleaned = arg0_val.replace(/[^0-9]/g, '')
    set_year_text(cleaned)
  }

  handle_year_step = function (arg0_delta: number) {
    let curr = parseInt(year_text, 10)
    if (Number.isNaN(curr))
      curr = 1

    let next_effective = (selected_era === 'BC' ? -curr : curr) + arg0_delta
    next_effective = Math.max(min_year, Math.min(max_year, next_effective))

    if (next_effective < 0) {
      set_selected_era('BC')
      set_year_text(String(Math.abs(next_effective)))
    } else if (next_effective === 0) {
      set_selected_era('AD')
      set_year_text('1')
    } else {
      set_selected_era('AD')
      set_year_text(String(next_effective))
    }
  }

  handle_era_toggle = function (arg0_era: 'AD' | 'BC') {
    set_selected_era(arg0_era)
  }

  handle_month_select = function (arg0_m: number) {
    set_selected_month(arg0_m)
  }

  handle_day_select = function (arg0_d: number) {
    set_selected_day(arg0_d)
  }

  handle_preset_select = function (arg0_preset: LandmarkPreset) {
    let p = arg0_preset.date
    set_selected_day(p.day)
    set_selected_month(p.month)
    set_selected_era(p.year < 0 ? 'BC' : 'AD')
    set_year_text(String(Math.abs(p.year)))

    on_select_date({
      day: p.day,
      month: p.month,
      year: p.year,
    })
    on_close()
  }

  handle_apply = function () {
    let d: UfDateObject = {
      day: Math.min(selected_day, days_in_current_month),
      month: selected_month,
      year: effective_year,
    }
    on_select_date(d)
    on_close()
  }

  //Guard clauses
  if (!is_open)
    return null

  //Return statement
  return (
    <div
      ref={popover_ref}
      id="dataview-historical-date-picker"
      style={{
        maxHeight: 'calc(var(--app-height, 100dvh) - 180px)',
      }}
      className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[min(360px,calc(100vw-24px))] max-w-[calc(100vw-24px)] flex flex-col bg-card/98 backdrop-blur-md border border-border shadow-2xl select-none font-sans z-50 text-foreground animate-in fade-in-0 zoom-in-95 duration-150 overflow-hidden"
    >
      {/* Header (Pinned) */}
      <div className="flex items-center justify-between border-b border-border/70 p-3 pb-2.5 shrink-0 bg-card/90">
        <div className="flex items-center gap-2">
          <Icon name="event" className="text-primary text-sm" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground">
            {t.datePicker.title}
          </span>
        </div>
        <button
          type="button"
          onClick={on_close}
          className="text-muted-foreground hover:text-foreground p-0.5 cursor-pointer transition-colors"
          title={t.datePicker.close}
        >
          <Icon name="close" className="text-sm" />
        </button>
      </div>

      {/* Scrollable Body with Vertical Scrollbar System */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3 min-h-0">
        {/* Year & Era Input Section */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {t.datePicker.yearAndEra}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handle_era_toggle('BC')}
                className={`px-2 py-0.5 text-xs font-mono font-bold cursor-pointer transition-colors border ${selected_era === 'BC'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground border-border/60'
                  }`}
              >
                {t.timeline.bc}
              </button>
              <button
                type="button"
                onClick={() => handle_era_toggle('AD')}
                className={`px-2 py-0.5 text-xs font-mono font-bold cursor-pointer transition-colors border ${selected_era === 'AD'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted/40 text-muted-foreground hover:text-foreground border-border/60'
                  }`}
              >
                {t.timeline.ad}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 w-full min-w-0">
            <button
              type="button"
              onClick={() => handle_year_step(-100)}
              className="px-1.5 py-1 text-[10px] font-mono bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 cursor-pointer shrink-0"
              title={t.datePicker.subtract100Years}
            >
              -100
            </button>
            <button
              type="button"
              onClick={() => handle_year_step(-10)}
              className="px-1.5 py-1 text-[10px] font-mono bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 cursor-pointer shrink-0"
              title={t.datePicker.subtract10Years}
            >
              -10
            </button>

            <input
              type="text"
              value={year_text}
              onChange={(arg0_e) => handle_year_change(arg0_e.target.value)}
              onKeyDown={(arg0_e) => {
                if (arg0_e.key === 'Enter')
                  handle_apply()
              }}
              className="flex-1 min-w-[6ch] max-w-full text-center font-mono font-bold text-sm bg-background border border-border px-2 py-1 text-foreground focus:outline-hidden focus:border-primary"
              placeholder={t.datePicker.yearPlaceholder}
            />

            <button
              type="button"
              onClick={() => handle_year_step(10)}
              className="px-1.5 py-1 text-[10px] font-mono bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 cursor-pointer shrink-0"
              title={t.datePicker.add10Years}
            >
              +10
            </button>
            <button
              type="button"
              onClick={() => handle_year_step(100)}
              className="px-1.5 py-1 text-[10px] font-mono bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/60 cursor-pointer shrink-0"
              title={t.datePicker.add100Years}
            >
              +100
            </button>
          </div>
        </div>

        {/* Month Selection Grid */}
        <div className="space-y-1">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            {t.datePicker.month}
          </div>
          <div className="grid grid-cols-6 gap-1">
            {month_short_names.map((arg0_name, arg1_idx) => {
              let m_num = arg1_idx + 1
              let is_sel = selected_month === m_num
              return (
                <button
                  key={arg0_name}
                  type="button"
                  onClick={() => handle_month_select(m_num)}
                  className={`py-1 text-center font-mono text-[11px] cursor-pointer transition-colors border ${is_sel
                      ? 'bg-primary text-primary-foreground border-primary font-bold'
                      : 'bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground border-border/40'
                    }`}
                >
                  {arg0_name}
                </button>
              )
            })}
          </div>
        </div>

        {/* Day Selection Grid */}
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              {t.datePicker.day}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              {format(t.datePicker.daysInMonth, days_in_current_month)}
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1 pr-0.5">
            {days_array.map((arg0_d) => {
              let is_sel = selected_day === arg0_d
              return (
                <button
                  key={arg0_d}
                  type="button"
                  onClick={() => handle_day_select(arg0_d)}
                  className={`py-1 text-center font-mono text-[11px] cursor-pointer transition-colors border ${is_sel
                      ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                      : 'bg-muted/20 hover:bg-muted/50 text-muted-foreground hover:text-foreground border-border/40'
                    }`}
                >
                  {arg0_d}
                </button>
              )
            })}
          </div>
        </div>

        {/* Bookmarks Section (Collapsible) */}
        <div className="border border-border/50 bg-muted/10">
          <button
            type="button"
            onClick={() => set_is_bookmarks_expanded(!is_bookmarks_expanded)}
            className="w-full flex items-center justify-between px-2 py-1.5 cursor-pointer hover:bg-muted/30 transition-colors text-left select-none"
          >
            <div className="flex items-center gap-1.5">
              <Icon name="bookmark" className="text-xs text-primary" />
              <span className="text-[11px] font-medium text-foreground uppercase tracking-wide">
                {t.datePicker.bookmarks}
              </span>
            </div>
            <Icon
              name="expand_more"
              className={`text-xs text-muted-foreground transition-transform duration-150 ${is_bookmarks_expanded ? 'rotate-180' : ''}`}
            />
          </button>

          {is_bookmarks_expanded && (
            <div className="p-2 pt-1 grid grid-cols-2 gap-1 border-t border-border/30">
              <TooltipProvider delayDuration={150}>
                {landmark_presets.map((arg0_preset) => {
                  let formatted_date = UfDate.formatDate(arg0_preset.date)
                  let tooltip_description = arg0_preset.description || format(t.datePicker.jumpTo, arg0_preset.label)

                  return (
                    <Tooltip key={arg0_preset.id}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => handle_preset_select(arg0_preset)}
                          className="text-left px-2 py-1 text-[10px] font-mono bg-muted/20 hover:bg-primary/20 hover:border-primary/50 text-muted-foreground hover:text-foreground border border-border/40 truncate cursor-pointer transition-colors"
                          title={tooltip_description}
                        >
                          {arg0_preset.label}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] z-[60]">
                        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1 mb-1">
                          <span className="font-semibold text-foreground text-xs font-mono">{arg0_preset.label}</span>
                        </div>
                        {arg0_preset.description ? (
                          <div className="text-muted-foreground text-[11px] font-sans leading-snug whitespace-normal">
                            {arg0_preset.description}
                          </div>
                        ) : (
                          <div className="text-muted-foreground text-[11px] font-sans italic">
                            {format(t.datePicker.jumpTo, arg0_preset.label)}
                          </div>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  )
                })}
              </TooltipProvider>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Bar: Preview and Apply Action (Pinned) */}
      <div className="flex items-center justify-between p-3 pt-2.5 shrink-0 border-t border-border/70 bg-card/90">
        <div className="flex items-center gap-1.5 min-w-0 pr-2">
          <Icon name="schedule" className="text-xs text-white shrink-0" />
          <span className="text-xs font-bold font-mono text-primary truncate" title={preview_date_str}>
            {preview_date_str}
          </span>
        </div>

        <button
          type="button"
          onClick={handle_apply}
          className="px-3 py-1 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-mono font-bold tracking-wider uppercase border border-primary shadow-xs cursor-pointer transition-colors shrink-0"
        >
          {t.datePicker.jump}
        </button>
      </div>
    </div>
  )
}
