import fs from 'fs'
import path from 'path'
import { AutorunProcessRunner, type PortProcessInfo } from './AutorunProcessRunner.ts'
import { AutorunTui, type AutorunConfig, type AutorunDictionary } from './AutorunTui.ts'

export interface AutorunLockState {
  child_pid: number | null
  parent_pid: number
  port: number
  root_dir: string
  started_at: string
  supervisor_pid: number
}


/**
 * AutorunLockManager coordinates single-instance lock tracking, orphaned process-tree cleanup
 * and TCP port conflict diagnostics across Windows and POSIX platforms.
 */
export class AutorunLockManager {
  child_pid: number | null = null
  config: AutorunConfig
  lock_path: string
  root_dir: string
  runner: AutorunProcessRunner


  /**
   * Creates a lock manager bound to the workspace root, configuration and process runner.
   *
   * @param {string} arg0_root_dir
   * @param {AutorunConfig} arg1_config
   * @param {AutorunProcessRunner} arg2_runner
   */
  constructor (arg0_root_dir: string, arg1_config: AutorunConfig, arg2_runner: AutorunProcessRunner) {
    //Convert from parameters
    let root_dir = arg0_root_dir
    let config = arg1_config
    let runner = arg2_runner

    //Function body
    this.root_dir = root_dir
    this.config = config
    this.runner = runner
    this.lock_path = path.resolve(root_dir, config.lock_file)
  }


