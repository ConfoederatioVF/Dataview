import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'

export type AutorunLocale = 'en-GB' | 'fr' | 'de'
export type ServerMode = 'preview' | 'dev' | 'rebuild'
export type WatchdogPolicy = 'persistent' | 'oom' | 'once'

export interface AutorunConfig {
  default_locale: AutorunLocale
  default_open_browser: boolean
  default_watchdog_policy: WatchdogPolicy
  healthy_uptime_reset_ms: number
  host: boolean
  local_state_file: string
  lock_in_countdown_seconds: number
  lock_in_ctrl_c_confirm_ms: number
  max_backoff_ms: number
  max_old_space_size_mb: number
  oom_report_dir: string
  port: number
  port_wait_timeout_ms: number
  restart_delay_ms: number
}

export interface AutorunDictionary {
  autoBootCountdown: string
  autoBootPaused: string
  browserOff: string
  browserOn: string
  browserOpenDesc: string
  browserOpenLabel: string
  buildingBundle: string
  cleanExit: string
  confirmMenuLocked: string
  confirmQuitLocked: string
  crashDetectedOom: string
  crashDetectedUnexpected: string
  distMissingRebuild: string
  exitedWithError: string
  heapPortInfo: string
  heapPortLabel: string
  lockedInBadge: string
  lockInCleared: string
  lockInEnabled: string
  lockInLabel: string
  lockInNoneDesc: string
  lockInSetDesc: string
  manualRestart: string
  menuControlsLine1: string
  menuControlsLine2: string
  modeDevDesc: string
  modeDevTitle: string
  modeExitDesc: string
  modeExitTitle: string
  modePreviewDesc: string
  modePreviewTitle: string
  modeRebuildDesc: string
  modeRebuildTitle: string
  portWait: string
  runningControls: string
  runningStats: string
  statusLine: string
  statusNone: string
  title: string
  unlockedBadge: string
  watchdogLabel: string
  watchdogLockedNotice: string
  watchdogOnce: string
  watchdogOnceDesc: string
  watchdogOom: string
  watchdogOomDesc: string
  watchdogPersistent: string
  watchdogPersistentDesc: string
}

export interface AutorunLocalState {
  last_active_mode?: ServerMode | null
  locale?: AutorunLocale
  locked_mode?: ServerMode | null
  open_browser?: boolean
  watchdog_policy?: WatchdogPolicy
}

export interface MenuRenderState {
  config: AutorunConfig
  countdown_paused: boolean
  countdown_remaining_ms: number
  dict: AutorunDictionary
  locale: AutorunLocale
  locked_mode: ServerMode | null
  notice_message: string
  open_browser: boolean
  selected_index: number
  watchdog_policy: WatchdogPolicy
}

export interface RunningBannerState {
  config: AutorunConfig
  dict: AutorunDictionary
  is_interactive: boolean
  locale: AutorunLocale
  locked_mode: ServerMode | null
  mode: ServerMode
  oom_restarts: number
  session_locked: boolean
  started_at_utc: string
  total_restarts: number
  watchdog_policy: WatchdogPolicy
}

let DEFAULT_AUTORUN_CONFIG: AutorunConfig = {
  default_locale: 'en-GB',
  default_open_browser: true,
  default_watchdog_policy: 'persistent',
  healthy_uptime_reset_ms: 30000,
  host: true,
  local_state_file: 'autorun.local',
  lock_in_countdown_seconds: 3,
  lock_in_ctrl_c_confirm_ms: 3000,
  max_backoff_ms: 30000,
  max_old_space_size_mb: 16384,
  oom_report_dir: 'tests',
  port: 15000,
  port_wait_timeout_ms: 10000,
  restart_delay_ms: 2000,
}

