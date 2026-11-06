import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { AutorunProcessRunner, type ChildRunOutcome } from './AutorunProcessRunner.ts'
import {
  AutorunTui,
  type AutorunConfig,
  type AutorunDictionary,
  type AutorunLocalState,
  type AutorunLocale,
  type ServerMode,
  type WatchdogPolicy,
} from './AutorunTui.ts'

export interface AutorunCliOptions {
  force_tui: boolean
  help: boolean
  locale: AutorunLocale | null
  lock_in: boolean
  mode: ServerMode | null
  open_browser: boolean | null
  resume: boolean
  unlock: boolean
  watchdog_policy: WatchdogPolicy | null
}

type OperatorAction = 'none' | 'restart' | 'menu' | 'quit'


/**
 * AutorunSupervisor manages the interactive TUI mode launcher, persistent lock-in modes
 * and automatic crash recovery for Confoederatio Dataview.
 */
export class AutorunSupervisor {
  config: AutorunConfig
  confirm_menu_until_ms = 0
  confirm_quit_until_ms = 0
  consecutive_crashes = 0
  current_mode: ServerMode = 'dev'
  dict: AutorunDictionary
  has_opened_browser = false
  hotkey_handler: ((arg0_chunk: Buffer) => void) | null = null
  last_crash_summary = ''
  locale: AutorunLocale
  locked_mode: ServerMode | null = null
  oom_restarts = 0
  open_browser: boolean
  operator_action: OperatorAction = 'none'
  root_dir: string
  runner: AutorunProcessRunner
  session_locked = false
  total_restarts = 0
  watchdog_policy: WatchdogPolicy


  /**
   * Creates a new AutorunSupervisor rooted at the repository directory.
   *
   * @param {string} arg0_root_dir
   */
  constructor (arg0_root_dir: string) {
    //Convert from parameters
    let root_dir = arg0_root_dir

    //Declare local instance variables
    let config = AutorunTui.loadConfig(root_dir)
    let saved_state = AutorunTui.loadLocalState(root_dir, config.local_state_file)

    //Function body
    this.root_dir = root_dir
    this.config = config
    this.runner = new AutorunProcessRunner(root_dir, config)
    this.locale = saved_state.locale ? saved_state.locale : config.default_locale
    this.locked_mode = saved_state.locked_mode ? saved_state.locked_mode : null
    this.open_browser = saved_state.open_browser !== undefined
      ? saved_state.open_browser
      : config.default_open_browser
    this.watchdog_policy = saved_state.watchdog_policy
      ? saved_state.watchdog_policy
      : config.default_watchdog_policy
    this.dict = AutorunTui.loadDictionary(root_dir, this.locale)
  }


