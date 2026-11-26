import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'node:worker_threads'
import {
  DEFAULT_RESOURCE_LIMITS_CONFIG,
  DEFAULT_STADESTER_SCALING_CONFIG,
  getOptimisationConfig,
} from '../../common/optimisation/optimisation.ts'
import { FilepathDefines } from './filepath_defines.ts'
import { getDefaultStadesterDatasetId } from './stadester_config_loader.ts'
import { resolveDatasetSourceFiles } from './stadester_loader.ts'
import { getCityMetadataSignature } from './stadester_metadata.ts'
import {
  BINARY_FORMAT_VERSION,
  BINARY_MAGIC,
  readSectionedBinaryFile,
  readSectionedBinaryFileAsync,
  toTypedArray,
  type BinaryBuildManifest,
  type BinaryDatasetStore,
} from './stadester_binary_format.ts'
import { buildGlobalBinaryIndex, compileRawShardToBinary } from './stadester_binary_builder.ts'

export interface CompileDatasetSummary {
  compiled_shards: number
  duration_ms: number
  hot_index_path: string
  skipped_shards: number
  total_entries: number
}

export interface BinaryStoreLoadResult {
  cache_status: 'compiled' | 'hit' | 'stale-revalidating'
  store: BinaryDatasetStore | null
}

let active_binary_compiles = new Set<string>()
let binary_store_cache = new Map<string, BinaryDatasetStore>()
let compiler_yield_sab = new Int32Array(new SharedArrayBuffer(4))
let in_flight_bg_compiles = new Map<string, Promise<BinaryDatasetStore | null>>()
let in_flight_disk_loads = new Map<string, Promise<BinaryDatasetStore | null>>()
let on_store_swapped_listeners = new Set<(arg0_dataset_stem: string) => void>()

/**
 * Registers a callback notified whenever a background compilation atomically swaps a refreshed binary store into RAM.
 *
 * @param {(arg0_dataset_stem: string) => void} arg0_listener
 *
 * @returns {void}
 */
export function registerBinaryStoreSwapListener (arg0_listener: (arg0_dataset_stem: string) => void): void {
  //Function body
  on_store_swapped_listeners.add(arg0_listener)
}


/**
 * Clears cached in-memory binary stores for Stadestér datasets.
 *
 * @returns {void}
 */
export function clearBinaryStoreCache (): void {
  //Function body
  binary_store_cache.clear()
}


/**
 * Computes a fast filesystem signature string (`size:mtimeMs`) for change detection.
 *
 * @param {string} arg0_file_path
 *
 * @returns {string}
 */
function getFileSignature (arg0_file_path: string): string {
  //Convert from parameters
  let file_path = arg0_file_path

  //Guard clauses
  if (!file_path || !fs.existsSync(file_path))
    return 'missing'

  //Function body
  try {
    let st = fs.statSync(file_path)
    //Return statement
    return `${st.size}:${Math.round(st.mtimeMs)}`
  } catch {
    //Return statement
    return 'error'
  }
}


/**
 * Yields the calling thread briefly during synchronous CLI compilation so host UI frames keep scheduling.
 *
 * @param {number} arg0_ms
 *
 * @returns {void}
 */
function yieldCompilerThread (arg0_ms: number): void {
  //Convert from parameters
  let ms = Math.max(0, Math.min(250, arg0_ms))

  //Guard clauses
  if (ms <= 0)
    return

  //Function body
  try {
    Atomics.wait(compiler_yield_sab, 0, 0, ms)
  } catch {}
}


/**
 * Applies OS scheduling priority and returns configured RAM/yield/concurrency limits for Stadestér compilation.
 *
 * @returns {{ compile_concurrency: number; compiler_max_heap_mb: number; compiler_yield_ms: number; thin_rel_tol: number }}
 */
function applyCompilerResourceLimits (): {
  compile_concurrency: number
  compiler_max_heap_mb: number
  compiler_yield_ms: number
  thin_rel_tol: number
} {
  //Declare local instance variables
  let opt = getOptimisationConfig().config
  let limits = opt.resource_limits || DEFAULT_RESOURCE_LIMITS_CONFIG
  let scaling = opt.stadester_scaling || DEFAULT_STADESTER_SCALING_CONFIG
  let use_below_normal = limits.compiler_below_normal_priority ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_below_normal_priority
  let max_heap_mb = limits.compiler_max_heap_mb ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_max_heap_mb
  let yield_ms = limits.compiler_yield_ms ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_yield_ms
  let compile_concurrency = Math.max(1, scaling.compile_concurrency ?? DEFAULT_STADESTER_SCALING_CONFIG.compile_concurrency)
  let thin_rel_tol = scaling.timeseries_log_thin_rel_tol ?? DEFAULT_STADESTER_SCALING_CONFIG.timeseries_log_thin_rel_tol

  //Function body
  if (use_below_normal) {
    try {
      os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
    } catch {}
  }

  //Return statement
  return {
    compile_concurrency,
    compiler_max_heap_mb: max_heap_mb,
    compiler_yield_ms: yield_ms,
    thin_rel_tol,
  }
}