let DEFAULT_AUTORUN_DICTIONARY: AutorunDictionary = {
  autoBootCountdown: 'Auto-starting locked-in mode [£1£] in £2£s... ([Space] Pause • [U] Unlock • [Enter] Now)',
  autoBootPaused: 'Auto-start paused for locked-in mode [£1£]. Press [Enter] to start or [U] to unlock.',
  browserOff: 'OFF',
  browserOn: 'ON',
  browserOpenDesc: 'Opens on initial launch only (suppressed on restarts)',
  browserOpenLabel: 'Browser Auto-Open',
  buildingBundle: 'Building production distribution bundle (tsc + vite build)...',
  cleanExit: 'Service stopped cleanly. Exiting Dataview supervisor.',
  confirmMenuLocked: 'Mode [£1£] is locked in. Press [M] again within £2£s (or [U] first) to stop and open menu.',
  confirmQuitLocked: 'Mode [£1£] is locked in. Press [Q] or [Ctrl+C] again within £2£s to shut down.',
  crashDetectedOom: 'Fatal JavaScript out-of-memory crash detected (£1£). Auto-restarting £2£ (#£3£) in £4£s...',
  crashDetectedUnexpected: 'Unexpected service exit (£1£). Persistent watchdog restarting £2£ (#£3£) in £4£s...',
  distMissingRebuild: 'Production bundle missing in dist/. Running build step first...',
  exitedWithError: 'Service exited with £1£ (auto-restart disabled for this exit).',
  heapPortInfo: '£1£ GB V8 Heap • Port £2£ • GMT+0',
  heapPortLabel: 'Runtime Profile',
  lockedInBadge: 'LOCKED IN',
  lockInCleared: 'Mode lock-in cleared. Startup unlocked.',
  lockInEnabled: 'Mode [£1£] locked in with persistent uptime.',
  lockInLabel: 'Startup Lock-In',
  lockInNoneDesc: 'Interactive menu waits for manual selection',
  lockInSetDesc: 'Auto-boots locked mode with persistent uptime',
  manualRestart: 'Manual restart requested by operator...',
  menuControlsLine1: '[Up/Down 1-4] Select   [Enter] Start   [L] Lock Mode   [U] Unlock',
  menuControlsLine2: '[W] Watchdog           [O] Browser     [G] Language    [Q] Quit',
  modeDevDesc: 'vite dev • HMR live reload',
  modeDevTitle: 'Development Server',
  modeExitDesc: 'Close launcher',
  modeExitTitle: 'Exit',
  modePreviewDesc: 'vite preview • dist/ bundle',
  modePreviewTitle: 'Production Build Server',
  modeRebuildDesc: 'tsc + vite build -> preview',
  modeRebuildTitle: 'Rebuild Production',
  portWait: 'Waiting for TCP port £1£ to release before restart...',
  runningControls: '[R] Restart  [L] Lock-In  [U] Unlock  [W] Watchdog  [O] Open URL  [S] Status  [M] Menu  [Q] Quit',
  runningStats: 'Restarts: £1£ total (£2£ OOM) • Started: £3£ GMT+0',
  statusLine: 'Uptime: £1£ • PID: £2£ • Restarts: £3£ (£4£ OOM) • Last crash: £5£',
  statusNone: 'none',
  title: 'CONFOEDERATIO DATAVIEW • SERVICE SUPERVISOR',
  unlockedBadge: 'UNLOCKED',
  watchdogLabel: 'Watchdog Policy',
  watchdogLockedNotice: 'Watchdog stays [PERSISTENT] while mode lock-in is active. Press [U] to unlock first.',
  watchdogOnce: 'ONCE',
  watchdogOnceDesc: 'Single run without automatic crash restart',
  watchdogOom: 'OOM-ONLY',
  watchdogOomDesc: 'Auto-restarts on V8/Node out-of-memory crashes',
  watchdogPersistent: 'PERSISTENT',
  watchdogPersistentDesc: 'Auto-restarts on OOM and any fatal crash',
}


/**
 * AutorunTui provides ANSI terminal formatting, configuration loading and localised TUI rendering
 * for the Confoederatio Dataview service launcher and persistent supervisor.
 */
export class AutorunTui {
  /**
   * Formats text in toggled-on green (60, 150, 60).
   *
   * @param {string} arg0_text
   *
   * @returns {string}
   */
  static colourGreen (arg0_text: string): string {
    //Convert from parameters
    let text = arg0_text

    //Return statement
    return AutorunTui.isColourEnabled() ? `\x1b[38;2;60;150;60m${text}\x1b[0m` : text
  }


