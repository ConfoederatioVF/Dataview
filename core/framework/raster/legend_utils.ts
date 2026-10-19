import { ColorPalette, ScaleType } from '@framework/geopng/types'
import { ParsedDataLayer } from '@server/layer_parser.ts'
import { formatCohortDisplay } from '@ui/map/click_info_panel'

let COLOURSCHEME_MAP: Record<string, ColorPalette> = {
  blues: 'Blues',
  brbg: 'BrBG',
  bugn: 'BuGn',
  bupu: 'BuPu',
  cividis: 'Cividis',
  cool: 'Cool',
  cubehelixdefault: 'CubehelixDefault',
  gnbu: 'GnBu',
  greens: 'Greens',
  greys: 'Greys',
  inferno: 'Inferno',
  magma: 'Magma',
  oranges: 'Oranges',
  orrd: 'OrRd',
  piyg: 'PiYG',
  plasma: 'Plasma',
  prgn: 'PRGn',
  pubu: 'PuBu',
  pubugn: 'PuBuGn',
  puor: 'PuOr',
  purd: 'PuRd',
  purples: 'Purples',
  rainbow: 'Rainbow',
  rdbu: 'RdBu',
  rdgy: 'RdGy',
  rdpu: 'RdPu',
  rdylbu: 'RdYlBu',
  rdylgn: 'RdYlGn',
  reds: 'Reds',
  sinebow: 'Sinebow',
  spectral: 'Spectral',
  turbo: 'Turbo',
  viridis: 'Viridis',
  warm: 'Warm',
  ylgn: 'YlGn',
  ylgnbu: 'YlGnBu',
  ylorbr: 'YlOrBr',
  ylorrd: 'YlOrRd',
}

/**
 * Maps raw JSON5 colourscheme strings to the corresponding D3 ColorPalette enum name.
 *
 * @param {string} [arg0_scheme]
 *
 * @returns {ColorPalette | null}
 */
export let mapColourschemeToPalette = function (arg0_scheme?: string): ColorPalette | null {
  //Convert from parameters
  let raw = arg0_scheme || ''

  //Declare local instance variables
  let s = raw.toLowerCase().replace(/[^a-z]/g, '')

  //Return statement
  return COLOURSCHEME_MAP[s] || null
}

/**
 * Applies legend configuration (colourscheme, inversion, scale type, steepness/sigma, units) from layer or active variable selector option.
 *
 * @param {ParsedDataLayer | null} arg0_layer
 * @param {Record<string, string | string[]>} arg1_selectors
 * @param {(arg0_palette: ColorPalette) => void} arg2_set_palette
 * @param {(arg0_invert: boolean) => void} arg3_set_invert
 * @param {(arg0_scale: ScaleType) => void} arg4_set_scale
 * @param {(arg0_title: string) => void} arg5_set_title
 * @param {(arg0_subtitle: string) => void} arg6_set_subtitle
 * @param {(arg0_sigma: number) => void} [arg7_set_log_sigma]
 * @param {(arg0_midpoint: number | undefined) => void} [arg8_set_midpoint]
 */
