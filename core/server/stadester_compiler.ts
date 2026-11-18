import fs from 'fs'
import os from 'os'
import path from 'path'
import { DEFAULT_RESOURCE_LIMITS_CONFIG, getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import { isBuggedCityName, isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  buildAliasStemSet,
  computeHaversineDistanceKm,
  isSyntheticGhslEpochStub,
  matchesAliasStemSet,
  normalizeCapitalNameStem,
  normalizeCityAlias,
  normalizeCityKey,
  normalizePrimaryCityKey,
  parseYearMonthDay,
  type AliasStemSet,
  type CapitalRecord,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'
import { FilepathDefines } from './filepath_defines.ts'
import { loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { getDefaultStadesterDatasetId } from './stadester_config_loader.ts'
import { resolveDatasetSourceFiles } from './stadester_loader.ts'
import { getStateById, getStateCapitals, loadCityMetadata, resolveCityMetadataPath } from './stadester_metadata.ts'
import {
  buildPrimaryCityNameSet,
  doesLabelMatchAnotherNearbyCity,
  getBuggedCitiesSet,
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  mergeCityCapitalRecords,
  mergeCityOtherNames,
  selectBestCapitalCandidateForTimeline,
  type CityIndexEntry,
} from './stadester_types.ts'
import {
  BINARY_FORMAT_VERSION,
  BINARY_MAGIC,
  FLAG_HAS_CAPITALS,
  FLAG_HAS_COLOUR,
  FLAG_HAS_HIST_NAMES,
  FLAG_IS_BUGGED,
  FLAG_IS_GHSL,
  SHARD_BIN_MAGIC,
  fnv1a32,
  getSpatialCellKey2Deg,
  packStringArray,
  readPackedString,
  readSectionedBinaryFile,
  thinTimeSeries,
  toTypedArray,
  writeSectionedBinaryFile,
  type BinaryBuildManifest,
  type BinaryDatasetStore,
} from './stadester_binary_format.ts'

let active_binary_compiles = new Set<string>()
let binary_store_cache = new Map<string, BinaryDatasetStore>()

/**
 * Clears cached in-memory binary stores for Stadestér datasets.
 *
 * @returns {void}
 */
export function clearBinaryStoreCache (): void {
  //Function body
  binary_store_cache.clear()
}


/**
 * Computes a fast filesystem signature string (`size:mtimeMs`) for change detection.
 *
 * @param {string} arg0_file_path
 *
 * @returns {string}
 */
function getFileSignature (arg0_file_path: string): string {
  //Convert from parameters
  let file_path = arg0_file_path

  //Guard clauses
  if (!file_path || !fs.existsSync(file_path))
    return 'missing'

  //Function body
  try {
    let st = fs.statSync(file_path)
    //Return statement
    return `${st.size}:${Math.round(st.mtimeMs)}`
  } catch {
    //Return statement
    return 'error'
  }
}


/**
 * Compiles one raw JSON regional shard into `<slug>.idx.bin` and `<slug>.detail.pack`
 * while streaming detail records in 8 MB chunks and thinning plateau time-series points.
 *
 * @param {string} arg0_shard_path
 * @param {string} arg1_idx_path
 * @param {string} arg2_detail_path
 *
 * @returns {number} Compiled settlement count in this shard
 */
function compileRawShardToBinary (
  arg0_shard_path: string,
  arg1_idx_path: string,
  arg2_detail_path: string
): number {
  //Convert from parameters
  let detail_path = arg2_detail_path
  let idx_path = arg1_idx_path
  let shard_path = arg0_shard_path

  //Declare local instance variables
  let all_city_keys: string[]
  let colour_arr: number[] = []
  let countries: string[] = []
  let detail_dir = path.dirname(detail_path)
  let detail_fd: number
  let detail_lens: number[] = []
  let detail_offsets: number[] = []
  let flags_arr: number[] = []
  let ids: string[] = []
  let keys: string[] = []
  let lats: number[] = []
  let lons: number[] = []
  let max_pops: number[] = []
  let max_years: number[] = []
  let min_years: number[] = []
  let names: string[] = []
  let other_joined: string[] = []
  let pop_lens: number[] = []
  let pop_offs: number[] = []
  let pop_vals_all: number[] = []
  let pop_years_all: number[] = []
  let raw_data: Record<string, any>
  let regions: string[] = []
  let running_detail_offset = 0
  let write_chunks: string[] = []
  let write_chunks_bytes = 0

  //Function body
  if (!fs.existsSync(detail_dir))
    fs.mkdirSync(detail_dir, { recursive: true })

  loadGhslCsvNames()
  raw_data = JSON.parse(fs.readFileSync(shard_path, 'utf-8'))
  all_city_keys = Object.keys(raw_data)

  let tmp_detail_path = `${detail_path}.tmp.${process.pid}`
  detail_fd = fs.openSync(tmp_detail_path, 'w')

  try {
    for (let i = 0; i < all_city_keys.length; i++) {
      let key = all_city_keys[i]
      let c = raw_data[key]
      if (!c || !Array.isArray(c.coords) || c.coords.length < 2)
        continue

      let lat = Number(c.coords[0])
      let lon = Number(c.coords[1])
      if (!Number.isFinite(lat) || !Number.isFinite(lon))
        continue

      let pop_thinned = thinTimeSeries(c.population)
      let min_yr = pop_thinned.years.length > 0 ? pop_thinned.years[0] : 0
      let max_yr = pop_thinned.years.length > 0 ? pop_thinned.years[pop_thinned.years.length - 1] : 0
      let max_p = 0
      for (let x = 0; x < pop_thinned.vals.length; x++) {
        if (pop_thinned.vals[x] > max_p)
          max_p = pop_thinned.vals[x]
      }

      let clean_display_name = resolveCityDisplayName(key, c.name || key, [lat, lon], max_p, c.id)
      if (
        key === 'London (agglomeration)-unkingd' ||
        key === 'London (agglomeration)-United Kingdom' ||
        key === 'stadester-London (Greater London)-United Kingdom' ||
        clean_display_name === 'City of London' ||
        (Math.abs(lat - 51.5134) < 0.01 && Math.abs(lon - (-0.08925)) < 0.01)
      ) {
        clean_display_name = 'London'
      }

      let city_lat = lat
      let city_lon = lon
      if (key === 'stadester-Lamphun-Thailand' || (c.name === 'Lamphun' && c.country === 'Thailand')) {
        if (city_lat < 10) {
          city_lat = 18.5744357
          city_lon = 99.00369719999999
        }
      }

      let resolved_key = c.key || key
      let resolved_id = c.id !== undefined ? String(c.id) : resolved_key
      let resolved_sources = Array.isArray(c.sources)
        ? c.sources
        : (typeof c.type === 'string' && c.type ? [c.type] : undefined)

      let area_thinned = thinTimeSeries(c.area, 4)
      let density_thinned = thinTimeSeries(c.density, 3)

      let compact_pop_obj: Record<string, number> = {}
      for (let x = 0; x < pop_thinned.years.length; x++)
        compact_pop_obj[String(pop_thinned.years[x])] = pop_thinned.vals[x]

      let compact_area_obj: Record<string, number> | undefined = undefined
      if (area_thinned.years.length > 0) {
        compact_area_obj = {}
        for (let x = 0; x < area_thinned.years.length; x++)
          compact_area_obj[String(area_thinned.years[x])] = area_thinned.vals[x]
      }

      let compact_density_obj: Record<string, number> | undefined = undefined
      if (density_thinned.years.length > 0) {
        compact_density_obj = {}
        for (let x = 0; x < density_thinned.years.length; x++)
          compact_density_obj[String(density_thinned.years[x])] = density_thinned.vals[x]
      }

      let detail_record: Record<string, any> = {
        coords: [city_lat, city_lon],
        country: c.country,
        id: c.id !== undefined ? c.id : resolved_id,
        key: resolved_key,
        max_pop: max_p,
        max_year: max_yr,
        min_year: min_yr,
        name: clean_display_name,
        population: compact_pop_obj,
        years: pop_thinned.years,
      }
      if (compact_area_obj)
        detail_record.area = compact_area_obj
      if (c.colour)
        detail_record.colour = c.colour
      if (compact_density_obj)
        detail_record.density = compact_density_obj
      if (c.elevation !== undefined)
        detail_record.elevation = c.elevation
      if (c.other_names !== undefined)
        detail_record.other_names = c.other_names
      if (c.region !== undefined)
        detail_record.region = c.region
      if (resolved_sources !== undefined)
        detail_record.sources = resolved_sources
      if (c.type !== undefined)
        detail_record.type = c.type

      let detail_line = JSON.stringify(detail_record)
      let detail_byte_len = Buffer.byteLength(detail_line, 'utf8')

      detail_offsets.push(running_detail_offset)
      detail_lens.push(detail_byte_len)
      running_detail_offset += detail_byte_len

      write_chunks.push(detail_line)
      write_chunks_bytes += detail_byte_len
      if (write_chunks_bytes >= 8*1024*1024) {
        fs.writeSync(detail_fd, write_chunks.join(''), null, 'utf-8')
        write_chunks = []
        write_chunks_bytes = 0
      }

      let alias_list: string[] = []
      if (Array.isArray(c.other_names)) {
        for (let x = 0; x < c.other_names.length && alias_list.length < 12; x++) {
          let s = String(c.other_names[x] || '').trim()
          if (s)
            alias_list.push(s)
        }
      } else if (typeof c.other_names === 'string' && c.other_names.trim()) {
        alias_list.push(c.other_names.trim())
      }

      let flag_val = 0
      if (resolved_key.startsWith('ghsl-'))
        flag_val |= FLAG_IS_GHSL
      if (Array.isArray(c.colour) && c.colour.length >= 3) {
        flag_val |= FLAG_HAS_COLOUR
        colour_arr.push(c.colour[0] & 255, c.colour[1] & 255, c.colour[2] & 255)
      } else {
        colour_arr.push(0, 0, 0)
      }

      lats.push(city_lat)
      lons.push(city_lon)
      min_years.push(Math.max(-32768, Math.min(32767, min_yr)))
      max_years.push(Math.max(-32768, Math.min(32767, max_yr)))
      max_pops.push(max_p)
      flags_arr.push(flag_val)
      keys.push(resolved_key)
      names.push(clean_display_name)
      countries.push(c.country ? String(c.country) : '')
      regions.push(c.region ? String(c.region) : '')
      ids.push(resolved_id)
      other_joined.push(alias_list.join('\x1f'))

      pop_offs.push(pop_years_all.length)
      pop_lens.push(pop_thinned.years.length)
      for (let x = 0; x < pop_thinned.years.length; x++) {
        pop_years_all.push(Math.max(-32768, Math.min(32767, pop_thinned.years[x])))
        pop_vals_all.push(pop_thinned.vals[x])
      }
    }

    if (write_chunks.length > 0)
      fs.writeSync(detail_fd, write_chunks.join(''), null, 'utf-8')
  } finally {
    fs.closeSync(detail_fd)
  }

  fs.renameSync(tmp_detail_path, detail_path)

  let packed_keys = packStringArray(keys)
  let packed_names = packStringArray(names)
  let packed_countries = packStringArray(countries)
  let packed_regions = packStringArray(regions)
  let packed_ids = packStringArray(ids)
  let packed_others = packStringArray(other_joined)

  writeSectionedBinaryFile(
    idx_path,
    SHARD_BIN_MAGIC,
    {
      count: keys.length,
      pop_count: pop_years_all.length,
    },
    [
      { data: new Float32Array(lats), name: 'lat' },
      { data: new Float32Array(lons), name: 'lon' },
      { data: new Int16Array(min_years), name: 'min_year' },
      { data: new Int16Array(max_years), name: 'max_year' },
      { data: new Float32Array(max_pops), name: 'max_pop' },
      { data: new Uint8Array(flags_arr), name: 'flags' },
      { data: new Uint8Array(colour_arr), name: 'colours' },
      { data: new Float64Array(detail_offsets), name: 'detail_offset' },
      { data: new Uint32Array(detail_lens), name: 'detail_len' },
      { data: new Uint32Array(pop_offs), name: 'pop_off' },
      { data: new Uint16Array(pop_lens), name: 'pop_len' },
      { data: new Int16Array(pop_years_all), name: 'pop_years' },
      { data: new Float32Array(pop_vals_all), name: 'pop_vals' },
      { data: packed_keys.offsets, name: 'key_off' },
      { data: packed_keys.buf, name: 'key_buf' },
      { data: packed_names.offsets, name: 'name_off' },
      { data: packed_names.buf, name: 'name_buf' },
      { data: packed_countries.offsets, name: 'country_off' },
      { data: packed_countries.buf, name: 'country_buf' },
      { data: packed_regions.offsets, name: 'region_off' },
      { data: packed_regions.buf, name: 'region_buf' },
      { data: packed_ids.offsets, name: 'id_off' },
      { data: packed_ids.buf, name: 'id_buf' },
      { data: packed_others.offsets, name: 'other_off' },
      { data: packed_others.buf, name: 'other_buf' },
    ]
  )

  //Return statement
  return keys.length
}


/**
 * Ensures Vaduz, Macau, and Saint Helier manual fallback settlements exist in the compiled list.
 *
 * @param {any[]} arg0_entries
 * @param {Map<string, number>} arg1_key_to_temp_idx
 *
 * @returns {void}
 */
function appendManualFallbackCities (
  arg0_entries: any[],
  arg1_key_to_temp_idx: Map<string, number>
): void {
  //Convert from parameters
  let entries = arg0_entries
  let key_map = arg1_key_to_temp_idx

  //Declare local instance variables
  let fallbacks: Array<{ check_keys: string[]; entry: any }> = [
    {
      check_keys: ['stadester-Vaduz-Liechtenstein', 'Vaduz-Liechtenstein'],
      entry: {
        colour: null,
        coords: [47.141, 9.521],
        country: 'Liechtenstein',
        detail_len: 0,
        detail_offset: 0,
        id: 'stadester-Vaduz-Liechtenstein',
        is_ghsl: false,
        key: 'stadester-Vaduz-Liechtenstein',
        max_pop: 5700,
        max_year: 2020,
        min_year: 1400,
        name: 'Vaduz',
        other_names: ['Vaduz'],
        pop_vals: [300, 400, 500, 600, 800, 1000, 1300, 1400, 1600, 2000, 2700, 3400, 3900, 4600, 4900, 5000, 5200, 5700],
        pop_years: [1400, 1500, 1600, 1700, 1800, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
        region: '',
        shard_idx: 65535,
      },
    },
    {
      check_keys: ['stadester-Macau-Macao', 'Macau-Macao'],
      entry: {
        colour: [173, 62, 62],
        coords: [22.1987, 113.5439],
        country: 'Macao',
        detail_len: 0,
        detail_offset: 0,
        id: 'stadester-Macau-Macao',
        is_ghsl: false,
        key: 'stadester-Macau-Macao',
        max_pop: 680000,
        max_year: 2020,
        min_year: 1557,
        name: 'Macau',
        other_names: ['Macau', 'Macao', 'Aomen'],
        pop_vals: [500, 1000, 5000, 35000, 19500, 24000, 30000, 29000, 63000, 75000, 84000, 120000, 150000, 188000, 169000, 249000, 242000, 352000, 432000, 540000, 680000],
        pop_years: [1557, 1560, 1600, 1635, 1700, 1750, 1800, 1850, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020],
        region: 'eastasia',
        shard_idx: 65535,
      },
    },
    {
      check_keys: ['stadester-Saint Helier-Jersey', 'Saint Helier-Jersey'],
      entry: {
        colour: null,
        coords: [49.1858, -2.11],
        country: 'Jersey',
        detail_len: 0,
        detail_offset: 0,
        id: 'stadester-Saint Helier-Jersey',
        is_ghsl: false,
        key: 'stadester-Saint Helier-Jersey',
        max_pop: 35800,
        max_year: 2020,
        min_year: 1291,
        name: 'Saint Helier',
        other_names: ['Saint Helier', 'St. Helier', 'St Helier'],
        pop_vals: [500, 600, 800, 1200, 2000, 4000, 29000, 29000, 26000, 28000, 27000, 28000, 28300, 33500, 35800],
        pop_years: [1291, 1400, 1500, 1600, 1700, 1800, 1850, 1900, 1950, 1970, 1980, 1990, 2000, 2010, 2020],
        region: 'europe',
        shard_idx: 65535,
      },
    },
  ]

  //Function body
  for (let i = 0; i < fallbacks.length; i++) {
    let fb = fallbacks[i]
    let exists = fb.check_keys.some((arg0_k) => key_map.has(arg0_k))
    if (!exists) {
      let idx = entries.length
      entries.push(fb.entry)
      key_map.set(fb.entry.key, idx)
    }
  }
}


/**
 * Runs Stage B: loads compact shard indices, applies 0.25-deg spatial metadata & state capital bindings,
 * sorts descending by max_pop, builds spatial cells & O(1) search hash, and writes `hot_index.bin`.
 *
 * @param {string} arg0_dataset_name
 * @param {string} arg1_cache_dataset_dir
 * @param {Array<{ detail_path: string; idx_path: string }>} arg2_shard_artifacts
 *
 * @returns {void}
 */
function buildGlobalBinaryIndex (
  arg0_dataset_name: string,
  arg1_cache_dataset_dir: string,
  arg2_shard_artifacts: Array<{ detail_path: string; idx_path: string }>
): void {
  //Convert from parameters
  let cache_dataset_dir = arg1_cache_dataset_dir
  let dataset_name = arg0_dataset_name
  let shard_artifacts = arg2_shard_artifacts

  //Declare local instance variables
  let binding_state = new Map<string, { has_modern_entry: boolean; has_name_match: boolean; has_primary_name_match: boolean; max_hn_year: number }>()
  let bugged_set = getBuggedCitiesSet()
  let cells_per_degree = 4
  let city_alias_cache = new Map<string, AliasStemSet>()
  let entries: any[] = []
  let key_to_temp_idx = new Map<string, number>()
  let primary_alias_cache = new Map<string, AliasStemSet>()
  let raw_city_name_by_key = new Map<string, string>()
  let spatial_grid_meta: Record<string, CityIndexEntry[]> = {}

  //Function body
  for (let s = 0; s < shard_artifacts.length; s++) {
    let sec_data = readSectionedBinaryFile(shard_artifacts[s].idx_path, SHARD_BIN_MAGIC)
    let count = Number(sec_data.meta.count || 0)
    if (count === 0)
      continue

    let sec = sec_data.sections
    let lat_arr = toTypedArray(sec.get('lat')!, Float32Array, 4)
    let lon_arr = toTypedArray(sec.get('lon')!, Float32Array, 4)
    let min_yr_arr = toTypedArray(sec.get('min_year')!, Int16Array, 2)
    let max_yr_arr = toTypedArray(sec.get('max_year')!, Int16Array, 2)
    let max_pop_arr = toTypedArray(sec.get('max_pop')!, Float32Array, 4)
    let flags_arr = sec.get('flags')!
    let colours_arr = sec.get('colours')!
    let detail_off_arr = toTypedArray(sec.get('detail_offset')!, Float64Array, 8)
    let detail_len_arr = toTypedArray(sec.get('detail_len')!, Uint32Array, 4)
    let pop_off_arr = toTypedArray(sec.get('pop_off')!, Uint32Array, 4)
    let pop_len_arr = toTypedArray(sec.get('pop_len')!, Uint16Array, 2)
    let pop_years_arr = toTypedArray(sec.get('pop_years')!, Int16Array, 2)
    let pop_vals_arr = toTypedArray(sec.get('pop_vals')!, Float32Array, 4)

    let key_off = toTypedArray(sec.get('key_off')!, Uint32Array, 4)
    let key_buf = sec.get('key_buf')!
    let name_off = toTypedArray(sec.get('name_off')!, Uint32Array, 4)
    let name_buf = sec.get('name_buf')!
    let country_off = toTypedArray(sec.get('country_off')!, Uint32Array, 4)
    let country_buf = sec.get('country_buf')!
    let region_off = toTypedArray(sec.get('region_off')!, Uint32Array, 4)
    let region_buf = sec.get('region_buf')!
    let id_off = toTypedArray(sec.get('id_off')!, Uint32Array, 4)
    let id_buf = sec.get('id_buf')!
    let other_off = toTypedArray(sec.get('other_off')!, Uint32Array, 4)
    let other_buf = sec.get('other_buf')!

    for (let i = 0; i < count; i++) {
      let key_str = readPackedString(key_buf, key_off, i)
      let name_str = readPackedString(name_buf, name_off, i)
      let country_str = readPackedString(country_buf, country_off, i)
      let region_str = readPackedString(region_buf, region_off, i)
      let id_str = readPackedString(id_buf, id_off, i)
      let other_str = readPackedString(other_buf, other_off, i)

      let p_off = pop_off_arr[i]
      let p_len = pop_len_arr[i]
      let p_yrs: number[] = new Array(p_len)
      let p_vals: number[] = new Array(p_len)
      for (let x = 0; x < p_len; x++) {
        p_yrs[x] = pop_years_arr[p_off + x]
        p_vals[x] = pop_vals_arr[p_off + x]
      }

      let has_colour = (flags_arr[i] & FLAG_HAS_COLOUR) !== 0
      let col = has_colour
        ? [colours_arr[i*3], colours_arr[i*3 + 1], colours_arr[i*3 + 2]] as [number, number, number]
        : null

      let entry_obj: any = {
        colour: col,
        coords: [lat_arr[i], lon_arr[i]] as [number, number],
        country: country_str,
        detail_len: detail_len_arr[i],
        detail_offset: detail_off_arr[i],
        id: id_str,
        is_ghsl: (flags_arr[i] & FLAG_IS_GHSL) !== 0,
        key: key_str,
        max_pop: max_pop_arr[i],
        max_year: max_yr_arr[i],
        min_year: min_yr_arr[i],
        name: name_str,
        other_names: other_str ? other_str.split('\x1f') : undefined,
        pop_vals: p_vals,
        pop_years: p_yrs,
        region: region_str,
        shard_idx: s,
      }

      let idx = entries.length
      entries.push(entry_obj)
      key_to_temp_idx.set(key_str, idx)
    }
  }

  appendManualFallbackCities(entries, key_to_temp_idx)

  //Build 0.25-deg spatial grid for metadata and counterpart binding
  for (let i = 0; i < entries.length; i++) {
    let e = entries[i]
    raw_city_name_by_key.set(e.key, e.name || '')
    let bin_key = `${Math.floor(e.coords[0]*cells_per_degree)},${Math.floor(e.coords[1]*cells_per_degree)}`
    if (!spatial_grid_meta[bin_key])
      spatial_grid_meta[bin_key] = []
    spatial_grid_meta[bin_key].push(e)
  }

  //Bind per-version city_metadata.json
  let meta_list = loadCityMetadata(dataset_name)
  if (meta_list && meta_list.length > 0 && entries.length > 0) {
    let getCachedCityAliases = function (arg0_city: CityIndexEntry): AliasStemSet {
      let cached = city_alias_cache.get(arg0_city.key)
      if (cached)
        return cached
      let built = buildAliasStemSet(arg0_city.name, arg0_city.other_names)
      city_alias_cache.set(arg0_city.key, built)
      return built
    }

    let getCachedPrimaryAliases = function (arg0_city: CityIndexEntry): AliasStemSet {
      let cached = primary_alias_cache.get(arg0_city.key)
      if (cached)
        return cached
      let built = buildPrimaryCityNameSet(arg0_city, raw_city_name_by_key.get(arg0_city.key))
      primary_alias_cache.set(arg0_city.key, built)
      return built
    }

    for (let i = 0; i < meta_list.length; i++) {
      let best_alias_named_city: any = null
      let best_city: any = null
      let best_exact_city: any = null
      let best_meta_name_primary_city: any = null
      let best_primary_named_city: any = null
      let meta = meta_list[i]
      let meta_alias_info = buildAliasStemSet(meta.name, (meta as any).other_names)
      let meta_name_info = buildAliasStemSet(meta.name)
      let min_alias_named_dist = 999999
      let min_dist = 999999
      let min_exact_dist = 999999
      let min_meta_name_primary_dist = 999999
      let min_primary_named_dist = 999999
      let target_lat = meta.coords[1]
      let target_lng = meta.coords[0]
      let has_meta_name_primary_within_50km = false

      if (meta.key && key_to_temp_idx.has(meta.key)) {
        best_city = entries[key_to_temp_idx.get(meta.key)!]
        min_dist = 0
      }

      let center_lat = Math.floor(target_lat*cells_per_degree)
      let center_lng = Math.floor(target_lng*cells_per_degree)
      let deg_lat_bound_50 = 50/111.0 + 0.02
      let deg_lon_bound_50 = 50/(111.0*Math.max(0.2, Math.cos((target_lat*Math.PI)/180))) + 0.02
      let cell_radius_lat_50 = Math.max(1, Math.ceil(deg_lat_bound_50*cells_per_degree))
      let cell_radius_lon_50 = Math.max(1, Math.ceil(deg_lon_bound_50*cells_per_degree))

      for (let d_lat = -cell_radius_lat_50; d_lat <= cell_radius_lat_50; d_lat++) {
        for (let d_lng = -cell_radius_lon_50; d_lng <= cell_radius_lon_50; d_lng++) {
          let cell = spatial_grid_meta[`${center_lat + d_lat},${center_lng + d_lng}`]
          if (!cell)
            continue

          for (let c = 0; c < cell.length; c++) {
            let candidate = cell[c]
            if (Math.abs(candidate.coords[0] - target_lat) > deg_lat_bound_50 || Math.abs(candidate.coords[1] - target_lng) > deg_lon_bound_50)
              continue
            let dist = computeHaversineDistanceKm(candidate.coords[0], candidate.coords[1], target_lat, target_lng)
            if (dist <= 0.1 && dist < min_exact_dist) {
              min_exact_dist = dist
              best_exact_city = candidate
            }
            if (dist <= 50) {
              let cand_all = getCachedCityAliases(candidate)
              let cand_primary = getCachedPrimaryAliases(candidate)
              let meta_name_primary_hit = matchesAliasStemSet(meta_name_info, cand_primary)
              let primary_hit = meta_name_primary_hit || matchesAliasStemSet(meta_alias_info, cand_primary)
              let alias_only_hit = !primary_hit && matchesAliasStemSet(meta_alias_info, cand_all)

              if (meta_name_primary_hit) {
                has_meta_name_primary_within_50km = true
                if (dist < min_meta_name_primary_dist) {
                  min_meta_name_primary_dist = dist
                  best_meta_name_primary_city = candidate
                }
              }
              if (primary_hit && dist < min_primary_named_dist) {
                min_primary_named_dist = dist
                best_primary_named_city = candidate
              } else if (alias_only_hit && dist < min_alias_named_dist) {
                min_alias_named_dist = dist
                best_alias_named_city = candidate
              }
            }
          }
        }
      }

      if (!best_city) {
        if (best_meta_name_primary_city) {
          best_city = best_meta_name_primary_city
          min_dist = min_meta_name_primary_dist
        } else if (best_primary_named_city) {
          best_city = best_primary_named_city
          min_dist = min_primary_named_dist
        } else if (best_alias_named_city && !has_meta_name_primary_within_50km) {
          best_city = best_alias_named_city
          min_dist = min_alias_named_dist
        } else if (best_exact_city) {
          best_city = best_exact_city
          min_dist = min_exact_dist
        }
      }

      if (!best_city || min_dist > 50)
        continue

      let best_all_info = getCachedCityAliases(best_city)
      let best_primary_info = getCachedPrimaryAliases(best_city)
      let is_exact_coord_match = min_dist <= 0.1
      let is_primary_name_match = matchesAliasStemSet(meta_alias_info, best_primary_info)
      let is_alias_only_match = !is_primary_name_match && matchesAliasStemSet(meta_alias_info, best_all_info)
      let is_name_match = is_primary_name_match || is_alias_only_match

      if ((!is_exact_coord_match && !is_name_match) || (is_alias_only_match && has_meta_name_primary_within_50km))
        continue

      let meta_max_year = -9999
      for (let h = 0; h < (meta.historical_names || []).length; h++) {
        if (meta.historical_names[h].year_frac > meta_max_year)
          meta_max_year = meta.historical_names[h].year_frac
      }
      for (let c_i = 0; c_i < (meta.capital_records || []).length; c_i++) {
        if (meta.capital_records![c_i].year_frac > meta_max_year)
          meta_max_year = meta.capital_records![c_i].year_frac
      }

      let meta_is_modern = meta_max_year >= 1700
      let prev_binding = binding_state.get(best_city.key)
      if (!is_name_match && prev_binding?.has_primary_name_match)
        continue
      if (!is_name_match && prev_binding?.has_name_match && (meta_max_year < -9000 || (prev_binding.has_modern_entry && meta_is_modern)))
        continue

      let is_best_corrupted = isCorruptedCityName(best_city.name || '')
      let is_displaced_neighbour = !is_primary_name_match && Boolean(meta.name) &&
        doesLabelMatchAnotherNearbyCity(best_city, meta.name!, spatial_grid_meta, raw_city_name_by_key, primary_alias_cache, 25, cells_per_degree)
      let is_synthetic_stub = isSyntheticGhslEpochStub(meta)

      if (!is_name_match && is_displaced_neighbour)
        continue

      let best_is_active_modern = (best_city.max_year ?? 0) >= 1950
      let can_overwrite_name = Boolean(
        meta.name &&
        !best_city.is_ghsl &&
        (
          (is_primary_name_match && (is_exact_coord_match || min_dist <= 15) && !is_synthetic_stub) ||
          (!is_primary_name_match && min_dist <= 1.0 && is_best_corrupted)
        )
      )
      let should_set_name = false
      if (can_overwrite_name) {
        if (!prev_binding) {
          should_set_name = true
        } else if (prev_binding.has_primary_name_match && !is_primary_name_match) {
          should_set_name = false
        } else if (is_primary_name_match && !prev_binding.has_primary_name_match) {
          should_set_name = true
        } else if (is_name_match && !prev_binding.has_name_match) {
          should_set_name = true
        } else if (is_name_match && meta_max_year >= prev_binding.max_hn_year && !(prev_binding.has_modern_entry && meta_max_year < 1700)) {
          should_set_name = true
        }
      }

      let meta_extra_aliases: string[] = []
      if (meta.name)
        meta_extra_aliases.push(meta.name)
      if (Array.isArray((meta as any).other_names))
        meta_extra_aliases.push(...(meta as any).other_names)
      if (meta.historical_names) {
        for (let h = 0; h < meta.historical_names.length; h++)
          meta_extra_aliases.push(meta.historical_names[h].name)
      }

      if (should_set_name && meta.name) {
        if (
          best_city.name &&
          best_city.name !== meta.name &&
          !isCorruptedCityName(best_city.name) &&
          !doesLabelMatchAnotherNearbyCity(best_city, best_city.name, spatial_grid_meta, raw_city_name_by_key, primary_alias_cache, 25, cells_per_degree)
        ) {
          meta_extra_aliases.push(best_city.name)
        }
        best_city.name = meta.name
        best_city.metadata_name = meta.name
        city_alias_cache.delete(best_city.key)
        primary_alias_cache.delete(best_city.key)
      }

      let allow_hist_merge = is_primary_name_match ||
        (!prev_binding?.has_primary_name_match && !is_displaced_neighbour && !best_is_active_modern && (is_name_match || (!prev_binding?.has_name_match && !meta_is_modern)))
      let allow_other_merge = is_primary_name_match ||
        (!prev_binding?.has_primary_name_match && !is_displaced_neighbour && (is_name_match || !prev_binding?.has_name_match))

      if (allow_other_merge) {
        mergeCityOtherNames(best_city, meta_extra_aliases)
        city_alias_cache.delete(best_city.key)
      }

      if (meta.historical_names && meta.historical_names.length > 0 && allow_hist_merge)
        best_city.historical_names = mergeHistoricalNamesSimple(best_city.historical_names, meta.historical_names)

      binding_state.set(best_city.key, {
        has_modern_entry: Boolean(prev_binding?.has_modern_entry || (is_name_match && meta_is_modern)),
        has_name_match: Boolean(prev_binding?.has_name_match || is_name_match),
        has_primary_name_match: Boolean(prev_binding?.has_primary_name_match || is_primary_name_match),
        max_hn_year: Math.max(prev_binding?.max_hn_year ?? -9999, (is_primary_name_match || !prev_binding?.has_primary_name_match) ? meta_max_year : -9999),
      })

      if (!is_displaced_neighbour || is_primary_name_match)
        mergeCityCapitalRecords(best_city, meta)
    }

    //Post-pass: resolve post-1950 cities to latest modern metadata name
    for (let i = 0; i < entries.length; i++) {
      let city = entries[i]
      if (!city || city.is_ghsl)
        continue
      if ((city.max_year ?? 0) >= 1950 && city.historical_names && city.historical_names.length > 0) {
        let last_hn = city.historical_names[city.historical_names.length - 1]
        let last_stem = normalizeCapitalNameStem(last_hn.name || '')
        let name_stem = normalizeCapitalNameStem(city.name || '')
        if (last_hn.name && !isCorruptedCityName(last_hn.name) && last_stem !== name_stem) {
          let city_alias = normalizeCityAlias(city.name || '')
          let has_earlier_match = city.historical_names.slice(0, -1).some((arg0_h: HistoricalNameRecord) => {
            let h_alias = normalizeCityAlias(arg0_h.name || '')
            return normalizeCapitalNameStem(arg0_h.name || '') === name_stem ||
              (Boolean(city_alias) && Boolean(h_alias) && h_alias === city_alias)
          })
          let raw_name = raw_city_name_by_key.get(city.key) || ''
          let raw_alias = normalizeCityAlias(raw_name)
          let last_alias = normalizeCityAlias(last_hn.name || '')
          let raw_matched_last = Boolean(
            (last_stem && normalizeCapitalNameStem(raw_name) === last_stem) ||
            (last_alias && raw_alias && raw_alias === last_alias)
          )
          if (has_earlier_match || raw_matched_last) {
            let old_name = city.name
            if (
              old_name &&
              !isCorruptedCityName(old_name) &&
              !doesLabelMatchAnotherNearbyCity(city, old_name, spatial_grid_meta, raw_city_name_by_key, primary_alias_cache, 25, cells_per_degree)
            ) {
              mergeCityOtherNames(city, [old_name])
            }
            city.name = last_hn.name
          }
        }
      }
      if (city.metadata_name || binding_state.has(city.key))
        city.metadata_name = city.name
    }
  }

  //Bind authoritative state_capitals.json timelines via hash lookup maps
  bindStateCapitalsToEntries(entries, key_to_temp_idx)

  //Sort entries globally descending by max_pop so top-K queries can break early
  entries.sort((arg0_a, arg1_b) => arg1_b.max_pop - arg0_a.max_pop)

  //Build flat TypedArrays, spatial cells, search hash, and sparse capital/hist maps
  let count = entries.length
  let lat_arr = new Float32Array(count)
  let lon_arr = new Float32Array(count)
  let min_yr_arr = new Int16Array(count)
  let max_yr_arr = new Int16Array(count)
  let max_pop_arr = new Float32Array(count)
  let flags_arr = new Uint8Array(count)
  let region_idx_arr = new Uint16Array(count)
  let pop_off_arr = new Uint32Array(count)
  let pop_len_arr = new Uint16Array(count)
  let shard_idx_arr = new Uint16Array(count)
  let detail_off_arr = new Float64Array(count)
  let detail_len_arr = new Uint32Array(count)
  let counterpart_arr = new Int32Array(count)

  let region_map = new Map<string, number>()
  let region_list: string[] = []
  let total_pop_pts = 0
  for (let i = 0; i < count; i++)
    total_pop_pts += entries[i].pop_years.length

  let pop_years_flat = new Int16Array(total_pop_pts)
  let pop_vals_flat = new Float32Array(total_pop_pts)
  let keys_arr: string[] = new Array(count)
  let names_arr: string[] = new Array(count)
  let countries_arr: string[] = new Array(count)
  let ids_arr: string[] = new Array(count)
  let others_arr: string[] = new Array(count)
  let cap_city_indices: number[] = []
  let cap_meta_entries: Array<[number, CapitalRecord[]]> = []
  let hist_meta_entries: Array<[number, HistoricalNameRecord[]]> = []
  let colour_entries: Array<[number, [number, number, number]]> = []
  let cell_buckets = new Map<number, number[]>()
  let pop_cursor = 0

  let sorted_key_to_idx = new Map<string, number>()
  for (let i = 0; i < count; i++)
    sorted_key_to_idx.set(entries[i].key, i)

  for (let i = 0; i < count; i++) {
    let e = entries[i]
    lat_arr[i] = e.coords[0]
    lon_arr[i] = e.coords[1]
    min_yr_arr[i] = Math.max(-32768, Math.min(32767, e.min_year))
    max_yr_arr[i] = Math.max(-32768, Math.min(32767, e.max_year))
    max_pop_arr[i] = e.max_pop
    shard_idx_arr[i] = e.shard_idx
    detail_off_arr[i] = e.detail_offset
    detail_len_arr[i] = e.detail_len
    counterpart_arr[i] = -1

    let reg = e.region || ''
    if (!reg) {
      region_idx_arr[i] = 65535
    } else {
      let r_id = region_map.get(reg)
      if (r_id === undefined) {
        r_id = region_list.length
        region_list.push(reg)
        region_map.set(reg, r_id)
      }
      region_idx_arr[i] = r_id
    }

    let f = 0
    if (isBuggedCityName(e.name, bugged_set) || (e.key && isBuggedCityName(e.key, bugged_set)))
      f |= FLAG_IS_BUGGED
    if (e.is_ghsl)
      f |= FLAG_IS_GHSL
    if (e.capital_records && e.capital_records.length > 0) {
      f |= FLAG_HAS_CAPITALS
      cap_city_indices.push(i)
      cap_meta_entries.push([i, e.capital_records])
    }
    if (e.historical_names && e.historical_names.length > 0) {
      f |= FLAG_HAS_HIST_NAMES
      hist_meta_entries.push([i, e.historical_names])
    }
    if (e.colour) {
      f |= FLAG_HAS_COLOUR
      colour_entries.push([i, e.colour])
    }
    flags_arr[i] = f

    pop_off_arr[i] = pop_cursor
    pop_len_arr[i] = e.pop_years.length
    for (let x = 0; x < e.pop_years.length; x++) {
      pop_years_flat[pop_cursor] = Math.max(-32768, Math.min(32767, e.pop_years[x]))
      pop_vals_flat[pop_cursor] = e.pop_vals[x]
      pop_cursor++
    }

    keys_arr[i] = e.key
    names_arr[i] = e.name || ''
    countries_arr[i] = e.country || ''
    ids_arr[i] = String(e.id || '')
    others_arr[i] = Array.isArray(e.other_names) ? e.other_names.slice(0, 8).join('\x1f') : ''

    let cell_k = getSpatialCellKey2Deg(e.coords[0], e.coords[1])
    let bucket = cell_buckets.get(cell_k)
    if (!bucket) {
      bucket = []
      cell_buckets.set(cell_k, bucket)
    }
    bucket.push(i)
  }

  //Link era counterparts (stadester <-> ghsl within 35km) at compile time
  for (let i = 0; i < count; i++) {
    let e = entries[i]
    if (!e.key.startsWith('stadester-') && !e.key.startsWith('ghsl-'))
      continue
    let target_prefix = e.key.startsWith('stadester-') ? 'ghsl-' : 'stadester-'
    let c_lat = e.coords[0]
    let c_lng = e.coords[1]
    let c_name = (e.name || '').toLowerCase().trim()
    let c_clean = c_name.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim()
    let center_lat = Math.floor(c_lat*cells_per_degree)
    let center_lng = Math.floor(c_lng*cells_per_degree)
    let best_dist = 999999
    let best_idx = -1

    for (let d_lat = -2; d_lat <= 2; d_lat++) {
      for (let d_lng = -2; d_lng <= 2; d_lng++) {
        let cell = spatial_grid_meta[`${center_lat + d_lat},${center_lng + d_lng}`]
        if (!cell)
          continue
        for (let c = 0; c < cell.length; c++) {
          let other = cell[c]
          if (!other.key.startsWith(target_prefix))
            continue
          let dist = computeHaversineDistanceKm(c_lat, c_lng, other.coords[0], other.coords[1])
          if (dist > 35)
            continue
          let o_name = (other.name || '').toLowerCase().trim()
          let o_clean = o_name.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim()
          let matches = Boolean(c_clean && o_clean && (c_clean === o_clean || o_name.includes(c_clean) || c_name.includes(o_clean)))
          if (matches && dist < best_dist) {
            best_dist = dist
            best_idx = sorted_key_to_idx.get(other.key) ?? -1
          }
        }
      }
    }
    counterpart_arr[i] = best_idx
  }

  //Flatten 2-deg spatial cells
  let cell_keys_list: number[] = []
  let cell_offs_list: number[] = []
  let cell_lens_list: number[] = []
  let total_cell_entries = count
  let cell_city_indices = new Uint32Array(total_cell_entries)
  let cell_cursor = 0

  for (let [ck, bucket] of cell_buckets) {
    cell_keys_list.push(ck)
    cell_offs_list.push(cell_cursor)
    cell_lens_list.push(bucket.length)
    for (let i = 0; i < bucket.length; i++)
      cell_city_indices[cell_cursor++] = bucket[i]
  }

  //Build O(1) FNV-1a search hash table for key, bare_key, norm_key, primary_key, id, and NFD name
  let hash_tokens: Array<{ city_idx: number; hash: number }> = []
  for (let i = 0; i < count; i++) {
    let k = keys_arr[i]
    let bare = k.replace(/^(stadester-|ghsl-|oxford-)/i, '')
    let norm_k = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    let primary_k = normalizePrimaryCityKey(k)
    let bare_primary_k = normalizePrimaryCityKey(bare)
    let norm_name = names_arr[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
    let clean_name = norm_name.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()
    let seen_h = new Set<number>()
    let addTok = function (arg0_s: string): void {
      if (!arg0_s)
        return
      let h = fnv1a32(arg0_s)
      if (!seen_h.has(h)) {
        seen_h.add(h)
        hash_tokens.push({ city_idx: i, hash: h })
      }
    }
    addTok(k)
    addTok(bare)
    addTok(norm_k)
    addTok(primary_k)
    addTok(bare_primary_k)
    addTok(ids_arr[i])
    addTok(norm_name)
    addTok(clean_name)
  }

  let bucket_pow = 1
  for (let i = 0; i < 28 && bucket_pow < Math.max(64, hash_tokens.length*2); i++)
    bucket_pow <<= 1
  let hash_mask = bucket_pow - 1
  let hash_bucket_heads = new Int32Array(bucket_pow).fill(-1)
  let hash_entry_hashes = new Uint32Array(hash_tokens.length)
  let hash_entry_city = new Uint32Array(hash_tokens.length)
  let hash_entry_next = new Int32Array(hash_tokens.length)

  for (let i = 0; i < hash_tokens.length; i++) {
    let tok = hash_tokens[i]
    let b = tok.hash & hash_mask
    hash_entry_hashes[i] = tok.hash
    hash_entry_city[i] = tok.city_idx
    hash_entry_next[i] = hash_bucket_heads[b]
    hash_bucket_heads[b] = i
  }

  let packed_keys = packStringArray(keys_arr)
  let packed_names = packStringArray(names_arr)
  let packed_countries = packStringArray(countries_arr)
  let packed_ids = packStringArray(ids_arr)
  let packed_others = packStringArray(others_arr)

  let shard_rel_files = shard_artifacts.map((arg0_s) => path.basename(arg0_s.detail_path))
  let sparse_json_buf = Buffer.from(
    JSON.stringify({
      cap_meta: cap_meta_entries,
      colours: colour_entries,
      hist_meta: hist_meta_entries,
    }),
    'utf8'
  )

  let hot_index_path = path.join(cache_dataset_dir, 'hot_index.bin')
  writeSectionedBinaryFile(
    hot_index_path,
    BINARY_MAGIC,
    {
      build_time_ms: Date.now(),
      count,
      hash_mask,
      regions: region_list,
      shard_files: shard_rel_files,
      total_pop_pts,
    },
    [
      { data: lat_arr, name: 'lat' },
      { data: lon_arr, name: 'lon' },
      { data: min_yr_arr, name: 'min_year' },
      { data: max_yr_arr, name: 'max_year' },
      { data: max_pop_arr, name: 'max_pop' },
      { data: flags_arr, name: 'flags' },
      { data: region_idx_arr, name: 'region_idx' },
      { data: pop_off_arr, name: 'pop_off' },
      { data: pop_len_arr, name: 'pop_len' },
      { data: pop_years_flat, name: 'pop_years' },
      { data: pop_vals_flat, name: 'pop_vals' },
      { data: shard_idx_arr, name: 'shard_idx' },
      { data: detail_off_arr, name: 'detail_offset' },
      { data: detail_len_arr, name: 'detail_len' },
      { data: counterpart_arr, name: 'counterpart_idx' },
      { data: new Uint32Array(cap_city_indices), name: 'capital_city_indices' },
      { data: packed_keys.offsets, name: 'key_off' },
      { data: packed_keys.buf, name: 'key_buf' },
      { data: packed_names.offsets, name: 'name_off' },
      { data: packed_names.buf, name: 'name_buf' },
      { data: packed_countries.offsets, name: 'country_off' },
      { data: packed_countries.buf, name: 'country_buf' },
      { data: packed_ids.offsets, name: 'id_off' },
      { data: packed_ids.buf, name: 'id_buf' },
      { data: packed_others.offsets, name: 'other_off' },
      { data: packed_others.buf, name: 'other_buf' },
      { data: new Int32Array(cell_keys_list), name: 'cell_keys' },
      { data: new Uint32Array(cell_offs_list), name: 'cell_offs' },
      { data: new Uint32Array(cell_lens_list), name: 'cell_lens' },
      { data: cell_city_indices, name: 'cell_city_indices' },
      { data: hash_bucket_heads, name: 'hash_bucket_heads' },
      { data: hash_entry_hashes, name: 'hash_entry_hashes' },
      { data: hash_entry_city, name: 'hash_entry_city' },
      { data: hash_entry_next, name: 'hash_entry_next' },
      { data: sparse_json_buf, name: 'sparse_json' },
    ]
  )
}


/**
 * Merges historical name timelines for Stage B without importing full `stadester_metadata` merge overhead.
 *
 * @param {HistoricalNameRecord[] | undefined} arg0_existing
 * @param {HistoricalNameRecord[] | undefined} arg1_incoming
 *
 * @returns {HistoricalNameRecord[]}
 */
function mergeHistoricalNamesSimple (
  arg0_existing?: HistoricalNameRecord[],
  arg1_incoming?: HistoricalNameRecord[]
): HistoricalNameRecord[] {
  //Convert from parameters
  let existing = arg0_existing
  let incoming = arg1_incoming

  //Guard clauses
  if (!incoming || incoming.length === 0)
    return existing || []
  if (!existing || existing.length === 0)
    return incoming

  //Declare local instance variables
  let all_records = [...existing, ...incoming]
  let merged_timeline: HistoricalNameRecord[] = []

  //Function body
  for (let i = 0; i < all_records.length; i++) {
    if (all_records[i].year_frac === undefined || all_records[i].year_frac === null)
      all_records[i].year_frac = parseYearMonthDay(all_records[i].date).year_frac
  }
  all_records.sort((arg0_a, arg1_b) => arg0_a.year_frac - arg1_b.year_frac)

  for (let i = 0; i < all_records.length; i++) {
    let rec = all_records[i]
    let last = merged_timeline[merged_timeline.length - 1]
    if (last) {
      if (Math.abs(rec.year_frac - last.year_frac) < 0.05) {
        if (rec.date.length > last.date.length)
          merged_timeline[merged_timeline.length - 1] = rec
        continue
      }
      if (last.name.toLowerCase().trim() === rec.name.toLowerCase().trim())
        continue
    }
    merged_timeline.push(rec)
  }

  //Return statement
  return merged_timeline
}


/**
 * Binds `data/stadester/state_capitals.json` timelines directly onto Stage B city entries.
 *
 * @param {any[]} arg0_entries
 * @param {Map<string, number>} arg1_key_to_temp_idx
 *
 * @returns {void}
 */
function bindStateCapitalsToEntries (
  arg0_entries: any[],
  arg1_key_to_temp_idx: Map<string, number>
): void {
  //Convert from parameters
  let entries = arg0_entries
  let key_map = arg1_key_to_temp_idx

  //Declare local instance variables
  let alias_to_cities = new Map<string, any[]>()
  let city_intervals = new Map<any, Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }>>()
  let name_to_cities = new Map<string, any[]>()
  let norm_key_to_cities = new Map<string, any[]>()
  let state_capitals = getStateCapitals()

  //Guard clauses
  if (!state_capitals || Object.keys(state_capitals).length === 0)
    return

  //Function body
  for (let i = 0; i < entries.length; i++) {
    let city = entries[i]
    let n_k = normalizeCityKey(city.key)
    if (!norm_key_to_cities.has(n_k))
      norm_key_to_cities.set(n_k, [])
    norm_key_to_cities.get(n_k)!.push(city)

    let primary_nk = getPrimaryCityNormKey(city.key)
    if (primary_nk && primary_nk !== n_k) {
      if (!norm_key_to_cities.has(primary_nk))
        norm_key_to_cities.set(primary_nk, [])
      norm_key_to_cities.get(primary_nk)!.push(city)
    }

    let clean_name = (city.name || '').toLowerCase().trim()
    if (clean_name) {
      if (!name_to_cities.has(clean_name))
        name_to_cities.set(clean_name, [])
      name_to_cities.get(clean_name)!.push(city)
    }

    if (Array.isArray(city.other_names)) {
      for (let x = 0; x < city.other_names.length; x++) {
        let on_clean = String(city.other_names[x] || '').toLowerCase().trim()
        if (on_clean && on_clean !== clean_name) {
          if (!alias_to_cities.has(on_clean))
            alias_to_cities.set(on_clean, [])
          alias_to_cities.get(on_clean)!.push(city)
        }
      }
    }
    if (Array.isArray(city.historical_names)) {
      for (let x = 0; x < city.historical_names.length; x++) {
        let hn_clean = String(city.historical_names[x]?.name || '').toLowerCase().trim()
        if (hn_clean && hn_clean !== clean_name) {
          if (!alias_to_cities.has(hn_clean))
            alias_to_cities.set(hn_clean, [])
          alias_to_cities.get(hn_clean)!.push(city)
        }
      }
    }
  }

  for (let i = 0; i < entries.length; i++) {
    let city = entries[i]
    if (city.capital_records && city.capital_records.length > 0) {
      let ivs: Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }> = []
      for (let y = 0; y < city.capital_records.length; y++) {
        let rec = city.capital_records[y]
        if (rec.state_id !== null && rec.state_id !== undefined) {
          let s_id_str = String(rec.state_id)
          if (state_capitals[s_id_str])
            continue
          let rec_state = getStateById(Number(rec.state_id))
          if (rec_state && !isCityInsideStateBBox(city, rec_state, 0.75))
            continue
          let next_rec = (y + 1 < city.capital_records.length) ? city.capital_records[y + 1] : null
          ivs.push({
            is_authoritative: false,
            start_date: rec.date,
            start_frac: rec.year_frac,
            state_id: Number(rec.state_id),
            stop_date: next_rec ? next_rec.date : '2026.1.1',
            stop_frac: next_rec ? next_rec.year_frac : 2026,
          })
        }
      }
      city.capital = {}
      city.capital_records = []
      if (ivs.length > 0)
        city_intervals.set(city, ivs)
    }
  }

  let all_state_ids = Object.keys(state_capitals)
  for (let z = 0; z < all_state_ids.length; z++) {
    let state_id = all_state_ids[z]
    let sc_entry = state_capitals[state_id]
    if (!sc_entry || sc_entry.acapital || !sc_entry.timeline || sc_entry.timeline.length === 0)
      continue

    let s_id_num = Number(state_id)
    let state = getStateById(s_id_num)
    for (let a = 0; a < sc_entry.timeline.length; a++) {
      let tl_item = sc_entry.timeline[a]
      if (!tl_item.start)
        continue

      let target_cities: any[] = []
      if (tl_item.key && key_map.has(tl_item.key))
        target_cities.push(entries[key_map.get(tl_item.key)!])

      if (tl_item.key) {
        let n_k = normalizeCityKey(tl_item.key)
        let matches = norm_key_to_cities.get(n_k)
        if (matches) {
          for (let m = 0; m < matches.length; m++) {
            if (!target_cities.includes(matches[m]))
              target_cities.push(matches[m])
          }
        }
        let primary_nk = getPrimaryCityNormKey(tl_item.key)
        if (primary_nk) {
          let primary_matches = norm_key_to_cities.get(primary_nk)
          if (primary_matches) {
            for (let m = 0; m < primary_matches.length; m++) {
              if (!target_cities.includes(primary_matches[m]))
                target_cities.push(primary_matches[m])
            }
          }
        }
      }

      if (target_cities.length === 0 && tl_item.city) {
        let clean_tl_city = tl_item.city.toLowerCase().trim()
        let matches = name_to_cities.get(clean_tl_city)
        if (matches) {
          for (let m = 0; m < matches.length; m++) {
            if (!target_cities.includes(matches[m]))
              target_cities.push(matches[m])
          }
        }
        let alias_matches = alias_to_cities.get(clean_tl_city)
        if (alias_matches) {
          for (let m = 0; m < alias_matches.length; m++) {
            if (!target_cities.includes(alias_matches[m]))
              target_cities.push(alias_matches[m])
          }
        }
      }

      let s_p = parseYearMonthDay(tl_item.start)
      let e_p = tl_item.stop ? parseYearMonthDay(tl_item.stop) : { date: '2026.1.1', year_frac: 2026 }
      let start_frac_val = tl_item.start_frac !== undefined ? tl_item.start_frac : s_p.year_frac
      let stop_frac_val = tl_item.stop_frac !== undefined ? tl_item.stop_frac : e_p.year_frac
      let best_city = selectBestCapitalCandidateForTimeline(
        target_cities,
        state,
        tl_item.key,
        start_frac_val,
        stop_frac_val
      )

      if (best_city) {
        if (!city_intervals.has(best_city))
          city_intervals.set(best_city, [])
        city_intervals.get(best_city)!.push({
          is_authoritative: true,
          start_date: tl_item.start.trim(),
          start_frac: start_frac_val,
          state_id: s_id_num,
          stop_date: tl_item.stop ? tl_item.stop.trim() : '2026.1.1',
          stop_frac: stop_frac_val,
        })
      }
    }
  }

  for (let [city, intervals] of city_intervals) {
    let pts: Array<{ date: string; year_frac: number }> = []
    let seen_fracs = new Set<number>()
    for (let c = 0; c < intervals.length; c++) {
      let iv = intervals[c]
      if (!seen_fracs.has(iv.start_frac)) {
        seen_fracs.add(iv.start_frac)
        pts.push({ date: iv.start_date, year_frac: iv.start_frac })
      }
      if (!seen_fracs.has(iv.stop_frac)) {
        seen_fracs.add(iv.stop_frac)
        pts.push({ date: iv.stop_date, year_frac: iv.stop_frac })
      }
    }
    pts.sort((arg0_a, arg1_b) => arg0_a.year_frac - arg1_b.year_frac)

    let cap_dict: Record<string, number | null> = {}
    let prev_sid: number | null | undefined = undefined
    for (let c = 0; c < pts.length; c++) {
      let p = pts[c]
      let sample_frac = p.year_frac >= 2026 ? 2026 : p.year_frac + 0.0001
      let matching_ivs = intervals.filter((arg0_iv) => sample_frac >= arg0_iv.start_frac && (sample_frac <= arg0_iv.stop_frac || (arg0_iv.stop_frac >= 2026 && p.year_frac >= 2026)))
      let active_iv: { is_authoritative?: boolean; start_frac?: number; state_id: number; stop_frac?: number } | null = null

      if (matching_ivs.length > 0) {
        let auth_ivs = matching_ivs.filter((arg0_iv) => arg0_iv.is_authoritative)
        let candidates = auth_ivs.length > 0 ? auth_ivs : matching_ivs
        candidates.sort((arg0_a, arg1_b) => {
          let state_a = getStateById(arg0_a.state_id)
          let state_b = getStateById(arg1_b.state_id)
          let inside_a = state_a ? (isCityInsideStateBBox(city, state_a, 0.75) ? 1 : 0) : 1
          let inside_b = state_b ? (isCityInsideStateBBox(city, state_b, 0.75) ? 1 : 0) : 1
          if (inside_a !== inside_b)
            return inside_b - inside_a
          let dur_a = (arg0_a.stop_frac !== undefined && arg0_a.start_frac !== undefined) ? (arg0_a.stop_frac - arg0_a.start_frac) : 99999
          let dur_b = (arg1_b.stop_frac !== undefined && arg1_b.start_frac !== undefined) ? (arg1_b.stop_frac - arg1_b.start_frac) : 99999
          return dur_a - dur_b
        })
        active_iv = candidates[0]
      }

      let sid = active_iv ? active_iv.state_id : null
      if (sid !== prev_sid) {
        cap_dict[p.date] = sid
        prev_sid = sid
      }
    }

    city.capital = cap_dict
    city.capital_records = Object.keys(cap_dict).map((arg0_dk) => {
      let parsed = parseYearMonthDay(arg0_dk)
      return {
        date: arg0_dk,
        state_id: cap_dict[arg0_dk],
        year_frac: parsed.year_frac,
      }
    }).sort((arg0_a, arg1_b) => arg0_a.year_frac - arg1_b.year_frac)
  }
}


let compiler_yield_sab = new Int32Array(new SharedArrayBuffer(4))

/**
 * Yields the calling thread briefly so host UI/compositor frames are not starved during compilation.
 *
 * @param {number} arg0_ms
 *
 * @returns {void}
 */
function yieldCompilerThread (arg0_ms: number): void {
  //Convert from parameters
  let ms = Math.max(0, Math.min(250, arg0_ms))

  //Guard clauses
  if (ms <= 0)
    return

  //Function body
  try {
    Atomics.wait(compiler_yield_sab, 0, 0, ms)
  } catch {}
}


/**
 * Applies OS scheduling priority and returns configured RAM/yield limits for Stadestér compilation.
 *
 * @returns {{ compiler_max_heap_mb: number; compiler_yield_ms: number }}
 */
function applyCompilerResourceLimits (): { compiler_max_heap_mb: number; compiler_yield_ms: number } {
  //Declare local instance variables
  let opt = getOptimisationConfig().config
  let limits = opt.resource_limits || DEFAULT_RESOURCE_LIMITS_CONFIG
  let use_below_normal = limits.compiler_below_normal_priority ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_below_normal_priority
  let max_heap_mb = limits.compiler_max_heap_mb ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_max_heap_mb
  let yield_ms = limits.compiler_yield_ms ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_yield_ms

  //Function body
  if (use_below_normal) {
    try {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {}
  }

  //Return statement
  return {
    compiler_max_heap_mb: max_heap_mb,
    compiler_yield_ms: yield_ms,
  }
}


/**
 * Incrementally compiles a Stadestér dataset into binary per-shard packs and a global TypedArray store.
 *
 * @param {string} [arg0_dataset_name]
 * @param {{ force?: boolean; relink?: boolean }} [arg1_options]
 *
 * @returns {{ compiled_shards: number; duration_ms: number; hot_index_path: string; total_entries: number }}
 */
export function compileStadesterDataset (
  arg0_dataset_name?: string,
  arg1_options?: { force?: boolean; relink?: boolean }
): { compiled_shards: number; duration_ms: number; hot_index_path: string; total_entries: number } {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let options = (arg1_options) ? arg1_options : {}

  //Declare local instance variables
  let bugged_path = FilepathDefines.get().filepaths.stadester_bugged_cities
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let cap_path = FilepathDefines.get().filepaths.stadester_capitals
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let compiled_shards = 0
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')
  let manifest_path = path.join(dataset_cache_dir, 'build_manifest.json')
  let meta_path = resolveCityMetadataPath(clean_stem)
  let prev_manifest: BinaryBuildManifest | null = null
  let resource_limits = applyCompilerResourceLimits()
  let shards_dir = path.join(dataset_cache_dir, 'shards')
  let source_info = resolveDatasetSourceFiles(clean_stem)
  let t_start = Date.now()

  //Guard clauses
  if (source_info.files.length === 0)
    throw new Error(`Dataset sources not found for ${clean_stem}`)

  //Function body
  if (!fs.existsSync(shards_dir))
    fs.mkdirSync(shards_dir, { recursive: true })

  if (!options.force && fs.existsSync(manifest_path)) {
    try {
      let parsed = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
      if (parsed && parsed.version === BINARY_FORMAT_VERSION)
        prev_manifest = parsed
    } catch {
      prev_manifest = null
    }
  }

  let next_shards: BinaryBuildManifest['shards'] = {}
  let shard_artifacts: Array<{ detail_path: string; idx_path: string }> = []
  let total_entries = 0

  for (let i = 0; i < source_info.files.length; i++) {
    let src_file = source_info.files[i]
    let st = fs.statSync(src_file)
    let base_slug = path.basename(src_file, path.extname(src_file))
    let idx_rel = `${base_slug}.idx.bin`
    let detail_rel = `${base_slug}.detail.pack`
    let idx_path = path.join(shards_dir, idx_rel)
    let detail_path = path.join(shards_dir, detail_rel)
    let prev_entry = prev_manifest?.shards?.[base_slug]
    let is_shard_fresh = Boolean(
      !options.force &&
      prev_entry &&
      prev_entry.size === st.size &&
      Math.round(prev_entry.mtime_ms) === Math.round(st.mtimeMs) &&
      fs.existsSync(idx_path) &&
      fs.existsSync(detail_path)
    )

    if (!is_shard_fresh) {
      let shard_count = compileRawShardToBinary(src_file, idx_path, detail_path)
      compiled_shards++
      console.log(`[StadesterCompiler] Compiled shard ${base_slug} (${shard_count} cities)`)

      let heap_used_mb = process.memoryUsage().heapUsed/(1024*1024)
      if (heap_used_mb > resource_limits.compiler_max_heap_mb*0.75 && typeof globalThis.gc === 'function')
        globalThis.gc()
      yieldCompilerThread(resource_limits.compiler_yield_ms)
    }

    next_shards[base_slug] = {
      detail_file: detail_rel,
      idx_file: idx_rel,
      mtime_ms: st.mtimeMs,
      size: st.size,
    }
    shard_artifacts.push({ detail_path, idx_path })
  }

  let meta_sig = getFileSignature(meta_path)
  let cap_sig = getFileSignature(cap_path)
  let bugged_sig = getFileSignature(bugged_path)
  let needs_stage_b = Boolean(
    options.force ||
    options.relink ||
    compiled_shards > 0 ||
    !prev_manifest ||
    prev_manifest.metadata_sig !== meta_sig ||
    prev_manifest.capitals_sig !== cap_sig ||
    prev_manifest.bugged_sig !== bugged_sig ||
    Object.keys(prev_manifest.shards || {}).length !== Object.keys(next_shards).length ||
    !fs.existsSync(hot_index_path)
  )

  if (needs_stage_b && !active_binary_compiles.has(clean_stem)) {
    active_binary_compiles.add(clean_stem)
    try {
      buildGlobalBinaryIndex(clean_stem, dataset_cache_dir, shard_artifacts)
      binary_store_cache.delete(clean_stem)
      meta_sig = getFileSignature(meta_path)
      cap_sig = getFileSignature(cap_path)
      bugged_sig = getFileSignature(bugged_path)
    } finally {
      active_binary_compiles.delete(clean_stem)
    }
  }

  let loaded_store = readBinaryStoreFromDisk(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)
  total_entries = loaded_store ? loaded_store.count : 0

  let new_manifest: BinaryBuildManifest = {
    bugged_sig: bugged_sig,
    capitals_sig: cap_sig,
    compiled_at: new Date().toISOString(),
    metadata_sig: meta_sig,
    shards: next_shards,
    total_entries,
    version: BINARY_FORMAT_VERSION,
  }
  fs.writeFileSync(manifest_path, JSON.stringify(new_manifest, null, 2), 'utf-8')

  let duration_ms = Date.now() - t_start
  if (compiled_shards > 0 || needs_stage_b) {
    console.log(`[StadesterCompiler] Built binary store for ${clean_stem}: ${total_entries} cities, ${compiled_shards} dirty shards in ${duration_ms}ms`)
  }

  //Return statement
  return {
    compiled_shards,
    duration_ms,
    hot_index_path,
    total_entries,
  }
}


/**
 * Reads an already-compiled binary columnar store directly from disk without triggering recompilation.
 *
 * @param {string} arg0_clean_stem
 * @param {string} arg1_dataset_cache_dir
 * @param {string} arg2_hot_index_path
 * @param {string} [arg3_alias_name]
 *
 * @returns {BinaryDatasetStore | null}
 */
function readBinaryStoreFromDisk (
  arg0_clean_stem: string,
  arg1_dataset_cache_dir: string,
  arg2_hot_index_path: string,
  arg3_alias_name?: string
): BinaryDatasetStore | null {
  //Convert from parameters
  let alias_name = arg3_alias_name
  let clean_stem = arg0_clean_stem
  let dataset_cache_dir = arg1_dataset_cache_dir
  let hot_index_path = arg2_hot_index_path

  //Guard clauses
  if (!fs.existsSync(hot_index_path))
    return null

  //Function body
  try {
    let loaded = readSectionedBinaryFile(hot_index_path, BINARY_MAGIC)
    let sec = loaded.sections
    let meta = loaded.meta
    let cell_keys = toTypedArray(sec.get('cell_keys')!, Int32Array, 4)
    let cell_offs = toTypedArray(sec.get('cell_offs')!, Uint32Array, 4)
    let cell_lens = toTypedArray(sec.get('cell_lens')!, Uint32Array, 4)
    let cell_map = new Map<number, { length: number; offset: number }>()
    for (let i = 0; i < cell_keys.length; i++)
      cell_map.set(cell_keys[i], { length: cell_lens[i], offset: cell_offs[i] })

    let sparse_obj = JSON.parse(sec.get('sparse_json')!.toString('utf8'))
    let cap_records_by_idx = new Map<number, CapitalRecord[]>(sparse_obj.cap_meta || [])
    let hist_names_by_idx = new Map<number, HistoricalNameRecord[]>(sparse_obj.hist_meta || [])

    let store: BinaryDatasetStore = {
      build_time_ms: Number(meta.build_time_ms || Date.now()),
      cap_records_by_idx,
      capital_city_indices: toTypedArray(sec.get('capital_city_indices')!, Uint32Array, 4),
      cell_city_indices: toTypedArray(sec.get('cell_city_indices')!, Uint32Array, 4),
      cell_map,
      count: Number(meta.count || 0),
      counterpart_idx: toTypedArray(sec.get('counterpart_idx')!, Int32Array, 4),
      country_buf: sec.get('country_buf')!,
      country_offsets: toTypedArray(sec.get('country_off')!, Uint32Array, 4),
      dataset_dir: dataset_cache_dir,
      detail_len: toTypedArray(sec.get('detail_len')!, Uint32Array, 4),
      detail_offset: toTypedArray(sec.get('detail_offset')!, Float64Array, 8),
      flags: sec.get('flags')!,
      hash_bucket_heads: toTypedArray(sec.get('hash_bucket_heads')!, Int32Array, 4),
      hash_entry_city: toTypedArray(sec.get('hash_entry_city')!, Uint32Array, 4),
      hash_entry_hashes: toTypedArray(sec.get('hash_entry_hashes')!, Uint32Array, 4),
      hash_entry_next: toTypedArray(sec.get('hash_entry_next')!, Int32Array, 4),
      hash_mask: Number(meta.hash_mask || 0),
      hist_names_by_idx,
      id_buf: sec.get('id_buf')!,
      id_offsets: toTypedArray(sec.get('id_off')!, Uint32Array, 4),
      key_buf: sec.get('key_buf')!,
      key_offsets: toTypedArray(sec.get('key_off')!, Uint32Array, 4),
      lat: toTypedArray(sec.get('lat')!, Float32Array, 4),
      lon: toTypedArray(sec.get('lon')!, Float32Array, 4),
      max_pop: toTypedArray(sec.get('max_pop')!, Float32Array, 4),
      max_year: toTypedArray(sec.get('max_year')!, Int16Array, 2),
      min_year: toTypedArray(sec.get('min_year')!, Int16Array, 2),
      name_buf: sec.get('name_buf')!,
      name_offsets: toTypedArray(sec.get('name_off')!, Uint32Array, 4),
      other_buf: sec.get('other_buf')!,
      other_offsets: toTypedArray(sec.get('other_off')!, Uint32Array, 4),
      pop_len: toTypedArray(sec.get('pop_len')!, Uint16Array, 2),
      pop_offset: toTypedArray(sec.get('pop_off')!, Uint32Array, 4),
      pop_vals: toTypedArray(sec.get('pop_vals')!, Float32Array, 4),
      pop_years: toTypedArray(sec.get('pop_years')!, Int16Array, 2),
      region_idx: toTypedArray(sec.get('region_idx')!, Uint16Array, 2),
      regions: Array.isArray(meta.regions) ? meta.regions : [],
      shard_files: Array.isArray(meta.shard_files) ? meta.shard_files : [],
      shard_idx: toTypedArray(sec.get('shard_idx')!, Uint16Array, 2),
    }

    binary_store_cache.set(clean_stem, store)
    if (alias_name && alias_name !== clean_stem)
      binary_store_cache.set(alias_name, store)

    //Return statement
    return store
  } catch (arg0_err) {
    console.warn(`[StadesterCompiler] Failed to read binary store for ${clean_stem}:`, arg0_err)
    //Return statement
    return null
  }
}


/**
 * Checks whether the compiled binary store for a dataset is up to date against all shards and metadata files.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {boolean}
 */
export function isBinaryDatasetFresh (arg0_dataset_name?: string): boolean {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')
  let manifest_path = path.join(dataset_cache_dir, 'build_manifest.json')
  let source_info = resolveDatasetSourceFiles(clean_stem)

  //Guard clauses
  if (source_info.files.length === 0 || !fs.existsSync(manifest_path) || !fs.existsSync(hot_index_path))
    return false

  //Function body
  try {
    let manifest: BinaryBuildManifest = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
    if (!manifest || manifest.version !== BINARY_FORMAT_VERSION)
      return false
    if (Object.keys(manifest.shards || {}).length !== source_info.files.length)
      return false

    for (let i = 0; i < source_info.files.length; i++) {
      let src_file = source_info.files[i]
      let base_slug = path.basename(src_file, path.extname(src_file))
      let prev = manifest.shards[base_slug]
      if (!prev)
        return false
      let st = fs.statSync(src_file)
      if (prev.size !== st.size || Math.round(prev.mtime_ms) !== Math.round(st.mtimeMs))
        return false
    }

    let meta_sig = getFileSignature(resolveCityMetadataPath(clean_stem))
    let cap_sig = getFileSignature(FilepathDefines.get().filepaths.stadester_capitals)
    let bugged_sig = getFileSignature(FilepathDefines.get().filepaths.stadester_bugged_cities)

    //Return statement
    return (
      manifest.metadata_sig === meta_sig &&
      manifest.capitals_sig === cap_sig &&
      manifest.bugged_sig === bugged_sig
    )
  } catch {
    //Return statement
    return false
  }
}


/**
 * Loads (and incrementally compiles if needed) the binary columnar store into memory.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {BinaryDatasetStore | null}
 */
export function loadBinaryStore (arg0_dataset_name?: string): BinaryDatasetStore | null {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')

  //Guard clauses
  if (binary_store_cache.has(clean_stem))
    return binary_store_cache.get(clean_stem)!

  //Function body
  if (!isBinaryDatasetFresh(clean_stem) && !active_binary_compiles.has(clean_stem)) {
    try {
      compileStadesterDataset(clean_stem)
    } catch (arg0_err) {
      console.warn(`[StadesterCompiler] Binary compilation failed for ${clean_stem}:`, arg0_err)
      if (!fs.existsSync(hot_index_path))
        return null
    }
  }

  //Return statement
  return readBinaryStoreFromDisk(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)
}