  /**
   * Formats text in neutral muted grey for structural borders and secondary metadata.
   *
   * @param {string} arg0_text
   *
   * @returns {string}
   */
  static colourMuted (arg0_text: string): string {
    //Convert from parameters
    let text = arg0_text

    //Return statement
    return AutorunTui.isColourEnabled() ? `\x1b[38;2;150;150;155m${text}\x1b[0m` : text
  }


  /**
   * Formats text in interactive / toggled-off red (200, 40, 40).
   *
   * @param {string} arg0_text
   *
   * @returns {string}
   */
  static colourRed (arg0_text: string): string {
    //Convert from parameters
    let text = arg0_text

    //Return statement
    return AutorunTui.isColourEnabled() ? `\x1b[38;2;200;40;40m${text}\x1b[0m` : text
  }


  /**
   * Formats text in primary white (255, 255, 255).
   *
   * @param {string} arg0_text
   *
   * @returns {string}
   */
  static colourWhite (arg0_text: string): string {
    //Convert from parameters
    let text = arg0_text

    //Return statement
    return AutorunTui.isColourEnabled() ? `\x1b[38;2;255;255;255m${text}\x1b[0m` : text
  }


  /**
   * Formats text in bold primary white (255, 255, 255).
   *
   * @param {string} arg0_text
   *
   * @returns {string}
   */
  static colourWhiteBold (arg0_text: string): string {
    //Convert from parameters
    let text = arg0_text

    //Return statement
    return AutorunTui.isColourEnabled() ? `\x1b[1m\x1b[38;2;255;255;255m${text}\x1b[0m` : text
  }


  /**
   * Cycles through supported TUI locales (en-GB -> fr -> de -> en-GB).
   *
   * @param {AutorunLocale} arg0_locale
   *
   * @returns {AutorunLocale}
   */
  static cycleLocale (arg0_locale: AutorunLocale): AutorunLocale {
    //Convert from parameters
    let locale = arg0_locale

    //Return statement
    if (locale === 'en-GB') {
      return 'fr'
    } else if (locale === 'fr') {
      return 'de'
    } else {
      return 'en-GB'
    }
  }


  /**
   * Cycles through watchdog crash-recovery policies (persistent -> oom -> once -> persistent).
   *
   * @param {WatchdogPolicy} arg0_policy
   *
   * @returns {WatchdogPolicy}
   */
  static cycleWatchdogPolicy (arg0_policy: WatchdogPolicy): WatchdogPolicy {
    //Convert from parameters
    let policy = arg0_policy

    //Return statement
    if (policy === 'persistent') {
      return 'oom'
    } else if (policy === 'oom') {
      return 'once'
    } else {
      return 'persistent'
    }
  }


  /**
   * Formats a millisecond duration into human-readable uptime with European decimals for sub-minute spans.
   *
   * @param {number} arg0_duration_ms
   *
   * @returns {string}
   */
  static formatDuration (arg0_duration_ms: number): string {
    //Convert from parameters
    let duration_ms = Math.max(0, arg0_duration_ms)

    //Declare local instance variables
    let hours = Math.floor(duration_ms/3600000)
    let minutes = Math.floor((duration_ms%3600000)/60000)
    let seconds = Math.floor((duration_ms%60000)/1000)

    //Return statement
    if (duration_ms < 60000) {
      return `${AutorunTui.formatEuroDecimal(duration_ms/1000, 1)}s`
    } else if (hours === 0) {
      return `${minutes}m ${String(seconds).padStart(2, '0')}s`
    } else {
      return `${hours}h ${String(minutes).padStart(2, '0')}m ${String(seconds).padStart(2, '0')}s`
    }
  }


  /**
   * Formats a numeric value using European comma decimal notation (e.g. 16,38).
   *
   * @param {number} arg0_value
   * @param {number} [arg1_decimals=2]
   *
   * @returns {string}
   */
  static formatEuroDecimal (arg0_value: number, arg1_decimals: number = 2): string {
    //Convert from parameters
    let value = arg0_value
    let decimals = arg1_decimals

    //Declare local instance variables
    let fixed_text = value.toFixed(Math.max(0, decimals))

    //Return statement
    return fixed_text.replace('.', ',')
  }


