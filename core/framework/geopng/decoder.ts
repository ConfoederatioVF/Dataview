import { decode as decodePng } from 'fast-png'
import { DataFormat, DecodedRaster } from './types.ts'

//Shared 4-byte buffer and DataView matching user specification
let shared_float_buffer = new ArrayBuffer(4)
let shared_view = new DataView(shared_float_buffer)

let decoder_worker: Worker | null = null
let next_decoder_req_id = 1
let pending_decoder_requests = new Map<
  number,
  { reject: (err: any) => void; resolve: (r: DecodedRaster) => void }
>()

/**
 * Builds DecodedRaster object with quantiles and histogram calculation.
 *
 * @param {Float32Array} arg0_output
 * @param {number} arg1_width
 * @param {number} arg2_height
 * @param {number} arg3_min
 * @param {number} arg4_max
 * @param {number} arg5_mean
 * @param {number} arg6_std_dev
 * @param {number} arg7_valid_count
 * @param {number} arg8_total_cells
 *
 * @returns {DecodedRaster}
 */
export function buildDecodedRasterResult (
  arg0_output: Float32Array,
  arg1_width: number,
  arg2_height: number,
  arg3_min?: number,
  arg4_max?: number,
  arg5_mean?: number,
  arg6_std_dev?: number,
  arg7_valid_count?: number,
  arg8_total_cells?: number
): DecodedRaster {
  //Convert from parameters
  let height = arg2_height
  let max = arg4_max
  let mean = arg5_mean
  let min = arg3_min
  let output = arg0_output
  let std_dev = arg6_std_dev
  let total_cells = arg8_total_cells
  let valid_count = arg7_valid_count
  let width = arg1_width

  //Declare local instance variables
  let bin_count = 60
  let bin_counts: number[] = new Array(bin_count).fill(0)
  let bin_edges: number[] = []
  let bin_width: number
  let quantiles: Record<number, number> = {}
  let safe_max: number
  let safe_min: number
  let sample_values: number[] = []
  let step: number

  //Compute missing statistics if not supplied
  if (
    min === undefined ||
    max === undefined ||
    mean === undefined ||
    std_dev === undefined ||
    valid_count === undefined ||
    total_cells === undefined
  ) {
    total_cells = width*height
    valid_count = 0
    let min_val = Infinity
    let max_val = -Infinity
    let sum = 0

    for (let i = 0; i < total_cells; i++) {
      let v = output[i]
      if (!Number.isNaN(v) && Number.isFinite(v)) {
        if (v < min_val)
          min_val = v
        if (v > max_val)
          max_val = v
        sum += v
        valid_count++
      }
    }

    min = Number.isFinite(min_val) ? min_val : 0
    max = Number.isFinite(max_val) ? max_val : 0
    mean = valid_count > 0 ? sum/valid_count : 0

    let sum_sq_diff = 0
    for (let i = 0; i < total_cells; i++) {
      let v = output[i]
      if (!Number.isNaN(v) && Number.isFinite(v)) {
        let diff = v - mean
        sum_sq_diff += diff*diff
      }
    }
    std_dev = valid_count > 0 ? Math.sqrt(sum_sq_diff/valid_count) : 0
  }

  safe_max = Number.isFinite(max) ? max : 1
  safe_min = Number.isFinite(min) ? min : 0
  step = Math.max(1, Math.floor(total_cells/50000))

  //Function body
  for (let i = 0; i < total_cells; i += step) {
    let v = output[i]
    if (!Number.isNaN(v) && Number.isFinite(v))
      sample_values.push(v)
  }

  sample_values.sort((arg0_a, arg0_b) => arg0_a - arg0_b)

  if (sample_values.length > 0) {
    let p_keys = [0, 5, 10, 25, 50, 75, 90, 95, 100]
    for (let i = 0; i < p_keys.length; i++) {
      let p = p_keys[i]
      let idx = Math.min(
        sample_values.length - 1,
        Math.max(0, Math.floor((p/100)*(sample_values.length - 1)))
      )
      quantiles[p] = sample_values[idx]
    }
  }

  bin_width = (safe_max - safe_min)/bin_count || 1

  for (let i = 0; i <= bin_count; i++)
    bin_edges.push(safe_min + i*bin_width)

  for (let i = 0; i < sample_values.length; i++) {
    let v = sample_values[i]
    let b_idx = Math.floor((v - safe_min)/bin_width)
    if (b_idx < 0)
      b_idx = 0
    if (b_idx >= bin_count)
      b_idx = bin_count - 1
    bin_counts[b_idx]++
  }

  //Return statement
  return {
    bounds: [-180, -90, 180, 90], //Global EPSG:4326 extent
    data: output,
    height,
    histogram: {
      bins: bin_edges,
      counts: bin_counts,
      max: safe_max,
      min: safe_min,
    },
    max: Number.isFinite(max) ? max : 0,
    mean,
    min: Number.isFinite(min) ? min : 0,
    quantiles,
    stdDev: std_dev,
    total: valid_count > 0 ? mean*valid_count : 0,
    totalCells: total_cells,
    validCount: valid_count,
    width,
  }
}

