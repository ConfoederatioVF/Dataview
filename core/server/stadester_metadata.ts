import fs from 'fs'
import path from 'path'
import { FilepathDefines } from './filepath_defines.ts'
import { clearStateCapitalsCache } from './stadester_capitals.ts'
import { getDefaultStadesterDatasetId, resolveStadesterVersionPaths } from './stadester_config_loader.ts'
import { cleanCandidateCityString, isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  computeHaversineDistanceKm,
  normalizeCapitalNameStem,
  normalizeCityAlias,
  normalizeMetadataEntry,
  parseYearMonthDay,
  resolveHistoricalCityName,
  type CityMetadataEntry,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'
import {
  mergeCityCapitalRecords,
  mergeCityOtherNames,
  type CityIndexEntry,
} from './stadester_types.ts'

export {
  applyStateCapitals,
  clearStateCapitalsCache,
  getCityCapitalColorAtYear,
  getStateById,
  getStateCapitals,
  isCityCapitalAtYear,
  isStateAcapital,
} from './stadester_capitals.ts'

let city_metadata_cache_by_path = new Map<string, { entries: CityMetadataEntry[]; mtime_ms: number }>()
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

interface AliasStemSet {
  aliases: string[]
  stems: string[]
}

interface BindingStateEntry {
  has_modern_entry: boolean
  has_name_match: boolean
  has_primary_name_match: boolean
  max_hn_year: number
}

/**
 * Applies per-version city metadata to indexed cities.
 *
 * @param {Record<string, CityIndexEntry>} arg0_indexed_record
 * @param {string} [arg1_dataset_name='stadester_2.0']
 *
 * @returns {void}
 */
export function applyCityMetadata (arg0_indexed_record: Record<string, CityIndexEntry>, arg1_dataset_name?: string): void {
  //Convert from parameters
  let dataset_name = (arg1_dataset_name) ? arg1_dataset_name : getDefaultStadesterDatasetId()
  let indexed = arg0_indexed_record

  //Declare local instance variables
  let all_keys = Object.keys(indexed)
  let binding_state = new Map<string, BindingStateEntry>()
  let city_alias_cache = new Map<string, AliasStemSet>()
  let meta_list = loadCityMetadata(dataset_name)
  let primary_alias_cache = new Map<string, AliasStemSet>()
  let raw_city_name_by_key = new Map<string, string>()
  let spatial_grid: Record<string, CityIndexEntry[]> = {}

  //Guard clauses
  if (!meta_list || meta_list.length === 0 || all_keys.length === 0)
    return

  //Function body
  for (let x = 0; x < all_keys.length; x++) {
    let city = indexed[all_keys[x]]
    raw_city_name_by_key.set(city.key, city.name || '')
    if (city.coords && Array.isArray(city.coords)) {
      let bin_lat = Math.floor(city.coords[0])
      let bin_lng = Math.floor(city.coords[1])
      let bin_key = `${bin_lat},${bin_lng}`
      if (!spatial_grid[bin_key])
        spatial_grid[bin_key] = []
      spatial_grid[bin_key].push(city)
    }
  }

  let getCachedCityAliases = function (arg0_city: CityIndexEntry): AliasStemSet {
    let cache_k = arg0_city.key
    let cached = city_alias_cache.get(cache_k)
    if (cached)
      return cached
    let built = buildAliasSet(arg0_city.name, arg0_city.other_names)
    city_alias_cache.set(cache_k, built)
    return built
  }

  let getCachedPrimaryAliases = function (arg0_city: CityIndexEntry): AliasStemSet {
    let cache_k = arg0_city.key
    let cached = primary_alias_cache.get(cache_k)
    if (cached)
      return cached
    let built = buildPrimaryNameSet(arg0_city, raw_city_name_by_key.get(cache_k))
    primary_alias_cache.set(cache_k, built)
    return built
  }

  for (let i = 0; i < meta_list.length; i++) {
    let best_alias_named_city: CityIndexEntry | null = null
    let best_city: CityIndexEntry | null = null
    let best_exact_city: CityIndexEntry | null = null
    let best_meta_name_primary_city: CityIndexEntry | null = null
    let best_primary_named_city: CityIndexEntry | null = null
    let meta = meta_list[i]
    let meta_alias_info = buildAliasSet(meta.name, (meta as any).other_names)
    let meta_name_info = buildAliasSet(meta.name)
    let min_alias_named_dist = 999999
    let min_dist = 999999
    let min_exact_dist = 999999
    let min_meta_name_primary_dist = 999999
    let min_primary_named_dist = 999999
    let target_lat = meta.coords[1]
    let target_lng = meta.coords[0]
    let has_meta_name_primary_within_50km = false

    if (meta.key && indexed[meta.key]) {
      best_city = indexed[meta.key]
      min_dist = 0
    }

    let center_lat = Math.floor(target_lat)
    let center_lng = Math.floor(target_lng)

    for (let d_lat = -1; d_lat <= 1; d_lat++) {
      for (let d_lng = -1; d_lng <= 1; d_lng++) {
        let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
        if (!cell)
          continue

        for (let c = 0; c < cell.length; c++) {
          let candidate = cell[c]
          let dist = computeHaversineDistanceKm(candidate.coords[0], candidate.coords[1], target_lat, target_lng)
          if (dist <= 0.1 && dist < min_exact_dist) {
            min_exact_dist = dist
            best_exact_city = candidate
          }
          if (dist <= 50) {
            let cand_all = getCachedCityAliases(candidate)
            let cand_primary = getCachedPrimaryAliases(candidate)
            let meta_name_primary_hit = matchesAliasSet(meta_name_info, cand_primary)
            let primary_hit = meta_name_primary_hit || matchesAliasSet(meta_alias_info, cand_primary)
            let alias_only_hit = !primary_hit && matchesAliasSet(meta_alias_info, cand_all)

            if (meta_name_primary_hit) {
              has_meta_name_primary_within_50km = true
              if (dist < min_meta_name_primary_dist) {
                min_meta_name_primary_dist = dist
                best_meta_name_primary_city = candidate
              }
            }
            if (primary_hit && dist < min_primary_named_dist) {
              min_primary_named_dist = dist
              best_primary_named_city = candidate
            } else if (alias_only_hit && dist < min_alias_named_dist) {
              min_alias_named_dist = dist
              best_alias_named_city = candidate
            }
          }
        }
      }
    }

    if (!best_city) {
      if (best_meta_name_primary_city) {
        best_city = best_meta_name_primary_city
        min_dist = min_meta_name_primary_dist
      } else if (best_primary_named_city) {
        best_city = best_primary_named_city
        min_dist = min_primary_named_dist
      } else if (best_alias_named_city && !has_meta_name_primary_within_50km) {
        best_city = best_alias_named_city
        min_dist = min_alias_named_dist
      } else if (best_exact_city) {
        best_city = best_exact_city
        min_dist = min_exact_dist
      }
    }

    if (!best_city || min_dist > 50)
      continue

    let best_all_info = getCachedCityAliases(best_city)
    let best_primary_info = getCachedPrimaryAliases(best_city)
    let is_exact_coord_match = min_dist <= 0.1
    let is_primary_name_match = matchesAliasSet(meta_alias_info, best_primary_info)
    let is_alias_only_match = !is_primary_name_match && matchesAliasSet(meta_alias_info, best_all_info)
    let is_name_match = is_primary_name_match || is_alias_only_match

    if (!is_exact_coord_match && !is_name_match)
      continue
    if (is_alias_only_match && has_meta_name_primary_within_50km)
      continue

    let meta_max_year = -9999
    for (let h = 0; h < (meta.historical_names || []).length; h++) {
      let yf = meta.historical_names[h].year_frac
      if (yf > meta_max_year)
        meta_max_year = yf
    }
    for (let c_i = 0; c_i < (meta.capital_records || []).length; c_i++) {
      let yf = meta.capital_records![c_i].year_frac
      if (yf > meta_max_year)
        meta_max_year = yf
    }

    let meta_is_modern = meta_max_year >= 1700
    let prev_binding = binding_state.get(best_city.key)

    //Once a city is matched by primary name, block subsequent unrelated non-primary metadata entries even at <= 0.1 km
    if (!is_name_match && prev_binding?.has_primary_name_match)
      continue
    if (!is_name_match && prev_binding?.has_name_match) {
      if (meta_max_year < -9000 || (prev_binding.has_modern_entry && meta_is_modern))
        continue
    }

    let is_best_corrupted = isCorruptedCityName(best_city.name || '')
    let is_displaced_neighbour = !is_primary_name_match && Boolean(meta.name) &&
      doesLabelMatchAnotherNearbyCity(best_city, meta.name!, spatial_grid, raw_city_name_by_key, primary_alias_cache, 25)
    let is_synthetic_stub = isSyntheticGhslEpochStub(meta)

    if (!is_name_match && is_displaced_neighbour)
      continue

    let can_overwrite_name = Boolean(
      meta.name &&
      !best_city.key.startsWith('ghsl-') &&
      (is_exact_coord_match || min_dist <= 15) &&
      (is_best_corrupted || (!is_alias_only_match && !is_synthetic_stub && !is_displaced_neighbour))
    )
    let should_set_name = false

    if (can_overwrite_name) {
      if (!prev_binding) {
        should_set_name = true
      } else if (prev_binding.has_primary_name_match && !is_primary_name_match) {
        should_set_name = false
      } else if (is_primary_name_match && !prev_binding.has_primary_name_match) {
        should_set_name = true
      } else if (is_name_match && !prev_binding.has_name_match) {
        should_set_name = true
      } else if (is_name_match && meta_max_year >= prev_binding.max_hn_year && !(prev_binding.has_modern_entry && meta_max_year < 1700)) {
        should_set_name = true
      }
    }

    let meta_extra_aliases: string[] = []
    if (meta.name)
      meta_extra_aliases.push(meta.name)
    if (Array.isArray((meta as any).other_names))
      meta_extra_aliases.push(...(meta as any).other_names)
    if (meta.historical_names) {
      for (let h = 0; h < meta.historical_names.length; h++)
        meta_extra_aliases.push(meta.historical_names[h].name)
    }

    if (should_set_name && meta.name) {
      if (
        best_city.name &&
        best_city.name !== meta.name &&
        !isCorruptedCityName(best_city.name) &&
        !doesLabelMatchAnotherNearbyCity(best_city, best_city.name, spatial_grid, raw_city_name_by_key, primary_alias_cache, 25)
      ) {
        meta_extra_aliases.push(best_city.name)
      }
      best_city.name = meta.name
      best_city.metadata_name = meta.name
      city_alias_cache.delete(best_city.key)
      primary_alias_cache.delete(best_city.key)
    }

    let allow_hist_merge = is_primary_name_match ||
      (!prev_binding?.has_primary_name_match && !is_displaced_neighbour && (is_name_match || (!prev_binding?.has_name_match && !meta_is_modern)))
    let allow_other_merge = is_primary_name_match ||
      (!prev_binding?.has_primary_name_match && !is_displaced_neighbour && (is_name_match || !prev_binding?.has_name_match))

    if (allow_other_merge) {
      mergeCityOtherNames(best_city, meta_extra_aliases)
      city_alias_cache.delete(best_city.key)
    }

    if (meta.historical_names && meta.historical_names.length > 0 && allow_hist_merge)
      best_city.historical_names = mergeHistoricalNames(best_city.historical_names, meta.historical_names)

    binding_state.set(best_city.key, {
      has_modern_entry: Boolean(prev_binding?.has_modern_entry || (is_name_match && meta_is_modern)),
      has_name_match: Boolean(prev_binding?.has_name_match || is_name_match),
      has_primary_name_match: Boolean(prev_binding?.has_primary_name_match || is_primary_name_match),
      max_hn_year: Math.max(prev_binding?.max_hn_year ?? -9999, (is_primary_name_match || !prev_binding?.has_primary_name_match) ? meta_max_year : -9999),
    })

    if (!is_displaced_neighbour || is_primary_name_match)
      mergeCityCapitalRecords(best_city, meta)

    let refreshed_best_primary = getCachedPrimaryAliases(best_city)

    for (let d_lat = -1; d_lat <= 1; d_lat++) {
      for (let d_lng = -1; d_lng <= 1; d_lng++) {
        let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
        if (!cell)
          continue

        for (let c = 0; c < cell.length; c++) {
          let other = cell[c]
          if (other.key === best_city.key)
            continue

          let dist = computeHaversineDistanceKm(other.coords[0], other.coords[1], target_lat, target_lng)
          if (dist > 25)
            continue

          let other_own_name = cleanCandidateCityString(String(other.name || '').split(';')[0])
          let other_raw_name = cleanCandidateCityString(String(raw_city_name_by_key.get(other.key) || '').split(';')[0])
          let other_own_info = buildAliasSet(
            other_own_name,
            (other_raw_name && other_raw_name !== other_own_name) ? [other_raw_name] : undefined
          )

          let is_era_counterpart = Boolean(
            ((best_city.key.startsWith('stadester-') && other.key.startsWith('ghsl-')) ||
             (best_city.key.startsWith('ghsl-') && other.key.startsWith('stadester-'))) &&
            matchesAliasSet(other_own_info, refreshed_best_primary)
          )

          let is_agg_flag = Boolean(
            other.is_agglomeration ||
            /\(agglomeration\??\)/i.test(other.key || '') ||
            /\(agglomeration\??\)/i.test(other.name || '')
          )
          let is_period_split = Boolean(
            /\(\d{3,4}[–-]\d{3,4}\)/.test(other.name || '') ||
            /\(\d{3,4}[–-]\d{3,4}\)/.test(other.key || '')
          )
          let agg_of_info = other.is_agglomeration_of ? buildAliasSet(other.is_agglomeration_of) : null
          let matches_best_primary = matchesAliasSet(other_own_info, refreshed_best_primary) ||
            Boolean(agg_of_info && matchesAliasSet(agg_of_info, refreshed_best_primary))
          let is_agg_or_period_counterpart = Boolean(
            matches_best_primary &&
            ((is_agg_flag && dist <= 25) || (is_period_split && dist <= 15))
          )

          if (!is_era_counterpart && !is_agg_or_period_counterpart)
            continue

          let prev_other = binding_state.get(other.key)
          let other_extra_aliases = [...meta_extra_aliases]
          let other_is_corrupted = isCorruptedCityName(other.name || '')
          let can_rename_other = Boolean(
            dist <= 15 &&
            meta.name &&
            !other.key.startsWith('ghsl-') &&
            (other_is_corrupted || (!is_alias_only_match && !is_synthetic_stub)) &&
            (!prev_other?.has_primary_name_match || is_primary_name_match) &&
            (!prev_other || (meta_max_year >= prev_other.max_hn_year && !(prev_other.has_modern_entry && meta_max_year < 1700)))
          )

          if (can_rename_other && meta.name) {
            if (other.name && other.name !== meta.name && !isCorruptedCityName(other.name))
              other_extra_aliases.push(other.name)
            other.name = meta.name
            other.metadata_name = meta.name
            primary_alias_cache.delete(other.key)
          }

          mergeCityOtherNames(other, other_extra_aliases)
          city_alias_cache.delete(other.key)

          if (meta.historical_names && meta.historical_names.length > 0 && (!prev_other?.has_primary_name_match || is_primary_name_match))
            other.historical_names = mergeHistoricalNames(other.historical_names, meta.historical_names)

          binding_state.set(other.key, {
            has_modern_entry: Boolean(prev_other?.has_modern_entry || meta_is_modern),
            has_name_match: true,
            has_primary_name_match: Boolean(prev_other?.has_primary_name_match || is_primary_name_match),
            max_hn_year: Math.max(prev_other?.max_hn_year ?? -9999, meta_max_year),
          })
          mergeCityCapitalRecords(other, meta)
        }
      }
    }
  }

  //Post-pass: ensure modern cities with post-1950 populations resolve to their latest modern metadata name
  for (let i = 0; i < all_keys.length; i++) {
    let city = indexed[all_keys[i]]
    if (!city || city.key.startsWith('ghsl-'))
      continue

    if ((city.max_year ?? 0) >= 1950 && city.historical_names && city.historical_names.length > 0) {
      let last_hn = city.historical_names[city.historical_names.length - 1]
      let last_stem = normalizeCapitalNameStem(last_hn.name || '')
      let name_stem = normalizeCapitalNameStem(city.name || '')

      if (last_hn.name && !isCorruptedCityName(last_hn.name) && last_stem !== name_stem) {
        let city_alias = normalizeCityAlias(city.name || '')
        let has_earlier_match = city.historical_names.slice(0, -1).some((arg0_h) => {
          let h_alias = normalizeCityAlias(arg0_h.name || '')
          return normalizeCapitalNameStem(arg0_h.name || '') === name_stem ||
            (Boolean(city_alias) && Boolean(h_alias) && h_alias === city_alias)
        })
        let raw_name = raw_city_name_by_key.get(city.key) || ''
        let raw_alias = normalizeCityAlias(raw_name)
        let last_alias = normalizeCityAlias(last_hn.name || '')
        let raw_matched_last = Boolean(
          (last_stem && normalizeCapitalNameStem(raw_name) === last_stem) ||
          (last_alias && raw_alias && raw_alias === last_alias)
        )

        if (has_earlier_match || raw_matched_last) {
          let old_name = city.name
          if (
            old_name &&
            !isCorruptedCityName(old_name) &&
            !doesLabelMatchAnotherNearbyCity(city, old_name, spatial_grid, raw_city_name_by_key, primary_alias_cache, 25)
          ) {
            mergeCityOtherNames(city, [old_name])
          }
          city.name = last_hn.name
        }
      }
    }

    if (city.metadata_name || binding_state.has(city.key)) {
      city.metadata_name = city.name
      city.reconciled_name = city.name
      city.ghsl_name = city.name
    }
  }

  console.log(`[StadesterMetadata] Successfully bound ${meta_list.length} historical city metadata entries.`)
}


/**
 * Builds normalised alias and stem arrays from a name and optional alias string/array.
 *
 * @param {string} [arg0_name]
 * @param {string | string[]} [arg1_other]
 *
 * @returns {AliasStemSet}
 */
function buildAliasSet (arg0_name?: string, arg1_other?: string | string[]): AliasStemSet {
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
 * Builds normalised alias and stem arrays solely from a city's primary name, pre-metadata name, and primary key stem.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {string} [arg1_raw_name]
 *
 * @returns {AliasStemSet}
 */
function buildPrimaryNameSet (arg0_city: CityIndexEntry, arg1_raw_name?: string): AliasStemSet {
  //Convert from parameters
  let city = arg0_city
  let raw_name = arg1_raw_name

  //Declare local instance variables
  let candidates: string[] = []

  //Function body
  if (city.name) {
    let primary_clean = cleanCandidateCityString(String(city.name).split(';')[0])
    if (primary_clean)
      candidates.push(primary_clean)
  }
  if (raw_name) {
    let raw_clean = cleanCandidateCityString(String(raw_name).split(';')[0])
    if (raw_clean)
      candidates.push(raw_clean)
  }
  if (city.key) {
    let stripped = String(city.key).replace(/^(stadester|ghsl|oxford)-/i, '')
    let parts = stripped.split('-')
    let city_part = parts.length > 1 ? parts.slice(0, parts.length - 1).join('-') : stripped
    let key_primary = city_part.split(';')[0].replace(/\s*\([^)]*\)/g, '').trim()
    if (key_primary && !/^\d+$/.test(key_primary))
      candidates.push(key_primary)
  }

  //Return statement
  return buildAliasSet(undefined, candidates)
}


/**
 * Clears all cached per-version city metadata and state capital registries from memory.
 *
 * @returns {void}
 */
export function clearCityMetadataCache (): void {
  //Function body
  city_metadata_cache_by_path.clear()
  clearStateCapitalsCache()
}


/**
 * Checks whether a candidate displaced label matches another nearby city's primary name within the given radius.
 *
 * @param {CityIndexEntry} arg0_city
 * @param {string} arg1_label
 * @param {Record<string, CityIndexEntry[]>} arg2_spatial_grid
 * @param {Map<string, string>} arg3_raw_city_name_by_key
 * @param {Map<string, AliasStemSet>} arg4_primary_alias_cache
 * @param {number} [arg5_radius_km=25]
 *
 * @returns {boolean}
 */
function doesLabelMatchAnotherNearbyCity (
  arg0_city: CityIndexEntry,
  arg1_label: string,
  arg2_spatial_grid: Record<string, CityIndexEntry[]>,
  arg3_raw_city_name_by_key: Map<string, string>,
  arg4_primary_alias_cache: Map<string, AliasStemSet>,
  arg5_radius_km: number = 25
): boolean {
  //Convert from parameters
  let city = arg0_city
  let label = arg1_label
  let primary_alias_cache = arg4_primary_alias_cache
  let radius_km = arg5_radius_km
  let raw_city_name_by_key = arg3_raw_city_name_by_key
  let spatial_grid = arg2_spatial_grid

  //Guard clauses
  if (!city || !city.coords || !label || isCorruptedCityName(label))
    return false

  //Declare local instance variables
  let center_lat = Math.floor(city.coords[0])
  let center_lng = Math.floor(city.coords[1])
  let label_set = buildAliasSet(label)
  let self_raw = raw_city_name_by_key.get(city.key) || city.name || ''
  let self_raw_set = buildAliasSet(cleanCandidateCityString(self_raw.split(';')[0]))

  //Function body
  if (label_set.aliases.length === 0 && label_set.stems.length === 0)
    return false

  if (matchesAliasSet(label_set, self_raw_set))
    return false

  for (let d_lat = -1; d_lat <= 1; d_lat++) {
    for (let d_lng = -1; d_lng <= 1; d_lng++) {
      let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
      if (!cell)
        continue

      for (let i = 0; i < cell.length; i++) {
        let other = cell[i]
        if (!other || other.key === city.key || !other.coords)
          continue

        let dist = computeHaversineDistanceKm(other.coords[0], other.coords[1], city.coords[0], city.coords[1])
        if (dist > radius_km)
          continue

        let other_primary = primary_alias_cache.get(other.key)
        if (!other_primary) {
          other_primary = buildPrimaryNameSet(other, raw_city_name_by_key.get(other.key))
          primary_alias_cache.set(other.key, other_primary)
        }
        if (matchesAliasSet(label_set, other_primary))
          return true
      }
    }
  }

  //Return statement
  return false
}


/**
 * Checks whether a date string is one of the 5-year GHSL epoch markers (1975.1.1 .. 2025.1.1).
 *
 * @param {string} [arg0_date]
 *
 * @returns {boolean}
 */
function isSyntheticGhslEpochDate (arg0_date?: string): boolean {
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
export function isSyntheticGhslEpochStub (arg0_meta: CityMetadataEntry | null | undefined): boolean {
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
 * Loads and normalises city metadata from the resolved per-version city_metadata.json into memory.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 *
 * @returns {CityMetadataEntry[]}
 */
export function loadCityMetadata (arg0_dataset_name?: string): CityMetadataEntry[] {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cached_entry: { entries: CityMetadataEntry[]; mtime_ms: number } | undefined
  let file_path = resolveCityMetadataPath(dataset_name)
  let normalized_list: CityMetadataEntry[] = []

  //Guard clauses
  if (!fs.existsSync(file_path))
    return []

  try {
    let stats = fs.statSync(file_path)
    cached_entry = city_metadata_cache_by_path.get(file_path)
    if (cached_entry && stats.mtimeMs <= cached_entry.mtime_ms)
      return cached_entry.entries

    //Function body
    let content = fs.readFileSync(file_path, 'utf-8')
    let raw_json = JSON.parse(content)

    if (Array.isArray(raw_json)) {
      for (let i = 0; i < raw_json.length; i++) {
        let item = normalizeMetadataEntry(raw_json[i])
        if (item)
          normalized_list.push(item)
      }
    } else if (raw_json && typeof raw_json === 'object') {
      let keys = Object.keys(raw_json)
      for (let i = 0; i < keys.length; i++) {
        let item = normalizeMetadataEntry(raw_json[keys[i]], keys[i])
        if (item)
          normalized_list.push(item)
      }
    }

    city_metadata_cache_by_path.set(file_path, {
      entries: normalized_list,
      mtime_ms: stats.mtimeMs,
    })
    console.log(`[StadesterMetadata] Loaded ${normalized_list.length} city metadata entries from ${file_path}`)
    return normalized_list
  } catch (arg0_err) {
    console.warn(`[StadesterMetadata] Failed to load ${file_path}:`, arg0_err)
    cached_entry = city_metadata_cache_by_path.get(file_path)
    return cached_entry ? cached_entry.entries : []
  }
}


/**
 * Checks whether two AliasStemSet records share a normalised alias or stem (minimum stem length 3).
 *
 * @param {AliasStemSet} arg0_source
 * @param {AliasStemSet} arg1_target
 *
 * @returns {boolean}
 */
function matchesAliasSet (arg0_source: AliasStemSet, arg1_target: AliasStemSet): boolean {
  //Convert from parameters
  let source = arg0_source
  let target = arg1_target

  //Return statement
  return source.aliases.some((arg0_a) => target.aliases.includes(arg0_a)) ||
    source.stems.some((arg0_s) => arg0_s.length >= 3 && target.stems.includes(arg0_s))
}


/**
 * Merges two historical name records chronologically, preserving rich multi-entry timelines.
 * Ensures that modern placeholder entries (e.g. single 5-year GHSL epoch stubs) never overwrite earlier historical names.
 *
 * @param {HistoricalNameRecord[]} [arg0_existing]
 * @param {HistoricalNameRecord[]} [arg1_incoming]
 *
 * @returns {HistoricalNameRecord[]}
 */
export function mergeHistoricalNames (
  arg0_existing?: HistoricalNameRecord[],
  arg1_incoming?: HistoricalNameRecord[]
): HistoricalNameRecord[] {
  //Convert from parameters
  let existing = arg0_existing
  let incoming = arg1_incoming

  //Guard clauses
  if (!incoming || incoming.length === 0)
    return existing || []
  if (!existing || existing.length === 0)
    return incoming

  //Declare local instance variables
  let all_records: HistoricalNameRecord[]
  let existing_min_year = 9999
  let incoming_min_year = 9999
  let is_existing_epoch_stub = existing.length === 1 && isSyntheticGhslEpochDate(existing[0]?.date)
  let is_incoming_epoch_stub = incoming.length === 1 && isSyntheticGhslEpochDate(incoming[0]?.date)
  let merged_timeline: HistoricalNameRecord[] = []

  //Function body
  for (let i = 0; i < existing.length; i++) {
    let y = (existing[i].year_frac !== undefined && existing[i].year_frac !== null)
      ? existing[i].year_frac
      : parseYearMonthDay(existing[i].date).year_frac
    if (y < existing_min_year)
      existing_min_year = y
  }
  for (let i = 0; i < incoming.length; i++) {
    let y = (incoming[i].year_frac !== undefined && incoming[i].year_frac !== null)
      ? incoming[i].year_frac
      : parseYearMonthDay(incoming[i].date).year_frac
    if (y < incoming_min_year)
      incoming_min_year = y
  }

  if (is_incoming_epoch_stub && existing.length >= 1 && existing_min_year < incoming_min_year)
    return existing
  if (is_existing_epoch_stub && incoming.length >= 1 && incoming_min_year < existing_min_year)
    return incoming

  if (existing.length > 1 && incoming.length === 1 && incoming_min_year >= 1900 && existing_min_year < 1900)
    return existing

  if (incoming.length > 1 && existing.length === 1 && existing_min_year >= 1900 && incoming_min_year < 1900)
    return incoming

  all_records = [...existing, ...incoming]
  for (let i = 0; i < all_records.length; i++) {
    if (all_records[i].year_frac === undefined || all_records[i].year_frac === null)
      all_records[i].year_frac = parseYearMonthDay(all_records[i].date).year_frac
  }
  all_records.sort((arg0_a, arg1_b) => arg0_a.year_frac - arg1_b.year_frac)

  for (let x = 0; x < all_records.length; x++) {
    let rec = all_records[x]
    let last = merged_timeline[merged_timeline.length - 1]

    if (last) {
      if (Math.abs(rec.year_frac - last.year_frac) < 0.05) {
        if (rec.date.length > last.date.length)
          merged_timeline[merged_timeline.length - 1] = rec
        continue
      }
      if (last.name.toLowerCase().trim() === rec.name.toLowerCase().trim())
        continue
    }

    merged_timeline.push(rec)
  }

  //Return statement
  return merged_timeline
}


/**
 * Resolves the filesystem path to the per-version city_metadata.json file for a given Stadestér dataset.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 *
 * @returns {string}
 */
export function resolveCityMetadataPath (arg0_dataset_name?: string): string {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let configured = resolveStadesterVersionPaths(dataset_name)
  let defines = FilepathDefines.get()
  let filepaths = defines.filepaths || {}
  let l_stad = (defines.root_folders && defines.root_folders.l_stad) ? defines.root_folders.l_stad : './data/stadester'
  let versioned_path = path.join(l_stad, clean_stem, 'city_metadata.json')

  //Function body
  if (configured.metadata_path && fs.existsSync(configured.metadata_path))
    return configured.metadata_path
  if (configured.path) {
    let version_dir = configured.path.endsWith('.json') ? path.dirname(configured.path) : configured.path
    let derived_meta_path = path.join(version_dir, 'city_metadata.json')
    if (fs.existsSync(derived_meta_path))
      return derived_meta_path
  }
  if (fs.existsSync(versioned_path))
    return versioned_path

  let define_key = `${clean_stem.replace(/\./g, '_')}_metadata`
  if (filepaths[define_key] && fs.existsSync(filepaths[define_key]))
    return filepaths[define_key]

  if (filepaths.stadester_metadata && fs.existsSync(filepaths.stadester_metadata))
    return filepaths.stadester_metadata

  //Return statement
  return fs.existsSync(path.join(l_stad, 'city_metadata.json'))
    ? path.join(l_stad, 'city_metadata.json')
    : versioned_path
}


/**
 * Resolves a city's historical name at the specified year or date.
 *
 * @param {CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[]; ghsl_name?: string; reconciled_name?: string }} arg0_city
 * @param {number | string} [arg1_year]
 *
 * @returns {string}
 */
export function resolveCityNameAtYear (
  arg0_city: CityIndexEntry | { name: string; historical_names?: HistoricalNameRecord[]; ghsl_name?: string; reconciled_name?: string },
  arg1_year?: number | string
): string {
  //Convert from parameters
  let city = arg0_city
  let year = arg1_year

  //Guard clauses
  if (!city)
    return ''

  //Return statement
  return resolveHistoricalCityName(city, year)
}