export let applyLayerLegend = function (
  arg0_layer: ParsedDataLayer | null,
  arg1_selectors: Record<string, string | string[]>,
  arg2_set_palette: (arg0_palette: ColorPalette) => void,
  arg3_set_invert: (arg0_invert: boolean) => void,
  arg4_set_scale: (arg0_scale: ScaleType) => void,
  arg5_set_title: (arg0_title: string) => void,
  arg6_set_subtitle: (arg0_subtitle: string) => void,
  arg7_set_log_sigma?: (arg0_sigma: number) => void,
  arg8_set_midpoint?: (arg0_midpoint: number | undefined) => void
) {
  //Convert from parameters
  let layer = arg0_layer
  let selectors = arg1_selectors
  let set_palette = arg2_set_palette
  let set_invert = arg3_set_invert
  let set_scale = arg4_set_scale
  let set_title = arg5_set_title
  let set_subtitle = arg6_set_subtitle
  let set_log_sigma = arg7_set_log_sigma
  let set_midpoint = arg8_set_midpoint

  //Guard clauses
  if (!layer)
    return

  //Declare local instance variables
  let base_name: string
  let candidate_legend: { colourscheme?: string; inverted?: boolean; steepness?: number; type?: string } | undefined
  let candidate_title = layer.name || layer.id
  let candidate_unit = layer.unit || ''
  let mapped_palette: ColorPalette | null = null

  //Function body
  base_name = (layer.name || layer.id).replace(/\s*\(Total\)/i, '')

  if (layer.variable_selectors) {
    let sel_keys = Object.keys(layer.variable_selectors)
    let selected_option_names: string[] = []

    for (let i = 0; i < sel_keys.length; i++) {
      let sk = sel_keys[i]
      let opt_keys = Object.keys(layer.variable_selectors[sk]?.options || {})
      let raw_val = selectors[sk]
      let chosen_vals = Array.isArray(raw_val) ? raw_val : [raw_val || opt_keys[0] || '']
      let valid_chosen_vals = chosen_vals.filter((arg0_val) => layer.variable_selectors![sk]?.options[arg0_val])
      if (valid_chosen_vals.length === 0 && opt_keys.length > 0)
        valid_chosen_vals = [opt_keys[0]]
      let primary_val = valid_chosen_vals[0] || ''
      if (primary_val && layer.variable_selectors[sk]?.options[primary_val]) {
        let opt = layer.variable_selectors[sk].options[primary_val]
        if (opt.legend)
          candidate_legend = opt.legend
        if (opt.name) {
          if (valid_chosen_vals.length > 1) {
            let names = valid_chosen_vals.map((arg0_val) => layer.variable_selectors![sk].options[arg0_val]?.name || arg0_val)
            if (names.length <= 3) {
              selected_option_names.push(names.join(', '))
            } else {
              selected_option_names.push(`${names.slice(0, 2).join(', ')} +${names.length - 2}`)
            }
          } else if (opt.name === 'Total' && sel_keys.length > 1) {
            //Skip redundant Total when other specific cohort option is present
          } else {
            selected_option_names.push(opt.name)
          }
        }
      }
    }

    //1. Age / Sex demographic cohorts (e.g. M10-15, F20-25)
    let is_age_sex = (layer.type === 'raster.age_sex') || Boolean(layer.variable_selectors?.gender && layer.variable_selectors?.age)
    if (is_age_sex) {
      let cohort_str = formatCohortDisplay(selectors.gender, selectors.age, layer)
      if (cohort_str && cohort_str !== 'All Ages') {
        candidate_title = `${base_name} (${cohort_str})`
        candidate_unit = cohort_str
      }
    } else if (layer.variable_selectors?.profession) {
      //2. Professions / occupations breakdown
      let prof_keys = Array.isArray(selectors.profession)
        ? selectors.profession
        : (selectors.profession ? [selectors.profession] : [])
      let prof_names = prof_keys.map((arg0_k) => layer.variable_selectors?.profession?.options?.[arg0_k]?.name || arg0_k)
      let prof_name = prof_names.length > 3
        ? `${prof_names.slice(0, 3).join(', ')} (+${prof_names.length - 3})`
        : prof_names.join(', ')

      let gender_keys = Array.isArray(selectors.gender)
        ? selectors.gender
        : (selectors.gender ? [selectors.gender] : [])
      let gender_names = gender_keys
        .filter((arg0_k) => arg0_k !== 't')
        .map((arg0_k) => layer.variable_selectors?.gender?.options?.[arg0_k]?.name || arg0_k)
      let gender_name = gender_names.length > 0 ? gender_names.join(', ') : null

      let prof_label = (gender_name && gender_name !== 'Total') ? `${prof_name} (${gender_name})` : prof_name
      if (prof_label) {
        candidate_title = `${base_name}: ${prof_label}`
        candidate_unit = prof_label
      }
    } else if (selected_option_names.length > 0) {
      candidate_title = `${base_name} (${selected_option_names.join(', ')})`
      if (!candidate_unit || candidate_unit === 'Total' || candidate_unit.toLowerCase().includes('selected occupation'))
        candidate_unit = selected_option_names.join(', ')
    }
  }

  if (!candidate_legend)
    candidate_legend = layer.legend

  if (candidate_legend?.colourscheme) {
    mapped_palette = mapColourschemeToPalette(candidate_legend.colourscheme)
    if (mapped_palette)
      set_palette(mapped_palette)
  } else {
    set_palette('Plasma')
  }

  if (candidate_legend?.inverted !== undefined)
    set_invert(candidate_legend.inverted)
  else
    set_invert(false)

  if (candidate_legend?.type) {
    let t = candidate_legend.type.toLowerCase()
    if (t === 'linear')
      set_scale('linear')
    else
      set_scale('pseudo-log')
  } else {
    set_scale('pseudo-log')
  }

  if (set_log_sigma) {
    if (candidate_legend?.steepness !== undefined && typeof candidate_legend.steepness === 'number' && !Number.isNaN(candidate_legend.steepness))
      set_log_sigma(candidate_legend.steepness)
    else
      set_log_sigma(1.0)
  }

  if (arg8_set_midpoint)
    arg8_set_midpoint(getActiveLayerMidpoint(layer, selectors))

  set_title(candidate_title)
  set_subtitle(candidate_unit)
}