  /**
   * Writes or refreshes the active supervisor lock file with current supervisor, parent and child PIDs.
   *
   * @returns {void}
   */
  acquireLock (): void {
    //Declare local instance variables
    let state: AutorunLockState = {
      child_pid: this.child_pid,
      parent_pid: process.ppid,
      port: this.config.port,
      root_dir: this.root_dir,
      started_at: new Date().toISOString(),
      supervisor_pid: process.pid,
    }

    //Function body
    try {
      fs.writeFileSync(this.lock_path, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
    } catch {}
  }


  /**
   * Cleans up any orphaned child recorded in the lock file if its owning supervisor is no longer alive.
   *
   * @returns {Promise<void>}
   */
  async cleanupDeadSupervisorOrphan (): Promise<void> {
    //Declare local instance variables
    let lock = this.readLockFile()
    let locked_pids = new Set<number>()
    let protected_pids: Set<number>

    //Guard clauses
    if (!lock)
      return

    //Function body
    if (lock.supervisor_pid > 0)
      locked_pids.add(lock.supervisor_pid)
    if (lock.child_pid && lock.child_pid > 0)
      locked_pids.add(lock.child_pid)

    if (lock.supervisor_pid > 0 && lock.supervisor_pid !== process.pid && this.runner.isPidAlive(lock.supervisor_pid)) {
      let sup_info = await this.runner.inspectProcessByPid(lock.supervisor_pid)
      if (sup_info && await this.runner.isProjectOwnedProcess(sup_info, locked_pids))
        return
    }

    protected_pids = await this.runner.getAncestorPidSet()
    if (lock.child_pid && lock.child_pid > 0 && this.runner.isPidAlive(lock.child_pid)) {
      let child_info = await this.runner.inspectProcessByPid(lock.child_pid)
      if (child_info && await this.runner.isProjectOwnedProcess(child_info, locked_pids))
        await this.runner.terminateProcessTreeByPid(lock.child_pid, protected_pids)
    }

    this.releaseLock(true)
  }


  /**
   * Formats a human-readable summary of external processes currently listening on a TCP port.
   *
   * @param {number} arg0_port
   * @param {AutorunDictionary} arg1_dict
   *
   * @returns {Promise<string>}
   */
  async describePortOwners (arg0_port: number, arg1_dict: AutorunDictionary): Promise<string> {
    //Convert from parameters
    let port = arg0_port
    let dict = arg1_dict

    //Declare local instance variables
    let labels_array: string[] = []
    let listeners = await this.runner.inspectPortListeners(port)

    //Guard clauses
    if (listeners.length === 0)
      return dict.portInUseUnknown

    //Function body
    for (let i = 0; i < listeners.length; i++) {
      let local_proc = listeners[i]
      labels_array.push(local_proc.name ? `${local_proc.name} PID ${local_proc.pid}` : `PID ${local_proc.pid}`)
    }

    //Return statement
    return labels_array.join(', ')
  }


  /**
   * Ensures the target TCP port is free before launching Vite, reclaiming any orphaned Dataview tree first.
   *
   * @param {number} arg0_port
   * @param {AutorunDictionary} arg1_dict
   * @param {() => boolean} arg2_is_interrupted
   *
   * @returns {Promise<{ blocked_by: string; ready: boolean }>}
   */
  async ensurePortReadyForLaunch (
    arg0_port: number,
    arg1_dict: AutorunDictionary,
    arg2_is_interrupted: () => boolean
  ): Promise<{ blocked_by: string; ready: boolean }> {
    //Convert from parameters
    let port = arg0_port
    let dict = arg1_dict
    let is_interrupted = arg2_is_interrupted

    //Declare local instance variables
    let max_attempts = Math.max(1, Math.ceil(this.config.port_wait_timeout_ms/250))
    let printed_notice = false
    let reclaimed = false

    //Guard clauses
    if (await this.runner.isPortAvailable(port))
      return { blocked_by: '', ready: true }

    //Function body
    reclaimed = await this.reclaimOrphanedProcesses(dict)
    if (!reclaimed) {
      let existing_listeners = await this.runner.inspectPortListeners(port)
      if (existing_listeners.length > 0) {
        return {
          blocked_by: await this.describePortOwners(port, dict),
          ready: false,
        }
      }
    }

    for (let i = 0; i < max_attempts; i++) {
      if (is_interrupted())
        return { blocked_by: '', ready: false }
      if (await this.runner.isPortAvailable(port))
        return { blocked_by: '', ready: true }
      if (!printed_notice) {
        printed_notice = true
        process.stdout.write(`[SUPERVISOR] ${AutorunTui.formatString(dict.portWait, [port])}\n`)
      }
      await this.sleepBrief(250)
    }

    //Return statement
    return {
      blocked_by: await this.describePortOwners(port, dict),
      ready: false,
    }
  }


  /**
   * Walks up parent_pid links to find the topmost project-owned runner ancestor (e.g. autorun.bat).
   *
   * @param {PortProcessInfo} arg0_proc
   * @param {Set<number>} arg1_locked_pids
   * @param {Set<number>} arg2_protected_pids
   *
   * @returns {Promise<PortProcessInfo>}
   */
  async findTopOwnedAncestor (
    arg0_proc: PortProcessInfo,
    arg1_locked_pids: Set<number>,
    arg2_protected_pids: Set<number>
  ): Promise<PortProcessInfo> {
    //Convert from parameters
    let current = arg0_proc
    let locked_pids = arg1_locked_pids
    let protected_pids = arg2_protected_pids

    //Function body
    for (let i = 0; i < 4; i++) {
      if (!current.parent_pid || current.parent_pid <= 0 || protected_pids.has(current.parent_pid))
        break
      let parent_info = await this.runner.inspectProcessByPid(current.parent_pid)
      if (!parent_info || !(await this.runner.isProjectOwnedProcess(parent_info, locked_pids)))
        break
      current = parent_info
    }

    //Return statement
    return current
  }


  /**
   * Reads and parses the lock file if present and valid.
   *
   * @returns {AutorunLockState | null}
   */
  readLockFile (): AutorunLockState | null {
    //Function body
    try {
      if (!fs.existsSync(this.lock_path))
        return null
      let parsed = JSON.parse(fs.readFileSync(this.lock_path, 'utf8'))
      if (parsed && typeof parsed === 'object' && typeof parsed.supervisor_pid === 'number')
        return parsed as AutorunLockState
    } catch {}

    //Return statement
    return null
  }


  /**
   * Terminates any stale or orphaned Dataview autorun/Vite process trees from previous runs.
   *
   * @param {AutorunDictionary} arg0_dict
   *
   * @returns {Promise<boolean>}
   */
  async reclaimOrphanedProcesses (arg0_dict: AutorunDictionary): Promise<boolean> {
    //Convert from parameters
    let dict = arg0_dict

    //Declare local instance variables
    let killed_labels: string[] = []
    let lock = this.readLockFile()
    let lock_has_live_pid = Boolean(
      lock &&
      (
        (lock.parent_pid > 0 && lock.parent_pid !== process.ppid && this.runner.isPidAlive(lock.parent_pid)) ||
        (lock.supervisor_pid > 0 && lock.supervisor_pid !== process.pid && this.runner.isPidAlive(lock.supervisor_pid)) ||
        (lock.child_pid && lock.child_pid > 0 && this.runner.isPidAlive(lock.child_pid))
      )
    )
    let locked_pids = new Set<number>()
    let port_free = await this.runner.isPortAvailable(this.config.port)
    let protected_pids: Set<number>

    //Guard clauses
    if (!lock_has_live_pid && port_free) {
      if (lock)
        this.releaseLock(true)
      return false
    }

    //Function body
    protected_pids = await this.runner.getAncestorPidSet()
    if (lock) {
      if (lock.parent_pid > 0)
        locked_pids.add(lock.parent_pid)
      if (lock.supervisor_pid > 0)
        locked_pids.add(lock.supervisor_pid)
      if (lock.child_pid && lock.child_pid > 0)
        locked_pids.add(lock.child_pid)

      let lock_candidates = [lock.parent_pid, lock.supervisor_pid, lock.child_pid]
      for (let i = 0; i < lock_candidates.length; i++) {
        let local_pid = lock_candidates[i]
        if (!local_pid || local_pid <= 0 || protected_pids.has(local_pid) || !this.runner.isPidAlive(local_pid))
          continue
        let local_info = await this.runner.inspectProcessByPid(local_pid)
        if (local_info && await this.runner.isProjectOwnedProcess(local_info, locked_pids)) {
          let was_killed = await this.runner.terminateProcessTreeByPid(local_pid, protected_pids)
          if (was_killed)
            killed_labels.push(local_info.name ? `${local_info.name}:${local_pid}` : `PID ${local_pid}`)
        }
      }
    }

    let listeners = await this.runner.inspectPortListeners(this.config.port)
    for (let i = 0; i < listeners.length; i++) {
      let local_listener = listeners[i]
      if (protected_pids.has(local_listener.pid))
        continue
      if (await this.runner.isProjectOwnedProcess(local_listener, locked_pids)) {
        let top_proc = await this.findTopOwnedAncestor(local_listener, locked_pids, protected_pids)
        if (top_proc.pid !== local_listener.pid && this.runner.isPidAlive(top_proc.pid)) {
          let killed_parent = await this.runner.terminateProcessTreeByPid(top_proc.pid, protected_pids)
          if (killed_parent)
            killed_labels.push(top_proc.name ? `${top_proc.name}:${top_proc.pid}` : `PID ${top_proc.pid}`)
        }
        if (this.runner.isPidAlive(local_listener.pid)) {
          let killed_listener = await this.runner.terminateProcessTreeByPid(local_listener.pid, protected_pids)
          if (killed_listener) {
            killed_labels.push(
              local_listener.name
                ? `${local_listener.name}:${local_listener.pid}`
                : `PID ${local_listener.pid}`
            )
          }
        }
      }
    }

    if (killed_labels.length > 0) {
      let msg = AutorunTui.formatString(dict.orphanReclaimed, [killed_labels.join(', '), this.config.port])
      process.stdout.write(`\n${AutorunTui.colourGreen(`[SUPERVISOR] ${msg}`)}\n`)
      await this.sleepBrief(300)
      return true
    }

    //Return statement
    return false
  }


  /**
   * Removes the supervisor lock file if owned by this process (or when forced).
   *
   * @param {boolean} [arg0_force=false]
   *
   * @returns {void}
   */
  releaseLock (arg0_force: boolean = false): void {
    //Convert from parameters
    let force = arg0_force

    //Function body
    try {
      if (!force) {
        let existing = this.readLockFile()
        if (existing && existing.supervisor_pid !== process.pid)
          return
      }
      if (fs.existsSync(this.lock_path))
        fs.unlinkSync(this.lock_path)
    } catch {}
  }


  /**
   * Records the active child PID in the lock file.
   *
   * @param {number | null} arg0_pid
   *
   * @returns {void}
   */
  setChildPid (arg0_pid: number | null): void {
    //Convert from parameters
    let pid = arg0_pid

    //Function body
    this.child_pid = pid
    this.acquireLock()
  }


  /**
   * Sleeps briefly during port release polling.
   *
   * @param {number} arg0_ms
   *
   * @returns {Promise<void>}
   */
  sleepBrief (arg0_ms: number): Promise<void> {
    //Convert from parameters
    let ms = Math.max(0, arg0_ms)

    //Return statement
    return new Promise((arg0_resolve) => {
      setTimeout(() => {
        arg0_resolve()
      }, ms)
    })
  }
}
