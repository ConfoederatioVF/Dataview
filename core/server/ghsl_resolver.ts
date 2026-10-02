import fs from 'fs'
import path from 'path'
import {
  cleanCandidateCityString,
  getPrimaryCityName,
  isCorruptedCityName,
  isSubordinateDistrictName,
} from '../framework/stadester/city_name_framework.ts'

export interface CityCacheRecord {
  resolvedName: string
  source: 'cache' | 'historical' | 'photon' | 'delimited'
  updatedAt: number
}

export interface ResolverQueueTask {
  cityKey: string
  coords: [number, number]
  delimitedNames: string[]
  population: number
}

let city_cache: Record<string, CityCacheRecord> = {}
let city_cache_path = path.resolve(process.cwd(), 'common/stadester_city_cache.json')
let ghsl_csv_map = new Map<string, string>()
let historical_cities_index: Array<{ coords: [number, number]; maxPop: number; name: string }> = []
let is_cache_loaded = false
let is_ghsl_csv_loaded = false
let is_queue_running = false
let photon_queue: ResolverQueueTask[] = []
let queued_keys_set = new Set<string>()

/**
 * Loads the persisted city cache from config/stadester_city_cache.json into memory.
 *
 * @returns {Record<string, CityCacheRecord>}
 */
export let loadCityCache = function (): Record<string, CityCacheRecord> {
  //Declare local instance variables
  let raw_content: string

  //Guard clauses
  if (is_cache_loaded)
    return city_cache

  //Function body
  if (fs.existsSync(city_cache_path)) {
    try {
      raw_content = fs.readFileSync(city_cache_path, 'utf-8')
      city_cache = JSON.parse(raw_content)
    } catch (arg0_err) {
      console.warn('[GhslResolver] Failed to load city cache, creating new:', arg0_err)
      city_cache = {}
    }
  } else {
    city_cache = {}
  }

  is_cache_loaded = true

  //Return statement
  return city_cache
}

/**
 * Loads and parses data/stadester/GHSL.csv into a memory lookup table mapping ID_UC_G0 to actual city names.
 *
 * @returns {Map<string, string>}
 */
export let loadGhslCsvNames = function (): Map<string, string> {
  //Declare local instance variables
  let csv_path: string
  let lines: string[]
  let raw_text: string

  //Guard clauses
  if (is_ghsl_csv_loaded)
    return ghsl_csv_map

  //Function body
  csv_path = path.resolve(process.cwd(), 'data/stadester/GHSL.csv')

  if (fs.existsSync(csv_path)) {
    try {
      raw_text = fs.readFileSync(csv_path, 'utf-8').replace(/^\uFEFF/, '')
      lines = raw_text.split(/\r?\n/)

      for (let i = 1; i < lines.length; i++) {
        let line = lines[i].trim()
        if (!line)
          continue

        let parts = line.split(';')
        if (parts.length >= 2) {
          let id_str = parts[0].trim()
          let city_name = parts[1].trim()
          if (id_str && city_name)
            ghsl_csv_map.set(id_str, city_name)
        }
      }
      console.log(`[GhslResolver] Successfully loaded ${ghsl_csv_map.size} city names from GHSL.csv.`)
    } catch (arg0_err) {
      console.warn('[GhslResolver] Failed to parse GHSL.csv:', arg0_err)
    }
  } else {
    console.warn(`[GhslResolver] GHSL.csv not found at ${csv_path}`)
  }

  is_ghsl_csv_loaded = true

  //Return statement
  return ghsl_csv_map
}

/**
 * Saves current memory cache to config/stadester_city_cache.json.
 */
export let saveCityCache = function (): void {
  //Declare local instance variables
  let dir_path = path.dirname(city_cache_path)

  //Function body
  try {
    if (!fs.existsSync(dir_path))
      fs.mkdirSync(dir_path, { recursive: true })
    fs.writeFileSync(city_cache_path, JSON.stringify(city_cache, null, 2), 'utf-8')
  } catch (arg0_err) {
    console.error('[GhslResolver] Failed to persist city cache:', arg0_err)
  }
}

/**
 * Clears the lightweight cached bundle on disk to force regeneration.
 */
export let clearStadesterDiskCache = function (): void {
  //Declare local instance variables
  let cache_dir = path.resolve(process.cwd(), 'data/stadester/cache')

  //Function body
  if (fs.existsSync(cache_dir)) {
    try {
      let files = fs.readdirSync(cache_dir)
      for (let i = 0; i < files.length; i++) {
        let f_path = path.join(cache_dir, files[i])
        fs.unlinkSync(f_path)
      }
      console.log('[GhslResolver] Successfully cleared Stadestér lite disk cache.')
    } catch (arg0_err) {
      console.warn('[GhslResolver] Error clearing cache directory:', arg0_err)
    }
  }
}

/**
 * Indexes historical pre-1975 cities for fast spatial nearest-neighbour lookup.
 * Normalizes ASCII diacritical artifacts to ensure clean English/Latin display names.
 *
 * @param {Record<string, any>} arg0_raw_data
 */
