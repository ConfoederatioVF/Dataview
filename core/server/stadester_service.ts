import fs from 'fs'
import path from 'path'
import { indexHistoricalCities, loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { getPrimaryCityName, isCorruptedCityName, isBuggedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  normalizeMetadataEntry,
  resolveHistoricalCityName,
  type CityMetadataEntry,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'

let bugged_cities_set: Set<string> | null = null
let bugged_cities_mtime = 0

/**
 * Loads and returns the set of bugged city names from data/stadester/bugged_cities.txt.
 *
 * @returns {Set<string>}
 */
export function getBuggedCitiesSet (): Set<string> {
  let file_path = path.resolve(process.cwd(), 'data/stadester/bugged_cities.txt')

  if (fs.existsSync(file_path)) {
    try {
      let stats = fs.statSync(file_path)
      if (!bugged_cities_set || stats.mtimeMs > bugged_cities_mtime) {
        bugged_cities_mtime = stats.mtimeMs
        let content = fs.readFileSync(file_path, 'utf-8')
        let lines = content.split(/\r?\n/)
        let set = new Set<string>()

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim()
          if (line && !line.startsWith('#')) {
            set.add(line.toLowerCase())
            let norm = line.toLowerCase().replace(/[-~'`^]/g, ' ').replace(/\s+/g, ' ').trim()
            if (norm)
              set.add(norm)
            let strip = line.toLowerCase().replace(/[`'’\-\s]/g, '')
            if (strip)
              set.add(strip)
          }
        }
        bugged_cities_set = set
      }
      return bugged_cities_set!
    } catch (arg0_err) {
      console.warn('[StadesterService] Failed to read bugged_cities.txt:', arg0_err)
      return new Set()
    }
  }
  return new Set()
}

export interface CityIndexEntry {
  area?: Record<string, number>
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: Record<string, number>
  elevation?: number
  historical_names?: HistoricalNameRecord[]
  id: number | string
  key: string
  max_pop: number
  max_year: number
  metadata_name?: string
  min_year: number
  name: string
  original_names?: string | string[]
  other_names?: string | string[]
  population?: Record<string, number>
  region?: string
  years: number[]
}

export interface StadesterQueryOptions {
  bbox?: [number, number, number, number] // [west, south, east, north]
  color_mode?: 'growth' | 'population' | 'region' | 'continent'
  max_cities?: number
  min_pop?: number
}

export interface CompactCitiesPayload {
  coords: number[] // [lat0, lon0, lat1, lon1, ...]
  count: number
  countries: (string | undefined)[]
  growth: number[]
  keys: string[]
  names: string[]
  pops: number[]
  regions: (string | undefined)[]
}

export interface CityRenderPoint {
  area?: number
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: number
  growthRate?: number
  historical_names?: HistoricalNameRecord[]
  id: number | string
  key: string
  metadata_name?: string
  name: string
  other_names?: string | string[]
  population: number
  region?: string
}

export let StadesterService = {
  city_metadata: null as CityMetadataEntry[] | null,
  city_metadata_mtime: 0,
  datasets: new Map<string, Record<string, CityIndexEntry>>(),
  lite_cache_paths: new Map<string, string>(),

  /**
   * Applies metadata from data/stadester/city_metadata.json to indexed cities.
   * Finds the nearest Stadestér city to each specified [lng, lat] point and inherits metadata.
   * Also binds to agglomeration counterparts within 25 km sharing the city name.
   *
   * @param {Record<string, CityIndexEntry>} arg0_indexed_record
   */
  applyCityMetadata: function (arg0_indexed_record: Record<string, CityIndexEntry>): void {
    //Convert from parameters
    let indexed = arg0_indexed_record

    //Declare local instance variables
    let all_keys = Object.keys(indexed)
    let meta_list = StadesterService.loadCityMetadata()
    let spatial_grid: Record<string, CityIndexEntry[]> = {}

    //Guard clauses
    if (!meta_list || meta_list.length === 0 || all_keys.length === 0)
      return

    //Function body
    //1. Construct spatial grid with 1-degree bins (~111km) for fast local lookup
    for (let x = 0; x < all_keys.length; x++) {
      let city = indexed[all_keys[x]]
      if (city.coords && Array.isArray(city.coords)) {
        let bin_lat = Math.floor(city.coords[0])
        let bin_lng = Math.floor(city.coords[1])
        let bin_key = `${bin_lat},${bin_lng}`
        if (!spatial_grid[bin_key])
          spatial_grid[bin_key] = []
        spatial_grid[bin_key].push(city)
      }
    }

    //2. Bind metadata to matching cities and counterparts
    for (let i = 0; i < meta_list.length; i++) {
      let best_city: CityIndexEntry | null = null
      let meta = meta_list[i]
      let min_dist = 999999
      let target_lat = meta.coords[1]
      let target_lng = meta.coords[0]

      //A. Check direct key match if specified
      if (meta.key && indexed[meta.key]) {
        best_city = indexed[meta.key]
        min_dist = 0
      }

      //B. Fast spatial grid search in 3x3 surrounding cells
      if (!best_city) {
        let center_lat = Math.floor(target_lat)
        let center_lng = Math.floor(target_lng)

        for (let d_lat = -1; d_lat <= 1; d_lat++) {
          for (let d_lng = -1; d_lng <= 1; d_lng++) {
            let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
            if (cell) {
              for (let c = 0; c < cell.length; c++) {
                let candidate = cell[c]
                let dist = computeHaversineDistanceKm(candidate.coords[0], candidate.coords[1], target_lat, target_lng)
                if (dist < min_dist) {
                  min_dist = dist
                  best_city = candidate
                }
              }
            }
          }
        }
      }

      //C. Inherit metadata if nearest city is within 50 km threshold
      if (best_city && min_dist <= 50) {
        best_city.historical_names = meta.historical_names
        if (meta.name) {
          best_city.metadata_name = meta.name
          best_city.name = meta.name
        }

        //Also associate related agglomeration or pre/post-1975 counterpart cities in local grid cells
        let base_name = (best_city.name || meta.name || '').toLowerCase()
        let center_lat = Math.floor(target_lat)
        let center_lng = Math.floor(target_lng)
        let meta_name_lower = (meta.name || '').toLowerCase()

        for (let d_lat = -1; d_lat <= 1; d_lat++) {
          for (let d_lng = -1; d_lng <= 1; d_lng++) {
            let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
            if (cell) {
              for (let c = 0; c < cell.length; c++) {
                let other = cell[c]
                if (other.key === best_city.key)
                  continue

                let dist = computeHaversineDistanceKm(other.coords[0], other.coords[1], target_lat, target_lng)
                if (dist <= 60) {
                  let other_key_lower = (other.key || '').toLowerCase()
                  let other_name_lower = (other.name || '').toLowerCase()
                  let is_name_match =
                    (base_name && (other_name_lower.includes(base_name) || other_key_lower.includes(base_name) || (other.other_names || []).some((arg0_o: string) => arg0_o.toLowerCase().includes(base_name)))) ||
                    (meta_name_lower && (other_name_lower.includes(meta_name_lower) || other_key_lower.includes(meta_name_lower) || (other.other_names || []).some((arg0_o: string) => arg0_o.toLowerCase().includes(meta_name_lower))))
                  let is_era_counterpart =
                    ((best_city.key.startsWith('stadester-') && other.key.startsWith('ghsl-')) ||
                    (best_city.key.startsWith('ghsl-') && other.key.startsWith('stadester-'))) &&
                    (is_name_match || dist <= 15)

                  if (is_name_match || is_era_counterpart) {
                    if (!other.historical_names || other.historical_names.length === 0)
                      other.historical_names = meta.historical_names
                    if (meta.name && !other.metadata_name) {
                      other.metadata_name = meta.name
                      other.name = meta.name
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    console.log(`[StadesterService] Successfully bound ${meta_list.length} historical city metadata entries.`)
  },

  /**
   * Loads and normalises city metadata from data/stadester/city_metadata.json into memory.
   *
   * @returns {CityMetadataEntry[]}
   */
  loadCityMetadata: function (): CityMetadataEntry[] {
    //Declare local instance variables
    let file_path = path.resolve(process.cwd(), 'data/stadester/city_metadata.json')
    let normalized_list: CityMetadataEntry[] = []

    //Guard clauses
    if (!fs.existsSync(file_path))
      return []

    try {
      let stats = fs.statSync(file_path)
      if (StadesterService.city_metadata && stats.mtimeMs <= StadesterService.city_metadata_mtime)
        return StadesterService.city_metadata

      //Function body
      let content = fs.readFileSync(file_path, 'utf-8')
      let raw_json = JSON.parse(content)

      if (Array.isArray(raw_json)) {
        for (let i = 0; i < raw_json.length; i++) {
          let item = normalizeMetadataEntry(raw_json[i])
          if (item)
            normalized_list.push(item)
        }
      } else if (raw_json && typeof raw_json === 'object') {
        let keys = Object.keys(raw_json)
        for (let i = 0; i < keys.length; i++) {
          let item = normalizeMetadataEntry(raw_json[keys[i]], keys[i])
          if (item)
            normalized_list.push(item)
        }
      }

      StadesterService.city_metadata = normalized_list
      StadesterService.city_metadata_mtime = stats.mtimeMs
      console.log(`[StadesterService] Loaded ${normalized_list.length} city metadata entries from ${file_path}`)
      return normalized_list
    } catch (arg0_err) {
      console.warn('[StadesterService] Failed to load city_metadata.json:', arg0_err)
      return StadesterService.city_metadata || []
    }
  },

  /**
   * Resolves a city's historical name at the specified year or date.
   *
   * @param {CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[] }} arg0_city
   * @param {number | string} [arg1_year]
   *
   * @returns {string}
   */
  resolveCityNameAtYear: function (
    arg0_city: CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[] },
    arg1_year?: number | string
  ): string {
    //Convert from parameters
    let city = arg0_city
    let year = arg1_year

    //Guard clauses
    if (!city)
      return ''

    //Return statement
    return resolveHistoricalCityName(city, year)
  },

  /**
   * Resolves the absolute path to a Stadestér JSON dataset file.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   *
   * @returns {string}
   */
  getDatasetFilePath: function (arg0_dataset_name?: string): string {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

    //Declare local instance variables
    let base_dir = path.resolve(process.cwd(), 'data/stadester')
    let file_name = dataset_name.endsWith('.json') ? dataset_name : `${dataset_name}.json`

    //Return statement
    return path.join(base_dir, file_name)
  },

  /**
   * Loads and indexes a Stadestér dataset into server memory.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   *
   * @returns {Record<string, CityIndexEntry>}
   */
  loadDataset: function (arg0_dataset_name?: string): Record<string, CityIndexEntry> {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

    //Declare local instance variables
    let all_city_keys: string[]
    let file_path = StadesterService.getDatasetFilePath(dataset_name)
    let indexed_record: Record<string, CityIndexEntry> = {}
    let raw_data: Record<string, any>
    let raw_text: string

    //Guard clauses
    if (StadesterService.datasets.has(dataset_name))
      return StadesterService.datasets.get(dataset_name)!

    if (!fs.existsSync(file_path)) {
      console.warn(`[StadesterService] Dataset file not found: ${file_path}`)
      return {}
    }

    //Check lite disk cache for pre-resolved names
    let cache_dir = path.resolve(process.cwd(), 'data/stadester/cache')
    let lite_file_path = path.join(cache_dir, `${dataset_name}_lite.json`)
    let lite_name_map = new Map<string, string>()

    if (fs.existsSync(lite_file_path)) {
      try {
        let lite_data = JSON.parse(fs.readFileSync(lite_file_path, 'utf-8'))
        if (Array.isArray(lite_data)) {
          for (let i = 0; i < lite_data.length; i++) {
            if (lite_data[i].key && lite_data[i].name) {
              if (!isCorruptedCityName(lite_data[i].name))
                lite_name_map.set(lite_data[i].key, lite_data[i].name)
            }
          }
          console.log(`[StadesterService] Loaded ${lite_name_map.size} pre-resolved city names from ${lite_file_path}`)
        }
      } catch (arg0_err) {
        console.warn('[StadesterService] Failed to read lite cache for names:', arg0_err)
      }
    }

    //Function body
    loadGhslCsvNames()
    console.log(`[StadesterService] Indexing dataset ${dataset_name} from ${file_path}...`)
    raw_text = fs.readFileSync(file_path, 'utf-8')
    raw_data = JSON.parse(raw_text)
    raw_text = ''
    indexHistoricalCities(raw_data)
    all_city_keys = Object.keys(raw_data)

    for (let i = 0; i < all_city_keys.length; i++) {
      let key = all_city_keys[i]
      let c = raw_data[key]
      let pop_obj = c.population || {}
      let pop_years = Object.keys(pop_obj).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
      let min_yr = pop_years.length > 0 ? pop_years[0] : 0
      let max_yr = pop_years.length > 0 ? pop_years[pop_years.length - 1] : 0
      let max_p = 0

      for (let x = 0; x < pop_years.length; x++) {
        let p_val = pop_obj[pop_years[x]] || 0
        if (p_val > max_p)
          max_p = p_val
      }

      let cached_name = lite_name_map.get(key)
      let clean_display_name = (cached_name && !isCorruptedCityName(cached_name))
        ? cached_name
        : resolveCityDisplayName(key, c.name || key, c.coords, max_p, c.id)

      indexed_record[key] = {
        area: c.area,
        colour: c.colour,
        coords: c.coords,
        country: c.country,
        density: c.density,
        elevation: c.elevation,
        id: c.id !== undefined ? c.id : i + 1,
        key: c.key || key,
        max_pop: max_p,
        max_year: max_yr,
        min_year: min_yr,
        name: clean_display_name,
        original_names: c.original_names,
        other_names: c.other_names,
        population: pop_obj,
        region: c.region,
        years: pop_years,
      }
      delete raw_data[key]
    }

    raw_data = {} as any
    StadesterService.applyCityMetadata(indexed_record)
    StadesterService.datasets.set(dataset_name, indexed_record)
    console.log(`[StadesterService] Successfully indexed ${all_city_keys.length} cities for ${dataset_name}.`)

    //Ensure lite cache exists on disk
    try {
      StadesterService.ensureLiteCache(dataset_name)
    } catch (arg0_cache_err) {
      console.warn('[StadesterService] Failed to ensure lite cache:', arg0_cache_err)
    }

    //Return statement
    return indexed_record
  },

  /**
   * Ensures the lightweight static index cache exists on disk for immediate rendering.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   *
   * @returns {string} - Absolute path to cached lite JSON file
   */
  ensureLiteCache: function (arg0_dataset_name?: string): string {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

    //Declare local instance variables
    let cache_dir = path.resolve(process.cwd(), 'data/stadester/cache')
    let lite_file_path = path.join(cache_dir, `${dataset_name}_lite.json`)
    let source_file_path = StadesterService.getDatasetFilePath(dataset_name)

    //Guard clauses
    let meta_file_path = path.resolve(process.cwd(), 'data/stadester/city_metadata.json')
    if (fs.existsSync(lite_file_path) && fs.existsSync(source_file_path)) {
      let is_meta_newer = false
      let lite_stat = fs.statSync(lite_file_path)
      let src_stat = fs.statSync(source_file_path)

      if (fs.existsSync(meta_file_path)) {
        let meta_stat = fs.statSync(meta_file_path)
        if (meta_stat.mtimeMs > lite_stat.mtimeMs)
          is_meta_newer = true
      }

      if (!is_meta_newer && lite_stat.mtimeMs >= src_stat.mtimeMs && lite_stat.size > 1000)
        return lite_file_path
    }

    //Function body
    if (!fs.existsSync(cache_dir))
      fs.mkdirSync(cache_dir, { recursive: true })

    let indexed = StadesterService.loadDataset(dataset_name)
    let all_keys = Object.keys(indexed)
    let lite_array: any[] = []

    for (let i = 0; i < all_keys.length; i++) {
      let c = indexed[all_keys[i]]
      lite_array.push({
        colour: c.colour,
        coords: c.coords,
        country: c.country,
        historical_names: c.historical_names,
        id: c.id,
        key: c.key,
        max_pop: c.max_pop,
        max_year: c.max_year,
        metadata_name: c.metadata_name,
        min_year: c.min_year,
        name: c.name,
        other_names: c.other_names,
        region: c.region,
      })
    }

    fs.writeFileSync(lite_file_path, JSON.stringify(lite_array), 'utf-8')
    console.log(`[StadesterService] Pre-cached lightweight index for ${dataset_name}: ${lite_file_path} (${(fs.statSync(lite_file_path).size / (1024*1024)).toFixed(2)} MB)`)

    //Return statement
    return lite_file_path
  },

  /**
   * Retrieves active cities interpolated at a specific historical year.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {number} [arg1_year=1950]
   * @param {StadesterQueryOptions} [arg2_options]
   *
   * @returns {CityRenderPoint[]}
   */
  getCitiesAtYear: function (
    arg0_dataset_name?: string,
    arg1_year?: number,
    arg2_options?: StadesterQueryOptions
  ): CityRenderPoint[] {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let options = (arg2_options) ? arg2_options : {}
    let target_year = arg1_year !== undefined ? arg1_year : 1950

    //Declare local instance variables
    let all_city_keys: string[]
    let indexed = StadesterService.loadDataset(dataset_name)
    let max_cities = options.max_cities !== undefined ? options.max_cities : 4000
    let min_pop = options.min_pop !== undefined ? Math.max(0.01, options.min_pop) : 0.01
    let result_cities: CityRenderPoint[] = []

    //Guard clauses
    if (!indexed || Object.keys(indexed).length === 0)
      return []

    //Function body
    let bugged_set = getBuggedCitiesSet()
    all_city_keys = Object.keys(indexed)

    for (let i = 0; i < all_city_keys.length; i++) {
      let city = indexed[all_city_keys[i]]
      let pop_years = city.years

      if (pop_years.length === 0 || !city.coords)
        continue

      if (isBuggedCityName(city.name, bugged_set) || (city.key && isBuggedCityName(city.key, bugged_set)))
        continue

      if (options.bbox) {
        let b = options.bbox
        let c_lat = city.coords[0]
        let c_lon = city.coords[1]
        if (b[0] <= b[2]) {
          if (c_lon < b[0] || c_lon > b[2] || c_lat < b[1] || c_lat > b[3])
            continue
        } else {
          if ((c_lon < b[0] && c_lon > b[2]) || c_lat < b[1] || c_lat > b[3])
            continue
        }
      }

      let start_yr = city.min_year
      let end_yr = city.max_year

      //Allow cities alive at target_year (with 1975+ extension for modern metropolitan entries)
      let is_in_range = (target_year >= start_yr && target_year <= end_yr) ||
        (end_yr >= 1975 && target_year >= 1975 && target_year <= 2025)

      if (!is_in_range)
        continue

      let pop = 0
      let prev_yr = pop_years[0]
      let next_yr = pop_years[pop_years.length - 1]
      let growth_rate = 0

      //Interpolate population
      if (city.population && city.population[String(target_year)] !== undefined) {
        pop = city.population[String(target_year)]
      } else if (target_year <= start_yr) {
        pop = city.population ? (city.population[String(start_yr)] || 0) : 0
      } else if (target_year >= end_yr) {
        pop = city.population ? (city.population[String(end_yr)] || 0) : 0
      } else {
        for (let x = 0; x < pop_years.length - 1; x++) {
          if (target_year >= pop_years[x] && target_year <= pop_years[x + 1]) {
            prev_yr = pop_years[x]
            next_yr = pop_years[x + 1]
            break
          }
        }

        let p0 = city.population ? (city.population[String(prev_yr)] || 0) : 0
        let p1 = city.population ? (city.population[String(next_yr)] || 0) : 0

        if (p0 >= 0.01 && p1 >= 0.01 && next_yr > prev_yr) {
          let t = (target_year - prev_yr)/(next_yr - prev_yr)
          let log_val = Math.log10(p0) + t*(Math.log10(p1) - Math.log10(p0))
          let calc_pop = Math.pow(10, log_val)
          pop = calc_pop >= 1 ? Math.round(calc_pop) : Math.round(calc_pop * 1000) / 1000
        } else if (p1 >= 0.01) {
          pop = p1
        } else if (p0 >= 0.01) {
          pop = p0
        } else {
          pop = 0
        }
      }

      //Calculate continuous annual growth rate around target_year (logarithmic slope)
      if (city.population && pop_years.length > 1) {
        let g_next_yr = pop_years[pop_years.length - 1]
        let g_prev_yr = pop_years[0]

        if (target_year <= pop_years[0]) {
          g_prev_yr = pop_years[0]
          g_next_yr = pop_years[1]
        } else if (target_year >= pop_years[pop_years.length - 1]) {
          g_prev_yr = pop_years[pop_years.length - 2]
          g_next_yr = pop_years[pop_years.length - 1]
        } else {
          for (let x = 0; x < pop_years.length - 1; x++) {
            if (target_year >= pop_years[x] && target_year <= pop_years[x + 1]) {
              g_prev_yr = pop_years[x]
              g_next_yr = pop_years[x + 1]
              break
            }
          }
        }

        let gp0 = city.population[String(g_prev_yr)] || 0
        let gp1 = city.population[String(g_next_yr)] || 0

        if (gp0 >= 0.01 && gp1 >= 0.01 && g_next_yr > g_prev_yr) {
          growth_rate = Math.pow(gp1/gp0, 1/(g_next_yr - g_prev_yr)) - 1
        }
      }

      if (pop < min_pop || pop < 0.01)
        continue

      //Resolve area and density at target year if available
      let area_val: number | undefined = undefined
      let density_val: number | undefined = undefined

      if (city.area) {
        if (city.area[String(target_year)] !== undefined) {
          area_val = city.area[String(target_year)]
        } else {
          let area_keys = Object.keys(city.area).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
          for (let y = area_keys.length - 1; y >= 0; y--) {
            if (area_keys[y] <= target_year) {
              area_val = city.area[String(area_keys[y])]
              break
            }
          }
          if (area_val === undefined && area_keys.length > 0)
            area_val = city.area[String(area_keys[0])]
        }
      }

      if (city.density) {
        if (city.density[String(target_year)] !== undefined) {
          density_val = city.density[String(target_year)]
        } else {
          let density_keys = Object.keys(city.density).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
          for (let z = density_keys.length - 1; z >= 0; z--) {
            if (density_keys[z] <= target_year) {
              density_val = city.density[String(density_keys[z])]
              break
            }
          }
          if (density_val === undefined && density_keys.length > 0)
            density_val = city.density[String(density_keys[0])]
        }
      }

      let resolved_name = StadesterService.resolveCityNameAtYear(city, target_year)

      result_cities.push({
        area: area_val,
        colour: city.colour,
        coords: city.coords,
        country: city.country,
        density: density_val,
        growthRate: growth_rate,
        historical_names: city.historical_names,
        id: city.id,
        key: city.key,
        metadata_name: city.metadata_name,
        name: resolved_name,
        other_names: city.other_names,
        population: pop,
        region: city.region,
      })
    }

    //Sort descending by population
    result_cities.sort((arg0_a, arg0_b) => arg0_b.population - arg0_a.population)

    //Apply max_cities limit
    if (max_cities > 0 && max_cities < result_cities.length)
      result_cities = result_cities.slice(0, max_cities)

    //Return statement
    return result_cities
  },

  /**
   * Retrieves full historical information and timeseries for a given city key.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {string} [arg1_city_key]
   * @param {number | string} [arg2_year]
   *
   * @returns {CityIndexEntry | null}
   */
  getCityByKey: function (
    arg0_dataset_name?: string,
    arg1_city_key?: string,
    arg2_year?: number | string
  ): CityIndexEntry | null {
    //Convert from parameters
    let city_key = arg1_city_key || ''
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let year = arg2_year

    //Declare local instance variables
    let bugged_set = getBuggedCitiesSet()
    let indexed = StadesterService.loadDataset(dataset_name)

    //Guard clauses
    if (!city_key || !indexed)
      return null

    if (isBuggedCityName(city_key, bugged_set))
      return null

    //Check direct key match
    let found = indexed[city_key] || indexed['stadester-' + city_key] || indexed['ghsl-' + city_key] || indexed['oxford-' + city_key]
    if (found) {
      if (isBuggedCityName(found.name, bugged_set) || (found.key && isBuggedCityName(found.key, bugged_set)))
        return null

      if (year !== undefined && year !== null) {
        return {
          ...found,
          name: StadesterService.resolveCityNameAtYear(found, year),
        }
      }
      return found
    }

    //Fallback linear search by key, id or name
    let all_keys = Object.keys(indexed)
    for (let i = 0; i < all_keys.length; i++) {
      let entry = indexed[all_keys[i]]
      if (entry.key === city_key || String(entry.id) === city_key || entry.name === city_key) {
        if (isBuggedCityName(entry.name, bugged_set) || (entry.key && isBuggedCityName(entry.key, bugged_set)))
          return null

        if (year !== undefined && year !== null) {
          return {
            ...entry,
            name: StadesterService.resolveCityNameAtYear(entry, year),
          }
        }
        return entry
      }
    }

    //Return statement
    return null
  },

  /**
   * Returns top N largest cities at a specific year for chart visualisations.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {number} [arg1_year=1950]
   * @param {number} [arg2_limit=20]
   *
   * @returns {CityRenderPoint[]}
   */
  getLargestCitiesAtYear: function (
    arg0_dataset_name?: string,
    arg1_year?: number,
    arg2_limit?: number
  ): CityRenderPoint[] {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let limit = arg2_limit !== undefined ? arg2_limit : 20
    let year = arg1_year !== undefined ? arg1_year : 1950

    //Declare local instance variables
    let raw_cities = StadesterService.getCitiesAtYear(dataset_name, year, { max_cities: limit, min_pop: 0.01 })

    //Function body
    for (let i = 0; i < raw_cities.length; i++) {
      raw_cities[i].name = getPrimaryCityName(raw_cities[i].name, raw_cities[i].population)
    }

    //Return statement
    return raw_cities
  },

  /**
   * Returns compact columnar arrays for fast transfer and minimal JSON serialization overhead.
   *
   * @param {string} [arg0_dataset_name='stadester_1.1']
   * @param {number} [arg1_year=1950]
   * @param {StadesterQueryOptions} [arg2_options]
   *
   * @returns {CompactCitiesPayload}
   */
  getCompactCitiesAtYear: function (
    arg0_dataset_name?: string,
    arg1_year?: number,
    arg2_options?: StadesterQueryOptions
  ): CompactCitiesPayload {
    //Convert from parameters
    let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'
    let options = (arg2_options) ? arg2_options : {}
    let year = arg1_year !== undefined ? arg1_year : 1950

    //Declare local instance variables
    let cities = StadesterService.getCitiesAtYear(dataset_name, year, options)
    let len = cities.length
    let coords: number[] = new Array(len * 2)
    let countries: (string | undefined)[] = new Array(len)
    let growth: number[] = new Array(len)
    let keys: string[] = new Array(len)
    let names: string[] = new Array(len)
    let pops: number[] = new Array(len)
    let regions: (string | undefined)[] = new Array(len)

    //Function body
    for (let i = 0; i < len; i++) {
      let c = cities[i]
      keys[i] = c.key
      names[i] = getPrimaryCityName(c.name, c.population)
      countries[i] = c.country
      coords[i * 2] = c.coords[0]
      coords[i * 2 + 1] = c.coords[1]
      pops[i] = c.population
      growth[i] = c.growthRate !== undefined ? Math.round(c.growthRate * 10000) / 10000 : 0
      regions[i] = c.region
    }

    //Return statement
    return {
      coords,
      count: len,
      countries,
      growth,
      keys,
      names,
      pops,
      regions,
    }
  },
}

