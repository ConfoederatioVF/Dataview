import { UfDate } from '../utils/uf_date.ts'
import { stripBracketedPostfixes } from './city_name_framework.ts'

export interface AliasStemSet {
  aliases: string[]
  stems: string[]
}

export interface CapitalRecord {
  date: string
  state_id: number | string | null
  year_frac: number
}

export interface HistoricalNameRecord {
  date: string
  name: string
  year_frac: number
}

export interface CityMetadataEntry {
  capital?: Record<string, number | string | null>
  capitals?: Record<string, number | string | null>
  capital_records?: CapitalRecord[]
  coords: [number, number] // [lng, lat] as per specification
  historical_names: HistoricalNameRecord[]
  key?: string
  name?: string
  other_names?: string | string[]
}

export interface ParsedDateRecord {
  day: number
  month: number
  year: number
  year_frac: number
}

let SYNTHETIC_GHSL_EPOCHS = new Set<string>([
  '1975.1.1',
  '1980.1.1',
  '1985.1.1',
  '1990.1.1',
  '1995.1.1',
  '2000.1.1',
  '2005.1.1',
  '2010.1.1',
  '2015.1.1',
  '2020.1.1',
  '2025.1.1',
])

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
  let capital_dict: Record<string, number | string> = {}
  let capital_records: CapitalRecord[] = []
  let entry_name: string = ''
  let hist_names: HistoricalNameRecord[] = []
  let raw_capital: any
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

  //4. Extract capital dictionary
  raw_capital = raw.capital || raw.capitals

  if (Array.isArray(raw_capital)) {
    for (let i = 0; i < raw_capital.length; i++) {
      let item = raw_capital[i]
      if (item && typeof item === 'object') {
        let date_str = item.date || item.from || item.year || ''
        let state_val = item.state_id !== undefined ? item.state_id : item.state
        if (date_str) {
          let parsed_date = parseYearMonthDay(date_str)
          let date_clean = String(date_str).trim()
          let state_target = (state_val !== undefined && state_val !== null) ? state_val : null
          capital_dict[date_clean] = state_target
          capital_records.push({
            date: date_clean,
            state_id: state_target,
            year_frac: parsed_date.year_frac,
          })
        }
      }
    }
  } else if (raw_capital && typeof raw_capital === 'object') {
    let cap_keys = Object.keys(raw_capital)
    for (let i = 0; i < cap_keys.length; i++) {
      let d_key = cap_keys[i]
      let s_val = raw_capital[d_key]
      let parsed_date = parseYearMonthDay(d_key)
      let date_clean = d_key.trim()
      let state_target = (s_val !== undefined && s_val !== null) ? s_val : null
      capital_dict[date_clean] = state_target
      capital_records.push({
        date: date_clean,
        state_id: state_target,
        year_frac: parsed_date.year_frac,
      })
    }
  }

  //Sort historical name transitions chronologically by fractional year
  hist_names.sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)
  capital_records.sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)

  //Return statement
  return {
    capital: capital_dict,
    capitals: capital_dict,
    capital_records: capital_records,
    coords: candidate_coords,
    historical_names: hist_names,
    key: raw.key || entry_key,
    name: entry_name,
    other_names: raw.other_names || raw.names_other,
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
  arg0_city: { name: string; historical_names?: HistoricalNameRecord[]; ghsl_name?: string; reconciled_name?: string },
  arg1_year_or_date?: number | string
): string {
  //Convert from parameters
  let city = arg0_city
  let year_or_date = arg1_year_or_date

  //Declare local instance variables
  let active_1975_legacy: HistoricalNameRecord | null = null
  let default_name = ''
  let first_post_1975: HistoricalNameRecord | null = null
  let hist: HistoricalNameRecord[]
  let is_ghsl_entry = false
  let latest_post_1975: HistoricalNameRecord | null = null
  let parsed: ParsedDateRecord
  let rec_frac: number
  let target_frac: number

  //Guard clauses
  if (!city)
    return ''

  is_ghsl_entry = Boolean((city as any)?.key && String((city as any).key).startsWith('ghsl-'))
  if (is_ghsl_entry) {
    default_name = (city as any)?.reconciled_name || (city as any)?.ghsl_name || city?.name || ''
  } else {
    default_name = (city as any)?.metadata_name || city?.name || (city as any)?.reconciled_name || (city as any)?.ghsl_name || ''
  }

  if (!city.historical_names || city.historical_names.length === 0)
    return default_name

  hist = city.historical_names

  if (year_or_date !== undefined && year_or_date !== null) {
    if (typeof year_or_date === 'number') {
      target_frac = year_or_date
    } else {
      parsed = parseYearMonthDay(year_or_date)
      target_frac = parsed.year_frac
    }
  } else {
    target_frac = 1950
  }

  //Function body
  //1. Continuous chronological step resolution for unified (non-ghsl-*) settlements across all years, and pre-1975 for legacy ghsl-*
  if (!is_ghsl_entry || target_frac < 1975) {
    for (let i = hist.length - 1; i >= 0; i--) {
      rec_frac = (hist[i].year_frac !== undefined && hist[i].year_frac !== null)
        ? hist[i].year_frac
        : parseYearMonthDay(hist[i].date).year_frac

      if (target_frac >= rec_frac)
        return hist[i].name
    }

    if (hist.length > 0)
      return hist[0].name

    //Return statement
    return default_name
  }

  //2. Legacy post-1975 bifurcated resolution (retained solely for 1.0/1.1 ghsl-* entries)
  for (let i = 0; i < hist.length; i++) {
    rec_frac = (hist[i].year_frac !== undefined && hist[i].year_frac !== null)
      ? hist[i].year_frac
      : parseYearMonthDay(hist[i].date).year_frac

    if (rec_frac < 1975) {
      active_1975_legacy = hist[i]
    } else if (rec_frac >= 1975.0) {
      if (!first_post_1975)
        first_post_1975 = hist[i]

      if (rec_frac <= target_frac)
        latest_post_1975 = hist[i]
    }
  }

  //Case 2A: On or after a genuine post-1975 transition (e.g. Saint Petersburg post-1991, Mumbai post-1995, Gqeberha post-2021)
  if (latest_post_1975)
    return latest_post_1975.name

  //Case 2B: Before a genuine post-1975 transition; legacy 1975 name carries over (e.g. Leningrad 1975-1991, Bombay 1975-1995, Port Elizabeth 1975-2021)
  if (first_post_1975 && active_1975_legacy)
    return active_1975_legacy.name

  //Case 2C: No post-1975 changes exist on legacy ghsl-* entry; return canonical modern name
  //Return statement
  return default_name
}

