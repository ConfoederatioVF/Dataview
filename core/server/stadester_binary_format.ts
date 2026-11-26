import fs from 'fs'
import path from 'path'
import type { CapitalRecord, HistoricalNameRecord } from '../framework/stadester/city_metadata_framework.ts'

export let BINARY_FORMAT_VERSION = 3
export let BINARY_MAGIC = 'STADBIN1'
export let CAP_STATE_ID_NULL = -2147483648
export let ERA_BANDS: ReadonlyArray<{ max_year: number; min_year: number }> = [
  { max_year: 0, min_year: -32768 },
  { max_year: 1000, min_year: 0 },
  { max_year: 1500, min_year: 1000 },
  { max_year: 1800, min_year: 1500 },
  { max_year: 1950, min_year: 1800 },
]
export let FINE_GRID_CELLS = 16200
export let FINE_GRID_COLS = 180
export let FINE_GRID_ROWS = 90
export let MACRO_GRID_CELLS = 648
export let MACRO_GRID_COLS = 36
export let MACRO_GRID_ROWS = 18
export let SHARD_BIN_MAGIC = 'STADSHD1'
export let SINGLE_HIST_YEAR_NONE = -32768

export interface BinaryBuildManifest {
  bugged_sig: string
  capitals_sig: string
  compiled_at: string
  metadata_sig: string
  shards: Record<string, { detail_file: string; idx_file: string; mtime_ms: number; size: number }>
  thin_rel_tol?: number
  total_entries: number
  version: number
}

export interface BinarySectionEntry {
  byte_length: number
  byte_offset: number
  name: string
}

export interface ThinnedTimeSeries {
  vals: number[]
  years: number[]
}

export interface BinaryDatasetStore {
  build_time_ms: number
  cap_city_len: Uint16Array
  cap_city_off: Uint32Array
  cap_date_buf: Buffer
  cap_date_off: Uint32Array
  cap_state_id: Int32Array
  cap_year_frac: Float32Array
  capital_city_indices: Uint32Array
  cell_city_indices: Uint32Array
  count: number
  counterpart_idx: Int32Array
  country_buf: Buffer
  country_offsets: Uint32Array
  dataset_dir: string
  detail_len: Uint32Array
  detail_offset: Float64Array
  era_band_max_pop: Float32Array
  era_band_offs: Uint32Array
  era_city_indices: Uint32Array
  fine_lens: Uint32Array
  fine_max_pop: Float32Array
  fine_offs: Uint32Array
  flags: Uint8Array
  hash_bucket_heads: Int32Array
  hash_entry_city: Uint32Array
  hash_entry_hashes: Uint32Array
  hash_entry_next: Int32Array
  hash_mask: number
  hist_city_len: Uint16Array
  hist_city_off: Uint32Array
  hist_date_buf: Buffer
  hist_date_off: Uint32Array
  hist_name_buf: Buffer
  hist_name_off: Uint32Array
  hist_year_frac: Float32Array
  id_buf: Buffer
  id_offsets: Uint32Array
  key_buf: Buffer
  key_offsets: Uint32Array
  lat: Float32Array
  lon: Float32Array
  macro_counts: Uint32Array
  macro_max_pop: Float32Array
  max_pop: Float32Array
  max_year: Int16Array
  min_year: Int16Array
  name_buf: Buffer
  name_offsets: Uint32Array
  other_buf: Buffer
  other_offsets: Uint32Array
  pop_len: Uint16Array
  pop_offset: Uint32Array
  pop_vals: Float32Array
  pop_years: Int16Array
  region_idx: Uint16Array
  regions: string[]
  shard_files: string[]
  shard_idx: Uint16Array
  single_hist_year: Int16Array
}

export let FLAG_IS_BUGGED = 1
export let FLAG_IS_GHSL = 2
export let FLAG_HAS_CAPITALS = 4
export let FLAG_HAS_HIST_NAMES = 8
export let FLAG_HAS_COLOUR = 16


/**
 * Computes a fast 32-bit FNV-1a hash for an ASCII/UTF-8 string key.
 *
 * @param {string} arg0_str
 *
 * @returns {number} Unsigned 32-bit integer hash
 */
export function fnv1a32 (arg0_str: string): number {
  //Convert from parameters
  let str = arg0_str

  //Declare local instance variables
  let hash = 2166136261

  //Function body
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  //Return statement
  return hash >>> 0
}


