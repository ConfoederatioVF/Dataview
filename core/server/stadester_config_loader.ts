import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'
import type { StadesterVersionDefinition } from '../framework/geopng/types.ts'
import { normaliseStadesterVersions } from '../framework/stadester/stadester_versions.ts'
import { FilepathDefines } from './filepath_defines.ts'

export interface StadesterConfigPaths {
  defaultDataset: string
  displayOptions?: Record<string, any>
  versions: StadesterVersionDefinition[]
  versionsById: Record<string, StadesterVersionDefinition>
}

let cached_stadester_config: StadesterConfigPaths | null = null

/**
 * Clears the cached Stadestér config so subsequent lookups reload common/layers/stadester.json5 from disk.
 *
 * @returns {void}
 */
export let clearStadesterConfigCache = function (): void {
  //Function body
  cached_stadester_config = null
}


/**
 * Checks whether a resolved Stadestér dataset path (partitioned directory or JSON file) exists and contains dataset data.
 *
 * @param {string} arg0_resolved_path
 * @param {string} [arg1_version_id]
 *
 * @returns {boolean}
 */
export let isStadesterPathAvailable = function (
  arg0_resolved_path: string,
  arg1_version_id?: string
): boolean {
  //Convert from parameters
  let resolved_path = arg0_resolved_path
  let version_id = arg1_version_id

  //Guard clauses
  if (!resolved_path || !fs.existsSync(resolved_path))
    return false

  //Function body
  try {
    let stat = fs.statSync(resolved_path)
    if (stat.isFile())
      return true
    if (!stat.isDirectory())
      return false

    if (fs.existsSync(path.join(resolved_path, 'stadester_manifest.json')))
      return true
    if (version_id) {
      let clean_stem = version_id.endsWith('.json') ? version_id.slice(0, -5) : version_id
      if (fs.existsSync(path.join(resolved_path, `${clean_stem}.json`)))
        return true
    }

    let entries = fs.readdirSync(resolved_path)
    for (let i = 0; i < entries.length; i++) {
      let entry_name = entries[i]
      if (entry_name.endsWith('.json') && entry_name !== 'city_metadata.json')
        return true
    }
  } catch {
    //Return statement
    return false
  }

  //Return statement
  return false
}


/**
 * Resolves raw Stadestér version entries against root folder tokens and verifies on-disk availability.
 *
 * @param {Record<string, any> | StadesterVersionDefinition[] | undefined} arg0_raw_versions
 * @param {Record<string, string>} arg1_resolved_roots
 *
 * @returns {StadesterVersionDefinition[]}
 */
export let resolveStadesterVersionsList = function (
  arg0_raw_versions: Record<string, any> | StadesterVersionDefinition[] | undefined,
  arg1_resolved_roots: Record<string, string>
): StadesterVersionDefinition[] {
  //Convert from parameters
  let raw_versions = arg0_raw_versions
  let resolved_roots = arg1_resolved_roots

  //Declare local instance variables
  let normalised = normaliseStadesterVersions(raw_versions)
  let resolved_list: StadesterVersionDefinition[] = []

  //Function body
  for (let i = 0; i < normalised.length; i++) {
    let ver = normalised[i]
    let resolved_metadata_path: string | undefined = undefined
    let resolved_path = ver.path

    if (resolved_path) {
      resolved_path = FilepathDefines.normalisePath(
        FilepathDefines.resolveTokens({ target: resolved_path }, resolved_roots).target
      )
    }
    if (ver.metadata_path) {
      resolved_metadata_path = FilepathDefines.normalisePath(
        FilepathDefines.resolveTokens({ target: ver.metadata_path }, resolved_roots).target
      )
    }

    resolved_list.push({
      available: isStadesterPathAvailable(resolved_path, ver.id),
      id: ver.id,
      metadata_path: resolved_metadata_path,
      name: ver.name,
      path: resolved_path,
    })
  }

  //Return statement
  return resolved_list
}


