import fs from 'fs'
import { FilepathDefines } from './filepath_defines.ts'
import type { CapitalRecord, CityMetadataEntry, HistoricalNameRecord } from '../framework/stadester/city_metadata_framework.ts'

export type { CapitalRecord, CityMetadataEntry, HistoricalNameRecord }

let bugged_cities_set: Set<string> | null = null
let bugged_cities_mtime = 0

/**
 * Loads and returns the set of bugged city names from data/stadester/bugged_cities.txt.
 *
 * @returns {Set<string>}
 */
export function getBuggedCitiesSet (): Set<string> {
  let file_path = FilepathDefines.get().filepaths.stadester_bugged_cities

  if (fs.existsSync(file_path)) {
    try {
      let stats = fs.statSync(file_path)
      if (!bugged_cities_set || stats.mtimeMs > bugged_cities_mtime) {
        bugged_cities_mtime = stats.mtimeMs
        let content = fs.readFileSync(file_path, 'utf-8')
        let lines = content.split(/\r?\n/)
        let set = new Set<string>()

        for (let i = 0; i < lines.length; i++) {
          let line = lines[i].trim()
          if (line && !line.startsWith('#')) {
            set.add(line.toLowerCase())
            let norm = line.toLowerCase().replace(/[-~'`^]/g, ' ').replace(/\s+/g, ' ').trim()
            if (norm)
              set.add(norm)
            let strip = line.toLowerCase().replace(/[`'’\-\s]/g, '')
            if (strip)
              set.add(strip)
          }
        }
        bugged_cities_set = set
      }
      return bugged_cities_set!
    } catch (arg0_err) {
      console.warn('[StadesterService] Failed to read bugged_cities.txt:', arg0_err)
      return new Set()
    }
  }
  return new Set()
}


/**
 * Normalises a city key or composite name string to its primary alphanumeric base,
 * stripping secondary conurbations/agglomerations after semicolons or in parentheses.
 *
 * @param {string} arg0_key
 *
 * @returns {string}
 */
export function getPrimaryCityNormKey (arg0_key: string): string {
  //Convert from parameters
  let key = arg0_key

  //Guard clauses
  if (!key)
    return ''

  //Declare local instance variables
  let city_part: string
  let country: string
  let full: string
  let parts: string[]
  let primary_city: string

  //Function body
  parts = key.replace(/^(stadester|ghsl|oxford)-/i, '').split('-')
  country = parts.length > 1 ? parts[parts.length - 1] : ''
  city_part = parts.slice(0, parts.length - 1).join('-')
  primary_city = city_part.split(';')[0].replace(/\(.*?\)/g, '').trim()
  full = (primary_city + (country ? '-' + country : '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

  //Return statement
  return full
}


export interface CityIndexEntry {
  area?: Record<string, number>
  capital?: Record<string, number | string | null>
  capital_records?: CapitalRecord[]
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: Record<string, number>
  elevation?: number
  ghsl_name?: string
  historical_names?: HistoricalNameRecord[]
  id: number | string
  is_agglomeration?: boolean
  is_agglomeration_of?: string
  key: string
  max_pop: number
  max_year: number
  metadata_name?: string
  min_year: number
  name: string
  original_names?: string | string[]
  other_names?: string | string[]
  population?: Record<string, number>
  reconciled_name?: string
  region?: string
  years: number[]
}

export interface StadesterQueryOptions {
  active_state_ids?: Set<number>
  bbox?: [number, number, number, number] // [west, south, east, north]
  color_mode?: 'growth' | 'population' | 'region' | 'continent'
  dataset?: string
  day?: number
  max_cities?: number
  min_pop?: number
  month?: number
  preserve_capitals?: boolean
}

export interface CompactCitiesPayload {
  capitals?: number[]
  capital_colors?: (string | null)[]
  capital_names?: (string | null)[]
  capital_state_ids?: (number | null)[]
  coords: number[] // [lat0, lon0, lat1, lon1, ...]
  count: number
  countries: (string | undefined)[]
  growth: number[]
  keys: string[]
  names: string[]
  pops: number[]
  regions: (string | undefined)[]
}

export interface CityRenderPoint {
  area?: number
  capital_color?: string
  capital_state_id?: number | string
  capital_state_name?: string
  capitalOf?: string
  colour?: [number, number, number]
  coords: [number, number]
  country?: string
  density?: number
  growthRate?: number
  historical_names?: HistoricalNameRecord[]
  id: number | string
  is_capital?: boolean
  isCapital?: boolean
  key: string
  metadata_name?: string
  name: string
  other_names?: string | string[]
  population: number
  region?: string
}

/**
 * Checks whether a city coordinate is spatially contained within or proximate to a state's bounding box.
 *
 * @param {any} arg0_city
 * @param {any} arg1_state
 * @param {number} [arg2_tolerance_deg=2.0]
 *
 * @returns {boolean}
 */
export function isCityInsideStateBBox (
  arg0_city: any,
  arg1_state: any,
  arg2_tolerance_deg: number = 2.0
): boolean {
  //Convert from parameters
  let city = arg0_city
  let state = arg1_state
  let tol = arg2_tolerance_deg

  //Guard clauses
  if (!city || !state)
    return false

  if (!state.bbox || !Array.isArray(state.bbox) || state.bbox.length < 4)
    return true

  //Declare local instance variables
  let c_lat: number | null = null
  let c_lng: number | null = null

  //Function body
  if (city.lat !== undefined && city.lon !== undefined) {
    c_lat = Number(city.lat)
    c_lng = Number(city.lon)
  } else if (city.lat !== undefined && city.lng !== undefined) {
    c_lat = Number(city.lat)
    c_lng = Number(city.lng)
  } else if (Array.isArray(city.coords) && city.coords.length >= 2) {
    if (city.key || city.population !== undefined || city.country !== undefined) {
      c_lat = Number(city.coords[0])
      c_lng = Number(city.coords[1])
    } else {
      c_lat = Number(city.coords[1])
      c_lng = Number(city.coords[0])
    }
  }

  if (c_lat === null || c_lng === null || isNaN(c_lat) || isNaN(c_lng))
    return true

  let [minX, minY, maxX, maxY] = state.bbox
  if (c_lng < minX - tol || c_lng > maxX + tol || c_lat < minY - tol || c_lat > maxY + tol)
    return false

  //Return statement
  return true
}
