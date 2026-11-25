import fs from 'fs'
import path from 'path'
import { FilepathDefines } from './filepath_defines.ts'
import { clearStateCapitalsCache } from './stadester_capitals.ts'
import { getDefaultStadesterDatasetId, resolveStadesterVersionPaths } from './stadester_config_loader.ts'
import { cleanCandidateCityString, isCorruptedCityName } from '../framework/stadester/city_name_framework.ts'
import {
  buildAliasStemSet,
  computeHaversineDistanceKm,
  isSyntheticGhslEpochDate,
  isSyntheticGhslEpochStub,
  matchesAliasStemSet,
  normalizeCapitalNameStem,
  normalizeMetadataEntry,
  parseYearMonthDay,
  resolveHistoricalCityName,
  type AliasStemSet,
  type CityMetadataEntry,
  type HistoricalNameRecord,
} from '../framework/stadester/city_metadata_framework.ts'
import {
  buildPrimaryCityNameSet,
  doesLabelMatchAnotherNearbyCity,
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
export { isSyntheticGhslEpochStub }

let city_metadata_cache_by_path = new Map<string, { entries: CityMetadataEntry[]; mtime_ms: number }>()

interface BindingStateEntry {
  dist_km: number
  has_modern_entry: boolean
  has_name_match: boolean
  has_primary_name_match: boolean
  is_capital_locked: boolean
  max_hn_year: number
}

/**
 * Drops `city_metadata/` overlay points (`00_capitals.json` Tier 0 first, then regional shards) directly onto
 * the nearest underlying settlement points. Eliminates fragile key/50 km homonym name overrides, locks Tier-0
 * capital identities onto their nearest underlying city proper, and simplifies overlapping histories at `[lng, lat]`.
 *
 * @param {any[]} arg0_entries
 * @param {string} [arg1_dataset_name='stadester_2.0']
 * @param {{ key_lookup?: (arg0_key: string) => any }} [arg2_options]
 *
 * @returns {number} Number of overlay points processed
 */
export function bindCityMetadataOverlay (
  arg0_entries: any[],
  arg1_dataset_name?: string,
  arg2_options?: { key_lookup?: (arg0_key: string) => any }
): number {
  //Convert from parameters
  let dataset_name = (arg1_dataset_name) ? arg1_dataset_name : getDefaultStadesterDatasetId()
  let entries = arg0_entries
  let options = (arg2_options) ? arg2_options : {}

  //Declare local instance variables
  let binding_state = new Map<string, BindingStateEntry>()
  let cells_per_degree = 4
  let city_alias_cache = new Map<string, AliasStemSet>()
  let dense_cluster_km = 2.5
  let meta_list = loadCityMetadata(dataset_name)
  let primary_alias_cache = new Map<string, AliasStemSet>()
  let raw_city_name_by_key = new Map<string, string>()
  let spatial_grid: Record<string, any[]> = {}

  //Guard clauses
  if (!meta_list || meta_list.length === 0 || !entries || entries.length === 0)
    return 0

  //Function body
  for (let i = 0; i < entries.length; i++) {
    let city = entries[i]
    if (!city || !city.key)
      continue
    raw_city_name_by_key.set(city.key, city.name || '')
    if (city.coords && Array.isArray(city.coords) && city.coords.length >= 2) {
      let bin_key = `${Math.floor(city.coords[0]*cells_per_degree)},${Math.floor(city.coords[1]*cells_per_degree)}`
      if (!spatial_grid[bin_key])
        spatial_grid[bin_key] = []
      spatial_grid[bin_key].push(city)
    }
  }

  let getCachedCityAliases = function (arg0_city: any): AliasStemSet {
    let cached = city_alias_cache.get(arg0_city.key)
    if (cached)
      return cached
    let built = buildAliasStemSet(arg0_city.name, arg0_city.other_names)
    city_alias_cache.set(arg0_city.key, built)
    return built
  }

  let getCachedPrimaryAliases = function (arg0_city: any): AliasStemSet {
    let cached = primary_alias_cache.get(arg0_city.key)
    if (cached)
      return cached
    let built = buildPrimaryCityNameSet(arg0_city, raw_city_name_by_key.get(arg0_city.key))
    primary_alias_cache.set(arg0_city.key, built)
    return built
  }

  let isMetroShell = function (arg0_city: any): boolean {
    return Boolean(
      arg0_city.is_agglomeration ||
      /\(agglomeration\??\)|\(metro\)/i.test(String(arg0_city.key || '')) ||
      /\(agglomeration\??\)|\(metro\)/i.test(String(arg0_city.name || ''))
    )
  }

  for (let i = 0; i < meta_list.length; i++) {
    let meta = meta_list[i]
    let target_lat = meta.coords[1]
    let target_lng = meta.coords[0]
    let is_cap_meta = Boolean(meta.is_capital_tier || (meta.capital_records && meta.capital_records.length > 0))
    let max_radius_km = is_cap_meta ? 15.0 : 10.0

    let meta_alias_info = buildAliasStemSet(meta.name, (meta as any).other_names)
    let meta_name_info = buildAliasStemSet(meta.name)
    let best_city: any = null
    let min_dist = 999999

    //Check direct key ONLY when spatially proximate (prevents cross-continent teleportation on key reuse)
    if (meta.key && options.key_lookup) {
      let keyed_cand = options.key_lookup(meta.key)
      if (keyed_cand && Array.isArray(keyed_cand.coords) && keyed_cand.coords.length >= 2) {
        let kd = computeHaversineDistanceKm(keyed_cand.coords[0], keyed_cand.coords[1], target_lat, target_lng)
        if (kd <= max_radius_km) {
          best_city = keyed_cand
          min_dist = kd
        }
      }
    }

    let center_lat = Math.floor(target_lat*cells_per_degree)
    let center_lng = Math.floor(target_lng*cells_per_degree)
    let deg_lat_bound = max_radius_km/111.0 + 0.02
    let deg_lon_bound = max_radius_km/(111.0*Math.max(0.2, Math.cos((target_lat*Math.PI)/180))) + 0.02
    let cell_radius_lat = Math.max(1, Math.ceil(deg_lat_bound*cells_per_degree))
    let cell_radius_lon = Math.max(1, Math.ceil(deg_lon_bound*cells_per_degree))

    let best_close_named: any = null
    let best_close_named_dist = 999999
    let best_close_any: any = null
    let best_close_any_dist = 999999
    let best_regional_named: any = null
    let best_regional_named_dist = 999999

    if (!best_city) {
      for (let d_lat = -cell_radius_lat; d_lat <= cell_radius_lat; d_lat++) {
        for (let d_lng = -cell_radius_lon; d_lng <= cell_radius_lon; d_lng++) {
          let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
          if (!cell)
            continue

          for (let c = 0; c < cell.length; c++) {
            let cand = cell[c]
            if (!cand.coords)
              continue
            if (Math.abs(cand.coords[0] - target_lat) > deg_lat_bound || Math.abs(cand.coords[1] - target_lng) > deg_lon_bound)
              continue

            let dist = computeHaversineDistanceKm(cand.coords[0], cand.coords[1], target_lat, target_lng)
            if (dist > max_radius_km)
              continue

            // Prefer persistent city_proper over metro agglomeration shells at the same coordinate
            let metro_pen = isMetroShell(cand) ? 2.0 : 0.0
            let eff_dist = dist + metro_pen
            let cand_primary = getCachedPrimaryAliases(cand)
            let cand_all = getCachedCityAliases(cand)
            let name_hit = matchesAliasStemSet(meta_name_info, cand_primary) ||
              matchesAliasStemSet(meta_alias_info, cand_primary) ||
              matchesAliasStemSet(meta_alias_info, cand_all)

            if (dist <= dense_cluster_km) {
              if (name_hit && eff_dist < best_close_named_dist) {
                best_close_named_dist = eff_dist
                best_close_named = cand
              }
              if (eff_dist < best_close_any_dist) {
                best_close_any_dist = eff_dist
                best_close_any = cand
              }
            } else if (name_hit && eff_dist < best_regional_named_dist) {
              best_regional_named_dist = eff_dist
              best_regional_named = cand
            } else if (is_cap_meta && eff_dist < best_close_any_dist) {
              best_close_any_dist = eff_dist
              best_close_any = cand
            }
          }
        }
      }

      if (best_close_named) {
        best_city = best_close_named
        min_dist = computeHaversineDistanceKm(best_city.coords[0], best_city.coords[1], target_lat, target_lng)
      } else if (best_close_any && computeHaversineDistanceKm(best_close_any.coords[0], best_close_any.coords[1], target_lat, target_lng) <= dense_cluster_km) {
        best_city = best_close_any
        min_dist = computeHaversineDistanceKm(best_city.coords[0], best_city.coords[1], target_lat, target_lng)
      } else if (best_regional_named) {
        best_city = best_regional_named
        min_dist = computeHaversineDistanceKm(best_city.coords[0], best_city.coords[1], target_lat, target_lng)
      } else if (is_cap_meta && best_close_any) {
        best_city = best_close_any
        min_dist = computeHaversineDistanceKm(best_city.coords[0], best_city.coords[1], target_lat, target_lng)
      }
    }

    if (!best_city || min_dist > max_radius_km)
      continue

    let prev_binding = binding_state.get(best_city.key)
    let best_primary_info = getCachedPrimaryAliases(best_city)
    let best_all_info = getCachedCityAliases(best_city)
    let is_primary_name_match = matchesAliasStemSet(meta_alias_info, best_primary_info)
    let is_name_match = is_primary_name_match || matchesAliasStemSet(meta_alias_info, best_all_info)
    let is_synthetic_stub = isSyntheticGhslEpochStub(meta)

    // Tier-0 Capital Lock:
    // 1. Non-capital overlay points NEVER overwrite a capital-locked settlement's name, history, or capitals.
    // 2. A farther neighbouring Tier-0 capital (e.g. Chalcedon 4,5 km from Istanbul, Letopolis 12 km from Cairo)
    //    NEVER hijacks an already-locked closer capital unless it matches the same city name or is strictly closer.
    if (prev_binding?.is_capital_locked) {
      if (!is_cap_meta) {
        if (is_name_match && Array.isArray((meta as any).other_names))
          mergeCityOtherNames(best_city, (meta as any).other_names)
        continue
      }
      let is_strictly_closer_cap = min_dist + 0.5 < prev_binding.dist_km
      if (!is_name_match && !is_strictly_closer_cap)
        continue
    }

    let meta_max_year = -9999
    for (let h = 0; h < (meta.historical_names || []).length; h++) {
      if (meta.historical_names[h].year_frac > meta_max_year)
        meta_max_year = meta.historical_names[h].year_frac
    }
    for (let c_i = 0; c_i < (meta.capital_records || []).length; c_i++) {
      if (meta.capital_records![c_i].year_frac > meta_max_year)
        meta_max_year = meta.capital_records![c_i].year_frac
    }
    let meta_is_modern = meta_max_year >= 1700
    let is_ghsl_city = Boolean(best_city.is_ghsl || String(best_city.key || '').startsWith('ghsl-'))
    let is_displaced_neighbour = !is_cap_meta && !is_primary_name_match && Boolean(meta.name) &&
      doesLabelMatchAnotherNearbyCity(best_city, meta.name!, spatial_grid, raw_city_name_by_key, primary_alias_cache, 15, cells_per_degree)

    if (is_displaced_neighbour)
      continue

    // Nearest-point overlay application: Tier-0 capitals enforce capital city name (Structural Rule #3),
    // respecting existing closer Tier-0 capital locks (strictly closer or same-city primary match wins)
    let should_set_name = false
    if (meta.name && !is_ghsl_city && !is_synthetic_stub) {
      if (is_cap_meta) {
        if (!prev_binding?.is_capital_locked || min_dist + 0.5 < prev_binding.dist_km)
          should_set_name = true
      } else if (!prev_binding) {
        should_set_name = min_dist <= dense_cluster_km || is_name_match || isCorruptedCityName(best_city.name || '')
      } else if (!prev_binding.is_capital_locked) {
        if (is_primary_name_match && !prev_binding.has_primary_name_match)
          should_set_name = true
        else if (min_dist < prev_binding.dist_km && meta_max_year >= prev_binding.max_hn_year)
          should_set_name = true
      }
    }

    let meta_extra_aliases: string[] = []
    if (Array.isArray((meta as any).other_names))
      meta_extra_aliases.push(...(meta as any).other_names)

    if (should_set_name && meta.name) {
      if (
        best_city.name &&
        best_city.name.toLowerCase() !== meta.name.toLowerCase() &&
        !isCorruptedCityName(best_city.name) &&
        !doesLabelMatchAnotherNearbyCity(best_city, best_city.name, spatial_grid, raw_city_name_by_key, primary_alias_cache, 15, cells_per_degree)
      ) {
        meta_extra_aliases.push(best_city.name)
      }
      best_city.name = meta.name
      best_city.metadata_name = meta.name
      city_alias_cache.delete(best_city.key)
      primary_alias_cache.delete(best_city.key)
    }

    if (meta_extra_aliases.length > 0) {
      mergeCityOtherNames(best_city, meta_extra_aliases)
      city_alias_cache.delete(best_city.key)
    }

    if (meta.historical_names && meta.historical_names.length > 0) {
      if (is_cap_meta && !prev_binding?.is_capital_locked)
        best_city.historical_names = mergeHistoricalNames(meta.historical_names, best_city.historical_names)
      else
        best_city.historical_names = mergeHistoricalNames(best_city.historical_names, meta.historical_names)
    }

    binding_state.set(best_city.key, {
      dist_km: Math.min(prev_binding?.dist_km ?? 999999, min_dist),
      has_modern_entry: Boolean(prev_binding?.has_modern_entry || meta_is_modern),
      has_name_match: Boolean(prev_binding?.has_name_match || is_name_match),
      has_primary_name_match: Boolean(prev_binding?.has_primary_name_match || is_primary_name_match),
      is_capital_locked: Boolean(prev_binding?.is_capital_locked || is_cap_meta),
      max_hn_year: Math.max(prev_binding?.max_hn_year ?? -9999, meta_max_year),
    })

    if (is_cap_meta || !is_displaced_neighbour)
      mergeCityCapitalRecords(best_city, meta)

    // Propagate bound metadata to co-located era/agglomeration counterparts (stadester <-> ghsl) within 15 km
    let refreshed_best_primary = getCachedPrimaryAliases(best_city)
    let is_best_agg = isMetroShell(best_city)
    let deg_lat_15 = 15/111.0 + 0.02
    let deg_lon_15 = 15/(111.0*Math.max(0.2, Math.cos((target_lat*Math.PI)/180))) + 0.02
    let rad_lat_15 = Math.max(1, Math.ceil(deg_lat_15*cells_per_degree))
    let rad_lon_15 = Math.max(1, Math.ceil(deg_lon_15*cells_per_degree))

    for (let d_lat = -rad_lat_15; d_lat <= rad_lat_15; d_lat++) {
      for (let d_lng = -rad_lon_15; d_lng <= rad_lon_15; d_lng++) {
        let cell = spatial_grid[`${center_lat + d_lat},${center_lng + d_lng}`]
        if (!cell)
          continue
        for (let c = 0; c < cell.length; c++) {
          let other = cell[c]
          if (other.key === best_city.key || !other.coords)
            continue
          let dist = computeHaversineDistanceKm(other.coords[0], other.coords[1], target_lat, target_lng)
          if (dist > 15)
            continue

          let other_own_name = cleanCandidateCityString(String(other.name || '').split(';')[0])
          let other_own_info = buildAliasStemSet(other_own_name)
          let is_era_cp = Boolean(
            ((String(best_city.key).startsWith('stadester-') && String(other.key).startsWith('ghsl-')) ||
             (String(best_city.key).startsWith('ghsl-') && String(other.key).startsWith('stadester-'))) &&
            matchesAliasStemSet(other_own_info, refreshed_best_primary)
          )
          let is_agg_cp = Boolean((is_best_agg || isMetroShell(other)) && matchesAliasStemSet(other_own_info, refreshed_best_primary))
          if (!is_era_cp && !is_agg_cp)
            continue

          let prev_other = binding_state.get(other.key)
          if (prev_other?.is_capital_locked && !is_cap_meta)
            continue
          if (meta.historical_names && meta.historical_names.length > 0)
            other.historical_names = mergeHistoricalNames(other.historical_names, meta.historical_names)
          if (meta_extra_aliases.length > 0)
            mergeCityOtherNames(other, meta_extra_aliases)
          mergeCityCapitalRecords(other, meta)
        }
      }
    }
  }

  // Post-pass: ensure active modern settlements resolve to their latest historical name & clean duplicate aliases
  for (let i = 0; i < entries.length; i++) {
    let city = entries[i]
    if (!city || city.is_ghsl || String(city.key || '').startsWith('ghsl-'))
      continue

    let bstate = binding_state.get(city.key)
    if (!bstate?.is_capital_locked && (city.max_year ?? 0) >= 1950 && city.historical_names && city.historical_names.length > 0) {
      let last_hn = city.historical_names[city.historical_names.length - 1]
      if (last_hn.name && !isCorruptedCityName(last_hn.name)) {
        let last_stem = normalizeCapitalNameStem(last_hn.name)
        let name_stem = normalizeCapitalNameStem(city.name || '')
        if (last_stem && name_stem && last_stem !== name_stem) {
          let has_earlier = city.historical_names.slice(0, -1).some((arg0_h: HistoricalNameRecord) =>
            normalizeCapitalNameStem(arg0_h.name || '') === name_stem
          )
          if (has_earlier) {
            if (city.name && !isCorruptedCityName(city.name))
              mergeCityOtherNames(city, [city.name])
            city.name = last_hn.name
          }
        }
      }
    }

    if (city.metadata_name || bstate) {
      city.metadata_name = city.name
      if ('reconciled_name' in city)
        city.reconciled_name = city.name
      if ('ghsl_name' in city)
        city.ghsl_name = city.name
    }
  }

  //Return statement
  return meta_list.length
}


/**
 * Applies per-version city metadata to indexed cities via the unified nearest-point spatial overlay engine.
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
  let entries = Object.values(indexed)

  //Guard clauses
  if (entries.length === 0)
    return

  //Function body
  let bound_count = bindCityMetadataOverlay(entries, dataset_name, {
    key_lookup: (arg0_k: string) => indexed[arg0_k],
  })

  console.log(`[StadesterMetadata] Dropped ${bound_count} spatial overlay metadata points onto ${entries.length} settlements.`)
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
 * Resolves the filesystem path to a partitioned `city_metadata/city_metadata_manifest.json` if present.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 *
 * @returns {string | null}
 */
export function resolveCityMetadataManifestPath (arg0_dataset_name?: string): string | null {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let configured = resolveStadesterVersionPaths(dataset_name)
  let defines = FilepathDefines.get()
  let l_stad = (defines.root_folders && defines.root_folders.l_stad) ? defines.root_folders.l_stad : './data/stadester'
  let candidates: string[] = []

  //Function body
  if (configured.path) {
    let base_dir = configured.path.endsWith('.json') ? path.dirname(configured.path) : configured.path
    candidates.push(path.join(base_dir, 'city_metadata', 'city_metadata_manifest.json'))
  }
  candidates.push(path.join(l_stad, clean_stem, 'city_metadata', 'city_metadata_manifest.json'))

  for (let i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i]))
      return candidates[i]
  }

  //Return statement
  return null
}


