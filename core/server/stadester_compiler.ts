import fs from 'fs'
import os from 'os'
import path from 'path'
import { DEFAULT_RESOURCE_LIMITS_CONFIG, getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import { isBuggedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  normalizeCityKey,
  normalizePrimaryCityKey,
  parseYearMonthDay,
  type CapitalRecord,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'
import { FilepathDefines } from './filepath_defines.ts'
import { loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { getDefaultStadesterDatasetId } from './stadester_config_loader.ts'
import { resolveDatasetSourceFiles } from './stadester_loader.ts'
import { bindCityMetadataOverlay, getCityMetadataSignature, getStateById, getStateCapitals } from './stadester_metadata.ts'
import {
  getBuggedCitiesSet,
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  selectBestCapitalCandidateForTimeline,
  type CityIndexEntry,
} from './stadester_types.ts'
import {
  BINARY_FORMAT_VERSION,
  BINARY_MAGIC,
  FINE_GRID_CELLS,
  FINE_GRID_COLS,
  FINE_GRID_ROWS,
  FLAG_HAS_CAPITALS,
  FLAG_HAS_COLOUR,
  FLAG_HAS_HIST_NAMES,
  FLAG_IS_BUGGED,
  FLAG_IS_GHSL,
  MACRO_GRID_CELLS,
  MACRO_GRID_COLS,
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
  let bugged_set = getBuggedCitiesSet()
  let cells_per_degree = 4
  let entries: any[] = []
  let key_to_temp_idx = new Map<string, number>()
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

  //Build 0.25-deg spatial grid for era counterpart linking
  for (let i = 0; i < entries.length; i++) {
    let e = entries[i]
    raw_city_name_by_key.set(e.key, e.name || '')
    let bin_key = `${Math.floor(e.coords[0]*cells_per_degree)},${Math.floor(e.coords[1]*cells_per_degree)}`
    if (!spatial_grid_meta[bin_key])
      spatial_grid_meta[bin_key] = []
    spatial_grid_meta[bin_key].push(e)
  }

  //Drop per-version city_metadata/ overlay points directly onto nearest underlying settlement points (Tier-0 capitals first)
  bindCityMetadataOverlay(entries, dataset_name, {
    key_lookup: (arg0_k: string) => {
      let idx = key_to_temp_idx.get(arg0_k)
      return idx !== undefined ? entries[idx] : undefined
    },
  })

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

  //Flatten dense 2-level hierarchical spatial index (10-deg macro blocks + 2-deg fine cells in row-major order)
  let fine_offs = new Uint32Array(FINE_GRID_CELLS)
  let fine_lens = new Uint32Array(FINE_GRID_CELLS)
  let fine_max_pop = new Float32Array(FINE_GRID_CELLS)
  let macro_counts = new Uint32Array(MACRO_GRID_CELLS)
  let macro_max_pop = new Float32Array(MACRO_GRID_CELLS)
  let total_cell_entries = count
  let cell_city_indices = new Uint32Array(total_cell_entries)
  let cell_cursor = 0

  for (let cy = 0; cy < FINE_GRID_ROWS; cy++) {
    let my = Math.floor(cy/5)
    for (let cx = 0; cx < FINE_GRID_COLS; cx++) {
      let cid = cy*FINE_GRID_COLS + cx
      let bucket = cell_buckets.get(cid)
      if (!bucket || bucket.length === 0)
        continue
      let mx = Math.floor(cx/5)
      let mid = my*MACRO_GRID_COLS + mx
      let top_mp = entries[bucket[0]].max_pop
      fine_offs[cid] = cell_cursor
      fine_lens[cid] = bucket.length
      fine_max_pop[cid] = top_mp
      macro_counts[mid] += bucket.length
      if (top_mp > macro_max_pop[mid])
        macro_max_pop[mid] = top_mp
      for (let i = 0; i < bucket.length; i++)
        cell_city_indices[cell_cursor++] = bucket[i]
    }
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
      { data: fine_offs, name: 'fine_offs' },
      { data: fine_lens, name: 'fine_lens' },
      { data: fine_max_pop, name: 'fine_max_pop' },
      { data: macro_counts, name: 'macro_counts' },
      { data: macro_max_pop, name: 'macro_max_pop' },
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
 * When `only_project` is supplied, only dirty shards belonging to that macro-region are recompiled;
 * unmodified regional shard caches (e.g. CENTAUR) remain completely untouched on disk.
 *
 * @param {string} [arg0_dataset_name]
 * @param {{ force?: boolean; only_project?: string; relink?: boolean }} [arg1_options]
 *
 * @returns {{ compiled_shards: number; duration_ms: number; hot_index_path: string; skipped_shards: number; total_entries: number }}
 */
export function compileStadesterDataset (
  arg0_dataset_name?: string,
  arg1_options?: { force?: boolean; only_project?: string; relink?: boolean }
): { compiled_shards: number; duration_ms: number; hot_index_path: string; skipped_shards: number; total_entries: number } {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let options = (arg1_options) ? arg1_options : {}

  //Declare local instance variables
  let bugged_path = FilepathDefines.get().filepaths.stadester_bugged_cities
  let cache_manifest_path: string
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let cap_path = FilepathDefines.get().filepaths.stadester_capitals
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let compiled_shards = 0
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')
  let manifest_path = path.join(dataset_cache_dir, 'build_manifest.json')
  let only_project_key = options.only_project ? String(options.only_project).trim().toUpperCase() : ''
  let prev_manifest: BinaryBuildManifest | null = null
  let resource_limits = applyCompilerResourceLimits()
  let shards_dir = path.join(dataset_cache_dir, 'shards')
  let skipped_shards = 0
  let source_info = resolveDatasetSourceFiles(clean_stem)
  let t_start = Date.now()
  let target_project_files: Set<string> | null = null

  cache_manifest_path = path.join(dataset_cache_dir, 'cache_manifest.json')

  //Guard clauses
  if (source_info.files.length === 0)
    throw new Error(`Dataset sources not found for ${clean_stem}`)

  //Function body
  if (!fs.existsSync(shards_dir))
    fs.mkdirSync(shards_dir, { recursive: true })

  //Resolve target project shard files when --only-project is specified so untouched namespaces never churn
  if (only_project_key && source_info.is_partitioned && source_info.manifest_path && fs.existsSync(source_info.manifest_path)) {
    try {
      let sman = JSON.parse(fs.readFileSync(source_info.manifest_path, 'utf-8'))
      let regs = Array.isArray(sman.regions) ? sman.regions : []
      for (let i = 0; i < regs.length; i++) {
        if (String(regs[i].key || '').toUpperCase() === only_project_key && Array.isArray(regs[i].files)) {
          target_project_files = new Set(regs[i].files.map((arg0_f: string) => path.basename(arg0_f, path.extname(arg0_f))))
          break
        }
      }
    } catch {}
  }

  if (!options.force && fs.existsSync(manifest_path)) {
    try {
      let parsed = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
      if (parsed && typeof parsed.shards === 'object')
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
    let has_cached_pair = fs.existsSync(idx_path) && fs.existsSync(detail_path)
    let is_excluded_by_project_scope = Boolean(target_project_files && !target_project_files.has(base_slug) && has_cached_pair)
    let is_shard_fresh = Boolean(
      is_excluded_by_project_scope ||
      (
        !options.force &&
        prev_entry &&
        prev_entry.size === st.size &&
        Math.round(prev_entry.mtime_ms) === Math.round(st.mtimeMs) &&
        has_cached_pair
      )
    )

    if (!is_shard_fresh) {
      let shard_count = compileRawShardToBinary(src_file, idx_path, detail_path)
      compiled_shards++
      console.log(`[StadesterCompiler] Compiled dirty shard ${base_slug} (${shard_count} cities)`)

      let heap_used_mb = process.memoryUsage().heapUsed/(1024*1024)
      if (heap_used_mb > resource_limits.compiler_max_heap_mb*0.75 && typeof globalThis.gc === 'function')
        globalThis.gc()
      yieldCompilerThread(resource_limits.compiler_yield_ms)
    } else {
      skipped_shards++
    }

    next_shards[base_slug] = {
      detail_file: detail_rel,
      idx_file: idx_rel,
      mtime_ms: is_excluded_by_project_scope && prev_entry ? prev_entry.mtime_ms : st.mtimeMs,
      size: is_excluded_by_project_scope && prev_entry ? prev_entry.size : st.size,
    }
    shard_artifacts.push({ detail_path, idx_path })
  }

  let meta_sig = getCityMetadataSignature(clean_stem)
  let cap_sig = getFileSignature(cap_path)
  let bugged_sig = getFileSignature(bugged_path)
  let needs_stage_b = Boolean(
    options.force ||
    options.relink ||
    compiled_shards > 0 ||
    !prev_manifest ||
    prev_manifest.version !== BINARY_FORMAT_VERSION ||
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
      meta_sig = getCityMetadataSignature(clean_stem)
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
  fs.writeFileSync(cache_manifest_path, JSON.stringify({
    capitals_sig: cap_sig,
    compiled_shards,
    metadata_sig: meta_sig,
    only_project: only_project_key || null,
    shards: next_shards,
    skipped_shards,
    updated_at: new_manifest.compiled_at,
    version: BINARY_FORMAT_VERSION,
  }, null, 2), 'utf-8')

  let duration_ms = Date.now() - t_start
  if (compiled_shards > 0 || needs_stage_b) {
    console.log(`[StadesterCompiler] Built binary store for ${clean_stem}: ${total_entries} cities, ${compiled_shards} dirty / ${skipped_shards} skipped shards in ${duration_ms}ms`)
  }

  //Return statement
  return {
    compiled_shards,
    duration_ms,
    hot_index_path,
    skipped_shards,
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
    let sparse_obj = JSON.parse(sec.get('sparse_json')!.toString('utf8'))
    let cap_records_by_idx = new Map<number, CapitalRecord[]>(sparse_obj.cap_meta || [])
    let hist_names_by_idx = new Map<number, HistoricalNameRecord[]>(sparse_obj.hist_meta || [])

    let store: BinaryDatasetStore = {
      build_time_ms: Number(meta.build_time_ms || Date.now()),
      cap_records_by_idx,
      capital_city_indices: toTypedArray(sec.get('capital_city_indices')!, Uint32Array, 4),
      cell_city_indices: toTypedArray(sec.get('cell_city_indices')!, Uint32Array, 4),
      count: Number(meta.count || 0),
      counterpart_idx: toTypedArray(sec.get('counterpart_idx')!, Int32Array, 4),
      country_buf: sec.get('country_buf')!,
      country_offsets: toTypedArray(sec.get('country_off')!, Uint32Array, 4),
      dataset_dir: dataset_cache_dir,
      detail_len: toTypedArray(sec.get('detail_len')!, Uint32Array, 4),
      detail_offset: toTypedArray(sec.get('detail_offset')!, Float64Array, 8),
      fine_lens: toTypedArray(sec.get('fine_lens')!, Uint32Array, 4),
      fine_max_pop: toTypedArray(sec.get('fine_max_pop')!, Float32Array, 4),
      fine_offs: toTypedArray(sec.get('fine_offs')!, Uint32Array, 4),
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
      macro_counts: toTypedArray(sec.get('macro_counts')!, Uint32Array, 4),
      macro_max_pop: toTypedArray(sec.get('macro_max_pop')!, Float32Array, 4),
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

    let meta_sig = getCityMetadataSignature(clean_stem)
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
