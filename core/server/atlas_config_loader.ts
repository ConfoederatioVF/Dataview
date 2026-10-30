import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'
import { FilepathDefines } from './filepath_defines.ts'

export interface AtlasDatasetPaths {
  cacheDir: string
  cshapesPath: string
  dejureDatasets: Record<string, boolean>
  dejureNaissancePath: string
  detailedDir: string
  detailedNaissancePath: string
  displayOptions?: Record<string, Record<string, any>>
  idFields?: Record<string, string>
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
  let defines = FilepathDefines.get()
  let atlas_config_path = path.join(FilepathDefines.getProjectRoot(), 'common/layers/atlas.json5')
  let atlas_data_dir = defines.root_folders.l_atlas
  let cache_dir = path.join(atlas_data_dir, 'cache')
  let cshapes_path = defines.filepaths.atlas_cshapes
  let dejure_datasets: Record<string, boolean> = {
    defacto_borders: false,
    dejure_borders: true,
    detailed_borders: false,
    simplified_borders: true,
    statistical_borders: true,
  }
  let dejure_naissance_path = defines.filepaths.atlas_dejure
  let detailed_dir = path.join(atlas_data_dir, 'detailed')
  let detailed_naissance_path = defines.filepaths.atlas_detailed
  let display_options: Record<string, Record<string, any>> = {}
  let id_fields: Record<string, string> = {
    cshapes_id: 'C-Shapes ID',
    cow_id: 'COW ID',
    seshat_id: 'Seshat ID',
  }
  let legacy_naissance_path = defines.filepaths.atlas_legacy
  let naissance_path: string
  let root_folders: Record<string, string> = { ...defines.root_folders }

  //Function body
  if (fs.existsSync(atlas_config_path)) {
    try {
      let raw_text = fs.readFileSync(atlas_config_path, 'utf-8')
      let parsed_atlas = JSON5.parse(raw_text)
      let defacto_entry = parsed_atlas.defacto_borders || parsed_atlas.detailed_borders
      let dejure_entry = parsed_atlas.dejure_borders || parsed_atlas.simplified_borders

      if (parsed_atlas.root_folders) {
        let local_roots = FilepathDefines.resolveTokens(parsed_atlas.root_folders, root_folders)
        root_folders = { ...root_folders, ...local_roots }
      }

      let resolveToken = (arg0_raw_path: string): string => {
        return FilepathDefines.resolveTokens({ target: arg0_raw_path }, root_folders).target
      }

      if (parsed_atlas.cache_dir)
        cache_dir = resolveToken(parsed_atlas.cache_dir)
      if (parsed_atlas.detailed_dir)
        detailed_dir = resolveToken(parsed_atlas.detailed_dir)

      if (dejure_entry?.dejure !== undefined) {
        let is_dj = Boolean(dejure_entry.dejure)
        dejure_datasets.dejure_borders = is_dj
        dejure_datasets.simplified_borders = is_dj
        dejure_datasets.statistical_borders = is_dj
      }
      if (defacto_entry?.dejure !== undefined) {
        let is_df = Boolean(defacto_entry.dejure)
        dejure_datasets.defacto_borders = is_df
        dejure_datasets.detailed_borders = is_df
      }

      if (dejure_entry?.display_options)
        display_options.dejure_borders = dejure_entry.display_options
      if (defacto_entry?.display_options)
        display_options.defacto_borders = defacto_entry.display_options

      let parsed_id_fields = dejure_entry?.id_fields ||
        dejure_entry?.identifiers ||
        parsed_atlas.id_fields ||
        parsed_atlas.identifiers
      if (parsed_id_fields && typeof parsed_id_fields === 'object') {
        id_fields = parsed_id_fields
      }

      let simp_fps = dejure_entry?.filepaths
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

      let det_fps = defacto_entry?.filepaths
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
    dejureDatasets: dejure_datasets,
    dejureNaissancePath: dejure_naissance_path,
    detailedDir: detailed_dir,
    detailedNaissancePath: detailed_naissance_path,
    displayOptions: display_options,
    idFields: id_fields,
    naissancePath: naissance_path,
  }

  //Return statement
  return cached_dataset_paths
}
