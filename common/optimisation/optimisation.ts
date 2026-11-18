import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'

export interface ResourceLimitsConfig {
  compiler_below_normal_priority?: boolean
  compiler_max_heap_mb?: number
  compiler_yield_ms?: number
  lint_max_threads?: number
  server_max_heap_mb?: number
}

export interface StadesterScalingConfig {
  compile_concurrency?: number
  enable_binary_store?: boolean
  enable_viewport_tiles?: boolean
  label_candidate_multiplier?: number
  label_collision_cell_h?: number
  label_collision_cell_w?: number
  label_min_pop_base?: number
  tile_fetch_zoom_threshold?: number
  tile_max_cities_per_tile?: number
}

export interface OptimisationConfig {
  downsampling_method?: 'average' | 'sum'
  downsampling_resolution?: [number, number]
  enabled?: boolean
  resource_limits?: ResourceLimitsConfig
  stadester_scaling?: StadesterScalingConfig
}

export interface OptimisationInfo {
  config: OptimisationConfig
  height: number
  mtimeMs: number
  width: number
}

export let DEFAULT_RESOURCE_LIMITS_CONFIG: Required<ResourceLimitsConfig> = {
  compiler_below_normal_priority: true,
  compiler_max_heap_mb: 2048,
  compiler_yield_ms: 15,
  lint_max_threads: 2,
  server_max_heap_mb: 16384,
}

export let DEFAULT_STADESTER_SCALING_CONFIG: Required<StadesterScalingConfig> = {
  compile_concurrency: 4,
  enable_binary_store: true,
  enable_viewport_tiles: true,
  label_candidate_multiplier: 3,
  label_collision_cell_h: 32,
  label_collision_cell_w: 72,
  label_min_pop_base: 500000,
  tile_fetch_zoom_threshold: 3.5,
  tile_max_cities_per_tile: 2500,
}

export let DEFAULT_OPTIMISATION_CONFIG: OptimisationConfig = {
  downsampling_method: 'sum',
  downsampling_resolution: [1920, 1080],
  enabled: true,
  resource_limits: DEFAULT_RESOURCE_LIMITS_CONFIG,
  stadester_scaling: DEFAULT_STADESTER_SCALING_CONFIG,
}

let cached_mtime = 0
let cached_opt_info: OptimisationInfo | null = null

/**
 * Returns current downsampling and optimisation configuration, tracking file modification timestamp.
 *
 * @returns {OptimisationInfo}
 */
export function getOptimisationConfig (): OptimisationInfo {
  //Declare local instance variables
  let config: OptimisationConfig = DEFAULT_OPTIMISATION_CONFIG
  let config_path = path.resolve(process.cwd(), 'common/optimisation/optimisation.json5')
  let current_mtime = 0
  let dst_h = 1080
  let dst_w = 1920

  //Function body
  try {
    if (typeof fs !== 'undefined' && fs.existsSync && fs.existsSync(config_path)) {
      let st = fs.statSync(config_path)
      current_mtime = st.mtimeMs

      if (cached_opt_info && cached_mtime === current_mtime)
        return cached_opt_info

      let raw = fs.readFileSync(config_path, 'utf8')
      config = JSON5.parse(raw)
      cached_mtime = current_mtime
    }
  } catch (arg0_err) {
    console.error('[OptimisationConfig] Error reading optimisation.json5:', arg0_err)
  }

  if (Array.isArray(config.downsampling_resolution) && config.downsampling_resolution.length >= 2) {
    dst_w = config.downsampling_resolution[0]
    dst_h = config.downsampling_resolution[1]
  }

  cached_opt_info = {
    config,
    height: dst_h,
    mtimeMs: current_mtime,
    width: dst_w,
  }

  //Return statement
  return cached_opt_info
}
