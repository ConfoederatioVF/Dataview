/**
 * Polygon geometry sanitiser for Deck.gl and GIS rendering pipelines.
 * Enforces RFC 7946 winding order (CCW exterior rings, CW interior holes),
 * removes degenerate rings, closes unclosed rings, and strips invalid exterior
 * hole slivers that cause triangulation artefacts in Earcut.
 */

/**
 * Computes the signed 2D planar area of a closed coordinate ring using the shoelace formula.
 * Returns a positive value for Counter-Clockwise (CCW) winding and negative for Clockwise (CW).
 *
 * @param {number[][]} arg0_ring - Array of [lng, lat] coordinate pairs
 *
 * @returns {number}
 */
export function computeRingSignedArea (arg0_ring: number[][]): number {
  //Convert from parameters
  let ring = arg0_ring

  //Declare local instance variables
  let area = 0
  let len: number

  //Guard clauses
  if (!ring || ring.length < 3)
    return 0

  //Function body
  len = ring.length
  for (let i = 0; i < len - 1; i++)
    area += ring[i][0]*ring[i + 1][1] - ring[i + 1][0]*ring[i][1]

  //Return statement
  return area/2
}


/**
 * Computes the 2D centroid of a coordinate ring by averaging its distinct vertices.
 *
 * @param {number[][]} arg0_ring - Array of [lng, lat] coordinate pairs
 *
 * @returns {[number, number]}
 */
export function getRingCentroid (arg0_ring: number[][]): [number, number] {
  //Convert from parameters
  let ring = arg0_ring

  //Declare local instance variables
  let cx = 0
  let cy = 0
  let num_pts: number

  //Guard clauses
  if (!ring || ring.length === 0)
    return [0, 0]
  if (ring.length <= 2)
    return [ring[0][0], ring[0][1]]

  //Function body
  num_pts = ring.length - 1
  for (let i = 0; i < num_pts; i++) {
    cx += ring[i][0]
    cy += ring[i][1]
  }

  //Return statement
  return [cx/num_pts, cy/num_pts]
}


/**
 * Evaluates whether an interior ring (hole) is geometrically contained within an exterior ring.
 * Discards degenerate boundary slivers or exterior fragments erroneously categorised as holes.
 *
 * @param {number[][]} arg0_hole - Hole coordinate ring
 * @param {number[][]} arg1_exterior - Exterior boundary ring
 *
 * @returns {boolean}
 */
export function isHoleInsideExterior (arg0_hole: number[][], arg1_exterior: number[][]): boolean {
  //Convert from parameters
  let hole = arg0_hole
  let exterior = arg1_exterior

  //Declare local instance variables
  let centroid: [number, number]
  let centroid_inside: boolean
  let inside_count = 0
  let num_pts: number

  //Guard clauses
  if (!hole || !exterior || hole.length < 4 || exterior.length < 4)
    return false

  //Function body
  num_pts = hole.length - 1
  centroid = getRingCentroid(hole)
  centroid_inside = isPointInPolygonRing(centroid, exterior)

  for (let i = 0; i < num_pts; i++)
    if (isPointInPolygonRing(hole[i], exterior))
      inside_count++

  if (centroid_inside && inside_count >= 1)
    return true
  if (!centroid_inside && inside_count > num_pts/2)
    return true

  //Return statement
  return false
}


/**
 * Tests whether a point lies within a 2D planar polygon ring using ray casting.
 *
 * @param {number[]} arg0_point - [x, y] coordinates of query point
 * @param {number[][]} arg1_ring - Closed array of [x, y] ring vertices
 *
 * @returns {boolean}
 */
export function isPointInPolygonRing (arg0_point: number[], arg0_ring: number[][]): boolean {
  //Convert from parameters
  let pt = arg0_point
  let ring = arg0_ring

  //Declare local instance variables
  let inside = false
  let intersect: boolean
  let x = pt[0]
  let xi: number
  let xj: number
  let y = pt[1]
  let yi: number
  let yj: number

  //Guard clauses
  if (!ring || ring.length < 3)
    return false

  //Function body
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    xi = ring[i][0]
    yi = ring[i][1]
    xj = ring[j][0]
    yj = ring[j][1]

    intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi)*(y - yi)/(yj - yi) + xi)
    if (intersect)
      inside = !inside
  }

  //Return statement
  return inside
}