/**
 * Resolves the active capital record for a city at a given year or date, validating state existence.
 *
 * @param {any} arg0_city - City metadata or index record
 * @param {number | string} [arg1_year_or_date] - Target year or date string (year.month.day)
 * @param {(arg0_state_id: number | string, arg1_year_frac: number) => boolean} [arg2_state_validator] - Optional state existence check
 *
 * @returns {CapitalRecord | null} Active capital record or null
 */
export let getCityActiveCapitalRecord = function (
  arg0_city: any,
  arg1_year_or_date?: number | string,
  arg2_state_validator?: (arg0_state_id: number | string, arg1_year_frac: number) => boolean
): CapitalRecord | null {
  //Convert from parameters
  let city = arg0_city
  let state_validator = arg2_state_validator
  let year_or_date = arg1_year_or_date

  //Declare local instance variables
  let records: CapitalRecord[] | undefined
  let target_frac: number

  //Guard clauses
  if (!city)
    return null

  //Function body
  records = city.capital_records
  if (!records && (city.capital || city.capitals)) {
    let raw_cap = city.capital || city.capitals
    records = []
    let cap_keys = Object.keys(raw_cap)
    for (let i = 0; i < cap_keys.length; i++) {
      let d_key = cap_keys[i]
      let s_val = raw_cap[d_key]
      let parsed = parseYearMonthDay(d_key)
      records.push({
        date: d_key.trim(),
        state_id: (s_val !== undefined && s_val !== null) ? s_val : null,
        year_frac: parsed.year_frac,
      })
    }
    records.sort((arg0_a, arg0_b) => arg0_a.year_frac - arg0_b.year_frac)
  }

  if (!records || records.length === 0)
    return null

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

  //Find the latest capital transition on or before target_frac
  for (let i = records.length - 1; i >= 0; i--) {
    if (target_frac >= records[i].year_frac) {
      let active_state_id = records[i].state_id
      if (!active_state_id)
        return null

      if (state_validator) {
        if (!state_validator(active_state_id, target_frac))
          return null
      }

      //Return statement
      return records[i]
    }
  }

  //Return statement
  return null
}

