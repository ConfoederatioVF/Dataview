import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'

export interface AtlasDatasetPaths {
  cacheDir: string
  cshapesPath: string
  dejureNaissancePath: string
  detailedDir: string
  detailedNaissancePath: string
  naissancePath: string
}

let cached_dataset_paths: AtlasDatasetPaths | null = null

/**
 * Clears the cached Atlas dataset paths to force reloading configuration from disk.
 *
 * @returns {void}
 */
export let clearAtlasConfigCache = function (): void {
  //Function body
  cached_dataset_paths = null
}


/**
 * Resolves absolute file paths for GIS and boundary datasets dynamically from common/layers/atlas.json5.
 * Supports relative path resolution, root folder variable replacement, and backwards-compatible fallbacks.
 *
 * @returns {AtlasDatasetPaths}
 */
export let getAtlasDatasetPaths = function (): AtlasDatasetPaths {
  //Guard clauses
  if (cached_dataset_paths)
    return cached_dataset_paths

  //Declare local instance variables
  let atlas_config_path = path.resolve(process.cwd(), 'common/layers/atlas.json5')
  let atlas_data_dir = path.resolve(process.cwd(), 'data/atlas')
  let cache_dir = path.join(atlas_data_dir, 'cache')
  let cshapes_path = path.join(atlas_data_dir, 'CShapes-2.0.geojson')
  let dejure_naissance_path = path.join(atlas_data_dir, 'atlas_dejure.naissance')
  let detailed_dir = path.join(atlas_data_dir, 'detailed')
  let detailed_naissance_path = path.join(atlas_data_dir, 'detailed.naissance')
  let filepath_defines_path = path.resolve(process.cwd(), 'common/layers/filepath_defines.json5')
  let legacy_naissance_path = path.join(atlas_data_dir, 'atlas.naissance')
  let naissance_path: string
  let root_folders: Record<string, string> = {
    l_atlas: './data/atlas',
  }

  //Function body
  if (fs.existsSync(filepath_defines_path)) {
    try {
      let raw_text = fs.readFileSync(filepath_defines_path, 'utf-8')
      let parsed_json = JSON5.parse(raw_text)
      let parsed_roots = parsed_json.root_folders || parsed_json || {}
      root_folders = { ...root_folders, ...parsed_roots }
    } catch (arg0_err) {
      console.error('[AtlasConfigLoader] Failed to parse filepath_defines.json5:', arg0_err)
    }
  }

  if (fs.existsSync(atlas_config_path)) {
    try {
      let raw_text = fs.readFileSync(atlas_config_path, 'utf-8')
      let parsed_atlas = JSON5.parse(raw_text)

      if (parsed_atlas.root_folders)
        root_folders = { ...root_folders, ...parsed_atlas.root_folders }

      let resolveToken = (arg0_raw_path: string): string => {
        let res = arg0_raw_path
        let root_keys = Object.keys(root_folders)
        for (let i = 0; i < root_keys.length; i++) {
          let k = root_keys[i]
          let v = root_folders[k]
          res = res.replace(new RegExp(`(\\$\\{${k}\\}|\\{${k}\\})`, 'g'), v)
        }
        if (!path.isAbsolute(res))
          res = path.resolve(process.cwd(), res)
        return path.normalize(res)
      }

      if (parsed_atlas.cache_dir)
        cache_dir = resolveToken(parsed_atlas.cache_dir)
      if (parsed_atlas.detailed_dir)
        detailed_dir = resolveToken(parsed_atlas.detailed_dir)

      let simp_fps = parsed_atlas.simplified_borders?.filepaths
      if (Array.isArray(simp_fps)) {
        for (let i = 0; i < simp_fps.length; i++) {
          let fp = simp_fps[i]
          let p = fp.path || fp
          if (typeof p === 'string') {
            if (p.endsWith('.geojson') || fp.type === 'vector.geojson' || p.toLowerCase().includes('cshapes')) {
              cshapes_path = resolveToken(p)
            } else if (p.endsWith('.naissance') || fp.type === 'vector.naissance') {
              dejure_naissance_path = resolveToken(p)
            }
          }
        }
      }

      let det_fps = parsed_atlas.detailed_borders?.filepaths
      if (Array.isArray(det_fps)) {
        for (let i = 0; i < det_fps.length; i++) {
          let fp = det_fps[i]
          let p = fp.path || fp
          if (typeof p === 'string' && (p.endsWith('.naissance') || fp.type === 'vector.naissance'))
            detailed_naissance_path = resolveToken(p)
        }
      }
    } catch (arg0_err) {
      console.error('[AtlasConfigLoader] Failed to parse atlas.json5:', arg0_err)
    }
  }

  naissance_path = fs.existsSync(dejure_naissance_path)
    ? dejure_naissance_path
    : (fs.existsSync(legacy_naissance_path) ? legacy_naissance_path : dejure_naissance_path)

  if (!fs.existsSync(cache_dir))
    fs.mkdirSync(cache_dir, { recursive: true })

  cached_dataset_paths = {
    cacheDir: cache_dir,
    cshapesPath: cshapes_path,
    dejureNaissancePath: dejure_naissance_path,
    detailedDir: detailed_dir,
    detailedNaissancePath: detailed_naissance_path,
    naissancePath: naissance_path,
  }

  //Return statement
  return cached_dataset_paths
}