/**
 * Returns the era band index for a historical year, or -1 if modern (> 1950) where global max_pop applies.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
export function getEraBandIndex (arg0_year: number): number {
  //Convert from parameters
  let year = arg0_year

  //Function body
  if (year <= 0)
    return 0
  if (year <= 1000)
    return 1
  if (year <= 1500)
    return 2
  if (year <= 1800)
    return 3
  if (year <= 1950)
    return 4

  //Return statement
  return -1
}


/**
 * Returns the HYDE temporal benchmark step interval at a historical year.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
function getBinaryHydeInterval (arg0_year: number): number {
  //Convert from parameters
  let year = arg0_year

  //Guard clauses
  if (!Number.isFinite(year))
    return 200

  //Function body
  if (year < 0)
    return 1000
  if (year < 1700)
    return 100

  //Return statement
  return 10
}


/**
 * Returns maximum allowed temporal interpolation gap between two anchor years.
 *
 * @param {number} arg0_y0
 * @param {number} arg1_y1
 *
 * @returns {number}
 */
function getBinaryMaxTemporalGap (arg0_y0: number, arg1_y1: number): number {
  //Convert from parameters
  let y0 = arg0_y0
  let y1 = arg1_y1

  //Declare local instance variables
  let i0 = getBinaryHydeInterval(y0)
  let i1 = getBinaryHydeInterval(y1)
  let im = getBinaryHydeInterval((y0 + y1)/2)

  //Return statement
  return Math.max(200, i0, i1, im)
}


/**
 * Encodes a 2-degree spatial grid coordinate pair into a compact signed-safe integer cell key.
 *
 * @param {number} arg0_lat
 * @param {number} arg1_lon
 *
 * @returns {number}
 */
export function getSpatialCellKey2Deg (arg0_lat: number, arg1_lon: number): number {
  //Convert from parameters
  let lat = arg0_lat
  let lon = arg1_lon

  //Declare local instance variables
  let cx = Math.max(0, Math.min(179, Math.floor((lon + 180)/2)))
  let cy = Math.max(0, Math.min(89, Math.floor((lat + 90)/2)))

  //Return statement
  return cy*180 + cx
}


/**
 * Reconstructs a city's capital records lazily from the flat v3 binary capital columns.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_idx
 *
 * @returns {CapitalRecord[] | undefined}
 */
export function getBinaryCityCapitalRecords (
  arg0_store: BinaryDatasetStore,
  arg1_idx: number
): CapitalRecord[] | undefined {
  //Convert from parameters
  let idx = arg1_idx
  let store = arg0_store

  //Declare local instance variables
  let len = store.cap_city_len[idx]

  //Guard clauses
  if (len === 0)
    return undefined

  //Function body
  let off = store.cap_city_off[idx]
  let out: CapitalRecord[] = new Array(len)
  for (let i = 0; i < len; i++) {
    let raw_sid = store.cap_state_id[off + i]
    out[i] = {
      date: readPackedString(store.cap_date_buf, store.cap_date_off, off + i),
      state_id: raw_sid === CAP_STATE_ID_NULL ? null : raw_sid,
      year_frac: store.cap_year_frac[off + i],
    }
  }

  //Return statement
  return out
}


/**
 * Checks whether a city has any capital record referencing a given state ID without allocating objects.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_idx
 * @param {number | string} arg2_state_id
 *
 * @returns {boolean}
 */
export function hasBinaryCityCapitalState (
  arg0_store: BinaryDatasetStore,
  arg1_idx: number,
  arg2_state_id: number | string
): boolean {
  //Convert from parameters
  let idx = arg1_idx
  let state_id_num = Number(arg2_state_id)
  let store = arg0_store

  //Declare local instance variables
  let len = store.cap_city_len[idx]

  //Guard clauses
  if (len === 0 || !Number.isFinite(state_id_num))
    return false

  //Function body
  let off = store.cap_city_off[idx]
  for (let i = 0; i < len; i++) {
    if (store.cap_state_id[off + i] === state_id_num)
      return true
  }

  //Return statement
  return false
}


/**
 * Reconstructs a city's historical name records lazily from the flat v3 binary historical-name columns
 * (including compact single-entry identical-name records stored in `single_hist_year`).
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_idx
 *
 * @returns {HistoricalNameRecord[] | undefined}
 */
