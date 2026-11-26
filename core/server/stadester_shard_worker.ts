import { parentPort, workerData } from 'node:worker_threads'
import { compileRawShardToBinary } from './stadester_binary_builder.ts'

interface ShardWorkerTask {
  detail_path: string
  idx_path: string
  shard_path: string
  slug?: string
  task_id?: number
}

/**
 * Executes a single Stage A raw JSON shard compilation task and posts the summary back to the parent thread.
 *
 * @param {ShardWorkerTask} arg0_task
 *
 * @returns {void}
 */
function runShardTask (arg0_task: ShardWorkerTask): void {
  //Convert from parameters
  let task = arg0_task

  //Function body
  try {
    let count = compileRawShardToBinary(task.shard_path, task.idx_path, task.detail_path)
    parentPort?.postMessage({ count, ok: true, slug: task.slug, task_id: task.task_id })
  } catch (arg0_err: any) {
    parentPort?.postMessage({
      error: arg0_err?.message || String(arg0_err),
      ok: false,
      slug: task.slug,
      task_id: task.task_id,
    })
  }
}

//Support persistent pooled messaging (loads GHSL.csv once per worker) and legacy one-shot workerData
if (workerData && workerData.shard_path) {
  runShardTask(workerData as ShardWorkerTask)
} else if (parentPort) {
  parentPort.on('message', (arg0_msg: ShardWorkerTask | { type: 'EXIT' }) => {
    if (!arg0_msg || (arg0_msg as any).type === 'EXIT') {
      process.exit(0)
      return
    }
    runShardTask(arg0_msg as ShardWorkerTask)
  })
}
