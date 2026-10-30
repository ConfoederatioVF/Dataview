import fs from 'fs'
import path from 'path'
import { spawnSync } from 'child_process'
import { decode as decodePng } from 'fast-png'
import {
  AGE_COHORTS,
  BAKED_DEMOGRAPHICS_PATH,
  BAKED_SECTORS_PATH,
  BMP_CACHE_DIR,
  COHORTS_DIR,
  NATIVE_READER_BIN,
  PROFESSIONS_DIR,
  SECTOR_KEYS,
} from '../core/server/raster_bmp_cache.ts'

let DEFAULT_KEY_YEARS = [
  -10000, -5000, -3000, -1000, 0, 500, 1000, 1500, 1600, 1700, 1750, 1800,
  1820, 1850, 1870, 1900, 1910, 1920, 1930, 1940, 1950, 1960, 1970, 1980,
  1990, 2000, 2010, 2020, 2025
]

/**
 * Converts a float32 GeoPNG into a 32-bit BMP cache file.
 *
 * @param {string} arg0_png_path
 * @param {string} arg1_bmp_path
 *
 * @returns {boolean}
 */
function convertPngToBmp (arg0_png_path: string, arg1_bmp_path: string): boolean {
  //Convert from parameters
  let bmp_path = arg1_bmp_path
  let png_path = arg0_png_path

  //Guard clauses
  if (!fs.existsSync(png_path))
    return false
  if (fs.existsSync(bmp_path)) {
    try {
      let bmp_st = fs.statSync(bmp_path)
      let png_st = fs.statSync(png_path)
      if (png_st.mtimeMs <= bmp_st.mtimeMs)
        return true
    } catch {}
  }

  //Declare local instance variables
  let buf: Buffer
  let fd: number
  let hdr = Buffer.alloc(64)
  let img: any
  let out_buf: ArrayBuffer
  let out_u32: Uint32Array
  let src_u32: Uint32Array

  //Function body
  try {
    buf = fs.readFileSync(png_path)
    img = decodePng(buf)
    src_u32 = new Uint32Array(img.data.buffer, img.data.byteOffset, img.data.byteLength/4)
    out_buf = new ArrayBuffer(src_u32.length*4)
    out_u32 = new Uint32Array(out_buf)

    for (let i = 0; i < src_u32.length; i++) {
      let raw = src_u32[i]
      out_u32[i] = ((raw & 0xff) << 24) | ((raw & 0xff00) << 8) | ((raw >>> 8) & 0xff00) | (raw >>> 24)
    }

    hdr.writeUInt16LE(0x4D42, 0)
    hdr.writeUInt32LE(64 + 4320*2160*4, 2)
    hdr.writeUInt32LE(64, 10)
    hdr.writeUInt32LE(40, 14)
    hdr.writeInt32LE(4320, 18)
    hdr.writeInt32LE(-2160, 22)
    hdr.writeUInt16LE(1, 26)
    hdr.writeUInt16LE(32, 28)
    hdr.writeUInt32LE(4320*2160*4, 34)

    fd = fs.openSync(bmp_path, 'w')
    fs.writeSync(fd, hdr, 0, 64)
    fs.writeSync(fd, Buffer.from(out_buf), 0, out_buf.byteLength)
    fs.closeSync(fd)

    //Return statement
    return true
  } catch (arg0_err) {
    console.error(`[Bake] Error converting ${png_path}:`, arg0_err)
    return false
  }
}

/**
 * Returns the latest modification timestamp (mtimeMs) among all 36 source demographic GeoPNGs for a year.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
function getDemographicSourceMaxMtime (arg0_year: number): number {
  //Convert from parameters
  let year = arg0_year

  //Declare local instance variables
  let max_mtime = 0

  //Function body
  for (let i = 0; i < AGE_COHORTS.length; i++) {
    let cid = AGE_COHORTS[i]
    let f_path = path.join(COHORTS_DIR, `f_${cid}_${year}.png`)
    let m_path = path.join(COHORTS_DIR, `m_${cid}_${year}.png`)

    if (fs.existsSync(f_path)) {
      try {
        let st = fs.statSync(f_path)
        if (st.mtimeMs > max_mtime)
          max_mtime = st.mtimeMs
      } catch {}
    }
    if (fs.existsSync(m_path)) {
      try {
        let st = fs.statSync(m_path)
        if (st.mtimeMs > max_mtime)
          max_mtime = st.mtimeMs
      } catch {}
    }
  }

  //Return statement
  return max_mtime
}

/**
 * Returns the latest modification timestamp (mtimeMs) among all 5 source profession GeoPNGs for a year.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
function getSectorSourceMaxMtime (arg0_year: number): number {
  //Convert from parameters
  let year = arg0_year

  //Declare local instance variables
  let max_mtime = 0

  //Function body
  for (let i = 0; i < SECTOR_KEYS.length; i++) {
    let s = SECTOR_KEYS[i]
    let s_path = path.join(PROFESSIONS_DIR, `${s}_t_${year}.png`)

    if (fs.existsSync(s_path)) {
      try {
        let st = fs.statSync(s_path)
        if (st.mtimeMs > max_mtime)
          max_mtime = st.mtimeMs
      } catch {}
    }
  }

  //Return statement
  return max_mtime
}

/**
 * Main baking function that processes keyframe years.
 */
