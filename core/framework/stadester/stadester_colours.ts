import { getPaletteLUT } from '../geopng/palettes.ts'
import { ColorPalette } from '../geopng/types.ts'

export interface RegionDefinition {
  colour: string
  key: string
  name: string
  rgb: [number, number, number]
}

export let RAINBOW_GROWTH_GRADIENT = 'linear-gradient(to right, rgb(93, 96, 226), rgb(72, 156, 240), rgb(69, 207, 119), rgb(198, 219, 85), rgb(253, 224, 71), rgb(251, 146, 60), rgb(239, 68, 68), rgb(232, 121, 249))'

export let REGION_DEFINITIONS: RegionDefinition[] = [
  { colour: '#f97316', key: 'sub_saharan_africa', name: 'Sub-Saharan Africa', rgb: [249, 115, 22] },
  { colour: '#eab308', key: 'maghreb_egypt', name: 'Maghreb & Egypt', rgb: [234, 179, 8] },
  { colour: '#d97706', key: 'middle_east', name: 'Middle East', rgb: [217, 119, 6] },
  { colour: '#a855f7', key: 'central_asia', name: 'Central Asia', rgb: [168, 85, 247] },
  { colour: '#ec4899', key: 'indian_subcontinent', name: 'Indian Subcontinent', rgb: [236, 72, 153] },
  { colour: '#ef4444', key: 'eastasia', name: 'East Asia', rgb: [239, 68, 68] },
  { colour: '#8b5cf6', key: 'southeast_asia', name: 'Southeast Asia', rgb: [139, 92, 246] },
  { colour: '#6366f1', key: 'europe', name: 'Europe', rgb: [99, 102, 241] },
  { colour: '#3b82f6', key: 'eastern_europe_and_russia', name: 'E. Europe & Russia', rgb: [59, 130, 246] },
  { colour: '#0ea5e9', key: 'northern_america', name: 'N. America', rgb: [14, 165, 233] },
  { colour: '#10b981', key: 'latin_america', name: 'Latin America', rgb: [16, 185, 129] },
  { colour: '#14b8a6', key: 'oceania', name: 'Oceania', rgb: [20, 184, 166] },
]

export let REGION_DEFAULT_GRADIENT = `linear-gradient(to right, ${REGION_DEFINITIONS.map((arg0_r) => arg0_r.colour).join(', ')})`

let lut_cache = new Map<string, Uint8Array>()

let RAINBOW_GROWTH_STOPS: Array<[number, [number, number, number]]> = [
  [0.08, [232, 121, 249]],
  [0.06, [239, 68, 68]],
  [0.03, [251, 146, 60]],
  [0.01, [253, 224, 71]],
  [0.00, [198, 219, 85]],
  [-0.02, [69, 207, 119]],
  [-0.04, [72, 156, 240]],
  [-0.05, [93, 96, 226]],
]

let REGION_ALIAS_TO_INDEX = new Map<string, number>([
  ['africa', 0],
  ['central_asia', 3],
  ['eastasia', 5],
  ['eastern_europe_and_russia', 8],
  ['europe', 7],
  ['indian_subcontinent', 4],
  ['latin_america', 10],
  ['maghreb_egypt', 1],
  ['middle_east', 2],
  ['northern_america', 9],
  ['oceania', 11],
  ['south_asia', 4],
  ['southeast_asia', 6],
  ['sub_saharan_africa', 0],
])

/**
 * Retrieves or generates a cached 256-entry RGB lookup table for a D3 palette.
 *
 * @param {string} arg0_palette
 *
 * @returns {Uint8Array}
 */
function getCachedPaletteLut (arg0_palette: string): Uint8Array {
  //Convert from parameters
  let palette = arg0_palette

  //Declare local instance variables
  let lut = lut_cache.get(palette)

  //Guard clauses
  if (lut)
    return lut

  //Function body
  lut = getPaletteLUT(palette as ColorPalette)
  lut_cache.set(palette, lut)

  //Return statement
  return lut
}

/**
 * Computes RGB colour for an annual settlement growth rate using cached LUTs or Rainbow stops.
 *
 * @param {number} arg0_rate
 * @param {string} [arg1_palette='Rainbow']
 *
 * @returns {[number, number, number]}
 */
export function getGrowthRgb (arg0_rate: number, arg1_palette?: string): [number, number, number] {
  //Convert from parameters
  let palette = (arg1_palette) ? arg1_palette : 'Rainbow'
  let r = arg0_rate

  //Declare local instance variables
  let last_idx = RAINBOW_GROWTH_STOPS.length - 1

  //Guard clauses
  if (!Number.isFinite(r))
    return [160, 160, 160]

  //Function body
  if (palette !== 'Rainbow') {
    try {
      let lut = getCachedPaletteLut(palette)
      let norm_t = Math.max(0, Math.min(1, (r - (-0.05))/(0.08 - (-0.05))))
      let lut_idx = Math.min(255, Math.max(0, Math.round(norm_t*255)))
      return [lut[lut_idx*3], lut[lut_idx*3 + 1], lut[lut_idx*3 + 2]]
    } catch {
      //Fallback to Rainbow stops
    }
  }

  if (r >= RAINBOW_GROWTH_STOPS[0][0])
    return RAINBOW_GROWTH_STOPS[0][1]
  if (r <= RAINBOW_GROWTH_STOPS[last_idx][0])
    return RAINBOW_GROWTH_STOPS[last_idx][1]

  for (let i = 0; i < last_idx; i++) {
    let hi = RAINBOW_GROWTH_STOPS[i][0]
    let lo = RAINBOW_GROWTH_STOPS[i + 1][0]
    if (r <= hi && r >= lo) {
      let c_hi = RAINBOW_GROWTH_STOPS[i][1]
      let c_lo = RAINBOW_GROWTH_STOPS[i + 1][1]
      let t = (hi === lo) ? 0 : (r - lo)/(hi - lo)
      return [
        Math.round(c_lo[0] + t*(c_hi[0] - c_lo[0])),
        Math.round(c_lo[1] + t*(c_hi[1] - c_lo[1])),
        Math.round(c_lo[2] + t*(c_hi[2] - c_lo[2])),
      ]
    }
  }

  //Return statement
  return RAINBOW_GROWTH_STOPS[4][1]
}

