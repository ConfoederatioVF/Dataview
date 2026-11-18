import { compileStadesterDataset } from '../core/server/stadester_compiler.ts'
import { getDefaultStadesterDatasetId } from '../core/server/stadester_config_loader.ts'

/**
 * CLI entrypoint for incremental CI/CD pre-compilation of Stadestér binary spatial-LOD caches.
 *
 * Usage:
 *   node ./scripts/compile_stadester.ts [dataset_id] [--force] [--relink]
 */
let runCli = function (): void {
  //Declare local instance variables
  let args = process.argv.slice(2)
  let dataset_id = ''
  let force = false
  let relink = false

  //Function body
  for (let i = 0; i < args.length; i++) {
    let arg = args[i]
    if (arg === '--force' || arg === '-f') {
      force = true
    } else if (arg === '--relink') {
      relink = true
    } else if (!arg.startsWith('-') && !dataset_id) {
      dataset_id = arg
    }
  }

  if (!dataset_id)
    dataset_id = getDefaultStadesterDatasetId()

  console.log(`[CompileStadester] Compiling dataset '${dataset_id}' (force=${force}, relink=${relink})...`)
  let summary = compileStadesterDataset(dataset_id, { force, relink })
  console.log(
    `[CompileStadester] Done: ${summary.total_entries} settlements, ` +
    `${summary.compiled_shards} dirty shards compiled in ${summary.duration_ms}ms -> ${summary.hot_index_path}`
  )
}

runCli()
