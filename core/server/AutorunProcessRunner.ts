import { spawn, type ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'
import path from 'path'
import { AutorunTui, type AutorunConfig, type AutorunDictionary } from './AutorunTui.ts'

export interface ChildRunOutcome {
  duration_ms: number
  exit_code: number | null
  is_oom: boolean
  oom_reason: string
  signal: NodeJS.Signals | null
}

let OOM_EXIT_CODES = new Set<number>([
  3,
  134,
  137,
  139,
  -536870904,
  -1073740791,
  -1073741801,
  -2147483645,
  2147483651,
  3221225495,
  3221226505,
  3758096392,
])

let OOM_TEXT_PATTERNS = [
  'Allocation failed',
  'ArrayBuffer allocation failed',
  'ERR_WORKER_OUT_OF_MEMORY',
  'FatalProcessOutOfMemory',
  'Ineffective mark-compacts near heap limit',
  'JavaScript heap out of memory',
  'Last few GCs',
  'OOMError',
  'OutOfMemory',
  'ZoneAllocationFailure',
]


/**
 * AutorunProcessRunner handles child Node/Vite process execution, V8 OOM crash detection,
 * diagnostic report cleanup, TCP port readiness checks and cross-platform process-tree termination.
 */
export class AutorunProcessRunner {
  active_child: ChildProcess | null = null
  child_started_ms = 0
  config: AutorunConfig
  root_dir: string


  /**
   * Creates a process runner bound to the repository root and autorun configuration.
   *
   * @param {string} arg0_root_dir
   * @param {AutorunConfig} arg1_config
   */
  constructor (arg0_root_dir: string, arg1_config: AutorunConfig) {
    //Convert from parameters
    let root_dir = arg0_root_dir
    let config = arg1_config

    //Function body
    this.root_dir = root_dir
    this.config = config
  }


  /**
   * Classifies a child process exit using output inspection, Node diagnostic reports and exit codes.
   *
   * @param {number | null} arg0_exit_code
   * @param {NodeJS.Signals | null} arg1_signal
   * @param {string} arg2_recent_output
   * @param {string} arg3_report_path
   *
   * @returns {{ is_oom: boolean; oom_reason: string }}
   */
  classifyChildExit (
    arg0_exit_code: number | null,
    arg1_signal: NodeJS.Signals | null,
    arg2_recent_output: string,
    arg3_report_path: string
  ): { is_oom: boolean; oom_reason: string } {
    //Convert from parameters
    let exit_code = arg0_exit_code
    let signal = arg1_signal
    let recent_output = arg2_recent_output
    let report_path = arg3_report_path

    //Declare local instance variables
    let had_report = false
    let is_oom = false
    let lower_output = recent_output.toLowerCase()
    let oom_reason = ''

    //Function body
    for (let i = 0; i < OOM_TEXT_PATTERNS.length; i++) {
      if (lower_output.includes(OOM_TEXT_PATTERNS[i].toLowerCase())) {
        is_oom = true
        oom_reason = OOM_TEXT_PATTERNS[i]
        break
      }
    }

    if (fs.existsSync(report_path)) {
      had_report = true
      try {
        let raw_report = fs.readFileSync(report_path, 'utf8')
        let lower_report = raw_report.toLowerCase()
        for (let i = 0; i < OOM_TEXT_PATTERNS.length; i++) {
          if (lower_report.includes(OOM_TEXT_PATTERNS[i].toLowerCase())) {
            is_oom = true
            if (!oom_reason)
              oom_reason = `report:${OOM_TEXT_PATTERNS[i]}`
            break
          }
        }
      } catch {}

      try {
        fs.unlinkSync(report_path)
      } catch {}
    }

    if (!is_oom && !had_report) {
      if (signal === 'SIGABRT' || signal === 'SIGKILL' || signal === 'SIGSEGV' || signal === 'SIGBUS') {
        is_oom = true
        oom_reason = `signal ${signal}`
      } else if (exit_code !== null && OOM_EXIT_CODES.has(exit_code)) {
        is_oom = true
        oom_reason = `exit ${exit_code}`
      }
    }

    //Return statement
    return {
      is_oom: is_oom,
      oom_reason: oom_reason ? oom_reason : `code ${exit_code ?? signal ?? 'unknown'}`,
    }
  }


  /**
   * Ensures the OOM diagnostic directory exists and deletes any expired .oom_report_*.json files.
   *
   * @returns {void}
   */
  cleanupStaleOomReports (): void {
    //Declare local instance variables
    let all_dirs = [
      this.root_dir,
      path.resolve(this.root_dir, this.config.oom_report_dir),
    ]

    //Function body
    try {
      fs.mkdirSync(path.resolve(this.root_dir, this.config.oom_report_dir), { recursive: true })
    } catch {}

    for (let i = 0; i < all_dirs.length; i++) {
      try {
        if (!fs.existsSync(all_dirs[i]))
          continue
        let entries_array = fs.readdirSync(all_dirs[i])
        for (let x = 0; x < entries_array.length; x++) {
          if (entries_array[x].startsWith('.oom_report_') && entries_array[x].endsWith('.json')) {
            try {
              fs.unlinkSync(path.join(all_dirs[i], entries_array[x]))
            } catch {}
          }
        }
      } catch {}
    }
  }


  /**
   * Probes whether a local TCP port can be bound without EADDRINUSE conflict.
   *
   * @param {number} arg0_port
   *
   * @returns {Promise<boolean>}
   */
  isPortAvailable (arg0_port: number): Promise<boolean> {
    //Convert from parameters
    let port = arg0_port

    //Return statement
    return new Promise((arg0_resolve) => {
      let probe_server = net.createServer()
      probe_server.unref()
      probe_server.once('error', () => {
        arg0_resolve(false)
      })
      probe_server.listen({ port: port, host: '0.0.0.0' }, () => {
        probe_server.close(() => {
          arg0_resolve(true)
        })
      })
    })
  }


  /**
   * Opens the specified URL in the operating system's default web browser.
   *
   * @param {string} arg0_url
   *
   * @returns {void}
   */
  openUrlInBrowser (arg0_url: string): void {
    //Convert from parameters
    let url = arg0_url

    //Declare local instance variables
    let child: ChildProcess

    //Function body
    try {
      if (process.platform === 'win32') {
        child = spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' })
      } else if (process.platform === 'darwin') {
        child = spawn('open', [url], { detached: true, stdio: 'ignore' })
      } else {
        child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
      }
      child.unref()
    } catch {}
  }


  /**
   * Executes the two-step production build pipeline (tsc -b followed by vite build).
   *
   * @param {AutorunDictionary} arg0_dict
   * @param {() => boolean} arg1_is_interrupted
   *
   * @returns {Promise<ChildRunOutcome>}
   */
  async runBuildPipeline (arg0_dict: AutorunDictionary, arg1_is_interrupted: () => boolean): Promise<ChildRunOutcome> {
    //Convert from parameters
    let dict = arg0_dict
    let is_interrupted = arg1_is_interrupted

    //Declare local instance variables
    let tsc_outcome: ChildRunOutcome
    let vite_build_outcome: ChildRunOutcome

    //Function body
    process.stdout.write(`\n${AutorunTui.colourWhiteBold(`[BUILD] ${dict.buildingBundle}`)}\n\n`)

    tsc_outcome = await this.runSingleChildProcess([
      './node_modules/typescript/bin/tsc',
      '-b',
    ])
    if (tsc_outcome.exit_code !== 0 || is_interrupted())
      return tsc_outcome

    vite_build_outcome = await this.runSingleChildProcess([
      './node_modules/vite/bin/vite.js',
      'build',
    ])

    //Return statement
    return {
      duration_ms: tsc_outcome.duration_ms + vite_build_outcome.duration_ms,
      exit_code: vite_build_outcome.exit_code,
      is_oom: vite_build_outcome.is_oom,
      oom_reason: vite_build_outcome.oom_reason,
      signal: vite_build_outcome.signal,
    }
  }


  /**
   * Spawns a single Node.js child command with V8 heap limits, crash reporting and streaming output.
   *
   * @param {string[]} arg0_node_args
   *
   * @returns {Promise<ChildRunOutcome>}
   */
  runSingleChildProcess (arg0_node_args: string[]): Promise<ChildRunOutcome> {
    //Convert from parameters
    let node_args = arg0_node_args

    //Declare local instance variables
    let oom_dir_abs = path.resolve(this.root_dir, this.config.oom_report_dir)
    let oom_dir_posix = oom_dir_abs.replace(/\\/g, '/')
    let oom_report_name = `.oom_report_${process.pid}_${Date.now()}.json`
    let oom_report_path = path.join(oom_dir_abs, oom_report_name)

    //Function body
    try {
      fs.mkdirSync(oom_dir_abs, { recursive: true })
    } catch {}

    //Return statement
    return new Promise((arg0_resolve) => {
      let child_env: NodeJS.ProcessEnv = {
        ...process.env,
        FORCE_COLOR: process.env.NO_COLOR !== undefined ? '0' : '1',
        NODE_OPTIONS: [
          `--max-old-space-size=${this.config.max_old_space_size_mb}`,
          '--report-on-fatalerror',
          '--report-uncaught-exception',
          '--report-exclude-env',
          '--report-exclude-network',
          `--report-dir=${oom_dir_posix}`,
          `--report-filename=${oom_report_name}`,
        ].join(' '),
      }
      let recent_output = ''
      let settled = false
      let start_ms = Date.now()

      let appendRecent = (arg0_buf: Buffer) => {
        let text = arg0_buf.toString('utf8')
        recent_output += text
        if (recent_output.length > 16384)
          recent_output = recent_output.slice(recent_output.length - 16384)
      }

      let child = spawn(process.execPath, node_args, {
        cwd: this.root_dir,
        env: child_env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      this.active_child = child
      this.child_started_ms = start_ms

      if (child.stdout) {
        child.stdout.on('data', (arg0_chunk: Buffer) => {
          appendRecent(arg0_chunk)
          process.stdout.write(arg0_chunk)
        })
      }
      if (child.stderr) {
        child.stderr.on('data', (arg0_chunk: Buffer) => {
          appendRecent(arg0_chunk)
          process.stderr.write(arg0_chunk)
        })
      }

      let finishChild = (arg0_code: number | null, arg1_signal: NodeJS.Signals | null) => {
        if (settled)
          return
        settled = true
        this.active_child = null
        let duration_ms = Date.now() - start_ms
        let classification = this.classifyChildExit(arg0_code, arg1_signal, recent_output, oom_report_path)
        arg0_resolve({
          duration_ms: duration_ms,
          exit_code: arg0_code,
          is_oom: classification.is_oom,
          oom_reason: classification.oom_reason,
          signal: arg1_signal,
        })
      }

      child.once('error', (arg0_err) => {
        console.error('[AutorunProcessRunner] Child spawn error:', arg0_err)
        finishChild(1, null)
      })
      child.once('close', (arg0_code, arg1_signal) => {
        finishChild(arg0_code, arg1_signal)
      })
    })
  }


  /**
   * Cleanly terminates the active child process tree across Windows and POSIX platforms.
   *
   * @returns {Promise<void>}
   */
  terminateChildProcess (): Promise<void> {
    //Declare local instance variables
    let child = this.active_child

    //Guard clauses
    if (!child || child.exitCode !== null)
      return Promise.resolve()

    //Return statement
    return new Promise((arg0_resolve) => {
      let pid = child.pid
      let resolved = false

      let finish = () => {
        if (resolved)
          return
        resolved = true
        arg0_resolve()
      }

      child.once('close', finish)

      if (process.platform === 'win32' && pid) {
        let killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
        killer.once('error', () => {
          try {
            child.kill('SIGTERM')
          } catch {}
        })
      } else {
        try {
          child.kill('SIGTERM')
        } catch {}
      }

      setTimeout(() => {
        if (!resolved) {
          try {
            child.kill('SIGKILL')
          } catch {}
          finish()
        }
      }, 2000)
    })
  }
}
