/**
 * BMP caching and native raster reader integration for high-performance demographics and sector models.
 */

import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { decode as decodePng } from 'fast-png'
import { getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import { FilepathDefines } from './filepath_defines.ts'
import type { ScanlineSpan } from './raster_scanline.ts'

export let AGE_COHORTS = [
  '00', '01', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80'
]

export let SECTOR_KEYS = [
  'agriculture', 'informal_labour', 'manufacturing', 'services', 'not_in_work'
]

let initial_defines = FilepathDefines.get()

export let BAKED_DEMOGRAPHICS_PATH = initial_defines.filepaths.baked_demographics
export let BAKED_SECTORS_PATH = initial_defines.filepaths.baked_sectors
export let BMP_CACHE_DIR = initial_defines.root_folders.l_raster_cache
export let COHORTS_DIR = initial_defines.root_folders.age_sex
export let NATIVE_READER_BIN = initial_defines.filepaths.native_raster_reader
export let NATURAL_EARTH_PATH = initial_defines.filepaths.natural_earth
export let PROFESSIONS_DIR = initial_defines.root_folders.prof_tot

if (!fs.existsSync(BMP_CACHE_DIR))
  fs.mkdirSync(BMP_CACHE_DIR, { recursive: true })

export let RASTER_HEIGHT = 1080
export let RASTER_WIDTH = 1920

/**
 * Returns the currently active raster dimensions configured in optimisation.json5.
 *
 * @returns {{ height: number; width: number }}
 */
export function getRasterDimensions (): { height: number; width: number } {
  //Declare local instance variables
  let opt = getOptimisationConfig()

  //Return statement
  return { height: opt.height, width: opt.width }
}

/**
 * Downsamples a 2D Float32Array raster using conservative sum aggregation,
 * ensuring the global sum of the output raster precisely equals the sum of the source raster.
 *
 * @param {Float32Array} arg0_src_data
 * @param {number} arg1_src_w
 * @param {number} arg2_src_h
 * @param {number} arg3_dst_w
 * @param {number} arg4_dst_h
 *
 * @returns {Float32Array}
 */
export function downsampleRasterSum (
  arg0_src_data: Float32Array,
  arg1_src_w: number,
  arg2_src_h: number,
  arg3_dst_w: number,
  arg4_dst_h: number
): Float32Array {
  //Convert from parameters
  let dst_h = arg4_dst_h
  let dst_w = arg3_dst_w
  let src_data = arg0_src_data
  let src_h = arg2_src_h
  let src_w = arg1_src_w

  //Guard clauses
  if (dst_w === src_w && dst_h === src_h)
    return src_data

  //Declare local instance variables
  let dst_data = new Float32Array(dst_w*dst_h)
  let x_scale = dst_w/src_w
  let y_scale = dst_h/src_h

  //Function body
  for (let sy = 0; sy < src_h; sy++) {
    let dy = Math.min(dst_h - 1, Math.floor(sy*y_scale))
    let dst_row_offset = dy*dst_w
    let src_row_offset = sy*src_w

    for (let sx = 0; sx < src_w; sx++) {
      let v = src_data[src_row_offset + sx]
      if (v > 0 && v < 1e12) {
        let dx = Math.min(dst_w - 1, Math.floor(sx*x_scale))
        dst_data[dst_row_offset + dx] += v
      }
    }
  }

  //Return statement
  return dst_data
}

/**
 * Ensures that all 36 demographic cohort rasters for a keyframe year exist in BMP cache and are up-to-date.
 *
 * @param {number} arg0_year
 */
export function ensureDemographicBmpCache (arg0_year: number): void {
  //Convert from parameters
  let year = arg0_year

  //Function body
  for (let i = 0; i < AGE_COHORTS.length; i++) {
    let cid = AGE_COHORTS[i]
    let f_bmp = path.join(BMP_CACHE_DIR, `f_${cid}_${year}.bmp`)
    let f_png = path.join(COHORTS_DIR, `f_${cid}_${year}.png`)
    let m_bmp = path.join(BMP_CACHE_DIR, `m_${cid}_${year}.bmp`)
    let m_png = path.join(COHORTS_DIR, `m_${cid}_${year}.png`)

    if (isFileCacheStale(f_png, f_bmp))
      loadGeoPngAsFloat32(f_png)
    if (isFileCacheStale(m_png, m_bmp))
      loadGeoPngAsFloat32(m_png)
  }
}

/**
 * Ensures that all 5 sector rasters for a keyframe year exist in BMP cache and are up-to-date.
 *
 * @param {number} arg0_year
 */
export function ensureSectorBmpCache (arg0_year: number): void {
  //Convert from parameters
  let year = arg0_year

  //Function body
  for (let i = 0; i < SECTOR_KEYS.length; i++) {
    let s = SECTOR_KEYS[i]
    let s_bmp = path.join(BMP_CACHE_DIR, `${s}_t_${year}.bmp`)
    let s_png = path.join(PROFESSIONS_DIR, `${s}_t_${year}.png`)

    if (isFileCacheStale(s_png, s_bmp))
      loadGeoPngAsFloat32(s_png)
  }
}

/**
 * Checks whether a cache file is missing or older than its source counterpart or optimisation config.
 *
 * @param {string} arg0_source_path
 * @param {string} arg1_cache_path
 *
 * @returns {boolean}
 */
export function isFileCacheStale (arg0_source_path: string, arg1_cache_path: string): boolean {
  //Convert from parameters
  let cache_path = arg1_cache_path
  let source_path = arg0_source_path

  //Guard clauses
  if (!fs.existsSync(cache_path))
    return true
  if (!fs.existsSync(source_path))
    return false

  //Declare local instance variables
  let cache_stat: fs.Stats
  let fd: number
  let hdr: Buffer
  let opt_info = getOptimisationConfig()
  let source_stat: fs.Stats

  //Function body
  try {
    cache_stat = fs.statSync(cache_path)
    source_stat = fs.statSync(source_path)

    //1. Check source modification timestamp
    if (source_stat.mtimeMs > cache_stat.mtimeMs)
      return true

    //2. Check optimisation.json5 modification timestamp
    if (opt_info.mtimeMs > cache_stat.mtimeMs)
      return true

    //3. Check cached BMP dimensions against configured resolution
    hdr = Buffer.alloc(26)
    fd = fs.openSync(cache_path, 'r')
    fs.readSync(fd, hdr, 0, 26, 0)
    fs.closeSync(fd)

    if (hdr.readUInt16LE(0) === 0x4D42) {
      let bmp_w = hdr.readInt32LE(18)
      let bmp_h = Math.abs(hdr.readInt32LE(22))
      if (bmp_w !== opt_info.width || bmp_h !== opt_info.height)
        return true
    }

    //Return statement
    return false
  } catch {
    //Return statement
    return true
  }
}

/**
 * Reads a big-endian float32 GeoPNG from disk and converts it to a native Float32Array, caching as 32-bit BMP.
 * Downsamples to target resolution using sum/area aggregation to preserve global totals.
 *
 * @param {string} arg0_filepath
 *
 * @returns {Float32Array | null}
 */
export function loadGeoPngAsFloat32 (arg0_filepath: string): Float32Array | null {
  //Convert from parameters
  let filepath = arg0_filepath

  //Guard clauses
  if (!filepath)
    return null

  //Declare local instance variables
  let base_name = path.basename(filepath, path.extname(filepath))
  let bmp_path = path.join(BMP_CACHE_DIR, `${base_name}.bmp`)
  let buf: Buffer
  let cached_bmp: Float32Array | null
  let final_f32: Float32Array
  let img: any
  let is_stale: boolean
  let opt_info = getOptimisationConfig()
  let out_buf: ArrayBuffer
  let out_f32: Float32Array
  let out_u32: Uint32Array
  let src_u32: Uint32Array

  //Check BMP cache first if fresh
  is_stale = isFileCacheStale(filepath, bmp_path)
  if (!is_stale) {
    cached_bmp = readFloat32FromBmp(bmp_path, opt_info.width, opt_info.height)
    if (cached_bmp)
      return cached_bmp
  }

  //Guard clause: check if source GeoPNG exists
  if (!fs.existsSync(filepath))
    return null

  //Function body
  try {
    buf = fs.readFileSync(filepath)
    img = decodePng(buf)
    src_u32 = new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.byteLength/4)
    out_buf = new ArrayBuffer(src_u32.length*4)
    out_u32 = new Uint32Array(out_buf)
    out_f32 = new Float32Array(out_buf)

    for (let i = 0; i < src_u32.length; i++) {
      let raw = src_u32[i]
      out_u32[i] = ((raw & 0xff) << 24) | ((raw & 0xff00) << 8) | ((raw >>> 8) & 0xff00) | (raw >>> 24)
    }

    //Downsample with conservative sum aggregation
    final_f32 = downsampleRasterSum(out_f32, img.width, img.height, opt_info.width, opt_info.height)

    //Write to BMP cache so all subsequent lookups are instantaneous
    writeFloat32AsBmp(bmp_path, final_f32, opt_info.width, opt_info.height)

    //Return statement
    return final_f32
  } catch (arg0_err) {
    console.error(`[RasterBmpCache] Error decoding ${filepath}:`, arg0_err)
    return null
  }
}

