import { projectEqualEarth, invertEqualEarth } from '../geopng/equal_earth'
import { SmoothGlobeViewport } from './SmoothGlobeViewport'

let FLOOR_KNOTS: Array<[number, number]> = [
  [600, 5000],
  [700, 10000],
  [1400, 10000],
  [1500, 20000],
]

/**
 * Computes historical era baseline population display floor.
 * Small settlements thin out in modern eras to prevent screen overcrowding.
 *
 * @param {number} arg0_year
 *
 * @returns {number}
 */
export function getEraDisplayFloor (arg0_year: number): number {
  //Convert from parameters
  let year = arg0_year

  //Return statement
  return 0.01
}

export interface ZoomThresholds {
  bubbleMinPop: number
  labelMinPop: number
  maxBubbles: number
  maxLabels: number
}

/**
 * Returns calibrated population thresholds and maximum label counts for a given camera zoom.
 *
 * @param {number} arg0_zoom
 * @param {string} [arg1_projection='Mercator']
 *
 * @returns {ZoomThresholds}
 */
export function getZoomPopulationThreshold (
  arg0_zoom: number,
  arg1_projection?: string
): ZoomThresholds {
  //Convert from parameters
  let projection = (arg1_projection) ? arg1_projection : 'Mercator'
  let zoom = arg0_zoom

  //Declare local instance variables
  let is_cartesian = (projection === 'EqualEarth' || projection === 'Equirectangular')
  let is_globe = (projection === 'Globe')
  let norm_zoom: number

  //Function body
  if (is_cartesian) {
    norm_zoom = zoom - 1.2
  } else if (is_globe) {
    norm_zoom = zoom - 1.65
  } else {
    norm_zoom = zoom
  }

  //Return statement
  return {
    bubbleMinPop: 0.01,
    labelMinPop: 0.01,
    maxBubbles: 50000,
    maxLabels: (norm_zoom < 2.0) ? 150 : (norm_zoom < 3.5 ? 350 : 800),
  }
}

/**
 * Computes the visible geographic bounding box [west, south, east, north] with margin.
 *
 * @param {any} arg0_view_state
 * @param {string} arg1_projection
 * @param {number} arg2_window_w
 * @param {number} arg3_window_h
 *
 * @returns {[number, number, number, number]} - [west, south, east, north]
 */
