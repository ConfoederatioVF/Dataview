import { useState, useEffect, useRef, useCallback } from 'react'
import { CLIENT_STADESTER_SCALING } from '../../../common/optimisation/stadester_scaling_client.ts'
import { CityPoint, CityFullRecord, StadesterConfig, StadesterDatasetId } from '@framework/geopng/types.ts'
import { computeViewportBoundingBox } from '@framework/stadester/stadester_heuristics.ts'
import { resolveDefaultStadesterDataset } from '@framework/stadester/stadester_versions.ts'
import {
  buildCappedViewportCities,
  decodeBinaryCitiesWire,
  getBBoxLonSpan,
  isGeoBBoxContained,
  scaleGeoBBox,
} from '@framework/stadester/stadester_wire_decoder.ts'
import { STADESTER_CONFIG } from '@common'

export { decodeBinaryCitiesWire }

export interface UseStadesterCitiesParams {
  colorMode?: 'growth' | 'population' | 'continent'
  config?: StadesterConfig
  dataset?: StadesterDatasetId
  day?: number
  enabled?: boolean
  isPlaying?: boolean
  maxCities?: number
  minPop?: number
  month?: number
  performantMode?: boolean
  selectedCityKey?: string | null
  year: number
}

export interface UseStadesterCitiesResult {
  cities: CityPoint[]
  error: string | null
  fetchFullCityRecord: (arg0_key: string) => Promise<CityFullRecord | null>
  isLoading: boolean
  selectedCity: CityFullRecord | null
  selectedCityKey: string | null
  setSelectedCity: (arg0_city: CityFullRecord | null) => void
  setSelectedCityKey: (arg0_key: string | null) => void
}

let in_flight_city_fetches = new Map<string, Promise<CityPoint[]>>()

/**
 * Fetches Stadester city points for a given dataset and year with in-flight deduplication and caching.
 *
 * @param {string} arg0_dataset
 * @param {number} arg1_year
 * @param {number} [arg2_min_pop=0.01]
 * @param {number} [arg3_max_cities=4000]
 * @param {string} [arg4_color_mode='growth']
 * @param {Map<string, CityPoint[]>} [arg5_cache]
 * @param {boolean} [arg6_is_playing]
 * @param {boolean} [arg7_performant_mode]
 * @param {AbortSignal} [arg8_signal]
 * @param {(arg0_cities: CityPoint[], arg1_is_done: boolean) => void} [arg9_on_progress]
 * @param {[number, number, number, number]} [arg10_bbox]
 *
 * @returns {Promise<CityPoint[]>}
 */
