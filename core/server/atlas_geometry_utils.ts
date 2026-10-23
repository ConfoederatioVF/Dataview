import { sanitizePolygonGeometry } from '../framework/geopng/polygon_sanitizer.ts'

/**
 * Computes a 2D bounding box [minLng, minLat, maxLng, maxLat] for a GeoJSON geometry.
 *
 * @param {any} arg0_geometry
 *
 * @returns {[number, number, number, number]}
 */
export let computeGeometryBBox = function (arg0_geometry: any): [number, number, number, number] {
  //Convert from parameters
  let geometry = arg0_geometry

  //Declare local instance variables
  let max_x = -Infinity
  let max_y = -Infinity
  let min_x = Infinity
  let min_y = Infinity
  let scan_coords: (arg0_coords: any) => void

  //Function body
  scan_coords = function (arg0_coords: any) {
    let coords = arg0_coords
    if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
      let x = coords[0]
      let y = coords[1]
      if (x < min_x)
        min_x = x
      if (x > max_x)
        max_x = x
      if (y < min_y)
        min_y = y
      if (y > max_y)
        max_y = y
      return
    }
    for (let i = 0; i < coords.length; i++)
      scan_coords(coords[i])
  }

  if (geometry && geometry.coordinates)
    scan_coords(geometry.coordinates)

  //Return statement
  return [
    min_x === Infinity ? -180 : min_x,
    min_y === Infinity ? -90 : min_y,
    max_x === -Infinity ? 180 : max_x,
    max_y === -Infinity ? 90 : max_y,
  ]
}


/**
 * Recursively applies Ramer-Douglas-Peucker simplification step to an array of 2D points.
 *
 * @param {any[]} arg0_points
 * @param {number} arg1_first
 * @param {number} arg2_last
 * @param {number} arg3_sq_tol
 * @param {any[]} arg4_simplified
 *
 * @returns {void}
 */
function simplifyRDPStep (
  arg0_points: any[],
  arg1_first: number,
  arg2_last: number,
  arg3_sq_tol: number,
  arg4_simplified: any[]
): void {
  //Convert from parameters
  let first = arg1_first
  let last = arg2_last
  let points = arg0_points
  let simplified = arg4_simplified
  let sq_tol = arg3_sq_tol

  //Declare local instance variables
  let dx: number
  let dy: number
  let index: number = -1
  let max_sq_dist = sq_tol
  let p: any
  let p1: any
  let p2: any
  let proj_x: number
  let proj_y: number
  let sq_d: number
  let t: number

  //Function body
  p1 = points[first]
  p2 = points[last]
  dx = p2[0] - p1[0]
  dy = p2[1] - p1[1]

  for (let i = first + 1; i < last; i++) {
    p = points[i]
    if (dx !== 0 || dy !== 0) {
      t = ((p[0] - p1[0]) * dx + (p[1] - p1[1]) * dy) / (dx * dx + dy * dy)
      t = Math.max(0, Math.min(1, t))
      proj_x = p1[0] + t * dx
      proj_y = p1[1] + t * dy
    } else {
      proj_x = p1[0]
      proj_y = p1[1]
    }
    sq_d = (p[0] - proj_x) * (p[0] - proj_x) + (p[1] - proj_y) * (p[1] - proj_y)

    if (sq_d > max_sq_dist) {
      index = i
      max_sq_dist = sq_d
    }
  }

  if (index !== -1) {
    if (index - first > 1)
      simplifyRDPStep(points, first, index, sq_tol, simplified)
    simplified.push(points[index])
    if (last - index > 1)
      simplifyRDPStep(points, index, last, sq_tol, simplified)
  }
}


/**
 * Simplifies and deduplicates a polygon coordinate ring using Ramer-Douglas-Peucker algorithm.
 *
 * @param {any[]} arg0_ring
 * @param {number} [arg1_tolerance=0.01]
 *
 * @returns {any[]}
 */