/**
 * Loads and resolves Stadestér dataset versions, paths, and defaults dynamically from common/layers/stadester.json5.
 *
 * @returns {StadesterConfigPaths}
 */
export let getStadesterConfig = function (): StadesterConfigPaths {
  //Guard clauses
  if (cached_stadester_config)
    return cached_stadester_config

  //Declare local instance variables
  let default_dataset = 'stadester_2.0'
  let defines = FilepathDefines.get()
  let display_options: Record<string, any> | undefined = undefined
  let root_folders: Record<string, string> = { ...defines.root_folders }
  let stadester_config_path = path.join(FilepathDefines.getProjectRoot(), 'common/layers/stadester.json5')
  let versions: StadesterVersionDefinition[] = []
  let versions_by_id: Record<string, StadesterVersionDefinition> = {}

  //Function body
  if (fs.existsSync(stadester_config_path)) {
    try {
      let raw_text = fs.readFileSync(stadester_config_path, 'utf-8')
      let parsed = JSON5.parse(raw_text)
      let stadester_entry = parsed.stadester || Object.values(parsed).find(
        (arg0_v: any) => arg0_v && typeof arg0_v === 'object' && (arg0_v.versions || arg0_v.type === 'vector.points')
      )

      if (parsed.root_folders) {
        let local_roots = FilepathDefines.resolveTokens(parsed.root_folders, root_folders)
        root_folders = { ...root_folders, ...local_roots }
      }

      if (stadester_entry && typeof stadester_entry === 'object') {
        display_options = stadester_entry.display_options
        versions = resolveStadesterVersionsList(stadester_entry.versions, root_folders)
      }
    } catch (arg0_err) {
      console.error('[StadesterConfigLoader] Failed to parse stadester.json5:', arg0_err)
    }
  }

  for (let i = 0; i < versions.length; i++) {
    let ver = versions[i]
    versions_by_id[ver.id] = ver
  }

  let configured_default = display_options?.dataset as string | undefined
  let available_versions = versions.filter((arg0_v) => arg0_v.available !== false)

  if (configured_default && available_versions.some((arg0_v) => arg0_v.id === configured_default)) {
    default_dataset = configured_default
  } else if (available_versions.length > 0) {
    default_dataset = available_versions[0].id
  } else if (configured_default) {
    default_dataset = configured_default
  } else if (versions.length > 0) {
    default_dataset = versions[0].id
  }

  cached_stadester_config = {
    defaultDataset: default_dataset,
    displayOptions: display_options,
    versions,
    versionsById: versions_by_id,
  }

  //Return statement
  return cached_stadester_config
}


/**
 * Returns the resolved default Stadestér dataset ID from common/layers/stadester.json5.
 *
 * @returns {string}
 */
export let getDefaultStadesterDatasetId = function (): string {
  //Return statement
  return getStadesterConfig().defaultDataset
}


/**
 * Resolves configured filesystem paths for a given Stadestér version ID from common/layers/stadester.json5.
 *
 * @param {string} [arg0_dataset_id]
 *
 * @returns {{ dataset_id: string; metadata_path?: string; path?: string }}
 */
export let resolveStadesterVersionPaths = function (
  arg0_dataset_id?: string
): { dataset_id: string; metadata_path?: string; path?: string } {
  //Convert from parameters
  let config = getStadesterConfig()
  let dataset_id = (arg0_dataset_id) ? arg0_dataset_id : config.defaultDataset

  //Declare local instance variables
  let clean_stem = dataset_id.endsWith('.json') ? dataset_id.slice(0, -5) : dataset_id
  let entry = config.versionsById[dataset_id] || config.versionsById[clean_stem]

  //Return statement
  return {
    dataset_id: entry?.id || clean_stem,
    metadata_path: entry?.metadata_path,
    path: entry?.path,
  }
}