/**
 * Computes difference (Raster A - Raster B).
 *
 * @param {DecodedRaster} arg0_raster_a
 * @param {DecodedRaster} arg1_raster_b
 *
 * @returns {DecodedRaster}
 */
export function computeRasterDifference (
  arg0_raster_a: DecodedRaster,
  arg1_raster_b: DecodedRaster
): DecodedRaster {
  //Convert from parameters
  let raster_a = arg0_raster_a
  let raster_b = arg1_raster_b

  //Declare local instance variables
  let b_height = raster_b.height
  let b_width = raster_b.width
  let height = raster_a.height
  let max = -Infinity
  let mean: number
  let min = Infinity
  let sum = 0
  let total_cells = raster_a.width*raster_a.height
  let valid_count = 0
  let width = raster_a.width

  let diff_data = new Float32Array(total_cells)

  //Function body
  for (let i = 0; i < height; i++) {
    let b_y = Math.min(b_height - 1, Math.floor((i/height)*b_height))

    for (let x = 0; x < width; x++) {
      let idx_a = i*width + x
      let val_a = raster_a.data[idx_a]

      let b_x = Math.min(b_width - 1, Math.floor((x/width)*b_width))
      let idx_b = b_y*b_width + b_x
      let val_b = raster_b.data[idx_b]

      if (Number.isNaN(val_a) || Number.isNaN(val_b)) {
        diff_data[idx_a] = Number.NaN
      } else {
        let diff = val_a - val_b
        diff_data[idx_a] = diff
        if (!Number.isNaN(diff) && Number.isFinite(diff)) {
          if (diff < min)
            min = diff
          if (diff > max)
            max = diff
          sum += diff
          valid_count++
        }
      }
    }
  }

  mean = valid_count > 0 ? sum/valid_count : 0

  //Return statement
  return {
    bounds: [-180, -90, 180, 90],
    data: diff_data,
    height,
    max: Number.isFinite(max) ? max : 0,
    mean,
    min: Number.isFinite(min) ? min : 0,
    stdDev: 0,
    totalCells: total_cells,
    validCount: valid_count,
    width,
  }
}

/**
 * Decodes a raw PNG buffer directly into a Float32Array raster matrix using fast-png.
 *
 * @param {ArrayBuffer | Uint8Array} arg0_buffer
 * @param {DataFormat} arg1_format
 *
 * @returns {DecodedRaster}
 */
