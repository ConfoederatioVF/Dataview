import { useState, useEffect, useRef, useCallback } from 'react'
import { CityPoint, CityFullRecord, StadesterConfig, StadesterDatasetId } from '@framework/geopng/types.ts'
import { resolveDefaultStadesterDataset } from '@framework/stadester/stadester_versions.ts'
import { STADESTER_CONFIG } from '@common'

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
let text_decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null

/**
 * Unpacks a `STADWIRE` binary columnar response Buffer into `CityPoint[]`.
 *
 * @param {ArrayBuffer} arg0_buffer
 *
 * @returns {CityPoint[] | null}
 */
export function decodeBinaryCitiesWire (arg0_buffer: ArrayBuffer): CityPoint[] | null {
  //Convert from parameters
  let buffer = arg0_buffer

  //Guard clauses
  if (!buffer || buffer.byteLength < 16)
    return null

  //Declare local instance variables
  let view = new DataView(buffer)
  let magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
    view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
  )

  if (magic !== 'STADWIRE')
    return null

  //Function body
  let count = view.getUint32(8, true)
  let tail_len = view.getUint32(12, true)
  let offset = 16
  let coords = new Float32Array(buffer, offset, count * 2)
  offset += count * 8
  let pops = new Float32Array(buffer, offset, count)
  offset += count * 4
  let growth = new Float32Array(buffer, offset, count)
  offset += count * 4
  let capitals = new Uint8Array(buffer, offset, count)
  offset += count
  let state_ids_offset = offset
  offset += count * 4

  let tail_bytes = new Uint8Array(buffer, offset, tail_len)
  let tail_str = text_decoder ? text_decoder.decode(tail_bytes) : ''
  let strings_obj = JSON.parse(tail_str)
  let city_list: CityPoint[] = []

  for (let i = 0; i < count; i++) {
    if (pops[i] < 0.01)
      continue
    let is_cap = Boolean(capitals[i])
    let raw_sid = view.getInt32(state_ids_offset + i * 4, true)
    let cap_state_id = raw_sid !== -1 ? raw_sid : undefined
    let cap_color = strings_obj.capital_colors ? strings_obj.capital_colors[i] : undefined
    let cap_name = strings_obj.capital_names ? (strings_obj.capital_names[i] || undefined) : undefined

    city_list.push({
      capitalColor: cap_color,
      capitalOf: cap_name,
      capitalStateId: cap_state_id,
      capital_color: cap_color,
      capital_state_id: cap_state_id,
      capital_state_name: cap_name,
      coords: [coords[i * 2], coords[i * 2 + 1]],
      country: strings_obj.countries ? strings_obj.countries[i] : undefined,
      growthRate: growth[i],
      id: strings_obj.keys[i],
      isCapital: is_cap,
      is_capital: is_cap,
      key: strings_obj.keys[i],
      name: strings_obj.names[i],
      other_names: (strings_obj.other_names && strings_obj.other_names[i]) ? strings_obj.other_names[i] : undefined,
      population: pops[i],
      region: strings_obj.regions ? strings_obj.regions[i] : undefined,
    })
  }

  //Return statement
  return city_list
}

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
  arg7_performant_mode?: boolean,
  arg8_signal?: AbortSignal
): Promise<CityPoint[]> {
  //Convert from parameters
  let dataset = arg0_dataset || resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester)
  let year = arg1_year
  let min_pop = (arg2_min_pop !== undefined) ? Math.max(0.01, arg2_min_pop) : 0.01
  let max_cities = (arg3_max_cities !== undefined) ? arg3_max_cities : 4000
  let color_mode = arg4_color_mode || 'growth'
  let cache = arg5_cache
  let is_playing = Boolean(arg6_is_playing)
  let performant_mode = Boolean(arg7_performant_mode)
  let signal = arg8_signal

  //Declare local instance variables
  let cache_key = `${dataset}:${year}:${min_pop}:${max_cities}:${color_mode}`
  let pending_promise: Promise<CityPoint[]>

  //Guard clauses
  if (cache && cache.has(cache_key))
    return cache.get(cache_key)!

  if (!signal && in_flight_city_fetches.has(cache_key))
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

      let res = await fetch(`/api/stadester/cities.json?${url_params.toString()}`, { signal })
      if (!res.ok)
        return []

      let content_type = res.headers.get('content-type') || ''
      let city_list: CityPoint[] = []

      if (content_type.includes('application/octet-stream')) {
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
    } catch (arg0_err: any) {
      if (arg0_err?.name === 'AbortError')
        return []
      console.error('[fetchStadesterCitiesAsync] Error fetching cities:', arg0_err)
      return []
    } finally {
      in_flight_city_fetches.delete(cache_key)
    }
  })()

  if (!signal)
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
      if (!is_playing && !performant_mode && max_cities <= 8000) {
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

    fetchStadesterCitiesAsync(dataset, rounded_year, min_pop, max_cities, color_mode, client_cache_ref.current, is_playing, performant_mode, controller.signal)
      .then((arg0_list) => {
        if (!is_cancelled) {
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


/**
 * Fetches and caches regional LOD tiles via `/api/stadester/tile` when zoomed in,
 * merging local settlements with the global overview list.
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
  let [merged_cities, set_merged_cities] = useState<CityPoint[]>(base_cities)
  let tile_cache_ref = useRef<Map<string, CityPoint[]>>(new Map())

  let dataset = cfg?.dataset || resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester)
  let color_mode = cfg?.colorMode || 'growth'
  let min_pop = (cfg?.minPop !== undefined) ? Math.max(0.01, cfg.minPop) : 0.01
  let zoom = view_state?.zoom ?? 1.2
  let is_cartesian = projection === 'EqualEarth' || projection === 'Equirectangular'
  let norm_zoom = is_cartesian ? zoom - 1.2 : (projection === 'Globe' ? zoom - 1.65 : zoom)

  useEffect(() => {
    set_merged_cities(base_cities)
  }, [base_cities])

  useEffect(() => {
    if (!enabled || is_playing || norm_zoom < 3.5 || !view_state || is_cartesian) {
      set_merged_cities(base_cities)
      return
    }

    let c_lat = view_state.latitude ?? 20
    let c_lng = view_state.longitude ?? 0
    let tile_z = Math.max(2, Math.min(5, Math.floor(norm_zoom) - 1))
    let n = Math.pow(2, tile_z)
    let lat_rad = (Math.max(-85, Math.min(85, c_lat))*Math.PI)/180
    let cx = Math.floor(((c_lng + 180)/360)*n)
    let cy = Math.floor(((1 - Math.log(Math.tan(lat_rad) + 1/Math.cos(lat_rad))/Math.PI)/2)*n)

    let tile_coords: Array<[number, number]> = []
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        let tx = ((cx + dx) % n + n) % n
        let ty = Math.max(0, Math.min(n - 1, cy + dy))
        let exists = tile_coords.some((arg0_t) => arg0_t[0] === tx && arg0_t[1] === ty)
        if (!exists)
          tile_coords.push([tx, ty])
      }
    }

    let is_cancelled = false
    let controller = new AbortController()
    let timer = setTimeout(() => {
      let mergeFromTiles = function (): void {
        let added_count = 0
        let by_key = new Map<string, CityPoint>()
        for (let i = 0; i < base_cities.length; i++)
          by_key.set(base_cities[i].key, base_cities[i])

        for (let i = 0; i < tile_coords.length; i++) {
          let [tx, ty] = tile_coords[i]
          let tk = `${dataset}:${year}:${color_mode}:${min_pop}:${tile_z}/${tx}/${ty}`
          let t_list = tile_cache_ref.current.get(tk)
          if (t_list) {
            for (let x = 0; x < t_list.length; x++) {
              if (!by_key.has(t_list[x].key)) {
                by_key.set(t_list[x].key, t_list[x])
                added_count++
              }
            }
          }
        }
        if (!is_cancelled) {
          if (added_count === 0)
            set_merged_cities((arg0_prev) => arg0_prev === base_cities ? arg0_prev : base_cities)
          else
            set_merged_cities(Array.from(by_key.values()))
        }
      }

      let missing = tile_coords.filter(([tx, ty]) => {
        let tk = `${dataset}:${year}:${color_mode}:${min_pop}:${tile_z}/${tx}/${ty}`
        return !tile_cache_ref.current.has(tk)
      })

      if (missing.length === 0) {
        mergeFromTiles()
        return
      }

      Promise.all(
        missing.map(async ([tx, ty]) => {
          let tk = `${dataset}:${year}:${color_mode}:${min_pop}:${tile_z}/${tx}/${ty}`
          let params = new URLSearchParams({
            colorMode: color_mode,
            dataset,
            format: 'bin',
            maxCities: '2500',
            minPop: String(min_pop),
            x: String(tx),
            y: String(ty),
            year: String(year),
            z: String(tile_z),
          })
          try {
            let res = await fetch(`/api/stadester/tile?${params.toString()}`, { signal: controller.signal })
            if (!res.ok)
              return
            let ab = await res.arrayBuffer()
            let decoded = decodeBinaryCitiesWire(ab)
            if (decoded) {
              if (tile_cache_ref.current.size >= 80) {
                let oldest = tile_cache_ref.current.keys().next().value
                if (oldest)
                  tile_cache_ref.current.delete(oldest)
              }
              tile_cache_ref.current.set(tk, decoded)
            }
          } catch {
            //Ignore aborted/transient tile errors
          }
        })
      ).then(() => {
        if (!is_cancelled)
          mergeFromTiles()
      })
    }, 150)

    return () => {
      is_cancelled = true
      clearTimeout(timer)
      controller.abort()
    }
  }, [enabled, is_playing, dataset, year, color_mode, min_pop, Math.floor(norm_zoom), Math.round((view_state?.latitude ?? 20)/5), Math.round((view_state?.longitude ?? 0)/5), projection, base_cities])

  //Return statement
  return merged_cities
}