export async function fetchStadesterCitiesAsync (
  arg0_dataset: string,
  arg1_year: number,
  arg2_min_pop?: number,
  arg3_max_cities?: number,
  arg4_color_mode?: string,
  arg5_cache?: Map<string, CityPoint[]>,
  arg6_is_playing?: boolean,
  arg7_performant_mode?: boolean,
  arg8_signal?: AbortSignal,
  arg9_on_progress?: (arg0_cities: CityPoint[], arg1_is_done: boolean) => void,
  arg10_bbox?: [number, number, number, number]
): Promise<CityPoint[]> {
  //Convert from parameters
  let bbox = arg10_bbox
  let dataset = arg0_dataset || resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester)
  let year = arg1_year
  let min_pop = (arg2_min_pop !== undefined) ? Math.max(0.01, arg2_min_pop) : 0.01
  let max_cities = (arg3_max_cities !== undefined) ? arg3_max_cities : 4000
  let color_mode = arg4_color_mode || 'growth'
  let cache = arg5_cache
  let is_playing = Boolean(arg6_is_playing)
  let on_progress = arg9_on_progress
  let performant_mode = Boolean(arg7_performant_mode)
  let signal = arg8_signal

  //Declare local instance variables
  let bbox_param = bbox ? bbox.map((arg0_v) => arg0_v.toFixed(3)).join(',') : ''
  let cache_key = bbox_param
    ? `${dataset}:${year}:${min_pop}:${max_cities}:${color_mode}:${bbox_param}`
    : `${dataset}:${year}:${min_pop}:${max_cities}:${color_mode}`
  let pending_promise: Promise<CityPoint[]>

  //Guard clauses
  if (cache && cache.has(cache_key))
    return cache.get(cache_key)!

  if (!signal && !on_progress && in_flight_city_fetches.has(cache_key))
    return in_flight_city_fetches.get(cache_key)!

  //Function body
  pending_promise = (async () => {
    try {
      let url_params = new URLSearchParams({
        colorMode: color_mode,
        dataset,
        format: 'bin',
        maxCities: String(max_cities),
        minPop: String(min_pop),
        year: String(year),
      })
      if (bbox_param)
        url_params.set('bbox', bbox_param)
      if (on_progress)
        url_params.set('stream', '1')

      let res = await fetch(`/api/stadester/cities.json?${url_params.toString()}`, { signal })
      if (!res.ok)
        return []

      let content_type = res.headers.get('content-type') || ''
      let is_bin_stream = res.headers.get('x-stadwire-stream') === '1'
      let city_list: CityPoint[] = []

      if (content_type.includes('application/octet-stream') && is_bin_stream && res.body) {
        let reader = res.body.getReader()
        let buf = new Uint8Array(0)
        let pending_count = 0

        for (;;) {
          let read_res = await reader.read()
          let value = read_res.value
          if (value && value.byteLength > 0) {
            if (buf.byteLength === 0) {
              buf = value
            } else {
              let combined = new Uint8Array(buf.byteLength + value.byteLength)
              combined.set(buf, 0)
              combined.set(value, buf.byteLength)
              buf = combined
            }

            let cursor = 0
            let decoded_any = false
            while (cursor + 4 <= buf.byteLength) {
              let frame_view = new DataView(buf.buffer, buf.byteOffset + cursor, 4)
              let frame_len = frame_view.getUint32(0, true)
              if (cursor + 4 + frame_len > buf.byteLength)
                break
              let frame_ab = buf.slice(cursor + 4, cursor + 4 + frame_len).buffer
              let chunk_cities = decodeBinaryCitiesWire(frame_ab)
              cursor += 4 + frame_len
              if (chunk_cities && chunk_cities.length > 0) {
                for (let k = 0; k < chunk_cities.length; k++)
                  city_list.push(chunk_cities[k])
                pending_count += chunk_cities.length
                decoded_any = true
              }
            }
            if (cursor > 0)
              buf = cursor < buf.byteLength ? buf.slice(cursor) : new Uint8Array(0)

            if (decoded_any && on_progress && pending_count > 0 && !signal?.aborted) {
              on_progress([...city_list], Boolean(read_res.done))
              pending_count = 0
            }
          }

          if (read_res.done)
            break
        }
      } else if (content_type.includes('application/octet-stream')) {
        let ab = await res.arrayBuffer()
        let decoded = decodeBinaryCitiesWire(ab)
        if (decoded)
          city_list = decoded
      } else {
        let data = await res.json()

        if (data.coords && data.keys) {
          let count = data.count || data.keys.length
          for (let i = 0; i < count; i++) {
            if (data.pops[i] < 0.01)
              continue
            let is_cap = data.capitals ? Boolean(data.capitals[i]) : false
            let cap_state_id = data.capital_state_ids ? (data.capital_state_ids[i] || undefined) : undefined
            city_list.push({
              capitalColor: data.capital_colors ? data.capital_colors[i] : undefined,
              capitalOf: data.capital_names ? (data.capital_names[i] || undefined) : undefined,
              capitalStateId: cap_state_id,
              capital_color: data.capital_colors ? data.capital_colors[i] : undefined,
              capital_state_id: cap_state_id,
              capital_state_name: data.capital_names ? (data.capital_names[i] || undefined) : undefined,
              coords: [data.coords[i * 2], data.coords[i * 2 + 1]],
              country: data.countries ? data.countries[i] : undefined,
              growthRate: data.growth ? data.growth[i] : 0,
              id: data.keys[i],
              isCapital: is_cap,
              is_capital: is_cap,
              key: data.keys[i],
              name: data.names[i],
              other_names: (data.other_names && data.other_names[i]) ? data.other_names[i] : undefined,
              population: data.pops[i],
              region: data.regions ? data.regions[i] : undefined,
            })
          }
        } else if (Array.isArray(data.cities)) {
          city_list = data.cities
            .filter((arg0_c: any) => arg0_c && arg0_c.population >= 0.01)
            .map((arg0_c: any) => ({
              ...arg0_c,
              capitalColor: arg0_c.capital_color || arg0_c.capitalColor || undefined,
              capitalOf: arg0_c.capitalOf || arg0_c.capital_state_name || undefined,
              capitalStateId: arg0_c.capital_state_id || arg0_c.capitalStateId || undefined,
              capital_color: arg0_c.capital_color || arg0_c.capitalColor || undefined,
              capital_state_id: arg0_c.capital_state_id || arg0_c.capitalStateId || undefined,
              capital_state_name: arg0_c.capital_state_name || arg0_c.capitalOf || undefined,
              isCapital: Boolean(arg0_c.is_capital || arg0_c.isCapital),
              is_capital: Boolean(arg0_c.is_capital || arg0_c.isCapital),
            }))
        }
      }

      if (cache && !signal?.aborted) {
        let max_cache_size = (performant_mode || is_playing) ? 5 : 15
        while (cache.size >= max_cache_size) {
          let first_key = cache.keys().next().value
          if (first_key)
            cache.delete(first_key)
          else
            break
        }
        cache.set(cache_key, city_list)
      }

      return city_list
    } catch (arg0_err: any) {
      if (arg0_err?.name === 'AbortError')
        return []
      console.error('[fetchStadesterCitiesAsync] Error fetching cities:', arg0_err)
      return []
    } finally {
      in_flight_city_fetches.delete(cache_key)
    }
  })()

  if (!signal && !on_progress)
    in_flight_city_fetches.set(cache_key, pending_promise)

  //Return statement
  return pending_promise
}

