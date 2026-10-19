import * as d3Chromatic from 'd3-scale-chromatic'
import { ColorPalette, ColorSchemeInfo, ScaleType, ProjectionType } from './types.ts'
import { transformValue } from './scales.ts'
import { CountryFeature } from './polygon_binning.ts'

export type RGB = [number, number, number]

//Map palette ID to d3-scale-chromatic interpolator
let D3_INTERPOLATOR_MAP: Record<ColorPalette, (t: number) => string> = {
  Blues: d3Chromatic.interpolateBlues,
  BrBG: d3Chromatic.interpolateBrBG,
  BuGn: d3Chromatic.interpolateBuGn,
  BuPu: d3Chromatic.interpolateBuPu,
  Cividis: d3Chromatic.interpolateCividis,
  Cool: d3Chromatic.interpolateCool,
  CubehelixDefault: d3Chromatic.interpolateCubehelixDefault,
  GnBu: d3Chromatic.interpolateGnBu,
  Greens: d3Chromatic.interpolateGreens,
  Greys: d3Chromatic.interpolateGreys,
  Inferno: d3Chromatic.interpolateInferno,
  Magma: d3Chromatic.interpolateMagma,
  OrRd: d3Chromatic.interpolateOrRd,
  Oranges: d3Chromatic.interpolateOranges,
  PRGn: d3Chromatic.interpolatePRGn,
  PiYG: d3Chromatic.interpolatePiYG,
  Plasma: d3Chromatic.interpolatePlasma,
  PuBu: d3Chromatic.interpolatePuBu,
  PuBuGn: d3Chromatic.interpolatePuBuGn,
  PuOr: d3Chromatic.interpolatePuOr,
  PuRd: d3Chromatic.interpolatePuRd,
  Purples: d3Chromatic.interpolatePurples,
  Rainbow: d3Chromatic.interpolateRainbow,
  RdBu: d3Chromatic.interpolateRdBu,
  RdGy: d3Chromatic.interpolateRdGy,
  RdPu: d3Chromatic.interpolateRdPu,
  RdYlBu: d3Chromatic.interpolateRdYlBu,
  RdYlGn: d3Chromatic.interpolateRdYlGn,
  Reds: d3Chromatic.interpolateReds,
  Sinebow: d3Chromatic.interpolateSinebow,
  Spectral: d3Chromatic.interpolateSpectral,
  Turbo: d3Chromatic.interpolateTurbo,
  Viridis: d3Chromatic.interpolateViridis,
  Warm: d3Chromatic.interpolateWarm,
  YlGn: d3Chromatic.interpolateYlGn,
  YlGnBu: d3Chromatic.interpolateYlGnBu,
  YlOrBr: d3Chromatic.interpolateYlOrBr,
  YlOrRd: d3Chromatic.interpolateYlOrRd,
}

