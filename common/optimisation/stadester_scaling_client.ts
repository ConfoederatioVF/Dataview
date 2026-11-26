import JSON5 from 'json5'
import rawOptimisationConfig from './optimisation.json5?raw'
import { onConfigUpdate } from '@framework/config/config_hot_reload'

export interface ClientStadesterScalingConfig {
  enable_progressive_streaming: boolean
  enable_viewport_tiles: boolean
  stream_chunk_size: number
  stream_initial_chunk_size: number
  stream_min_cities_threshold: number
  tile_fetch_zoom_threshold: number
  tile_max_cities_per_tile: number
  worker_chunk_coalesce_ms: number
  worker_defer_during_interaction_ms: number
}

let DEFAULT_CLIENT_SCALING: ClientStadesterScalingConfig = {
  enable_progressive_streaming: true,
  enable_viewport_tiles: true,
  stream_chunk_size: 3000,
  stream_initial_chunk_size: 400,
  stream_min_cities_threshold: 4001,
  tile_fetch_zoom_threshold: 3.5,
  tile_max_cities_per_tile: 2500,
  worker_chunk_coalesce_ms: 120,
  worker_defer_during_interaction_ms: 250,
}

/**
 * Parses browser-safe Stadestér scaling fields from raw optimisation JSON5 config.
 *
 * @param {any} arg0_parsed
 *
 * @returns {ClientStadesterScalingConfig}
 */
function extractClientScaling (arg0_parsed: any): ClientStadesterScalingConfig {
  //Convert from parameters
  let parsed = arg0_parsed

  //Declare local instance variables
  let s = parsed?.stadester_scaling || {}

  //Return statement
  return {
    enable_progressive_streaming: s.enable_progressive_streaming !== false,
    enable_viewport_tiles: s.enable_viewport_tiles !== false,
    stream_chunk_size: Number.isFinite(Number(s.stream_chunk_size)) ? Number(s.stream_chunk_size) : DEFAULT_CLIENT_SCALING.stream_chunk_size,
    stream_initial_chunk_size: Number.isFinite(Number(s.stream_initial_chunk_size)) ? Number(s.stream_initial_chunk_size) : DEFAULT_CLIENT_SCALING.stream_initial_chunk_size,
    stream_min_cities_threshold: Number.isFinite(Number(s.stream_min_cities_threshold)) ? Number(s.stream_min_cities_threshold) : DEFAULT_CLIENT_SCALING.stream_min_cities_threshold,
    tile_fetch_zoom_threshold: Number.isFinite(Number(s.tile_fetch_zoom_threshold)) ? Number(s.tile_fetch_zoom_threshold) : DEFAULT_CLIENT_SCALING.tile_fetch_zoom_threshold,
    tile_max_cities_per_tile: Number.isFinite(Number(s.tile_max_cities_per_tile)) ? Number(s.tile_max_cities_per_tile) : DEFAULT_CLIENT_SCALING.tile_max_cities_per_tile,
    worker_chunk_coalesce_ms: Number.isFinite(Number(s.worker_chunk_coalesce_ms)) ? Number(s.worker_chunk_coalesce_ms) : DEFAULT_CLIENT_SCALING.worker_chunk_coalesce_ms,
    worker_defer_during_interaction_ms: Number.isFinite(Number(s.worker_defer_during_interaction_ms)) ? Number(s.worker_defer_during_interaction_ms) : DEFAULT_CLIENT_SCALING.worker_defer_during_interaction_ms,
  }
}

let initial_parsed: any = {}
try {
  initial_parsed = JSON5.parse(rawOptimisationConfig)
} catch {
  initial_parsed = {}
}

export let CLIENT_STADESTER_SCALING: ClientStadesterScalingConfig = extractClientScaling(initial_parsed)

onConfigUpdate('optimisation', (arg0_data: any) => {
  if (arg0_data)
    Object.assign(CLIENT_STADESTER_SCALING, extractClientScaling(arg0_data))
})