/**
 * Checks whether a city is a capital at the specified year or date.
 *
 * @param {any} arg0_city - City metadata or index record
 * @param {number | string} [arg1_year_or_date] - Target year or date string (year.month.day)
 * @param {(arg0_state_id: number | string, arg1_year_frac: number) => boolean} [arg2_state_validator] - Optional state existence check
 *
 * @returns {boolean} Whether the city is a capital at target year
 */
export let isCityCapitalAtYear = function (
  arg0_city: any,
  arg1_year_or_date?: number | string,
  arg2_state_validator?: (arg0_state_id: number | string, arg1_year_frac: number) => boolean
): boolean {
  //Convert from parameters
  let city = arg0_city
  let state_validator = arg2_state_validator
  let year_or_date = arg1_year_or_date

  //Return statement
  return Boolean(getCityActiveCapitalRecord(city, year_or_date, state_validator))
}

/**
 * Reorders inverted trailing Arabic or French definite articles (`City, Al-` / `Havre, Le`) to prefix position.
 *
 * @param {string} arg0_text - City name string
 *
 * @returns {string}
 */
let normalizeInvertedArticle = function (arg0_text: string): string {
  //Convert from parameters
  let text = arg0_text

  //Declare local instance variables
  let inv_match: RegExpMatchArray | null

  //Guard clauses
  if (!text)
    return ''

  //Function body
  inv_match = text.match(/^([^,]+),\s*(al|el|ad|ar|as|at|az|an|ash|le|la|les)-?$/i)
  if (inv_match)
    return `${inv_match[2]} ${inv_match[1]}`

  //Return statement
  return text
}

/**
 * Normalises a city name or capital label to a canonical stem for cross-script/transliteration matching.
 *
 * @param {string} arg0_name - City or capital name string
 *
 * @returns {string} Normalised alphanumeric stem
 */