  /**
   * Replaces £1£, £2£, ... positional delimiters in a localised template string.
   *
   * @param {string} arg0_template
   * @param {Array<string | number>} [arg1_values]
   *
   * @returns {string}
   */
  static formatString (arg0_template: string, arg1_values?: Array<string | number>): string {
    //Convert from parameters
    let template = arg0_template
    let values = arg1_values ? arg1_values : []

    //Declare local instance variables
    let output = template

    //Guard clauses
    if (!output)
      return ''

    //Function body
    for (let i = 0; i < values.length; i++) {
      let placeholder = `£${i + 1}£`
      output = output.split(placeholder).join(String(values[i]))
    }

    //Return statement
    return output
  }


  /**
   * Formats a Date instance into a GMT+0 timestamp (YYYY-MM-DD HH:MM:SS).
   *
   * @param {Date} [arg0_date]
   *
   * @returns {string}
   */
  static formatUtcTimestamp (arg0_date?: Date): string {
    //Convert from parameters
    let date = arg0_date ? arg0_date : new Date()

    //Declare local instance variables
    let iso = date.toISOString()

    //Return statement
    return `${iso.slice(0, 10)} ${iso.slice(11, 19)}`
  }


  /**
   * Wraps a single content line inside box borders padded or truncated to inner_width.
   *
   * @param {string} arg0_content
   * @param {number} arg1_inner_width
   *
   * @returns {string}
   */
  static getBoxLine (arg0_content: string, arg1_inner_width: number): string {
    //Convert from parameters
    let content = arg0_content
    let inner_width = arg1_inner_width

    //Declare local instance variables
    let border_char = AutorunTui.colourMuted('│')
    let fitted = AutorunTui.padVisible(AutorunTui.truncateVisible(content, inner_width - 2), inner_width - 2)

    //Return statement
    return `${border_char} ${fitted} ${border_char}`
  }


  /**
   * Returns the localised subtitle for a server menu mode.
   *
   * @param {ServerMode | 'exit'} arg0_mode
   * @param {AutorunDictionary} arg1_dict
   *
   * @returns {string}
   */
  static getModeDescription (arg0_mode: ServerMode | 'exit', arg1_dict: AutorunDictionary): string {
    //Convert from parameters
    let mode = arg0_mode
    let dict = arg1_dict

    //Return statement
    if (mode === 'preview') {
      return dict.modePreviewDesc
    } else if (mode === 'dev') {
      return dict.modeDevDesc
    } else if (mode === 'rebuild') {
      return dict.modeRebuildDesc
    } else {
      return dict.modeExitDesc
    }
  }


  /**
   * Returns the localised display title for a server menu mode.
   *
   * @param {ServerMode | 'exit'} arg0_mode
   * @param {AutorunDictionary} arg1_dict
   *
   * @returns {string}
   */
  static getModeLabel (arg0_mode: ServerMode | 'exit', arg1_dict: AutorunDictionary): string {
    //Convert from parameters
    let mode = arg0_mode
    let dict = arg1_dict

    //Return statement
    if (mode === 'preview') {
      return dict.modePreviewTitle
    } else if (mode === 'dev') {
      return dict.modeDevTitle
    } else if (mode === 'rebuild') {
      return dict.modeRebuildTitle
    } else {
      return dict.modeExitTitle
    }
  }


  /**
   * Returns a colour-coded badge string for the active watchdog policy.
   *
   * @param {WatchdogPolicy} arg0_policy
   * @param {AutorunDictionary} arg1_dict
   *
   * @returns {string}
   */
  static getWatchdogBadge (arg0_policy: WatchdogPolicy, arg1_dict: AutorunDictionary): string {
    //Convert from parameters
    let policy = arg0_policy
    let dict = arg1_dict

    //Return statement
    if (policy === 'persistent') {
      return AutorunTui.colourGreen(`[${dict.watchdogPersistent}]`)
    } else if (policy === 'oom') {
      return AutorunTui.colourGreen(`[${dict.watchdogOom}]`)
    } else {
      return AutorunTui.colourRed(`[${dict.watchdogOnce}]`)
    }
  }


