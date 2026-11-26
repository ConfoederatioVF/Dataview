import { parentPort, workerData } from 'node:worker_threads'
import { compileStadesterDatasetAsync } from './stadester_compiler.ts'

/**
 * Background worker entrypoint that incrementally compiles Stadestér binary caches completely off the HTTP event loop.
 */
let runCompileWorker = async function (): Promise<void> {
  //Declare local instance variables
  let data = (workerData || {}) as {
    dataset_name?: string
    force?: boolean
    only_project?: string
    relink?: boolean
  }

  //Function body
  try {
    let summary = await compileStadesterDatasetAsync(data.dataset_name, {
      force: data.force,
      only_project: data.only_project,
      relink: data.relink,
    })
    parentPort?.postMessage({
      ok: true,
      summary,
    })
  } catch (arg0_err: any) {
    parentPort?.postMessage({
      error: arg0_err?.message || String(arg0_err),
      ok: false,
    })
  }
}

void runCompileWorker()
