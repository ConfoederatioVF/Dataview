import fs from 'fs'
import path from 'path'
import { isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import { FilepathDefines } from './filepath_defines.ts'
import { indexHistoricalCities, loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { getDefaultStadesterDatasetId, resolveStadesterVersionPaths } from './stadester_config_loader.ts'
import { applyCityMetadata, applyStateCapitals, clearCityMetadataCache, resolveCityMetadataPath } from './stadester_metadata.ts'
import type { CityIndexEntry } from './stadester_types.ts'

let datasets_cache = new Map<string, Record<string, CityIndexEntry>>()
let INDEX_CACHE_VERSION = 5
let spatial_grid_by_dataset = new Map<string, Map<string, string[]>>()

export interface ResolvedDatasetSources {
  dir_path: string
  files: string[]
  is_partitioned: boolean
  manifest_path: string
  max_mtime_ms: number
}

/**
 * Clears in-memory Stadestér dataset and spatial grid caches so config/path updates take effect immediately.
 *
 * @returns {void}
 */
export function clearStadesterLoaderCache (): void {
  //Function body
  datasets_cache.clear()
  spatial_grid_by_dataset.clear()
}


/**
 * Resolves either a partitioned Viscount macro-region Stadestér directory (`stadester_manifest.json`),
 * a versioned subfolder JSON file (`<dataset>/<dataset>.json`), or a flat legacy JSON dataset file,
 * consulting common/layers/stadester.json5 version paths first.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {ResolvedDatasetSources}
 */
export function resolveDatasetSourceFiles (arg0_dataset_name?: string): ResolvedDatasetSources {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let base_dir = FilepathDefines.get().root_folders.l_stad
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let configured = resolveStadesterVersionPaths(dataset_name)
  let files: string[] = []
  let legacy_path = path.join(base_dir, `${clean_stem}.json`)
  let max_mtime_ms = 0
  let part_dir = path.join(base_dir, clean_stem)
  let manifest_path = path.join(part_dir, 'stadester_manifest.json')
  let versioned_file_path = path.join(part_dir, `${clean_stem}.json`)

  //Function body
  if (configured.path) {
    let resolved_path = configured.path
    if (fs.existsSync(resolved_path)) {
      let stat = fs.statSync(resolved_path)
      if (stat.isFile()) {
        //Return statement
        return {
          dir_path: path.dirname(resolved_path),
          files: [resolved_path],
          is_partitioned: false,
          manifest_path: '',
          max_mtime_ms: stat.mtimeMs,
        }
      }
      if (stat.isDirectory()) {
        part_dir = resolved_path
        manifest_path = path.join(part_dir, 'stadester_manifest.json')
        versioned_file_path = path.join(part_dir, `${clean_stem}.json`)
      }
    } else if (resolved_path.endsWith('.json')) {
      versioned_file_path = resolved_path
      part_dir = path.dirname(resolved_path)
      manifest_path = path.join(part_dir, 'stadester_manifest.json')
    } else {
      part_dir = resolved_path
      manifest_path = path.join(part_dir, 'stadester_manifest.json')
      versioned_file_path = path.join(part_dir, `${clean_stem}.json`)
    }
  }

  if (fs.existsSync(manifest_path)) {
    max_mtime_ms = fs.statSync(manifest_path).mtimeMs
    try {
      let manifest = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
      let regions = Array.isArray(manifest.regions) ? manifest.regions : []
      for (let i = 0; i < regions.length; i++) {
        let reg_files = Array.isArray(regions[i].files) ? regions[i].files : []
        for (let x = 0; x < reg_files.length; x++) {
          let shard_path = path.join(part_dir, reg_files[x])
          if (fs.existsSync(shard_path)) {
            let shard_mtime = fs.statSync(shard_path).mtimeMs
            if (shard_mtime > max_mtime_ms)
              max_mtime_ms = shard_mtime
            files.push(shard_path)
          }
        }
      }
    } catch (arg0_err) {
      console.error(`[StadesterLoader] Failed parsing Stadestér manifest at ${manifest_path}:`, arg0_err)
    }

    //Return statement
    return {
      dir_path: part_dir,
      files: files,
      is_partitioned: true,
      manifest_path: manifest_path,
      max_mtime_ms: max_mtime_ms,
    }
  }

  if (fs.existsSync(versioned_file_path)) {
    max_mtime_ms = fs.statSync(versioned_file_path).mtimeMs
    return {
      dir_path: part_dir,
      files: [versioned_file_path],
      is_partitioned: false,
      manifest_path: '',
      max_mtime_ms: max_mtime_ms,
    }
  }

  if (fs.existsSync(legacy_path))
    max_mtime_ms = fs.statSync(legacy_path).mtimeMs

  //Return statement
  return {
    dir_path: base_dir,
    files: fs.existsSync(legacy_path) ? [legacy_path] : [],
    is_partitioned: false,
    manifest_path: '',
    max_mtime_ms: max_mtime_ms,
  }
}


/**
 * Resolves the absolute path to a Stadestér dataset directory (when partitioned) or versioned/legacy JSON file.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {string}
 */
export function getDatasetFilePath (arg0_dataset_name?: string): string {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let base_dir = FilepathDefines.get().root_folders.l_stad
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let configured = resolveStadesterVersionPaths(dataset_name)
  let part_dir = path.join(base_dir, clean_stem)
  let versioned_file_path = path.join(part_dir, `${clean_stem}.json`)

  //Function body
  if (configured.path) {
    if (fs.existsSync(configured.path))
      return configured.path
    return configured.path
  }
  if (fs.existsSync(path.join(part_dir, 'stadester_manifest.json')))
    return part_dir
  if (fs.existsSync(versioned_file_path))
    return versioned_file_path

  //Return statement
  return path.join(base_dir, `${clean_stem}.json`)
}


/**
 * Checks whether a persisted Stadestér cache file is newer than dataset shards, metadata, and capitals.
 *
 * @param {string} arg0_cache_path
 * @param {number} arg1_max_source_mtime
 * @param {string} [arg2_dataset_name]
 *
 * @returns {boolean}
 */
function isDatasetDiskCacheFresh (
  arg0_cache_path: string,
  arg1_max_source_mtime: number,
  arg2_dataset_name?: string
): boolean {
  //Convert from parameters
  let cache_path = arg0_cache_path
  let dataset_name = (arg2_dataset_name) ? arg2_dataset_name : getDefaultStadesterDatasetId()
  let max_source_mtime = arg1_max_source_mtime

  //Declare local instance variables
  let cap_file_path = FilepathDefines.get().filepaths.stadester_capitals
  let meta_file_path = resolveCityMetadataPath(dataset_name)

  //Guard clauses
  if (!fs.existsSync(cache_path))
    return false

  //Function body
  let cache_stat = fs.statSync(cache_path)
  if (cache_stat.size <= 1000 || cache_stat.mtimeMs < max_source_mtime)
    return false
  if (fs.existsSync(meta_file_path) && fs.statSync(meta_file_path).mtimeMs > cache_stat.mtimeMs)
    return false
  if (fs.existsSync(cap_file_path) && fs.statSync(cap_file_path).mtimeMs > cache_stat.mtimeMs)
    return false

  //Return statement
  return true
}


/**
 * Stream-writes the indexed dataset record to disk in 8 MB chunks so global datasets never hit V8 string limits.
 *
 * @param {string} arg0_file_path
 * @param {Record<string, CityIndexEntry>} arg1_indexed
 *
 * @returns {void}
 */
function writeServerIndexCache (arg0_file_path: string, arg1_indexed: Record<string, CityIndexEntry>): void {
  //Convert from parameters
  let file_path = arg0_file_path
  let indexed = arg1_indexed

  //Declare local instance variables
  let all_keys = Object.keys(indexed)
  let buffer: string[] = [`{"_v":${INDEX_CACHE_VERSION},"cities":{`]
  let buffer_len = buffer[0].length
  let cache_dir = path.dirname(file_path)
  let fd: number
  let flush_threshold = 8*1024*1024

  //Function body
  if (!fs.existsSync(cache_dir))
    fs.mkdirSync(cache_dir, { recursive: true })

  fd = fs.openSync(file_path, 'w')
  try {
    for (let i = 0; i < all_keys.length; i++) {
      let key = all_keys[i]
      let chunk = (i > 0 ? ',' : '') + JSON.stringify(key) + ':' + JSON.stringify(indexed[key])
      buffer.push(chunk)
      buffer_len += chunk.length
      if (buffer_len >= flush_threshold) {
        fs.writeSync(fd, buffer.join(''), null, 'utf-8')
        buffer = []
        buffer_len = 0
      }
    }
    buffer.push('}}')
    fs.writeSync(fd, buffer.join(''), null, 'utf-8')
  } finally {
    fs.closeSync(fd)
  }
}


/**
 * Ensures the lightweight static index cache exists on disk for immediate rendering.
 * Stream-writes entries row-by-row so large global datasets never exceed V8 string limits.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 *
 * @returns {string} - Absolute path to cached lite JSON file
 */
export function ensureLiteCache (arg0_dataset_name?: string): string {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cache_dir = FilepathDefines.get().root_folders.l_stad_cache
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let lite_file_path = path.join(cache_dir, `${clean_stem}_lite.json`)
  let source_info = resolveDatasetSourceFiles(clean_stem)

  //Guard clauses
  if (source_info.files.length > 0 && isDatasetDiskCacheFresh(lite_file_path, source_info.max_mtime_ms, clean_stem)) {
    let is_v2 = false
    try {
      let head_buf = Buffer.alloc(1024)
      let fd = fs.openSync(lite_file_path, 'r')
      let bytes_read = fs.readSync(fd, head_buf, 0, 1024, 0)
      fs.closeSync(fd)
      is_v2 = head_buf.toString('utf-8', 0, bytes_read).includes('"_v2":true')
    } catch {
      is_v2 = false
    }
    if (is_v2)
      return lite_file_path
  }

  //Function body
  if (!fs.existsSync(cache_dir))
    fs.mkdirSync(cache_dir, { recursive: true })

  let indexed = loadDataset(clean_stem)
  let all_keys = Object.keys(indexed)
  let buffer: string[] = ['[']
  let buffer_len = 1
  let fd = fs.openSync(lite_file_path, 'w')
  let flush_threshold = 8*1024*1024

  try {
    for (let i = 0; i < all_keys.length; i++) {
      let c = indexed[all_keys[i]]
      let row_obj = {
        _v2: i === 0 ? true : undefined,
        colour: c.colour,
        coords: c.coords,
        country: c.country,
        ghsl_name: c.metadata_name || c.name || c.ghsl_name || c.reconciled_name,
        historical_names: c.historical_names,
        id: c.id,
        key: c.key,
        max_pop: c.max_pop,
        max_year: c.max_year,
        metadata_name: c.metadata_name || c.name,
        min_year: c.min_year,
        name: c.name,
        other_names: c.other_names,
        reconciled_name: c.metadata_name || c.name || c.reconciled_name || c.ghsl_name,
        region: c.region,
      }
      let chunk = (i > 0 ? ',' : '') + JSON.stringify(row_obj)
      buffer.push(chunk)
      buffer_len += chunk.length
      if (buffer_len >= flush_threshold) {
        fs.writeSync(fd, buffer.join(''), null, 'utf-8')
        buffer = []
        buffer_len = 0
      }
    }
    buffer.push(']')
    fs.writeSync(fd, buffer.join(''), null, 'utf-8')
  } finally {
    fs.closeSync(fd)
  }

  console.log(`[StadesterLoader] Pre-cached lightweight index for ${clean_stem}: ${lite_file_path} (${(fs.statSync(lite_file_path).size / (1024*1024)).toFixed(2)} MB)`)

  //Return statement
  return lite_file_path
}


/**
 * Loads and indexes a Stadestér dataset (partitioned macro-region shards or versioned/legacy JSON) into server memory.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 *
 * @returns {Record<string, CityIndexEntry>}
 */
export function loadDataset (arg0_dataset_name?: string): Record<string, CityIndexEntry> {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let city_seq_id = 0
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let indexed_record: Record<string, CityIndexEntry> = {}
  let source_info = resolveDatasetSourceFiles(clean_stem)

  //Guard clauses
  if (datasets_cache.has(clean_stem))
    return datasets_cache.get(clean_stem)!
  if (datasets_cache.has(dataset_name))
    return datasets_cache.get(dataset_name)!

  if (source_info.files.length === 0) {
    console.warn(`[StadesterLoader] Dataset not found: ${getDatasetFilePath(clean_stem)}`)
    return {}
  }

  //Check persisted server index cache and lite disk cache
  let cache_dir = FilepathDefines.get().root_folders.l_stad_cache
  let indexed_file_path = path.join(cache_dir, `${clean_stem}_indexed.json`)
  let lite_file_path = path.join(cache_dir, `${clean_stem}_lite.json`)
  let lite_name_map = new Map<string, string>()

  if (isDatasetDiskCacheFresh(indexed_file_path, source_info.max_mtime_ms, clean_stem)) {
    try {
      let cached_bundle = JSON.parse(fs.readFileSync(indexed_file_path, 'utf-8'))
      if (cached_bundle && cached_bundle._v === INDEX_CACHE_VERSION && cached_bundle.cities && typeof cached_bundle.cities === 'object') {
        indexed_record = cached_bundle.cities
        indexHistoricalCities(indexed_record, false, true)
        datasets_cache.set(clean_stem, indexed_record)
        if (dataset_name !== clean_stem)
          datasets_cache.set(dataset_name, indexed_record)

        try {
          ensureLiteCache(clean_stem)
        } catch (arg0_cache_err) {
          console.warn('[StadesterLoader] Failed to ensure lite cache:', arg0_cache_err)
        }

        console.log(`[StadesterLoader] Loaded ${Object.keys(indexed_record).length} pre-indexed cities from cache for ${clean_stem}.`)

        //Return statement
        return indexed_record
      }
    } catch (arg0_err) {
      console.warn('[StadesterLoader] Failed to load server index cache, rebuilding:', arg0_err)
    }
  }

  if (isDatasetDiskCacheFresh(lite_file_path, source_info.max_mtime_ms, clean_stem)) {
    try {
      let lite_data = JSON.parse(fs.readFileSync(lite_file_path, 'utf-8'))
      if (Array.isArray(lite_data) && lite_data[0]?._v2) {
        for (let i = 0; i < lite_data.length; i++) {
          if (lite_data[i].key && lite_data[i].name && lite_data[i].name !== 'City of London') {
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
  let src_label = source_info.is_partitioned
    ? `${source_info.dir_path} (${source_info.files.length} macro-region shards)`
    : source_info.files[0]
  console.log(`[StadesterLoader] Indexing dataset ${clean_stem} from ${src_label}...`)

  //Parse and index entries sequentially per shard in a single pass
  for (let s = 0; s < source_info.files.length; s++) {
    let raw_data: Record<string, any> = JSON.parse(fs.readFileSync(source_info.files[s], 'utf-8'))
    let all_city_keys = Object.keys(raw_data)

    for (let i = 0; i < all_city_keys.length; i++) {
      let key = all_city_keys[i]
      let c = raw_data[key]
      let pop_obj = c.population || {}
      let pop_years = Object.keys(pop_obj).map(Number).sort((arg0_a, arg1_b) => arg0_a - arg1_b)
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

      if (key === 'London (agglomeration)-unkingd' ||
          key === 'London (agglomeration)-United Kingdom' ||
          key === 'stadester-London (Greater London)-United Kingdom' ||
          clean_display_name === 'City of London' ||
          (c.coords && Math.abs(c.coords[0] - 51.5134) < 0.01 && Math.abs(c.coords[1] - (-0.08925)) < 0.01)) {
        clean_display_name = 'London'
      }

      let city_coords = c.coords
      if (key === 'stadester-Lamphun-Thailand' || (c.name === 'Lamphun' && c.country === 'Thailand')) {
        if (city_coords && city_coords[0] < 10)
          city_coords = [18.5744357, 99.00369719999999]
      }

      city_seq_id++
      let resolved_sources = Array.isArray(c.sources)
        ? c.sources
        : (typeof c.type === 'string' && c.type ? [c.type] : undefined)
      let indexed_entry: CityIndexEntry = {
        area: c.area,
        colour: c.colour,
        coords: city_coords,
        country: c.country,
        density: c.density,
        elevation: c.elevation,
        ghsl_name: clean_display_name,
        id: c.id !== undefined ? c.id : city_seq_id,
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
        sources: resolved_sources,
        years: pop_years,
      }
      if (c.type !== undefined)
        indexed_entry.type = c.type
      indexed_record[key] = indexed_entry
    }
  }

  if (!indexed_record['stadester-Vaduz-Liechtenstein'] && !indexed_record['Vaduz-Liechtenstein']) {
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
      sources: ['manual'],
      years: [1400, 1500, 1600, 1700, 1800, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
    }
  }

  if (!indexed_record['stadester-Macau-Macao'] && !indexed_record['Macau-Macao']) {
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
      sources: ['manual'],
      years: [1557, 1560, 1600, 1635, 1700, 1750, 1800, 1850, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
    }
  }
  if (!indexed_record['stadester-Macau-Macau'] && !indexed_record['Macau-Macau'] && indexed_record['stadester-Macau-Macao']) {
    indexed_record['stadester-Macau-Macau'] = indexed_record['stadester-Macau-Macao']
  }

  if (!indexed_record['stadester-Saint Helier-Jersey'] && !indexed_record['Saint Helier-Jersey']) {
    indexed_record['stadester-Saint Helier-Jersey'] = {
      coords: [49.1858, -2.11],
      country: 'Jersey',
      elevation: 15,
      id: 'stadester-Saint Helier-Jersey',
      key: 'stadester-Saint Helier-Jersey',
      max_pop: 35800,
      max_year: 2020,
      min_year: 1291,
      name: 'Saint Helier',
      original_names: ['saint helier', 'st. helier'],
      other_names: ['Saint Helier', 'St. Helier', 'St Helier'],
      population: {
        '1291': 500,
        '1400': 600,
        '1500': 800,
        '1600': 1200,
        '1700': 2000,
        '1800': 4000,
        '1850': 29000,
        '1900': 29000,
        '1950': 26000,
        '1970': 28000,
        '1980': 27000,
        '1990': 28000,
        '2000': 28300,
        '2010': 33500,
        '2020': 35800,
      },
      region: 'europe',
      sources: ['manual'],
      years: [1291, 1400, 1500, 1600, 1700, 1800, 1850, 1900, 1950, 1970, 1980, 1990, 2000, 2010, 2020],
    }
  }

  indexHistoricalCities(indexed_record, false)
  applyCityMetadata(indexed_record, clean_stem)
  applyStateCapitals(indexed_record)
  datasets_cache.set(clean_stem, indexed_record)
  if (dataset_name !== clean_stem)
    datasets_cache.set(dataset_name, indexed_record)
  console.log(`[StadesterLoader] Successfully indexed ${Object.keys(indexed_record).length} cities for ${clean_stem}.`)

  try {
    writeServerIndexCache(indexed_file_path, indexed_record)
  } catch (arg0_index_err) {
    console.warn('[StadesterLoader] Failed to write server index cache:', arg0_index_err)
  }

  try {
    ensureLiteCache(clean_stem)
  } catch (arg0_cache_err) {
    console.warn('[StadesterLoader] Failed to ensure lite cache:', arg0_cache_err)
  }

  //Return statement
  return indexed_record
}


/**
 * Retrieves or builds a 1x1 degree spatial hash grid for fast proximity candidate queries.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 *
 * @returns {Map<string, string[]>}
 */
export function getSpatialGrid (arg0_dataset_name?: string): Map<string, string[]> {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

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
  clearCityMetadataCache()
}