/**
 * Computes the latest modification timestamp across partitioned `city_metadata/` shards (or monolithic `city_metadata.json`).
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 * @param {string[]} [arg1_region_keys]
 *
 * @returns {number}
 */
export function getCityMetadataMaxMtimeMs (arg0_dataset_name?: string, arg1_region_keys?: string[]): number {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let region_filter = Array.isArray(arg1_region_keys) && arg1_region_keys.length > 0
    ? new Set(arg1_region_keys.map((arg0_k) => arg0_k.toUpperCase()))
    : null

  //Declare local instance variables
  let man_path = resolveCityMetadataManifestPath(dataset_name)
  let max_mtime = 0

  //Function body
  if (man_path && fs.existsSync(man_path)) {
    try {
      let man_dir = path.dirname(man_path)
      let man = JSON.parse(fs.readFileSync(man_path, 'utf-8'))
      let shards = Array.isArray(man.shards) ? man.shards : []
      for (let i = 0; i < shards.length; i++) {
        let sh = shards[i]
        let is_cap = sh.key === 'CAPITALS' || sh.file === '00_capitals.json'
        if (region_filter && !is_cap && !region_filter.has(String(sh.key || '').toUpperCase()) && sh.key !== 'UNASSIGNED')
          continue
        let sp = path.join(man_dir, sh.file)
        if (fs.existsSync(sp)) {
          let mt = fs.statSync(sp).mtimeMs
          if (mt > max_mtime)
            max_mtime = mt
        }
      }
      return max_mtime
    } catch {}
  }

  let mono_path = resolveCityMetadataPath(dataset_name)
  if (fs.existsSync(mono_path))
    max_mtime = fs.statSync(mono_path).mtimeMs

  //Return statement
  return max_mtime
}