  /**
   * Returns the localised description for the active watchdog policy.
   *
   * @param {WatchdogPolicy} arg0_policy
   * @param {AutorunDictionary} arg1_dict
   *
   * @returns {string}
   */
  static getWatchdogDescription (arg0_policy: WatchdogPolicy, arg1_dict: AutorunDictionary): string {
    //Convert from parameters
    let policy = arg0_policy
    let dict = arg1_dict

    //Return statement
    if (policy === 'persistent') {
      return dict.watchdogPersistentDesc
    } else if (policy === 'oom') {
      return dict.watchdogOomDesc
    } else {
      return dict.watchdogOnceDesc
    }
  }


  /**
   * Determines whether ANSI truecolour escape sequences should be emitted.
   *
   * @returns {boolean}
   */
  static isColourEnabled (): boolean {
    //Return statement
    return process.env.NO_COLOR === undefined
  }


  /**
   * Loads autorun configuration from common/autorun/autorun.json5, falling back to defaults.
   *
   * @param {string} arg0_root_dir
   *
   * @returns {AutorunConfig}
   */
  static loadConfig (arg0_root_dir: string): AutorunConfig {
    //Convert from parameters
    let root_dir = arg0_root_dir

    //Declare local instance variables
    let config_path = path.resolve(root_dir, 'common/autorun/autorun.json5')
    let merged_config: AutorunConfig = { ...DEFAULT_AUTORUN_CONFIG }

    //Function body
    try {
      if (fs.existsSync(config_path)) {
        let parsed_obj = JSON5.parse(fs.readFileSync(config_path, 'utf8'))
        if (parsed_obj && typeof parsed_obj === 'object')
          merged_config = { ...DEFAULT_AUTORUN_CONFIG, ...parsed_obj }
      }
    } catch (arg0_err) {
      console.error('[AutorunTui] Failed to parse common/autorun/autorun.json5:', arg0_err)
    }

    //Return statement
    return merged_config
  }


  /**
   * Loads the localised autorun dictionary from localisation/<locale>.json5 with English fallback.
   *
   * @param {string} arg0_root_dir
   * @param {AutorunLocale} arg1_locale
   *
   * @returns {AutorunDictionary}
   */
  static loadDictionary (arg0_root_dir: string, arg1_locale: AutorunLocale): AutorunDictionary {
    //Convert from parameters
    let root_dir = arg0_root_dir
    let locale = arg1_locale

    //Declare local instance variables
    let filename = 'en_gb.json5'
    let locale_path: string
    let merged_dict: AutorunDictionary = { ...DEFAULT_AUTORUN_DICTIONARY }

    //Function body
    if (locale === 'fr') {
      filename = 'fr.json5'
    } else if (locale === 'de') {
      filename = 'de.json5'
    }
    locale_path = path.resolve(root_dir, 'localisation', filename)

    try {
      if (fs.existsSync(locale_path)) {
        let parsed_locale = JSON5.parse(fs.readFileSync(locale_path, 'utf8'))
        if (parsed_locale && parsed_locale.autorun && typeof parsed_locale.autorun === 'object')
          merged_dict = { ...DEFAULT_AUTORUN_DICTIONARY, ...parsed_locale.autorun }
      }
    } catch (arg0_err) {
      console.error(`[AutorunTui] Failed to load localisation/${filename}:`, arg0_err)
    }

    //Return statement
    return merged_dict
  }


  /**
   * Loads persisted per-machine lock-in and TUI preferences from autorun.local.
   *
   * @param {string} arg0_root_dir
   * @param {string} arg1_state_filename
   *
   * @returns {AutorunLocalState}
   */
  static loadLocalState (arg0_root_dir: string, arg1_state_filename: string): AutorunLocalState {
    //Convert from parameters
    let root_dir = arg0_root_dir
    let state_filename = arg1_state_filename

    //Declare local instance variables
    let local_state: AutorunLocalState = {}
    let state_path = path.resolve(root_dir, state_filename)

    //Function body
    try {
      if (fs.existsSync(state_path)) {
        let parsed_state = JSON5.parse(fs.readFileSync(state_path, 'utf8'))
        if (parsed_state && typeof parsed_state === 'object')
          local_state = parsed_state
      }
    } catch {
      local_state = {}
    }

    //Return statement
    return local_state
  }


