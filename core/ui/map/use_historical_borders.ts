import { useState, useEffect, useRef, useCallback } from 'react'
import type { HistoricalBorderFeature, HistoricalBordersResponse } from '@server/AtlasBordersService'
import { UfDate } from '@framework/utils/uf_date'

export interface HistoricalBordersHookResult {
  bordersData: {
    count?: number
    date?: string
    features: HistoricalBorderFeature[]
    tag?: string
    type: 'FeatureCollection'
    year?: number
    [key: string]: any
  } | null
  domain: [number, number] | null
  error: string | null
  isLoading: boolean
  source: 'cshapes' | 'naissance' | null
  year: number
}

let client_borders_cache = new Map<string, HistoricalBordersResponse>()

/**
 * Asynchronously fetches and caches historical borders for a given temporal key.
 *
 * @param {string} arg0_dataset
 * @param {number} arg1_year
 * @param {number} [arg2_month=1]
 * @param {number} [arg3_day=1]
 * @param {AbortSignal} [arg4_signal]
 *
 * @returns {Promise<HistoricalBordersResponse>}
 */
export let fetchHistoricalBordersAsync = async function (
  arg0_dataset: string,
  arg1_year: number,
  arg2_month: number = 1,
  arg3_day: number = 1,
  arg4_signal?: AbortSignal
): Promise<HistoricalBordersResponse> {
  //Convert from parameters
  let dataset = arg0_dataset
  let day = arg3_day
  let month = arg2_month
  let signal = arg4_signal
  let year = arg1_year

  //Declare local instance variables
  let cache_key = `${dataset}:${year}-${month}-${day}`
  let data: HistoricalBordersResponse
  let max_cache_size: number
  let oldest_k: string | undefined
  let res: Response
  let url: string

  //Guard clauses
  if (client_borders_cache.has(cache_key))
    return client_borders_cache.get(cache_key)!

  //Function body
  url = `/api/atlas/borders?year=${year}&dataset=${dataset}&day=${day}&month=${month}`
  res = await fetch(url, { signal })
  if (!res.ok)
    throw new Error(`HTTP error ${res.status}`)

  data = await res.json()
  let collection: {
    count?: number
    date?: string
    features: HistoricalBorderFeature[]
    tag?: string
    type: 'FeatureCollection'
    year?: number
    [key: string]: any
  } = {
    count: data.count,
    date: data.date || data.features[0]?.properties?.date,
    features: data.features,
    tag: cache_key,
    type: 'FeatureCollection',
    year: data.year,
  }
  ;(data as any).collection = collection

  //Cap client-side cache
  max_cache_size = 160
  while (client_borders_cache.size >= max_cache_size) {
    oldest_k = client_borders_cache.keys().next().value
    if (oldest_k) {
      client_borders_cache.delete(oldest_k)
    } else {
      break
    }
  }

  client_borders_cache.set(cache_key, data)

  //Return statement
  return data
}

/**
 * Hook to asynchronously fetch and cache historical borders from CShapes-2.0 and atlas.naissance.
 * Operates a single-in-flight background queue during timelapse playback to prevent network saturation,
 * whilst providing instant responsive updates on playback stop and timeline scrubbing.
 *
 * @param {string | null} [arg0_active_layer_id]
 * @param {number} arg1_timeline_year
 * @param {boolean} [arg2_enabled=false]
 * @param {string} [arg3_dataset]
 * @param {{ isPlaying?: boolean; snapToKeyframes?: boolean } | boolean} [arg4_options]
 *
 * @returns {HistoricalBordersHookResult}
 */