/**
 * Assembles a zero-parse v3 `BinaryDatasetStore` view over loaded binary sections.
 *
 * @param {string} arg0_clean_stem
 * @param {string} arg1_dataset_cache_dir
 * @param {{ meta: Record<string, any>; sections: Map<string, Buffer>; version: number }} arg2_loaded
 * @param {string} [arg3_alias_name]
 *
 * @returns {BinaryDatasetStore | null}
 */
function assembleBinaryStoreFromSections (
  arg0_clean_stem: string,
  arg1_dataset_cache_dir: string,
  arg2_loaded: { meta: Record<string, any>; sections: Map<string, Buffer>; version: number },
  arg3_alias_name?: string
): BinaryDatasetStore | null {
  //Convert from parameters
  let alias_name = arg3_alias_name
  let clean_stem = arg0_clean_stem
  let dataset_cache_dir = arg1_dataset_cache_dir
  let loaded = arg2_loaded

  //Guard clauses
  if (loaded.version !== BINARY_FORMAT_VERSION)
    return null

  //Declare local instance variables
  let meta = loaded.meta
  let sec = loaded.sections

  //Function body
  if (!sec.has('single_hist_year') || !sec.has('era_band_offs') || !sec.has('cap_city_off'))
    return null

  let store: BinaryDatasetStore = {
    build_time_ms: Number(meta.build_time_ms || Date.now()),
    cap_city_len: toTypedArray(sec.get('cap_city_len')!, Uint16Array, 2),
    cap_city_off: toTypedArray(sec.get('cap_city_off')!, Uint32Array, 4),
    cap_date_buf: sec.get('cap_date_buf')!,
    cap_date_off: toTypedArray(sec.get('cap_date_off')!, Uint32Array, 4),
    cap_state_id: toTypedArray(sec.get('cap_state_id')!, Int32Array, 4),
    cap_year_frac: toTypedArray(sec.get('cap_year_frac')!, Float32Array, 4),
    capital_city_indices: toTypedArray(sec.get('capital_city_indices')!, Uint32Array, 4),
    cell_city_indices: toTypedArray(sec.get('cell_city_indices')!, Uint32Array, 4),
    count: Number(meta.count || 0),
    counterpart_idx: toTypedArray(sec.get('counterpart_idx')!, Int32Array, 4),
    country_buf: sec.get('country_buf')!,
    country_offsets: toTypedArray(sec.get('country_off')!, Uint32Array, 4),
    dataset_dir: dataset_cache_dir,
    detail_len: toTypedArray(sec.get('detail_len')!, Uint32Array, 4),
    detail_offset: toTypedArray(sec.get('detail_offset')!, Float64Array, 8),
    era_band_max_pop: toTypedArray(sec.get('era_band_max_pop')!, Float32Array, 4),
    era_band_offs: toTypedArray(sec.get('era_band_offs')!, Uint32Array, 4),
    era_city_indices: toTypedArray(sec.get('era_city_indices')!, Uint32Array, 4),
    fine_lens: toTypedArray(sec.get('fine_lens')!, Uint32Array, 4),
    fine_max_pop: toTypedArray(sec.get('fine_max_pop')!, Float32Array, 4),
    fine_offs: toTypedArray(sec.get('fine_offs')!, Uint32Array, 4),
    flags: sec.get('flags')!,
    hash_bucket_heads: toTypedArray(sec.get('hash_bucket_heads')!, Int32Array, 4),
    hash_entry_city: toTypedArray(sec.get('hash_entry_city')!, Uint32Array, 4),
    hash_entry_hashes: toTypedArray(sec.get('hash_entry_hashes')!, Uint32Array, 4),
    hash_entry_next: toTypedArray(sec.get('hash_entry_next')!, Int32Array, 4),
    hash_mask: Number(meta.hash_mask || 0),
    hist_city_len: toTypedArray(sec.get('hist_city_len')!, Uint16Array, 2),
    hist_city_off: toTypedArray(sec.get('hist_city_off')!, Uint32Array, 4),
    hist_date_buf: sec.get('hist_date_buf')!,
    hist_date_off: toTypedArray(sec.get('hist_date_off')!, Uint32Array, 4),
    hist_name_buf: sec.get('hist_name_buf')!,
    hist_name_off: toTypedArray(sec.get('hist_name_off')!, Uint32Array, 4),
    hist_year_frac: toTypedArray(sec.get('hist_year_frac')!, Float32Array, 4),
    id_buf: sec.get('id_buf')!,
    id_offsets: toTypedArray(sec.get('id_off')!, Uint32Array, 4),
    key_buf: sec.get('key_buf')!,
    key_offsets: toTypedArray(sec.get('key_off')!, Uint32Array, 4),
    lat: toTypedArray(sec.get('lat')!, Float32Array, 4),
    lon: toTypedArray(sec.get('lon')!, Float32Array, 4),
    macro_counts: toTypedArray(sec.get('macro_counts')!, Uint32Array, 4),
    macro_max_pop: toTypedArray(sec.get('macro_max_pop')!, Float32Array, 4),
    max_pop: toTypedArray(sec.get('max_pop')!, Float32Array, 4),
    max_year: toTypedArray(sec.get('max_year')!, Int16Array, 2),
    min_year: toTypedArray(sec.get('min_year')!, Int16Array, 2),
    name_buf: sec.get('name_buf')!,
    name_offsets: toTypedArray(sec.get('name_off')!, Uint32Array, 4),
    other_buf: sec.get('other_buf')!,
    other_offsets: toTypedArray(sec.get('other_off')!, Uint32Array, 4),
    pop_len: toTypedArray(sec.get('pop_len')!, Uint16Array, 2),
    pop_offset: toTypedArray(sec.get('pop_off')!, Uint32Array, 4),
    pop_vals: toTypedArray(sec.get('pop_vals')!, Float32Array, 4),
    pop_years: toTypedArray(sec.get('pop_years')!, Int16Array, 2),
    region_idx: toTypedArray(sec.get('region_idx')!, Uint16Array, 2),
    regions: Array.isArray(meta.regions) ? meta.regions : [],
    shard_files: Array.isArray(meta.shard_files) ? meta.shard_files : [],
    shard_idx: toTypedArray(sec.get('shard_idx')!, Uint16Array, 2),
    single_hist_year: toTypedArray(sec.get('single_hist_year')!, Int16Array, 2),
  }

  binary_store_cache.set(clean_stem, store)
  if (alias_name && alias_name !== clean_stem)
    binary_store_cache.set(alias_name, store)

  //Return statement
  return store
}