/**
 * Resolves the active layer's configured midpoint based on active variable selectors and layer definition.
 *
 * @param {ParsedDataLayer | null} arg0_layer
 * @param {Record<string, string | string[]>} [arg1_selectors]
 *
 * @returns {number | undefined}
 */
export let getActiveLayerMidpoint = function (
  arg0_layer: ParsedDataLayer | null,
  arg1_selectors?: Record<string, string | string[]>
): number | undefined {
  //Convert from parameters
  let layer = arg0_layer
  let selectors = (arg1_selectors) ? arg1_selectors : {}

  //Guard clauses
  if (!layer)
    return undefined

  //Declare local instance variables
  let candidate_midpoint: number | undefined

  //Function body
  if (layer.variable_selectors) {
    let sel_keys = Object.keys(layer.variable_selectors)
    for (let i = 0; i < sel_keys.length; i++) {
      let chosen_vals: string[]
      let opt_keys = Object.keys(layer.variable_selectors[sel_keys[i]]?.options || {})
      let primary_val: string
      let raw_val = selectors[sel_keys[i]]
      let sk = sel_keys[i]
      let valid_chosen_vals: string[]

      chosen_vals = Array.isArray(raw_val) ? raw_val : [raw_val || opt_keys[0] || '']
      valid_chosen_vals = chosen_vals.filter((arg0_val) => layer.variable_selectors![sk]?.options[arg0_val])
      primary_val = (valid_chosen_vals.length > 0) ? valid_chosen_vals[0] : (opt_keys[0] || '')

      if (primary_val && layer.variable_selectors[sk]?.options[primary_val]) {
        let opt = layer.variable_selectors[sk].options[primary_val]
        if (opt.midpoint !== undefined) {
          candidate_midpoint = opt.midpoint
        } else if (opt.legend?.midpoint !== undefined) {
          candidate_midpoint = opt.legend.midpoint
        }
      }
    }
  }

  if (candidate_midpoint === undefined) {
    if (layer.midpoint !== undefined) {
      candidate_midpoint = layer.midpoint
    } else if (layer.legend?.midpoint !== undefined) {
      candidate_midpoint = layer.legend.midpoint
    }
  }

  //Return statement
  return candidate_midpoint
}