export function decodeRawGeoPngBuffer (
  arg0_buffer: ArrayBuffer | Uint8Array,
  arg1_format: DataFormat,
  arg2_min_threshold?: number
): DecodedRaster {
  //Convert from parameters
  let buffer = arg0_buffer
  let format = arg1_format
  let min_threshold = arg2_min_threshold

  //Declare local instance variables
  let can_use_fast_u32: boolean
  let channels: number
  let height: number
  let is_little_endian: boolean
  let max = -Infinity
  let mean: number
  let min = Infinity
  let output: Float32Array
  let pixel_bytes: Uint8Array
  let png: any
  let sum = 0
  let total_cells: number
  let uint8_input =
    buffer instanceof Uint8Array
      ? buffer
      : new Uint8Array(buffer)
  let valid_count = 0
  let width: number

  //Function body
  png = decodePng(uint8_input)
  width = png.width
  height = png.height
  total_cells = width*height
  pixel_bytes = png.data
  channels = png.channels || 4

  output = new Float32Array(total_cells)

  is_little_endian = new Uint8Array(new Uint32Array([0x12345678]).buffer)[0] === 0x78
  can_use_fast_u32 = channels === 4 && pixel_bytes.byteOffset%4 === 0 && is_little_endian

  if (can_use_fast_u32) {
    let output_u32 = new Uint32Array(output.buffer)
    let src_u32 = new Uint32Array(pixel_bytes.buffer, pixel_bytes.byteOffset, total_cells)

    if (format === 'float32') {
      for (let i = 0; i < total_cells; i++) {
        let raw = src_u32[i]
        if (raw === 0) {
          output[i] = Number.NaN
          continue
        }
        output_u32[i] = ((raw & 0xff) << 24) | ((raw & 0xff00) << 8) | ((raw >>> 8) & 0xff00) | (raw >>> 24)
        let val = output[i]

        if (!Number.isNaN(val) && val !== 0 && (min_threshold === undefined || val >= min_threshold) && Number.isFinite(val)) {
          if (val < min)
            min = val
          if (val > max)
            max = val
          sum += val
          valid_count++
        } else {
          output[i] = Number.NaN
        }
      }
    } else {
      for (let i = 0; i < total_cells; i++) {
        let raw = src_u32[i]
        if (raw === 0) {
          output[i] = Number.NaN
          continue
        }
        let swapped = ((raw & 0xff) << 24) | ((raw & 0xff00) << 8) | ((raw >>> 8) & 0xff00) | (raw >>> 24)
        let val = swapped | 0
        if (val === 0) {
          output[i] = Number.NaN
        } else {
          output[i] = val
          if (val < min)
            min = val
          if (val > max)
            max = val
          sum += val
          valid_count++
        }
      }
    }
  } else {
    let dv = new DataView(pixel_bytes.buffer, pixel_bytes.byteOffset, pixel_bytes.byteLength)

    for (let i = 0; i < total_cells; i++) {
      let byte_offset = i*channels
      let val: number

      if (channels >= 4) {
        if (format === 'float32') {
          val = dv.getFloat32(byte_offset, false)
          if (Number.isNaN(val) || val === 0 || (min_threshold !== undefined && val < min_threshold))
            val = Number.NaN
        } else {
          let a = pixel_bytes[byte_offset + 3]
          let b = pixel_bytes[byte_offset + 2]
          let g = pixel_bytes[byte_offset + 1]
          let r = pixel_bytes[byte_offset]
          val = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
          if (val === 0)
            val = Number.NaN
        }
      } else if (channels === 3) {
        let b = pixel_bytes[byte_offset + 2]
        let g = pixel_bytes[byte_offset + 1]
        let r = pixel_bytes[byte_offset]
        if (format === 'float32') {
          shared_view.setUint8(0, r)
          shared_view.setUint8(1, g)
          shared_view.setUint8(2, b)
          shared_view.setUint8(3, 0)
          val = shared_view.getFloat32(0, false)
          if (Number.isNaN(val) || val === 0 || (min_threshold !== undefined && val < min_threshold))
            val = Number.NaN
        } else {
          val = ((r << 16) | (g << 8) | b) >>> 0
          if (val === 0)
            val = Number.NaN
        }
      } else {
        val = pixel_bytes[byte_offset]
        if (val === 0)
          val = Number.NaN
      }

      output[i] = val

      if (!Number.isNaN(val) && Number.isFinite(val)) {
        if (val < min)
          min = val
        if (val > max)
          max = val
        sum += val
        valid_count++
      }
    }
  }

  mean = valid_count > 0 ? sum/valid_count : 0

  if (valid_count > 1) {
    let sample_step = Math.max(1, Math.floor(total_cells/100000))
    let sample_valid = 0
    let variance_sum = 0

    for (let i = 0; i < total_cells; i += sample_step) {
      let v = output[i]
      if (!Number.isNaN(v) && Number.isFinite(v)) {
        variance_sum += (v - mean)**2
        sample_valid++
      }
    }
    let std_dev = sample_valid > 1 ? Math.sqrt(variance_sum/(sample_valid - 1)) : 0
    return buildDecodedRasterResult(output, width, height, min, max, mean, std_dev, valid_count, total_cells)
  }

  //Return statement
  return buildDecodedRasterResult(output, width, height, min, max, mean, 0, valid_count, total_cells)
}

/**
 * Decodes a raw PNG buffer asynchronously in a background Web Worker.
 *
 * @param {ArrayBuffer | Uint8Array} arg0_buffer
 * @param {DataFormat} arg1_format
 *
 * @returns {Promise<DecodedRaster>}
 */
