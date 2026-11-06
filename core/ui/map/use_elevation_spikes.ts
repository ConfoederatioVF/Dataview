import { useMemo } from 'react'
import {
  CountryFeature,
  CountryStats,
  pointInRing,
} from '@framework/geopng/polygon_binning.ts'
import { projectEqualEarth } from '@framework/geopng/equal_earth.ts'
import { transformValue, createPercentileRankCalculator } from '@framework/geopng/scales'
import { getPaletteLUT } from '@framework/geopng/palettes'
import {
  DecodedRaster,
  ProjectionType,
  HeightmapConfig,
} from '@framework/geopng/types.ts'
import { getPixelOffset } from '@common'

export interface ElevationSpikePoint {
  polygon: [number, number][]
  elevation: number
  color: [number, number, number, number]
  value: number
  lng: number
  lat: number
}

export interface UseElevationSpikesParams {
  heightmapConfig: HeightmapConfig
  raster: DecodedRaster | null
  minVal: number
  maxVal: number
  scaleType: string
  logSigma: number
  palette: any
  invertPalette?: boolean
  projection: ProjectionType
  countriesMode?: boolean
  countryStats?: CountryStats | null
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
}

/**
 * Computes 3D elevation spike needles with flat-facing uniform rectangular geometry.
 * Adapts grid resolution, percentile height scaling, and country polygon masking.
 *
 * @param {UseElevationSpikesParams} arg0_options
 * @returns {Object}
 */
