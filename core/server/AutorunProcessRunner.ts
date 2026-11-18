import { spawn, spawnSync, type ChildProcess } from 'child_process'
import fs from 'fs'
import net from 'net'
import os from 'os'
import path from 'path'
import { AutorunTui, type AutorunConfig, type AutorunDictionary } from './AutorunTui.ts'

export interface ChildRunOutcome {
  duration_ms: number
  exit_code: number | null
  is_oom: boolean
  is_port_in_use: boolean
  oom_reason: string
  signal: NodeJS.Signals | null
}

export interface PortProcessInfo {
  command_line: string
  name: string
  parent_pid: number
  pid: number
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


let PORT_IN_USE_PATTERNS = [
  'eaddrinuse',
  'is already in use',
]


/**
 * AutorunProcessRunner handles child Node/Vite process execution, V8 OOM crash detection,
 * diagnostic report cleanup, TCP port readiness checks and cross-platform process-tree termination.
 */
export class AutorunProcessRunner {
  active_child: ChildProcess | null = null
  child_started_ms = 0
  config: AutorunConfig
  on_child_pid_change: ((arg0_pid: number | null) => void) | null = null
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
   * @returns {{ is_oom: boolean; is_port_in_use: boolean; oom_reason: string }}
   */
  classifyChildExit (
    arg0_exit_code: number | null,
    arg1_signal: NodeJS.Signals | null,
    arg2_recent_output: string,
    arg3_report_path: string
  ): { is_oom: boolean; is_port_in_use: boolean; oom_reason: string } {
    //Convert from parameters
    let exit_code = arg0_exit_code
    let signal = arg1_signal
    let recent_output = arg2_recent_output
    let report_path = arg3_report_path

    //Declare local instance variables
    let had_report = false
    let is_oom = false
    let is_port_in_use = false
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

    for (let i = 0; i < PORT_IN_USE_PATTERNS.length; i++) {
      if (lower_output.includes(PORT_IN_USE_PATTERNS[i])) {
        is_port_in_use = true
        if (!oom_reason)
          oom_reason = 'EADDRINUSE'
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

    if (!is_oom && !is_port_in_use && !had_report) {
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
      is_port_in_use: is_port_in_use,
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
   * Executes a short-lived diagnostic command without throwing and returns its stdout text.
   *
   * @param {string} arg0_command
   * @param {string[]} arg1_args
   * @param {number} [arg2_timeout_ms=5000]
   *
   * @returns {Promise<string>}
   */
  execQuietCommand (arg0_command: string, arg1_args: string[], arg2_timeout_ms: number = 5000): Promise<string> {
    //Convert from parameters
    let command = arg0_command
    let args = arg1_args
    let timeout_ms = Math.max(500, arg2_timeout_ms)

    //Return statement
    return new Promise((arg0_resolve) => {
      let child: ChildProcess
      let output = ''
      let settled = false
      let timer: NodeJS.Timeout

      let finish = (arg0_text: string) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        arg0_resolve(arg0_text)
      }

      try {
        child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] })
      } catch {
        finish('')
        return
      }

      timer = setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {}
        finish(output)
      }, timeout_ms)

      if (child.stdout) {
        child.stdout.on('data', (arg0_chunk: Buffer) => {
          output += arg0_chunk.toString('utf8')
        })
      }

      child.once('error', () => {
        finish('')
      })
      child.once('close', () => {
        finish(output)
      })
    })
  }


  /**
   * Collects the current process PID and its ancestor chain so cleanup never kills its own parent shell.
   *
   * @returns {Promise<Set<number>>}
   */
  async getAncestorPidSet (): Promise<Set<number>> {
    //Declare local instance variables
    let ancestors = new Set<number>()
    let cursor_pid = process.ppid

    //Function body
    ancestors.add(process.pid)
    if (process.ppid > 0)
      ancestors.add(process.ppid)

    if (process.platform === 'win32' && cursor_pid > 0) {
      let ps_script = `$anc = @(); $c = ${cursor_pid}; for ($i = 0; $i -lt 16 -and $c -gt 0; $i++) { $anc += $c; $w = Get-CimInstance Win32_Process -Filter "ProcessId = $c" -ErrorAction SilentlyContinue; if (-not $w -or [int]$w.ParentProcessId -le 0) { break }; $c = [int]$w.ParentProcessId }; $anc | ConvertTo-Json -Compress`
      let raw_json = (await this.execQuietCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps_script])).trim()
      if (raw_json) {
        try {
          let parsed = JSON.parse(raw_json)
          let list = Array.isArray(parsed) ? parsed : [parsed]
          for (let i = 0; i < list.length; i++) {
            if (typeof list[i] === 'number' && list[i] > 0)
              ancestors.add(list[i])
          }
          return ancestors
        } catch {}
      }
    }

    for (let i = 0; i < 16; i++) {
      if (!cursor_pid || cursor_pid <= 0)
        break
      let info = await this.inspectProcessByPid(cursor_pid)
      if (!info || !info.parent_pid || ancestors.has(info.parent_pid))
        break
      ancestors.add(info.parent_pid)
      cursor_pid = info.parent_pid
    }

    //Return statement
    return ancestors
  }


  /**
   * Lists OS processes currently listening on the given TCP port.
   *
   * @param {number} arg0_port
   *
   * @returns {Promise<PortProcessInfo[]>}
   */
  async inspectPortListeners (arg0_port: number): Promise<PortProcessInfo[]> {
    //Convert from parameters
    let port = Math.trunc(arg0_port)

    //Declare local instance variables
    let results: PortProcessInfo[] = []

    //Guard clauses
    if (!Number.isFinite(port) || port < 1 || port > 65535)
      return results

    //Function body
    if (process.platform === 'win32') {
      let ps_script = [
        `$pids = @(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | Where-Object { $_ -gt 0 })`,
        'if (-not $pids -or $pids.Count -eq 0) {',
        `  $pids = @(netstat -ano | ForEach-Object { if ($_ -match '^\\s*TCP\\s+\\S+:${port}\\s+\\S+\\s+(LISTEN|LISTENING|ABH\\S*|ABHOEREN)\\S*\\s+(\\d+)\\s*$') { [int]$matches[2] } } | Select-Object -Unique | Where-Object { $_ -gt 0 })`,
        '}',
        '$procs = @()',
        'foreach ($p in $pids) {',
        '  $w = Get-CimInstance Win32_Process -Filter "ProcessId = $p" -ErrorAction SilentlyContinue',
        '  if ($w) { $procs += [PSCustomObject]@{ pid = [int]$w.ProcessId; parent_pid = [int]$w.ParentProcessId; name = [string]$w.Name; command_line = [string]$w.CommandLine } }',
        '  else { $procs += [PSCustomObject]@{ pid = [int]$p; parent_pid = 0; name = ""; command_line = "" } }',
        '}',
        '$procs | ConvertTo-Json -Compress',
      ].join('; ')

      let raw_json = (await this.execQuietCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps_script])).trim()
      if (!raw_json)
        return results

      try {
        let parsed = JSON.parse(raw_json)
        let list = Array.isArray(parsed) ? parsed : [parsed]
        for (let i = 0; i < list.length; i++) {
          let item = list[i]
          if (item && typeof item.pid === 'number' && item.pid > 0) {
            results.push({
              command_line: typeof item.command_line === 'string' ? item.command_line : '',
              name: typeof item.name === 'string' ? item.name : '',
              parent_pid: typeof item.parent_pid === 'number' ? item.parent_pid : 0,
              pid: item.pid,
            })
          }
        }
      } catch {}

      return results
    }

    let lsof_out = await this.execQuietCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-Fp'])
    let pid_set = new Set<number>()
    let lines_array = lsof_out.split(/\r?\n/)
    for (let i = 0; i < lines_array.length; i++) {
      let line = lines_array[i].trim()
      if (line.startsWith('p')) {
        let parsed_pid = Number(line.slice(1))
        if (Number.isInteger(parsed_pid) && parsed_pid > 0)
          pid_set.add(parsed_pid)
      }
    }

    for (let pid_val of pid_set) {
      let proc_info = await this.inspectProcessByPid(pid_val)
      if (proc_info) {
        results.push(proc_info)
      } else {
        results.push({ command_line: '', name: '', parent_pid: 0, pid: pid_val })
      }
    }

    //Return statement
    return results
  }


  /**
   * Inspects a single OS process by PID for command line, name and parent PID.
   *
   * @param {number} arg0_pid
   *
   * @returns {Promise<PortProcessInfo | null>}
   */
  async inspectProcessByPid (arg0_pid: number): Promise<PortProcessInfo | null> {
    //Convert from parameters
    let pid = Math.trunc(arg0_pid)

    //Guard clauses
    if (!Number.isFinite(pid) || pid <= 0)
      return null

    //Function body
    if (process.platform === 'win32') {
      let ps_script = `$w = Get-CimInstance Win32_Process -Filter "ProcessId = ${pid}" -ErrorAction SilentlyContinue; if ($w) { [PSCustomObject]@{ pid = [int]$w.ProcessId; parent_pid = [int]$w.ParentProcessId; name = [string]$w.Name; command_line = [string]$w.CommandLine } | ConvertTo-Json -Compress }`
      let raw_json = (await this.execQuietCommand('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps_script])).trim()
      if (!raw_json)
        return null

      try {
        let parsed = JSON.parse(raw_json)
        if (parsed && typeof parsed.pid === 'number') {
          return {
            command_line: typeof parsed.command_line === 'string' ? parsed.command_line : '',
            name: typeof parsed.name === 'string' ? parsed.name : '',
            parent_pid: typeof parsed.parent_pid === 'number' ? parsed.parent_pid : 0,
            pid: parsed.pid,
          }
        }
      } catch {}

      return null
    }

    let ps_out = (await this.execQuietCommand('ps', ['-o', 'pid=,ppid=,comm=,args=', '-p', String(pid)])).trim()
    if (!ps_out)
      return null

    let match = ps_out.match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/)
    if (!match)
      return null

    //Return statement
    return {
      command_line: match[4] ? match[4] : '',
      name: match[3] ? match[3] : '',
      parent_pid: Number(match[2]),
      pid: Number(match[1]),
    }
  }


  /**
   * Checks whether a given OS PID currently exists.
   *
   * @param {number} arg0_pid
   *
   * @returns {boolean}
   */
  isPidAlive (arg0_pid: number): boolean {
    //Convert from parameters
    let pid = Math.trunc(arg0_pid)

    //Guard clauses
    if (!Number.isFinite(pid) || pid <= 0)
      return false

    //Function body
    try {
      process.kill(pid, 0)
      return true
    } catch (arg0_err: any) {
      //Return statement
      return Boolean(arg0_err && arg0_err.code === 'EPERM')
    }
  }


  /**
   * Probes whether a local TCP port can be bound on IPv4 and IPv6 without EADDRINUSE conflict.
   *
   * @param {number} arg0_port
   *
   * @returns {Promise<boolean>}
   */
  async isPortAvailable (arg0_port: number): Promise<boolean> {
    //Convert from parameters
    let port = arg0_port

    //Declare local instance variables
    let ipv4_free: boolean
    let ipv6_free: boolean
    let loopback_v4_busy = await this.probeConnectBusy(port, '127.0.0.1')
    let loopback_v6_busy: boolean
    let wildcard_free: boolean

    //Guard clauses
    if (loopback_v4_busy)
      return false

    //Function body
    loopback_v6_busy = await this.probeConnectBusy(port, '::1')
    if (loopback_v6_busy)
      return false

    wildcard_free = await this.probeHostBind(port, undefined, false)
    if (!wildcard_free)
      return false

    ipv4_free = await this.probeHostBind(port, '0.0.0.0', false)
    if (!ipv4_free)
      return false

    ipv6_free = await this.probeHostBind(port, '::', false)

    //Return statement
    return ipv6_free
  }


  /**
   * Determines whether an inspected process belongs to this Dataview workspace's autorun/Vite stack.
   *
   * @param {PortProcessInfo} arg0_proc
   * @param {Set<number>} [arg1_locked_pids]
   *
   * @returns {Promise<boolean>}
   */
  async isProjectOwnedProcess (arg0_proc: PortProcessInfo, arg1_locked_pids?: Set<number>): Promise<boolean> {
    //Convert from parameters
    let proc = arg0_proc
    let locked_pids = arg1_locked_pids ? arg1_locked_pids : new Set<number>()

    //Declare local instance variables
    let cmd_norm = proc.command_line.replace(/\\/g, '/').toLowerCase()
    let is_runner_cmd = Boolean(
      cmd_norm.includes('autorunsupervisor.ts') ||
      cmd_norm.includes('autorun.bat') ||
      cmd_norm.includes('autorun.sh') ||
      cmd_norm.includes('vite.js') ||
      cmd_norm.includes('typescript/bin/tsc')
    )
    let root_norm = this.root_dir.replace(/\\/g, '/').toLowerCase()

    //Guard clauses
    if (!is_runner_cmd)
      return false
    if (cmd_norm.includes(root_norm) || locked_pids.has(proc.pid))
      return true

    //Function body
    if (proc.parent_pid > 0) {
      let parent_info = await this.inspectProcessByPid(proc.parent_pid)
      if (parent_info) {
        let parent_cmd = parent_info.command_line.replace(/\\/g, '/').toLowerCase()
        if (
          parent_cmd.includes(root_norm) &&
          (
            parent_cmd.includes('autorun.bat') ||
            parent_cmd.includes('autorun.sh') ||
            parent_cmd.includes('autorunsupervisor.ts')
          )
        ) {
          return true
        }
        if (locked_pids.has(parent_info.pid))
          return true
      }
    }

    //Return statement
    return false
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
   * Probes whether an active TCP listener accepts connections on a loopback host and port.
   *
   * @param {number} arg0_port
   * @param {string} arg1_host
   *
   * @returns {Promise<boolean>}
   */
  probeConnectBusy (arg0_port: number, arg1_host: string): Promise<boolean> {
    //Convert from parameters
    let port = arg0_port
    let host = arg1_host

    //Return statement
    return new Promise((arg0_resolve) => {
      let settled = false
      let socket = net.connect({ host: host, port: port })

      let finish = (arg0_busy: boolean) => {
        if (settled)
          return
        settled = true
        clearTimeout(timer)
        socket.destroy()
        arg0_resolve(arg0_busy)
      }

      let timer = setTimeout(() => {
        finish(false)
      }, 250)

      socket.unref()
      socket.once('connect', () => {
        finish(true)
      })
      socket.once('error', () => {
        finish(false)
      })
    })
  }


  /**
   * Probes whether a TCP port can bind on a specific host address (or default wildcard when undefined).
   *
   * @param {number} arg0_port
   * @param {string | undefined} arg1_host
   * @param {boolean} arg2_ipv6_only
   *
   * @returns {Promise<boolean>}
   */
  probeHostBind (arg0_port: number, arg1_host: string | undefined, arg2_ipv6_only: boolean): Promise<boolean> {
    //Convert from parameters
    let port = arg0_port
    let host = arg1_host
    let ipv6_only = arg2_ipv6_only

    //Return statement
    return new Promise((arg0_resolve) => {
      let listen_opts: net.ListenOptions = host !== undefined
        ? { host: host, ipv6Only: ipv6_only, port: port }
        : { port: port }
      let probe_server = net.createServer()
      probe_server.unref()
      probe_server.once('error', (arg0_err: NodeJS.ErrnoException) => {
        if (arg0_err && (arg0_err.code === 'EAFNOSUPPORT' || arg0_err.code === 'EADDRNOTAVAIL')) {
          arg0_resolve(true)
          return
        }
        arg0_resolve(false)
      })
      probe_server.listen(listen_opts, () => {
        probe_server.close(() => {
          arg0_resolve(true)
        })
      })
    })
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
      is_port_in_use: vite_build_outcome.is_port_in_use,
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
        NODE_OPTIONS: `--max-old-space-size=${this.config.max_old_space_size_mb}`,
        UV_THREADPOOL_SIZE: String(this.config.uv_threadpool_size || 4),
      }
      let full_node_args: string[] = [
        `--max-old-space-size=${this.config.max_old_space_size_mb}`,
        '--report-on-fatalerror',
        '--report-uncaught-exception',
        '--report-exclude-env',
        '--report-exclude-network',
        `--report-dir=${oom_dir_abs}`,
        `--report-filename=${oom_report_name}`,
        ...node_args,
      ]
      let recent_output = ''
      let settled = false
      let start_ms = Date.now()

      let appendRecent = (arg0_buf: Buffer) => {
        let text = arg0_buf.toString('utf8')
        recent_output += text
        if (recent_output.length > 16384)
          recent_output = recent_output.slice(recent_output.length - 16384)
      }

      let child = spawn(process.execPath, full_node_args, {
        cwd: this.root_dir,
        env: child_env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      if (this.config.below_normal_priority && child.pid) {
        try {
          os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL)
        } catch {}
      }

      this.active_child = child
      this.child_started_ms = start_ms
      if (this.on_child_pid_change)
        this.on_child_pid_change(child.pid ? child.pid : null)

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
        if (this.on_child_pid_change)
          this.on_child_pid_change(null)
        let duration_ms = Date.now() - start_ms
        let classification = this.classifyChildExit(arg0_code, arg1_signal, recent_output, oom_report_path)
        arg0_resolve({
          duration_ms: duration_ms,
          exit_code: arg0_code,
          is_oom: classification.is_oom,
          is_port_in_use: classification.is_port_in_use,
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


  /**
   * Synchronously kills the active child process tree during emergency exit handlers.
   *
   * @returns {void}
   */
  terminateChildProcessSync (): void {
    //Declare local instance variables
    let child = this.active_child
    let pid = child ? child.pid : undefined

    //Guard clauses
    if (!child || child.exitCode !== null)
      return

    //Function body
    if (process.platform === 'win32' && pid) {
      try {
        spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', timeout: 2000 })
      } catch {}
    }
    try {
      child.kill('SIGKILL')
    } catch {}
  }


  /**
   * Terminates an arbitrary orphaned process tree by PID while protecting current ancestor PIDs.
   *
   * @param {number} arg0_pid
   * @param {Set<number>} [arg1_protected_pids]
   *
   * @returns {Promise<boolean>}
   */
  terminateProcessTreeByPid (arg0_pid: number, arg1_protected_pids?: Set<number>): Promise<boolean> {
    //Convert from parameters
    let pid = Math.trunc(arg0_pid)
    let protected_pids = arg1_protected_pids ? arg1_protected_pids : new Set<number>()

    //Guard clauses
    if (!Number.isFinite(pid) || pid <= 0 || pid === process.pid || pid === process.ppid || protected_pids.has(pid))
      return Promise.resolve(false)

    //Return statement
    return new Promise((arg0_resolve) => {
      if (process.platform === 'win32') {
        let settled = false
        let killer = spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' })
        let timer = setTimeout(() => {
          if (!settled) {
            settled = true
            arg0_resolve(!this.isPidAlive(pid))
          }
        }, 3000)

        killer.once('error', () => {
          clearTimeout(timer)
          if (!settled) {
            settled = true
            arg0_resolve(false)
          }
        })
        killer.once('close', (arg0_code) => {
          clearTimeout(timer)
          if (!settled) {
            settled = true
            arg0_resolve(arg0_code === 0 || !this.isPidAlive(pid))
          }
        })
        return
      }

      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        arg0_resolve(!this.isPidAlive(pid))
        return
      }

      setTimeout(() => {
        if (this.isPidAlive(pid)) {
          try {
            process.kill(pid, 'SIGKILL')
          } catch {}
        }
        arg0_resolve(!this.isPidAlive(pid))
      }, 600)
    })
  }
}
