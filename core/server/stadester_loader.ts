import fs from 'fs'
import path from 'path'
import { isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import { indexHistoricalCities, loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { applyCityMetadata, applyStateCapitals } from './stadester_metadata.ts'
import type { CityIndexEntry } from './stadester_types.ts'

let datasets_cache = new Map<string, Record<string, CityIndexEntry>>()
let spatial_grid_by_dataset = new Map<string, Map<string, string[]>>()

/**
 * Resolves the absolute path to a Stadestér JSON dataset file.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 *
 * @returns {string}
 */
export function getDatasetFilePath (arg0_dataset_name?: string): string {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

  //Declare local instance variables
  let base_dir = path.resolve(process.cwd(), 'data/stadester')
  let file_name = dataset_name.endsWith('.json') ? dataset_name : `${dataset_name}.json`

  //Return statement
  return path.join(base_dir, file_name)
}


/**
 * Ensures the lightweight static index cache exists on disk for immediate rendering.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 *
 * @returns {string} - Absolute path to cached lite JSON file
 */
export function ensureLiteCache (arg0_dataset_name?: string): string {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

  //Declare local instance variables
  let cache_dir = path.resolve(process.cwd(), 'data/stadester/cache')
  let lite_file_path = path.join(cache_dir, `${dataset_name}_lite.json`)
  let source_file_path = getDatasetFilePath(dataset_name)

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

  let indexed = loadDataset(dataset_name)
  let all_keys = Object.keys(indexed)
  let lite_array: any[] = []

  for (let i = 0; i < all_keys.length; i++) {
    let c = indexed[all_keys[i]]
    lite_array.push({
      colour: c.colour,
      coords: c.coords,
      country: c.country,
      ghsl_name: c.ghsl_name || c.reconciled_name,
      historical_names: c.historical_names,
      id: c.id,
      key: c.key,
      max_pop: c.max_pop,
      max_year: c.max_year,
      metadata_name: c.metadata_name,
      min_year: c.min_year,
      name: c.name,
      other_names: c.other_names,
      reconciled_name: c.reconciled_name || c.ghsl_name,
      region: c.region,
    })
  }

  fs.writeFileSync(lite_file_path, JSON.stringify(lite_array), 'utf-8')
  console.log(`[StadesterLoader] Pre-cached lightweight index for ${dataset_name}: ${lite_file_path} (${(fs.statSync(lite_file_path).size / (1024*1024)).toFixed(2)} MB)`)

  //Return statement
  return lite_file_path
}


/**
 * Loads and indexes a Stadestér dataset into server memory.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 *
 * @returns {Record<string, CityIndexEntry>}
 */
export function loadDataset (arg0_dataset_name?: string): Record<string, CityIndexEntry> {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

  //Declare local instance variables
  let all_city_keys: string[]
  let file_path = getDatasetFilePath(dataset_name)
  let indexed_record: Record<string, CityIndexEntry> = {}
  let raw_data: Record<string, any>
  let raw_text: string

  //Guard clauses
  if (datasets_cache.has(dataset_name))
    return datasets_cache.get(dataset_name)!

  if (!fs.existsSync(file_path)) {
    console.warn(`[StadesterLoader] Dataset file not found: ${file_path}`)
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
        console.log(`[StadesterLoader] Loaded ${lite_name_map.size} pre-resolved city names from ${lite_file_path}`)
      }
    } catch (arg0_err) {
      console.warn('[StadesterLoader] Failed to read lite cache for names:', arg0_err)
    }
  }

  //Function body
  loadGhslCsvNames()
  console.log(`[StadesterLoader] Indexing dataset ${dataset_name} from ${file_path}...`)
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

    if (key === 'stadester-London (Greater London)-United Kingdom' ||
        (c.coords && Math.abs(c.coords[0] - 51.5134) < 0.01 && Math.abs(c.coords[1] - (-0.08925)) < 0.01)) {
      clean_display_name = 'City of London'
    }

    let city_coords = c.coords
    if (key === 'stadester-Lamphun-Thailand' || (c.name === 'Lamphun' && c.country === 'Thailand')) {
      if (city_coords && city_coords[0] < 10)
        city_coords = [18.5744357, 99.00369719999999]
    }

    indexed_record[key] = {
      area: c.area,
      colour: c.colour,
      coords: city_coords,
      country: c.country,
      density: c.density,
      elevation: c.elevation,
      ghsl_name: clean_display_name,
      id: c.id !== undefined ? c.id : i + 1,
      key: c.key || key,
      max_pop: max_p,
      max_year: max_yr,
      min_year: min_yr,
      name: clean_display_name,
      original_names: c.original_names,
      other_names: c.other_names,
      population: pop_obj,
      reconciled_name: clean_display_name,
      region: c.region,
      years: pop_years,
    }
    delete raw_data[key]
  }

  raw_data = {} as any

  if (!indexed_record['stadester-Vaduz-Liechtenstein']) {
    indexed_record['stadester-Vaduz-Liechtenstein'] = {
      coords: [47.141, 9.521],
      country: 'Liechtenstein',
      elevation: 455,
      id: 'stadester-Vaduz-Liechtenstein',
      key: 'stadester-Vaduz-Liechtenstein',
      max_pop: 5700,
      max_year: 2020,
      min_year: 1400,
      name: 'Vaduz',
      original_names: ['vaduz'],
      other_names: ['Vaduz'],
      population: {
        '1400': 300,
        '1500': 400,
        '1600': 500,
        '1700': 600,
        '1800': 800,
        '1900': 1000,
        '1910': 1300,
        '1920': 1400,
        '1930': 1600,
        '1940': 2000,
        '1950': 2700,
        '1960': 3400,
        '1970': 3900,
        '1980': 4600,
        '1990': 4900,
        '2000': 5000,
        '2010': 5200,
        '2020': 5700,
      },
      years: [1400, 1500, 1600, 1700, 1800, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
    }
  }

  if (!indexed_record['stadester-Macau-Macao']) {
    indexed_record['stadester-Macau-Macao'] = {
      colour: [173, 62, 62],
      coords: [22.1987, 113.5439],
      country: 'Macao',
      elevation: 10,
      id: 'stadester-Macau-Macao',
      key: 'stadester-Macau-Macao',
      max_pop: 680000,
      max_year: 2020,
      min_year: 1557,
      name: 'Macau',
      original_names: ['macau', 'macao'],
      other_names: ['Macau', 'Macao', 'Aomen'],
      population: {
        '1557': 500,
        '1560': 1000,
        '1600': 5000,
        '1635': 35000,
        '1700': 19500,
        '1750': 24000,
        '1800': 30000,
        '1850': 29000,
        '1900': 63000,
        '1910': 75000,
        '1920': 84000,
        '1930': 120000,
        '1940': 150000,
        '1950': 188000,
        '1960': 169000,
        '1970': 249000,
        '1980': 242000,
        '1990': 352000,
        '2000': 432000,
        '2010': 540000,
        '2020': 680000,
      },
      region: 'eastasia',
      years: [1557, 1560, 1600, 1635, 1700, 1750, 1800, 1850, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
    }
  }
  if (!indexed_record['stadester-Macau-Macau']) {
    indexed_record['stadester-Macau-Macau'] = indexed_record['stadester-Macau-Macao']
  }

  applyCityMetadata(indexed_record)
  applyStateCapitals(indexed_record)
  datasets_cache.set(dataset_name, indexed_record)
  console.log(`[StadesterLoader] Successfully indexed ${all_city_keys.length} cities for ${dataset_name}.`)

  try {
    ensureLiteCache(dataset_name)
  } catch (arg0_cache_err) {
    console.warn('[StadesterLoader] Failed to ensure lite cache:', arg0_cache_err)
  }

  //Return statement
  return indexed_record
}


/**
 * Retrieves or builds a 1x1 degree spatial hash grid for fast proximity candidate queries.
 *
 * @param {string} [arg0_dataset_name='stadester_1.1']
 *
 * @returns {Map<string, string[]>}
 */
export function getSpatialGrid (arg0_dataset_name?: string): Map<string, string[]> {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : 'stadester_1.1'

  //Declare local instance variables
  let grid: Map<string, string[]>
  let indexed: Record<string, CityIndexEntry>
  let keys: string[]

  //Guard clauses
  if (spatial_grid_by_dataset.has(dataset_name))
    return spatial_grid_by_dataset.get(dataset_name)!

  //Function body
  grid = new Map<string, string[]>()
  indexed = loadDataset(dataset_name)
  keys = Object.keys(indexed)

  for (let i = 0; i < keys.length; i++) {
    let c = indexed[keys[i]]
    if (!c || !c.coords)
      continue
    let cell_x = Math.floor(c.coords[1])
    let cell_y = Math.floor(c.coords[0])
    let cell_key = `${cell_x}_${cell_y}`
    let bucket = grid.get(cell_key)
    if (!bucket) {
      bucket = []
      grid.set(cell_key, bucket)
    }
    bucket.push(keys[i])
  }

  spatial_grid_by_dataset.set(dataset_name, grid)

  //Return statement
  return grid
}


/**
 * Returns city keys within a specified coordinate radius using the spatial index grid.
 *
 * @param {string} arg0_dataset_name
 * @param {number} arg1_lat
 * @param {number} arg2_lon
 * @param {number} [arg3_radius=0.20]
 *
 * @returns {string[]}
 */
export function getNearbyCityKeys (
  arg0_dataset_name: string,
  arg1_lat: number,
  arg2_lon: number,
  arg3_radius?: number
): string[] {
  //Convert from parameters
  let dataset_name = arg0_dataset_name
  let lat = arg1_lat
  let lon = arg2_lon
  let radius = arg3_radius !== undefined ? arg3_radius : 0.20

  //Declare local instance variables
  let grid = getSpatialGrid(dataset_name)
  let max_x = Math.floor(lon + radius)
  let max_y = Math.floor(lat + radius)
  let min_x = Math.floor(lon - radius)
  let min_y = Math.floor(lat - radius)
  let result: string[] = []

  //Function body
  for (let i = min_x; i <= max_x; i++) {
    for (let x = min_y; x <= max_y; x++) {
      let bucket = grid.get(`${i}_${x}`)
      if (bucket) {
        for (let y = 0; y < bucket.length; y++)
          result.push(bucket[y])
      }
    }
  }

  //Return statement
  return result
}


/**
 * Clears in-memory dataset cache and spatial indices.
 *
 * @returns {void}
 */
export function clearDatasetCache (): void {
  datasets_cache.clear()
  spatial_grid_by_dataset.clear()
}