export function computeViewportBoundingBox (
  arg0_view_state: any,
  arg1_projection: string,
  arg2_window_w: number,
  arg3_window_h: number
): [number, number, number, number] {
  //Convert from parameters
  let projection = arg1_projection
  let view_state = arg0_view_state
  let window_h = arg3_window_h
  let window_w = arg2_window_w

  //Declare local instance variables
  let east: number
  let is_cartesian = (projection === 'EqualEarth' || projection === 'Equirectangular')
  let is_globe = (projection === 'Globe')
  let north: number
  let south: number
  let west: number

  //Function body
  if (!view_state)
    return [-180, -90, 180, 90]

  if (is_cartesian) {
    let half_h: number
    let half_w: number
    let max_x: number
    let max_y: number
    let min_x: number
    let min_y: number
    let scale = Math.pow(2, view_state.zoom ?? 2.8)
    let target = view_state.target || [0, 0, 0]

    half_w = (window_w/2)/scale
    half_h = (window_h/2)/scale
    min_x = target[0] - half_w*1.3
    max_x = target[0] + half_w*1.3
    min_y = target[1] - half_h*1.3
    max_y = target[1] + half_h*1.3

    if (projection === 'EqualEarth') {
      let ne = invertEqualEarth(max_x, max_y)
      let sw = invertEqualEarth(min_x, min_y)
      west = Math.max(-180, sw[0])
      south = Math.max(-90, sw[1])
      east = Math.min(180, ne[0])
      north = Math.min(90, ne[1])
    } else {
      west = Math.max(-180, min_x)
      south = Math.max(-90, min_y)
      east = Math.min(180, max_x)
      north = Math.min(90, max_y)
    }
  } else if (is_globe) {
    let bearing = view_state.bearing ?? 0
    let center_lat = view_state.latitude ?? 20
    let center_lng = view_state.longitude ?? 0
    let cos_max_lat: number
    let effective_zoom: number
    let globe_radius: number
    let lat_adjust: number
    let lat_clamp = Math.max(-89.9, Math.min(89.9, center_lat))
    let max_lat_rad: number
    let pitch = view_state.pitch ?? 0
    let pitch_rad: number
    let scale_adjust: number
    let screen_r: number
    let span_lng: number
    let theta_max_deg: number

    scale_adjust = Math.PI*Math.cos((lat_clamp*Math.PI)/180)
    lat_adjust = Math.log2(Math.max(0.0001, scale_adjust)) - Math.log2(Math.PI)
    effective_zoom = (view_state.zoom ?? 3) + lat_adjust
    globe_radius = (512/(2*Math.PI))*Math.pow(2, effective_zoom)

    screen_r = Math.sqrt((window_w/2)*(window_w/2) + (window_h/2)*(window_h/2))*1.35
    theta_max_deg = (globe_radius > 0) ? (screen_r/globe_radius)*(180/Math.PI) : 90

    //Expand for perspective viewing frustum under 3D camera pitch and bearing
    if (pitch > 0) {
      pitch_rad = (Math.min(80, pitch)*Math.PI)/180
      theta_max_deg = theta_max_deg/Math.cos(pitch_rad)
    }
    if (Math.abs(bearing) > 0.5)
      theta_max_deg *= 1.25

    theta_max_deg = Math.min(85, theta_max_deg)

    if (center_lat + theta_max_deg >= 90 || center_lat - theta_max_deg <= -90 || theta_max_deg >= 85) {
      east = 180
      north = Math.min(90, center_lat + theta_max_deg)
      south = Math.max(-90, center_lat - theta_max_deg)
      west = -180
    } else {
      north = Math.min(90, center_lat + theta_max_deg)
      south = Math.max(-90, center_lat - theta_max_deg)
      max_lat_rad = (Math.max(Math.abs(south), Math.abs(north))*Math.PI)/180
      cos_max_lat = Math.max(0.1, Math.cos(max_lat_rad))
      span_lng = theta_max_deg/cos_max_lat

      if (span_lng >= 180) {
        east = 180
        west = -180
      } else {
        east = center_lng + span_lng
        west = center_lng - span_lng

        if (west < -180)
          west += 360
        if (east > 180)
          east -= 360
      }
    }
  } else {
    let bearing = view_state.bearing ?? 0
    let center_lat = view_state.latitude ?? 20
    let center_lng = view_state.longitude ?? 0
    let delta_y_mercator: number
    let half_h: number
    let half_w: number
    let lat_clamped: number
    let lat_rad: number
    let margin = 1.35
    let north_rad: number
    let pitch = view_state.pitch ?? 0
    let south_rad: number
    let span_lng: number
    let world_size: number
    let y_mercator_center: number
    let y_north: number
    let y_south: number
    let zoom = view_state.zoom ?? 1.2

    //Scale margin for perspective viewing frustum under 3D camera pitch and bearing
    if (pitch > 0) {
      let pitch_rad = (Math.min(80, pitch)*Math.PI)/180
      margin = margin/Math.cos(pitch_rad)
    }
    if (Math.abs(bearing) > 0.5)
      margin *= 1.25

    //World scale in pixels at zoom: world_size = 512 * 2^zoom
    world_size = 512*Math.pow(2, zoom)

    //Longitude span
    half_w = (window_w/2)*margin
    span_lng = (360*half_w)/world_size

    if (span_lng >= 180) {
      west = -180
      east = 180
    } else {
      west = center_lng - span_lng
      east = center_lng + span_lng

      if (west < -180)
        west += 360
      if (east > 180)
        east -= 360
    }

    //Latitude calculation via conformal Web Mercator Gudermannian inverse
    half_h = (window_h/2)*margin
    lat_clamped = Math.max(-85.051129, Math.min(85.051129, center_lat))
    lat_rad = (lat_clamped*Math.PI)/180
    y_mercator_center = Math.log(Math.tan(Math.PI/4 + lat_rad/2))

    //Pixel delta to Mercator radian delta
    delta_y_mercator = (2*Math.PI*half_h)/world_size

    y_north = y_mercator_center + delta_y_mercator
    y_south = y_mercator_center - delta_y_mercator

    //Invert Web Mercator Y to latitude degrees
    if (y_north >= Math.PI) {
      north = 90
    } else {
      north_rad = 2*Math.atan(Math.exp(y_north)) - Math.PI/2
      north = Math.min(90, (north_rad*180)/Math.PI)
    }

    if (y_south <= -Math.PI) {
      south = -90
    } else {
      south_rad = 2*Math.atan(Math.exp(y_south)) - Math.PI/2
      south = Math.max(-90, (south_rad*180)/Math.PI)
    }
  }

  //Return statement
  return [west, south, east, north]
}

/**
 * Checks whether a geographic point is on the visible front hemisphere of the 3D globe.
 * Accounts for camera latitude, longitude, bearing/**
 * Tests whether a geographic coordinate is visible on the current Globe viewport, taking into account
 * camera center, bearing rotation, and pitch tilt angles.
 *
 * @param {number} arg0_lng
 * @param {number} arg1_lat
 * @param {any} arg2_view_state
 * @param {number} [arg3_min_cosine=-0.005]
 * @param {any} [arg4_viewport]
 *
 * @returns {boolean}
 */