/**
 * Reads an already-compiled binary columnar store synchronously from disk without triggering recompilation.
 *
 * @param {string} arg0_clean_stem
 * @param {string} arg1_dataset_cache_dir
 * @param {string} arg2_hot_index_path
 * @param {string} [arg3_alias_name]
 *
 * @returns {BinaryDatasetStore | null}
 */
function readBinaryStoreFromDisk (
  arg0_clean_stem: string,
  arg1_dataset_cache_dir: string,
  arg2_hot_index_path: string,
  arg3_alias_name?: string
): BinaryDatasetStore | null {
  //Convert from parameters
  let alias_name = arg3_alias_name
  let clean_stem = arg0_clean_stem
  let dataset_cache_dir = arg1_dataset_cache_dir
  let hot_index_path = arg2_hot_index_path

  //Guard clauses
  if (!fs.existsSync(hot_index_path))
    return null

  //Function body
  try {
    let loaded = readSectionedBinaryFile(hot_index_path, BINARY_MAGIC)
    //Return statement
    return assembleBinaryStoreFromSections(clean_stem, dataset_cache_dir, loaded, alias_name)
  } catch (arg0_err) {
    console.warn(`[StadesterCompiler] Failed to read binary store for ${clean_stem}:`, arg0_err)
    //Return statement
    return null
  }
}


/**
 * Asynchronously reads an already-compiled v3 binary columnar store from disk with single-flight deduplication.
 *
 * @param {string} arg0_clean_stem
 * @param {string} arg1_dataset_cache_dir
 * @param {string} arg2_hot_index_path
 * @param {string} [arg3_alias_name]
 *
 * @returns {Promise<BinaryDatasetStore | null>}
 */
async function readBinaryStoreFromDiskAsync (
  arg0_clean_stem: string,
  arg1_dataset_cache_dir: string,
  arg2_hot_index_path: string,
  arg3_alias_name?: string
): Promise<BinaryDatasetStore | null> {
  //Convert from parameters
  let alias_name = arg3_alias_name
  let clean_stem = arg0_clean_stem
  let dataset_cache_dir = arg1_dataset_cache_dir
  let hot_index_path = arg2_hot_index_path

  //Guard clauses
  if (!fs.existsSync(hot_index_path))
    return null
  if (in_flight_disk_loads.has(clean_stem))
    return in_flight_disk_loads.get(clean_stem)!

  //Function body
  let load_promise = (async () => {
    try {
      let loaded = await readSectionedBinaryFileAsync(hot_index_path, BINARY_MAGIC)
      return assembleBinaryStoreFromSections(clean_stem, dataset_cache_dir, loaded, alias_name)
    } catch (arg0_err) {
      console.warn(`[StadesterCompiler] Failed to async-read binary store for ${clean_stem}:`, arg0_err)
      return null
    } finally {
      in_flight_disk_loads.delete(clean_stem)
    }
  })()

  in_flight_disk_loads.set(clean_stem, load_promise)

  //Return statement
  return load_promise
}


