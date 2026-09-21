import { DecodedRaster } from './types.ts'
import { buildDecodedRasterResult } from './decoder.ts'

/**
 * Linearly interpolates between two decoded rasters cell-by-cell.
 *
 * @param {DecodedRaster} arg0_raster_a - Bounding keyframe A
 * @param {DecodedRaster} arg1_raster_b - Bounding keyframe B
 * @param {number} arg2_t - Fractional interpolation weight between 0.0 and 1.0
 * @param {boolean} [arg3_filter_uninhabited=false] - Whether to suppress uninhabited cells as NA
 * @param {Float32Array} [arg4_target_buffer] - Optional pre-allocated destination buffer
 *
 * @returns {DecodedRaster}
 */
export let interpolateRasters = function (
  arg0_raster_a: DecodedRaster,
  arg1_raster_b: DecodedRaster,
  arg2_t: number,
  arg3_filter_uninhabited?: boolean,
  arg4_target_buffer?: Float32Array
): DecodedRaster {
  //Convert from parameters
  let filter_uninhabited = Boolean(arg3_filter_uninhabited)
  let r_a = arg0_raster_a
  let r_b = arg1_raster_b
  let t = Math.max(0, Math.min(1, arg2_t))
  let target_buffer = arg4_target_buffer

  //Guard clauses
  if (t <= 0)
    return r_a
  if (t >= 1)
    return r_b

  //Declare local instance variables
  let a_data = r_a.data
  let b_data = r_b.data
  let height = r_a.height
  let max_val = -Infinity
  let mean: number
  let min_val = Infinity
  let total_len = r_a.data.length
  let out_data = (target_buffer && target_buffer.length === total_len) ? target_buffer : new Float32Array(total_len)
  let std_dev: number
  let sum = 0
  let sum_sq = 0
  let v_a: number
  let v_b: number
  let v_interp: number
  let valid_count = 0
  let variance: number
  let weight_a = 1 - t
  let weight_b = t
  let width = r_a.width

  //Function body
  for (let i = 0; i < total_len; i++) {
    v_a = a_data[i]
    v_b = b_data[i]

    if (Number.isNaN(v_a) || Number.isNaN(v_b) || v_a <= -9999 || v_b <= -9999) {
      out_data[i] = NaN
      continue
    }

    v_interp = v_a*weight_a + v_b*weight_b
    out_data[i] = v_interp
    valid_count++
    sum += v_interp
    sum_sq += v_interp*v_interp

    if (v_interp < min_val)
      min_val = v_interp
    if (v_interp > max_val)
      max_val = v_interp
  }

  if (!Number.isFinite(min_val))
    min_val = 0
  if (!Number.isFinite(max_val))
    max_val = 1

  mean = valid_count > 0 ? sum/valid_count : 0
  variance = valid_count > 0 ? Math.max(0, sum_sq/valid_count - mean*mean) : 0
  std_dev = Math.sqrt(variance)

  //Return statement
  return buildDecodedRasterResult(
    out_data,
    width,
    height,
    min_val,
    max_val,
    mean,
    std_dev,
    valid_count,
    total_len
  )
}