  /**
   * Right-pads an ANSI-styled string with spaces so its visible width equals width.
   *
   * @param {string} arg0_text
   * @param {number} arg1_width
   *
   * @returns {string}
   */
  static padVisible (arg0_text: string, arg1_width: number): string {
    //Convert from parameters
    let text = arg0_text
    let width = arg1_width

    //Declare local instance variables
    let pad_count: number
    let visible_length = AutorunTui.stripAnsi(text).length

    //Function body
    pad_count = Math.max(0, width - visible_length)

    //Return statement
    return `${text}${' '.repeat(pad_count)}`
  }


  /**
   * Renders the full interactive TUI launcher screen with mode list, lock-in badges and settings.
   *
   * @param {MenuRenderState} arg0_state
   *
   * @returns {string}
   */
  static renderMenuScreen (arg0_state: MenuRenderState): string {
    //Convert from parameters
    let state = arg0_state

    //Declare local instance variables
    let all_modes: Array<ServerMode | 'exit'> = ['preview', 'dev', 'rebuild', 'exit']
    let browser_badge: string
    let cols = process.stdout.columns ? process.stdout.columns : 86
    let dict = state.dict
    let divider: string
    let heap_gb = AutorunTui.formatEuroDecimal(state.config.max_old_space_size_mb/1024, 2)
    let header_left: string
    let header_right: string
    let header_spaces: number
    let inner_width = Math.min(88, Math.max(68, cols - 4))
    let lines_array: string[] = []
    let lock_badge: string
    let lock_desc: string
    let top_border: string
    let bottom_border: string

    //Function body
    top_border = AutorunTui.colourMuted(`┌${'─'.repeat(inner_width)}┐`)
    divider = AutorunTui.colourMuted(`├${'─'.repeat(inner_width)}┤`)
    bottom_border = AutorunTui.colourMuted(`└${'─'.repeat(inner_width)}┘`)

    header_left = AutorunTui.colourWhiteBold(dict.title)
    header_right = AutorunTui.colourMuted(`[${state.locale.toUpperCase()}]`)
    header_spaces = Math.max(1, inner_width - 2 - AutorunTui.stripAnsi(header_left).length - AutorunTui.stripAnsi(header_right).length)

    //Format lines_array
    lines_array.push(top_border)
    lines_array.push(AutorunTui.getBoxLine(`${header_left}${' '.repeat(header_spaces)}${header_right}`, inner_width))
    lines_array.push(divider)
    lines_array.push(AutorunTui.getBoxLine('', inner_width))

    for (let i = 0; i < all_modes.length; i++) {
      let local_badge = ''
      let local_desc = AutorunTui.colourMuted(`(${AutorunTui.getModeDescription(all_modes[i], dict)})`)
      let local_is_locked = state.locked_mode === all_modes[i]
      let local_is_selected = state.selected_index === i
      let local_key = local_is_selected
        ? AutorunTui.colourRed(`▸ [${i + 1}]`)
        : AutorunTui.colourMuted(`  [${i + 1}]`)
      let local_label_raw = AutorunTui.padVisible(AutorunTui.getModeLabel(all_modes[i], dict), 25)
      let local_label = local_is_selected
        ? AutorunTui.colourWhiteBold(local_label_raw)
        : AutorunTui.colourWhite(local_label_raw)
      let local_row: string

      if (local_is_locked)
        local_badge = `  ${AutorunTui.colourGreen(`[${dict.lockedInBadge}]`)}`

      local_row = `${local_key}  ${local_label} ${local_desc}${local_badge}`
      lines_array.push(AutorunTui.getBoxLine(local_row, inner_width))
    }

    lines_array.push(AutorunTui.getBoxLine('', inner_width))
    lines_array.push(divider)

    if (state.locked_mode) {
      lock_badge = AutorunTui.colourGreen(`[${state.locked_mode.toUpperCase()} • ${dict.lockedInBadge}]`)
      lock_desc = dict.lockInSetDesc
    } else {
      lock_badge = AutorunTui.colourRed(`[${dict.unlockedBadge}]`)
      lock_desc = dict.lockInNoneDesc
    }

    browser_badge = state.open_browser
      ? AutorunTui.colourGreen(`[${dict.browserOn}]`)
      : AutorunTui.colourRed(`[${dict.browserOff}]`)

    lines_array.push(
      AutorunTui.getBoxLine(
        `${AutorunTui.padVisible(AutorunTui.colourWhite(dict.watchdogLabel), 18)}: ${AutorunTui.padVisible(AutorunTui.getWatchdogBadge(state.watchdog_policy, dict), 15)} ${AutorunTui.colourMuted(AutorunTui.getWatchdogDescription(state.watchdog_policy, dict))}`,
        inner_width
      )
    )
    lines_array.push(
      AutorunTui.getBoxLine(
        `${AutorunTui.padVisible(AutorunTui.colourWhite(dict.lockInLabel), 18)}: ${AutorunTui.padVisible(lock_badge, 15)} ${AutorunTui.colourMuted(lock_desc)}`,
        inner_width
      )
    )
    lines_array.push(
      AutorunTui.getBoxLine(
        `${AutorunTui.padVisible(AutorunTui.colourWhite(dict.browserOpenLabel), 18)}: ${AutorunTui.padVisible(browser_badge, 15)} ${AutorunTui.colourMuted(dict.browserOpenDesc)}`,
        inner_width
      )
    )
    lines_array.push(
      AutorunTui.getBoxLine(
        `${AutorunTui.padVisible(AutorunTui.colourWhite(dict.heapPortLabel), 18)}: ${AutorunTui.colourWhite(AutorunTui.formatString(dict.heapPortInfo, [heap_gb, state.config.port]))}`,
        inner_width
      )
    )

    lines_array.push(divider)
    lines_array.push(AutorunTui.getBoxLine(AutorunTui.colourWhite(dict.menuControlsLine1), inner_width))
    lines_array.push(AutorunTui.getBoxLine(AutorunTui.colourWhite(dict.menuControlsLine2), inner_width))

    if (state.locked_mode && state.countdown_remaining_ms > 0 && !state.countdown_paused) {
      lines_array.push(divider)
      lines_array.push(
        AutorunTui.getBoxLine(
          AutorunTui.colourGreen(
            AutorunTui.formatString(dict.autoBootCountdown, [
              AutorunTui.getModeLabel(state.locked_mode, dict),
              AutorunTui.formatEuroDecimal(state.countdown_remaining_ms/1000, 1),
            ])
          ),
          inner_width
        )
      )
    } else if (state.locked_mode && state.countdown_paused) {
      lines_array.push(divider)
      lines_array.push(
        AutorunTui.getBoxLine(
          AutorunTui.colourWhite(
            AutorunTui.formatString(dict.autoBootPaused, [AutorunTui.getModeLabel(state.locked_mode, dict)])
          ),
          inner_width
        )
      )
    } else if (state.notice_message) {
      lines_array.push(divider)
      lines_array.push(AutorunTui.getBoxLine(AutorunTui.colourWhite(state.notice_message), inner_width))
    }

    lines_array.push(bottom_border)

    //Return statement
    return lines_array.join('\n')
  }