/**
 * Computes a deterministic signature string across partitioned `city_metadata/` shards (or monolithic `city_metadata.json`).
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 * @param {string[]} [arg1_region_keys]
 *
 * @returns {string}
 */
export function getCityMetadataSignature (arg0_dataset_name?: string, arg1_region_keys?: string[]): string {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let region_filter = Array.isArray(arg1_region_keys) && arg1_region_keys.length > 0
    ? new Set(arg1_region_keys.map((arg0_k) => arg0_k.toUpperCase()))
    : null

  //Declare local instance variables
  let man_path = resolveCityMetadataManifestPath(dataset_name)

  //Function body
  if (man_path && fs.existsSync(man_path)) {
    try {
      let man_dir = path.dirname(man_path)
      let man = JSON.parse(fs.readFileSync(man_path, 'utf-8'))
      let shards = Array.isArray(man.shards) ? man.shards : []
      let parts: string[] = []
      for (let i = 0; i < shards.length; i++) {
        let sh = shards[i]
        let is_cap = sh.key === 'CAPITALS' || sh.file === '00_capitals.json'
        if (region_filter && !is_cap && !region_filter.has(String(sh.key || '').toUpperCase()) && sh.key !== 'UNASSIGNED')
          continue
        let sp = path.join(man_dir, sh.file)
        if (fs.existsSync(sp)) {
          let st = fs.statSync(sp)
          parts.push(`${sh.file}:${st.size}:${Math.round(st.mtimeMs)}`)
        }
      }
      return `partitioned:${parts.join('|')}`
    } catch {}
  }

  let mono_path = resolveCityMetadataPath(dataset_name)
  if (!fs.existsSync(mono_path))
    return 'missing'
  let st = fs.statSync(mono_path)

  //Return statement
  return `${st.size}:${Math.round(st.mtimeMs)}`
}