export let useElevationSpikes = function (arg0_options: UseElevationSpikesParams): { points: ElevationSpikePoint[] } {
  //Convert from parameters
  let options = (arg0_options) ? arg0_options : ({} as UseElevationSpikesParams)

  //Return statement
  return useMemo(() => {
    //Declare local instance variables
    let alpha: number
    let base_elevation: number
    let cell_lat_height: number
    let cell_lng_width: number
    let countries_mode = options.countriesMode
    let country_stats = options.countryStats
    let cov: number = 0.93
    let effective_selected_array: CountryFeature[] = []
    let get_percentile_rank: ((val: number) => number) | null = null
    let grid_h: number
    let grid_w: number
    let half_h: number
    let half_w: number
    let height: number
    let height_scale_mode: string
    let heightmap_config = options.heightmapConfig
    let invert_palette = options.invertPalette
    let is_cartesian: boolean
    let lat_offset: number
    let log_sigma = options.logSigma
    let lut: Uint8Array
    let max_scale: number
    let max_val = options.maxVal
    let min_val = options.minVal
    let needs_percentile_rank: boolean
    let opacity_val: number
    let palette = options.palette
    let pixel_offset: number
    let points_array: ElevationSpikePoint[] = []
    let process_cell_func: (arg0_gr: number, arg1_gc: number) => void
    let projection = options.projection
    let raster = options.raster
    let res_arcmin: number
    let scale_type = options.scaleType
    let selected_countries = options.selectedCountries
    let selected_country = options.selectedCountry
    let step: number
    let t_max: number
    let t_min: number
    let t_range: number
    let target_cols: number
    let visited_cells_set: Set<number> = new Set<number>()
    let width: number

    //Guard clauses
    if (!heightmap_config.enabled || !raster || !raster.data)
      return { points: [] }

    //Function body
    width = raster.width
    height = raster.height
    t_min = transformValue(min_val, scale_type as any, log_sigma)
    t_max = transformValue(max_val, scale_type as any, log_sigma)
    t_range = t_max - t_min || 1
    lut = getPaletteLUT(palette, Boolean(invert_palette))
    is_cartesian = (projection === 'Equirectangular' || projection === 'EqualEarth')

    res_arcmin = Math.max(5, heightmap_config.resolutionArcmin ?? 60)
    target_cols = Math.round(21600/res_arcmin)
    step = Math.max(1, Math.round(width/target_cols))
    grid_w = Math.ceil(width/step)
    grid_h = Math.ceil(height/step)

    cell_lng_width = 360/grid_w
    cell_lat_height = 180/grid_h

    half_w = (cell_lng_width/2)*cov
    half_h = (cell_lat_height/2)*cov

    if (selected_countries && selected_countries.length > 0) {
      effective_selected_array = selected_countries
    } else if (selected_country) {
      effective_selected_array = [selected_country]
    }

    if (countries_mode && effective_selected_array.length === 0)
      return { points: [] }

    max_scale = heightmap_config.elevationScale || 800000
    base_elevation = (is_cartesian) ? (max_scale/111000)*0.35 : max_scale*0.035
    height_scale_mode = heightmap_config.heightScaleMode ?? 'linear'
    needs_percentile_rank = Boolean(
      heightmap_config.opacityByPercentile || height_scale_mode === 'percentile' || height_scale_mode === 'blend'
    )
    get_percentile_rank = (needs_percentile_rank)
      ? createPercentileRankCalculator(
          raster,
          (countries_mode && country_stats?.histogram) ? country_stats.histogram : undefined
        )
      : null

    opacity_val = heightmap_config.opacity ?? 0.9
    alpha = Math.round(255*opacity_val)

    pixel_offset = getPixelOffset(projection)
    lat_offset = pixel_offset*(180/height)

    process_cell_func = function (arg0_gr: number, arg1_gc: number) {
      //Convert from parameters
      let gr = arg0_gr
      let gc = arg1_gc

      //Declare local instance variables
      let cell_alpha = alpha
      let cell_idx = gr*grid_w + gc
      let center_lat: number
      let center_lng: number
      let count_val: number = 0
      let elev: number
      let end_c: number
      let end_r: number
      let height_norm: number = 0
      let lat_correction: number
      let lat_rad: number
      let lut_idx: number
      let max_allowed_lat: number
      let max_block_val: number = -Infinity
      let max_lat: number
      let max_lng: number
      let min_allowed_lat: number
      let min_lat: number
      let min_lng: number
      let norm: number
      let polygon: [number, number][]
      let raw_center_lat: number
      let spike_height: number
      let start_c: number
      let start_r: number
      let sum_val: number = 0
      let t_val: number
      let v: number

      //Guard clauses
      if (visited_cells_set.has(cell_idx))
        return
      visited_cells_set.add(cell_idx)

      //Function body
      start_r = gr*step
      end_r = Math.min(height, start_r + step)
      start_c = gc*step
      end_c = Math.min(width, start_c + step)

      if (step === 1) {
        let local_val = raster.data[start_r*width + start_c]
        if (Number.isFinite(local_val)) {
          sum_val = local_val
          count_val = 1
          max_block_val = local_val
        }
      } else {
        for (let z = start_r; z < end_r; z++) {
          let local_row_offset = z*width
          for (let a = start_c; a < end_c; a++) {
            let local_v = raster.data[local_row_offset + a]
            if (Number.isFinite(local_v)) {
              sum_val += local_v
              count_val++
              if (local_v > max_block_val)
                max_block_val = local_v
            }
          }
        }
      }

      if (count_val === 0)
        return

      v = (count_val > 1) ? (sum_val/count_val)*0.4 + max_block_val*0.6 : max_block_val

      max_allowed_lat = (projection === 'Mercator') ? 84.9 : 89.9
      min_allowed_lat = (projection === 'Mercator') ? -84.9 : -89.9

      raw_center_lat = 90 - ((gr + 0.5)/grid_h)*180 + lat_offset
      if (raw_center_lat < min_allowed_lat - half_h || raw_center_lat > max_allowed_lat + half_h)
        return

      center_lat = Math.max(min_allowed_lat, Math.min(max_allowed_lat, raw_center_lat))
      center_lng = Math.max(-180, Math.min(180, -180 + ((gc + 0.5)/grid_w)*360))
      min_lng = Math.max(-180, center_lng - half_w)
      max_lng = Math.min(180, center_lng + half_w)
      min_lat = Math.max(min_allowed_lat, center_lat - half_h)
      max_lat = Math.min(max_allowed_lat, center_lat + half_h)

      if (projection === 'EqualEarth') {
        polygon = [
          projectEqualEarth(min_lng, min_lat),
          projectEqualEarth(max_lng, min_lat),
          projectEqualEarth(max_lng, max_lat),
          projectEqualEarth(min_lng, max_lat),
        ]
      } else {
        polygon = [
          [min_lng, min_lat],
          [max_lng, min_lat],
          [max_lng, max_lat],
          [min_lng, max_lat],
        ]
      }

      t_val = transformValue(v, scale_type as any, log_sigma)
      norm = Math.max(0, Math.min(1, (t_val - t_min)/t_range))

      if (height_scale_mode === 'percentile') {
        let local_rank = (get_percentile_rank) ? get_percentile_rank(v) : norm
        height_norm = Math.max(0, Math.min(1, local_rank))
      } else if (height_scale_mode === 'blend') {
        let local_rank = (get_percentile_rank) ? get_percentile_rank(v) : norm
        let local_pct_norm = Math.max(0, Math.min(1, local_rank))
        let local_weight = Math.max(0, Math.min(1, heightmap_config.blendWeight ?? 0.5))
        height_norm = (1 - local_weight)*norm + local_weight*local_pct_norm
      } else {
        height_norm = norm
      }

      spike_height = (is_cartesian)
        ? height_norm*((max_scale/111000)*12)
        : height_norm*max_scale

      lat_rad = (Math.min(85, Math.max(-85, center_lat))*Math.PI)/180
      lat_correction = (projection === 'Mercator') ? Math.max(0.08, Math.cos(lat_rad)) : 1.0

      elev = (base_elevation + spike_height)*lat_correction

      lut_idx = Math.floor(norm*255)*3
      if (heightmap_config.opacityByPercentile && get_percentile_rank) {
        let local_rank = Math.max(0.01, Math.min(1, get_percentile_rank(v)))
        let local_strength = heightmap_config.opacityByPercentileStrength ?? 1.0
        let local_factor = Math.pow(local_rank, local_strength)
        cell_alpha = Math.round(255*opacity_val*Math.max(0.02, local_factor))
      }

      points_array.push({
        polygon,
        elevation: elev,
        color: [
          lut[lut_idx],
          lut[lut_idx + 1],
          lut[lut_idx + 2],
          cell_alpha,
        ],
        value: v,
        lng: center_lng,
        lat: center_lat,
      })
    }

    if (countries_mode && effective_selected_array.length > 0) {
      for (let i = 0; i < effective_selected_array.length; i++) {
        let local_country = effective_selected_array[i]
        let local_geom = local_country.geometry
        let local_poly_list: number[][][][]

        if (!local_geom)
          continue

        local_poly_list = (local_geom.type === 'Polygon')
          ? [local_geom.coordinates as number[][][]]
          : (local_geom.type === 'MultiPolygon')
            ? (local_geom.coordinates as number[][][][])
            : []

        for (let x = 0; x < local_poly_list.length; x++) {
          let local_crosses_180: boolean
          let local_holes: number[][][]
          let local_max_c: number
          let local_max_r: number
          let local_min_c: number
          let local_min_r: number
          let local_outer_ring: number[][]
          let local_p_max_x = -Infinity
          let local_p_max_y = -Infinity
          let local_p_min_x = Infinity
          let local_p_min_y = Infinity
          let local_rings = local_poly_list[x]

          if (!local_rings || local_rings.length === 0)
            continue
          local_outer_ring = local_rings[0]
          if (!local_outer_ring || local_outer_ring.length === 0)
            continue

          for (let y = 0; y < local_outer_ring.length; y++) {
            let local_pt = local_outer_ring[y]
            if (local_pt[0] < local_p_min_x) local_p_min_x = local_pt[0]
            if (local_pt[1] < local_p_min_y) local_p_min_y = local_pt[1]
            if (local_pt[0] > local_p_max_x) local_p_max_x = local_pt[0]
            if (local_pt[1] > local_p_max_y) local_p_max_y = local_pt[1]
          }

          if (!Number.isFinite(local_p_min_x))
            continue

          local_crosses_180 = (local_p_max_x - local_p_min_x > 180)
          local_min_c = (local_crosses_180) ? 0 : Math.max(0, Math.floor(((local_p_min_x + 180)/360)*grid_w) - 1)
          local_max_c = (local_crosses_180) ? grid_w : Math.min(grid_w, Math.ceil(((local_p_max_x + 180)/360)*grid_w) + 1)
          local_min_r = Math.max(0, Math.floor(((90 - local_p_max_y)/180)*grid_h) - 1)
          local_max_r = Math.min(grid_h, Math.ceil(((90 - local_p_min_y)/180)*grid_h) + 1)

          local_holes = local_rings.slice(1)

          for (let z = local_min_r; z < local_max_r; z++) {
            let local_center_lat = 90 - ((z + 0.5)/grid_h)*180 + lat_offset
            if (local_center_lat < local_p_min_y - half_h || local_center_lat > local_p_max_y + half_h)
              continue

            for (let a = local_min_c; a < local_max_c; a++) {
              let local_center_lng = -180 + ((a + 0.5)/grid_w)*360
              let local_in_hole = false

              if (!local_crosses_180 && (local_center_lng < local_p_min_x - half_w || local_center_lng > local_p_max_x + half_w))
                continue

              if (visited_cells_set.has(z*grid_w + a))
                continue

              if (!pointInRing(local_center_lng, local_center_lat, local_outer_ring))
                continue

              for (let b = 0; b < local_holes.length; b++) {
                if (pointInRing(local_center_lng, local_center_lat, local_holes[b])) {
                  local_in_hole = true
                  break
                }
              }
              if (local_in_hole)
                continue

              process_cell_func(z, a)
            }
          }
        }
      }
    } else {
      let local_max_lat = (projection === 'Mercator') ? 84.9 : 89.9
      let local_min_lat = (projection === 'Mercator') ? -84.9 : -89.9

      for (let z = 0; z < grid_h; z++) {
        let local_raw_lat = 90 - ((z + 0.5)/grid_h)*180 + lat_offset
        if (local_raw_lat < local_min_lat || local_raw_lat > local_max_lat)
          continue
        for (let a = 0; a < grid_w; a++) {
          process_cell_func(z, a)
        }
      }
    }

    //Return statement
    return { points: points_array }
  }, [
    options.heightmapConfig,
    options.heightmapConfig.enabled,
    options.heightmapConfig.elevationScale,
    options.heightmapConfig.opacity,
    options.heightmapConfig.opacityByPercentile,
    options.heightmapConfig.opacityByPercentileStrength,
    options.heightmapConfig.resolutionArcmin,
    options.heightmapConfig.heightScaleMode,
    options.heightmapConfig.blendWeight,
    options.raster,
    options.minVal,
    options.maxVal,
    options.scaleType,
    options.logSigma,
    options.palette,
    options.invertPalette,
    options.projection,
    options.countriesMode,
    options.countryStats,
    options.selectedCountries,
    options.selectedCountry,
  ])
}
