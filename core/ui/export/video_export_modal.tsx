import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { ParsedDataLayer } from '@server/layer_parser'
import { Icon } from '@ui/components/icon'
import { Label } from '@ui/components/label'
import { useLocalisation } from '@localisation'
import { VideoExportSettingsForm } from './video_export_settings_form'
import {
  buildIndicatorFolders,
  getDefaultExportZoom,
  getIndicatorLabel,
  CohortOption,
  IndicatorFolderItem,
  StartTimelapseExportOptions,
  TimestepUnit,
  VideoExportMode,
} from './video_export_utils'
import { drawFramingPreviewCanvas } from './timelapse_canvas_renderer'

export type { CohortOption, IndicatorFolderItem, StartTimelapseExportOptions, TimestepUnit, VideoExportMode }

export interface VideoExportModalProps {
  activeLayerId: string | null
  availableKeyframes: number[]
  availableLayers: Record<string, ParsedDataLayer>
  colorPalette?: string
  currentProjection?: string
  isOpen: boolean
  legendSubtitle?: string
  legendTitle?: string
  maxVal?: number
  maxYear: number
  minVal?: number
  minYear: number
  onClose: () => void
  onStartTimelapseExport?: (arg0_options: StartTimelapseExportOptions) => Promise<void>
  renderedCanvas?: HTMLCanvasElement | null
  timelineYear?: number
}

