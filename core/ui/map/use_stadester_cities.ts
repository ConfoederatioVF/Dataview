import { useState, useEffect, useRef, useCallback } from 'react'
import { CityPoint, CityFullRecord, StadesterConfig } from '@framework/geopng/types.ts'

export interface UseStadesterCitiesParams {
  colorMode?: 'growth' | 'population' | 'continent'
  config?: StadesterConfig
  dataset?: 'stadester_1.1' | 'stadester_1.0'
  enabled?: boolean
  isPlaying?: boolean
  maxCities?: number
  minPop?: number
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
  arg7_performant_mode?: boolean
): Promise<CityPoint[]> {
  //Convert from parameters
  let dataset = arg0_dataset || 'stadester_1.1'
  let year = Math.round(arg1_year)
  let min_pop = (arg2_min_pop !== undefined) ? Math.max(0.01, arg2_min_pop) : 0.01
  let max_cities = (arg3_max_cities !== undefined) ? arg3_max_cities : 4000
  let color_mode = arg4_color_mode || 'growth'
  let cache = arg5_cache
  let is_playing = Boolean(arg6_is_playing)
  let performant_mode = Boolean(arg7_performant_mode)

  //Declare local instance variables
  let cache_key = `${dataset}:${year}:${min_pop}:${max_cities}:${color_mode}`
  let pending_promise: Promise<CityPoint[]>

  //Guard clauses
  if (cache && cache.has(cache_key))
    return cache.get(cache_key)!

  if (in_flight_city_fetches.has(cache_key))
    return in_flight_city_fetches.get(cache_key)!

  //Function body
  pending_promise = (async () => {
    try {
      let url_params = new URLSearchParams({
        colorMode: color_mode,
        dataset,
        format: 'compact',
        maxCities: String(max_cities),
        minPop: String(min_pop),
        year: String(year),
      })

      let res = await fetch(`/api/stadester/cities?${url_params.toString()}`)
      if (!res.ok)
        return []

      let data = await res.json()
      let city_list: CityPoint[] = []

      if (data.coords && data.keys) {
        let count = data.count || data.keys.length
        for (let i = 0; i < count; i++) {
          if (data.pops[i] < 0.01)
            continue
          city_list.push({
            coords: [data.coords[i * 2], data.coords[i * 2 + 1]],
            country: data.countries ? data.countries[i] : undefined,
            growthRate: data.growth ? data.growth[i] : 0,
            id: data.keys[i],
            key: data.keys[i],
            name: data.names[i],
            population: data.pops[i],
            region: data.regions ? data.regions[i] : undefined,
          })
        }
      } else if (Array.isArray(data.cities)) {
        city_list = data.cities.filter((arg0_c: CityPoint) => arg0_c && arg0_c.population >= 0.01)
      }

      if (cache) {
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
    } catch (arg0_err) {
      console.error('[fetchStadesterCitiesAsync] Error fetching cities:', arg0_err)
      return []
    } finally {
      in_flight_city_fetches.delete(cache_key)
    }
  })()

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
  let dataset = cfg?.dataset || options.dataset || 'stadester_1.1'
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

    let rounded_year = Math.round(year)
    let cache_key = `${dataset}:${rounded_year}:${min_pop}:${max_cities}:${color_mode}`

    if (client_cache_ref.current.has(cache_key)) {
      set_cities(client_cache_ref.current.get(cache_key)!)
      set_error(null)
      set_is_loading(false)

      if (!is_playing && !performant_mode) {
        fetchStadesterCitiesAsync(dataset, rounded_year + 1, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode).catch(() => {})
        fetchStadesterCitiesAsync(dataset, rounded_year + 2, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode).catch(() => {})
      }
      return
    }

    let is_cancelled = false
    set_is_loading(true)
    set_error(null)

    fetchStadesterCitiesAsync(dataset, rounded_year, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode)
      .then((arg0_list) => {
        if (!is_cancelled) {
          set_cities(arg0_list)
          set_is_loading(false)

          if (!is_playing && !performant_mode) {
            fetchStadesterCitiesAsync(dataset, rounded_year + 1, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode).catch(() => {})
            fetchStadesterCitiesAsync(dataset, rounded_year + 2, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode).catch(() => {})
          }
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
    }
  }, [enabled, dataset, Math.round(year), min_pop, max_cities, color_mode, is_playing, performant_mode])

  let effective_city_key = (options.selectedCityKey !== undefined) ? options.selectedCityKey : selected_city_key

  //Fetch full city details when selected
  fetch_full_city_record = useCallback(async function (arg0_key: string) {
    let key = arg0_key
    if (!key)
      return null

    let full_cache_key = `${dataset}:${key}:${year}`
    if (full_city_cache_ref.current.has(full_cache_key))
      return full_city_cache_ref.current.get(full_cache_key)!

    try {
      let resp = await fetch(
        `/api/stadester/city?dataset=${encodeURIComponent(dataset)}&key=${encodeURIComponent(key)}&year=${encodeURIComponent(String(year))}`
      )
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
  }, [dataset, year])

  useEffect(() => {
    if (!effective_city_key) {
      set_selected_city(null)
      return
    }

    let is_cancelled = false
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
