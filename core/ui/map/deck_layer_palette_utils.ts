/**
 * Palette resolution and color formatting utilities for deck.gl overlays.
 *
 * @module core/ui/map/deck_layer_palette_utils
 */

export let REGION_COLOR_MAP: Record<string, string> = {
  africa: '#f97316',
  central_asia: '#a855f7',
  eastasia: '#ef4444',
  eastern_europe_and_russia: '#3b82f6',
  europe: '#6366f1',
  indian_subcontinent: '#ec4899',
  latin_america: '#10b981',
  maghreb_egypt: '#eab308',
  middle_east: '#d97706',
  northern_america: '#0ea5e9',
  oceania: '#14b8a6',
  south_asia: '#ec4899',
  southeast_asia: '#8b5cf6',
  sub_saharan_africa: '#f97316',
}

/**
 * Ensures an RGB colour meets a minimum luminance threshold against dark backgrounds
 * by smoothly tinting towards white whilst preserving the original hue.
 *
 * @param {[number, number, number]} arg0_rgb
 * @param {number} [arg1_min_luminance=155]
 *
 * @returns {[number, number, number]}
 */
export function ensureContrastAgainstDark (
  arg0_rgb: [number, number, number],
  arg1_min_luminance?: number
): [number, number, number] {
  //Convert from parameters
  let min_luminance = (arg1_min_luminance !== undefined) ? arg1_min_luminance : 155
  let rgb = arg0_rgb

  //Declare local instance variables
  let b = rgb[2]
  let current_lum: number
  let g = rgb[1]
  let r = rgb[0]
  let t: number

  //Guard clauses
  if (!rgb || rgb.length < 3 || isNaN(r) || isNaN(g) || isNaN(b))
    return [255, 220, 0]

  //Function body
  current_lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (current_lum >= min_luminance)
    return [r, g, b]

  t = Math.max(0, Math.min(1, (min_luminance - current_lum) / (255 - current_lum)))

  r = Math.round(r + (255 - r) * t)
  g = Math.round(g + (255 - g) * t)
  b = Math.round(b + (255 - b) * t)

  //Return statement
  return [r, g, b]
}


/**
 * Resolves a capital city's RGBA label colour, ensuring minimum luminance contrast against dark backgrounds.
 *
 * @param {any} arg0_city - City object containing capitalColor or capital_color metadata
 * @param {any} [arg1_config] - Stadester configuration with capitalColorMode and capitalConstantColor
 * @param {number} [arg2_min_luminance=155] - Minimum luminance threshold to enforce
 *
 * @returns {[number, number, number, number]}
 */
export function getCapitalColorRgba (
  arg0_city: any,
  arg1_config?: any,
  arg2_min_luminance?: number
): [number, number, number, number] {
  //Convert from parameters
  let city = arg0_city
  let config = arg1_config
  let min_luminance = (arg2_min_luminance !== undefined) ? arg2_min_luminance : 155

  //Declare local instance variables
  let cap_rgb: [number, number, number] = [255, 220, 0]
  let color_mode = config?.capitalColorMode || 'state'
  let constant_color = config?.capitalConstantColor || '#FFDC00'
  let contrast_rgb: [number, number, number]
  let raw_cap_color: any

  //Guard clauses
  if (!city)
    return [255, 220, 0, 255]

  //Function body
  raw_cap_color = city.capitalColor || city.capital_color

  if (color_mode === 'constant') {
    cap_rgb = hexToRgb(constant_color)
  } else if (Array.isArray(raw_cap_color) && raw_cap_color.length >= 3) {
    cap_rgb = [raw_cap_color[0], raw_cap_color[1], raw_cap_color[2]]
  } else if (typeof raw_cap_color === 'string' && raw_cap_color.trim().length > 0) {
    cap_rgb = hexToRgb(raw_cap_color)
  } else {
    cap_rgb = hexToRgb(constant_color)
  }

  contrast_rgb = ensureContrastAgainstDark(cap_rgb, min_luminance)

  //Return statement
  return [contrast_rgb[0], contrast_rgb[1], contrast_rgb[2], 255]
}


/**
 * Converts hexadecimal color string to [R, G, B] tuple.
 *
 * @param {string} arg0_hex
 *
 * @returns {[number, number, number]}
 */
export function hexToRgb (arg0_hex: string): [number, number, number] {
  //Convert from parameters
  let hex = (arg0_hex || '').replace('#', '').trim()

  //Declare local instance variables
  let num: number

  //Guard clauses
  if (!hex)
    return [255, 220, 0]

  //Function body
  if (hex.length === 3)
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2]

  num = parseInt(hex, 16)
  if (isNaN(num))
    return [255, 220, 0]

  //Return statement
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}


/**
 * Resolves regional color hex for a given world region and coordinate pair.
 *
 * @param {string} [arg0_region]
 * @param {[number, number]} [arg1_coords]
 *
 * @returns {string}
 */
export function resolveRegionColorHex (arg0_region?: string, arg1_coords?: [number, number]): string {
  //Convert from parameters
  let coords = arg1_coords
  let reg = (arg0_region || '').toLowerCase().trim()

  //Guard clauses
  if (reg && REGION_COLOR_MAP[reg])
    return REGION_COLOR_MAP[reg]

  if (coords && Array.isArray(coords) && coords.length >= 2) {
    let lat = coords[0]
    let lon = coords[1]

    if (lat < -10 && lon > 110)
      return REGION_COLOR_MAP.oceania
    if (lat > 18 && lon >= 98 && lon <= 150)
      return REGION_COLOR_MAP.eastasia
    if (lat > 0 && lat <= 25 && lon >= 90 && lon < 150)
      return REGION_COLOR_MAP.southeast_asia
    if (lat > 5 && lat < 38 && lon > 60 && lon < 90)
      return REGION_COLOR_MAP.indian_subcontinent
    if (lat > 40 && lon >= 30 && lon <= 180)
      return REGION_COLOR_MAP.eastern_europe_and_russia
    if (lat > 35 && lat < 72 && lon > -15 && lon < 30)
      return REGION_COLOR_MAP.europe
    if (lat > 15 && lat <= 36 && lon > 25 && lon < 60)
      return REGION_COLOR_MAP.middle_east
    if (lat > 20 && lat <= 37 && lon > -18 && lon < 35)
      return REGION_COLOR_MAP.maghreb_egypt
    if (lat <= 20 && lon > -20 && lon < 55)
      return REGION_COLOR_MAP.sub_saharan_africa
    if (lat > 15 && lon > -170 && lon < -50)
      return REGION_COLOR_MAP.northern_america
    if (lat <= 15 && lon > -120 && lon < -30)
      return REGION_COLOR_MAP.latin_america
  }

  //Return statement
  return '#ef4444'
}