/**
 * Plans Stage A dirty vs skipped shards for a Stadestér dataset.
 *
 * @param {string} arg0_clean_stem
 * @param {{ force?: boolean; only_project?: string }} arg1_options
 *
 * @returns {object}
 */
function planDatasetShardCompilation (
  arg0_clean_stem: string,
  arg1_options: { force?: boolean; only_project?: string }
): {
  cache_manifest_path: string
  dataset_cache_dir: string
  dirty_tasks: Array<{ detail_path: string; idx_path: string; shard_path: string; slug: string }>
  hot_index_path: string
  manifest_path: string
  next_shards: BinaryBuildManifest['shards']
  only_project_key: string
  prev_manifest: BinaryBuildManifest | null
  shard_artifacts: Array<{ detail_path: string; idx_path: string }>
  skipped_shards: number
} {
  //Convert from parameters
  let clean_stem = arg0_clean_stem
  let options = arg1_options

  //Declare local instance variables
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let cache_manifest_path = path.join(dataset_cache_dir, 'cache_manifest.json')
  let dirty_tasks: Array<{ detail_path: string; idx_path: string; shard_path: string; slug: string }> = []
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')
  let manifest_path = path.join(dataset_cache_dir, 'build_manifest.json')
  let next_shards: BinaryBuildManifest['shards'] = {}
  let only_project_key = options.only_project ? String(options.only_project).trim().toUpperCase() : ''
  let prev_manifest: BinaryBuildManifest | null = null
  let shard_artifacts: Array<{ detail_path: string; idx_path: string }> = []
  let shards_dir = path.join(dataset_cache_dir, 'shards')
  let skipped_shards = 0
  let source_info = resolveDatasetSourceFiles(clean_stem)
  let target_project_files: Set<string> | null = null

  //Guard clauses
  if (source_info.files.length === 0)
    throw new Error(`Dataset sources not found for ${clean_stem}`)

  //Function body
  if (!fs.existsSync(shards_dir))
    fs.mkdirSync(shards_dir, { recursive: true })

  if (only_project_key && source_info.is_partitioned && source_info.manifest_path && fs.existsSync(source_info.manifest_path)) {
    try {
      let sman = JSON.parse(fs.readFileSync(source_info.manifest_path, 'utf-8'))
      let regs = Array.isArray(sman.regions) ? sman.regions : []
      for (let i = 0; i < regs.length; i++) {
        if (String(regs[i].key || '').toUpperCase() === only_project_key && Array.isArray(regs[i].files)) {
          target_project_files = new Set(regs[i].files.map((arg0_f: string) => path.basename(arg0_f, path.extname(arg0_f))))
          break
        }
      }
    } catch {}
  }

  if (!options.force && fs.existsSync(manifest_path)) {
    try {
      let parsed = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
      if (parsed && typeof parsed.shards === 'object')
        prev_manifest = parsed
    } catch {
      prev_manifest = null
    }
  }

  for (let i = 0; i < source_info.files.length; i++) {
    let src_file = source_info.files[i]
    let st = fs.statSync(src_file)
    let base_slug = path.basename(src_file, path.extname(src_file))
    let idx_rel = `${base_slug}.idx.bin`
    let detail_rel = `${base_slug}.detail.pack`
    let idx_path = path.join(shards_dir, idx_rel)
    let detail_path = path.join(shards_dir, detail_rel)
    let prev_entry = prev_manifest?.shards?.[base_slug]
    let has_cached_pair = fs.existsSync(idx_path) && fs.existsSync(detail_path)
    let is_excluded_by_project_scope = Boolean(target_project_files && !target_project_files.has(base_slug) && has_cached_pair)
    let is_shard_fresh = Boolean(
      is_excluded_by_project_scope ||
      (
        !options.force &&
        prev_entry &&
        prev_entry.size === st.size &&
        Math.round(prev_entry.mtime_ms) === Math.round(st.mtimeMs) &&
        has_cached_pair
      )
    )

    if (!is_shard_fresh) {
      dirty_tasks.push({ detail_path, idx_path, shard_path: src_file, slug: base_slug })
    } else {
      skipped_shards++
    }

    next_shards[base_slug] = {
      detail_file: detail_rel,
      idx_file: idx_rel,
      mtime_ms: is_excluded_by_project_scope && prev_entry ? prev_entry.mtime_ms : st.mtimeMs,
      size: is_excluded_by_project_scope && prev_entry ? prev_entry.size : st.size,
    }
    shard_artifacts.push({ detail_path, idx_path })
  }

  //Return statement
  return {
    cache_manifest_path,
    dataset_cache_dir,
    dirty_tasks,
    hot_index_path,
    manifest_path,
    next_shards,
    only_project_key,
    prev_manifest,
    shard_artifacts,
    skipped_shards,
  }
}


