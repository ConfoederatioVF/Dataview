import { useState, useEffect, useRef } from 'react'
import { CityPoint, StadesterConfig, ProjectionType } from '@framework/geopng/types.ts'
import type {
  WorkerBinaryAttributes,
  WorkerInMessage,
  WorkerOutMessage,
  WorkerProcessedPoint,
  WorkerPlacedLabel,
} from './stadester.worker.ts'

export interface UseStadesterWorkerParams {
  cities: CityPoint[]
  config?: StadesterConfig
  projection: ProjectionType
  viewState: any
  year: number
}

export interface UseStadesterWorkerResult {
  binaryAttributes?: WorkerBinaryAttributes
  isCalculating: boolean
  labels: WorkerPlacedLabel[]
  points: WorkerProcessedPoint[]
}

/**
 * Hook to asynchronously compute settlement filtering, zoom heuristics, and label collisions via Web Worker.
 *
 * @param {UseStadesterWorkerParams} arg0_options
 *
 * @returns {UseStadesterWorkerResult}
 */
export function useStadesterWorker (arg0_options: UseStadesterWorkerParams): UseStadesterWorkerResult {
  //Convert from parameters
  let options = arg0_options
  let cities = options.cities
  let config = options.config
  let projection = options.projection
  let view_state = options.viewState
  let year = options.year

  //Declare local instance variables
  let binary_attributes: WorkerBinaryAttributes | undefined
  let debounce_timer_ref = useRef<any>(null)
  let is_calculating: boolean
  let labels: WorkerPlacedLabel[]
  let last_dispatch_ms_ref = useRef<number>(0)
  let last_dispatched_cities_ref = useRef<CityPoint[] | null>(null)
  let last_dispatched_opts_key_ref = useRef<string>('')
  let last_dispatched_year_ref = useRef<number>(year)
  let last_projection_ref = useRef<ProjectionType>(projection)
  let last_sent_cities_ref = useRef<CityPoint[]>([])
  let last_sent_enabled_ref = useRef<boolean>(false)
  let last_sent_year_ref = useRef<number>(year)
  let points: WorkerProcessedPoint[]
  let req_id_ref = useRef<number>(0)
  let set_binary_attributes: React.Dispatch<React.SetStateAction<WorkerBinaryAttributes | undefined>>
  let set_is_calculating: React.Dispatch<React.SetStateAction<boolean>>
  let set_labels: React.Dispatch<React.SetStateAction<WorkerPlacedLabel[]>>
  let set_points: React.Dispatch<React.SetStateAction<WorkerProcessedPoint[]>>
  let worker_ref = useRef<Worker | null>(null)

  //Function body
  ;[points, set_points] = useState<WorkerProcessedPoint[]>([])
  ;[labels, set_labels] = useState<WorkerPlacedLabel[]>([])
  ;[binary_attributes, set_binary_attributes] = useState<WorkerBinaryAttributes | undefined>(undefined)
  ;[is_calculating, set_is_calculating] = useState<boolean>(false)

  //1. Initialise worker
  useEffect(() => {
    let worker: Worker | null = null
    try {
      worker = new Worker(new URL('./stadester.worker.ts', import.meta.url), {
        type: 'module',
      })

      worker.onmessage = (arg0_e: MessageEvent<WorkerOutMessage>) => {
        let msg = arg0_e.data
        if (!msg)
          return

        if (msg.reqId === req_id_ref.current) {
          if (msg.type === 'LAYOUT_RESULT') {
            if (msg.pointsChanged) {
              set_points(msg.points || [])
              set_binary_attributes(msg.binaryAttributes)
            }
            set_labels(msg.labels)
            set_is_calculating(false)
          } else if (msg.type === 'LAYOUT_ERROR') {
            console.error('[useStadesterWorker] Worker error:', msg.error)
            set_is_calculating(false)
          }
        }
      }

      worker_ref.current = worker
    } catch (arg0_err) {
      console.warn('[useStadesterWorker] Failed to initialise worker:', arg0_err)
    }

    return () => {
      if (debounce_timer_ref.current)
        clearTimeout(debounce_timer_ref.current)
      if (worker)
        worker.terminate()
      worker_ref.current = null
    }
  }, [])

  //2. Update dataset on year/cities change (incremental APPEND_DATA when progressively streamed/tiled)
  useEffect(() => {
    if (!worker_ref.current)
      return

    if (!config?.enabled) {
      last_sent_cities_ref.current = []
      last_sent_enabled_ref.current = false
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

    last_sent_cities_ref.current = cities
    last_sent_enabled_ref.current = true
    last_sent_year_ref.current = year
    worker_ref.current.postMessage({
      cities: cities as any,
      type: 'SET_DATA',
      year,
    } as WorkerInMessage)
  }, [cities, year, config?.enabled])

  //3. Dispatch layout computation on camera/viewport change (immediate for data/config changes, 48ms throttle for drags)
  useEffect(() => {
    if (last_projection_ref.current !== projection) {
      last_projection_ref.current = projection
      set_points([])
      set_labels([])
      set_binary_attributes(undefined)
    }

    if (!config?.enabled || cities.length === 0) {
      set_points([])
      set_labels([])
      set_binary_attributes(undefined)
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
      projection,
    ])
    let is_non_view_change = Boolean(
      last_dispatched_cities_ref.current !== cities ||
      last_dispatched_year_ref.current !== year ||
      last_dispatched_opts_key_ref.current !== opts_key
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
        isHalo: config.halo !== false && !config.filled,
        isMobile: Boolean(window_w < 768),
        labelCollision: config.labelCollision !== false,
        largeCityContrast: config.largeCityContrast ?? 1.0,
        opacity: (config.opacity !== undefined) ? config.opacity : 0.7,
        populationPalette: population_palette,
        projection,
        regionPalette: region_palette,
        reqId: current_req_id,
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
    projection,
    view_state,
  ])

  //Return statement
  return {
    binaryAttributes: binary_attributes,
    isCalculating: is_calculating,
    labels,
    points,
  }
}
