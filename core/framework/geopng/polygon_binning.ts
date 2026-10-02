import { DecodedRaster } from './types.ts'

export interface CountryProperties {
  adm0_a3?: string
  continent?: string
  iso_a3?: string
  name: string
  name_long?: string
  sov_a3?: string
  [key: string]: any
}

export interface CountryFeature {
  bbox?: [number, number, number, number]
  geometry: {
    coordinates: any
    type: 'Polygon' | 'MultiPolygon'
  }
  id?: string | number
  properties: CountryProperties
  type: 'Feature'
}

export interface CountryStats {
  histogram: {
    bins: number[]
    counts: number[]
    max: number
    min: number
  }
  isoA3: string
  max: number
  mean: number
  median: number
  min: number
  name: string
  quantiles: Record<number, number>
  stdDev: number
  total: number //Sum of all valid cells
  totalCells: number
  validCount: number
}

let cached_countries_geojson: { features: CountryFeature[]; type: string } | null = null
let stats_cache = new Map<string, CountryStats>()
let last_cached_raster: DecodedRaster | null = null

/**
 * High-performance scanline polygon binning of a GeoPNG raster.
 *
 * @param {DecodedRaster} arg0_raster
 * @param {CountryFeature} arg1_feature
 *
 * @returns {CountryStats}
 */