/**
 * Executes Stage B relinking and writes `build_manifest.json` + `cache_manifest.json`.
 *
 * @param {string} arg0_clean_stem
 * @param {string} arg1_dataset_name
 * @param {ReturnType<typeof planDatasetShardCompilation>} arg2_plan
 * @param {number} arg3_compiled_shards
 * @param {number} arg4_t_start
 * @param {number} arg5_thin_rel_tol
 * @param {{ force?: boolean; relink?: boolean }} arg6_options
 *
 * @returns {CompileDatasetSummary}
 */
function finalizeDatasetCompilation (
  arg0_clean_stem: string,
  arg1_dataset_name: string,
  arg2_plan: ReturnType<typeof planDatasetShardCompilation>,
  arg3_compiled_shards: number,
  arg4_t_start: number,
  arg5_thin_rel_tol: number,
  arg6_options: { force?: boolean; relink?: boolean }
): CompileDatasetSummary {
  //Convert from parameters
  let clean_stem = arg0_clean_stem
  let compiled_shards = arg3_compiled_shards
  let dataset_name = arg1_dataset_name
  let options = arg6_options
  let plan = arg2_plan
  let t_start = arg4_t_start
  let thin_rel_tol = arg5_thin_rel_tol

  //Declare local instance variables
  let bugged_path = FilepathDefines.get().filepaths.stadester_bugged_cities
  let cap_path = FilepathDefines.get().filepaths.stadester_capitals
  let bugged_sig = getFileSignature(bugged_path)
  let cap_sig = getFileSignature(cap_path)
  let meta_sig = getCityMetadataSignature(clean_stem)
  let needs_stage_b = Boolean(
    options.force ||
    options.relink ||
    compiled_shards > 0 ||
    !plan.prev_manifest ||
    plan.prev_manifest.version !== BINARY_FORMAT_VERSION ||
    plan.prev_manifest.metadata_sig !== meta_sig ||
    plan.prev_manifest.capitals_sig !== cap_sig ||
    plan.prev_manifest.bugged_sig !== bugged_sig ||
    (plan.prev_manifest.thin_rel_tol ?? -1) !== thin_rel_tol ||
    Object.keys(plan.prev_manifest.shards || {}).length !== Object.keys(plan.next_shards).length ||
    !fs.existsSync(plan.hot_index_path)
  )

  //Function body
  if (needs_stage_b && !active_binary_compiles.has(clean_stem)) {
    active_binary_compiles.add(clean_stem)
    try {
      buildGlobalBinaryIndex(clean_stem, plan.dataset_cache_dir, plan.shard_artifacts)
      binary_store_cache.delete(clean_stem)
      meta_sig = getCityMetadataSignature(clean_stem)
      cap_sig = getFileSignature(cap_path)
      bugged_sig = getFileSignature(bugged_path)
    } finally {
      active_binary_compiles.delete(clean_stem)
    }
  }

  let loaded_store = readBinaryStoreFromDisk(clean_stem, plan.dataset_cache_dir, plan.hot_index_path, dataset_name)
  let total_entries = loaded_store ? loaded_store.count : 0

  let new_manifest: BinaryBuildManifest = {
    bugged_sig,
    capitals_sig: cap_sig,
    compiled_at: new Date().toISOString(),
    metadata_sig: meta_sig,
    shards: plan.next_shards,
    thin_rel_tol,
    total_entries,
    version: BINARY_FORMAT_VERSION,
  }
  fs.writeFileSync(plan.manifest_path, JSON.stringify(new_manifest, null, 2), 'utf-8')
  fs.writeFileSync(plan.cache_manifest_path, JSON.stringify({
    capitals_sig: cap_sig,
    compiled_shards,
    metadata_sig: meta_sig,
    only_project: plan.only_project_key || null,
    shards: plan.next_shards,
    skipped_shards: plan.skipped_shards,
    thin_rel_tol,
    updated_at: new_manifest.compiled_at,
    version: BINARY_FORMAT_VERSION,
  }, null, 2), 'utf-8')

  let duration_ms = Date.now() - t_start
  if (compiled_shards > 0 || needs_stage_b) {
    console.log(`[StadesterCompiler] Built v${BINARY_FORMAT_VERSION} binary store for ${clean_stem}: ${total_entries} cities, ${compiled_shards} dirty / ${plan.skipped_shards} skipped shards in ${duration_ms}ms`)
  }

  //Return statement
  return {
    compiled_shards,
    duration_ms,
    hot_index_path: plan.hot_index_path,
    skipped_shards: plan.skipped_shards,
    total_entries,
  }
}


