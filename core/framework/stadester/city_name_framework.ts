/**
 * City Name Framework: Consistent parsing, normalization, ranking, and resolution
 * for historical and modern urban agglomerations.
 */

export interface CityNameCandidate {
  cleanName: string
  hasSubordinateTerm: boolean
  isCorrupted: boolean
  originalText: string
  rank: number
}

/**
 * Checks whether a given string contains corrupted Unicode characters, question marks, or replacement glyphs.
 *
 * @param {string} arg0_str
 *
 * @returns {boolean}
 */
export let isCorruptedCityName = function (arg0_str: string): boolean {
  //Convert from parameters
  let str = arg0_str

  //Guard clauses
  if (!str || !str.trim())
    return true

  //Function body
  let trimmed = str.trim()
  if (trimmed === '0' || trimmed === 'Unknown' || trimmed === 'Settlement' || /^[?\s\-_.,]+$/.test(trimmed))
    return true

  if (trimmed.includes('?') || trimmed.includes('\uFFFD') || trimmed.includes('\u00EF\u00BF\u00BD'))
    return true

  //Return statement
  return false
}

/**
 * Checks whether a name contains subordinate district or administrative terms.
 *
 * @param {string} arg0_name
 *
 * @returns {boolean}
 */
export let isSubordinateDistrictName = function (arg0_name: string): boolean {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return false

  //Function body
  let district_terms = [
    'arrondissement',
    'borough',
    'county',
    'district',
    'locality',
    'new area',
    'prefecture',
    'subdistrict',
    'subprefecture',
    'suburb',
    'township',
    'ward',
    'zone',
  ]
  let lower = name.toLowerCase()

  for (let i = 0; i < district_terms.length; i++) {
    if (lower.includes(district_terms[i]))
      return true
  }

  //Return statement
  return false
}

/**
 * Strips parenthetical `(...)` and square-bracketed `[...]` postfixes and annotations from a city name.
 *
 * @param {string} arg0_name
 *
 * @returns {string}
 */
export let stripBracketedPostfixes = function (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return ''

  //Declare local instance variables
  let cleaned = String(name)
  let had_unclosed = false
  let prev: string

  //Function body
  for (let i = 0; i < 6; i++) {
    prev = cleaned
    cleaned = cleaned.replace(/\s*(?:\([^()]*\)|\[[^[\]]*\])/g, '')
    if (cleaned === prev)
      break
  }

  if (/[([]/.test(cleaned)) {
    let stripped_unclosed = cleaned.replace(/\s*[([]+[^)\]]*$/, '')
    if (stripped_unclosed !== cleaned) {
      had_unclosed = true
      cleaned = stripped_unclosed
    }
  }

  cleaned = cleaned.trim()
  if (had_unclosed)
    cleaned = cleaned.replace(/,\s*$/, '').trim()

  //Return statement
  return cleaned
}

/**
 * Cleans a candidate city string by stripping bracketed postfixes and dataset prefixes.
 *
 * @param {string} arg0_name
 *
 * @returns {string}
 */
export let cleanCandidateCityString = function (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name

  //Guard clauses
  if (!name)
    return ''

  //Function body
  let cleaned = stripBracketedPostfixes(name)
  cleaned = cleaned.replace(/^ghsl-/, '').replace(/^stadester-/, '').replace(/^oxford-/, '').trim()
  cleaned = cleaned.replace(/^-/, '').trim()

  //Return statement
  return cleaned
}

/**
 * Parses a raw name into an array of cleaned, ranked candidates from a semicolon-delimited list.
 *
 * @param {string} arg0_raw_name
 *
 * @returns {CityNameCandidate[]}
 */
export let parseDelimitedCandidates = function (arg0_raw_name: string): CityNameCandidate[] {
  //Convert from parameters
  let raw_name = arg0_raw_name

  //Declare local instance variables
  let candidate_records: CityNameCandidate[] = []
  let raw_parts: string[]

  //Guard clauses
  if (!raw_name)
    return []

  //Function body
  raw_parts = raw_name.split(';')

  for (let i = 0; i < raw_parts.length; i++) {
    let raw_part = raw_parts[i].trim()
    if (!raw_part)
      continue

    let cleaned = cleanCandidateCityString(raw_part)
    let is_corrupt = isCorruptedCityName(cleaned)
    let is_subordinate = isSubordinateDistrictName(cleaned)

    candidate_records.push({
      cleanName: cleaned,
      hasSubordinateTerm: is_subordinate,
      isCorrupted: is_corrupt,
      originalText: raw_part,
      rank: i,
    })
  }

  //Return statement
  return candidate_records
}

/**
 * Enforces single-city name constraint: extracts the primary clean city name from a raw name,
 * skipping corrupted candidates (like ????) and prioritizing major urban cores over districts.
 *
 * @param {string} arg0_raw_name
 * @param {number} [arg1_target_pop=0]
 *
 * @returns {string}
 */
export let getPrimaryCityName = function (arg0_raw_name: string, arg1_target_pop?: number): string {
  //Convert from parameters
  let raw_name = arg0_raw_name
  let target_pop = (arg1_target_pop !== undefined) ? arg1_target_pop : 0

  //Declare local instance variables
  let candidates = parseDelimitedCandidates(raw_name)

  //Guard clauses
  if (candidates.length === 0)
    return cleanCandidateCityString(raw_name)

  //1. Check candidate 0 (primary urban core)
  let cand_zero = candidates[0]
  if (!cand_zero.isCorrupted)
    return cand_zero.cleanName

  //2. If candidate 0 is corrupted (e.g. ???? or contains ?), look for first clean non-subordinate candidate
  for (let i = 1; i < candidates.length; i++) {
    let c = candidates[i]
    if (!c.isCorrupted && !c.hasSubordinateTerm)
      return c.cleanName
  }

  //3. If all non-subordinate candidates are corrupted, accept clean subordinate candidate for small settlements
  if (target_pop < 150000) {
    for (let i = 1; i < candidates.length; i++) {
      let c = candidates[i]
      if (!c.isCorrupted)
        return c.cleanName
    }
  }

  //4. Fallback to candidate 0's text without destroying characters
  return cand_zero.cleanName || cleanCandidateCityString(raw_name)
}

/**
 * Checks whether a city name or candidate string matches an entry in the bugged cities set.
 *
 * @param {string} arg0_name
 * @param {Set<string>} arg1_bugged_set
 *
 * @returns {boolean}
 */
export let isBuggedCityName = function (
  arg0_name: string,
  arg1_bugged_set: Set<string>
): boolean {
  //Convert from parameters
  let bugged_set = arg1_bugged_set
  let name = arg0_name

  //Guard clauses
  if (!name || !bugged_set || bugged_set.size === 0)
    return false

  //Function body
  let lower_name = name.toLowerCase().trim()
  let normalized_name = lower_name.replace(/[-~'`^]/g, ' ').replace(/\s+/g, ' ').trim()
  let stripped_name = lower_name.replace(/[`'’\-\s]/g, '')

  if (bugged_set.has(lower_name) || bugged_set.has(normalized_name) || bugged_set.has(stripped_name))
    return true

  //Check parts if semicolon delimited
  let parts = name.split(';')
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i].trim().toLowerCase()
    let p_norm = p.replace(/[-~'`^]/g, ' ').replace(/\s+/g, ' ').trim()
    let p_strip = p.replace(/[`'’\-\s]/g, '')
    if (bugged_set.has(p) || bugged_set.has(p_norm) || bugged_set.has(p_strip))
      return true
  }

  //Return statement
  return false
}