export function getBinaryCityHistoricalNames (
  arg0_store: BinaryDatasetStore,
  arg1_idx: number
): HistoricalNameRecord[] | undefined {
  //Convert from parameters
  let idx = arg1_idx
  let store = arg0_store

  //Declare local instance variables
  let len = store.hist_city_len[idx]

  //Function body
  if (len > 0) {
    let off = store.hist_city_off[idx]
    let out: HistoricalNameRecord[] = new Array(len)
    for (let i = 0; i < len; i++) {
      out[i] = {
        date: readPackedString(store.hist_date_buf, store.hist_date_off, off + i),
        name: readPackedString(store.hist_name_buf, store.hist_name_off, off + i),
        year_frac: store.hist_year_frac[off + i],
      }
    }
    //Return statement
    return out
  }

  let single_yr = store.single_hist_year[idx]
  if (single_yr !== SINGLE_HIST_YEAR_NONE) {
    let name_str = readPackedString(store.name_buf, store.name_offsets, idx)
    if (name_str) {
      //Return statement
      return [{
        date: `${single_yr}.1.1`,
        name: name_str,
        year_frac: single_yr,
      }]
    }
  }

  //Return statement
  return undefined
}


/**
 * Resolves a city's active display name at `target_frac` directly from flat v3 binary columns
 * with zero intermediate array or object allocations.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_idx
 * @param {string} arg2_default_name
 * @param {number} arg3_target_frac
 *
 * @returns {string}
 */
export function resolveBinaryCityNameAtFrac (
  arg0_store: BinaryDatasetStore,
  arg1_idx: number,
  arg2_default_name: string,
  arg3_target_frac: number
): string {
  //Convert from parameters
  let default_name = arg2_default_name
  let idx = arg1_idx
  let store = arg0_store
  let target_frac = arg3_target_frac

  //Declare local instance variables
  let len = store.hist_city_len[idx]

  //Guard clauses
  if (len === 0)
    return default_name

  //Function body
  let is_ghsl = (store.flags[idx] & FLAG_IS_GHSL) !== 0
  let off = store.hist_city_off[idx]

  if (!is_ghsl || target_frac < 1975) {
    for (let i = len - 1; i >= 0; i--) {
      if (target_frac >= store.hist_year_frac[off + i])
        return readPackedString(store.hist_name_buf, store.hist_name_off, off + i)
    }
    return readPackedString(store.hist_name_buf, store.hist_name_off, off)
  }

  //Legacy post-1975 bifurcated resolution for ghsl-* entries
  let active_1975_idx = -1
  let first_post_1975_idx = -1
  let latest_post_1975_idx = -1

  for (let i = 0; i < len; i++) {
    let rec_frac = store.hist_year_frac[off + i]
    if (rec_frac < 1975) {
      active_1975_idx = off + i
    } else {
      if (first_post_1975_idx === -1)
        first_post_1975_idx = off + i
      if (rec_frac <= target_frac)
        latest_post_1975_idx = off + i
    }
  }

  if (latest_post_1975_idx !== -1)
    return readPackedString(store.hist_name_buf, store.hist_name_off, latest_post_1975_idx)
  if (first_post_1975_idx !== -1 && active_1975_idx !== -1)
    return readPackedString(store.hist_name_buf, store.hist_name_off, active_1975_idx)

  //Return statement
  return default_name
}


/**
 * Evaluates a city's active capital state ID at `target_frac` directly from flat v3 binary capital columns
 * with zero allocations.
 *
 * @param {BinaryDatasetStore} arg0_store
 * @param {number} arg1_idx
 * @param {number} arg2_target_frac
 * @param {(arg0_state_id: number, arg1_year_frac: number) => boolean} [arg3_validator]
 *
 * @returns {number | null}
 */
export function getActiveBinaryCapitalStateId (
  arg0_store: BinaryDatasetStore,
  arg1_idx: number,
  arg2_target_frac: number,
  arg3_validator?: (arg0_state_id: number, arg1_year_frac: number) => boolean
): number | null {
  //Convert from parameters
  let idx = arg1_idx
  let store = arg0_store
  let target_frac = arg2_target_frac
  let validator = arg3_validator

  //Declare local instance variables
  let len = store.cap_city_len[idx]

  //Guard clauses
  if (len === 0)
    return null

  //Function body
  let off = store.cap_city_off[idx]
  for (let i = len - 1; i >= 0; i--) {
    if (target_frac >= store.cap_year_frac[off + i]) {
      let sid = store.cap_state_id[off + i]
      if (sid === CAP_STATE_ID_NULL || !sid)
        return null
      if (validator && !validator(sid, target_frac))
        return null
      return sid
    }
  }

  //Return statement
  return null
}