/**
 * Reads a 32-bit Float32Array raster from an uncompressed .bmp cache file.
 * Returns null if file is missing, corrupt, or dimensions do not match.
 *
 * @param {string} arg0_filepath
 * @param {number} [arg1_w]
 * @param {number} [arg2_h]
 *
 * @returns {Float32Array | null}
 */
export function readFloat32FromBmp (
  arg0_filepath: string,
  arg1_w?: number,
  arg2_h?: number
): Float32Array | null {
  //Convert from parameters
  let filepath = arg0_filepath
  let opt_info = getOptimisationConfig()
  let h = arg2_h !== undefined ? arg2_h : opt_info.height
  let w = arg1_w !== undefined ? arg1_w : opt_info.width

  //Guard clauses
  if (!fs.existsSync(filepath))
    return null

  //Declare local instance variables
  let bmp_h: number
  let bmp_w: number
  let buf: Buffer
  let off: number

  //Function body
  try {
    buf = fs.readFileSync(filepath)
    if (buf.length < 64 || buf.readUInt16LE(0) !== 0x4D42)
      return null

    bmp_w = buf.readInt32LE(18)
    bmp_h = Math.abs(buf.readInt32LE(22))
    if (bmp_w !== w || bmp_h !== h)
      return null

    off = buf.readUInt32LE(10)
    if (off%4 !== 0 || buf.length < off + w*h*4)
      return null

    //Return statement
    return new Float32Array(buf.buffer, buf.byteOffset + off, w*h)
  } catch (arg0_err) {
    console.error(`[RasterBmpCache] Error reading BMP cache ${filepath}:`, arg0_err)
    return null
  }
}