export let indexHistoricalCities = function (arg0_raw_data: Record<string, any>): void {
  //Convert from parameters
  let raw_data = arg0_raw_data

  //Declare local instance variables
  let all_keys = Object.keys(raw_data)

  //Function body
  historical_cities_index = []

  for (let i = 0; i < all_keys.length; i++) {
    let key = all_keys[i]
    let item = raw_data[key]
    let name = item.name || key

    if (key.startsWith('stadester-') && item.coords && Array.isArray(item.coords)) {
      if (!isCorruptedCityName(name)) {
        let pop_obj = item.population || {}
        let pop_vals = Object.values(pop_obj) as number[]
        let max_p = pop_vals.length > 0 ? Math.max(...pop_vals) : 0
        let clean_name = cleanCandidateCityString(name)

        if (clean_name && !isCorruptedCityName(clean_name)) {
          historical_cities_index.push({
            coords: [item.coords[0], item.coords[1]],
            maxPop: max_p,
            name: clean_name,
          })
        }
      }
    }
  }

  console.log(`[GhslResolver] Indexed ${historical_cities_index.length} clean historical reference cities.`)
}

/**
 * Computes approximate planar distance in kilometres between two geographic coordinates.
 *
 * @param {[number, number]} arg0_c1
 * @param {[number, number]} arg1_c2
 *
 * @returns {number}
 */
function computeDistanceKm (arg0_c1: [number, number], arg1_c2: [number, number]): number {
  //Convert from parameters
  let c1 = arg0_c1
  let c2 = arg1_c2

  //Declare local instance variables
  let d_lat = (c1[0] - c2[0]) * 111.0
  let d_lon = (c1[1] - c2[1]) * 111.0 * Math.cos((c1[0] * Math.PI) / 180)

  //Return statement
  return Math.sqrt(d_lat * d_lat + d_lon * d_lon)
}

/**
 * Finds the closest clean historical pre-1975 city within a specified threshold radius.
 *
 * @param {[number, number]} arg0_coords
 * @param {number} [arg1_max_km=45]
 *
 * @returns {string | null}
 */
export let findClosestHistoricalCity = function (
  arg0_coords: [number, number],
  arg1_max_km?: number
): string | null {
  //Convert from parameters
  let coords = arg0_coords
  let max_km = (arg1_max_km !== undefined) ? arg1_max_km : 45

  //Declare local instance variables
  let best_city: string | null = null
  let min_dist = max_km

  //Guard clauses
  if (!coords || historical_cities_index.length === 0)
    return null

  //Function body
  for (let i = 0; i < historical_cities_index.length; i++) {
    let hist = historical_cities_index[i]
    let dist = computeDistanceKm(coords, hist.coords)
    if (dist < min_dist) {
      min_dist = dist
      best_city = hist.name
    }
  }

  //Return statement
  return best_city
}



/**
 * Dispatches the FIFO background queue at strictly 1 request per second (1000ms delay).
 */
function startQueueProcessor (): void {
  if (is_queue_running)
    return

  is_queue_running = true

  let processNext = async () => {
    if (photon_queue.length === 0) {
      is_queue_running = false
      return
    }

    let task = photon_queue.shift()!
    queued_keys_set.delete(task.cityKey)

    try {
      let [lat, lon] = task.coords
      let url = `https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}&lang=en`
      let resp = await fetch(url, {
        headers: {
          'User-Agent': 'Dataview-App/1.0 (Desktop GIS Viewer; contact@dataview.local)',
        },
      })

      if (resp.ok) {
        let json: any = await resp.json()
        let props = json.features?.[0]?.properties
        if (props) {
          let resolved = ''
          let target_pop = task.population || 0

          //Respect administrative importance based on target population:
          //1. For large urban agglomerations, prioritize true city/municipality level
          if (props.city && !isCorruptedCityName(props.city)) {
            resolved = cleanCandidateCityString(props.city)
          } else if (props.town && !isCorruptedCityName(props.town)) {
            resolved = cleanCandidateCityString(props.town)
          } else if (props.municipality && !isCorruptedCityName(props.municipality)) {
            resolved = cleanCandidateCityString(props.municipality)
          }

          //2. Correlate with semicolon-delimited list candidates
          if (task.delimitedNames && task.delimitedNames.length > 0) {
            //Check if any primary candidate in the delimited list matches the photon city
            for (let i = 0; i < task.delimitedNames.length; i++) {
              let cand = cleanCandidateCityString(task.delimitedNames[i])
              if (!isCorruptedCityName(cand) && !isSubordinateDistrictName(cand)) {
                if (resolved && cand.toLowerCase().includes(resolved.toLowerCase())) {
                  resolved = cand
                  break
                }
              }
            }

            //If resolved name is still a district and city population is large, prevent district from taking over
            if (isSubordinateDistrictName(resolved) && target_pop > 200000) {
              for (let i = 0; i < task.delimitedNames.length; i++) {
                let cand = cleanCandidateCityString(task.delimitedNames[i])
                if (!isCorruptedCityName(cand) && !isSubordinateDistrictName(cand)) {
                  resolved = cand
                  break
                }
              }
            }
          }

          //3. Fallback for smaller settlements where only district/county is returned
          if (!resolved && target_pop < 100000) {
            if (props.county && !isCorruptedCityName(props.county))
              resolved = cleanCandidateCityString(props.county)
            else if (props.district && !isCorruptedCityName(props.district))
              resolved = cleanCandidateCityString(props.district)
          }

          if (resolved && !isCorruptedCityName(resolved)) {
            city_cache[task.cityKey] = {
              resolvedName: resolved,
              source: 'photon',
              updatedAt: Date.now(),
            }
            saveCityCache()
            console.log(`[GhslResolver] Photon resolved ${task.cityKey} -> "${resolved}" (pop: ${target_pop})`)
          }
        }
      }
    } catch (arg0_err) {
      console.warn(`[GhslResolver] Photon error for ${task.cityKey}:`, arg0_err)
    }

    //Enforce polite rate limit: strictly 1 query per second (1000ms delay)
    setTimeout(processNext, 1000)
  }

  setTimeout(processNext, 1000)
}