export function binRasterByCountry (
  arg0_raster: DecodedRaster,
  arg1_feature: CountryFeature
): CountryStats {
  //Convert from parameters
  let feature = arg1_feature
  let raster = arg0_raster

  //Declare local instance variables
  let approx_cells: number
  let bin_count = 60
  let bin_counts: number[] = new Array(bin_count).fill(0)
  let bin_edges: number[] = []
  let bin_width: number
  let geometry = feature.geometry
  let h = raster.height
  let hole_bboxes: [number, number, number, number][]
  let iso_a3 = feature.properties.iso_a3 || feature.properties.adm0_a3 || feature.properties.sov_a3 || ''
  let max = -Infinity
  let mean: number
  let median = 0
  let min = Infinity
  let name = feature.properties.name || feature.properties.name_long || 'Unknown'
  let polygons: number[][][][] =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][])
  let quantiles: Record<number, number> = {}
  let safe_max: number
  let safe_min: number
  let sample_values: number[]
  let std_dev: number
  let stride: number
  let sum = 0
  let total_cells = 0
  let valid_count = 0
  let values: number[] = []
  let variance_sum = 0
  let w = raster.width

  //Function body
  for (let i = 0; i < polygons.length; i++) {
    let exterior_ring = polygons[i][0]
    let hole_rings = polygons[i].slice(1)

    hole_bboxes = []
    for (let x = 0; x < hole_rings.length; x++) {
      let hr = hole_rings[x]
      let h_max_x = -Infinity
      let h_max_y = -Infinity
      let h_min_x = Infinity
      let h_min_y = Infinity
      for (let y = 0; y < hr.length; y++) {
        let pt = hr[y]
        if (pt[0] < h_min_x)
          h_min_x = pt[0]
        if (pt[1] < h_min_y)
          h_min_y = pt[1]
        if (pt[0] > h_max_x)
          h_max_x = pt[0]
        if (pt[1] > h_max_y)
          h_max_y = pt[1]
      }
      hole_bboxes.push([h_min_x, h_min_y, h_max_x, h_max_y])
    }

    let p_max_x = -Infinity
    let p_max_y = -Infinity
    let p_min_x = Infinity
    let p_min_y = Infinity

    for (let x = 0; x < exterior_ring.length; x++) {
      let pt = exterior_ring[x]
      if (pt[0] < p_min_x)
        p_min_x = pt[0]
      if (pt[1] < p_min_y)
        p_min_y = pt[1]
      if (pt[0] > p_max_x)
        p_max_x = pt[0]
      if (pt[1] > p_max_y)
        p_max_y = pt[1]
    }

    let max_col = Math.min(w - 1, Math.ceil(((p_max_x + 180)/360)*w))
    let max_row = Math.min(h - 1, Math.ceil(((90 - p_min_y)/180)*h))
    let min_col = Math.max(0, Math.floor(((p_min_x + 180)/360)*w))
    let min_row = Math.max(0, Math.floor(((90 - p_max_y)/180)*h))

    approx_cells = (max_col - min_col + 1)*(max_row - min_row + 1)
    stride = approx_cells > 25000 ? Math.max(1, Math.floor(Math.sqrt(approx_cells/20000))) : 1

    for (let r = min_row; r <= max_row; r += stride) {
      let lat = 90 - ((r + 0.5)/h)*180
      let intersections: number[] = []

      for (let x = 0, y = exterior_ring.length - 1; x < exterior_ring.length; y = x++) {
        let p1 = exterior_ring[x]
        let p2 = exterior_ring[y]
        if ((p1[1] <= lat && p2[1] > lat) || (p2[1] <= lat && p1[1] > lat)) {
          let t = (lat - p1[1])/(p2[1] - p1[1])
          let lng = p1[0] + t*(p2[0] - p1[0])
          intersections.push(lng)
        }
      }

      if (intersections.length < 2)
        continue
      intersections.sort((arg0_a, arg0_b) => arg0_a - arg0_b)

      for (let k = 0; k < intersections.length - 1; k += 2) {
        let c_end = Math.min(max_col, Math.ceil(((intersections[k + 1] + 180)/360)*w))
        let c_start = Math.max(min_col, Math.floor(((intersections[k] + 180)/360)*w))
        let row_offset = r*w

        for (let c = c_start; c <= c_end; c += stride) {
          let in_hole = false
          let lng = -180 + ((c + 0.5)/w)*360

          if (hole_bboxes.length > 0) {
            for (let z = 0; z < hole_rings.length; z++) {
              let hb = hole_bboxes[z]
              if (lng >= hb[0] && lng <= hb[2] && lat >= hb[1] && lat <= hb[3]) {
                if (pointInRing(lng, lat, hole_rings[z])) {
                  in_hole = true
                  break
                }
              }
            }
          }
          if (in_hole)
            continue

          total_cells += stride*stride
          let val = raster.data[row_offset + c]
          if (!Number.isNaN(val) && Number.isFinite(val)) {
            if (val < min)
              min = val
            if (val > max)
              max = val
            sum += val*stride*stride
            valid_count += stride*stride
            values.push(val)
          }
        }
      }
    }
  }

  mean = valid_count > 0 ? sum/valid_count : 0

  if (valid_count > 1) {
    for (let i = 0; i < values.length; i++)
      variance_sum += (values[i] - mean)**2
  }
  std_dev = valid_count > 1 ? Math.sqrt(variance_sum/(valid_count - 1)) : 0

  sample_values = values
  if (values.length > 50000) {
    let step = Math.ceil(values.length/50000)
    sample_values = []
    for (let i = 0; i < values.length; i += step)
      sample_values.push(values[i])
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
    median = quantiles[50] ?? 0
  }

  safe_min = Number.isFinite(min) ? min : 0
  safe_max = Number.isFinite(max) ? max : 1
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
    histogram: {
      bins: bin_edges,
      counts: bin_counts,
      max: safe_max,
      min: safe_min,
    },
    isoA3: iso_a3,
    max: Number.isFinite(max) ? max : 0,
    mean,
    median,
    min: Number.isFinite(min) ? min : 0,
    name,
    quantiles,
    stdDev: std_dev,
    total: valid_count > 0 ? sum : 0,
    totalCells: total_cells,
    validCount: valid_count,
  }
}

/**
 * Memoized version of binRasterByCountry for rapid hover lookup.
 *
 * @param {DecodedRaster} arg0_raster
 * @param {CountryFeature} arg1_feature
 *
 * @returns {CountryStats}
 */