/**
 * Refreshes raster cache, dataset, and binary paths from common/layers/filepath_defines.json5.
 *
 * @param {string} [arg0_config_dir]
 *
 * @returns {void}
 */
export function refreshRasterBmpPaths (arg0_config_dir?: string): void {
  //Convert from parameters
  let config_dir = arg0_config_dir

  //Declare local instance variables
  let defines = FilepathDefines.get(config_dir)

  //Function body
  BAKED_DEMOGRAPHICS_PATH = defines.filepaths.baked_demographics
  BAKED_SECTORS_PATH = defines.filepaths.baked_sectors
  BMP_CACHE_DIR = defines.root_folders.l_raster_cache
  COHORTS_DIR = defines.root_folders.age_sex
  NATIVE_READER_BIN = defines.filepaths.native_raster_reader
  NATURAL_EARTH_PATH = defines.filepaths.natural_earth
  PROFESSIONS_DIR = defines.root_folders.prof_tot
}

/**
 * Executes native C multi-threaded raster reader to process 32-bit BMP rasters in parallel.
 *
 * @param {object} arg0_options
 * @param {string} [arg0_options.country="Global"]
 * @param {boolean} [arg0_options.isGlobal=false]
 * @param {"demographics" | "sectors"} arg0_options.mode
 * @param {ScanlineSpan[]} [arg0_options.spans=[]]
 * @param {number} arg0_options.year
 *
 * @returns {any | null}
 */