/**
 * Cleans, closes, deduplicates, and normalises winding order for a single coordinate ring.
 * Exterior rings are normalised to Counter-Clockwise (CCW); interior holes to Clockwise (CW).
 *
 * @param {number[][]} arg0_ring - Coordinate ring to sanitise
 * @param {boolean} [arg1_is_hole=false] - Whether the ring is an interior hole
 *
 * @returns {number[][] | null} Sanitised ring or null if degenerate
 */
export function sanitizeRing (arg0_ring: number[][], arg1_is_hole: boolean = false): number[][] | null {
  //Convert from parameters
  let is_hole = arg1_is_hole
  let ring = arg0_ring

  //Declare local instance variables
  let clean_ring: number[][] = []
  let is_closed: boolean
  let p_first: number[]
  let p_last: number[]
  let pt: number[]
  let signed_area: number

  //Guard clauses
  if (!ring || ring.length < 3)
    return null

  //Function body
  for (let i = 0; i < ring.length; i++) {
    pt = ring[i]
    if (
      clean_ring.length === 0 ||
      clean_ring[clean_ring.length - 1][0] !== pt[0] ||
      clean_ring[clean_ring.length - 1][1] !== pt[1]
    ) {
      clean_ring.push([pt[0], pt[1]])
    }
  }

  if (clean_ring.length < 3)
    return null

  p_first = clean_ring[0]
  p_last = clean_ring[clean_ring.length - 1]
  is_closed = (p_first[0] === p_last[0] && p_first[1] === p_last[1])

  if (!is_closed)
    clean_ring.push([p_first[0], p_first[1]])

  if (clean_ring.length < 4)
    return null

  signed_area = computeRingSignedArea(clean_ring)
  if (Math.abs(signed_area) < 1e-12)
    return null

  if (!is_hole && signed_area < 0) {
    clean_ring.reverse()
  } else if (is_hole && signed_area > 0) {
    clean_ring.reverse()
  }

  //Return statement
  return clean_ring
}


/**
 * Sanitises an individual polygon coordinate structure [exterior_ring, ...holes].
 * Drops degenerate rings, validates hole containment, and normalises winding order.
 *
 * @param {number[][][]} arg0_polygon - Array of coordinate rings
 *
 * @returns {number[][][] | null} Sanitised polygon coordinates or null if invalid
 */
export function sanitizePolygonCoordinates (arg0_polygon: number[][][]): number[][][] | null {
  //Convert from parameters
  let polygon = arg0_polygon

  //Declare local instance variables
  let clean_exterior: number[][] | null
  let clean_hole: number[][] | null
  let result_poly: number[][][] = []

  //Guard clauses
  if (!polygon || !Array.isArray(polygon) || polygon.length === 0)
    return null

  //Function body
  clean_exterior = sanitizeRing(polygon[0], false)
  if (!clean_exterior)
    return null

  result_poly.push(clean_exterior)

  for (let h = 1; h < polygon.length; h++) {
    clean_hole = sanitizeRing(polygon[h], true)
    if (!clean_hole)
      continue
    if (!isHoleInsideExterior(clean_hole, clean_exterior))
      continue

    result_poly.push(clean_hole)
  }

  //Return statement
  return result_poly
}


/**
 * Sanitises any GeoJSON geometry, removing defective interior holes and normalising winding.
 * Directly fixes triangular tessellation artefacts in Polygon and MultiPolygon boundaries.
 *
 * @param {any} arg0_geometry - GeoJSON geometry object
 *
 * @returns {any} Sanitised geometry or original if non-polygon
 */
export function sanitizePolygonGeometry (arg0_geometry: any): any {
  //Convert from parameters
  let geom = arg0_geometry

  //Declare local instance variables
  let clean_coords: any
  let clean_polys: number[][][][] = []
  let poly: number[][][]

  //Guard clauses
  if (!geom || !geom.coordinates || !geom.type)
    return geom

  //Function body
  if (geom.type === 'Polygon') {
    clean_coords = sanitizePolygonCoordinates(geom.coordinates)
    if (!clean_coords)
      return geom

    //Return statement
    return {
      ...geom,
      coordinates: clean_coords,
    }
  }

  if (geom.type === 'MultiPolygon') {
    for (let i = 0; i < geom.coordinates.length; i++) {
      poly = geom.coordinates[i]
      clean_coords = sanitizePolygonCoordinates(poly)
      if (clean_coords)
        clean_polys.push(clean_coords)
    }

    if (clean_polys.length === 0)
      return geom

    //Return statement
    return {
      ...geom,
      coordinates: clean_polys,
    }
  }

  //Return statement
  return geom
}