function simplifyRing (arg0_ring: any[], arg1_tolerance: number = 0.01): any[] {
  //Convert from parameters
  let ring = arg0_ring
  let tol = arg1_tolerance

  //Declare local instance variables
  let chain1: any[]
  let chain2: any[]
  let clean_ring: any[] = []
  let d: number
  let dx: number
  let dy: number
  let far_idx: number = -1
  let is_closed: boolean
  let max_d: number = 0
  let p0: any
  let pt: any
  let result: any[]
  let sq_tol: number

  //Guard clauses
  if (!ring || ring.length <= 4)
    return ring

  //Function body
  for (let i = 0; i < ring.length; i++) {
    pt = ring[i]
    if (
      clean_ring.length === 0 ||
      clean_ring[clean_ring.length - 1][0] !== pt[0] ||
      clean_ring[clean_ring.length - 1][1] !== pt[1]
    ) {
      clean_ring.push(pt)
    }
  }

  if (clean_ring.length <= 4)
    return ring

  is_closed = (
    clean_ring[0][0] === clean_ring[clean_ring.length - 1][0] &&
    clean_ring[0][1] === clean_ring[clean_ring.length - 1][1]
  )
  sq_tol = tol * tol

  if (is_closed) {
    p0 = clean_ring[0]
    for (let i = 1; i < clean_ring.length - 1; i++) {
      dx = clean_ring[i][0] - p0[0]
      dy = clean_ring[i][1] - p0[1]
      d = dx * dx + dy * dy
      if (d > max_d) {
        max_d = d
        far_idx = i
      }
    }

    if (far_idx <= 1 || far_idx >= clean_ring.length - 2)
      return clean_ring

    chain1 = [clean_ring[0]]
    simplifyRDPStep(clean_ring, 0, far_idx, sq_tol, chain1)
    chain1.push(clean_ring[far_idx])

    chain2 = []
    simplifyRDPStep(clean_ring, far_idx, clean_ring.length - 1, sq_tol, chain2)
    chain2.push(clean_ring[clean_ring.length - 1])

    result = chain1.concat(chain2)
    if (result.length < 4)
      return clean_ring

    //Return statement
    return result
  }

  result = [clean_ring[0]]
  simplifyRDPStep(clean_ring, 0, clean_ring.length - 1, sq_tol, result)
  result.push(clean_ring[clean_ring.length - 1])

  //Return statement
  return result
}


/**
 * Culls redundant and duplicate vertices in GeoJSON polygon geometries using Ramer-Douglas-Peucker algorithm.
 *
 * @param {any} arg0_geometry
 * @param {number} [arg1_tolerance=0.01]
 *
 * @returns {any}
 */
export let cullAndSimplifyGeometry = function (arg0_geometry: any, arg1_tolerance: number = 0.01): any {
  //Convert from parameters
  let geometry = arg0_geometry
  let tol = arg1_tolerance

  //Declare local instance variables
  let new_coords: any[] = []
  let new_poly: any[]
  let poly: any[]
  let type: string

  //Guard clauses
  if (!geometry || !geometry.coordinates || !geometry.type)
    return geometry

  //Function body
  type = geometry.type

  if (type === 'Polygon') {
    for (let i = 0; i < geometry.coordinates.length; i++)
      new_coords.push(simplifyRing(geometry.coordinates[i], tol))

    //Return statement
    return sanitizePolygonGeometry({
      ...geometry,
      coordinates: new_coords,
    })
  }

  if (type === 'MultiPolygon') {
    for (let i = 0; i < geometry.coordinates.length; i++) {
      poly = geometry.coordinates[i]
      new_poly = []
      for (let x = 0; x < poly.length; x++)
        new_poly.push(simplifyRing(poly[x], tol))
      new_coords.push(new_poly)
    }

    //Return statement
    return sanitizePolygonGeometry({
      ...geometry,
      coordinates: new_coords,
    })
  }

  //Return statement
  return sanitizePolygonGeometry(geometry)
}
