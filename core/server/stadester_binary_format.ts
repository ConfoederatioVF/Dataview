import fs from 'fs'
import path from 'path'

export let BINARY_FORMAT_VERSION = 1
export let BINARY_MAGIC = 'STADBIN1'
export let SHARD_BIN_MAGIC = 'STADSHD1'

export interface BinaryBuildManifest {
  bugged_sig: string
  capitals_sig: string
  compiled_at: string
  metadata_sig: string
  shards: Record<string, { detail_file: string; idx_file: string; mtime_ms: number; size: number }>
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
  cap_records_by_idx: Map<number, Array<{ date: string; state_id: number | string | null; year_frac: number }>>
  capital_city_indices: Uint32Array
  cell_city_indices: Uint32Array
  cell_map: Map<number, { length: number; offset: number }>
  count: number
  counterpart_idx: Int32Array
  country_buf: Buffer
  country_offsets: Uint32Array
  dataset_dir: string
  detail_len: Uint32Array
  detail_offset: Float64Array
  flags: Uint8Array
  hash_bucket_heads: Int32Array
  hash_entry_city: Uint32Array
  hash_entry_hashes: Uint32Array
  hash_entry_next: Int32Array
  hash_mask: number
  hist_names_by_idx: Map<number, Array<{ date: string; name: string; year_frac: number }>>
  id_buf: Buffer
  id_offsets: Uint32Array
  key_buf: Buffer
  key_offsets: Uint32Array
  lat: Float32Array
  lon: Float32Array
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
 * Writes a sectioned binary file safely in chunks without exceeding single-Buffer allocation limits.
 *
 * @param {string} arg0_file_path
 * @param {string} arg1_magic
 * @param {Record<string, any>} arg2_meta
 * @param {Array<{ data: Buffer | Uint8Array; name: string }>} arg3_sections
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

  let tmp_path = `${file_path}.tmp.${process.pid}`
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
 * Reads a sectioned binary file header and loads requested sections into separate Buffers
 * so multi-GB files never hit single-Buffer allocation caps.
 *
 * @param {string} arg0_file_path
 * @param {string} arg1_expected_magic
 *
 * @returns {{ meta: Record<string, any>; sections: Map<string, Buffer> }}
 */
export function readSectionedBinaryFile (
  arg0_file_path: string,
  arg1_expected_magic: string
): { meta: Record<string, any>; sections: Map<string, Buffer> } {
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
  }
}


/**
 * Creates a TypedArray view over an aligned Buffer copy.
 * Guarantees 8-byte alignment for Float64Array / Int32Array / Uint32Array / Float32Array.
 *
 * @param {Buffer} arg0_buf
 * @param {new (arg0_ab: ArrayBuffer, arg1_offset: number, arg2_len: number) => T} arg1_Ctor
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
