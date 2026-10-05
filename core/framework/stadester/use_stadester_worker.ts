import { useState, useEffect, useRef } from 'react'
import { CityPoint, StadesterConfig, ProjectionType } from '@framework/geopng/types.ts'
import type {
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
  let debounce_timer_ref = useRef<any>(null)
  let is_calculating: boolean
  let labels: WorkerPlacedLabel[]
  let last_projection_ref = useRef<ProjectionType>(projection)
  let points: WorkerProcessedPoint[]
  let req_id_ref = useRef<number>(0)
  let set_is_calculating: React.Dispatch<React.SetStateAction<boolean>>
  let set_labels: React.Dispatch<React.SetStateAction<WorkerPlacedLabel[]>>
  let set_points: React.Dispatch<React.SetStateAction<WorkerProcessedPoint[]>>
  let worker_ref = useRef<Worker | null>(null)

  //Function body
  ;[points, set_points] = useState<WorkerProcessedPoint[]>([])
  ;[labels, set_labels] = useState<WorkerPlacedLabel[]>([])
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
            set_points(msg.points)
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
      if (worker)
        worker.terminate()
      worker_ref.current = null
    }
  }, [])

  //2. Update dataset on year/cities change
  useEffect(() => {
    if (!worker_ref.current)
      return

    if (!config?.enabled) {
      worker_ref.current.postMessage({
        cities: [],
        type: 'SET_DATA',
        year: 0,
      } as WorkerInMessage)
      return
    }

    worker_ref.current.postMessage({
      cities: cities as any,
      type: 'SET_DATA',
      year,
    } as WorkerInMessage)
  }, [cities, year, config?.enabled])

  //3. Dispatch layout computation on camera/viewport change
  useEffect(() => {
    if (last_projection_ref.current !== projection) {
      last_projection_ref.current = projection
      set_points([])
      set_labels([])
    }

    if (!config?.enabled || cities.length === 0) {
      set_points([])
      set_labels([])
      set_is_calculating(false)
      return
    }

    if (!worker_ref.current)
      return

    let current_req_id = ++req_id_ref.current

    if (debounce_timer_ref.current)
      clearTimeout(debounce_timer_ref.current)

    debounce_timer_ref.current = setTimeout(() => {
      set_is_calculating(true)
      let window_h = (typeof window !== 'undefined') ? window.innerHeight : 1080
      let window_w = (typeof window !== 'undefined') ? window.innerWidth : 1920

      worker_ref.current?.postMessage({
        bubbleSize: config.bubbleSize ?? 1.0,
        colorMode: config.colorMode || 'growth',
        displayOptions: config.display_options,
        heuristicCulling: (config.heuristicCulling !== undefined)
          ? Boolean(config.heuristicCulling)
          : Boolean(window_w < 768),
        isHalo: config.halo !== false && !config.filled,
        isMobile: Boolean(window_w < 768),
        labelCollision: config.labelCollision !== false,
        largeCityContrast: config.largeCityContrast ?? 1.0,
        projection,
        reqId: current_req_id,
        showLabels: config.showLabels !== false,
        type: 'LAYOUT_VIEWPORT',
        viewState: view_state,
        windowH: window_h,
        windowW: window_w,
      } as WorkerInMessage)
    }, 16) // Debounce by ~1 frame to prevent flooding during fast drags

    return () => {
      if (debounce_timer_ref.current)
        clearTimeout(debounce_timer_ref.current)
    }
  }, [
    cities,
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
    config?.showLabels,
    projection,
    view_state,
  ])

  //Return statement
  return {
    isCalculating: is_calculating,
    labels,
    points,
  }
}