export function binRasterByCountryMemoized (
  arg0_raster: DecodedRaster,
  arg1_feature: CountryFeature
): CountryStats {
  //Convert from parameters
  let feature = arg1_feature
  let raster = arg0_raster

  //Declare local instance variables
  let cached: CountryStats | undefined
  let feat_any: any
  let feat_date: string
  let feat_end: number | string
  let feat_id: number | string
  let feat_name: string
  let feat_start: number | string
  let key: string
  let result: CountryStats

  //Function body
  if (last_cached_raster !== raster) {
    stats_cache.clear()
    last_cached_raster = raster
  }

  feat_any = feature as any
  feat_date = feat_any.properties?.date || ''
  feat_end = feat_any.properties?.endYear ?? ''
  feat_id = feat_any.id || feat_any.properties?.id || ''
  feat_name = feature.properties.adm0_a3 || feature.properties.iso_a3 || feature.properties.name || ''
  feat_start = feat_any.properties?.startYear ?? ''

  key = `${feat_id}_${feat_name}_${feat_start}_${feat_end}_${feat_date}`
  cached = stats_cache.get(key)
  if (cached)
    return cached

  result = binRasterByCountry(raster, feature)
  stats_cache.set(key, result)

  //Return statement
  return result
}

/**
 * Computes aggregated statistics across multiple selected countries.
 *
 * @param {DecodedRaster} arg0_raster
 * @param {CountryFeature[]} arg1_features
 *
 * @returns {CountryStats | null}
 */
export function binRasterByMultipleCountries (
  arg0_raster: DecodedRaster,
  arg1_features: CountryFeature[]
): CountryStats | null {
  //Convert from parameters
  let features = arg1_features
  let raster = arg0_raster

  //Guard clauses
  if (!features || features.length === 0)
    return null
  if (features.length === 1)
    return binRasterByCountryMemoized(raster, features[0])

  //Declare local instance variables
  let bin_count = 60
  let bin_counts: number[] = new Array(bin_count).fill(0)
  let bin_edges: number[] = []
  let bin_width: number
  let iso_a3 = features.map((arg0_f) => arg0_f.properties.iso_a3 || arg0_f.properties.adm0_a3 || '').join(', ')
  let max = -Infinity
  let mean: number
  let min = Infinity
  let name =
    features.length <= 2
      ? features.map((arg0_f) => arg0_f.properties.name).join(', ')
      : `${features[0].properties.name}, ${features[1].properties.name} (+${features.length - 2} more)`
  let quantiles: Record<number, number> = {}
  let running_count = 0
  let safe_max: number
  let safe_min: number
  let sum = 0
  let target_idx = 1
  let target_percentiles = [0, 1, 5, 25, 50, 75, 95, 99, 100]
  let total_cells = 0
  let valid_count = 0

  //Function body
  for (let i = 0; i < features.length; i++) {
    let stats = binRasterByCountryMemoized(raster, features[i])
    total_cells += stats.totalCells
    valid_count += stats.validCount
    if (stats.min < min)
      min = stats.min
    if (stats.max > max)
      max = stats.max
    sum += stats.mean*stats.validCount
  }

  mean = valid_count > 0 ? sum/valid_count : 0
  safe_min = Number.isFinite(min) ? min : 0
  safe_max = Number.isFinite(max) ? max : 1
  bin_width = (safe_max - safe_min)/bin_count || 1

  for (let i = 0; i <= bin_count; i++)
    bin_edges.push(safe_min + i*bin_width)

  for (let i = 0; i < features.length; i++) {
    let s = binRasterByCountryMemoized(raster, features[i])
    if (s.histogram) {
      for (let x = 0; x < s.histogram.counts.length; x++) {
        let c = s.histogram.counts[x]
        if (c === 0)
          continue
        let mid_val = (s.histogram.bins[x] + s.histogram.bins[x + 1])/2
        let b_idx = Math.floor((mid_val - safe_min)/bin_width)
        if (b_idx < 0)
          b_idx = 0
        if (b_idx >= bin_count)
          b_idx = bin_count - 1
        bin_counts[b_idx] += c
      }
    }
  }

  quantiles[0] = safe_min
  quantiles[100] = safe_max

  for (let i = 0; i < bin_count && target_idx < target_percentiles.length - 1; i++) {
    running_count += bin_counts[i]
    let p_val = (running_count/(valid_count || 1))*100
    for (; target_idx < target_percentiles.length - 1 && p_val >= target_percentiles[target_idx]; target_idx++) {
      let p = target_percentiles[target_idx]
      quantiles[p] = bin_edges[i + 1]
    }
  }

  for (let i = 0; i < target_percentiles.length; i++) {
    let p = target_percentiles[i]
    if (quantiles[p] === undefined)
      quantiles[p] = (safe_min + safe_max)/2
  }

  //Return statement
  return {
    histogram: {
      bins: bin_edges,
      counts: bin_counts,
      max: safe_max,
      min: safe_min,
    },
    isoA3: iso_a3,
    max: Number.isFinite(max) ? max : 0,
    mean,
    median: quantiles[50] ?? (safe_min + safe_max)/2,
    min: Number.isFinite(min) ? min : 0,
    name,
    quantiles,
    stdDev: 0,
    total: valid_count > 0 ? sum : 0,
    totalCells: total_cells,
    validCount: valid_count,
  }
}