export async function decodeRawGeoPngBufferAsync (
  arg0_buffer: ArrayBuffer | Uint8Array,
  arg1_format: DataFormat,
  arg2_min_threshold?: number
): Promise<DecodedRaster> {
  //Convert from parameters
  let buffer = arg0_buffer
  let format = arg1_format
  let min_threshold = arg2_min_threshold

  //Declare local instance variables
  let worker = getDecoderWorker()

  //Function body
  if (worker) {
    let array_buf =
      buffer instanceof Uint8Array
        ? buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
        : buffer.slice(0)

    let req_id = next_decoder_req_id++
    return new Promise<DecodedRaster>((arg0_resolve, arg1_reject) => {
      pending_decoder_requests.set(req_id, { reject: arg1_reject, resolve: arg0_resolve })
      try {
        worker.postMessage({ buffer: array_buf, format, minThreshold: min_threshold, reqId: req_id }, [array_buf])
      } catch {
        worker.postMessage({ buffer: array_buf, format, minThreshold: min_threshold, reqId: req_id })
      }
    }).catch((arg0_err) => {
      console.warn('Worker decoding failed, falling back to sync:', arg0_err)
      return decodeRawGeoPngBuffer(buffer, format, min_threshold)
    })
  }

  //Return statement
  return decodeRawGeoPngBuffer(buffer, format, min_threshold)
}

/**
 * Decodes an RGBA pixel array to a number.
 *
 * @param {[number, number, number, number] | Uint8Array | number[]} arg0_rgba
 * @param {{ format?: DataFormat }} [arg1_options]
 *
 * @returns {number}
 */
export function decodeRGBAAsNumber (
  arg0_rgba: [number, number, number, number] | Uint8Array | number[],
  arg1_options?: { format?: DataFormat }
): number {
  //Convert from parameters
  let options = (arg1_options) ? arg1_options : {}
  let rgba = arg0_rgba

  //Declare local instance variables
  let format = options.format || 'int32'

  //Function body
  if (format === 'float32') {
    shared_view.setUint8(0, rgba[0])
    shared_view.setUint8(1, rgba[1])
    shared_view.setUint8(2, rgba[2])
    shared_view.setUint8(3, rgba[3])

    let float_value = shared_view.getFloat32(0, false)
    if (Number.isNaN(float_value))
      return 0
    return float_value
  }

  let a = rgba[3]
  let b = rgba[2]
  let g = rgba[1]
  let r = rgba[0]

  //Return statement
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}

/**
 * Retrieves or spawns PNG decoder Web Worker.
 *
 * @returns {Worker | null}
 */
export function getDecoderWorker (): Worker | null {
  //Guard clauses
  if (typeof Worker === 'undefined')
    return null

  //Function body
  if (!decoder_worker) {
    try {
      decoder_worker = new Worker(new URL('./png_decoder.worker.ts', import.meta.url), {
        type: 'module',
      })
      decoder_worker.onmessage = (arg0_e: MessageEvent<any>) => {
        let msg = arg0_e.data
        if (!msg)
          return
        let handlers = pending_decoder_requests.get(msg.reqId)
        if (!handlers)
          return
        pending_decoder_requests.delete(msg.reqId)
        if (msg.type === 'PNG_DECODE_SUCCESS') {
          handlers.resolve(msg.raster)
        } else {
          handlers.reject(new Error(msg.error || 'Worker decoding failed'))
        }
      }
      decoder_worker.onerror = (arg0_err) => {
        console.warn('PNG decoder worker error, will fall back to sync:', arg0_err)
      }
    } catch (arg0_err) {
      console.warn('Could not spawn PNG decoder worker:', arg0_err)
      return null
    }
  }

  //Return statement
  return decoder_worker
}

/**
 * Loads a GeoPNG from File, URL, or ArrayBuffer.
 *
 * @param {File | string | ArrayBuffer} arg0_source
 * @param {DataFormat} arg1_format
 *
 * @returns {Promise<DecodedRaster>}
 */
export async function loadAndDecodeGeoPng (
  arg0_source: File | string | ArrayBuffer,
  arg1_format: DataFormat
): Promise<DecodedRaster> {
  //Convert from parameters
  let format = arg1_format
  let source = arg0_source

  //Declare local instance variables
  let buffer: ArrayBuffer

  //Function body
  if (source instanceof File) {
    buffer = await source.arrayBuffer()
  } else if (typeof source === 'string') {
    let response = await fetch(source)
    buffer = await response.arrayBuffer()
  } else {
    buffer = source
  }

  //Return statement
  return decodeRawGeoPngBufferAsync(buffer, format)
}