/**
 * Hook to stream and manage Stadestér historical cities data with client-side caching.
 *
 * @param {UseStadesterCitiesParams} arg0_options
 *
 * @returns {UseStadesterCitiesResult}
 */
export let useStadesterCities = function (arg0_options: UseStadesterCitiesParams): UseStadesterCitiesResult {
  //Convert from parameters
  let options = (arg0_options) ? arg0_options : ({} as UseStadesterCitiesParams)
  let cfg = options.config
  let color_mode = cfg?.colorMode || options.colorMode || 'growth'
  let dataset = cfg?.dataset || options.dataset || resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester)
  let enabled = (cfg !== undefined) ? cfg.enabled : Boolean(options.enabled)
  let is_playing = Boolean(options.isPlaying)
  let max_cities = (cfg?.maxCities !== undefined) ? cfg.maxCities : ((options.maxCities !== undefined) ? options.maxCities : 4000)
  let min_pop = (cfg?.minPop !== undefined) ? Math.max(0.01, cfg.minPop) : ((options.minPop !== undefined) ? Math.max(0.01, options.minPop) : 0.01)
  let performant_mode = Boolean(options.performantMode)
  let year = (options.year !== undefined) ? options.year : 1950

  //Declare local instance variables
  let abort_controller_ref: React.MutableRefObject<AbortController | null>
  let cities: CityPoint[]
  let client_cache_ref: React.MutableRefObject<Map<string, CityPoint[]>>
  let error: string | null
  let fetch_full_city_record: (arg0_key: string) => Promise<CityFullRecord | null>
  let full_city_cache_ref: React.MutableRefObject<Map<string, CityFullRecord>>
  let is_loading: boolean
  let selected_city: CityFullRecord | null
  let selected_city_key: string | null
  let set_cities: React.Dispatch<React.SetStateAction<CityPoint[]>>
  let set_error: React.Dispatch<React.SetStateAction<string | null>>
  let set_is_loading: React.Dispatch<React.SetStateAction<boolean>>
  let set_selected_city: React.Dispatch<React.SetStateAction<CityFullRecord | null>>
  let set_selected_city_key: React.Dispatch<React.SetStateAction<string | null>>

  //Function body
  ;[cities, set_cities] = useState<CityPoint[]>([])
  ;[is_loading, set_is_loading] = useState<boolean>(false)
  ;[error, set_error] = useState<string | null>(null)
  ;[selected_city, set_selected_city] = useState<CityFullRecord | null>(null)
  ;[selected_city_key, set_selected_city_key] = useState<string | null>(null)

  abort_controller_ref = useRef<AbortController | null>(null)
  client_cache_ref = useRef<Map<string, CityPoint[]>>(new Map())
  full_city_cache_ref = useRef<Map<string, CityFullRecord>>(new Map())

  //Clear cached city points when layer configuration changes or is disabled
  useEffect(() => {
    client_cache_ref.current.clear()
    if (!enabled)
      set_cities([])
  }, [dataset, min_pop, max_cities, color_mode, enabled])

  useEffect(() => {
    if (options.selectedCityKey !== undefined) {
      set_selected_city_key(options.selectedCityKey)
    }
  }, [options.selectedCityKey])

  //Fetch cities for active year
  useEffect(() => {
    if (!enabled) {
      set_cities([])
      set_is_loading(false)
      return
    }

    let is_cancelled = false
    let prefetch_timer: NodeJS.Timeout | null = null
    let rounded_year = Math.round(year)
    let cache_key = `${dataset}:${rounded_year}:${min_pop}:${max_cities}:${color_mode}`

    let schedule_prefetch = function () {
      if (!is_playing && !performant_mode && max_cities > 0 && max_cities <= 8000) {
        if (prefetch_timer)
          clearTimeout(prefetch_timer)
        prefetch_timer = setTimeout(() => {
          if (!is_cancelled) {
            fetchStadesterCitiesAsync(dataset, rounded_year + 1, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode).catch(() => {})
            fetchStadesterCitiesAsync(dataset, rounded_year + 2, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode).catch(() => {})
          }
        }, 500)
      }
    }

    if (client_cache_ref.current.has(cache_key)) {
      set_cities(client_cache_ref.current.get(cache_key)!)
      set_error(null)
      set_is_loading(false)
      schedule_prefetch()
      return () => {
        is_cancelled = true
        if (prefetch_timer)
          clearTimeout(prefetch_timer)
      }
    }

    if (abort_controller_ref.current)
      abort_controller_ref.current.abort()
    let controller = new AbortController()
    abort_controller_ref.current = controller

    set_is_loading(true)
    set_error(null)

    let stream_threshold = CLIENT_STADESTER_SCALING.stream_min_cities_threshold
    let use_stream_progress = CLIENT_STADESTER_SCALING.enable_progressive_streaming &&
      (max_cities === 0 || max_cities >= stream_threshold)
    let last_progress_count = -1

    fetchStadesterCitiesAsync(
      dataset,
      rounded_year,
      min_pop,
      max_cities,
      color_mode,
      client_cache_ref.current,
      is_playing,
      performant_mode,
      controller.signal,
      use_stream_progress
        ? (arg0_partial_cities) => {
            if (!is_cancelled) {
              last_progress_count = arg0_partial_cities.length
              set_cities(arg0_partial_cities)
              set_is_loading(false)
            }
          }
        : undefined
    )
      .then((arg0_list) => {
        if (!is_cancelled) {
          if (last_progress_count !== arg0_list.length)
            set_cities(arg0_list)
          set_is_loading(false)
          schedule_prefetch()
        }
      })
      .catch((arg0_err) => {
        if (!is_cancelled) {
          set_error(arg0_err?.message || 'Error loading cities')
          set_is_loading(false)
        }
      })

    return () => {
      is_cancelled = true
      controller.abort()
      if (prefetch_timer)
        clearTimeout(prefetch_timer)
    }
  }, [enabled, dataset, Math.round(year), min_pop, max_cities, color_mode, is_playing, performant_mode])

  let effective_city_key = (options.selectedCityKey !== undefined) ? options.selectedCityKey : selected_city_key

  //Fetch full city details when selected
  fetch_full_city_record = useCallback(async function (arg0_key: string) {
    let key = arg0_key
    if (!key)
      return null

    let day = options.day
    let month = options.month
    let full_cache_key = `${dataset}:${key}:${year}:${month ?? ''}:${day ?? ''}`
    if (full_city_cache_ref.current.has(full_cache_key))
      return full_city_cache_ref.current.get(full_cache_key)!

    try {
      let url = `/api/stadester/city?dataset=${encodeURIComponent(dataset)}&key=${encodeURIComponent(key)}&year=${encodeURIComponent(String(year))}`
      if (month !== undefined)
        url += `&month=${encodeURIComponent(String(month))}`
      if (day !== undefined)
        url += `&day=${encodeURIComponent(String(day))}`
      let resp = await fetch(url)
      if (!resp.ok)
        return null
      let data: CityFullRecord = await resp.json()
      if (full_city_cache_ref.current.size >= 25) {
        let first_key = full_city_cache_ref.current.keys().next().value
        if (first_key)
          full_city_cache_ref.current.delete(first_key)
      }
      full_city_cache_ref.current.set(full_cache_key, data)
      return data
    } catch (arg0_e) {
      console.error('[useStadesterCities] Failed to fetch full city record:', arg0_e)
      return null
    }
  }, [dataset, year, options.month, options.day])

  useEffect(() => {
    if (!effective_city_key) {
      set_selected_city(null)
      return
    }

    let is_cancelled = false
    set_selected_city((arg0_prev) => (arg0_prev?.key === effective_city_key ? arg0_prev : null))
    fetch_full_city_record(effective_city_key).then((arg0_data) => {
      if (!is_cancelled && arg0_data)
        set_selected_city(arg0_data)
    })

    return () => {
      is_cancelled = true
    }
  }, [effective_city_key, fetch_full_city_record])

  //Return statement
  return {
    cities,
    error,
    fetchFullCityRecord: fetch_full_city_record,
    isLoading: is_loading,
    selectedCity: selected_city,
    selectedCityKey: selected_city_key,
    setSelectedCity: set_selected_city,
    setSelectedCityKey: set_selected_city_key,
  }
}