/**
 * Reads a packed UTF-8 string slice from a Buffer and Uint32Array offset table.
 *
 * @param {Buffer} arg0_buf
 * @param {Uint32Array} arg1_offsets
 * @param {number} arg2_index
 *
 * @returns {string}
 */
export function readPackedString (
  arg0_buf: Buffer,
  arg1_offsets: Uint32Array,
  arg2_index: number
): string {
  //Convert from parameters
  let buf = arg0_buf
  let index = arg2_index
  let offsets = arg1_offsets

  //Declare local instance variables
  let end = offsets[index + 1]
  let start = offsets[index]

  //Guard clauses
  if (end <= start)
    return ''

  //Return statement
  return buf.toString('utf8', start, end)
}


/**
 * Packs an array of strings into a contiguous UTF-8 Buffer and Uint32Array offset table.
 *
 * @param {string[]} arg0_strings
 *
 * @returns {{ buf: Buffer; offsets: Uint32Array }}
 */
export function packStringArray (arg0_strings: string[]): { buf: Buffer; offsets: Uint32Array } {
  //Convert from parameters
  let strings = arg0_strings

  //Declare local instance variables
  let len = strings.length
  let offsets = new Uint32Array(len + 1)
  let total_bytes = 0

  //Function body
  for (let i = 0; i < len; i++) {
    offsets[i] = total_bytes
    if (strings[i])
      total_bytes += Buffer.byteLength(strings[i], 'utf8')
  }
  offsets[len] = total_bytes

  let buf = Buffer.allocUnsafe(total_bytes)
  for (let i = 0; i < len; i++) {
    let s = strings[i]
    if (s)
      buf.write(s, offsets[i], 'utf8')
  }

  //Return statement
  return { buf, offsets }
}


/**
 * Losslessly removes redundant interior points of flat plateaus (v[i-1] === v[i] === v[i+1])
 * while preserving step boundaries, non-linear segments, and first/last anchors.
 *
 * @param {Record<string, number> | undefined} arg0_series
 * @param {number} [arg1_decimals=-1] - Optional rounding precision (-1 = exact)
 *
 * @returns {ThinnedTimeSeries}
 */
export function thinTimeSeries (
  arg0_series: Record<string, number> | undefined,
  arg1_decimals: number = -1
): ThinnedTimeSeries {
  //Convert from parameters
  let decimals = arg1_decimals
  let series = arg0_series

  //Guard clauses
  if (!series || typeof series !== 'object')
    return { vals: [], years: [] }

  //Declare local instance variables
  let out_vals: number[] = []
  let out_years: number[] = []
  let raw_keys = Object.keys(series)
  let pairs: Array<[number, number]> = []
  let pow10 = decimals >= 0 ? Math.pow(10, decimals) : 1

  //Function body
  for (let i = 0; i < raw_keys.length; i++) {
    let yr = Number(raw_keys[i])
    let val = Number(series[raw_keys[i]])
    if (Number.isFinite(yr) && Number.isFinite(val)) {
      let clean_val = decimals >= 0 ? Math.round(val*pow10)/pow10 : val
      pairs.push([yr, clean_val])
    }
  }

  if (pairs.length === 0)
    return { vals: [], years: [] }

  pairs.sort((arg0_a, arg1_b) => arg0_a[0] - arg1_b[0])

  for (let i = 0; i < pairs.length; i++) {
    let cur_yr = pairs[i][0]
    let cur_val = pairs[i][1]
    if (i > 0 && i < pairs.length - 1) {
      let prev_val = pairs[i - 1][1]
      let next_val = pairs[i + 1][1]
      if (prev_val === cur_val && cur_val === next_val)
        continue
    }
    out_years.push(cur_yr)
    out_vals.push(cur_val)
  }

  //Return statement
  return { vals: out_vals, years: out_years }
}


/**
 * Thins an already sorted `(years, vals)` population series using tolerance-bounded log-linear decimation
 * for the binary hot index while preserving first/last anchors, gap boundaries, zero transitions,
 * and local annual growth-rate fidelity.
 *
 * @param {number[] | Int16Array} arg0_years
 * @param {number[] | Float32Array} arg1_vals
 * @param {number} [arg2_rel_tol=0.0025]
 * @param {number} [arg3_growth_tol=0.004]
 *
 * @returns {ThinnedTimeSeries}
 */