async function runBake (): Promise<void> {
  //Declare local instance variables
  let all_years = DEFAULT_KEY_YEARS
  let baked_demographics: Record<string, any> = {}
  let baked_sectors: Record<string, any> = {}
  let target_years: number[] = []

  //Function body
  if (!fs.existsSync(BMP_CACHE_DIR))
    fs.mkdirSync(BMP_CACHE_DIR, { recursive: true })

  if (fs.existsSync(BAKED_DEMOGRAPHICS_PATH)) {
    try {
      baked_demographics = JSON.parse(fs.readFileSync(BAKED_DEMOGRAPHICS_PATH, 'utf8'))
    } catch {}
  }
  if (fs.existsSync(BAKED_SECTORS_PATH)) {
    try {
      baked_sectors = JSON.parse(fs.readFileSync(BAKED_SECTORS_PATH, 'utf8'))
    } catch {}
  }

  //Check command-line arguments
  let args = process.argv.slice(2)
  let years_arg_idx = args.indexOf('--years')
  if (years_arg_idx !== -1 && args[years_arg_idx + 1]) {
    target_years = args[years_arg_idx + 1].split(',').map((arg0_y) => parseInt(arg0_y.trim(), 10)).filter((arg0_y) => !Number.isNaN(arg0_y))
  } else {
    target_years = all_years
  }

  console.log(`[Bake] Starting baking for ${target_years.length} years: ${target_years.join(', ')}`)

  for (let i = 0; i < target_years.length; i++) {
    let year = target_years[i]
    let yr_str = String(year)

    //1. Demographics
    let demo_src_mtime = getDemographicSourceMaxMtime(year)
    let is_demo_stale =
      !baked_demographics[yr_str] ||
      (demo_src_mtime > 0 && demo_src_mtime > (baked_demographics[yr_str].lastModified || 0))

    if (is_demo_stale) {
      console.log(`[Bake] Baking demographics for year ${year}...`)
      for (let x = 0; x < AGE_COHORTS.length; x++) {
        let cid = AGE_COHORTS[x]
        convertPngToBmp(path.join(COHORTS_DIR, `f_${cid}_${year}.png`), path.join(BMP_CACHE_DIR, `f_${cid}_${year}.bmp`))
        convertPngToBmp(path.join(COHORTS_DIR, `m_${cid}_${year}.png`), path.join(BMP_CACHE_DIR, `m_${cid}_${year}.bmp`))
      }

      let proc_res = spawnSync(NATIVE_READER_BIN, [
        '--mode', 'demographics',
        '--year', yr_str,
        '--country', 'Global',
        '--cache-dir', BMP_CACHE_DIR,
        '--global'
      ], { encoding: 'utf8' })

      if (proc_res.status === 0 && proc_res.stdout) {
        try {
          let parsed = JSON.parse(proc_res.stdout)
          parsed.lastModified = demo_src_mtime > 0 ? demo_src_mtime : Date.now()
          baked_demographics[yr_str] = parsed
          fs.writeFileSync(BAKED_DEMOGRAPHICS_PATH, JSON.stringify(baked_demographics, null, 2), 'utf8')
          console.log(`[Bake] Successfully baked demographics for year ${year}`)
        } catch (arg0_err) {
          console.error(`[Bake] Failed parsing demographics output for year ${year}:`, arg0_err)
        }
      }
    } else {
      console.log(`[Bake] Demographics for year ${year} is up-to-date.`)
    }

    //2. Sectors
    let sec_src_mtime = getSectorSourceMaxMtime(year)
    let is_sec_stale =
      !baked_sectors[yr_str] ||
      (sec_src_mtime > 0 && sec_src_mtime > ((baked_sectors[yr_str] as any).lastModified || 0))

    if (is_sec_stale) {
      console.log(`[Bake] Baking sectors for year ${year}...`)
      for (let x = 0; x < SECTOR_KEYS.length; x++) {
        let s = SECTOR_KEYS[x]
        convertPngToBmp(path.join(PROFESSIONS_DIR, `${s}_t_${year}.png`), path.join(BMP_CACHE_DIR, `${s}_t_${year}.bmp`))
      }

      let proc_res = spawnSync(NATIVE_READER_BIN, [
        '--mode', 'sectors',
        '--year', yr_str,
        '--country', 'Global',
        '--cache-dir', BMP_CACHE_DIR,
        '--global'
      ], { encoding: 'utf8' })

      if (proc_res.status === 0 && proc_res.stdout) {
        try {
          let parsed = JSON.parse(proc_res.stdout)
          if (parsed && parsed.sectors) {
            let clean_sectors: Record<string, any> = {}
            for (let x = 0; x < SECTOR_KEYS.length; x++) {
              let s = SECTOR_KEYS[x]
              clean_sectors[s] = parsed.sectors[s]
            }
            clean_sectors.lastModified = sec_src_mtime > 0 ? sec_src_mtime : Date.now()
            baked_sectors[yr_str] = clean_sectors
            fs.writeFileSync(BAKED_SECTORS_PATH, JSON.stringify(baked_sectors, null, 2), 'utf8')
            console.log(`[Bake] Successfully baked sectors for year ${year}`)
          }
        } catch (arg0_err) {
          console.error(`[Bake] Failed parsing sectors output for year ${year}:`, arg0_err)
        }
      }
    } else {
      console.log(`[Bake] Sectors for year ${year} is up-to-date.`)
    }
  }

  console.log('[Bake] Baking complete.')
}

runBake().catch(console.error)