/**
 * Synchronously compiles a Stadestér dataset (used by CLI pre-compiler scripts).
 *
 * @param {string} [arg0_dataset_name]
 * @param {{ force?: boolean; only_project?: string; relink?: boolean }} [arg1_options]
 *
 * @returns {CompileDatasetSummary}
 */
export function compileStadesterDataset (
  arg0_dataset_name?: string,
  arg1_options?: { force?: boolean; only_project?: string; relink?: boolean }
): CompileDatasetSummary {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let options = (arg1_options) ? arg1_options : {}

  //Declare local instance variables
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let compiled_shards = 0
  let plan = planDatasetShardCompilation(clean_stem, options)
  let resource_limits = applyCompilerResourceLimits()
  let t_start = Date.now()

  //Function body
  for (let i = 0; i < plan.dirty_tasks.length; i++) {
    let task = plan.dirty_tasks[i]
    let shard_count = compileRawShardToBinary(task.shard_path, task.idx_path, task.detail_path)
    compiled_shards++
    console.log(`[StadesterCompiler] Compiled dirty shard ${task.slug} (${shard_count} cities)`)

    let heap_used_mb = process.memoryUsage().heapUsed/(1024*1024)
    if (heap_used_mb > resource_limits.compiler_max_heap_mb*0.75 && typeof globalThis.gc === 'function')
      globalThis.gc()
    yieldCompilerThread(resource_limits.compiler_yield_ms)
  }

  //Return statement
  return finalizeDatasetCompilation(clean_stem, dataset_name, plan, compiled_shards, t_start, resource_limits.thin_rel_tol, options)
}


/**
 * Asynchronously compiles dirty Stage A shards in parallel via a bounded `worker_threads` pool
 * (`compile_concurrency` from `optimisation.json5`), then runs Stage B relinking.
 *
 * @param {string} [arg0_dataset_name]
 * @param {{ force?: boolean; only_project?: string; relink?: boolean }} [arg1_options]
 *
 * @returns {Promise<CompileDatasetSummary>}
 */
export async function compileStadesterDatasetAsync (
  arg0_dataset_name?: string,
  arg1_options?: { force?: boolean; only_project?: string; relink?: boolean }
): Promise<CompileDatasetSummary> {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()
  let options = (arg1_options) ? arg1_options : {}

  //Declare local instance variables
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let compiled_shards = 0
  let plan = planDatasetShardCompilation(clean_stem, options)
  let resource_limits = applyCompilerResourceLimits()
  let t_start = Date.now()

  //Function body
  if (plan.dirty_tasks.length === 1 || resource_limits.compile_concurrency <= 1) {
    for (let i = 0; i < plan.dirty_tasks.length; i++) {
      let task = plan.dirty_tasks[i]
      let shard_count = compileRawShardToBinary(task.shard_path, task.idx_path, task.detail_path)
      compiled_shards++
      console.log(`[StadesterCompiler] Compiled dirty shard ${task.slug} (${shard_count} cities)`)
      await new Promise<void>((arg0_resolve) => setTimeout(arg0_resolve, Math.max(0, resource_limits.compiler_yield_ms)))
    }
  } else if (plan.dirty_tasks.length > 1) {
    let worker_url = new URL('./stadester_shard_worker.ts', import.meta.url)
    let cursor = 0
    let concurrency = Math.min(resource_limits.compile_concurrency, plan.dirty_tasks.length)
    let per_worker_heap = Math.max(2048, resource_limits.compiler_max_heap_mb)

    let runPooledWorker = async function (): Promise<void> {
      let w = new Worker(worker_url, {
        resourceLimits: { maxOldGenerationSizeMb: per_worker_heap },
      })
      try {
        for (let step = 0; step < plan.dirty_tasks.length; step++) {
          if (cursor >= plan.dirty_tasks.length)
            return
          let task = plan.dirty_tasks[cursor++]
          let shard_count = await new Promise<number>((arg0_resolve, arg1_reject) => {
            let onMessage = (arg0_msg: any) => {
              cleanup()
              if (arg0_msg && arg0_msg.ok)
                arg0_resolve(Number(arg0_msg.count || 0))
              else
                arg1_reject(new Error(arg0_msg?.error || `Shard worker failed for ${task.slug}`))
            }
            let onError = (arg0_err: Error) => {
              cleanup()
              arg1_reject(arg0_err)
            }
            let onExit = (arg0_code: number) => {
              cleanup()
              arg1_reject(new Error(`Shard worker exited with code ${arg0_code} for ${task.slug}`))
            }
            let cleanup = () => {
              w.off('message', onMessage)
              w.off('error', onError)
              w.off('exit', onExit)
            }
            w.on('message', onMessage)
            w.on('error', onError)
            w.on('exit', onExit)
            w.postMessage(task)
          })
          compiled_shards++
          console.log(`[StadesterCompiler] Compiled dirty shard ${task.slug} (${shard_count} cities)`)
        }
      } finally {
        await w.terminate().catch(() => {})
      }
    }

    let runners: Promise<void>[] = []
    for (let i = 0; i < concurrency; i++)
      runners.push(runPooledWorker())
    await Promise.all(runners)
  }

  //Return statement
  return finalizeDatasetCompilation(clean_stem, dataset_name, plan, compiled_shards, t_start, resource_limits.thin_rel_tol, options)
}