export let D3_COLOR_SCHEMES: ColorSchemeInfo[] = [
  //Sequential (Multi-Hue)
  { category: 'Sequential (Multi-Hue)', id: 'Viridis', name: 'Viridis' },
  { category: 'Sequential (Multi-Hue)', id: 'Plasma', name: 'Plasma' },
  { category: 'Sequential (Multi-Hue)', id: 'Inferno', name: 'Inferno' },
  { category: 'Sequential (Multi-Hue)', id: 'Magma', name: 'Magma' },
  { category: 'Sequential (Multi-Hue)', id: 'Cividis', name: 'Cividis' },
  { category: 'Sequential (Multi-Hue)', id: 'Turbo', name: 'Turbo' },
  { category: 'Sequential (Multi-Hue)', id: 'Warm', name: 'Warm' },
  { category: 'Sequential (Multi-Hue)', id: 'Cool', name: 'Cool' },
  { category: 'Sequential (Multi-Hue)', id: 'CubehelixDefault', name: 'Cubehelix Default' },
  { category: 'Sequential (Multi-Hue)', id: 'BuGn', name: 'Blue-Green (BuGn)' },
  { category: 'Sequential (Multi-Hue)', id: 'BuPu', name: 'Blue-Purple (BuPu)' },
  { category: 'Sequential (Multi-Hue)', id: 'GnBu', name: 'Green-Blue (GnBu)' },
  { category: 'Sequential (Multi-Hue)', id: 'OrRd', name: 'Orange-Red (OrRd)' },
  { category: 'Sequential (Multi-Hue)', id: 'PuBu', name: 'Purple-Blue (PuBu)' },
  { category: 'Sequential (Multi-Hue)', id: 'PuBuGn', name: 'Purple-Blue-Green (PuBuGn)' },
  { category: 'Sequential (Multi-Hue)', id: 'PuRd', name: 'Purple-Red (PuRd)' },
  { category: 'Sequential (Multi-Hue)', id: 'RdPu', name: 'Red-Purple (RdPu)' },
  { category: 'Sequential (Multi-Hue)', id: 'YlGn', name: 'Yellow-Green (YlGn)' },
  { category: 'Sequential (Multi-Hue)', id: 'YlGnBu', name: 'Yellow-Green-Blue (YlGnBu)' },
  { category: 'Sequential (Multi-Hue)', id: 'YlOrBr', name: 'Yellow-Orange-Brown (YlOrBr)' },
  { category: 'Sequential (Multi-Hue)', id: 'YlOrRd', name: 'Yellow-Orange-Red (YlOrRd)' },

  //Sequential (Single-Hue)
  { category: 'Sequential (Single-Hue)', id: 'Blues', name: 'Blues' },
  { category: 'Sequential (Single-Hue)', id: 'Greens', name: 'Greens' },
  { category: 'Sequential (Single-Hue)', id: 'Greys', name: 'Greys' },
  { category: 'Sequential (Single-Hue)', id: 'Oranges', name: 'Oranges' },
  { category: 'Sequential (Single-Hue)', id: 'Purples', name: 'Purples' },
  { category: 'Sequential (Single-Hue)', id: 'Reds', name: 'Reds' },

  //Diverging
  { category: 'Diverging', id: 'Spectral', name: 'Spectral' },
  { category: 'Diverging', id: 'BrBG', name: 'Brown-BlueGreen (BrBG)' },
  { category: 'Diverging', id: 'PRGn', name: 'Purple-Green (PRGn)' },
  { category: 'Diverging', id: 'PiYG', name: 'Pink-YellowGreen (PiYG)' },
  { category: 'Diverging', id: 'PuOr', name: 'Purple-Orange (PuOr)' },
  { category: 'Diverging', id: 'RdBu', name: 'Red-Blue (RdBu)' },
  { category: 'Diverging', id: 'RdGy', name: 'Red-Grey (RdGy)' },
  { category: 'Diverging', id: 'RdYlBu', name: 'Red-Yellow-Blue (RdYlBu)' },
  { category: 'Diverging', id: 'RdYlGn', name: 'Red-Yellow-Green (RdYlGn)' },

  //Cyclical
  { category: 'Cyclical', id: 'Rainbow', name: 'Rainbow' },
  { category: 'Cyclical', id: 'Sinebow', name: 'Sinebow' },
]

export interface RenderRasterOptions {
  activeCountries?: CountryFeature[] | null
  breaks?: number[]
  invertPalette?: boolean
  logSigma: number
  maxVal: number
  midpoint?: number
  minVal: number
  opacity?: number
  palette: ColorPalette
  projection?: ProjectionType
  scaleType: ScaleType
}

/**
 * Generates a CSS gradient string for UI legends and preview swatches.
 *
 * @param {ColorPalette} arg0_palette
 * @param {boolean} [arg1_invert=false]
 *
 * @returns {string}
 */
export function getPaletteCssGradient (arg0_palette: ColorPalette, arg1_invert?: boolean): string {
  //Convert from parameters
  let invert = (arg1_invert) ? arg1_invert : false
  let palette = arg0_palette

  //Declare local instance variables
  let count = 10
  let interpolator = D3_INTERPOLATOR_MAP[palette] || d3Chromatic.interpolateViridis
  let stops: string[] = []

  //Function body
  for (let i = 0; i <= count; i++) {
    let raw_t = i/count
    let t = invert ? 1 - raw_t : raw_t
    stops.push(interpolator(t))
  }

  //Return statement
  return `linear-gradient(to right, ${stops.join(', ')})`
}