/**
 * Loads and normalises city metadata from partitioned `city_metadata/` (`00_capitals.json` Priority Tier 0 first,
 * then regional shards) or falls back to legacy per-version `city_metadata.json`.
 *
 * @param {string} [arg0_dataset_name='stadester_2.0']
 * @param {string[]} [arg1_region_keys]
 *
 * @returns {CityMetadataEntry[]}
 */
export function loadCityMetadata (arg0_dataset_name?: string, arg1_region_keys?: string[]): CityMetadataEntry[] {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let region_keys = Array.isArray(arg1_region_keys) && arg1_region_keys.length > 0
    ? arg1_region_keys.map((arg0_k) => arg0_k.toUpperCase()).sort()
    : null

  //Declare local instance variables
  let cached_entry: { entries: CityMetadataEntry[]; mtime_ms: number } | undefined
  let man_path = resolveCityMetadataManifestPath(dataset_name)
  let normalized_list: CityMetadataEntry[] = []

  //Function body
  if (man_path && fs.existsSync(man_path)) {
    let cache_key = `${man_path}|${region_keys ? region_keys.join(',') : '*'}`
    let max_mtime = getCityMetadataMaxMtimeMs(dataset_name, region_keys || undefined)
    cached_entry = city_metadata_cache_by_path.get(cache_key)
    if (cached_entry && max_mtime <= cached_entry.mtime_ms)
      return cached_entry.entries

    try {
      let man_dir = path.dirname(man_path)
      let man = JSON.parse(fs.readFileSync(man_path, 'utf-8'))
      let shards = Array.isArray(man.shards) ? [...man.shards] : []
      let region_set = region_keys ? new Set(region_keys) : null

      //Load Priority Tier 0 (`00_capitals.json`) FIRST so capitals always bind names + capital timelines atomically
      shards.sort((arg0_a: any, arg1_b: any) => Number(arg0_a.tier ?? 1) - Number(arg1_b.tier ?? 1))

      for (let s = 0; s < shards.length; s++) {
        let sh = shards[s]
        let is_cap = sh.key === 'CAPITALS' || sh.file === '00_capitals.json'
        if (region_set && !is_cap && !region_set.has(String(sh.key || '').toUpperCase()) && sh.key !== 'UNASSIGNED')
          continue
        let sp = path.join(man_dir, sh.file)
        if (!fs.existsSync(sp))
          continue
        let raw_arr = JSON.parse(fs.readFileSync(sp, 'utf-8'))
        if (Array.isArray(raw_arr)) {
          for (let i = 0; i < raw_arr.length; i++) {
            let item = normalizeMetadataEntry(raw_arr[i])
            if (item) {
              if (is_cap)
                item.is_capital_tier = true
              normalized_list.push(item)
            }
          }
        }
      }

      city_metadata_cache_by_path.set(cache_key, {
        entries: normalized_list,
        mtime_ms: max_mtime,
      })
      console.log(`[StadesterMetadata] Loaded ${normalized_list.length} partitioned city metadata entries from ${man_dir} (00_capitals Priority Tier 0 first)`)
      return normalized_list
    } catch (arg0_err) {
      console.warn(`[StadesterMetadata] Failed to load partitioned manifest ${man_path}, falling back:`, arg0_err)
    }
  }

  let file_path = resolveCityMetadataPath(dataset_name)
  if (!fs.existsSync(file_path))
    return []

  try {
    let stats = fs.statSync(file_path)
    cached_entry = city_metadata_cache_by_path.get(file_path)
    if (cached_entry && stats.mtimeMs <= cached_entry.mtime_ms)
      return cached_entry.entries

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