export function thinTimeSeriesLogLinear (
  arg0_years: number[] | Int16Array,
  arg1_vals: number[] | Float32Array,
  arg2_rel_tol: number = 0.0025,
  arg3_growth_tol: number = 0.004
): ThinnedTimeSeries {
  //Convert from parameters
  let growth_tol = arg3_growth_tol
  let rel_tol = arg2_rel_tol
  let vals = arg1_vals
  let years = arg0_years

  //Declare local instance variables
  let len = years.length

  //Guard clauses
  if (len <= 2 || rel_tol <= 0) {
    let copy_years: number[] = new Array(len)
    let copy_vals: number[] = new Array(len)
    for (let i = 0; i < len; i++) {
      copy_years[i] = years[i]
      copy_vals[i] = vals[i]
    }
    return { vals: copy_vals, years: copy_years }
  }

  //Function body
  let out_years: number[] = [years[0]]
  let out_vals: number[] = [vals[0]]
  let anchor_idx = 0

  for (let i = 1; i < len - 1; i++) {
    let y0 = years[anchor_idx]
    let p0 = vals[anchor_idx]
    let y2 = years[i + 1]
    let p2 = vals[i + 1]
    let span = y2 - y0
    let max_gap = getBinaryMaxTemporalGap(y0, y2)
    let can_skip = span > 0 && span <= max_gap && p0 >= 0.01 && p2 >= 0.01

    if (can_skip) {
      let lp0 = Math.log10(p0)
      let lp2 = Math.log10(p2)
      let seg_rate = Math.pow(p2/p0, 1/span) - 1

      for (let x = anchor_idx + 1; x <= i; x++) {
        let yx = years[x]
        let px = vals[x]
        if (px < 0.01) {
          can_skip = false
          break
        }
        let pred = Math.pow(10, lp0 + ((yx - y0)/span)*(lp2 - lp0))
        if (Math.abs(pred - px) > Math.max(1, px*rel_tol)) {
          can_skip = false
          break
        }
        //Preserve growth-rate inflections so growth colour mode stays faithful
        if (x > anchor_idx) {
          let prev_y = years[x - 1]
          let prev_p = vals[x - 1]
          let dt = yx - prev_y
          if (dt > 0 && prev_p >= 0.01) {
            let local_rate = Math.pow(px/prev_p, 1/dt) - 1
            if (Math.abs(local_rate - seg_rate) > growth_tol) {
              can_skip = false
              break
            }
          }
        }
      }
    }

    if (!can_skip) {
      out_years.push(years[i])
      out_vals.push(vals[i])
      anchor_idx = i
    }
  }

  out_years.push(years[len - 1])
  out_vals.push(vals[len - 1])

  //Return statement
  return { vals: out_vals, years: out_years }
}


/**
 * Writes a sectioned binary file safely in chunks without exceeding single-Buffer allocation limits.
 *
 * @param {string} arg0_file_path
 * @param {string} arg1_magic
 * @param {Record<string, any>} arg2_meta
 * @param {Array<{ data: Buffer | ArrayBufferView; name: string }>} arg3_sections
 *
 * @returns {void}
 */