/**
 * Generates a 256-entry RGB lookup table for the given palette.
 *
 * @param {ColorPalette} arg0_palette
 * @param {boolean} [arg1_invert=false]
 *
 * @returns {Uint8Array}
 */
export function getPaletteLUT (arg0_palette: ColorPalette, arg1_invert?: boolean): Uint8Array {
  //Convert from parameters
  let invert = (arg1_invert) ? arg1_invert : false
  let palette = arg0_palette

  //Declare local instance variables
  let interpolator = D3_INTERPOLATOR_MAP[palette] || d3Chromatic.interpolateViridis
  let lut = new Uint8Array(256*3)

  //Function body
  for (let i = 0; i < 256; i++) {
    let raw_t = i/255
    let t = invert ? 1 - raw_t : raw_t
    let color_str = interpolator(t)
    let [r, g, b] = parseRgbString(color_str)

    lut[i*3 + 0] = r
    lut[i*3 + 1] = g
    lut[i*3 + 2] = b
  }

  //Return statement
  return lut
}

/**
 * Parses a hex string '#rrggbb' or 'rgb(r, g, b)' into [r, g, b].
 *
 * @param {string} arg0_str
 *
 * @returns {RGB}
 */
export function parseRgbString (arg0_str: string): RGB {
  //Convert from parameters
  let str = arg0_str

  //Guard clauses
  if (str.startsWith('#')) {
    let hex = str.slice(1)
    let num = parseInt(hex, 16)
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
  }

  //Function body
  let match = str.match(/\d+/g)
  if (match && match.length >= 3)
    return [parseInt(match[0], 10), parseInt(match[1], 10), parseInt(match[2], 10)]

  //Return statement
  return [0, 0, 0]
}

/**
 * Renders an Equirectangular Float32Array raster into an HTMLCanvasElement.
 *
 * @param {Float32Array} arg0_data
 * @param {number} arg1_src_width
 * @param {number} arg2_src_height
 * @param {RenderRasterOptions} arg3_options
 * @param {HTMLCanvasElement} [arg4_target_canvas]
 *
 * @returns {{ canvas: HTMLCanvasElement; bounds: [number, number, number, number] }}
 */