/**
 * Enqueues a city for reverse geocoding via Photon if not already queued or cached.
 *
 * @param {string} arg0_key
 * @param {[number, number]} arg1_coords
 * @param {string[]} arg2_delimited_names
 * @param {number} arg3_pop
 */
export let queuePhotonLookup = function (
  arg0_key: string,
  arg1_coords: [number, number],
  arg2_delimited_names: string[],
  arg3_pop: number
): void {
  //Convert from parameters
  let coords = arg1_coords
  let delimited_names = arg2_delimited_names
  let key = arg0_key
  let pop = arg3_pop

  //Guard clauses
  if (!coords || queued_keys_set.has(key) || city_cache[key])
    return

  //Function body
  queued_keys_set.add(key)
  photon_queue.push({
    cityKey: key,
    coords,
    delimitedNames: delimited_names,
    population: pop,
  })

  startQueueProcessor()
}

/**
 * Resolves a city display name prioritizing GHSL CSV table lookups for ghsl- entries,
 * primary city names from Stadestér JSON datasets, and historical/Photon fallbacks.
 *
 * @param {string} arg0_key
 * @param {string} arg1_raw_name
 * @param {[number, number]} [arg2_coords]
 * @param {number} [arg3_pop=0]
 * @param {number | string} [arg4_id]
 *
 * @returns {string}
 */
export let resolveCityDisplayName = function (
  arg0_key: string,
  arg1_raw_name: string,
  arg2_coords?: [number, number],
  arg3_pop?: number,
  arg4_id?: number | string
): string {
  //Convert from parameters
  let coords = arg2_coords
  let id_val = arg4_id
  let key = arg0_key
  let pop = (arg3_pop !== undefined) ? arg3_pop : 0
  let raw_name = arg1_raw_name

  //Declare local instance variables
  let cache = loadCityCache()
  let coord_key = coords ? `${coords[0].toFixed(3)},${coords[1].toFixed(3)}` : key
  let ghsl_map = loadGhslCsvNames()

  //1. Check primary candidate from raw_name / c.name first
  if (raw_name && raw_name !== '0' && !isCorruptedCityName(raw_name)) {
    let primary = getPrimaryCityName(raw_name, pop)
    if (primary && primary !== '0' && !isCorruptedCityName(primary))
      return primary
  }

  //2. Check persistent disk cache
  if (cache[key] && !isCorruptedCityName(cache[key].resolvedName))
    return cache[key].resolvedName
  if (cache[coord_key] && !isCorruptedCityName(cache[coord_key].resolvedName))
    return cache[coord_key].resolvedName

  //3. If key is ghsl- or id is passed, lookup in GHSL.csv table
  if (key.startsWith('ghsl-') || id_val !== undefined) {
    let lookup_id = (id_val !== undefined && id_val !== null) ? String(id_val) : ''
    if (!lookup_id && key.startsWith('ghsl-')) {
      let match = key.match(/\d+/)
      if (match)
        lookup_id = match[0]
    }
    if (lookup_id && ghsl_map.has(lookup_id)) {
      let csv_name = ghsl_map.get(lookup_id)
      if (csv_name && csv_name !== '0' && !isCorruptedCityName(csv_name))
        return csv_name
    }
  }

  //4. Fallback to clean candidate from key string
  let key_clean = cleanCandidateCityString(key)
  if (key_clean && key_clean !== '0' && !isCorruptedCityName(key_clean))
    return key_clean

  //Return statement
  return (raw_name && raw_name !== '0' && !isCorruptedCityName(raw_name)) ? raw_name : cleanCandidateCityString(key)
}
