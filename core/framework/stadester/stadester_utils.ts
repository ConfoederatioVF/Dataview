import type { StadesterDisplayOptions } from '@framework/geopng/types.ts'
import { getPrimaryCityName, isCorruptedCityName, stripBracketedPostfixes } from './city_name_framework.ts'

/**
 * Counts the number of diacritical or non-ASCII characters in a given string.
 *
 * @param {string} arg0_str
 *
 * @returns {number}
 */
export let countDiacritics = function (arg0_str: string): number {
  //Convert from parameters
  let str = arg0_str

  //Guard clauses
  if (!str)
    return 0

  //Function body
  let matches = str.match(/[^\u0000-\u007F]/g)

  //Return statement
  return matches ? matches.length : 0
}

/**
 * Normalises a city name for phonetic and root comparison, stripping articles, stroke letters, and combining accents.
 *
 * @param {string} arg0_str
 *
 * @returns {string}
 */
export let normalizeForComparison = function (arg0_str: string): string {
  //Convert from parameters
  let str = arg0_str

  //Guard clauses
  if (!str)
    return ''

  //Function body
  let res = str.toLowerCase()
  res = res.replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ø/g, 'o').replace(/ß/g, 'ss')
  res = res.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  res = res.replace(/['’‘`´^]/g, '')
  res = res.replace(/[-_,.]/g, ' ')
  res = res.trim()
  res = res.replace(/^(al|el|ad|ar|as|at|az|an|ash|esh|ed|en|ez)\s+/i, '')
  res = res.replace(/iyah$/, 'iya').replace(/iyyah$/, 'iya').replace(/ah$/, 'a')
  res = res.replace(/\s+/g, ' ').trim()

  //Return statement
  return res
}

/**
 * Picks the optimal candidate city display name based on dataset display options.
 * Disqualifies unknown unicode characters (\uFFFD), removes parenthetical () and square-bracketed [] postfixes,
 * and prioritises authentic native diacritics unless prefer_least_diacritics is true.
 *
 * @param {string} arg0_name
 * @param {string | string[]} [arg1_other_names]
 * @param {StadesterDisplayOptions} [arg2_options]
 *
 * @returns {string}
 */
export let pickBestCityDisplayName = function (
  arg0_name: string,
  arg1_other_names?: string | string[],
  arg2_options?: StadesterDisplayOptions
): string {
  //Convert from parameters
  let name = arg0_name
  let options = (arg2_options) ? arg2_options : {}
  let other_names = arg1_other_names

  //Declare local instance variables
  let alt_candidates: string[] = []
  let candidate_index = new Map<string, number>()
  let candidates: string[] = []
  let clean_direct_name: string
  let has_other_names: boolean
  let prefer_least_diacritics = options.prefer_least_diacritics === true
  let primary_candidates: string[] = []
  let primary_norms = new Set<string>()
  let raw_alts: string[] = []
  let raw_primary: string[] = []
  let seen_lower = new Set<string>()
  let skip_unknown_unicode = options.skip_unknown_unicode !== false
  let strip_parentheses = options.strip_parentheses !== false

  //Guard clauses
  if (!name)
    return ''

  clean_direct_name = strip_parentheses ? stripBracketedPostfixes(name) : name.trim()
  has_other_names = (Array.isArray(other_names) && other_names.length > 0) || (typeof other_names === 'string' && other_names.trim().length > 0)

  if (!name.includes(';') && !has_other_names && clean_direct_name && !isCorruptedCityName(clean_direct_name))
    return clean_direct_name

  //Function body
  //1. Extract all semicolon-delimited names from primary name string
  raw_primary = name.split(';')
  for (let i = 0; i < raw_primary.length; i++) {
    let candidate = raw_primary[i].trim()
    if (!candidate)
      continue
    if (strip_parentheses)
      candidate = stripBracketedPostfixes(candidate)
    if (!candidate)
      continue
    if (skip_unknown_unicode && isCorruptedCityName(candidate))
      continue
    let low = candidate.toLowerCase()
    if (!seen_lower.has(low)) {
      seen_lower.add(low)
      primary_candidates.push(candidate)
      let norm_p = normalizeForComparison(candidate)
      if (norm_p)
        primary_norms.add(norm_p)
    }
  }

  //2. Extract alternative names (only accept matching phonetic forms unless primary was entirely corrupted)
  if (Array.isArray(other_names)) {
    for (let i = 0; i < other_names.length; i++) {
      if (other_names[i])
        raw_alts.push(...String(other_names[i]).split(';'))
    }
  } else if (typeof other_names === 'string' && other_names.trim()) {
    raw_alts.push(...other_names.split(';'))
  }

  for (let i = 0; i < raw_alts.length; i++) {
    let candidate = raw_alts[i].trim()
    if (!candidate)
      continue
    if (strip_parentheses)
      candidate = stripBracketedPostfixes(candidate)
    if (!candidate)
      continue
    if (skip_unknown_unicode && isCorruptedCityName(candidate))
      continue
    alt_candidates.push(candidate)
  }

  candidates = [...primary_candidates]
  if (primary_candidates.length > 0) {
    for (let i = 0; i < alt_candidates.length; i++) {
      let alt = alt_candidates[i]
      let low = alt.toLowerCase()
      if (seen_lower.has(low))
        continue
      let norm_alt = normalizeForComparison(alt)
      if (norm_alt && primary_norms.has(norm_alt)) {
        seen_lower.add(low)
        candidates.push(alt)
      }
    }
  } else {
    for (let i = 0; i < alt_candidates.length; i++) {
      let alt = alt_candidates[i]
      let low = alt.toLowerCase()
      if (!seen_lower.has(low)) {
        seen_lower.add(low)
        candidates.push(alt)
      }
    }
  }

  if (candidates.length === 0)
    return strip_parentheses ? stripBracketedPostfixes(name) : name

  //3. Select candidate: if prefer_least_diacritics is explicitly enabled, sort by fewest diacritics
  // while preserving original order on ties; otherwise keep authentic accented equivalent matching base_norm.
  if (candidates.length > 1) {
    for (let i = 0; i < candidates.length; i++) {
      if (!candidate_index.has(candidates[i]))
        candidate_index.set(candidates[i], i)
    }

    if (prefer_least_diacritics) {
      candidates.sort((arg0_a, arg0_b) => {
        let count_a = countDiacritics(arg0_a)
        let count_b = countDiacritics(arg0_b)
        if (count_a !== count_b)
          return count_a - count_b
        return (candidate_index.get(arg0_a) ?? 0) - (candidate_index.get(arg0_b) ?? 0)
      })
    } else {
      let base_norm = normalizeForComparison(candidates[0])
      let best_candidate = candidates[0]
      let best_score = countDiacritics(best_candidate)

      for (let i = 1; i < candidates.length; i++) {
        let cand = candidates[i]
        let cand_norm = normalizeForComparison(cand)
        if (cand_norm === base_norm) {
          let score = countDiacritics(cand)
          if (score > best_score) {
            best_score = score
            best_candidate = cand
          }
        }
      }

      if (best_candidate !== candidates[0]) {
        let idx = candidates.indexOf(best_candidate)
        if (idx > 0) {
          candidates.splice(idx, 1)
          candidates.unshift(best_candidate)
        }
      }
    }
  }

  //Return statement
  let chosen = candidates[0]
  if (chosen && !isCorruptedCityName(chosen))
    return chosen

  let fallback = getPrimaryCityName(name)
  return strip_parentheses ? stripBracketedPostfixes(fallback) : fallback
}