export function renderRasterToCanvas (
  arg0_data: Float32Array,
  arg1_src_width: number,
  arg2_src_height: number,
  arg3_options: RenderRasterOptions,
  arg4_target_canvas?: HTMLCanvasElement
): { bounds: [number, number, number, number]; canvas: HTMLCanvasElement } {
  //Convert from parameters
  let data = arg0_data
  let options = arg3_options
  let src_height = arg2_src_height
  let src_width = arg1_src_width
  let target_canvas = arg4_target_canvas

  //Declare local instance variables
  let canvas = (target_canvas) ? target_canvas : document.createElement('canvas')
  let ctx: CanvasRenderingContext2D | null
  let out_height = src_height
  let out_width = src_width

  //Function body
  if (canvas.width !== out_width)
    canvas.width = out_width
  if (canvas.height !== out_height)
    canvas.height = out_height
  ctx = canvas.getContext('2d')

  //Guard clauses
  if (!ctx)
    return { bounds: [-180, -90, 180, 90], canvas }

  let img_data = ctx.createImageData(out_width, out_height)
  let pixels32 = new Uint32Array(img_data.data.buffer)
  let total_pixels = out_width*out_height
  let lut = getPaletteLUT(options.palette, Boolean(options.invertPalette))

  //Precompute 32-bit packed ABGR color table for 4x faster writes
  let lut32 = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let b = lut[i*3 + 2]
    let g = lut[i*3 + 1]
    let r = lut[i*3]
    lut32[i] = (255 << 24) | (b << 16) | (g << 8) | r
  }

  let has_breaks = Boolean(options.breaks && options.breaks.length >= 2)
  let sorted_breaks = has_breaks ? [...options.breaks!].sort((arg0_a, arg0_b) => arg0_a - arg0_b) : []
  let num_segments = sorted_breaks.length - 1

  let safe_max = options.maxVal
  let safe_min = options.minVal
  if (options.midpoint === 0) {
    let abs_max = Math.max(Math.abs(safe_min), Math.abs(safe_max))
    if (abs_max === 0)
      abs_max = 1
    safe_min = -abs_max
    safe_max = abs_max
  }

  let t_min = transformValue(safe_min, options.scaleType, options.logSigma)
  let t_max = transformValue(safe_max, options.scaleType, options.logSigma)
  let t_range = t_max - t_min || 1
  let inv_range = 1/t_range
  let is_linear = (!options.scaleType || options.scaleType === 'linear') && !has_breaks

  if (is_linear) {
    //Fast path: linear scale without custom breaks
    for (let i = 0; i < total_pixels; i++) {
      let val = data[i]
      if (Number.isNaN(val) || !Number.isFinite(val)) {
        pixels32[i] = 0
        continue
      }

      let norm = (val - t_min)*inv_range
      if (norm < 0) {
        norm = 0
      } else if (norm > 1) {
        norm = 1
      }

      let lut_idx = Math.floor(norm*255)
      pixels32[i] = lut32[lut_idx]
    }
  } else {
    //General path: custom breaks or pseudo-log transformation
    for (let i = 0; i < total_pixels; i++) {
      let val = data[i]
      if (Number.isNaN(val) || !Number.isFinite(val)) {
        pixels32[i] = 0
        continue
      }

      let norm = 0
      if (has_breaks && num_segments > 0) {
        if (val <= sorted_breaks[0]) {
          norm = 0
        } else if (val >= sorted_breaks[num_segments]) {
          norm = 1
        } else {
          let seg = 0
          for (let x = 0; x < num_segments - 1 && val >= sorted_breaks[x + 1]; x++)
            seg = x + 1

          let seg_min = sorted_breaks[seg]
          let seg_max = sorted_breaks[seg + 1]
          let seg_t = seg_max - seg_min > 0 ? (val - seg_min)/(seg_max - seg_min) : 0
          norm = (seg + seg_t)/num_segments
        }
      } else {
        let t_val = transformValue(val, options.scaleType, options.logSigma)
        norm = (t_val - t_min)*inv_range
      }

      if (norm < 0) {
        norm = 0
      } else if (norm > 1) {
        norm = 1
      }

      let lut_idx = Math.floor(norm*255)
      pixels32[i] = lut32[lut_idx]
    }
  }

  ctx.putImageData(img_data, 0, 0)

  //Countries Mode isolation
  if (options.activeCountries && options.activeCountries.length > 0) {
    ctx.save()
    ctx.globalCompositeOperation = 'destination-in'
    ctx.beginPath()

    for (let i = 0; i < options.activeCountries.length; i++) {
      let country = options.activeCountries[i]
      let geometry = country.geometry
      if (!geometry)
        continue

      let polygons: number[][][][] =
        geometry.type === 'Polygon'
          ? [geometry.coordinates as number[][][]]
          : geometry.type === 'MultiPolygon'
          ? (geometry.coordinates as number[][][][])
          : []

      for (let x = 0; x < polygons.length; x++) {
        let poly = polygons[x]
        for (let y = 0; y < poly.length; y++) {
          let ring = poly[y]
          for (let z = 0; z < ring.length; z++) {
            let [lng, lat] = ring[z]
            let px = ((lng + 180)/360)*out_width
            let py = ((90 - lat)/180)*out_height
            if (z === 0) {
              ctx.moveTo(px, py)
            } else {
              ctx.lineTo(px, py)
            }
          }
          ctx.closePath()
        }
      }
    }

    ctx.fillStyle = '#ffffff'
    ctx.fill('evenodd')
    ctx.restore()
  }

  //Return statement
  return { bounds: [-180, -90, 180, 90], canvas }
}