/**
 * Developer Video Export Modal supporting Stationary, Cycling, and Sequential timelapse modes.
 *
 * @param {VideoExportModalProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let VideoExportModal: React.FC<VideoExportModalProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let { formatString, t } = useLocalisation()
  let {
    activeLayerId: active_layer_id,
    availableKeyframes: available_keyframes,
    availableLayers: available_layers,
    isOpen: is_open,
    maxYear: max_year,
    minYear: min_year,
    onClose: on_close,
  } = props

  //Declare local instance variables
  let all_cohort_keys: string[]
  let available_partial_folders: any[]
  let clear_all_layers: () => void
  let concurrency: number
  let end_year: number
  let expanded_folders: Record<string, boolean>
  let export_error: string | null
  let export_filename: string
  let export_mode: VideoExportMode
  let export_success: string | null
  let fps: number
  let handle_start_export: () => Promise<void>
  let handle_zoom_change: (arg0_new_zoom: number) => void
  let indicator_folders: IndicatorFolderItem[]
  let is_exporting: boolean
  let keep_frames: boolean
  let keyframes_only: boolean
  let legend_position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  let max_ram_per_thread_mb: number
  let move_layer_down: (arg0_index: number) => void
  let move_layer_up: (arg0_index: number) => void
  let preview_canvas_ref: React.MutableRefObject<HTMLCanvasElement | null>
  let progress_pct: number
  let progress_status: string
  let projection: string
  let remove_layer: (arg0_index: number) => void
  let resolution: string
  let resume_folder: string
  let select_all_layers: () => void
  let selected_layers: string[]
  let set_available_partial_folders: React.Dispatch<React.SetStateAction<any[]>>
  let set_concurrency: React.Dispatch<React.SetStateAction<number>>
  let set_end_year: React.Dispatch<React.SetStateAction<number>>
  let set_expanded_folders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  let set_export_error: React.Dispatch<React.SetStateAction<string | null>>
  let set_export_filename: React.Dispatch<React.SetStateAction<string>>
  let set_export_mode: React.Dispatch<React.SetStateAction<VideoExportMode>>
  let set_export_success: React.Dispatch<React.SetStateAction<string | null>>
  let set_fps: React.Dispatch<React.SetStateAction<number>>
  let set_is_exporting: React.Dispatch<React.SetStateAction<boolean>>
  let set_keep_frames: React.Dispatch<React.SetStateAction<boolean>>
  let set_keyframes_only: React.Dispatch<React.SetStateAction<boolean>>
  let set_legend_position: React.Dispatch<React.SetStateAction<'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'>>
  let set_max_ram_per_thread_mb: React.Dispatch<React.SetStateAction<number>>
  let set_progress_pct: React.Dispatch<React.SetStateAction<number>>
  let set_progress_status: React.Dispatch<React.SetStateAction<string>>
  let set_projection: React.Dispatch<React.SetStateAction<string>>
  let set_resolution: React.Dispatch<React.SetStateAction<string>>
  let set_resume_folder: React.Dispatch<React.SetStateAction<string>>
  let set_selected_layers: React.Dispatch<React.SetStateAction<string[]>>
  let set_start_year: React.Dispatch<React.SetStateAction<number>>
  let set_timestep_step: React.Dispatch<React.SetStateAction<number>>
  let set_timestep_unit: React.Dispatch<React.SetStateAction<TimestepUnit>>
  let set_zoom: React.Dispatch<React.SetStateAction<number>>
  let start_year: number
  let timestep_step: number
  let timestep_unit: TimestepUnit
  let toggle_expanded_folder: (arg0_id: string) => void
  let toggle_folder_cohorts: (arg0_folder: IndicatorFolderItem) => void
  let toggle_layer: (arg0_id: string) => void
  let zoom: number

  //Function body
  indicator_folders = useMemo<IndicatorFolderItem[]>(() => {
    return buildIndicatorFolders(available_layers)
  }, [available_layers])

  all_cohort_keys = useMemo(() => {
    let keys: string[] = []
    for (let i = 0; i < indicator_folders.length; i++) {
      let f = indicator_folders[i]
      for (let x = 0; x < f.cohorts.length; x++) {
        keys.push(f.cohorts[x].key)
      }
    }
    return keys
  }, [indicator_folders])

  ;[resolution, set_resolution] = useState<string>('1080p')
  ;[concurrency, set_concurrency] = useState<number>(4)
  ;[export_mode, set_export_mode] = useState<VideoExportMode>('sequential')
  ;[timestep_unit, set_timestep_unit] = useState<TimestepUnit>('years')
  ;[timestep_step, set_timestep_step] = useState<number>(1)
  ;[keyframes_only, set_keyframes_only] = useState<boolean>(true)
  ;[legend_position, set_legend_position] = useState<'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'>('bottom-center')
  ;[start_year, set_start_year] = useState<number>(1800)
  ;[end_year, set_end_year] = useState<number>(2025)
  ;[fps, set_fps] = useState<number>(30)
  ;[projection, set_projection] = useState<string>(props.currentProjection || 'EqualEarth')
  ;[zoom, set_zoom] = useState<number>(() => {
    return getDefaultExportZoom(props.currentProjection || 'EqualEarth')
  })
  preview_canvas_ref = useRef<HTMLCanvasElement | null>(null)
  ;[export_filename, set_export_filename] = useState<string>(() => {
    return `dataview_timelapse_${Date.now()}.mp4`
  })
  ;[expanded_folders, set_expanded_folders] = useState<Record<string, boolean>>({
    professions_percentage: true,
    age_sex: false,
    labourforce_total: false,
  })
  ;[selected_layers, set_selected_layers] = useState<string[]>(() => {
    let initial: string[] = []
    let keys = Object.keys(available_layers)
    for (let i = 0; i < Math.min(3, keys.length); i++) {
      let k = keys[i]
      if (k === 'professions_percentage') {
        initial.push(
          `${k}::profession=agriculture&gender=t`,
          `${k}::profession=informal_labour&gender=t`,
          `${k}::profession=manufacturing&gender=t`,
          `${k}::profession=services&gender=t`,
          `${k}::profession=not_in_work&gender=t`
        )
      } else {
        initial.push(k)
      }
    }
    return initial
  })
  ;[available_partial_folders, set_available_partial_folders] = useState<any[]>([])
  ;[resume_folder, set_resume_folder] = useState<string>('')
  ;[keep_frames, set_keep_frames] = useState<boolean>(false)
  ;[max_ram_per_thread_mb, set_max_ram_per_thread_mb] = useState<number>(0)
  ;[is_exporting, set_is_exporting] = useState<boolean>(false)
  ;[progress_pct, set_progress_pct] = useState<number>(0)
  ;[progress_status, set_progress_status] = useState<string>('')
  ;[export_error, set_export_error] = useState<string | null>(null)
  ;[export_success, set_export_success] = useState<string | null>(null)

  useEffect(() => {
    if (!is_open)
      return
    fetch('/api/export/folders')
      .then((arg0_res) => arg0_res.json())
      .then((arg0_data) => {
        if (arg0_data && arg0_data.folders)
          set_available_partial_folders(arg0_data.folders)
      })
      .catch(() => {})
  }, [is_open])

  handle_zoom_change = useCallback((arg0_new_zoom: number) => {
    let clamped = Math.max(0.1, Math.min(4.0, Math.round(arg0_new_zoom * 100) / 100))
    set_zoom(clamped)
    if (typeof (window as any).__setMapZoom === 'function') {
      ;(window as any).__setMapZoom(clamped)
    }
  }, [])

  //Draw live 16:9 framing preview canvas showing map positioning relative to UI overlays
  useEffect(() => {
    let canvas = preview_canvas_ref.current
    if (!canvas)
      return

    drawFramingPreviewCanvas(canvas, {
      colorPalette: props.colorPalette,
      legendPosition: legend_position,
      legendSubtitle: props.legendSubtitle,
      legendTitle: props.legendTitle,
      maxVal: props.maxVal,
      minVal: props.minVal,
      renderedCanvas: props.renderedCanvas,
      resolution,
      startYear: start_year,
      timelineYear: props.timelineYear,
      zoom,
    })
  }, [
    legend_position,
    props.colorPalette,
    props.legendSubtitle,
    props.legendTitle,
    props.maxVal,
    props.minVal,
    props.renderedCanvas,
    props.timelineYear,
    projection,
    resolution,
    start_year,
    zoom,
  ])

  select_all_layers = useCallback(() => {
    set_selected_layers(all_cohort_keys)
  }, [all_cohort_keys])

  clear_all_layers = useCallback(() => {
    set_selected_layers([])
  }, [])

  toggle_layer = useCallback((arg0_id: string) => {
    let id = arg0_id
    set_selected_layers((arg0_prev) => {
      if (arg0_prev.includes(id))
        return arg0_prev.filter((arg0_x) => arg0_x !== id)
      return [...arg0_prev, id]
    })
  }, [])

  toggle_folder_cohorts = useCallback((arg0_folder: IndicatorFolderItem) => {
    let folder = arg0_folder
    let folder_cohort_keys = folder.cohorts.map((arg0_c) => arg0_c.key)
    set_selected_layers((arg0_prev) => {
      let all_selected = folder_cohort_keys.every((arg0_k) => arg0_prev.includes(arg0_k))
      if (all_selected) {
        return arg0_prev.filter((arg0_k) => !folder_cohort_keys.includes(arg0_k))
      }
      let next = [...arg0_prev]
      for (let i = 0; i < folder_cohort_keys.length; i++) {
        if (!next.includes(folder_cohort_keys[i]))
          next.push(folder_cohort_keys[i])
      }
      return next
    })
  }, [])

  move_layer_up = useCallback((arg0_index: number) => {
    let idx = arg0_index
    if (idx <= 0)
      return
    set_selected_layers((arg0_prev) => {
      let next = [...arg0_prev]
      let temp = next[idx]
      next[idx] = next[idx - 1]
      next[idx - 1] = temp
      return next
    })
  }, [])

  move_layer_down = useCallback((arg0_index: number) => {
    let idx = arg0_index
    set_selected_layers((arg0_prev) => {
      if (idx >= arg0_prev.length - 1)
        return arg0_prev
      let next = [...arg0_prev]
      let temp = next[idx]
      next[idx] = next[idx + 1]
      next[idx + 1] = temp
      return next
    })
  }, [])

  remove_layer = useCallback((arg0_index: number) => {
    let idx = arg0_index
    set_selected_layers((arg0_prev) => arg0_prev.filter((_arg0_x, arg0_i) => arg0_i !== idx))
  }, [])

  toggle_expanded_folder = useCallback((arg0_id: string) => {
    let id = arg0_id
    set_expanded_folders((arg0_prev) => ({
      ...arg0_prev,
      [id]: !arg0_prev[id],
    }))
  }, [])

  handle_start_export = useCallback(async () => {
    let clean_filename = export_filename.replace(/\.(mp4|webm)$/i, '') + '.mp4'

    let chosen_layers: string[] = selected_layers.length > 0
      ? selected_layers
      : (active_layer_id ? [active_layer_id] : Object.keys(available_layers).slice(0, 1))

    let w = 1920
    let h = 1080
    if (resolution === '1440p') {
      w = 2560
      h = 1440
    } else if (resolution === '720p') {
      w = 1280
      h = 720
    }

    if (props.onStartTimelapseExport) {
      on_close()
      await props.onStartTimelapseExport({
        concurrency,
        endYear: end_year,
        filename: clean_filename,
        fps,
        height: h,
        keepFrames: keep_frames,
        keyframesOnly: keyframes_only,
        legendPosition: legend_position,
        maxRamPerThreadMb: max_ram_per_thread_mb,
        mode: export_mode,
        projection,
        resumeFolder: resume_folder || undefined,
        selectedLayers: chosen_layers,
        startYear: start_year,
        timestepStep: timestep_step,
        width: w,
        zoom,
      })
    }
  }, [
    active_layer_id,
    available_layers,
    concurrency,
    end_year,
    export_filename,
    export_mode,
    fps,
    keep_frames,
    keyframes_only,
    legend_position,
    max_ram_per_thread_mb,
    on_close,
    projection,
    props,
    resolution,
    resume_folder,
    selected_layers,
    start_year,
    timestep_step,
    zoom,
  ])

  //Guard clauses
  if (!is_open)
    return null

  //Return statement
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm select-none font-sans p-4">
      <div className="bg-card/95 border border-border text-card-foreground shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 border-b border-border bg-card/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="movie" className="text-primary text-xl" />
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>{t.videoExport.developerTitle}</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-primary/20 text-primary border border-primary/40 font-mono">
                  {t.videoExport.developerBadge}
                </span>
              </h2>
              <p className="text-xs text-muted-foreground">
                {t.videoExport.exportSubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={on_close}
            disabled={is_exporting}
            className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground border border-border hover:bg-muted cursor-pointer"
            title={t.videoExport.close}
          >
            <Icon name="close" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Export Mode */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">{t.videoExport.exportMode}</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => set_export_mode('sequential')}
                className={`p-2.5 border text-left flex flex-col gap-1 cursor-pointer transition-colors ${export_mode === 'sequential'
                    ? 'bg-primary/15 border-primary text-foreground'
                    : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                  <Icon name="view_timeline" />
                  <span>{t.videoExport.exportModes.sequential}</span>
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {t.videoExport.sequentialDesc}
                </p>
              </button>

              <button
                type="button"
                onClick={() => set_export_mode('cycling')}
                className={`p-2.5 border text-left flex flex-col gap-1 cursor-pointer transition-colors ${export_mode === 'cycling'
                    ? 'bg-primary/15 border-primary text-foreground'
                    : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'
                  }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs text-foreground">
                  <Icon name="sync" />
                  <span>{t.videoExport.exportModes.cycling}</span>
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground">
                  {t.videoExport.cyclingDesc}
                </p>
              </button>
            </div>
          </div>

          {/* Indicators & Cohorts Selector */}
          <div className="space-y-2 border border-border p-2.5 bg-muted/20">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-foreground">
                {formatString(t.videoExport.activeIndicators, selected_layers.length)}
              </Label>
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <button
                  type="button"
                  onClick={select_all_layers}
                  className="text-primary hover:underline cursor-pointer"
                >
                  {t.videoExport.selectAll}
                </button>
                <span className="text-muted-foreground/40">•</span>
                <button
                  type="button"
                  onClick={clear_all_layers}
                  className="text-muted-foreground hover:underline cursor-pointer"
                >
                  {t.videoExport.clearSelection}
                </button>
              </div>
            </div>

            <div className="space-y-1 max-h-56 overflow-y-auto pr-1 border border-border/50 bg-background/50 p-1.5">
              {indicator_folders.map((arg0_folder) => {
                let f_keys = arg0_folder.cohorts.map((arg0_c) => arg0_c.key)
                let selected_count = f_keys.filter((arg0_k) => selected_layers.includes(arg0_k)).length
                let is_all_selected = selected_count === f_keys.length && f_keys.length > 0
                let is_some_selected = selected_count > 0 && selected_count < f_keys.length
                let is_expanded = Boolean(expanded_folders[arg0_folder.id])

                if (!arg0_folder.isFolder) {
                  let is_checked = selected_layers.includes(arg0_folder.cohorts[0]?.key || arg0_folder.id)
                  return (
                    <div
                      key={arg0_folder.id}
                      onClick={() => toggle_layer(arg0_folder.cohorts[0]?.key || arg0_folder.id)}
                      className={`px-2 py-1 flex items-center justify-between border text-[11px] cursor-pointer transition-colors ${is_checked
                          ? 'bg-primary/20 border-primary text-foreground font-medium'
                          : 'bg-card border-border/60 text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      <div className="flex items-center gap-1.5 truncate">
                        <Icon name="analytics" className="text-xs text-muted-foreground shrink-0" />
                        <span className="truncate">{arg0_folder.name}</span>
                      </div>
                      {is_checked && <Icon name="check" className="text-xs text-primary shrink-0" />}
                    </div>
                  )
                }

                return (
                  <div key={arg0_folder.id} className="border border-border/70 bg-card/60 overflow-hidden">
                    <div
                      className={`px-2 py-1 flex items-center justify-between transition-colors ${is_all_selected ? 'bg-primary/15' : is_some_selected ? 'bg-primary/5' : 'bg-muted/30'
                        }`}
                    >
                      <div
                        onClick={() => toggle_folder_cohorts(arg0_folder)}
                        className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer select-none"
                      >
                        <button
                          type="button"
                          className={`w-3.5 h-3.5 border flex items-center justify-center shrink-0 text-[10px] ${is_all_selected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : is_some_selected
                                ? 'border-primary bg-primary/40 text-primary-foreground'
                                : 'border-muted-foreground/60 bg-background'
                            }`}
                        >
                          {is_all_selected && <Icon name="check" className="text-[10px]" />}
                          {is_some_selected && <span className="w-1.5 h-1.5 bg-primary" />}
                        </button>
                        <Icon name={is_expanded ? 'folder_open' : 'folder'} className="text-primary text-xs shrink-0" />
                        <span className="text-xs font-bold text-foreground truncate">{arg0_folder.name}</span>
                        <span className="text-[10px] text-muted-foreground font-mono ml-1">
                          ({selected_count}/{f_keys.length} cohorts)
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(arg0_e) => {
                          arg0_e.stopPropagation()
                          toggle_expanded_folder(arg0_folder.id)
                        }}
                        className="p-1 hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer shrink-0"
                      >
                        <Icon name={is_expanded ? 'expand_less' : 'expand_more'} className="text-xs" />
                      </button>
                    </div>

                    {is_expanded && (
                      <div className="p-1.5 bg-background/60 border-t border-border/40 grid grid-cols-2 gap-1 max-h-36 overflow-y-auto">
                        {arg0_folder.cohorts.map((arg0_cohort) => {
                          let is_cohort_checked = selected_layers.includes(arg0_cohort.key)
                          return (
                            <button
                              key={arg0_cohort.key}
                              type="button"
                              onClick={() => toggle_layer(arg0_cohort.key)}
                              className={`px-1.5 py-0.5 flex items-center justify-between border text-left text-[10px] cursor-pointer transition-colors ${is_cohort_checked
                                  ? 'bg-primary/20 border-primary text-foreground font-medium'
                                  : 'bg-card border-border/50 text-muted-foreground hover:text-foreground'
                                }`}
                            >
                              <span className="truncate pr-1">{arg0_cohort.label}</span>
                              {is_cohort_checked && <Icon name="check" className="text-[10px] text-primary shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Active Indicator Order Queue with Reordering Arrows */}
            {selected_layers.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t border-border/60">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-foreground flex items-center gap-1">
                    <Icon name="format_list_numbered" className="text-primary text-xs" />
                    <span>Execution & Cycle Sequence ({selected_layers.length} items)</span>
                  </span>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    Use arrows to reorder sequence
                  </span>
                </div>

                <div className="space-y-1 max-h-44 overflow-y-auto pr-1">
                  {selected_layers.map((arg0_layer_key, arg0_idx) => {
                    let label = getIndicatorLabel(arg0_layer_key, indicator_folders, available_layers)
                    return (
                      <div
                        key={`${arg0_layer_key}_${arg0_idx}`}
                        className="px-2 py-1 flex items-center justify-between border border-border bg-card text-[11px]"
                      >
                        <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                          <span className="font-mono text-primary font-bold text-[10px] w-5 shrink-0">
                            #{arg0_idx + 1}
                          </span>
                          <span className="truncate text-foreground font-medium">{label}</span>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            type="button"
                            onClick={() => move_layer_up(arg0_idx)}
                            disabled={arg0_idx === 0}
                            title="Move earlier in render sequence"
                            className="w-5 h-5 flex items-center justify-center border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="arrow_upward" className="text-xs" />
                          </button>
                          <button
                            type="button"
                            onClick={() => move_layer_down(arg0_idx)}
                            disabled={arg0_idx === selected_layers.length - 1}
                            title="Move later in render sequence"
                            className="w-5 h-5 flex items-center justify-center border border-border bg-background hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer text-muted-foreground hover:text-foreground"
                          >
                            <Icon name="arrow_downward" className="text-xs" />
                          </button>
                          <button
                            type="button"
                            onClick={() => remove_layer(arg0_idx)}
                            title="Remove from selection"
                            className="w-5 h-5 flex items-center justify-center border border-destructive/40 text-destructive hover:bg-destructive/10 cursor-pointer ml-0.5"
                          >
                            <Icon name="close" className="text-xs" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modular Video Export Settings Form */}
          <VideoExportSettingsForm
            availablePartialFolders={available_partial_folders}
            concurrency={concurrency}
            endYear={end_year}
            exportFilename={export_filename}
            fps={fps}
            handleZoomChange={handle_zoom_change}
            keepFrames={keep_frames}
            keyframesOnly={keyframes_only}
            legendPosition={legend_position}
            maxRamPerThreadMb={max_ram_per_thread_mb}
            maxYear={max_year}
            minYear={min_year}
            previewCanvasRef={preview_canvas_ref}
            projection={projection}
            resolution={resolution}
            resumeFolder={resume_folder}
            setConcurrency={set_concurrency}
            setEndYear={set_end_year}
            setExportFilename={set_export_filename}
            setExportMode={set_export_mode}
            setFps={set_fps}
            setKeepFrames={set_keep_frames}
            setKeyframesOnly={set_keyframes_only}
            setLegendPosition={set_legend_position}
            setMaxRamPerThreadMb={set_max_ram_per_thread_mb}
            setProjection={set_projection}
            setResolution={set_resolution}
            setResumeFolder={set_resume_folder}
            setStartYear={set_start_year}
            setTimestepStep={set_timestep_step}
            setTimestepUnit={set_timestep_unit}
            startYear={start_year}
            timestepStep={timestep_step}
            timestepUnit={timestep_unit}
            zoom={zoom}
          />

          {/* Progress / Status Feedback */}
          {is_exporting && (
            <div className="space-y-1.5 p-2.5 bg-primary/10 border border-primary/30">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-primary font-bold">{progress_status}</span>
                <span>{progress_pct}%</span>
              </div>
              <div className="w-full h-2 bg-muted overflow-hidden">
                <div
                  style={{ width: `${progress_pct}%` }}
                  className="h-full bg-primary transition-all duration-150"
                />
              </div>
            </div>
          )}

          {export_error && (
            <div className="p-2.5 bg-destructive/15 border border-destructive/40 text-destructive text-xs flex items-center gap-2">
              <Icon name="error" />
              <span>{export_error}</span>
            </div>
          )}

          {export_success && (
            <div className="p-2.5 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 text-xs flex items-center gap-2">
              <Icon name="check_circle" />
              <span>{export_success}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-border bg-card/60 flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">
            {formatString(t.videoExport.targetDestination, 'exports/')}
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={on_close}
              disabled={is_exporting}
              className="px-3 py-1.5 border border-border hover:bg-muted text-xs font-medium cursor-pointer"
            >
              {t.videoExport.close}
            </button>
            <button
              type="button"
              onClick={handle_start_export}
              disabled={is_exporting}
              className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Icon name="videocam" />
              <span>{is_exporting ? t.videoExport.exporting : t.videoExport.startExport}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