export function isGlobePointVisible (
  arg0_lng: number,
  arg1_lat: number,
  arg2_view_state: any,
  arg3_min_cosine?: number,
  arg4_viewport?: any
): boolean {
  //Convert from parameters
  let lat = arg1_lat
  let lng = arg0_lng
  let min_cosine = (arg3_min_cosine !== undefined) ? arg3_min_cosine : -0.005
  let view_state = (arg2_view_state) ? arg2_view_state : {}
  let viewport = arg4_viewport

  //Guard clauses
  if (!view_state)
    return true

  //Declare local instance variables
  let cam_len: number
  let cam_norm: [number, number, number]
  let cam_pos: [number, number, number]
  let cos_phi: number
  let dot_prod: number
  let horizon_dot: number
  let lambda: number
  let phi: number
  let px: number
  let py: number
  let pz: number
  let v_globe_dot: number
  let vp = viewport

  //Function body
  if (!vp) {
    let bearing = view_state.bearing ?? 0
    let c_lat = view_state.latitude ?? 20
    let c_lng = view_state.longitude ?? 0
    let pitch = view_state.pitch ?? 0
    let zoom = view_state.zoom ?? 3

    vp = new SmoothGlobeViewport({
      bearing,
      height: 1080,
      latitude: c_lat,
      longitude: c_lng,
      pitch,
      width: 1920,
      zoom,
    })
  }

  cam_pos = vp.cameraPosition
  cam_len = Math.hypot(cam_pos[0], cam_pos[1], cam_pos[2])

  if (cam_len > 0.001) {
    cam_norm = [cam_pos[0]/cam_len, cam_pos[1]/cam_len, cam_pos[2]/cam_len]
    horizon_dot = 256/cam_len

    lambda = (lng*Math.PI)/180
    phi = (lat*Math.PI)/180
    cos_phi = Math.cos(phi)

    px = Math.sin(lambda)*cos_phi
    py = -Math.cos(lambda)*cos_phi
    pz = Math.sin(phi)

    dot_prod = px*cam_norm[0] + py*cam_norm[1] + pz*cam_norm[2]
    v_globe_dot = dot_prod - horizon_dot
  } else {
    v_globe_dot = 1.0
  }

  //Return statement
  return (v_globe_dot >= min_cosine)
}

/**
 * Projects a geographic point to 2D screen coordinates under Globe projection with camera rotation.
 *
 * @param {number} arg0_lng
 * @param {number} arg1_lat
 * @param {any} arg2_view_state
 * @param {number} arg3_window_w
 * @param {number} arg4_window_h
 * @param {any} [arg5_viewport]
 *
 * @returns {{ dot: number; is_visible: boolean; sx: number; sy: number }}
 */
export function projectGlobeCoordinates (
  arg0_lng: number,
  arg1_lat: number,
  arg2_view_state: any,
  arg3_window_w: number,
  arg4_window_h: number,
  arg5_viewport?: any
): { dot: number; is_visible: boolean; sx: number; sy: number } {
  //Convert from parameters
  let lat = arg1_lat
  let lng = arg0_lng
  let view_state = arg2_view_state
  let viewport = arg5_viewport
  let window_h = arg4_window_h
  let window_w = arg3_window_w

  //Declare local instance variables
  let cam_len: number
  let cam_norm: [number, number, number]
  let cam_pos: [number, number, number]
  let coords: [number, number]
  let cos_phi: number
  let dot_prod: number
  let horizon_dot: number
  let is_visible: boolean
  let lambda: number
  let phi: number
  let px: number
  let py: number
  let pz: number
  let sx: number
  let sy: number
  let v_globe_dot: number
  let vp = viewport

  //Function body
  if (!vp) {
    let bearing = view_state?.bearing ?? 0
    let c_lat = view_state?.latitude ?? 20
    let c_lng = view_state?.longitude ?? 0
    let pitch = view_state?.pitch ?? 0
    let zoom = view_state?.zoom ?? 3

    vp = new SmoothGlobeViewport({
      bearing,
      height: window_h,
      latitude: c_lat,
      longitude: c_lng,
      pitch,
      width: window_w,
      zoom,
    })
  }

  cam_pos = vp.cameraPosition
  cam_len = Math.hypot(cam_pos[0], cam_pos[1], cam_pos[2])

  if (cam_len > 0.001) {
    cam_norm = [cam_pos[0]/cam_len, cam_pos[1]/cam_len, cam_pos[2]/cam_len]
    horizon_dot = 256/cam_len

    lambda = (lng*Math.PI)/180
    phi = (lat*Math.PI)/180
    cos_phi = Math.cos(phi)

    px = Math.sin(lambda)*cos_phi
    py = -Math.cos(lambda)*cos_phi
    pz = Math.sin(phi)

    dot_prod = px*cam_norm[0] + py*cam_norm[1] + pz*cam_norm[2]
    v_globe_dot = dot_prod - horizon_dot
  } else {
    v_globe_dot = 1.0
  }

  is_visible = (v_globe_dot >= -0.005)

  if (!is_visible)
    return { dot: v_globe_dot, is_visible: false, sx: -9999, sy: -9999 }

  coords = vp.project([lng, lat])
  sx = coords[0]
  sy = coords[1]

  //Return statement
  return { dot: v_globe_dot, is_visible, sx, sy }
}