interface CachedViewportBBoxEntry {
  bbox: [number, number, number, number]
  cities: CityPoint[]
  meta_key: string
  zoom: number
}

/**
 * Streams a unified viewport bounding box query via `/api/stadester/cities.json` when zoomed in,
 * loading up to `config.maxCities` settlements by largest population first without tile boundary clipping.
 *
 * @param {{ baseCities: CityPoint[]; config?: StadesterConfig; enabled: boolean; isPlaying?: boolean; projection: string; viewState: any; year: number }} arg0_options
 *
 * @returns {CityPoint[]}
 */
export let useStadesterViewportTiles = function (arg0_options: {
  baseCities: CityPoint[]
  config?: StadesterConfig
  enabled: boolean
  isPlaying?: boolean
  projection: string
  viewState: any
  year: number
}): CityPoint[] {
  //Convert from parameters
  let options = arg0_options
  let base_cities = options.baseCities
  let cfg = options.config
  let enabled = options.enabled
  let is_playing = Boolean(options.isPlaying)
  let projection = options.projection
  let view_state = options.viewState
  let year = Math.round(options.year || 1950)

  //Declare local instance variables
  let abort_ref = useRef<AbortController | null>(null)
  let base_cities_ref = useRef<CityPoint[]>(base_cities)
  let color_mode = cfg?.colorMode || 'growth'
  let dataset = cfg?.dataset || resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester)
  let in_flight_ref = useRef<{ bbox: [number, number, number, number]; meta_key: string; zoom: number } | null>(null)
  let is_cartesian = projection === 'EqualEarth' || projection === 'Equirectangular'
  let loaded_state_ref = useRef<CachedViewportBBoxEntry | null>(null)
  let max_cities = (cfg?.maxCities !== undefined) ? cfg.maxCities : 4000
  let [merged_cities, set_merged_cities] = useState<CityPoint[]>(base_cities)
  let min_pop = (cfg?.minPop !== undefined) ? Math.max(0.01, cfg.minPop) : 0.01
  let meta_key = `${dataset}:${year}:${color_mode}:${min_pop}:${max_cities}`
  let timer_ref = useRef<any>(null)
  let viewport_cache_ref = useRef<CachedViewportBBoxEntry[]>([])
  let zoom = view_state?.zoom ?? (projection === 'Globe' ? 3 : 1.2)
  let norm_zoom = is_cartesian ? zoom - 1.2 : (projection === 'Globe' ? zoom - 1.65 : zoom)
  let is_viewport_active = Boolean(enabled && !is_playing && max_cities > 0 && norm_zoom >= 3.5 && view_state)

  let cancelPendingViewportFetch = useCallback(function () {
    if (timer_ref.current) {
      clearTimeout(timer_ref.current)
      timer_ref.current = null
    }
    if (abort_ref.current) {
      abort_ref.current.abort()
      abort_ref.current = null
    }
    in_flight_ref.current = null
  }, [])

  //Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelPendingViewportFetch()
    }
  }, [cancelPendingViewportFetch])

  //Keep merged_cities synced with base_cities without aborting active viewport streams or re-allocating on pan
  useEffect(() => {
    base_cities_ref.current = base_cities
    if (!is_viewport_active) {
      set_merged_cities(base_cities)
      return
    }
    let loaded = loaded_state_ref.current
    if (loaded && loaded.meta_key === meta_key) {
      if (max_cities > 0 && loaded.cities.length >= max_cities)
        return
      set_merged_cities(buildCappedViewportCities(loaded.cities, base_cities, max_cities))
    } else {
      set_merged_cities(base_cities)
    }
  }, [base_cities, is_viewport_active, max_cities, meta_key])

  //Spatial viewport streaming over a unified padded bounding box
  useEffect(() => {
    if (!is_viewport_active) {
      cancelPendingViewportFetch()
      loaded_state_ref.current = null
      return
    }

    let window_w = (typeof window !== 'undefined') ? window.innerWidth : 1920
    let window_h = (typeof window !== 'undefined') ? window.innerHeight : 1080
    let raw_bbox = computeViewportBoundingBox(view_state, projection, window_w, window_h)
    let raw_lon_span = getBBoxLonSpan(raw_bbox[0], raw_bbox[2])
    let raw_lat_span = raw_bbox[3] - raw_bbox[1]

    if (raw_lon_span >= 180 && raw_lat_span >= 120) {
      cancelPendingViewportFetch()
      loaded_state_ref.current = null
      set_merged_cities(base_cities_ref.current)
      return
    }

    let inner_bbox = scaleGeoBBox(raw_bbox, 0.8)
    let loaded = loaded_state_ref.current
    if (
      loaded &&
      loaded.meta_key === meta_key &&
      Math.abs(norm_zoom - loaded.zoom) < 0.5 &&
      isGeoBBoxContained(inner_bbox, loaded.bbox)
    ) {
      return
    }

    //Check LRU viewport cache before scheduling a network stream
    for (let i = viewport_cache_ref.current.length - 1; i >= 0; i--) {
      let entry = viewport_cache_ref.current[i]
      if (
        entry.meta_key === meta_key &&
        Math.abs(norm_zoom - entry.zoom) < 0.5 &&
        isGeoBBoxContained(inner_bbox, entry.bbox)
      ) {
        cancelPendingViewportFetch()
        loaded_state_ref.current = entry
        set_merged_cities(buildCappedViewportCities(entry.cities, base_cities_ref.current, max_cities))
        return
      }
    }

    //Keep current in-flight fetch alive if it still covers the viewport
    let inflight = in_flight_ref.current
    if (
      inflight &&
      inflight.meta_key === meta_key &&
      Math.abs(norm_zoom - inflight.zoom) < 0.5 &&
      isGeoBBoxContained(inner_bbox, inflight.bbox)
    ) {
      return
    }

    cancelPendingViewportFetch()

    let fetch_bbox = scaleGeoBBox(raw_bbox, 1.2)
    let controller = new AbortController()
    abort_ref.current = controller
    in_flight_ref.current = {
      bbox: fetch_bbox,
      meta_key,
      zoom: norm_zoom,
    }

    timer_ref.current = setTimeout(() => {
      timer_ref.current = null
      if (controller.signal.aborted)
        return

      fetchStadesterCitiesAsync(
        dataset,
        year,
        min_pop,
        max_cities,
        color_mode,
        undefined,
        is_playing,
        false,
        controller.signal,
        (arg0_partial_cities) => {
          if (controller.signal.aborted)
            return
          let partial_entry: CachedViewportBBoxEntry = {
            bbox: fetch_bbox,
            cities: arg0_partial_cities,
            meta_key,
            zoom: norm_zoom,
          }
          loaded_state_ref.current = partial_entry
          set_merged_cities(buildCappedViewportCities(arg0_partial_cities, base_cities_ref.current, max_cities))
        },
        fetch_bbox
      )
        .then((arg0_final_cities) => {
          if (controller.signal.aborted)
            return
          in_flight_ref.current = null
          let final_entry: CachedViewportBBoxEntry = {
            bbox: fetch_bbox,
            cities: arg0_final_cities,
            meta_key,
            zoom: norm_zoom,
          }
          if (viewport_cache_ref.current.length >= 25)
            viewport_cache_ref.current.shift()
          viewport_cache_ref.current.push(final_entry)
          loaded_state_ref.current = final_entry
          set_merged_cities(buildCappedViewportCities(arg0_final_cities, base_cities_ref.current, max_cities))
        })
        .catch(() => {
          if (!controller.signal.aborted)
            in_flight_ref.current = null
        })
    }, 120)
  }, [
    cancelPendingViewportFetch,
    color_mode,
    dataset,
    is_playing,
    is_viewport_active,
    max_cities,
    meta_key,
    min_pop,
    norm_zoom,
    projection,
    view_state,
    year,
  ])

  //Return statement
  return merged_cities
}