export function runNativeRasterReader (arg0_options: {
  country?: string
  isGlobal?: boolean
  mode: 'demographics' | 'sectors'
  spans?: ScanlineSpan[]
  year: number
}): any | null {
  //Convert from parameters
  let country = arg0_options.country || 'Global'
  let is_global = arg0_options.isGlobal || false
  let mode = arg0_options.mode
  let spans = arg0_options.spans || []
  let year = arg0_options.year

  //Guard clauses
  if (!fs.existsSync(NATIVE_READER_BIN))
    return null

  //Declare local instance variables
  let args: string[]
  let buf: Buffer | undefined
  let parsed: any
  let proc_res: any

  //Function body
  args = [
    '--mode', mode,
    '--year', String(year),
    '--country', country,
    '--cache-dir', BMP_CACHE_DIR,
  ]
  if (is_global || spans.length === 0)
    args.push('--global')

  if (!is_global && spans.length > 0) {
    buf = Buffer.alloc(4 + 4 + spans.length*12)
    buf.write('BINS', 0, 4, 'ascii')
    buf.writeUInt32LE(spans.length, 4)
    for (let i = 0; i < spans.length; i++) {
      buf.writeInt32LE(spans[i].row, 8 + i*12)
      buf.writeInt32LE(spans[i].c_start, 12 + i*12)
      buf.writeInt32LE(spans[i].c_end, 16 + i*12)
    }
  }

  try {
    proc_res = spawnSync(NATIVE_READER_BIN, args, {
      encoding: 'utf8',
      input: buf,
      maxBuffer: 10*1024*1024,
      windowsHide: true,
    })

    if (proc_res.status === 0 && proc_res.stdout) {
      parsed = JSON.parse(proc_res.stdout)
      return parsed
    }
  } catch (arg0_err) {
    console.warn('[RasterBmpCache] Native C reader failed, falling back to JS:', arg0_err)
  }

  //Return statement
  return null
}

/**
 * Writes a Float32Array raster to disk as an uncompressed 32-bit .bmp file with 64-byte aligned header.
 *
 * @param {string} arg0_filepath
 * @param {Float32Array} arg1_data
 * @param {number} [arg2_w=RASTER_WIDTH]
 * @param {number} [arg3_h=RASTER_HEIGHT]
 *
 * @returns {boolean}
 */
export function writeFloat32AsBmp (
  arg0_filepath: string,
  arg1_data: Float32Array,
  arg2_w?: number,
  arg3_h?: number
): boolean {
  //Convert from parameters
  let data = arg1_data
  let filepath = arg0_filepath
  let opt_info = getOptimisationConfig()
  let h = arg3_h !== undefined ? arg3_h : opt_info.height
  let w = arg2_w !== undefined ? arg2_w : opt_info.width

  //Declare local instance variables
  let fd: number
  let hdr = Buffer.alloc(64)
  let img_bytes = w*h*4
  let pixel_buf: Buffer
  let total_bytes = 64 + img_bytes

  //Function body
  try {
    hdr.writeUInt16LE(0x4D42, 0)
    hdr.writeUInt32LE(total_bytes, 2)
    hdr.writeUInt32LE(0, 6)
    hdr.writeUInt32LE(64, 10)
    hdr.writeUInt32LE(40, 14)
    hdr.writeInt32LE(w, 18)
    hdr.writeInt32LE(-h, 22)
    hdr.writeUInt16LE(1, 26)
    hdr.writeUInt16LE(32, 28)
    hdr.writeUInt32LE(0, 30)
    hdr.writeUInt32LE(img_bytes, 34)
    hdr.writeInt32LE(2835, 38)
    hdr.writeInt32LE(2835, 42)
    hdr.writeUInt32LE(0, 46)
    hdr.writeUInt32LE(0, 50)

    pixel_buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    fd = fs.openSync(filepath, 'w')
    fs.writeSync(fd, hdr, 0, 64)
    fs.writeSync(fd, pixel_buf, 0, pixel_buf.length)
    fs.closeSync(fd)

    //Return statement
    return true
  } catch (arg0_err) {
    console.error(`[RasterBmpCache] Error writing BMP cache ${filepath}:`, arg0_err)
    return false
  }
}