  /**
   * Attaches raw single-keystroke TUI controls while a supervised server process is running.
   *
   * @returns {void}
   */
  attachInteractiveHotkeys (): void {
    //Guard clauses
    if (!process.stdin.isTTY || !process.stdout.isTTY || this.hotkey_handler)
      return

    //Function body
    try {
      process.stdin.setRawMode(true)
      process.stdin.resume()
    } catch {
      return
    }

    this.hotkey_handler = (arg0_chunk: Buffer) => {
      let key = arg0_chunk.toString('utf8')
      let now_ms = Date.now()

      if (key === '\x03' || key === 'q' || key === 'Q') {
        if (this.session_locked && now_ms > this.confirm_quit_until_ms) {
          this.confirm_quit_until_ms = now_ms + this.config.lock_in_ctrl_c_confirm_ms
          let wait_sec = AutorunTui.formatEuroDecimal(this.config.lock_in_ctrl_c_confirm_ms/1000, 1)
          let msg = AutorunTui.formatString(this.dict.confirmQuitLocked, [
            AutorunTui.getModeLabel(this.current_mode, this.dict),
            wait_sec,
          ])
          process.stdout.write(`\n${AutorunTui.colourRed(`[LOCK-IN] ${msg}`)}\n`)
          return
        }
        this.operator_action = 'quit'
        void this.runner.terminateChildProcess()
      } else if (key === 'm' || key === 'M') {
        if (this.session_locked && now_ms > this.confirm_menu_until_ms) {
          this.confirm_menu_until_ms = now_ms + this.config.lock_in_ctrl_c_confirm_ms
          let wait_sec = AutorunTui.formatEuroDecimal(this.config.lock_in_ctrl_c_confirm_ms/1000, 1)
          let msg = AutorunTui.formatString(this.dict.confirmMenuLocked, [
            AutorunTui.getModeLabel(this.current_mode, this.dict),
            wait_sec,
          ])
          process.stdout.write(`\n${AutorunTui.colourRed(`[LOCK-IN] ${msg}`)}\n`)
          return
        }
        this.operator_action = 'menu'
        void this.runner.terminateChildProcess()
      } else if (key === 'r' || key === 'R') {
        process.stdout.write(`\n${AutorunTui.colourGreen(`[SUPERVISOR] ${this.dict.manualRestart}`)}\n`)
        this.operator_action = 'restart'
        void this.runner.terminateChildProcess()
      } else if (key === 'l' || key === 'L') {
        if (this.session_locked) {
          this.session_locked = false
          if (this.locked_mode === this.current_mode)
            this.locked_mode = null
          this.persistPreferences(this.current_mode)
          process.stdout.write(`\n${AutorunTui.colourRed(`[SUPERVISOR] ${this.dict.lockInCleared}`)}\n`)
        } else {
          this.session_locked = true
          this.locked_mode = this.current_mode
          this.watchdog_policy = 'persistent'
          this.persistPreferences(this.current_mode)
          let msg = AutorunTui.formatString(this.dict.lockInEnabled, [
            AutorunTui.getModeLabel(this.current_mode, this.dict),
          ])
          process.stdout.write(`\n${AutorunTui.colourGreen(`[SUPERVISOR] ${msg}`)}\n`)
        }
      } else if (key === 'u' || key === 'U') {
        this.session_locked = false
        this.locked_mode = null
        this.persistPreferences(this.current_mode)
        process.stdout.write(`\n${AutorunTui.colourRed(`[SUPERVISOR] ${this.dict.lockInCleared}`)}\n`)
      } else if (key === 'w' || key === 'W') {
        if (this.session_locked) {
          process.stdout.write(`\n${AutorunTui.colourGreen(`[LOCK-IN] ${this.dict.watchdogLockedNotice}`)}\n`)
        } else {
          this.watchdog_policy = AutorunTui.cycleWatchdogPolicy(this.watchdog_policy)
          this.persistPreferences(this.current_mode)
          let badge = AutorunTui.getWatchdogBadge(this.watchdog_policy, this.dict)
          let desc = AutorunTui.getWatchdogDescription(this.watchdog_policy, this.dict)
          process.stdout.write(`\n[SUPERVISOR] ${this.dict.watchdogLabel}: ${badge} ${desc}\n`)
        }
      } else if (key === 'o' || key === 'O') {
        this.runner.openUrlInBrowser(`http://localhost:${this.config.port}/`)
      } else if (key === 's' || key === 'S') {
        this.printStatusSummary()
      }
    }

    process.stdin.on('data', this.hotkey_handler)
  }


  /**
   * Computes exponential restart backoff delay clamped between restart_delay_ms and max_backoff_ms.
   *
   * @param {number} arg0_consecutive_crashes
   *
   * @returns {number}
   */
  computeRestartDelayMs (arg0_consecutive_crashes: number): number {
    //Convert from parameters
    let consecutive_crashes = Math.max(1, arg0_consecutive_crashes)

    //Declare local instance variables
    let exponent = Math.min(4, consecutive_crashes - 1)
    let raw_delay = this.config.restart_delay_ms*Math.pow(2, exponent)

    //Return statement
    return Math.min(this.config.max_backoff_ms, Math.max(this.config.restart_delay_ms, raw_delay))
  }