/**
 * Projects a geographic point to 2D screen coordinates under Web Mercator projection with 3D camera pitch and bearing.
 * Implements Deck.gl's perspective camera model to properly detect screen position and frustum visibility.
 *
 * @param {number} arg0_lng
 * @param {number} arg1_lat
 * @param {any} arg2_view_state
 * @param {number} arg3_window_w
 * @param {number} arg4_window_h
 *
 * @returns {{ is_visible: boolean; sx: number; sy: number }}
 */
export function projectMercatorCoordinates (
  arg0_lng: number,
  arg1_lat: number,
  arg2_view_state: any,
  arg3_window_w: number,
  arg4_window_h: number
): { is_visible: boolean; sx: number; sy: number } {
  //Convert from parameters
  let lat = arg1_lat
  let lng = arg0_lng
  let view_state = arg2_view_state
  let window_h = arg4_window_h
  let window_w = arg3_window_w

  //Declare local instance variables
  let altitude: number
  let bearing = view_state?.bearing ?? 0
  let bearing_rad = (bearing*Math.PI)/180
  let c_lat = view_state?.latitude ?? 20
  let c_lat_clamped: number
  let c_lat_rad: number
  let c_lng = view_state?.longitude ?? 0
  let c_x: number
  let c_y: number
  let cos_b: number
  let cos_p: number
  let d: number
  let dx: number
  let dy: number
  let is_visible: boolean
  let lat_clamped: number
  let lat_rad: number
  let p_x: number
  let p_y: number
  let pitch = Math.max(0, Math.min(85, view_state?.pitch ?? 0))
  let pitch_rad = (pitch*Math.PI)/180
  let sin_b: number
  let sin_p: number
  let sx: number
  let sy: number
  let world_size: number
  let x_rot: number
  let y_rot: number
  let z_cam: number
  let zoom = view_state?.zoom ?? 1.2

  //Guard clauses
  if (!view_state)
    return { is_visible: false, sx: 0, sy: 0 }

  //Function body
  world_size = 512*Math.pow(2, zoom)

  //1. Projected world coordinates (Web Mercator)
  p_x = ((lng + 180)/360)*world_size
  lat_clamped = Math.max(-85.051129, Math.min(85.051129, lat))
  lat_rad = (lat_clamped*Math.PI)/180
  p_y = ((1 - Math.log(Math.tan(Math.PI/4 + lat_rad/2))/Math.PI)/2)*world_size

  c_x = ((c_lng + 180)/360)*world_size
  c_lat_clamped = Math.max(-85.051129, Math.min(85.051129, c_lat))
  c_lat_rad = (c_lat_clamped*Math.PI)/180
  c_y = ((1 - Math.log(Math.tan(Math.PI/4 + c_lat_rad/2))/Math.PI)/2)*world_size

  dx = p_x - c_x
  if (dx > world_size/2)
    dx -= world_size
  if (dx < -world_size/2)
    dx += world_size
  dy = p_y - c_y

  //2. Camera rotation (bearing)
  cos_b = Math.cos(bearing_rad)
  sin_b = Math.sin(bearing_rad)
  x_rot = dx*cos_b - dy*sin_b
  y_rot = dx*sin_b + dy*cos_b

  //3. Perspective projection with pitch
  altitude = 1.5
  d = altitude*window_h
  cos_p = Math.cos(pitch_rad)
  sin_p = Math.sin(pitch_rad)

  z_cam = d - y_rot*sin_p

  //Behind camera or beyond vanishing horizon
  if (z_cam <= 1.0)
    return { is_visible: false, sx: -9999, sy: -9999 }

  sx = window_w/2 + (x_rot*d)/z_cam
  sy = window_h/2 + (y_rot*cos_p*d)/z_cam
  is_visible = true

  //Return statement
  return { is_visible, sx, sy }
}

