import fs from 'fs'
import path from 'path'
import { getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import { AtlasBordersService } from './AtlasBordersService.ts'
import {
  AGE_COHORTS,
  SECTOR_KEYS,
  COHORTS_DIR,
  PROFESSIONS_DIR,
  ensureDemographicBmpCache,
  ensureSectorBmpCache,
  isFileCacheStale,
  loadGeoPngAsFloat32,
  runNativeRasterReader,
} from './raster_bmp_cache.ts'
import {
  computeScanlineSpans,
  sumGlobalRaster,
  sumRasterSpans,
  type ScanlineSpan,
} from './raster_scanline.ts'

export type { ScanlineSpan }
export { computeScanlineSpans, isFileCacheStale }

export interface DemographicCohortResult {
  country: string
  dependencyRatio: number
  female: Record<string, number>
  lastModified?: number
  male: Record<string, number>
  oldAgeDependencyRatio?: number
  sexRatio: number
  totalFemale: number
  totalMale: number
}

export interface SectorBreakdownResult {
  byCountry: Record<string, Record<string, number>>
  global: Record<string, number>
  lastModified?: number
}

let NATURAL_EARTH_PATH = path.join(process.cwd(), 'public/data/ne_50m_admin_0_countries.geojson')
let BAKED_DEMOGRAPHICS_PATH = path.resolve(process.cwd(), 'data/baked_global_demographics.json')
let BAKED_SECTORS_PATH = path.resolve(process.cwd(), 'data/baked_global_sectors.json')

let baked_global_demographics: Record<string, DemographicCohortResult> = {}
let baked_global_sectors: Record<string, Record<string, number>> = {}
let demographic_cache_mtimes = new Map<number, number>()
let demographic_year_cache = new Map<number, { f: Record<string, Float32Array>; m: Record<string, Float32Array> }>()
let sector_cache_mtimes = new Map<number, number>()
let sector_year_cache = new Map<number, Record<string, Float32Array>>()
let available_demographic_years: number[] | null = null
let available_sector_years: number[] | null = null
let cached_natural_earth_features: any[] | null = null

/**
 * Returns the latest modification timestamp (mtimeMs) among all 36 source demographic GeoPNGs for a year.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
export function getDemographicSourceMaxMtime (arg0_year: number): number {
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
export function getSectorSourceMaxMtime (arg0_year: number): number {
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
 * Returns the latest modification timestamp for either demographics or professions at a given year.
 *
 * @param {string} arg0_layer
 * @param {number} arg1_year
 *
 * @returns {number}
 */
export function getLayerYearSourceMtime (arg0_layer: string, arg1_year: number): number {
  //Convert from parameters
  let layer = arg0_layer
  let year = arg1_year

  //Function body
  if (layer === 'age_sex')
    return getDemographicSourceMaxMtime(year)
  if (layer.includes('profession'))
    return getSectorSourceMaxMtime(year)

  //Return statement
  return 0
}

/**
 * Loads baked global demographics from disk into memory cache.
 */
function loadBakedGlobalDemographics (): void {
  //Function body
  try {
    if (fs.existsSync(BAKED_DEMOGRAPHICS_PATH)) {
      let file_mtime = fs.statSync(BAKED_DEMOGRAPHICS_PATH).mtimeMs
      let raw = fs.readFileSync(BAKED_DEMOGRAPHICS_PATH, 'utf8')
      baked_global_demographics = JSON.parse(raw)
      let all_years = Object.keys(baked_global_demographics)
      for (let i = 0; i < all_years.length; i++) {
        let yr = all_years[i]
        if (!baked_global_demographics[yr].lastModified)
          baked_global_demographics[yr].lastModified = file_mtime
      }
    }
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to load baked global demographics:', arg0_err)
  }
}

/**
 * Loads baked global sectors from disk into memory cache.
 */
function loadBakedGlobalSectors (): void {
  //Function body
  try {
    if (fs.existsSync(BAKED_SECTORS_PATH)) {
      let file_mtime = fs.statSync(BAKED_SECTORS_PATH).mtimeMs
      let raw = fs.readFileSync(BAKED_SECTORS_PATH, 'utf8')
      baked_global_sectors = JSON.parse(raw)
      let all_years = Object.keys(baked_global_sectors)
      for (let i = 0; i < all_years.length; i++) {
        let yr = all_years[i]
        if (!(baked_global_sectors[yr] as any).lastModified)
          (baked_global_sectors[yr] as any).lastModified = file_mtime
      }
    }
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to load baked global sectors:', arg0_err)
  }
}

loadBakedGlobalDemographics()
loadBakedGlobalSectors()

/**
 * Saves a baked global demographic result to in-memory cache and writes to disk.
 *
 * @param {number} arg0_year
 * @param {DemographicCohortResult} arg1_result
 */
function saveBakedGlobalDemographic (arg0_year: number, arg1_result: DemographicCohortResult): void {
  //Convert from parameters
  let result = arg1_result
  let year = arg0_year

  //Declare local instance variables
  let src_mtime = getDemographicSourceMaxMtime(year)
  let yr_str = String(year)

  //Function body
  result.lastModified = src_mtime > 0 ? src_mtime : Date.now()
  baked_global_demographics[yr_str] = result
  try {
    fs.writeFileSync(BAKED_DEMOGRAPHICS_PATH, JSON.stringify(baked_global_demographics, null, 2), 'utf8')
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to save baked global demographics:', arg0_err)
  }
}

/**
 * Saves a baked global sector result to in-memory cache and writes to disk.
 *
 * @param {number} arg0_year
 * @param {Record<string, number>} arg1_sectors
 */
function saveBakedGlobalSector (arg0_year: number, arg1_sectors: Record<string, number>): void {
  //Convert from parameters
  let sectors = arg1_sectors
  let year = arg0_year

  //Declare local instance variables
  let clean_sectors: Record<string, number> = {}
  let src_mtime = getSectorSourceMaxMtime(year)
  let yr_str = String(year)

  //Function body
  for (let i = 0; i < SECTOR_KEYS.length; i++) {
    let s = SECTOR_KEYS[i]
    if (typeof sectors[s] === 'number')
      clean_sectors[s] = sectors[s]
  }
  clean_sectors.lastModified = src_mtime > 0 ? src_mtime : Date.now()
  baked_global_sectors[yr_str] = clean_sectors
  try {
    fs.writeFileSync(BAKED_SECTORS_PATH, JSON.stringify(baked_global_sectors, null, 2), 'utf8')
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to save baked global sectors:', arg0_err)
  }
}

/**
 * Loads and returns the sorted list of available keyframe years for age_sex composite cohorts.
 *
 * @returns {number[]}
 */
function getAvailableDemographicYears (): number[] {
  //Guard clauses
  if (available_demographic_years)
    return available_demographic_years

  //Declare local instance variables
  let all_files: string[] = []
  let years_set = new Set<number>()

  //Function body
  try {
    if (fs.existsSync(COHORTS_DIR)) {
      all_files = fs.readdirSync(COHORTS_DIR)
      for (let i = 0; i < all_files.length; i++) {
        let f = all_files[i]
        if (f.startsWith('f_00_') && f.endsWith('.png')) {
          let yr_str = f.replace('f_00_', '').replace('.png', '')
          let yr = parseInt(yr_str, 10)
          if (!Number.isNaN(yr))
            years_set.add(yr)
        }
      }
    }
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to read demographic years:', arg0_err)
  }

  available_demographic_years = Array.from(years_set).sort((arg0_a, arg0_b) => arg0_a - arg0_b)

  //Return statement
  return available_demographic_years
}

/**
 * Loads and returns the sorted list of available keyframe years for professions aggregates.
 *
 * @returns {number[]}
 */
function getAvailableSectorYears (): number[] {
  //Guard clauses
  if (available_sector_years)
    return available_sector_years

  //Declare local instance variables
  let all_files: string[] = []
  let years_set = new Set<number>()

  //Function body
  try {
    if (fs.existsSync(PROFESSIONS_DIR)) {
      all_files = fs.readdirSync(PROFESSIONS_DIR)
      for (let i = 0; i < all_files.length; i++) {
        let f = all_files[i]
        if (f.startsWith('agriculture_t_') && f.endsWith('.png')) {
          let yr_str = f.replace('agriculture_t_', '').replace('.png', '')
          let yr = parseInt(yr_str, 10)
          if (!Number.isNaN(yr))
            years_set.add(yr)
        }
      }
    }
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to read sector years:', arg0_err)
  }

  available_sector_years = Array.from(years_set).sort((arg0_a, arg0_b) => arg0_a - arg0_b)

  //Return statement
  return available_sector_years
}

/**
 * Finds the closest available keyframe year to the target requested year.
 *
 * @param {number} arg0_year
 * @param {number[]} arg1_years
 *
 * @returns {number}
 */
function findClosestYear (arg0_year: number, arg1_years: number[]): number {
  //Convert from parameters
  let target_year = arg0_year
  let years = arg1_years

  //Guard clauses
  if (!years || years.length === 0)
    return target_year

  //Declare local instance variables
  let closest = years[0]
  let min_diff = Math.abs(target_year - closest)

  //Function body
  for (let i = 1; i < years.length; i++) {
    let diff = Math.abs(target_year - years[i])
    if (diff < min_diff) {
      min_diff = diff
      closest = years[i]
    }
  }

  //Return statement
  return closest
}

/**
 * Loads all 36 demographic cohort rasters for a keyframe year into memory cache.
 *
 * @param {number} arg0_year
 *
 * @returns {{ f: Record<string, Float32Array>; m: Record<string, Float32Array> } | null}
 */
function getDemographicYearRasters (
  arg0_year: number
): { f: Record<string, Float32Array>; m: Record<string, Float32Array> } | null {
  //Convert from parameters
  let year = arg0_year

  //Declare local instance variables
  let available = getAvailableDemographicYears()
  let cached_mtime: number
  let current_mtime: number
  let female_map: Record<string, Float32Array> = {}
  let keyframe_year: number
  let male_map: Record<string, Float32Array> = {}

  //Guard clauses
  keyframe_year = findClosestYear(year, available)

  current_mtime = getDemographicSourceMaxMtime(keyframe_year)
  cached_mtime = demographic_cache_mtimes.get(keyframe_year) ?? 0
  let opt_info_demo = getOptimisationConfig()
  if (current_mtime > cached_mtime || opt_info_demo.mtimeMs > cached_mtime) {
    demographic_year_cache.delete(keyframe_year)
    demographic_cache_mtimes.delete(keyframe_year)
  }

  if (demographic_year_cache.has(keyframe_year))
    return demographic_year_cache.get(keyframe_year)!

  //Function body
  for (let i = 0; i < AGE_COHORTS.length; i++) {
    let cid = AGE_COHORTS[i]
    let f_path = path.join(COHORTS_DIR, `f_${cid}_${keyframe_year}.png`)
    let m_path = path.join(COHORTS_DIR, `m_${cid}_${keyframe_year}.png`)

    let f_data = loadGeoPngAsFloat32(f_path)
    let m_data = loadGeoPngAsFloat32(m_path)

    if (f_data)
      female_map[cid] = f_data
    if (m_data)
      male_map[cid] = m_data
  }

  //Evict oldest if cache exceeds 3 years
  if (demographic_year_cache.size >= 3) {
    let first_key = demographic_year_cache.keys().next().value
    if (first_key !== undefined) {
      demographic_year_cache.delete(first_key)
      demographic_cache_mtimes.delete(first_key)
    }
  }

  let year_payload = { f: female_map, m: male_map }
  demographic_cache_mtimes.set(keyframe_year, current_mtime)
  demographic_year_cache.set(keyframe_year, year_payload)

  //Return statement
  return year_payload
}

/**
 * Loads all 5 sector aggregates for a keyframe year into memory cache.
 *
 * @param {number} arg0_year
 *
 * @returns {Record<string, Float32Array> | null}
 */
function getSectorYearRasters (arg0_year: number): Record<string, Float32Array> | null {
  //Convert from parameters
  let year = arg0_year

  //Declare local instance variables
  let available = getAvailableSectorYears()
  let cached_mtime: number
  let current_mtime: number
  let keyframe_year: number
  let sector_map: Record<string, Float32Array> = {}

  //Guard clauses
  keyframe_year = findClosestYear(year, available)

  current_mtime = getSectorSourceMaxMtime(keyframe_year)
  cached_mtime = sector_cache_mtimes.get(keyframe_year) ?? 0
  let opt_info_sec = getOptimisationConfig()
  if (current_mtime > cached_mtime || opt_info_sec.mtimeMs > cached_mtime) {
    sector_year_cache.delete(keyframe_year)
    sector_cache_mtimes.delete(keyframe_year)
  }

  if (sector_year_cache.has(keyframe_year))
    return sector_year_cache.get(keyframe_year)!

  //Function body
  for (let i = 0; i < SECTOR_KEYS.length; i++) {
    let s = SECTOR_KEYS[i]
    let p = path.join(PROFESSIONS_DIR, `${s}_t_${keyframe_year}.png`)
    let data = loadGeoPngAsFloat32(p)
    if (data)
      sector_map[s] = data
  }

  if (sector_year_cache.size >= 4) {
    let first_key = sector_year_cache.keys().next().value
    if (first_key !== undefined) {
      sector_year_cache.delete(first_key)
      sector_cache_mtimes.delete(first_key)
    }
  }

  sector_cache_mtimes.set(keyframe_year, current_mtime)
  sector_year_cache.set(keyframe_year, sector_map)

  //Return statement
  return sector_map
}

/**
 * Loads Natural Earth GeoJSON features from disk with caching.
 *
 * @returns {any[]}
 */
function getNaturalEarthFeatures (): any[] {
  //Guard clauses
  if (cached_natural_earth_features)
    return cached_natural_earth_features

  //Function body
  try {
    if (fs.existsSync(NATURAL_EARTH_PATH)) {
      let raw = fs.readFileSync(NATURAL_EARTH_PATH, 'utf8')
      let parsed = JSON.parse(raw)
      cached_natural_earth_features = parsed.features || []
    } else {
      cached_natural_earth_features = []
    }
  } catch (arg0_err) {
    console.error('[RasterDemographicsService] Failed to load Natural Earth:', arg0_err)
    cached_natural_earth_features = []
  }

  //Return statement
  return cached_natural_earth_features!
}

/**
 * Resolves a polygon geometry for a given country name or identifier at a given year.
 * Checks AtlasBordersService (historical borders) first, then Natural Earth.
 *
 * @param {string} arg0_name
 * @param {number} arg1_year
 *
 * @returns {any | null}
 */
export function resolveCountryGeometry (arg0_name: string, arg1_year: number): any | null {
  //Convert from parameters
  let name = arg0_name
  let year = arg1_year

  //Guard clauses
  if (!name || name.toLowerCase().trim() === 'global')
    return null

  //Declare local instance variables
  let clean = name.toLowerCase().trim()
  let hist_res = AtlasBordersService.getBordersAtYear(year)
  let ne_feats: any[]

  //Function body
  if (hist_res && hist_res.features) {
    //Pass 1: exact property match
    for (let i = 0; i < hist_res.features.length; i++) {
      let f = hist_res.features[i]
      let p = f.properties
      if (
        (p.name && p.name.toLowerCase().trim() === clean) ||
        (p.cntry_name && p.cntry_name.toLowerCase().trim() === clean) ||
        (p.name_long && p.name_long.toLowerCase().trim() === clean) ||
        (p.adm0_a3 && p.adm0_a3.toLowerCase().trim() === clean) ||
        (p.iso_a3 && p.iso_a3.toLowerCase().trim() === clean) ||
        (p.id && String(p.id).toLowerCase().trim() === clean) ||
        (p.gwcode && String(p.gwcode) === clean)
      ) {
        return f.geometry
      }
    }

    //Pass 2: historical substring match (e.g. Prussia matching Kingdom of Prussia)
    for (let i = 0; i < hist_res.features.length; i++) {
      let f = hist_res.features[i]
      let p = f.properties
      let cand_name = (p.name || p.cntry_name || p.name_long || p.adm0_a3 || '').toLowerCase().trim()
      if (cand_name) {
        if (
          (clean.length >= 4 && cand_name.includes(clean)) ||
          (cand_name.length >= 4 && clean.includes(cand_name))
        ) {
          return f.geometry
        }
      }
    }
  }

  ne_feats = getNaturalEarthFeatures()
  //Pass 1: Natural Earth exact match
  for (let i = 0; i < ne_feats.length; i++) {
    let f = ne_feats[i]
    let p = f.properties
    if (
      (p.NAME && p.NAME.toLowerCase().trim() === clean) ||
      (p.name && p.name.toLowerCase().trim() === clean) ||
      (p.ADMIN && p.ADMIN.toLowerCase().trim() === clean) ||
      (p.NAME_LONG && p.NAME_LONG.toLowerCase().trim() === clean) ||
      (p.ISO_A3 && p.ISO_A3.toLowerCase().trim() === clean) ||
      (p.ADM0_A3 && p.ADM0_A3.toLowerCase().trim() === clean)
    ) {
      return f.geometry
    }
  }

  //Pass 2: Natural Earth substring match
  for (let i = 0; i < ne_feats.length; i++) {
    let f = ne_feats[i]
    let p = f.properties
    let cand_name = (p.NAME || p.name || p.ADMIN || p.NAME_LONG || '').toLowerCase().trim()
    if (cand_name) {
      if (
        (clean.length >= 4 && cand_name.includes(clean)) ||
        (cand_name.length >= 4 && clean.includes(cand_name))
      ) {
        return f.geometry
      }
    }
  }

  //Return statement
  return null
}

/**
 * Calculates genuine demographic population pyramid cohort values from source GeoPNG rasters.
 *
 * @param {object} arg0_options
 * @param {string} [arg0_options.country]
 * @param {any} [arg0_options.geometry]
 * @param {number} arg0_options.year
 *
 * @returns {DemographicCohortResult}
 */
export function calculateDemographicPyramid (arg0_options: {
  country?: string
  geometry?: any
  year: number
}): DemographicCohortResult {
  //Convert from parameters
  let options = arg0_options
  let country_name = options.country || 'Global'
  let geometry = options.geometry
  let year = options.year

  //Declare local instance variables
  let baked: DemographicCohortResult | undefined
  let female_map: Record<string, number> = {}
  let is_global: boolean
  let keyframe_year: number
  let male_map: Record<string, number> = {}
  let native_res: any
  let old_age_dependency_ratio: number
  let old_count = 0
  let rasters: { f: Record<string, Float32Array>; m: Record<string, Float32Array> } | null
  let result_payload: DemographicCohortResult
  let sex_ratio: number
  let source_max_mtime: number
  let spans: ScanlineSpan[] = []
  let total_female = 0
  let total_male = 0
  let working_count = 0
  let youth_count = 0
  let yr_str: string

  //Function body
  if (!geometry && country_name.toLowerCase().trim() !== 'global')
    geometry = resolveCountryGeometry(country_name, year)

  is_global = !geometry || country_name.toLowerCase().trim() === 'global'

  keyframe_year = findClosestYear(year, getAvailableDemographicYears())
  yr_str = String(keyframe_year)

  //Check if source files were modified after cache
  source_max_mtime = getDemographicSourceMaxMtime(keyframe_year)
  let opt_info_pyr = getOptimisationConfig()
  if (baked_global_demographics[yr_str]) {
    let baked_mtime = baked_global_demographics[yr_str].lastModified || 0
    if ((source_max_mtime > 0 && source_max_mtime > baked_mtime) || (opt_info_pyr.mtimeMs > 0 && opt_info_pyr.mtimeMs > baked_mtime))
      delete baked_global_demographics[yr_str]
  }

  //Check baked global cache first
  if (is_global && baked_global_demographics[yr_str]) {
    baked = baked_global_demographics[yr_str]
    let baked_oadr = baked.oldAgeDependencyRatio !== undefined ? baked.oldAgeDependencyRatio : baked.dependencyRatio
    return {
      country: 'Global',
      dependencyRatio: baked_oadr,
      female: baked.female,
      lastModified: baked.lastModified,
      male: baked.male,
      oldAgeDependencyRatio: baked_oadr,
      sexRatio: baked.sexRatio,
      totalFemale: baked.totalFemale,
      totalMale: baked.totalMale,
    }
  }

  if (!is_global)
    spans = computeScanlineSpans(geometry)

  //Attempt fast multi-threaded native C reader first (1 thread per raster)
  ensureDemographicBmpCache(keyframe_year)

  native_res = runNativeRasterReader({
    country: is_global ? 'Global' : country_name,
    isGlobal: is_global,
    mode: 'demographics',
    spans,
    year: keyframe_year,
  })

  if (native_res && native_res.female && native_res.male) {
    let native_oadr = native_res.oldAgeDependencyRatio !== undefined ? native_res.oldAgeDependencyRatio : native_res.dependencyRatio
    result_payload = {
      country: is_global ? 'Global' : country_name,
      dependencyRatio: native_oadr,
      female: native_res.female,
      lastModified: source_max_mtime,
      male: native_res.male,
      oldAgeDependencyRatio: native_oadr,
      sexRatio: native_res.sexRatio,
      totalFemale: native_res.totalFemale,
      totalMale: native_res.totalMale,
    }
    if (is_global)
      saveBakedGlobalDemographic(keyframe_year, result_payload)

    return result_payload
  }

  //Fallback to in-memory JS Float32Array scanner
  rasters = getDemographicYearRasters(year)
  if (rasters) {
    for (let i = 0; i < AGE_COHORTS.length; i++) {
      let cid = AGE_COHORTS[i]
      let f_data = rasters.f[cid]
      let m_data = rasters.m[cid]

      let f_sum = 0
      let m_sum = 0

      if (is_global) {
        if (f_data)
          f_sum = sumGlobalRaster(f_data)
        if (m_data)
          m_sum = sumGlobalRaster(m_data)
      } else {
        if (f_data)
          f_sum = sumRasterSpans(spans, f_data)
        if (m_data)
          m_sum = sumRasterSpans(spans, m_data)
      }

      //Convert individuals to thousands with 1 decimal place
      let f_thousands = Math.round((f_sum/1000)*10)/10
      let m_thousands = Math.round((m_sum/1000)*10)/10

      female_map[cid] = f_thousands
      male_map[cid] = m_thousands

      total_female += f_thousands
      total_male += m_thousands

      let cohort_total = f_thousands + m_thousands
      if (i <= 3) {
        youth_count += cohort_total
      } else if (i >= 14) {
        old_count += cohort_total
      } else {
        working_count += cohort_total
      }
    }
  }

  sex_ratio = total_female > 0 ? Math.round((total_male/total_female)*1000)/1000 : 1.0
  old_age_dependency_ratio = working_count > 0 ? Math.round((old_count/working_count)*1000)/10 : 15.0

  result_payload = {
    country: is_global ? 'Global' : country_name,
    dependencyRatio: old_age_dependency_ratio,
    female: female_map,
    lastModified: source_max_mtime,
    male: male_map,
    oldAgeDependencyRatio: old_age_dependency_ratio,
    sexRatio: sex_ratio,
    totalFemale: Math.round(total_female*10)/10,
    totalMale: Math.round(total_male*10)/10,
  }
  if (is_global)
    saveBakedGlobalDemographic(keyframe_year, result_payload)

  //Return statement
  return result_payload
}

/**
 * Calculates genuine sectoral employment shares from source GeoPNG aggregates rasters.
 *
 * @param {object} arg0_options
 * @param {string[]} [arg0_options.countries]
 * @param {{ geometry: any; name: string }[]} [arg0_options.geometries]
 * @param {number} arg0_options.year
 *
 * @returns {SectorBreakdownResult}
 */
export function calculateSectorBreakdown (arg0_options: {
  countries?: string[]
  geometries?: { geometry: any; name: string }[]
  year: number
}): SectorBreakdownResult {
  //Convert from parameters
  let options = arg0_options
  let countries = options.countries || []
  let geometries = options.geometries || []
  let year = options.year

  //Declare local instance variables
  let by_country: Record<string, Record<string, number>> = {}
  let global_active_workforce = 0
  let global_shares: Record<string, number> = {}
  let global_sums: Record<string, number> = {}
  let keyframe_year: number
  let native_global: any
  let rasters: Record<string, Float32Array> | null
  let source_max_mtime: number
  let target_entities: { geometry: any; name: string }[] = []
  let yr_str: string

  //Function body
  for (let i = 0; i < geometries.length; i++) {
    if (geometries[i].name && geometries[i].geometry)
      target_entities.push(geometries[i])
  }

  for (let i = 0; i < countries.length; i++) {
    let c_name = countries[i]
    if (c_name.toLowerCase().trim() === 'global')
      continue
    if (!target_entities.some((arg0_t) => arg0_t.name === c_name)) {
      let geom = resolveCountryGeometry(c_name, year)
      if (geom)
        target_entities.push({ geometry: geom, name: c_name })
    }
  }

  keyframe_year = findClosestYear(year, getAvailableSectorYears())
  yr_str = String(keyframe_year)

  //Check if source files were modified after cache
  source_max_mtime = getSectorSourceMaxMtime(keyframe_year)
  let opt_info_sec_calc = getOptimisationConfig()
  if (baked_global_sectors[yr_str]) {
    let baked_mtime = (baked_global_sectors[yr_str] as any).lastModified || 0
    if ((source_max_mtime > 0 && source_max_mtime > baked_mtime) || (opt_info_sec_calc.mtimeMs > 0 && opt_info_sec_calc.mtimeMs > baked_mtime))
      delete baked_global_sectors[yr_str]
  }

  //Check baked global cache first
  if (baked_global_sectors[yr_str]) {
    for (let i = 0; i < SECTOR_KEYS.length; i++) {
      let s = SECTOR_KEYS[i]
      if (typeof baked_global_sectors[yr_str][s] === 'number')
        global_shares[s] = baked_global_sectors[yr_str][s]
    }
  }

  //If no country entities requested and global shares already baked, return immediately
  if (target_entities.length === 0 && Object.keys(global_shares).length > 0) {
    return {
      byCountry: by_country,
      global: global_shares,
      lastModified: source_max_mtime || ((baked_global_sectors[yr_str] as any)?.lastModified ?? 0),
    }
  }

  //If global shares not yet baked, calculate via native C reader
  if (Object.keys(global_shares).length === 0) {
    ensureSectorBmpCache(keyframe_year)
    native_global = runNativeRasterReader({
      country: 'Global',
      isGlobal: true,
      mode: 'sectors',
      year: keyframe_year,
    })
    if (native_global && native_global.sectors) {
      global_shares = native_global.sectors
      saveBakedGlobalSector(keyframe_year, global_shares)
    }
  }

  //Process target entities via native C reader
  if (target_entities.length > 0) {
    ensureSectorBmpCache(keyframe_year)
    for (let i = 0; i < target_entities.length; i++) {
      let entity = target_entities[i]
      let entity_spans = computeScanlineSpans(entity.geometry)
      let native_entity = runNativeRasterReader({
        country: entity.name,
        isGlobal: false,
        mode: 'sectors',
        spans: entity_spans,
        year: keyframe_year,
      })
      if (native_entity && native_entity.sectors) {
        by_country[entity.name] = native_entity.sectors
      }
    }
  }

  if (Object.keys(global_shares).length > 0 && (target_entities.length === 0 || Object.keys(by_country).length > 0)) {
    return {
      byCountry: by_country,
      global: global_shares,
    }
  }

  //Fallback to in-memory JS Float32Array scanner
  rasters = getSectorYearRasters(year)
  if (rasters) {
    if (Object.keys(global_shares).length === 0) {
      for (let i = 0; i < SECTOR_KEYS.length; i++) {
        let s = SECTOR_KEYS[i]
        let s_data = rasters[s]
        let s_sum = s_data ? sumGlobalRaster(s_data) : 0
        global_sums[s] = s_sum
        if (s !== 'not_in_work')
          global_active_workforce += s_sum
      }

      for (let i = 0; i < SECTOR_KEYS.length; i++) {
        let s = SECTOR_KEYS[i]
        if (s === 'not_in_work') {
          let denom = global_active_workforce + global_sums[s]
          global_shares[s] = denom > 0 ? Math.round((global_sums[s]/denom)*1000)/10 : 0
        } else {
          global_shares[s] =
            global_active_workforce > 0
              ? Math.round((global_sums[s]/global_active_workforce)*1000)/10
              : 25.0
        }
      }
      saveBakedGlobalSector(keyframe_year, global_shares)
    }
  }

  //Compute per-country sector distribution
  if (rasters) {
    for (let i = 0; i < target_entities.length; i++) {
      let entity = target_entities[i]
      let entity_active_workforce = 0
      let entity_shares: Record<string, number> = {}
      let entity_sums: Record<string, number> = {}
      let spans = computeScanlineSpans(entity.geometry)

      for (let x = 0; x < SECTOR_KEYS.length; x++) {
        let s = SECTOR_KEYS[x]
        let s_data = rasters[s]
        let s_sum = s_data ? sumRasterSpans(spans, s_data) : 0
        entity_sums[s] = s_sum
        if (s !== 'not_in_work')
          entity_active_workforce += s_sum
      }

      for (let x = 0; x < SECTOR_KEYS.length; x++) {
        let s = SECTOR_KEYS[x]
        if (s === 'not_in_work') {
          let denom = entity_active_workforce + entity_sums[s]
          entity_shares[s] = denom > 0 ? Math.round((entity_sums[s]/denom)*1000)/10 : 0
        } else {
          entity_shares[s] =
            entity_active_workforce > 0
              ? Math.round((entity_sums[s]/entity_active_workforce)*1000)/10
              : (global_shares[s] ?? 25.0)
        }
      }

      by_country[entity.name] = entity_shares
    }
  }

  //Return statement
  return {
    byCountry: by_country,
    global: global_shares,
    lastModified: source_max_mtime || ((baked_global_sectors[yr_str] as any)?.lastModified ?? 0),
  }
}

export default {
  calculateDemographicPyramid,
  calculateSectorBreakdown,
  computeScanlineSpans,
  getDemographicSourceMaxMtime,
  getLayerYearSourceMtime,
  getSectorSourceMaxMtime,
  isFileCacheStale,
  resolveCountryGeometry,
}