/**
 * Checks whether the compiled v3 binary store for a dataset is up to date against all shards, metadata, and thinning settings.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {boolean}
 */
export function isBinaryDatasetFresh (arg0_dataset_name?: string): boolean {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')
  let manifest_path = path.join(dataset_cache_dir, 'build_manifest.json')
  let opt_scaling = getOptimisationConfig().config?.stadester_scaling || DEFAULT_STADESTER_SCALING_CONFIG
  let source_info = resolveDatasetSourceFiles(clean_stem)
  let thin_rel_tol = opt_scaling.timeseries_log_thin_rel_tol ?? DEFAULT_STADESTER_SCALING_CONFIG.timeseries_log_thin_rel_tol

  //Guard clauses
  if (source_info.files.length === 0 || !fs.existsSync(manifest_path) || !fs.existsSync(hot_index_path))
    return false

  //Function body
  try {
    let manifest: BinaryBuildManifest = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
    if (!manifest || manifest.version !== BINARY_FORMAT_VERSION)
      return false
    if ((manifest.thin_rel_tol ?? -1) !== thin_rel_tol)
      return false
    if (Object.keys(manifest.shards || {}).length !== source_info.files.length)
      return false

    for (let i = 0; i < source_info.files.length; i++) {
      let src_file = source_info.files[i]
      let base_slug = path.basename(src_file, path.extname(src_file))
      let prev = manifest.shards[base_slug]
      if (!prev)
        return false
      let st = fs.statSync(src_file)
      if (prev.size !== st.size || Math.round(prev.mtime_ms) !== Math.round(st.mtimeMs))
        return false
    }

    let meta_sig = getCityMetadataSignature(clean_stem)
    let cap_sig = getFileSignature(FilepathDefines.get().filepaths.stadester_capitals)
    let bugged_sig = getFileSignature(FilepathDefines.get().filepaths.stadester_bugged_cities)

    //Return statement
    return (
      manifest.metadata_sig === meta_sig &&
      manifest.capitals_sig === cap_sig &&
      manifest.bugged_sig === bugged_sig
    )
  } catch {
    //Return statement
    return false
  }
}


/**
 * Spawns an off-thread `worker_threads` compilation worker for a dataset with single-flight deduplication,
 * then asynchronously reloads and atomically swaps the refreshed store into `binary_store_cache`.
 *
 * @param {string} arg0_clean_stem
 * @param {string} arg1_dataset_cache_dir
 * @param {string} arg2_hot_index_path
 * @param {string} [arg3_alias_name]
 *
 * @returns {Promise<BinaryDatasetStore | null>}
 */
function triggerBackgroundCompileWorker (
  arg0_clean_stem: string,
  arg1_dataset_cache_dir: string,
  arg2_hot_index_path: string,
  arg3_alias_name?: string
): Promise<BinaryDatasetStore | null> {
  //Convert from parameters
  let alias_name = arg3_alias_name
  let clean_stem = arg0_clean_stem
  let dataset_cache_dir = arg1_dataset_cache_dir
  let hot_index_path = arg2_hot_index_path

  //Guard clauses
  if (in_flight_bg_compiles.has(clean_stem))
    return in_flight_bg_compiles.get(clean_stem)!

  //Declare local instance variables
  let limits = getOptimisationConfig().config?.resource_limits || DEFAULT_RESOURCE_LIMITS_CONFIG
  let max_heap_mb = Math.max(4096, limits.compiler_max_heap_mb ?? DEFAULT_RESOURCE_LIMITS_CONFIG.compiler_max_heap_mb)
  let worker_url = new URL('./stadester_compile_worker.ts', import.meta.url)

  //Function body
  let bg_promise = (async () => {
    try {
      await new Promise<void>((arg0_resolve, arg1_reject) => {
        let w = new Worker(worker_url, {
          resourceLimits: { maxOldGenerationSizeMb: max_heap_mb },
          workerData: { dataset_name: clean_stem },
        })
        let settled = false
        w.on('message', (arg0_msg: any) => {
          if (settled)
            return
          settled = true
          if (arg0_msg && arg0_msg.ok)
            arg0_resolve()
          else
            arg1_reject(new Error(arg0_msg?.error || `Background compiler failed for ${clean_stem}`))
        })
        w.on('error', (arg0_err) => {
          if (!settled) {
            settled = true
            arg1_reject(arg0_err)
          }
        })
        w.on('exit', (arg0_code) => {
          if (!settled) {
            settled = true
            if (arg0_code === 0)
              arg0_resolve()
            else
              arg1_reject(new Error(`Background compiler exited with code ${arg0_code} for ${clean_stem}`))
          }
        })
      })

      let fresh_store = await readBinaryStoreFromDiskAsync(clean_stem, dataset_cache_dir, hot_index_path, alias_name)
      if (fresh_store) {
        for (let listener of on_store_swapped_listeners) {
          try {
            listener(clean_stem)
          } catch {}
        }
      }
      return fresh_store
    } catch (arg0_err) {
      console.warn(`[StadesterCompiler] Off-thread compilation failed for ${clean_stem}:`, arg0_err)
      return binary_store_cache.get(clean_stem) || null
    } finally {
      in_flight_bg_compiles.delete(clean_stem)
    }
  })()

  in_flight_bg_compiles.set(clean_stem, bg_promise)

  //Return statement
  return bg_promise
}