  /**
   * Detaches interactive raw-mode hotkey listeners cleanly.
   *
   * @returns {void}
   */
  detachInteractiveHotkeys (): void {
    //Function body
    if (this.hotkey_handler) {
      process.stdin.off('data', this.hotkey_handler)
      this.hotkey_handler = null
    }
    if (process.stdin.isTTY) {
      try {
        process.stdin.setRawMode(false)
        process.stdin.pause()
      } catch {}
    }
  }


  /**
   * Reads the current operator action safely across asynchronous await boundaries.
   *
   * @returns {OperatorAction}
   */
  getOperatorAction (): OperatorAction {
    //Return statement
    return this.operator_action
  }


  /**
   * Parses command-line arguments passed from autorun.bat or autorun.sh.
   *
   * @param {string[]} arg0_argv
   *
   * @returns {AutorunCliOptions}
   */
  parseCliArgs (arg0_argv: string[]): AutorunCliOptions {
    //Convert from parameters
    let argv = arg0_argv

    //Declare local instance variables
    let options: AutorunCliOptions = {
      force_tui: false,
      help: false,
      locale: null,
      lock_in: false,
      mode: null,
      open_browser: null,
      resume: false,
      unlock: false,
      watchdog_policy: null,
    }

    //Function body
    for (let i = 0; i < argv.length; i++) {
      let local_arg = argv[i].trim()
      let local_lower = local_arg.toLowerCase()

      if (local_lower === 'dev' || local_lower === '--dev') {
        options.mode = 'dev'
      } else if (
        local_lower === 'preview' ||
        local_lower === 'prod' ||
        local_lower === '--preview' ||
        local_lower === '--prod'
      ) {
        options.mode = 'preview'
      } else if (
        local_lower === 'rebuild' ||
        local_lower === 'build' ||
        local_lower === '--rebuild' ||
        local_lower === '--build'
      ) {
        options.mode = 'rebuild'
      } else if (local_lower === '--lock' || local_lower === '--lock-in' || local_lower === '-l') {
        options.lock_in = true
      } else if (local_lower === '--unlock' || local_lower === '-u') {
        options.unlock = true
      } else if (local_lower === '--resume') {
        options.resume = true
      } else if (local_lower === '--tui') {
        options.force_tui = true
      } else if (local_lower === '--open') {
        options.open_browser = true
      } else if (local_lower === '--no-open') {
        options.open_browser = false
      } else if (local_lower === '--help' || local_lower === '-h') {
        options.help = true
      } else if (local_lower.startsWith('--watchdog=')) {
        let local_val = local_lower.slice('--watchdog='.length)
        if (local_val === 'persistent' || local_val === 'oom' || local_val === 'once')
          options.watchdog_policy = local_val
      } else if (local_lower.startsWith('--lang=')) {
        let local_lang = local_arg.slice('--lang='.length)
        if (local_lang === 'en-GB' || local_lang === 'en_gb' || local_lang === 'en') {
          options.locale = 'en-GB'
        } else if (local_lang === 'fr') {
          options.locale = 'fr'
        } else if (local_lang === 'de') {
          options.locale = 'de'
        }
      }
    }

    //Return statement
    return options
  }


  /**
   * Saves current lock-in, locale, browser and watchdog settings to autorun.local.
   *
   * @param {ServerMode | null} [arg0_last_active_mode]
   *
   * @returns {void}
   */
  persistPreferences (arg0_last_active_mode?: ServerMode | null): void {
    //Convert from parameters
    let last_active_mode = arg0_last_active_mode

    //Declare local instance variables
    let existing = AutorunTui.loadLocalState(this.root_dir, this.config.local_state_file)
    let next_state: AutorunLocalState = {
      last_active_mode: last_active_mode !== undefined ? last_active_mode : existing.last_active_mode,
      locale: this.locale,
      locked_mode: this.locked_mode,
      open_browser: this.open_browser,
      watchdog_policy: this.watchdog_policy,
    }

    //Function body
    AutorunTui.saveLocalState(this.root_dir, this.config.local_state_file, next_state)
  }