export function writeSectionedBinaryFile (
  arg0_file_path: string,
  arg1_magic: string,
  arg2_meta: Record<string, any>,
  arg3_sections: Array<{ data: Buffer | ArrayBufferView; name: string }>
): void {
  //Convert from parameters
  let file_path = arg0_file_path
  let magic = arg1_magic
  let meta = arg2_meta
  let sections = arg3_sections

  //Declare local instance variables
  let dir = path.dirname(file_path)
  let fd: number
  let header_bytes: Buffer
  let header_json: string
  let len_buf = Buffer.allocUnsafe(12)
  let section_entries: BinarySectionEntry[] = []
  let running_offset = 0

  //Function body
  if (!fs.existsSync(dir))
    fs.mkdirSync(dir, { recursive: true })

  for (let i = 0; i < sections.length; i++) {
    let sec = sections[i]
    section_entries.push({
      byte_length: sec.data.byteLength,
      byte_offset: running_offset,
      name: sec.name,
    })
    running_offset += sec.data.byteLength
  }

  header_json = JSON.stringify({
    meta,
    sections: section_entries,
    version: BINARY_FORMAT_VERSION,
  })
  header_bytes = Buffer.from(header_json, 'utf8')

  len_buf.write(magic.slice(0, 8), 0, 8, 'ascii')
  len_buf.writeUInt32LE(header_bytes.byteLength, 8)

  let tmp_path = `${file_path}.tmp.${process.pid}.${Date.now()}`
  fd = fs.openSync(tmp_path, 'w')
  try {
    fs.writeSync(fd, len_buf)
    fs.writeSync(fd, header_bytes)

    let write_chunk_size = 16*1024*1024
    for (let i = 0; i < sections.length; i++) {
      let data_buf = Buffer.isBuffer(sections[i].data)
        ? sections[i].data
        : Buffer.from(sections[i].data.buffer, sections[i].data.byteOffset, sections[i].data.byteLength)
      let pos = 0
      for (let z = 0; pos < data_buf.byteLength; z++) {
        let end = Math.min(data_buf.byteLength, pos + write_chunk_size)
        fs.writeSync(fd, data_buf as unknown as Uint8Array, pos, end - pos)
        pos = end
      }
    }
  } finally {
    fs.closeSync(fd)
  }

  fs.renameSync(tmp_path, file_path)
}


/**
 * Reads a sectioned binary file header and loads requested sections synchronously into separate Buffers
 * so multi-GB files never hit single-Buffer allocation caps.
 *
 * @param {string} arg0_file_path
 * @param {string} arg1_expected_magic
 *
 * @returns {{ meta: Record<string, any>; sections: Map<string, Buffer>; version: number }}
 */
export function readSectionedBinaryFile (
  arg0_file_path: string,
  arg1_expected_magic: string
): { meta: Record<string, any>; sections: Map<string, Buffer>; version: number } {
  //Convert from parameters
  let expected_magic = arg1_expected_magic
  let file_path = arg0_file_path

  //Declare local instance variables
  let data_base_offset: number
  let fd = fs.openSync(file_path, 'r')
  let header_len: number
  let header_obj: { meta: Record<string, any>; sections: BinarySectionEntry[]; version: number }
  let prefix_buf = Buffer.allocUnsafe(12)
  let sections_map = new Map<string, Buffer>()

  //Function body
  try {
    let bytes = fs.readSync(fd, prefix_buf, 0, 12, 0)
    if (bytes < 12)
      throw new Error(`Truncated binary header in ${file_path}`)

    let magic = prefix_buf.toString('ascii', 0, 8)
    if (magic !== expected_magic)
      throw new Error(`Invalid magic header '${magic}' in ${file_path}`)

    header_len = prefix_buf.readUInt32LE(8)
    let header_buf = Buffer.allocUnsafe(header_len)
    fs.readSync(fd, header_buf, 0, header_len, 12)
    header_obj = JSON.parse(header_buf.toString('utf8'))
    data_base_offset = 12 + header_len

    for (let i = 0; i < header_obj.sections.length; i++) {
      let sec = header_obj.sections[i]
      let sec_buf = Buffer.allocUnsafe(sec.byte_length)
      let read_pos = 0
      let chunk_size = 16*1024*1024
      for (let z = 0; read_pos < sec.byte_length; z++) {
        let to_read = Math.min(chunk_size, sec.byte_length - read_pos)
        let n_read = fs.readSync(fd, sec_buf, read_pos, to_read, data_base_offset + sec.byte_offset + read_pos)
        if (n_read <= 0)
          break
        read_pos += n_read
      }
      sections_map.set(sec.name, sec_buf)
    }
  } finally {
    fs.closeSync(fd)
  }

  //Return statement
  return {
    meta: header_obj.meta || {},
    sections: sections_map,
    version: Number(header_obj.version || 0),
  }
}


/**
 * Asynchronously reads a sectioned binary file header and loads sections without blocking the Node.js event loop.
 *
 * @param {string} arg0_file_path
 * @param {string} arg1_expected_magic
 *
 * @returns {Promise<{ meta: Record<string, any>; sections: Map<string, Buffer>; version: number }>}
 */
