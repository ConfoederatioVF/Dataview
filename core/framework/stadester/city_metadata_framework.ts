import { UfDate } from '../utils/uf_date.ts'

export interface HistoricalNameRecord {
  date: string
  name: string
  year_frac: number
}

export interface CityMetadataEntry {
  coords: [number, number] // [lng, lat] as per specification
  historical_names: HistoricalNameRecord[]
  key?: string
  name?: string
}

export interface ParsedDateRecord {
  day: number
  month: number
  year: number
  year_frac: number
}

/**
 * Computes great-circle distance in kilometres between two geographic coordinates using the Haversine formula.
 *
 * @param {number} arg0_lat1 - Latitude of first point in degrees
 * @param {number} arg1_lon1 - Longitude of first point in degrees
 * @param {number} arg2_lat2 - Latitude of second point in degrees
 * @param {number} arg3_lon2 - Longitude of second point in degrees
 *
 * @returns {number} Distance in kilometres
 */
export let computeHaversineDistanceKm = function (
  arg0_lat1: number,
  arg1_lon1: number,
  arg2_lat2: number,
  arg3_lon2: number
): number {
  //Convert from parameters
  let lat1 = arg0_lat1
  let lon1 = arg1_lon1
  let lat2 = arg2_lat2
  let lon2 = arg3_lon2

  //Declare local instance variables
  let a_val: number
  let c_val: number
  let d_lat: number
  let d_lon: number
  let earth_radius_km = 6371
  let rad = Math.PI / 180

  //Function body
  d_lat = (lat2 - lat1)*rad
  d_lon = (lon2 - lon1)*rad
  a_val =
    Math.sin(d_lat/2)*Math.sin(d_lat/2) +
    Math.cos(lat1*rad)*Math.cos(lat2*rad)*Math.sin(d_lon/2)*Math.sin(d_lon/2)
  c_val = 2*Math.atan2(Math.sqrt(a_val), Math.sqrt(1 - a_val))

  //Return statement
  return earth_radius_km*c_val
}

/**
 * Normalises a raw metadata record from JSON into a typed CityMetadataEntry.
 *
 * @param {any} arg0_raw_entry - Raw JSON entry
 * @param {string} [arg1_entry_key] - Optional dictionary key
 *
 * @returns {CityMetadataEntry | null}
 */
export let normalizeMetadataEntry = function (
  arg0_raw_entry: any,
  arg1_entry_key?: string
): CityMetadataEntry | null {
  //Convert from parameters
  let entry_key = arg1_entry_key
  let raw = arg0_raw_entry

  //Declare local instance variables
  let candidate_coords: [number, number] | null = null
  let entry_name: string = ''
  let hist_names: HistoricalNameRecord[] = []
  let raw_hist: any

  //Guard clauses
  if (!raw || typeof raw !== 'object')
    return null

  //Function body
  //1. Extract [lng, lat] coordinates
  if (Array.isArray(raw.coords) && raw.coords.length >= 2) {
    let num0 = parseFloat(raw.coords[0])
    let num1 = parseFloat(raw.coords[1])
    if (!isNaN(num0) && !isNaN(num1))
      candidate_coords = [num0, num1]
  } else if (raw.lng !== undefined && raw.lat !== undefined) {
    let num_lng = parseFloat(raw.lng)
    let num_lat = parseFloat(raw.lat)
    if (!isNaN(num_lng) && !isNaN(num_lat))
      candidate_coords = [num_lng, num_lat]
  } else if (raw.lon !== undefined && raw.lat !== undefined) {
    let num_lon = parseFloat(raw.lon)
    let num_lat = parseFloat(raw.lat)
    if (!isNaN(num_lon) && !isNaN(num_lat))
      candidate_coords = [num_lon, num_lat]
  }

  if (!candidate_coords)
    return null

  //2. Extract label name
  entry_name = raw.name || entry_key || ''

  //3. Extract historical names array or map
  raw_hist = raw.historical_names || raw.names || raw.history

  if (Array.isArray(raw_hist)) {
    for (let i = 0; i < raw_hist.length; i++) {
      let item = raw_hist[i]
      if (item && typeof item === 'object') {
        let date_str = item.date || item.from || item.year || ''
        let name_str = item.name || item.value || ''
        if (date_str && name_str) {
          let parsed_date = parseYearMonthDay(date_str)
          hist_names.push({
            date: String(date_str).trim(),
            name: String(name_str).trim(),
            year_frac: parsed_date.year_frac,
          })
        }
      }
    }
  } else if (raw_hist && typeof raw_hist === 'object') {
    let date_keys = Object.keys(raw_hist)
    for (let i = 0; i < date_keys.length; i++) {
      let d_key = date_keys[i]
      let n_val = raw_hist[d_key]
      if (n_val && typeof n_val === 'string') {
        let parsed_date = parseYearMonthDay(d_key)
        hist_names.push({
          date: d_key.trim(),
          name: n_val.trim(),
          year_frac: parsed_date.year_frac,
        })
      }
    }
  }

  //Sort historical name transitions chronologically by fractional year
  hist_names.sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)

  //Return statement
  return {
    coords: candidate_coords,
    historical_names: hist_names,
    key: raw.key,
    name: entry_name,
  }
}