export let normalizeCapitalNameStem = function (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return ''

  //Declare local instance variables
  let base: string
  let stem: string

  //Function body
  base = normalizeInvertedArticle(
    stripBracketedPostfixes(String(name).split(';')[0].replace(/\(s\)/gi, '').trim())
  )

  stem = base
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/['’‘`´^ʻʼʾʿ]/g, '')
    .replace(/[-_.,/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(al|ar|ash|az|an|at|ad|as|el|er|esh|ez)\s+/i, '')
    .replace(/\bsaint\b/g, 'st')
    .replace(/^dj/, 'j')
    .replace(/(iyah|iyyah)$/, 'iya')

  if (stem.length >= 4 && stem.endsWith('h'))
    stem = stem.slice(0, -1)

  //Return statement
  return stem.replace(/[^a-z0-9]/g, '')
}

/**
 * Normalises a city key or name by stripping dataset prefixes, diacritics, and punctuation for fuzzy matching.
 *
 * @param {string} arg0_key - City key or name string
 *
 * @returns {string} Normalised alphanumeric key
 */
export let normalizeCityKey = function (arg0_key: string): string {
  //Convert from parameters
  let key = arg0_key

  //Guard clauses
  if (!key)
    return ''

  //Return statement
  return stripBracketedPostfixes(key.replace(/^(stadester|ghsl|oxford)-/i, ''))
    .replace(/['’‘`´^ʻʼʾʿ]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Normalises a composite city key to its primary city + country stem, stripping dataset prefixes,
 * parenthetical agglomeration tags, and semicolon-delimited secondary conurbations.
 *
 * @param {string} arg0_key - Composite city key
 *
 * @returns {string} Normalised primary key
 */
export let normalizePrimaryCityKey = function (arg0_key: string): string {
  //Convert from parameters
  let key = arg0_key

  //Guard clauses
  if (!key)
    return ''

  //Declare local instance variables
  let city_part: string
  let country: string
  let parts: string[]
  let primary_city: string
  let stripped: string

  //Function body
  stripped = key.replace(/^(stadester|ghsl|oxford)-/i, '')
  parts = stripped.split('-')
  country = parts.length > 1 ? parts[parts.length - 1] : ''
  city_part = parts.length > 1 ? parts.slice(0, parts.length - 1).join('-') : stripped
  primary_city = normalizeInvertedArticle(stripBracketedPostfixes(city_part.split(';')[0]))

  //Return statement
  return (primary_city + (country ? '-' + country : ''))
    .toLowerCase()
    .replace(/ł/g, 'l')
    .replace(/đ/g, 'd')
    .replace(/ø/g, 'o')
    .replace(/ß/g, 'ss')
    .replace(/['’‘`´^ʻʼʾʿ]/g, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Normalises a city alias or name for fuzzy counterpart matching by stripping diacritics, punctuation, parenthetical qualifiers, and standardising prefixes.
 *
 * @param {string} arg0_name - City alias or name string
 *
 * @returns {string} Normalised city alias string
 */
export let normalizeCityAlias = function (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return ''

  //Declare local instance variables
  let base: string

  //Function body
  base = normalizeInvertedArticle(stripBracketedPostfixes(String(name)))

  //Return statement
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bsaint\b/g, 'st')
    .replace(/\bfort\b/g, 'ft')
}

/**
 * Builds normalised alias and stem arrays from a city name and optional alias string/array.
 *
 * @param {string} [arg0_name]
 * @param {string | string[]} [arg1_other]
 *
 * @returns {AliasStemSet}
 */
export let buildAliasStemSet = function (
  arg0_name?: string,
  arg1_other?: string | string[]
): AliasStemSet {
  //Convert from parameters
  let name = arg0_name
  let other = arg1_other

  //Declare local instance variables
  let aliases: string[] = []
  let raw_list: string[] = []
  let stems: string[] = []

  //Function body
  if (name)
    raw_list.push(name)
  if (Array.isArray(other)) {
    raw_list.push(...other)
  } else if (typeof other === 'string') {
    raw_list.push(other)
  }

  for (let i = 0; i < raw_list.length; i++) {
    let a = normalizeCityAlias(raw_list[i] || '')
    let s = normalizeCapitalNameStem(raw_list[i] || '')
    if (a && !aliases.includes(a))
      aliases.push(a)
    if (s && !stems.includes(s))
      stems.push(s)
  }

  //Return statement
  return { aliases, stems }
}

/**
 * Checks whether a date string is one of the 5-year GHSL epoch markers (1975.1.1 .. 2025.1.1).
 *
 * @param {string} [arg0_date]
 *
 * @returns {boolean}
 */
export let isSyntheticGhslEpochDate = function (arg0_date?: string): boolean {
  //Convert from parameters
  let date_str = String(arg0_date || '').trim()

  //Return statement
  return SYNTHETIC_GHSL_EPOCHS.has(date_str)
}

/**
 * Returns true when a metadata entry is a single-entry 5-year GHSL epoch stub with no capital records.
 *
 * @param {CityMetadataEntry | null | undefined} arg0_meta
 *
 * @returns {boolean}
 */
export let isSyntheticGhslEpochStub = function (arg0_meta: CityMetadataEntry | null | undefined): boolean {
  //Convert from parameters
  let meta = arg0_meta

  //Declare local instance variables
  let has_capital: boolean
  let hn: HistoricalNameRecord[]

  //Guard clauses
  if (!meta)
    return false

  //Function body
  hn = Array.isArray(meta.historical_names) ? meta.historical_names : []
  if (hn.length !== 1)
    return false

  has_capital = Boolean(
    (meta.capital && Object.keys(meta.capital).length > 0) ||
    (meta.capitals && Object.keys(meta.capitals).length > 0) ||
    (meta.capital_records && meta.capital_records.length > 0)
  )
  if (has_capital)
    return false

  //Return statement
  return isSyntheticGhslEpochDate(hn[0]?.date)
}

/**
 * Checks whether two AliasStemSet records share a normalised alias or stem (minimum stem length 3).
 *
 * @param {AliasStemSet} arg0_source
 * @param {AliasStemSet} arg1_target
 *
 * @returns {boolean}
 */
export let matchesAliasStemSet = function (arg0_source: AliasStemSet, arg1_target: AliasStemSet): boolean {
  //Convert from parameters
  let source = arg0_source
  let target = arg1_target

  //Return statement
  return source.aliases.some((arg0_a) => target.aliases.includes(arg0_a)) ||
    source.stems.some((arg0_s) => arg0_s.length >= 3 && target.stems.includes(arg0_s))
}