export let useHistoricalBorders = function (
  arg0_active_layer_id?: string | null,
  arg1_timeline_year: number = 1950,
  arg2_enabled: boolean = false,
  arg3_dataset?: string,
  arg4_options?: { isPlaying?: boolean; snapToKeyframes?: boolean } | boolean
): HistoricalBordersHookResult {
  //Convert from parameters
  let active_layer_id = arg0_active_layer_id
  let custom_dataset = arg3_dataset
  let enabled = arg2_enabled
  let options = (typeof arg4_options === 'object' && arg4_options !== null) ? arg4_options : { isPlaying: Boolean(arg4_options) }
  let timeline_year = arg1_timeline_year

  //Declare local instance variables
  let active_controller_ref = useRef<AbortController | null>(null)
  let active_fetch_ref = useRef<boolean>(false)
  let borders_data: {
    count?: number
    date?: string
    features: HistoricalBorderFeature[]
    tag?: string
    type: 'FeatureCollection'
    year?: number
    [key: string]: any
  } | null
  let cache_key: string
  let dataset = custom_dataset || (active_layer_id && active_layer_id.includes('border') ? active_layer_id : 'statistical_borders')
  let debounce_timer_ref = useRef<NodeJS.Timeout | null>(null)
  let domain: [number, number] | null
  let effective_day: number
  let effective_month: number
  let effective_year: number
  let error: string | null
  let is_active: boolean
  let is_loading: boolean
  let is_playing = Boolean(options.isPlaying)
  let latest_target_ref = useRef<{
    cache_key: string
    dataset: string
    day: number
    is_playing: boolean
    month: number
    year: number
  }>({
    cache_key: '',
    dataset,
    day: 1,
    is_playing: false,
    month: 1,
    year: 1950,
  })
  let pump_queue: () => void
  let rendered_key_ref = useRef<string>('')
  let set_borders_data: React.Dispatch<React.SetStateAction<{
    count?: number
    date?: string
    features: HistoricalBorderFeature[]
    tag?: string
    type: 'FeatureCollection'
    year?: number
    [key: string]: any
  } | null>>
  let set_domain: React.Dispatch<React.SetStateAction<[number, number] | null>>
  let set_error: React.Dispatch<React.SetStateAction<string | null>>
  let set_is_loading: React.Dispatch<React.SetStateAction<boolean>>
  let set_source: React.Dispatch<React.SetStateAction<'cshapes' | 'naissance' | null>>
  let snap_to_keyframes = Boolean(options.snapToKeyframes)
  let source: 'cshapes' | 'naissance' | null
  let was_playing_ref = useRef<boolean>(is_playing)

  //Function body
  ;[borders_data, set_borders_data] = useState<{
    count?: number
    date?: string
    features: HistoricalBorderFeature[]
    tag?: string
    type: 'FeatureCollection'
    year?: number
    [key: string]: any
  } | null>(null)
  ;[domain, set_domain] = useState<[number, number] | null>(null)
  ;[error, set_error] = useState<string | null>(null)
  ;[is_loading, set_is_loading] = useState<boolean>(false)
  ;[source, set_source] = useState<'cshapes' | 'naissance' | null>(null)

  is_active = enabled || active_layer_id === 'statistical_borders' || active_layer_id === 'detailed_borders' || active_layer_id === 'simplified_borders' || Boolean(active_layer_id && active_layer_id.includes('border'))

  if (is_playing && !snap_to_keyframes) {
    effective_year = Math.round(timeline_year)
    effective_month = 1
    effective_day = 1
  } else {
    let date_obj = UfDate.fromFractionalYear(timeline_year)
    effective_year = date_obj.year
    effective_month = date_obj.month
    effective_day = date_obj.day
  }

  cache_key = `${dataset}:${effective_year}-${effective_month}-${effective_day}`

  pump_queue = useCallback(function () {
    let target = latest_target_ref.current

    //Guard clause: already rendered
    if (rendered_key_ref.current === target.cache_key && client_borders_cache.has(target.cache_key))
      return

    //1. Instant client-side cache hit
    if (client_borders_cache.has(target.cache_key)) {
      let cached = client_borders_cache.get(target.cache_key)!
      let coll = (cached as any).collection || {
        count: cached.count,
        date: cached.date || cached.features[0]?.properties?.date,
        features: cached.features,
        tag: target.cache_key,
        type: 'FeatureCollection',
        year: cached.year,
      }
      rendered_key_ref.current = target.cache_key
      set_borders_data(coll)
      set_domain(cached.domain)
      set_source(cached.source)
      set_is_loading(false)
      set_error(null)
      return
    }

    //2. If a fetch is already in flight
    if (active_fetch_ref.current) {
      if (!target.is_playing && active_controller_ref.current) {
        //User stopped or scrubbed: abort previous background request to free connection socket immediately
        active_controller_ref.current.abort()
        active_controller_ref.current = null
        active_fetch_ref.current = false
      } else {
        //Playback is actively running: let in-flight request complete smoothly; it will trigger the next target on finish
        return
      }
    }

    //3. Dispatch single in-flight network request
    active_fetch_ref.current = true
    let controller = new AbortController()
    active_controller_ref.current = controller

    let current_target = target
    let target_key = target.cache_key

    fetchHistoricalBordersAsync(current_target.dataset, current_target.year, current_target.month, current_target.day, controller.signal)
      .then((arg0_data) => {
        active_fetch_ref.current = false
        active_controller_ref.current = null

        let coll = (arg0_data as any).collection || {
          count: arg0_data.count,
          date: arg0_data.date || arg0_data.features[0]?.properties?.date,
          features: arg0_data.features,
          tag: target_key,
          type: 'FeatureCollection',
          year: arg0_data.year,
        }

        rendered_key_ref.current = target_key
        set_borders_data(coll)
        set_domain(arg0_data.domain)
        set_source(arg0_data.source)
        set_is_loading(false)
        set_error(null)

        //Pump next target if playhead has advanced during network transit
        let next_target = latest_target_ref.current
        if (next_target.cache_key !== target_key)
          pump_queue()
      })
      .catch((arg0_err: any) => {
        active_fetch_ref.current = false
        active_controller_ref.current = null

        if (arg0_err?.name === 'AbortError') {
          //Aborted intentionally to prioritize stopped or scrubbed target
          pump_queue()
          return
        }

        console.error('[useHistoricalBorders] Failed to load borders:', arg0_err)
        set_error(arg0_err?.message || 'Error loading historical borders')
        set_is_loading(false)
      })
  }, [])

  useEffect(() => {
    //Guard clauses
    if (!is_active) {
      if (active_controller_ref.current)
        active_controller_ref.current.abort()
      active_fetch_ref.current = false
      set_borders_data(null)
      set_is_loading(false)
      set_error(null)
      return
    }

    let just_stopped = was_playing_ref.current && !is_playing
    was_playing_ref.current = is_playing

    latest_target_ref.current = {
      cache_key,
      dataset,
      day: effective_day,
      is_playing,
      month: effective_month,
      year: effective_year,
    }

    //1. Instant client-side cache hit
    if (client_borders_cache.has(cache_key)) {
      pump_queue()
      return
    }

    //2. If playback just stopped, execute immediately without debounce delay
    if (just_stopped) {
      if (debounce_timer_ref.current)
        clearTimeout(debounce_timer_ref.current)
      pump_queue()
      return
    }

    //3. If playing, pump queue immediately (single-flight concurrency ensures no flooding)
    if (is_playing) {
      pump_queue()
      return
    }

    //4. If paused and scrubbing, debounce by 40ms to coalesce slider drag events
    if (debounce_timer_ref.current)
      clearTimeout(debounce_timer_ref.current)
    debounce_timer_ref.current = setTimeout(() => {
      pump_queue()
    }, 40)

    return () => {
      if (debounce_timer_ref.current)
        clearTimeout(debounce_timer_ref.current)
    }
  }, [cache_key, dataset, is_active, effective_year, effective_month, effective_day, is_playing, pump_queue])

  //Return statement
  return {
    bordersData: borders_data,
    domain,
    error,
    isLoading: is_loading,
    source,
    year: timeline_year,
  }
}