  /**
   * Prints command-line usage instructions to stdout.
   *
   * @returns {void}
   */
  printHelp (): void {
    //Declare local instance variables
    let lines_array = [
      'Confoederatio Dataview — Service Launcher & Persistent Supervisor',
      '',
      'Usage:',
      '  autorun.bat [mode] [options]',
      '  ./autorun.sh [mode] [options]',
      '',
      'Modes:',
      '  (none) / --tui     Launch interactive TUI mode selector',
      '  preview | prod     Start Production Build Server (vite preview)',
      '  dev | --dev        Start Development Server (vite dev with HMR)',
      '  rebuild | build    Build production bundle, then start preview server',
      '',
      'Options:',
      '  --lock, -l         Lock in mode (persistent auto-restart + auto-boot on launch)',
      '  --unlock, -u       Clear saved startup mode lock-in',
      '  --watchdog=<mode>  Crash policy: persistent (default) | oom | once',
      '  --open / --no-open Enable or suppress initial browser launch',
      '  --lang=<locale>    Set TUI language: en-GB | fr | de',
      '  --help, -h         Show this help message',
    ]

    //Function body
    process.stdout.write(`${lines_array.join('\n')}\n`)
  }


  /**
   * Prints an inline live telemetry line showing current uptime, child PID and crash history.
   *
   * @returns {void}
   */
  printStatusSummary (): void {
    //Declare local instance variables
    let active_child = this.runner.active_child
    let last_crash = this.last_crash_summary ? this.last_crash_summary : this.dict.statusNone
    let pid_text = active_child && active_child.pid ? String(active_child.pid) : '-'
    let summary_text: string
    let uptime_ms = this.runner.child_started_ms > 0 ? Date.now() - this.runner.child_started_ms : 0

    //Function body
    summary_text = AutorunTui.formatString(this.dict.statusLine, [
      AutorunTui.formatDuration(uptime_ms),
      pid_text,
      this.total_restarts,
      this.oom_restarts,
      last_crash,
    ])
    process.stdout.write(`\n${AutorunTui.colourGreen(`[STATUS] ${summary_text}`)}\n`)
  }


  /**
   * Entry workflow orchestrating CLI arguments, TUI menu transitions and supervised server execution.
   *
   * @param {string[]} arg0_argv
   *
   * @returns {Promise<number>}
   */
  async run (arg0_argv: string[]): Promise<number> {
    //Convert from parameters
    let argv = arg0_argv

    //Declare local instance variables
    let cli = this.parseCliArgs(argv)
    let menu_notice = ''
    let next_mode: ServerMode | null = null
    let saved_state = AutorunTui.loadLocalState(this.root_dir, this.config.local_state_file)

    //Guard clauses
    if (cli.help) {
      this.printHelp()
      return 0
    }

    //Function body
    this.runner.cleanupStaleOomReports()

    if (cli.locale) {
      this.locale = cli.locale
      this.dict = AutorunTui.loadDictionary(this.root_dir, this.locale)
    }
    if (cli.open_browser !== null)
      this.open_browser = cli.open_browser
    if (cli.watchdog_policy)
      this.watchdog_policy = cli.watchdog_policy
    if (cli.unlock) {
      this.locked_mode = null
      this.persistPreferences()
    }

    if (cli.mode) {
      next_mode = cli.mode
      if (cli.lock_in) {
        this.locked_mode = cli.mode
        this.watchdog_policy = 'persistent'
        this.persistPreferences(cli.mode)
      }
    } else if (cli.resume) {
      next_mode = this.locked_mode
        ? this.locked_mode
        : (saved_state.last_active_mode ? saved_state.last_active_mode : 'dev')
    }

    for (let i = 0; i < 1000000; i++) {
      if (!next_mode) {
        next_mode = await this.runInteractiveMenu(menu_notice, cli.force_tui)
        menu_notice = ''
        cli.force_tui = false
        if (!next_mode) {
          process.stdout.write(`\n${this.dict.cleanExit}\n`)
          return 0
        }
      }

      let local_lock_session = Boolean(cli.lock_in || this.locked_mode === next_mode || cli.resume)
      cli.lock_in = false
      cli.resume = false

      let local_transition = await this.runSupervisedMode(next_mode, local_lock_session)
      if (local_transition.action === 'quit') {
        process.stdout.write(`\n${this.dict.cleanExit}\n`)
        return local_transition.exit_code
      }

      menu_notice = local_transition.notice
      next_mode = null
    }

    //Return statement
    return 0
  }