/**
 * Computes RGB colour for a settlement population using a logarithmic scale and selected D3 palette.
 *
 * @param {number} arg0_pop
 * @param {string} [arg1_palette='Plasma']
 *
 * @returns {[number, number, number]}
 */
export function getPopRgb (arg0_pop: number, arg1_palette?: string): [number, number, number] {
  //Convert from parameters
  let palette = (arg1_palette) ? arg1_palette : 'Plasma'
  let pop = arg0_pop

  //Declare local instance variables
  let p = Math.max(1, pop)
  let t = Math.max(0, Math.min(1, (Math.log10(p) - 3.7)/3.6))

  //Function body
  try {
    let lut = getCachedPaletteLut(palette)
    let lut_idx = Math.min(255, Math.max(0, Math.round(t*255)))
    return [lut[lut_idx*3], lut[lut_idx*3 + 1], lut[lut_idx*3 + 2]]
  } catch {
    let b = Math.round(Math.max(0, 135 - t*100))
    let g = Math.round(Math.min(255, 8 + t*210))
    let r = Math.round(Math.min(255, 13 + t*240))
    return [r, g, b]
  }
}

/**
 * Resolves the canonical region index (0..11) for a settlement region string and coordinate pair.
 *
 * @param {string} [arg0_region]
 * @param {[number, number]} [arg1_coords]
 *
 * @returns {number}
 */
export function resolveRegionIndex (arg0_region?: string, arg1_coords?: [number, number]): number {
  //Convert from parameters
  let coords = arg1_coords
  let reg = (arg0_region || '').toLowerCase().trim()

  //Declare local instance variables
  let alias_idx = reg ? REGION_ALIAS_TO_INDEX.get(reg) : undefined

  //Guard clauses
  if (alias_idx !== undefined)
    return alias_idx

  //Function body
  if (coords && Array.isArray(coords) && coords.length >= 2) {
    let lat = coords[0]
    let lon = coords[1]

    if (lat < -10 && lon > 110)
      return 11
    if (lat > 18 && lon >= 98 && lon <= 150)
      return 5
    if (lat > 0 && lat <= 25 && lon >= 90 && lon < 150)
      return 6
    if (lat > 5 && lat < 38 && lon > 60 && lon < 90)
      return 4
    if (lat > 40 && lon >= 30 && lon <= 180)
      return 8
    if (lat > 35 && lat < 72 && lon > -15 && lon < 30)
      return 7
    if (lat > 15 && lat <= 36 && lon > 25 && lon < 60)
      return 2
    if (lat > 20 && lat <= 37 && lon > -18 && lon < 35)
      return 1
    if (lat <= 20 && lon > -20 && lon < 55)
      return 0
    if (lat > 15 && lon > -170 && lon < -50)
      return 9
    if (lat <= 15 && lon > -120 && lon < -30)
      return 10
  }

  //Return statement
  return 5
}

/**
 * Resolves the RGB colour for a settlement's geographic region under the active region palette.
 *
 * @param {string} [arg0_region]
 * @param {[number, number]} [arg1_coords]
 * @param {string} [arg2_palette='Default']
 *
 * @returns {[number, number, number]}
 */
export function resolveRegionColorRgb (
  arg0_region?: string,
  arg1_coords?: [number, number],
  arg2_palette?: string
): [number, number, number] {
  //Convert from parameters
  let coords = arg1_coords
  let palette = (arg2_palette) ? arg2_palette : 'Default'
  let region = arg0_region

  //Declare local instance variables
  let region_idx = resolveRegionIndex(region, coords)

  //Guard clauses
  if (palette === 'Default')
    return REGION_DEFINITIONS[region_idx].rgb

  //Function body
  try {
    let lut = getCachedPaletteLut(palette)
    let t = (REGION_DEFINITIONS.length > 1) ? region_idx/(REGION_DEFINITIONS.length - 1) : 0
    let lut_idx = Math.min(255, Math.max(0, Math.round(t*255)))
    return [lut[lut_idx*3], lut[lut_idx*3 + 1], lut[lut_idx*3 + 2]]
  } catch {
    return REGION_DEFINITIONS[region_idx].rgb
  }
}

/**
 * Resolves the 12 region chip entries with CSS colours matching the active region palette.
 *
 * @param {string} [arg0_palette='Default']
 *
 * @returns {Array<{ colour: string; key: string; name: string }>}
 */
export function resolveRegionChipColours (
  arg0_palette?: string
): Array<{ colour: string; key: string; name: string }> {
  //Convert from parameters
  let palette = (arg0_palette) ? arg0_palette : 'Default'

  //Declare local instance variables
  let chips: Array<{ colour: string; key: string; name: string }> = []

  //Function body
  for (let i = 0; i < REGION_DEFINITIONS.length; i++) {
    let def = REGION_DEFINITIONS[i]
    if (palette === 'Default') {
      chips.push({ colour: def.colour, key: def.key, name: def.name })
    } else {
      let rgb = resolveRegionColorRgb(def.key, undefined, palette)
      chips.push({ colour: `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`, key: def.key, name: def.name })
    }
  }

  //Return statement
  return chips
}