/**
 * Asynchronously loads the v3 binary columnar store without ever freezing the HTTP event loop.
 * When `background_recompile` is enabled and a valid v3 `hot_index.bin` already exists on disk,
 * immediately serves the stale store while recompiling off-thread and atomically swapping upon completion.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {Promise<BinaryStoreLoadResult>}
 */
export async function loadBinaryStoreAsync (arg0_dataset_name?: string): Promise<BinaryStoreLoadResult> {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')
  let opt_scaling = getOptimisationConfig().config?.stadester_scaling || DEFAULT_STADESTER_SCALING_CONFIG
  let allow_bg_recompile = opt_scaling.background_recompile !== false

  //Guard clauses
  if (binary_store_cache.has(clean_stem)) {
    return {
      cache_status: in_flight_bg_compiles.has(clean_stem) ? 'stale-revalidating' : 'hit',
      store: binary_store_cache.get(clean_stem)!,
    }
  }

  //Function body
  let is_fresh = isBinaryDatasetFresh(clean_stem)
  if (is_fresh) {
    let loaded = await readBinaryStoreFromDiskAsync(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)
    if (loaded) {
      return {
        cache_status: 'hit',
        store: loaded,
      }
    }
  }

  //Stale-while-revalidate: serve existing v3 hot_index.bin immediately while recompiling in background worker
  if (allow_bg_recompile && fs.existsSync(hot_index_path)) {
    let stale_store = await readBinaryStoreFromDiskAsync(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)
    if (stale_store) {
      void triggerBackgroundCompileWorker(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)
      return {
        cache_status: 'stale-revalidating',
        store: stale_store,
      }
    }
  }

  //No compatible v3 hot_index.bin exists yet: compile off-thread without blocking the HTTP event loop
  let compiled_store = await triggerBackgroundCompileWorker(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)

  //Return statement
  return {
    cache_status: 'compiled',
    store: compiled_store,
  }
}


/**
 * Synchronously loads (and incrementally compiles if needed) the binary columnar store into memory.
 * Retained for CLI tools and legacy synchronous callers; HTTP routes should prefer `loadBinaryStoreAsync()`.
 *
 * @param {string} [arg0_dataset_name]
 *
 * @returns {BinaryDatasetStore | null}
 */
export function loadBinaryStore (arg0_dataset_name?: string): BinaryDatasetStore | null {
  //Convert from parameters
  let dataset_name = (arg0_dataset_name) ? arg0_dataset_name : getDefaultStadesterDatasetId()

  //Declare local instance variables
  let cache_root = FilepathDefines.get().root_folders.l_stad_cache
  let clean_stem = dataset_name.endsWith('.json') ? dataset_name.slice(0, -5) : dataset_name
  let dataset_cache_dir = path.join(cache_root, clean_stem)
  let hot_index_path = path.join(dataset_cache_dir, 'hot_index.bin')

  //Guard clauses
  if (binary_store_cache.has(clean_stem))
    return binary_store_cache.get(clean_stem)!

  //Function body
  if (!isBinaryDatasetFresh(clean_stem) && !active_binary_compiles.has(clean_stem)) {
    try {
      compileStadesterDataset(clean_stem)
    } catch (arg0_err) {
      console.warn(`[StadesterCompiler] Binary compilation failed for ${clean_stem}:`, arg0_err)
      if (!fs.existsSync(hot_index_path))
        return null
    }
  }

  //Return statement
  return readBinaryStoreFromDisk(clean_stem, dataset_cache_dir, hot_index_path, dataset_name)
}