  /**
   * Displays the interactive TUI launcher menu and resolves the user's chosen ServerMode (or null on exit).
   *
   * @param {string} [arg0_initial_notice='']
   * @param {boolean} [arg1_pause_autoboot=false]
   *
   * @returns {Promise<ServerMode | null>}
   */
  runInteractiveMenu (arg0_initial_notice: string = '', arg1_pause_autoboot: boolean = false): Promise<ServerMode | null> {
    //Convert from parameters
    let initial_notice = arg0_initial_notice
    let pause_autoboot = arg1_pause_autoboot

    //Declare local instance variables
    let all_modes: Array<ServerMode | 'exit'> = ['preview', 'dev', 'rebuild', 'exit']

    //Guard clauses
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return Promise.resolve(this.locked_mode ? this.locked_mode : 'dev')
    }

    //Return statement
    return new Promise((arg0_resolve) => {
      let countdown_paused = Boolean(pause_autoboot || !this.locked_mode)
      let countdown_remaining_ms = this.locked_mode
        ? this.config.lock_in_countdown_seconds*1000
        : 0
      let countdown_timer: NodeJS.Timeout | null = null
      let finished = false
      let notice_message = initial_notice
      let selected_index = 1

      if (this.locked_mode === 'preview') {
        selected_index = 0
      } else if (this.locked_mode === 'dev') {
        selected_index = 1
      } else if (this.locked_mode === 'rebuild') {
        selected_index = 2
      }

      let renderNow = (arg0_clear_all: boolean) => {
        if (finished)
          return
        let prefix = arg0_clear_all ? '\x1b[2J\x1b[H\x1b[?25l' : '\x1b[H\x1b[?25l'
        let screen = AutorunTui.renderMenuScreen({
          config: this.config,
          countdown_paused: countdown_paused,
          countdown_remaining_ms: countdown_remaining_ms,
          dict: this.dict,
          locale: this.locale,
          locked_mode: this.locked_mode,
          notice_message: notice_message,
          open_browser: this.open_browser,
          selected_index: selected_index,
          watchdog_policy: this.locked_mode ? 'persistent' : this.watchdog_policy,
        })
        process.stdout.write(`${prefix}${screen}\x1b[J\n`)
      }

      let finishMenu = (arg0_choice: ServerMode | null) => {
        if (finished)
          return
        finished = true
        if (countdown_timer)
          clearInterval(countdown_timer)
        process.stdin.off('data', onKeyData)
        process.stdout.off('resize', onResize)
        try {
          process.stdin.setRawMode(false)
          process.stdin.pause()
        } catch {}
        process.stdout.write('\x1b[?25h')
        arg0_resolve(arg0_choice)
      }

      let onResize = () => {
        renderNow(true)
      }

      let onKeyData = (arg0_chunk: Buffer) => {
        let key = arg0_chunk.toString('utf8')

        if (key === '\x03' || key === 'q' || key === 'Q' || key === '4') {
          finishMenu(null)
          return
        }
        if (key === '1') {
          finishMenu('preview')
          return
        }
        if (key === '2') {
          finishMenu('dev')
          return
        }
        if (key === '3') {
          finishMenu('rebuild')
          return
        }
        if (key === '\r' || key === '\n') {
          let chosen = all_modes[selected_index]
          finishMenu(chosen === 'exit' ? null : chosen)
          return
        }
        if (key === '\x1b[A' || key === 'k' || key === 'K') {
          countdown_paused = true
          selected_index = (selected_index + 3)%4
          renderNow(false)
          return
        }
        if (key === '\x1b[B' || key === 'j' || key === 'J') {
          countdown_paused = true
          selected_index = (selected_index + 1)%4
          renderNow(false)
          return
        }
        if (key === ' ') {
          if (this.locked_mode) {
            countdown_paused = !countdown_paused
            renderNow(true)
          }
          return
        }
        if (key === 'l' || key === 'L') {
          let highlighted = all_modes[selected_index]
          countdown_paused = true
          if (highlighted === 'exit')
            return
          if (this.locked_mode === highlighted) {
            this.locked_mode = null
            notice_message = this.dict.lockInCleared
          } else {
            this.locked_mode = highlighted
            this.watchdog_policy = 'persistent'
            notice_message = AutorunTui.formatString(this.dict.lockInEnabled, [
              AutorunTui.getModeLabel(highlighted, this.dict),
            ])
          }
          this.persistPreferences()
          renderNow(true)
          return
        }
        if (key === 'u' || key === 'U') {
          countdown_paused = true
          this.locked_mode = null
          notice_message = this.dict.lockInCleared
          this.persistPreferences()
          renderNow(true)
          return
        }
        if (key === 'w' || key === 'W') {
          countdown_paused = true
          if (this.locked_mode) {
            notice_message = this.dict.watchdogLockedNotice
          } else {
            this.watchdog_policy = AutorunTui.cycleWatchdogPolicy(this.watchdog_policy)
            notice_message = ''
            this.persistPreferences()
          }
          renderNow(true)
          return
        }
        if (key === 'o' || key === 'O') {
          countdown_paused = true
          this.open_browser = !this.open_browser
          this.persistPreferences()
          renderNow(true)
          return
        }
        if (key === 'g' || key === 'G') {
          countdown_paused = true
          this.locale = AutorunTui.cycleLocale(this.locale)
          this.dict = AutorunTui.loadDictionary(this.root_dir, this.locale)
          notice_message = ''
          this.persistPreferences()
          renderNow(true)
        }
      }

      try {
        process.stdin.setRawMode(true)
        process.stdin.resume()
      } catch {
        finishMenu(this.locked_mode ? this.locked_mode : 'dev')
        return
      }

      process.stdin.on('data', onKeyData)
      process.stdout.on('resize', onResize)
      renderNow(true)

      if (this.locked_mode && !countdown_paused) {
        countdown_timer = setInterval(() => {
          if (countdown_paused || !this.locked_mode)
            return
          countdown_remaining_ms = Math.max(0, countdown_remaining_ms - 100)
          renderNow(false)
          if (countdown_remaining_ms <= 0 && this.locked_mode)
            finishMenu(this.locked_mode)
        }, 100)
      }
    })
  }


  /**
   * Supervises a chosen server mode with persistent uptime, OOM recovery, backoff and hotkey controls.
   *
   * @param {ServerMode} arg0_initial_mode
   * @param {boolean} arg1_lock_session
   *
   * @returns {Promise<{ action: 'menu' | 'quit'; exit_code: number; notice: string }>}
   */
  async runSupervisedMode (
    arg0_initial_mode: ServerMode,
    arg1_lock_session: boolean
  ): Promise<{ action: 'menu' | 'quit'; exit_code: number; notice: string }> {
    //Convert from parameters
    let initial_mode = arg0_initial_mode
    let lock_session = arg1_lock_session

    //Declare local instance variables
    let active_stage: ServerMode = initial_mode
    let is_interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)

    //Function body
    this.current_mode = initial_mode
    this.session_locked = lock_session
    this.consecutive_crashes = 0
    this.persistPreferences(initial_mode)
    this.attachInteractiveHotkeys()

    try {
      for (let i = 0; i < 10000000; i++) {
        this.operator_action = 'none'
        this.current_mode = active_stage

        let banner = AutorunTui.renderRunningBanner({
          config: this.config,
          dict: this.dict,
          is_interactive: is_interactive,
          locale: this.locale,
          locked_mode: this.locked_mode,
          mode: active_stage,
          oom_restarts: this.oom_restarts,
          session_locked: this.session_locked,
          started_at_utc: AutorunTui.formatUtcTimestamp(),
          total_restarts: this.total_restarts,
          watchdog_policy: this.watchdog_policy,
        })
        process.stdout.write(`\n${banner}\n`)

        let dist_index = path.resolve(this.root_dir, 'dist/index.html')
        if (active_stage === 'preview' && !fs.existsSync(dist_index)) {
          process.stdout.write(`\n[INFO] ${this.dict.distMissingRebuild}\n`)
          active_stage = 'rebuild'
        }

        let outcome: ChildRunOutcome
        if (active_stage === 'rebuild') {
          outcome = await this.runner.runBuildPipeline(this.dict, () => this.getOperatorAction() !== 'none')
          if (outcome.exit_code === 0 && this.getOperatorAction() === 'none') {
            active_stage = 'preview'
            continue
          }
        } else {
          await this.waitForPortRelease(this.config.port, this.config.port_wait_timeout_ms)
          let post_wait_action = this.getOperatorAction()
          if (post_wait_action === 'quit')
            return { action: 'quit', exit_code: 0, notice: '' }
          if (post_wait_action === 'menu')
            return { action: 'menu', exit_code: 0, notice: '' }
          if (post_wait_action === 'restart')
            continue

          let should_open = Boolean(this.open_browser && !this.has_opened_browser)
          this.has_opened_browser = true

          let vite_args: string[] = ['./node_modules/vite/bin/vite.js']
          if (active_stage === 'preview')
            vite_args.push('preview')
          vite_args.push('--port', String(this.config.port))
          if (this.config.host)
            vite_args.push('--host')
          if (should_open)
            vite_args.push('--open')

          outcome = await this.runner.runSingleChildProcess(vite_args)
        }

        let post_run_action = this.getOperatorAction()
        if (post_run_action === 'quit')
          return { action: 'quit', exit_code: 0, notice: '' }
        if (post_run_action === 'menu')
          return { action: 'menu', exit_code: 0, notice: '' }
        if (post_run_action === 'restart') {
          this.total_restarts++
          continue
        }

        if (outcome.duration_ms >= this.config.healthy_uptime_reset_ms)
          this.consecutive_crashes = 0

        let effective_policy: WatchdogPolicy = this.session_locked ? 'persistent' : this.watchdog_policy
        let should_restart = false
        if (outcome.is_oom && (effective_policy === 'persistent' || effective_policy === 'oom')) {
          should_restart = true
        } else if (effective_policy === 'persistent') {
          should_restart = true
        }

        if (!should_restart) {
          let reason_label = outcome.oom_reason
          let error_msg = AutorunTui.formatString(this.dict.exitedWithError, [reason_label])
          process.stdout.write(`\n${AutorunTui.colourRed(`[ERROR] ${error_msg}`)}\n`)
          if (is_interactive)
            return { action: 'menu', exit_code: outcome.exit_code ?? 1, notice: error_msg }
          return { action: 'quit', exit_code: outcome.exit_code ?? 1, notice: error_msg }
        }

        this.consecutive_crashes++
        this.total_restarts++
        if (outcome.is_oom)
          this.oom_restarts++

        let crash_stamp = AutorunTui.formatUtcTimestamp()
        this.last_crash_summary = `${outcome.is_oom ? 'OOM' : outcome.oom_reason} @ ${crash_stamp} GMT+0`

        let delay_ms = this.computeRestartDelayMs(this.consecutive_crashes)
        let delay_sec = AutorunTui.formatEuroDecimal(delay_ms/1000, 1)
        let mode_title = AutorunTui.getModeLabel(active_stage, this.dict)
        let restart_msg = outcome.is_oom
          ? AutorunTui.formatString(this.dict.crashDetectedOom, [
              outcome.oom_reason,
              mode_title,
              this.total_restarts,
              delay_sec,
            ])
          : AutorunTui.formatString(this.dict.crashDetectedUnexpected, [
              outcome.oom_reason,
              mode_title,
              this.total_restarts,
              delay_sec,
            ])

        process.stdout.write(`\n${AutorunTui.colourRed(`[WATCHDOG] ${restart_msg}`)}\n`)
        await this.sleepMs(delay_ms)

        let post_sleep_action = this.getOperatorAction()
        if (post_sleep_action === 'quit')
          return { action: 'quit', exit_code: 0, notice: '' }
        if (post_sleep_action === 'menu')
          return { action: 'menu', exit_code: 0, notice: '' }
      }
    } finally {
      this.detachInteractiveHotkeys()
    }

    //Return statement
    return { action: 'quit', exit_code: 0, notice: '' }
  }


  /**
   * Sleeps asynchronously for duration_ms while remaining interruptible by operator actions.
   *
   * @param {number} arg0_duration_ms
   *
   * @returns {Promise<void>}
   */
  sleepMs (arg0_duration_ms: number): Promise<void> {
    //Convert from parameters
    let duration_ms = Math.max(0, arg0_duration_ms)

    //Return statement
    return new Promise((arg0_resolve) => {
      let elapsed = 0
      let step_ms = 100
      let interval_handle = setInterval(() => {
        elapsed += step_ms
        if (elapsed >= duration_ms || this.getOperatorAction() !== 'none') {
          clearInterval(interval_handle)
          arg0_resolve()
        }
      }, step_ms)
    })
  }


  /**
   * Waits until the target TCP port is released by any prior crashed process before respawning Vite.
   *
   * @param {number} arg0_port
   * @param {number} arg1_timeout_ms
   *
   * @returns {Promise<void>}
   */
  async waitForPortRelease (arg0_port: number, arg1_timeout_ms: number): Promise<void> {
    //Convert from parameters
    let port = arg0_port
    let timeout_ms = arg1_timeout_ms

    //Declare local instance variables
    let max_attempts = Math.max(1, Math.ceil(timeout_ms/250))
    let printed_notice = false

    //Function body
    for (let i = 0; i < max_attempts; i++) {
      if (this.getOperatorAction() !== 'none')
        return
      let is_free = await this.runner.isPortAvailable(port)
      if (is_free)
        return
      if (!printed_notice) {
        printed_notice = true
        let msg = AutorunTui.formatString(this.dict.portWait, [port])
        process.stdout.write(`[SUPERVISOR] ${msg}\n`)
      }
      await this.sleepMs(250)
    }
  }
}


/**
 * Initialises and runs the CLI supervisor when AutorunSupervisor.ts is invoked directly.
 *
 * @returns {Promise<void>}
 */
async function initAutorunSupervisor (): Promise<void> {
  //Declare local instance variables
  let current_file = fileURLToPath(import.meta.url)
  let root_dir = path.resolve(path.dirname(current_file), '../..')
  let supervisor = new AutorunSupervisor(root_dir)

  //Function body
  let handleSignal = () => {
    supervisor.operator_action = 'quit'
    void supervisor.runner.terminateChildProcess().then(() => {
      supervisor.detachInteractiveHotkeys()
      process.exit(0)
    })
  }

  process.on('SIGINT', handleSignal)
  process.on('SIGTERM', handleSignal)

  let exit_code = await supervisor.run(process.argv.slice(2))
  process.exit(exit_code)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  void initAutorunSupervisor()
}
