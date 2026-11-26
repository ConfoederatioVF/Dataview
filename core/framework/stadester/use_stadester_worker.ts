import { startTransition, useEffect, useRef, useState } from 'react'
import { CLIENT_STADESTER_SCALING } from '../../../common/optimisation/stadester_scaling_client.ts'
import { STADESTER_CONFIG } from '@common'
import { CityPoint, ProjectionType, StadesterConfig } from '@framework/geopng/types.ts'
import { computeViewportBoundingBox } from './stadester_heuristics.ts'
import { resolveDefaultStadesterDataset } from './stadester_versions.ts'
import {
  extractCompactBorderFeatures,
  getBBoxLonSpan,
  isGeoBBoxContained,
  scaleGeoBBox,
} from './stadester_wire_decoder.ts'
import type {
  WorkerBinaryAttributes,
  WorkerInMessage,
  WorkerOutMessage,
  WorkerPickTable,
  WorkerPlacedLabel,
  WorkerProcessedPoint,
} from './stadester.worker.ts'

export interface UseStadesterWorkerParams {
  bordersData?: { features?: any[] } | null
  cities: CityPoint[]
  config?: StadesterConfig
  enableViewportStreaming?: boolean
  hoveredRegion?: string | null
  isInteractingRef?: React.MutableRefObject<boolean>
  isPlaying?: boolean
  projection: ProjectionType
  selectedCityKey?: string | null
  viewState: any
  year: number
}

export interface UseStadesterWorkerResult {
  binaryAttributes?: WorkerBinaryAttributes
  isCalculating: boolean
  labels: WorkerPlacedLabel[]
  pickTable?: WorkerPickTable
  points: WorkerProcessedPoint[]
  reconciledInWorker: boolean
  selectedCityPoint?: WorkerProcessedPoint | null
}

/**
 * Hook to asynchronously compute settlement viewport streaming, capital reconciliation,
 * projection, zoom heuristics, and label collisions via Web Worker with rAF-paced commits.
 *
 * @param {UseStadesterWorkerParams} arg0_options
 *
 * @returns {UseStadesterWorkerResult}
 */
