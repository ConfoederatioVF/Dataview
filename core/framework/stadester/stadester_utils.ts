import { StadesterDisplayOptions } from '@framework/geopng/types.ts'
import { getPrimaryCityName, isCorruptedCityName } from './city_name_framework.ts'

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
 * Disqualifies unknown unicode characters (\uFFFD), removes parenthetical notes,
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
  let candidates: string[] = []
  let clean_candidates: string[]
  let clean_direct_name: string
  let has_other_names: boolean
  let prefer_least_diacritics = options.prefer_least_diacritics === true
  let raw_candidates: string[] = []
  let skip_unknown_unicode = options.skip_unknown_unicode !== false
  let strip_parentheses = options.strip_parentheses !== false

  //Guard clauses
  if (!name)
    return ''

  clean_direct_name = strip_parentheses ? name.replace(/\s*\([^)]*\)/g, '').trim() : name.trim()
  has_other_names = (Array.isArray(other_names) && other_names.length > 0) || (typeof other_names === 'string' && other_names.trim().length > 0)

  if (!name.includes(';') && !has_other_names && clean_direct_name && !isCorruptedCityName(clean_direct_name))
    return clean_direct_name

  //Function body
  //1. Extract all semicolon-delimited names from primary name string
  raw_candidates = name.split(';')

  //2. Append any alternative names
  if (Array.isArray(other_names)) {
    for (let i = 0; i < other_names.length; i++) {
      if (other_names[i])
        raw_candidates.push(...String(other_names[i]).split(';'))
    }
  } else if (typeof other_names === 'string' && other_names.trim()) {
    raw_candidates.push(...other_names.split(';'))
  }

  //3. Clean candidate strings and strip round bracket notes if enabled
  for (let i = 0; i < raw_candidates.length; i++) {
    let candidate = raw_candidates[i].trim()
    if (!candidate)
      continue

    if (strip_parentheses) {
      //Remove everything inside round brackets e.g. "Kabul (agglomeration)" -> "Kabul"
      candidate = candidate.replace(/\s*\([^)]*\)/g, '').trim()
    }

    if (candidate)
      candidates.push(candidate)
  }

  if (candidates.length === 0)
    return strip_parentheses ? name.replace(/\s*\([^)]*\)/g, '').trim() : name

  //4. Filter out candidates with corrupt or unknown unicode characters
  if (skip_unknown_unicode) {
    clean_candidates = candidates.filter((arg0_c) => {
      let is_corrupted =
        arg0_c.includes('?') ||
        arg0_c.includes('\uFFFD') ||
        arg0_c.includes('\u00EF\u00BF\u00BD') ||
        arg0_c.includes('') ||
        /^[?\s\-_.,]+$/.test(arg0_c)
      return !is_corrupted
    })
    if (clean_candidates.length > 0)
      candidates = clean_candidates
  }

  //5. Select candidate: if prefer_least_diacritics is explicitly enabled, sort by fewest diacritics.
  // Otherwise, prioritize authentic native accented candidates matching the base name over stripped ASCII.
  if (candidates.length > 1) {
    if (prefer_least_diacritics) {
      candidates.sort((arg0_a, arg0_b) => {
        let count_a = countDiacritics(arg0_a)
        let count_b = countDiacritics(arg0_b)
        if (count_a !== count_b)
          return count_a - count_b
        return arg0_a.length - arg0_b.length
      })
    } else {
      let base_norm = normalizeForComparison(candidates[0])
      let best_candidate = candidates[0]
      let best_score = countDiacritics(best_candidate)

      for (let i = 1; i < candidates.length; i++) {
        let cand = candidates[i]
        let cand_norm = normalizeForComparison(cand)
        if (cand_norm === base_norm || cand_norm.includes(base_norm) || base_norm.includes(cand_norm)) {
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

  return getPrimaryCityName(name)
}