/**
 * Computes 2D bounding box [minX, minY, maxX, maxY] for a GeoJSON geometry.
 *
 * @param {any} arg0_geometry
 *
 * @returns {[number, number, number, number]}
 */
export function computeGeometryBBox (arg0_geometry: any): [number, number, number, number] {
  //Convert from parameters
  let geometry = arg0_geometry

  //Declare local instance variables
  let max_x = -Infinity
  let max_y = -Infinity
  let min_x = Infinity
  let min_y = Infinity

  let process_coords = function (arg0_coords: any) {
    let coords = arg0_coords
    if (typeof coords[0] === 'number') {
      let [x, y] = coords
      if (x < min_x)
        min_x = x
      if (y < min_y)
        min_y = y
      if (x > max_x)
        max_x = x
      if (y > max_y)
        max_y = y
    } else {
      for (let i = 0; i < coords.length; i++)
        process_coords(coords[i])
    }
  }

  //Function body
  process_coords(geometry.coordinates)

  //Return statement
  return [min_x, min_y, max_x, max_y]
}

/**
 * Finds the country feature containing [lng, lat].
 *
 * @param {number} arg0_lng
 * @param {number} arg1_lat
 * @param {CountryFeature[]} arg2_features
 *
 * @returns {CountryFeature | null}
 */
export function findCountryAtLngLat (
  arg0_lng: number,
  arg1_lat: number,
  arg2_features: CountryFeature[]
): CountryFeature | null {
  //Convert from parameters
  let features = arg2_features
  let lat = arg1_lat
  let lng = arg0_lng

  //Function body
  for (let i = 0; i < features.length; i++) {
    let feat = features[i]
    if (feat.bbox) {
      let [min_x, min_y, max_x, max_y] = feat.bbox
      if (lng < min_x || lng > max_x || lat < min_y || lat > max_y)
        continue
    }
    if (isPointInGeometry(lng, lat, feat.geometry))
      return feat
  }

  //Return statement
  return null
}

/**
 * Resolves a reliable entity display name across modern countries, CShapes polities, and Naissance territories.
 *
 * @param {any} arg0_feat
 * @param {string} [arg1_fallback='']
 *
 * @returns {string}
 */
export function getFeatureEntityName (arg0_feat: any, arg1_fallback?: string): string {
  //Convert from parameters
  let fallback = (typeof arg1_fallback === 'string') ? arg1_fallback : ''
  let feat = arg0_feat

  //Guard clauses
  if (!feat)
    return fallback

  //Declare local instance variables
  let properties_obj = feat.properties || {}

  //Return statement
  return (
    properties_obj.name ||
    properties_obj.cntry_name ||
    properties_obj.CNTRY_NAME ||
    properties_obj.NAME ||
    properties_obj.Country ||
    properties_obj.country ||
    properties_obj.adm0_a3 ||
    properties_obj.id ||
    feat.name ||
    feat.id ||
    properties_obj.ADMIN ||
    properties_obj.name_long ||
    fallback ||
    'Historical Territory'
  )
}

