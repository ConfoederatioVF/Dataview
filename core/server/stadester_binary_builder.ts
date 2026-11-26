import fs from 'fs'
import path from 'path'
import { DEFAULT_STADESTER_SCALING_CONFIG, getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import { isBuggedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  normalizeCityKey,
  normalizePrimaryCityKey,
  parseYearMonthDay,
  type CapitalRecord,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'
import { loadGhslCsvNames, resolveCityDisplayName } from './ghsl_resolver.ts'
import { bindCityMetadataOverlay, getStateById, getStateCapitals } from './stadester_metadata.ts'
import {
  getBuggedCitiesSet,
  getPrimaryCityNormKey,
  isCityInsideStateBBox,
  packSpatialGridKey,
  selectBestCapitalCandidateForTimeline,
} from './stadester_types.ts'
import {
  BINARY_MAGIC,
  CAP_STATE_ID_NULL,
  ERA_BANDS,
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
  SINGLE_HIST_YEAR_NONE,
  fnv1a32,
  getSpatialCellKey2Deg,
  packStringArray,
  readPackedString,
  readSectionedBinaryFile,
  thinTimeSeries,
  thinTimeSeriesLogLinear,
  toTypedArray,
  writeSectionedBinaryFile,
} from './stadester_binary_format.ts'

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
export function compileRawShardToBinary (
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

  let tmp_detail_path = `${detail_path}.tmp.${process.pid}.${Date.now()}`
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
 * Evaluates a sound upper bound on interpolated population for a sorted `(years, vals)` slice over `[band_min, band_max]`.
 *
 * @param {Int16Array} arg0_pop_years
 * @param {Float32Array} arg1_pop_vals
 * @param {number} arg2_off
 * @param {number} arg3_len
 * @param {number} arg4_band_min
 * @param {number} arg5_band_max
 *
 * @returns {number}
 */
function computeBandPeakPopulation (
  arg0_pop_years: Int16Array,
  arg1_pop_vals: Float32Array,
  arg2_off: number,
  arg3_len: number,
  arg4_band_min: number,
  arg5_band_max: number
): number {
  //Convert from parameters
  let band_max = arg5_band_max
  let band_min = arg4_band_min
  let len = arg3_len
  let off = arg2_off
  let pop_vals = arg1_pop_vals
  let pop_years = arg0_pop_years

  //Guard clauses
  if (len === 0)
    return 0

  //Declare local instance variables
  let first_yr = pop_years[off]
  let last_yr = pop_years[off + len - 1]
  let peak = 0

  //Function body
  if (last_yr < band_min || first_yr > band_max)
    return 0

  let interpAt = function (arg0_target_yr: number): number {
    if (arg0_target_yr <= first_yr)
      return pop_vals[off] || 0
    if (arg0_target_yr >= last_yr)
      return pop_vals[off + len - 1] || 0
    let hi = len
    let lo = 0
    for (let z = 0; z < 32 && lo < hi; z++) {
      let mid = (lo + hi) >> 1
      if (pop_years[off + mid] < arg0_target_yr)
        lo = mid + 1
      else
        hi = mid
    }
    if (lo < len && pop_years[off + lo] === arg0_target_yr)
      return pop_vals[off + lo] || 0
    let idx = Math.max(1, Math.min(len - 1, lo))
    let y0 = pop_years[off + idx - 1]
    let y1 = pop_years[off + idx]
    let p0 = pop_vals[off + idx - 1] || 0
    let p1 = pop_vals[off + idx] || 0
    let i0 = y0 < 0 ? 1000 : (y0 < 1700 ? 100 : 10)
    let i1 = y1 < 0 ? 1000 : (y1 < 1700 ? 100 : 10)
    let ym = (y0 + y1)/2
    let im = ym < 0 ? 1000 : (ym < 1700 ? 100 : 10)
    let max_gap = Math.max(200, i0, i1, im)
    if ((y1 - y0) > max_gap)
      return 0
    if (p0 >= 0.01 && p1 >= 0.01 && y1 > y0) {
      let t = (arg0_target_yr - y0)/(y1 - y0)
      return Math.pow(10, Math.log10(p0) + t*(Math.log10(p1) - Math.log10(p0)))
    }
    return Math.max(p0, p1)
  }

  for (let i = 0; i < len; i++) {
    let yr = pop_years[off + i]
    if (yr >= band_min && yr <= band_max) {
      let v = pop_vals[off + i] || 0
      if (v > peak)
        peak = v
    }
  }

  if (first_yr < band_min && last_yr > band_min) {
    let v_lo = interpAt(band_min)
    if (v_lo > peak)
      peak = v_lo
  }
  if (first_yr < band_max && last_yr > band_max) {
    let v_hi = interpAt(band_max)
    if (v_hi > peak)
      peak = v_hi
  }

  //Return statement (+1 margin for rounding safety)
  return peak > 0 ? peak + 1 : 0
}


/**
 * Binds `data/stadester/state_capitals.json` timelines directly onto Stage B city entries,
 * indexing only settlements whose keys or names match candidate state-capital tokens.
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
  let all_state_ids: string[]
  let city_intervals = new Map<any, Array<{ is_authoritative?: boolean; start_date: string; start_frac: number; state_id: number; stop_date: string; stop_frac: number }>>()
  let name_to_cities = new Map<string, any[]>()
  let needed_city_names = new Set<string>()
  let needed_norm_keys = new Set<string>()
  let norm_key_to_cities = new Map<string, any[]>()
  let state_capitals = getStateCapitals()

  //Guard clauses
  if (!state_capitals || Object.keys(state_capitals).length === 0)
    return

  //Function body
  all_state_ids = Object.keys(state_capitals)

  //Pre-collect target keys and city names from state_capitals.json so we only index matching settlements
  for (let z = 0; z < all_state_ids.length; z++) {
    let sc_entry = state_capitals[all_state_ids[z]]
    if (!sc_entry || sc_entry.acapital || !sc_entry.timeline || sc_entry.timeline.length === 0)
      continue
    for (let a = 0; a < sc_entry.timeline.length; a++) {
      let tl_item = sc_entry.timeline[a]
      if (!tl_item.start)
        continue
      if (tl_item.key) {
        let nk = normalizeCityKey(tl_item.key)
        if (nk)
          needed_norm_keys.add(nk)
        let pnk = getPrimaryCityNormKey(tl_item.key)
        if (pnk)
          needed_norm_keys.add(pnk)
      }
      if (tl_item.city) {
        let cn = tl_item.city.toLowerCase().trim()
        if (cn)
          needed_city_names.add(cn)
      }
    }
  }

  let special_key_re = /[([;,łđøß]/i
  for (let i = 0; i < entries.length; i++) {
    let city = entries[i]
    let c_key = city.key
    let n_k = normalizeCityKey(c_key)
    if (needed_norm_keys.has(n_k)) {
      let arr = norm_key_to_cities.get(n_k)
      if (!arr) {
        arr = []
        norm_key_to_cities.set(n_k, arr)
      }
      arr.push(city)
    }

    if (special_key_re.test(c_key)) {
      let primary_nk = getPrimaryCityNormKey(c_key)
      if (primary_nk && primary_nk !== n_k && needed_norm_keys.has(primary_nk)) {
        let arr = norm_key_to_cities.get(primary_nk)
        if (!arr) {
          arr = []
          norm_key_to_cities.set(primary_nk, arr)
        }
        arr.push(city)
      }
    }

    let clean_name = (city.name || '').toLowerCase().trim()
    if (clean_name && needed_city_names.has(clean_name)) {
      let arr = name_to_cities.get(clean_name)
      if (!arr) {
        arr = []
        name_to_cities.set(clean_name, arr)
      }
      arr.push(city)
    }

    if (Array.isArray(city.other_names)) {
      for (let x = 0; x < city.other_names.length; x++) {
        let on_clean = String(city.other_names[x] || '').toLowerCase().trim()
        if (on_clean && on_clean !== clean_name && needed_city_names.has(on_clean)) {
          let arr = alias_to_cities.get(on_clean)
          if (!arr) {
            arr = []
            alias_to_cities.set(on_clean, arr)
          }
          arr.push(city)
        }
      }
    }
    if (Array.isArray(city.historical_names)) {
      for (let x = 0; x < city.historical_names.length; x++) {
        let hn_clean = String(city.historical_names[x]?.name || '').toLowerCase().trim()
        if (hn_clean && hn_clean !== clean_name && needed_city_names.has(hn_clean)) {
          let arr = alias_to_cities.get(hn_clean)
          if (!arr) {
            arr = []
            alias_to_cities.set(hn_clean, arr)
          }
          arr.push(city)
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


/**
 * Runs Stage B: loads compact shard indices, applies 0,25-deg spatial metadata & state capital bindings,
 * applies log-linear population thinning for the hot index, sorts descending by max_pop,
 * builds 2-level spatial cells, era peak-pop indices, packed binary hist/cap columns, & O(1) search hash,
 * and writes v3 `hot_index.bin`.
 *
 * @param {string} arg0_dataset_name
 * @param {string} arg1_cache_dataset_dir
 * @param {Array<{ detail_path: string; idx_path: string }>} arg2_shard_artifacts
 *
 * @returns {void}
 */
export function buildGlobalBinaryIndex (
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
  let has_ghsl_entries = false
  let has_stadester_entries = false
  let key_to_temp_idx = new Map<string, number>()
  let opt_scaling = getOptimisationConfig().config?.stadester_scaling || DEFAULT_STADESTER_SCALING_CONFIG
  let thin_rel_tol = opt_scaling.timeseries_log_thin_rel_tol ?? DEFAULT_STADESTER_SCALING_CONFIG.timeseries_log_thin_rel_tol

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
      let p_yrs_slice = pop_years_arr.subarray(p_off, p_off + p_len)
      let p_vals_slice = pop_vals_arr.subarray(p_off, p_off + p_len)
      let thinned_hot = thinTimeSeriesLogLinear(p_yrs_slice, p_vals_slice, thin_rel_tol)

      let has_colour = (flags_arr[i] & FLAG_HAS_COLOUR) !== 0
      let col = has_colour
        ? [colours_arr[i*3], colours_arr[i*3 + 1], colours_arr[i*3 + 2]] as [number, number, number]
        : null

      let is_ghsl = (flags_arr[i] & FLAG_IS_GHSL) !== 0
      if (is_ghsl)
        has_ghsl_entries = true
      if (key_str.startsWith('stadester-'))
        has_stadester_entries = true

      let entry_obj: any = {
        colour: col,
        coords: [lat_arr[i], lon_arr[i]] as [number, number],
        country: country_str,
        detail_len: detail_len_arr[i],
        detail_offset: detail_off_arr[i],
        id: id_str,
        is_ghsl,
        key: key_str,
        max_pop: max_pop_arr[i],
        max_year: max_yr_arr[i],
        min_year: min_yr_arr[i],
        name: name_str,
        other_names: other_str ? other_str.split('\x1f') : undefined,
        pop_vals: thinned_hot.vals,
        pop_years: thinned_hot.years,
        region: region_str,
        shard_idx: s,
      }

      let idx = entries.length
      entries.push(entry_obj)
      key_to_temp_idx.set(key_str, idx)
    }
  }

  appendManualFallbackCities(entries, key_to_temp_idx)

  //Drop per-version city_metadata/ overlay points directly onto nearest underlying settlement points (Tier-0 capitals first)
  bindCityMetadataOverlay(entries, dataset_name, {
    key_lookup: (arg0_k: string) => {
      let idx = key_to_temp_idx.get(arg0_k)
      return idx !== undefined ? entries[idx] : undefined
    },
    release_cache_after_bind: true,
  })

  //Bind authoritative state_capitals.json timelines via targeted hash lookup maps
  bindStateCapitalsToEntries(entries, key_to_temp_idx)

  //Sort entries globally descending by max_pop so top-K queries can break early
  entries.sort((arg0_a, arg1_b) => arg1_b.max_pop - arg0_a.max_pop)

  //Build flat TypedArrays, spatial cells, era indices, binary hist/cap columns, and search hash
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
  let counterpart_arr = new Int32Array(count).fill(-1)
  let single_hist_year_arr = new Int16Array(count).fill(SINGLE_HIST_YEAR_NONE)

  let hist_city_off = new Uint32Array(count)
  let hist_city_len = new Uint16Array(count)
  let hist_year_frac_list: number[] = []
  let hist_name_list: string[] = []
  let hist_date_list: string[] = []

  let cap_city_off = new Uint32Array(count)
  let cap_city_len = new Uint16Array(count)
  let cap_year_frac_list: number[] = []
  let cap_state_id_list: number[] = []
  let cap_date_list: string[] = []
  let cap_city_indices: number[] = []

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
  let cell_buckets = new Map<number, number[]>()
  let pop_cursor = 0
  let canonical_date_re = /^-?\d+\.1\.1$/

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

    let c_name_str = e.name || ''
    let f = 0
    if (isBuggedCityName(c_name_str, bugged_set) || (e.key && isBuggedCityName(e.key, bugged_set)))
      f |= FLAG_IS_BUGGED
    if (e.is_ghsl)
      f |= FLAG_IS_GHSL

    if (e.capital_records && e.capital_records.length > 0) {
      let c_recs: CapitalRecord[] = e.capital_records
      f |= FLAG_HAS_CAPITALS
      cap_city_indices.push(i)
      cap_city_off[i] = cap_year_frac_list.length
      cap_city_len[i] = Math.min(65535, c_recs.length)
      for (let x = 0; x < cap_city_len[i]; x++) {
        let rec = c_recs[x]
        let sid_num = (rec.state_id !== null && rec.state_id !== undefined && Number.isFinite(Number(rec.state_id)))
          ? Math.trunc(Number(rec.state_id))
          : CAP_STATE_ID_NULL
        cap_year_frac_list.push(rec.year_frac)
        cap_state_id_list.push(sid_num)
        cap_date_list.push(rec.date || '')
      }
    }

    if (e.historical_names && e.historical_names.length > 0) {
      let h_recs: HistoricalNameRecord[] = e.historical_names
      //Compact encoding for single-entry non-GHSL identical canonical names (92,5% of entries in 2.0)
      let stored_compact = false
      if (!e.is_ghsl && h_recs.length === 1 && h_recs[0].name === c_name_str && canonical_date_re.test(h_recs[0].date)) {
        let yr_num = Math.trunc(h_recs[0].year_frac)
        if (yr_num > SINGLE_HIST_YEAR_NONE && yr_num <= 32767) {
          single_hist_year_arr[i] = yr_num
          stored_compact = true
        }
      }

      if (!stored_compact) {
        f |= FLAG_HAS_HIST_NAMES
        hist_city_off[i] = hist_year_frac_list.length
        hist_city_len[i] = Math.min(65535, h_recs.length)
        for (let x = 0; x < hist_city_len[i]; x++) {
          let rec = h_recs[x]
          hist_year_frac_list.push(rec.year_frac)
          hist_name_list.push(rec.name || '')
          hist_date_list.push(rec.date || '')
        }
      }
    }

    if (e.colour)
      f |= FLAG_HAS_COLOUR
    flags_arr[i] = f

    pop_off_arr[i] = pop_cursor
    pop_len_arr[i] = e.pop_years.length
    for (let x = 0; x < e.pop_years.length; x++) {
      pop_years_flat[pop_cursor] = Math.max(-32768, Math.min(32767, e.pop_years[x]))
      pop_vals_flat[pop_cursor] = e.pop_vals[x]
      pop_cursor++
    }

    keys_arr[i] = e.key
    names_arr[i] = c_name_str
    countries_arr[i] = e.country || ''
    //Deduplicate id_buf when id === key (saves ~11,6 MB on 2.0; readers fall back to key)
    let raw_id_str = String(e.id || '')
    ids_arr[i] = (raw_id_str && raw_id_str !== e.key) ? raw_id_str : ''
    others_arr[i] = Array.isArray(e.other_names) ? e.other_names.slice(0, 8).join('\x1f') : ''

    let cell_k = getSpatialCellKey2Deg(e.coords[0], e.coords[1])
    let bucket = cell_buckets.get(cell_k)
    if (!bucket) {
      bucket = []
      cell_buckets.set(cell_k, bucket)
    }
    bucket.push(i)
  }

  //Link era counterparts (stadester <-> ghsl within 35km) ONLY when dataset contains both prefixes
  if (has_ghsl_entries && has_stadester_entries) {
    let era_grid = new Map<number, number[]>()
    for (let i = 0; i < count; i++) {
      let k = keys_arr[i]
      if (!k.startsWith('stadester-') && !k.startsWith('ghsl-'))
        continue
      let bk = packSpatialGridKey(Math.floor(lat_arr[i]*cells_per_degree), Math.floor(lon_arr[i]*cells_per_degree))
      let cell = era_grid.get(bk)
      if (!cell) {
        cell = []
        era_grid.set(bk, cell)
      }
      cell.push(i)
    }

    for (let i = 0; i < count; i++) {
      let k = keys_arr[i]
      if (!k.startsWith('stadester-') && !k.startsWith('ghsl-'))
        continue
      let target_prefix = k.startsWith('stadester-') ? 'ghsl-' : 'stadester-'
      let c_lat = lat_arr[i]
      let c_lng = lon_arr[i]
      let c_name = names_arr[i].toLowerCase().trim()
      let c_clean = c_name.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim()
      let center_lat = Math.floor(c_lat*cells_per_degree)
      let center_lng = Math.floor(c_lng*cells_per_degree)
      let best_dist = 999999
      let best_idx = -1

      for (let d_lat = -2; d_lat <= 2; d_lat++) {
        for (let d_lng = -2; d_lng <= 2; d_lng++) {
          let cell = era_grid.get(packSpatialGridKey(center_lat + d_lat, center_lng + d_lng))
          if (!cell)
            continue
          for (let c = 0; c < cell.length; c++) {
            let o_idx = cell[c]
            if (!keys_arr[o_idx].startsWith(target_prefix))
              continue
            let dist = computeHaversineDistanceKm(c_lat, c_lng, lat_arr[o_idx], lon_arr[o_idx])
            if (dist > 35)
              continue
            let o_name = names_arr[o_idx].toLowerCase().trim()
            let o_clean = o_name.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim()
            let matches = Boolean(c_clean && o_clean && (c_clean === o_clean || o_name.includes(c_clean) || c_name.includes(o_clean)))
            if (matches && dist < best_dist) {
              best_dist = dist
              best_idx = o_idx
            }
          }
        }
      }
      counterpart_arr[i] = best_idx
    }
  }

  //Build era peak-population sorted indices for historical bands (<= 1950) so ancient/medieval queries break early
  let era_band_offs = new Uint32Array(ERA_BANDS.length + 1)
  let era_band_pairs_all: Array<{ idxs: Uint32Array; peaks: Float32Array }> = []
  let total_era_entries = 0

  for (let b = 0; b < ERA_BANDS.length; b++) {
    let band = ERA_BANDS[b]
    let band_list: Array<{ idx: number; peak: number }> = []
    for (let i = 0; i < count; i++) {
      if ((flags_arr[i] & FLAG_IS_BUGGED) !== 0 || pop_len_arr[i] === 0)
        continue
      if (min_yr_arr[i] > band.max_year || max_yr_arr[i] < band.min_year)
        continue
      let pk = computeBandPeakPopulation(pop_years_flat, pop_vals_flat, pop_off_arr[i], pop_len_arr[i], band.min_year, band.max_year)
      if (pk >= 0.01)
        band_list.push({ idx: i, peak: pk })
    }
    band_list.sort((arg0_a, arg1_b) => arg1_b.peak - arg0_a.peak)
    let b_idxs = new Uint32Array(band_list.length)
    let b_peaks = new Float32Array(band_list.length)
    for (let i = 0; i < band_list.length; i++) {
      b_idxs[i] = band_list[i].idx
      b_peaks[i] = band_list[i].peak
    }
    era_band_offs[b] = total_era_entries
    total_era_entries += band_list.length
    era_band_pairs_all.push({ idxs: b_idxs, peaks: b_peaks })
  }
  era_band_offs[ERA_BANDS.length] = total_era_entries

  let era_city_indices = new Uint32Array(total_era_entries)
  let era_band_max_pop = new Float32Array(total_era_entries)
  for (let b = 0; b < ERA_BANDS.length; b++) {
    era_city_indices.set(era_band_pairs_all[b].idxs, era_band_offs[b])
    era_band_max_pop.set(era_band_pairs_all[b].peaks, era_band_offs[b])
  }

  //Flatten dense 2-level hierarchical spatial index (10-deg macro blocks + 2-deg fine cells in row-major order)
  let fine_offs = new Uint32Array(FINE_GRID_CELLS)
  let fine_lens = new Uint32Array(FINE_GRID_CELLS)
  let fine_max_pop = new Float32Array(FINE_GRID_CELLS)
  let macro_counts = new Uint32Array(MACRO_GRID_CELLS)
  let macro_max_pop = new Float32Array(MACRO_GRID_CELLS)
  let cell_city_indices = new Uint32Array(count)
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
      let top_mp = max_pop_arr[bucket[0]]
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

  //Build O(1) FNV-1a search hash table directly into growable TypedArrays (ASCII fast-path, zero object allocations)
  let tok_cap = Math.max(1024, count*5)
  let tok_hashes = new Uint32Array(tok_cap)
  let tok_cities = new Uint32Array(tok_cap)
  let tok_len = 0
  let non_ascii_re = /[^\x00-\x7F]/
  let prefix_re = /^(stadester-|ghsl-|oxford-)/i
  let paren_re = /\([^)]*\)/g
  let local_seen = new Uint32Array(8)

  let pushToken = function (arg0_str: string, arg1_city_idx: number, arg2_seen_len: number): number {
    if (!arg0_str)
      return arg2_seen_len
    let h = fnv1a32(arg0_str)
    for (let z = 0; z < arg2_seen_len; z++) {
      if (local_seen[z] === h)
        return arg2_seen_len
    }
    local_seen[arg2_seen_len] = h
    if (tok_len >= tok_cap) {
      let next_cap = tok_cap*2
      let next_h = new Uint32Array(next_cap)
      let next_c = new Uint32Array(next_cap)
      next_h.set(tok_hashes)
      next_c.set(tok_cities)
      tok_hashes = next_h
      tok_cities = next_c
      tok_cap = next_cap
    }
    tok_hashes[tok_len] = h
    tok_cities[tok_len] = arg1_city_idx
    tok_len++
    return arg2_seen_len + 1
  }

  for (let i = 0; i < count; i++) {
    let seen_len = 0
    let k = keys_arr[i]
    let bare = prefix_re.test(k) ? k.replace(prefix_re, '') : k
    let norm_k = non_ascii_re.test(k)
      ? k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      : k.toLowerCase().trim()
    let primary_k = normalizePrimaryCityKey(k)
    let nm = names_arr[i]
    let norm_name = non_ascii_re.test(nm)
      ? nm.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
      : nm.toLowerCase().trim()
    let clean_name = norm_name.includes('(')
      ? norm_name.replace(paren_re, '').replace(/\s+/g, ' ').trim()
      : norm_name

    seen_len = pushToken(k, i, seen_len)
    if (bare !== k) {
      seen_len = pushToken(bare, i, seen_len)
      let bare_primary_k = normalizePrimaryCityKey(bare)
      seen_len = pushToken(bare_primary_k, i, seen_len)
    }
    seen_len = pushToken(norm_k, i, seen_len)
    seen_len = pushToken(primary_k, i, seen_len)
    if (ids_arr[i])
      seen_len = pushToken(ids_arr[i], i, seen_len)
    seen_len = pushToken(norm_name, i, seen_len)
    if (clean_name !== norm_name)
      seen_len = pushToken(clean_name, i, seen_len)
  }

  let bucket_pow = 1
  for (let i = 0; i < 28 && bucket_pow < Math.max(64, tok_len*2); i++)
    bucket_pow <<= 1
  let hash_mask = bucket_pow - 1
  let hash_bucket_heads = new Int32Array(bucket_pow).fill(-1)
  let hash_entry_hashes = tok_hashes.subarray(0, tok_len)
  let hash_entry_city = tok_cities.subarray(0, tok_len)
  let hash_entry_next = new Int32Array(tok_len)

  for (let i = 0; i < tok_len; i++) {
    let b = hash_entry_hashes[i] & hash_mask
    hash_entry_next[i] = hash_bucket_heads[b]
    hash_bucket_heads[b] = i
  }

  let packed_keys = packStringArray(keys_arr)
  let packed_names = packStringArray(names_arr)
  let packed_countries = packStringArray(countries_arr)
  let packed_ids = packStringArray(ids_arr)
  let packed_others = packStringArray(others_arr)
  let packed_hist_names = packStringArray(hist_name_list)
  let packed_hist_dates = packStringArray(hist_date_list)
  let packed_cap_dates = packStringArray(cap_date_list)
  let shard_rel_files = shard_artifacts.map((arg0_s) => path.basename(arg0_s.detail_path))

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
      { data: single_hist_year_arr, name: 'single_hist_year' },
      { data: hist_city_off, name: 'hist_city_off' },
      { data: hist_city_len, name: 'hist_city_len' },
      { data: new Float32Array(hist_year_frac_list), name: 'hist_year_frac' },
      { data: packed_hist_names.offsets, name: 'hist_name_off' },
      { data: packed_hist_names.buf, name: 'hist_name_buf' },
      { data: packed_hist_dates.offsets, name: 'hist_date_off' },
      { data: packed_hist_dates.buf, name: 'hist_date_buf' },
      { data: cap_city_off, name: 'cap_city_off' },
      { data: cap_city_len, name: 'cap_city_len' },
      { data: new Float32Array(cap_year_frac_list), name: 'cap_year_frac' },
      { data: new Int32Array(cap_state_id_list), name: 'cap_state_id' },
      { data: packed_cap_dates.offsets, name: 'cap_date_off' },
      { data: packed_cap_dates.buf, name: 'cap_date_buf' },
      { data: era_band_offs, name: 'era_band_offs' },
      { data: era_city_indices, name: 'era_city_indices' },
      { data: era_band_max_pop, name: 'era_band_max_pop' },
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
    ]
  )
}