export async function readSectionedBinaryFileAsync (
  arg0_file_path: string,
  arg1_expected_magic: string
): Promise<{ meta: Record<string, any>; sections: Map<string, Buffer>; version: number }> {
  //Convert from parameters
  let expected_magic = arg1_expected_magic
  let file_path = arg0_file_path

  //Declare local instance variables
  let data_base_offset: number
  let fh = await fs.promises.open(file_path, 'r')
  let header_len: number
  let header_obj: { meta: Record<string, any>; sections: BinarySectionEntry[]; version: number }
  let prefix_buf = Buffer.allocUnsafe(12)
  let sections_map = new Map<string, Buffer>()

  //Function body
  try {
    let prefix_res = await fh.read(prefix_buf, 0, 12, 0)
    if (prefix_res.bytesRead < 12)
      throw new Error(`Truncated binary header in ${file_path}`)

    let magic = prefix_buf.toString('ascii', 0, 8)
    if (magic !== expected_magic)
      throw new Error(`Invalid magic header '${magic}' in ${file_path}`)

    header_len = prefix_buf.readUInt32LE(8)
    let header_buf = Buffer.allocUnsafe(header_len)
    await fh.read(header_buf, 0, header_len, 12)
    header_obj = JSON.parse(header_buf.toString('utf8'))
    data_base_offset = 12 + header_len

    let chunk_size = 16*1024*1024
    for (let i = 0; i < header_obj.sections.length; i++) {
      let sec = header_obj.sections[i]
      let sec_buf = Buffer.allocUnsafe(sec.byte_length)
      let read_pos = 0
      for (let z = 0; read_pos < sec.byte_length; z++) {
        let to_read = Math.min(chunk_size, sec.byte_length - read_pos)
        let read_res = await fh.read(sec_buf, read_pos, to_read, data_base_offset + sec.byte_offset + read_pos)
        if (read_res.bytesRead <= 0)
          break
        read_pos += read_res.bytesRead
      }
      sections_map.set(sec.name, sec_buf)
    }
  } finally {
    await fh.close()
  }

  //Return statement
  return {
    meta: header_obj.meta || {},
    sections: sections_map,
    version: Number(header_obj.version || 0),
  }
}


/**
 * Creates a TypedArray view over an aligned Buffer copy.
 * Guarantees 8-byte alignment for Float64Array / Int32Array / Uint32Array / Float32Array.
 *
 * @param {Buffer} arg0_buf
 * @param {new (arg0_ab: ArrayBuffer, arg1_offset: number, arg2_len: number) => T} arg1_Ctor
 * @param {number} arg2_bytes_per_elem
 *
 * @returns {T}
 */
export function toTypedArray<T extends ArrayBufferView> (
  arg0_buf: Buffer,
  arg1_Ctor: new (arg0_ab: ArrayBuffer, arg1_offset: number, arg2_len: number) => T,
  arg2_bytes_per_elem: number
): T {
  //Convert from parameters
  let Ctor = arg1_Ctor
  let buf = arg0_buf
  let bytes_per_elem = arg2_bytes_per_elem

  //Declare local instance variables
  let elem_count = Math.floor(buf.byteLength/bytes_per_elem)

  //Function body
  if (buf.byteOffset % bytes_per_elem === 0) {
    //Return statement
    return new Ctor(buf.buffer as ArrayBuffer, buf.byteOffset, elem_count)
  }

  let aligned_ab = new ArrayBuffer(elem_count*bytes_per_elem)
  new Uint8Array(aligned_ab).set(buf.subarray(0, elem_count*bytes_per_elem))

  //Return statement
  return new Ctor(aligned_ab, 0, elem_count)
}


/**
 * Reads a single city's JSON detail record from a shard `.detail.pack` file via O(1) pread.
 *
 * @param {string} arg0_pack_path
 * @param {number} arg1_offset
 * @param {number} arg2_length
 *
 * @returns {any | null}
 */
export function readDetailPackRecord (
  arg0_pack_path: string,
  arg1_offset: number,
  arg2_length: number
): any | null {
  //Convert from parameters
  let length = arg2_length
  let offset = arg1_offset
  let pack_path = arg0_pack_path

  //Guard clauses
  if (!pack_path || length <= 0 || !fs.existsSync(pack_path))
    return null

  //Declare local instance variables
  let buf = Buffer.allocUnsafe(length)
  let fd = fs.openSync(pack_path, 'r')

  //Function body
  try {
    let n_read = fs.readSync(fd, buf, 0, length, offset)
    if (n_read < length)
      return null
    //Return statement
    return JSON.parse(buf.toString('utf8'))
  } catch {
    //Return statement
    return null
  } finally {
    fs.closeSync(fd)
  }
}