  /**
   * Renders the compact supervisor status header card displayed above streaming server output.
   *
   * @param {RunningBannerState} arg0_state
   *
   * @returns {string}
   */
  static renderRunningBanner (arg0_state: RunningBannerState): string {
    //Convert from parameters
    let state = arg0_state

    //Declare local instance variables
    let bottom_border: string
    let cols = process.stdout.columns ? process.stdout.columns : 86
    let dict = state.dict
    let divider: string
    let effective_policy: WatchdogPolicy = state.session_locked ? 'persistent' : state.watchdog_policy
    let heap_gb = AutorunTui.formatEuroDecimal(state.config.max_old_space_size_mb/1024, 2)
    let inner_width = Math.min(92, Math.max(68, cols - 4))
    let lines_array: string[] = []
    let lock_status: string
    let mode_title = AutorunTui.getModeLabel(state.mode, dict)
    let top_border: string

    //Function body
    top_border = AutorunTui.colourMuted(`┌${'─'.repeat(inner_width)}┐`)
    divider = AutorunTui.colourMuted(`├${'─'.repeat(inner_width)}┤`)
    bottom_border = AutorunTui.colourMuted(`└${'─'.repeat(inner_width)}┘`)

    lock_status = state.session_locked
      ? AutorunTui.colourGreen(`[${dict.lockedInBadge}]`)
      : AutorunTui.colourRed(`[${dict.unlockedBadge}]`)

    //Format lines_array
    lines_array.push(top_border)
    lines_array.push(
      AutorunTui.getBoxLine(
        `${AutorunTui.colourWhiteBold(mode_title)}  ${lock_status}  ${AutorunTui.getWatchdogBadge(effective_policy, dict)}  ${AutorunTui.colourMuted(`[${state.locale.toUpperCase()}]`)}`,
        inner_width
      )
    )
    lines_array.push(
      AutorunTui.getBoxLine(
        `${AutorunTui.colourWhite(AutorunTui.formatString(dict.heapPortInfo, [heap_gb, state.config.port]))}  •  ${AutorunTui.colourMuted(AutorunTui.formatString(dict.runningStats, [state.total_restarts, state.oom_restarts, state.started_at_utc]))}`,
        inner_width
      )
    )

    if (state.is_interactive) {
      lines_array.push(divider)
      lines_array.push(AutorunTui.getBoxLine(AutorunTui.colourWhite(dict.runningControls), inner_width))
    }

    lines_array.push(bottom_border)

    //Return statement
    return lines_array.join('\n')
  }