export function useStadesterWorker (arg0_options: UseStadesterWorkerParams): UseStadesterWorkerResult {
  //Convert from parameters
  let options = arg0_options
  let borders_data = options.bordersData
  let cities = options.cities
  let config = options.config
  let enable_viewport_streaming = Boolean(options.enableViewportStreaming)
  let hovered_region = options.hoveredRegion || null
  let is_interacting_ref = options.isInteractingRef
  let is_playing = Boolean(options.isPlaying)
  let projection = options.projection
  let selected_city_key = options.selectedCityKey || null
  let view_state = options.viewState
  let year = options.year

  //Declare local instance variables
  let [binary_attributes, set_binary_attributes] = useState<WorkerBinaryAttributes | undefined>(undefined)
  let borders_version_ref = useRef<number>(0)
  let debounce_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  let defer_timer_ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  let [is_calculating, set_is_calculating] = useState<boolean>(false)
  let is_firefox = typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent)
  let [labels, set_labels] = useState<WorkerPlacedLabel[]>([])
  let last_dispatch_ms_ref = useRef<number>(0)
  let last_dispatched_borders_ver_ref = useRef<number>(-1)
  let last_dispatched_cities_ref = useRef<CityPoint[] | null>(null)
  let last_dispatched_opts_key_ref = useRef<string>('')
  let last_dispatched_year_ref = useRef<number>(year)
  let last_projection_ref = useRef<ProjectionType>(projection)
  let last_sent_borders_ref = useRef<any>(undefined)
  let last_sent_cities_ref = useRef<CityPoint[]>([])
  let last_sent_enabled_ref = useRef<boolean>(false)
  let last_sent_year_ref = useRef<number>(year)
  let last_stream_req_ref = useRef<{ bbox: [number, number, number, number]; meta_key: string; zoom: number } | null>(null)
  let pending_first_queued_ms_ref = useRef<number>(0)
  let pending_raf_ref = useRef<number | null>(null)
  let pending_result_ref = useRef<(WorkerOutMessage & { type: 'LAYOUT_RESULT' }) | null>(null)
  let [pick_table, set_pick_table] = useState<WorkerPickTable | undefined>(undefined)
  let [points, set_points] = useState<WorkerProcessedPoint[]>([])
  let [reconciled_in_worker, set_reconciled_in_worker] = useState<boolean>(false)
  let req_id_ref = useRef<number>(0)
  let [selected_city_point, set_selected_city_point] = useState<WorkerProcessedPoint | null | undefined>(null)
  let stream_debounce_ref = useRef<ReturnType<typeof setTimeout> | null>(null)
  let stream_id_ref = useRef<number>(0)
  let viewport_active_sent_ref = useRef<boolean>(false)
  let worker_ref = useRef<Worker | null>(null)

  //Function body
  let include_points_array = Boolean(is_firefox || hovered_region)

  //1. Initialise worker with rAF + startTransition commit pacing
  useEffect(() => {
    let worker: Worker | null = null

    let commitPendingResult = function (): void {
      pending_raf_ref.current = null
      let msg = pending_result_ref.current
      if (!msg)
        return

      //During active pan/zoom drags, defer non-critical background spatial stream GPU uploads briefly
      let defer_limit_ms = CLIENT_STADESTER_SCALING.worker_defer_during_interaction_ms
      if (
        msg.isFromStream &&
        is_interacting_ref?.current &&
        (performance.now() - pending_first_queued_ms_ref.current) < defer_limit_ms
      ) {
        if (defer_timer_ref.current === null) {
          defer_timer_ref.current = setTimeout(() => {
            defer_timer_ref.current = null
            if (pending_result_ref.current && pending_raf_ref.current === null)
              pending_raf_ref.current = requestAnimationFrame(commitPendingResult)
          }, 40)
        }
        return
      }

      pending_result_ref.current = null
      pending_first_queued_ms_ref.current = 0

      if (msg.projection && msg.projection !== last_projection_ref.current)
        return

      let applyUpdates = function (): void {
        if (msg.pointsChanged) {
          set_points(msg.points || [])
          set_binary_attributes(msg.binaryAttributes)
          set_pick_table(msg.pickTable)
        }
        set_labels(msg.labels)
        set_selected_city_point(msg.selectedCityPoint ?? null)
        set_reconciled_in_worker(Boolean(msg.reconciledInWorker))
        set_is_calculating(false)
      }

      if (msg.isFromStream)
        startTransition(applyUpdates)
      else
        applyUpdates()
    }

    try {
      worker = new Worker(new URL('./stadester.worker.ts', import.meta.url), {
        type: 'module',
      })

      worker.onmessage = (arg0_e: MessageEvent<WorkerOutMessage>) => {
        let msg = arg0_e.data
        if (!msg)
          return

        if (msg.type === 'LAYOUT_ERROR') {
          if (msg.reqId === req_id_ref.current) {
            console.error('[useStadesterWorker] Worker error:', msg.error)
            set_is_calculating(false)
          }
          return
        }

        if (msg.type === 'LAYOUT_RESULT') {
          let is_current_req = msg.reqId === req_id_ref.current
          let is_current_stream = Boolean(msg.isFromStream && msg.streamId === stream_id_ref.current)
          if (!is_current_req && !is_current_stream)
            return

          //Preserve pointsChanged if an earlier unread frame changed GPU buffers before a labels-only frame
          let prev_pending = pending_result_ref.current
          if (prev_pending && prev_pending.pointsChanged && !msg.pointsChanged) {
            pending_result_ref.current = {
              ...msg,
              binaryAttributes: prev_pending.binaryAttributes,
              pickTable: prev_pending.pickTable,
              points: prev_pending.points,
              pointsChanged: true,
            }
          } else {
            pending_result_ref.current = msg
          }

          if (pending_first_queued_ms_ref.current === 0)
            pending_first_queued_ms_ref.current = performance.now()

          if (pending_raf_ref.current === null)
            pending_raf_ref.current = requestAnimationFrame(commitPendingResult)
        }
      }

      worker_ref.current = worker
    } catch (arg0_err) {
      console.warn('[useStadesterWorker] Failed to initialise worker:', arg0_err)
    }

    return () => {
      if (debounce_timer_ref.current)
        clearTimeout(debounce_timer_ref.current)
      if (stream_debounce_ref.current)
        clearTimeout(stream_debounce_ref.current)
      if (defer_timer_ref.current)
        clearTimeout(defer_timer_ref.current)
      if (pending_raf_ref.current !== null)
        cancelAnimationFrame(pending_raf_ref.current)
      if (worker)
        worker.terminate()
      worker_ref.current = null
    }
  }, [is_interacting_ref])

  //2. Sync historical borders lookup context to worker once per year / border dataset update
  useEffect(() => {
    if (!worker_ref.current || !config?.enabled)
      return
    if (last_sent_borders_ref.current === borders_data)
      return

    last_sent_borders_ref.current = borders_data
    borders_version_ref.current++
    let compact_features = extractCompactBorderFeatures(borders_data)
    worker_ref.current.postMessage({
      features: compact_features,
      type: 'SET_BORDERS_CONTEXT',
      year: Math.round(year || 1950),
    } as WorkerInMessage)
  }, [borders_data, config?.enabled, year])

  //3. Update base dataset on year/cities change
  useEffect(() => {
    if (!worker_ref.current)
      return

    if (!config?.enabled) {
      last_sent_cities_ref.current = []
      last_sent_enabled_ref.current = false
      last_stream_req_ref.current = null
      viewport_active_sent_ref.current = false
      worker_ref.current.postMessage({
        cities: [],
        type: 'SET_DATA',
        year: 0,
      } as WorkerInMessage)
      return
    }

    let prev = last_sent_cities_ref.current
    let can_append = Boolean(
      last_sent_enabled_ref.current &&
      last_sent_year_ref.current === year &&
      prev.length > 0 &&
      cities.length > prev.length &&
      cities[0]?.key === prev[0]?.key &&
      cities[prev.length - 1]?.key === prev[prev.length - 1]?.key
    )

    if (can_append) {
      let delta = cities.slice(prev.length)
      last_sent_cities_ref.current = cities
      worker_ref.current.postMessage({
        cities: delta as any,
        type: 'APPEND_DATA',
        year,
      } as WorkerInMessage)
      return
    }

    if (last_sent_year_ref.current !== year) {
      last_stream_req_ref.current = null
      viewport_active_sent_ref.current = false
    }

    last_sent_cities_ref.current = cities
    last_sent_enabled_ref.current = true
    last_sent_year_ref.current = year
    worker_ref.current.postMessage({
      cities: cities as any,
      type: 'SET_DATA',
      year,
    } as WorkerInMessage)
  }, [cities, year, config?.enabled])

  //4. Off-thread spatial viewport streaming directly inside the Web Worker when zoomed in
  useEffect(() => {
    if (!worker_ref.current)
      return

    let cancelStream = function (arg0_restore_base: boolean): void {
      if (stream_debounce_ref.current) {
        clearTimeout(stream_debounce_ref.current)
        stream_debounce_ref.current = null
      }
      if (viewport_active_sent_ref.current) {
        viewport_active_sent_ref.current = false
        last_stream_req_ref.current = null
        stream_id_ref.current++
        worker_ref.current?.postMessage({
          restoreBase: arg0_restore_base,
          type: 'CANCEL_VIEWPORT',
        } as WorkerInMessage)
      }
    }

    let max_cities = (config?.maxCities !== undefined) ? config.maxCities : 4000
    let is_cartesian = projection === 'EqualEarth' || projection === 'Equirectangular'
    let zoom = view_state?.zoom ?? (projection === 'Globe' ? 3 : 1.2)
    let norm_zoom = is_cartesian ? zoom - 1.2 : (projection === 'Globe' ? zoom - 1.65 : zoom)
    let zoom_threshold = CLIENT_STADESTER_SCALING.tile_fetch_zoom_threshold
    let is_viewport_active = Boolean(
      enable_viewport_streaming &&
      CLIENT_STADESTER_SCALING.enable_viewport_tiles &&
      config?.enabled &&
      !is_playing &&
      max_cities > 0 &&
      norm_zoom >= zoom_threshold &&
      view_state
    )

    if (!is_viewport_active) {
      cancelStream(Boolean(config?.enabled))
      return
    }

    let window_w = (typeof window !== 'undefined') ? window.innerWidth : 1920
    let window_h = (typeof window !== 'undefined') ? window.innerHeight : 1080
    let raw_bbox = computeViewportBoundingBox(view_state, projection, window_w, window_h)
    let raw_lon_span = getBBoxLonSpan(raw_bbox[0], raw_bbox[2])
    let raw_lat_span = raw_bbox[3] - raw_bbox[1]

    if (raw_lon_span >= 180 && raw_lat_span >= 120) {
      cancelStream(true)
      return
    }

    let color_mode = config?.colorMode || 'growth'
    let dataset = config?.dataset || resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester)
    let min_pop = (config?.minPop !== undefined) ? Math.max(0.01, config.minPop) : 0.01
    let rounded_year = Math.round(year || 1950)
    let meta_key = `${dataset}:${rounded_year}:${color_mode}:${min_pop}:${max_cities}`
    let inner_bbox = scaleGeoBBox(raw_bbox, 0.8)
    let prev_req = last_stream_req_ref.current

    if (
      prev_req &&
      prev_req.meta_key === meta_key &&
      Math.abs(norm_zoom - prev_req.zoom) < 0.5 &&
      isGeoBBoxContained(inner_bbox, prev_req.bbox)
    ) {
      return
    }

    if (stream_debounce_ref.current) {
      clearTimeout(stream_debounce_ref.current)
      stream_debounce_ref.current = null
    }

    let fetch_bbox = scaleGeoBBox(raw_bbox, 1.2)
    stream_debounce_ref.current = setTimeout(() => {
      stream_debounce_ref.current = null
      let next_stream_id = ++stream_id_ref.current
      last_stream_req_ref.current = {
        bbox: fetch_bbox,
        meta_key,
        zoom: norm_zoom,
      }
      viewport_active_sent_ref.current = true
      worker_ref.current?.postMessage({
        bbox: fetch_bbox,
        coalesceMs: CLIENT_STADESTER_SCALING.worker_chunk_coalesce_ms,
        colorMode: color_mode,
        dataset,
        maxCities: max_cities,
        minPop: min_pop,
        normZoom: norm_zoom,
        streamId: next_stream_id,
        streamMinCitiesThreshold: CLIENT_STADESTER_SCALING.stream_min_cities_threshold,
        type: 'STREAM_VIEWPORT',
        year: rounded_year,
      } as WorkerInMessage)
    }, 120)

    return () => {
      if (stream_debounce_ref.current) {
        clearTimeout(stream_debounce_ref.current)
        stream_debounce_ref.current = null
      }
    }
  }, [
    config?.colorMode,
    config?.dataset,
    config?.enabled,
    config?.maxCities,
    config?.minPop,
    enable_viewport_streaming,
    is_playing,
    projection,
    view_state,
    year,
  ])

  //5. Dispatch layout computation on camera/viewport/style/border changes
  useEffect(() => {
    if (last_projection_ref.current !== projection) {
      last_projection_ref.current = projection
      pending_result_ref.current = null
      set_points([])
      set_labels([])
      set_binary_attributes(undefined)
      set_pick_table(undefined)
      set_selected_city_point(null)
    }

    if (!config?.enabled || cities.length === 0) {
      pending_result_ref.current = null
      set_points([])
      set_labels([])
      set_binary_attributes(undefined)
      set_pick_table(undefined)
      set_selected_city_point(null)
      set_reconciled_in_worker(false)
      set_is_calculating(false)
      last_dispatched_cities_ref.current = null
      return
    }

    if (!worker_ref.current)
      return

    let growth_palette = config.growthPalette || 'Rainbow'
    let population_palette = config.populationPalette || 'Plasma'
    let region_palette = config.regionPalette || 'Default'
    let opts_key = JSON.stringify([
      config.bubbleSize ?? 1.0,
      config.colorMode || 'growth',
      config.display_options || null,
      growth_palette,
      population_palette,
      region_palette,
      config.halo !== false && !config.filled,
      config.heuristicCulling !== undefined ? Boolean(config.heuristicCulling) : true,
      config.labelCollision !== false,
      config.largeCityContrast ?? 1.0,
      config.opacity ?? 0.7,
      config.showLabels !== false,
      include_points_array,
      selected_city_key,
      projection,
    ])
    let is_non_view_change = Boolean(
      last_dispatched_cities_ref.current !== cities ||
      last_dispatched_year_ref.current !== year ||
      last_dispatched_opts_key_ref.current !== opts_key ||
      last_dispatched_borders_ver_ref.current !== borders_version_ref.current
    )
    let current_req_id = ++req_id_ref.current

    let dispatchLayout = function (): void {
      let serialisable_display_options = config.display_options
        ? Object.fromEntries(
            Object.entries(config.display_options).filter(([, arg0_val]) => typeof arg0_val !== 'function')
          )
        : undefined
      let serialisable_view_state = view_state
        ? {
            bearing: view_state.bearing,
            latitude: view_state.latitude,
            longitude: view_state.longitude,
            pitch: view_state.pitch,
            target: Array.isArray(view_state.target) ? [...view_state.target] : undefined,
            zoom: view_state.zoom,
          }
        : null
      let window_h = (typeof window !== 'undefined') ? window.innerHeight : 1080
      let window_w = (typeof window !== 'undefined') ? window.innerWidth : 1920

      last_dispatch_ms_ref.current = performance.now()
      last_dispatched_borders_ver_ref.current = borders_version_ref.current
      last_dispatched_cities_ref.current = cities
      last_dispatched_year_ref.current = year
      last_dispatched_opts_key_ref.current = opts_key
      if (is_non_view_change)
        set_is_calculating(true)

      worker_ref.current?.postMessage({
        bubbleSize: config.bubbleSize ?? 1.0,
        colorMode: config.colorMode || 'growth',
        displayOptions: serialisable_display_options,
        growthPalette: growth_palette,
        heuristicCulling: (config.heuristicCulling !== undefined)
          ? Boolean(config.heuristicCulling)
          : true,
        includePointsArray: include_points_array,
        isHalo: config.halo !== false && !config.filled,
        isMobile: Boolean(window_w < 768),
        labelCollision: config.labelCollision !== false,
        largeCityContrast: config.largeCityContrast ?? 1.0,
        opacity: (config.opacity !== undefined) ? config.opacity : 0.7,
        populationPalette: population_palette,
        projection,
        regionPalette: region_palette,
        reqId: current_req_id,
        selectedCityKey: selected_city_key,
        showLabels: config.showLabels !== false,
        type: 'LAYOUT_VIEWPORT',
        viewState: serialisable_view_state,
        windowH: window_h,
        windowW: window_w,
      } as WorkerInMessage)
    }

    if (debounce_timer_ref.current) {
      clearTimeout(debounce_timer_ref.current)
      debounce_timer_ref.current = null
    }

    if (is_non_view_change) {
      dispatchLayout()
    } else {
      let elapsed_ms = performance.now() - last_dispatch_ms_ref.current
      if (elapsed_ms >= 48) {
        dispatchLayout()
      } else {
        debounce_timer_ref.current = setTimeout(() => {
          debounce_timer_ref.current = null
          dispatchLayout()
        }, Math.max(4, Math.ceil(48 - elapsed_ms)))
      }
    }

    return () => {
      if (debounce_timer_ref.current) {
        clearTimeout(debounce_timer_ref.current)
        debounce_timer_ref.current = null
      }
    }
  }, [
    borders_data,
    cities,
    year,
    config?.enabled,
    config?.bubbleSize,
    config?.colorMode,
    config?.display_options,
    config?.growthPalette,
    config?.halo,
    config?.heuristicCulling,
    config?.filled,
    config?.labelCollision,
    config?.largeCityContrast,
    config?.opacity,
    config?.populationPalette,
    config?.regionPalette,
    config?.showLabels,
    include_points_array,
    selected_city_key,
    projection,
    view_state,
  ])

  //Return statement
  return {
    binaryAttributes: binary_attributes,
    isCalculating: is_calculating,
    labels,
    pickTable: pick_table,
    points,
    reconciledInWorker: reconciled_in_worker,
    selectedCityPoint: selected_city_point,
  }
}