/**
 * Tests whether a point [lng, lat] is inside a GeoJSON geometry.
 *
 * @param {number} arg0_lng
 * @param {number} arg1_lat
 * @param {any} arg2_geometry
 *
 * @returns {boolean}
 */
export function isPointInGeometry (arg0_lng: number, arg1_lat: number, arg2_geometry: any): boolean {
  //Convert from parameters
  let geometry = arg2_geometry
  let lat = arg1_lat
  let lng = arg0_lng

  //Function body
  if (geometry.type === 'Polygon') {
    let rings = geometry.coordinates as number[][][]
    if (!pointInRing(lng, lat, rings[0]))
      return false
    for (let i = 1; i < rings.length; i++) {
      if (pointInRing(lng, lat, rings[i]))
        return false //In hole
    }
    return true
  } else if (geometry.type === 'MultiPolygon') {
    let polygons = geometry.coordinates as number[][][][]
    for (let i = 0; i < polygons.length; i++) {
      let poly = polygons[i]
      if (pointInRing(lng, lat, poly[0])) {
        let in_hole = false
        for (let x = 1; x < poly.length; x++) {
          if (pointInRing(lng, lat, poly[x])) {
            in_hole = true
            break
          }
        }
        if (!in_hole)
          return true
      }
    }
    return false
  }

  //Return statement
  return false
}

/**
 * Loads and caches NaturalEarth countries GeoJSON.
 *
 * @returns {Promise<CountryFeature[]>}
 */
export async function loadCountriesGeoJson (): Promise<CountryFeature[]> {
  //Guard clauses
  if (cached_countries_geojson)
    return cached_countries_geojson.features

  //Function body
  try {
    let res = await fetch('/data/ne_50m_admin_0_countries.geojson')
    if (!res.ok) {
      console.error(`HTTP ${res.status} loading countries GeoJSON`)
      return []
    }
    let data = await res.json()

    for (let i = 0; i < data.features.length; i++) {
      let feat = data.features[i]
      feat.bbox = computeGeometryBBox(feat.geometry)
      let p = feat.properties
      p.name = p.name || p.NAME || p.ADMIN || p.NAME_LONG || p.name_long || 'Unknown'
      p.name_long = p.name_long || p.NAME_LONG || p.name
      let raw_adm = p.ADM0_A3 || p.adm0_a3 || ''
      let raw_iso = p.ISO_A3 || p.iso_a3 || ''
      p.adm0_a3 = raw_adm || (raw_iso && raw_iso !== '-99' ? raw_iso : '') || p.name
      p.iso_a3 = (raw_iso && raw_iso !== '-99') ? raw_iso : p.adm0_a3
    }

    cached_countries_geojson = data
    return data.features
  } catch (arg0_err) {
    console.error('Failed to load countries GeoJSON:', arg0_err)
    return []
  }
}

/**
 * Checks if a point [lng, lat] is inside a polygon ring using ray casting.
 *
 * @param {number} arg0_x
 * @param {number} arg1_y
 * @param {number[][]} arg2_ring
 *
 * @returns {boolean}
 */
export function pointInRing (arg0_x: number, arg1_y: number, arg2_ring: number[][]): boolean {
  //Convert from parameters
  let ring = arg2_ring
  let x = arg0_x
  let y = arg1_y

  //Declare local instance variables
  let inside = false

  //Function body
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    let xi = ring[i][0]
    let xj = ring[j][0]
    let yi = ring[i][1]
    let yj = ring[j][1]
    let intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi)*(y - yi))/(yj - yi) + xi)
    if (intersect)
      inside = !inside
  }

  //Return statement
  return inside
}