  /**
   * Persists per-machine lock-in and TUI preferences to autorun.local.
   *
   * @param {string} arg0_root_dir
   * @param {string} arg1_state_filename
   * @param {AutorunLocalState} arg2_state
   *
   * @returns {void}
   */
  static saveLocalState (arg0_root_dir: string, arg1_state_filename: string, arg2_state: AutorunLocalState): void {
    //Convert from parameters
    let root_dir = arg0_root_dir
    let state_filename = arg1_state_filename
    let state = arg2_state

    //Declare local instance variables
    let serialized: string
    let state_path = path.resolve(root_dir, state_filename)

    //Function body
    try {
      serialized = JSON.stringify(state, null, 2)
      fs.writeFileSync(state_path, `${serialized}\n`, 'utf8')
    } catch (arg0_err) {
      console.error('[AutorunTui] Failed to write local state file:', arg0_err)
    }
  }


  /**
   * Strips ANSI escape sequences to compute visible character length.
   *
   * @param {string} arg0_text
   *
   * @returns {string}
   */
  static stripAnsi (arg0_text: string): string {
    //Convert from parameters
    let text = arg0_text

    //Declare local instance variables
    let in_escape = false
    let out = ''

    //Function body
    for (let i = 0; i < text.length; i++) {
      let local_code = text.charCodeAt(i)
      if (!in_escape && local_code === 27 && text[i + 1] === '[') {
        in_escape = true
        continue
      }
      if (in_escape) {
        if (text[i] === 'm')
          in_escape = false
        continue
      }
      out += text[i]
    }

    //Return statement
    return out
  }


  /**
   * Truncates an ANSI-styled string to max_width visible characters while preserving ANSI resets.
   *
   * @param {string} arg0_text
   * @param {number} arg1_max_width
   *
   * @returns {string}
   */
  static truncateVisible (arg0_text: string, arg1_max_width: number): string {
    //Convert from parameters
    let text = arg0_text
    let max_width = Math.max(0, arg1_max_width)

    //Declare local instance variables
    let in_escape = false
    let out = ''
    let visible_count = 0

    //Guard clauses
    if (AutorunTui.stripAnsi(text).length <= max_width)
      return text

    //Function body
    for (let i = 0; i < text.length; i++) {
      let local_code = text.charCodeAt(i)
      if (!in_escape && local_code === 27 && text[i + 1] === '[') {
        in_escape = true
        out += text[i]
        continue
      }
      if (in_escape) {
        out += text[i]
        if (text[i] === 'm')
          in_escape = false
        continue
      }
      if (visible_count >= Math.max(0, max_width - 1)) {
        out += '…'
        break
      }
      out += text[i]
      visible_count++
    }

    if (AutorunTui.isColourEnabled())
      out += '\x1b[0m'

    //Return statement
    return out
  }
}