/**
 * Parses a date string in year.month.day format into a structured record with continuous fractional year.
 * Handles negative years (BCE/BC), standard ISO delimiters, and year-only inputs.
 *
 * @param {string | number} arg0_date_val - Date string or numeric year
 *
 * @returns {ParsedDateRecord}
 */
export let parseYearMonthDay = function (arg0_date_val: string | number): ParsedDateRecord {
  //Convert from parameters
  let date_val = arg0_date_val

  //Declare local instance variables
  let clean_str: string
  let day_val = 1
  let delimiter: string
  let is_negative = false
  let month_val = 1
  let parts: string[]
  let raw_str: string
  let year_frac: number
  let year_val = 0

  //Guard clauses
  if (typeof date_val === 'number') {
    year_val = Math.floor(date_val)
    return {
      day: 1,
      month: 1,
      year: year_val,
      year_frac: date_val,
    }
  }

  //Function body
  raw_str = String(date_val).trim()
  if (raw_str.startsWith('-')) {
    is_negative = true
    clean_str = raw_str.slice(1).trim()
  } else {
    clean_str = raw_str
  }

  delimiter = clean_str.includes('.') ? '.' : (clean_str.includes('-') ? '-' : '/')
  parts = clean_str.split(delimiter).map((arg0_s) => arg0_s.trim())

  year_val = parseInt(parts[0], 10)*(is_negative ? -1 : 1)
  if (isNaN(year_val))
    year_val = 0

  if (parts.length > 1) {
    let parsed_month = parseInt(parts[1], 10)
    if (!isNaN(parsed_month) && parsed_month >= 1 && parsed_month <= 12)
      month_val = parsed_month
  }

  if (parts.length > 2) {
    let parsed_day = parseInt(parts[2], 10)
    if (!isNaN(parsed_day) && parsed_day >= 1 && parsed_day <= 31)
      day_val = parsed_day
  }

  year_frac = UfDate.toFractionalYear({
    day: day_val,
    month: month_val,
    year: year_val,
  })

  //Return statement
  return {
    day: day_val,
    month: month_val,
    year: year_val,
    year_frac: year_frac,
  }
}

/**
 * Resolves the historical city name at a specified historical year or date.
 * Iterates through sorted name changes to find the latest valid historical name on or before target year.
 *
 * @param {{ name: string; historical_names?: HistoricalNameRecord[] }} arg0_city - City index entry
 * @param {number | string} [arg1_year_or_date] - Target year or date string (year.month.day)
 *
 * @returns {string} Resolved historical display name
 */
export let resolveHistoricalCityName = function (
  arg0_city: { name: string; historical_names?: HistoricalNameRecord[] },
  arg1_year_or_date?: number | string
): string {
  //Convert from parameters
  let city = arg0_city
  let year_or_date = arg1_year_or_date

  //Declare local instance variables
  let hist: HistoricalNameRecord[]
  let target_frac: number

  //Guard clauses
  if (!city)
    return ''

  if (!city.historical_names || city.historical_names.length === 0)
    return city.name

  //Function body
  if (year_or_date !== undefined && year_or_date !== null) {
    if (typeof year_or_date === 'number') {
      target_frac = year_or_date
    } else {
      let parsed = parseYearMonthDay(year_or_date)
      target_frac = parsed.year_frac
    }
  } else {
    target_frac = 1950
  }

  hist = city.historical_names

  //Find the latest transition on or before target_frac
  for (let i = hist.length - 1; i >= 0; i--) {
    if (target_frac >= hist[i].year_frac) {
      //Return statement
      return hist[i].name
    }
  }

  //If before earliest recorded change, return the earliest known name
  if (hist.length > 0)
    return hist[0].name

  //Return statement
  return city.name
}
