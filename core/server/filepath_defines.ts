import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'

export interface ResolvedFilepathDefines {
  filepaths: Record<string, string>
  mtimeMs: number
  root_folders: Record<string, string>
}

let cached_defines_by_dir = new Map<string, ResolvedFilepathDefines>()
let project_root_dir = path.resolve(import.meta.dirname, '../..')

export let FilepathDefines = {
  /**
   * Clears cached filepath definitions so subsequent lookups re-parse from disk.
   *
   * @returns {void}
   */
  clearCache: function (): void {
    //Function body
    cached_defines_by_dir.clear()
  },


  /**
   * Loads and resolves root_folders and filepaths from common/layers/filepath_defines.json5,
   * automatically invalidating cache entries if the file modification timestamp changes.
   *
   * @param {string} [arg0_config_dir]
   *
   * @returns {ResolvedFilepathDefines}
   */
  get: function (arg0_config_dir?: string): ResolvedFilepathDefines {
    //Convert from parameters
    let config_dir = arg0_config_dir
      ? path.resolve(arg0_config_dir)
      : path.join(project_root_dir, 'common')

    //Declare local instance variables
    let cached_entry = cached_defines_by_dir.get(config_dir)
    let current_mtime = 0
    let defines_path = path.join(config_dir, 'layers', 'filepath_defines.json5')
    let parsed_json: any
    let raw_filepaths: Record<string, string> = {}
    let raw_roots: Record<string, string> = {}
    let raw_text: string
    let resolved_entry: ResolvedFilepathDefines
    let resolved_filepaths: Record<string, string> = {}
    let resolved_roots: Record<string, string> = {}

    //Guard clauses
    if (!fs.existsSync(defines_path)) {
      return {
        filepaths: resolved_filepaths,
        mtimeMs: 0,
        root_folders: resolved_roots,
      }
    }

    //Function body
    try {
      current_mtime = fs.statSync(defines_path).mtimeMs
      if (cached_entry && cached_entry.mtimeMs === current_mtime)
        return cached_entry

      raw_text = fs.readFileSync(defines_path, 'utf-8')
      parsed_json = JSON5.parse(raw_text)
      raw_roots = parsed_json.root_folders || parsed_json || {}
      raw_filepaths = parsed_json.filepaths || {}

      resolved_roots = FilepathDefines.resolveTokens(raw_roots)
      resolved_filepaths = FilepathDefines.resolveTokens(raw_filepaths, resolved_roots)
    } catch (arg0_err) {
      console.error('[FilepathDefines] Failed to parse filepath_defines.json5:', arg0_err)
    }

    resolved_entry = {
      filepaths: resolved_filepaths,
      mtimeMs: current_mtime,
      root_folders: resolved_roots,
    }
    cached_defines_by_dir.set(config_dir, resolved_entry)

    //Return statement
    return resolved_entry
  },


  /**
   * Returns the resolved Dataview repository root directory.
   *
   * @returns {string}
   */
  getProjectRoot: function (): string {
    //Return statement
    return project_root_dir
  },


  /**
   * Normalises a resolved filesystem path and eliminates duplicate path segments.
   *
   * @param {string} arg0_path
   *
   * @returns {string}
   */
  normalisePath: function (arg0_path: string): string {
    //Convert from parameters
    let target_path = arg0_path

    //Declare local instance variables
    let cleaned = target_path.replace(/\\/g, '/')

    //Function body
    //1. Clean redundant multiple slashes (except initial protocol or drive)
    cleaned = cleaned.replace(/([^:])\/\/+/g, '$1/')

    //2. Collapse duplicate histmap segments if present
    for (let i = 0; i < 5; i++) {
      if (cleaned.includes('/histmap/histmap/'))
        cleaned = cleaned.replace('/histmap/histmap/', '/histmap/')
    }

    //Return statement
    return path.normalize(cleaned)
  },


  /**
   * Resolves templated path maps (${token} or {token}) recursively against optional base roots.
   *
   * @param {Record<string, string>} arg0_path_map
   * @param {Record<string, string>} [arg1_base_tokens]
   *
   * @returns {Record<string, string>}
   */
  resolveTokens: function (
    arg0_path_map: Record<string, string>,
    arg1_base_tokens?: Record<string, string>
  ): Record<string, string> {
    //Convert from parameters
    let path_map = arg0_path_map
    let base_tokens = arg1_base_tokens ? arg1_base_tokens : {}

    //Declare local instance variables
    let all_keys = Object.keys(path_map)
    let lookup_map: Record<string, string>
    let resolved_map: Record<string, string> = { ...path_map }

    //Function body
    for (let i = 0; i < 10; i++) {
      let local_changed = false
      lookup_map = { ...base_tokens, ...resolved_map }

      for (let x = 0; x < all_keys.length; x++) {
        let k = all_keys[x]
        let val = resolved_map[k]
        if (typeof val !== 'string')
          continue

        let new_val = val.replace(/\$\{([^}]+)\}|\{([^}]+)\}/g, (arg0_match, arg1_v1, arg2_v2) => {
          let token_key = arg1_v1 || arg2_v2
          if (lookup_map[token_key] !== undefined) {
            local_changed = true
            return lookup_map[token_key]
          }
          return arg0_match
        })
        resolved_map[k] = new_val
      }

      if (!local_changed)
        break
    }

    //Normalise all resolved entries to absolute paths
    for (let i = 0; i < all_keys.length; i++) {
      let k = all_keys[i]
      if (typeof resolved_map[k] !== 'string')
        continue

      let normalized = FilepathDefines.normalisePath(resolved_map[k])
      if (!path.isAbsolute(normalized))
        normalized = path.resolve(project_root_dir, normalized)
      resolved_map[k] = normalized
    }

    //Return statement
    return resolved_map
  },
}

