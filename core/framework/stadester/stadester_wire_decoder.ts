import type { CityPoint } from '../geopng/types.ts'
import {
  normalizeCapitalNameStem,
  normalizePrimaryCityKey,
} from './city_metadata_framework.ts'

export interface CompactBorderFeature {
  area?: number
  bbox?: number[]
  cap_coords?: [number, number]
  capkey?: string
  caplat?: number
  caplong?: number
  capname?: string
  color?: string
  geometry?: any
  id?: number | string
  is_acapital?: boolean
  name?: string
  name_long?: string
  state_id?: number | string
}

export interface BorderLookup {
  acapital_state_ids: Set<string>
  active_capitals_by_key: Map<string, any>
  active_capitals_by_name: Map<string, any>
  active_capitals_list: any[]
  active_polity_names: Set<string>
  active_state_capitals_by_sid: Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>
  active_state_ids: Set<string>
  polity_features: {
    by_name: Map<string, any>
    by_sid: Map<string, any>
  }
}

let NON_ASCII_RE = /[^\u0020-\u007E]/
let text_decoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null


/**
 * Combines viewport-queried cities with the global base list up to `max_cities`, deduplicating by key.
 *
 * @param {CityPoint[]} arg0_viewport_cities
 * @param {CityPoint[]} arg1_base_cities
 * @param {number} arg2_max_cities
 *
 * @returns {CityPoint[]}
 */
export function buildCappedViewportCities<T extends { key: string }> (
  arg0_viewport_cities: T[],
  arg1_base_cities: T[],
  arg2_max_cities: number
): T[] {
  //Convert from parameters
  let base_cities = arg1_base_cities
  let max_cities = arg2_max_cities
  let viewport_cities = arg0_viewport_cities

  //Declare local instance variables
  let out: T[] = []
  let seen = new Set<string>()

  //Function body
  for (let i = 0; i < viewport_cities.length; i++) {
    let c = viewport_cities[i]
    if (c && !seen.has(c.key)) {
      seen.add(c.key)
      out.push(c)
      if (max_cities > 0 && out.length >= max_cities)
        break
    }
  }

  if (max_cities <= 0 || out.length < max_cities) {
    for (let i = 0; i < base_cities.length; i++) {
      let c = base_cities[i]
      if (c && !seen.has(c.key)) {
        seen.add(c.key)
        out.push(c)
        if (max_cities > 0 && out.length >= max_cities)
          break
      }
    }
  }

  //Return statement
  return out
}


/**
 * Builds indexed polity and capital lookup structures from either raw GeoJSON features
 * or pre-extracted `CompactBorderFeature` entries.
 *
 * @param {any[] | undefined} arg0_features
 *
 * @returns {BorderLookup}
 */
export function buildBorderLookup (arg0_features?: any[]): BorderLookup {
  //Convert from parameters
  let features = arg0_features

  //Declare local instance variables
  let acapital_state_ids = new Set<string>()
  let active_capitals_by_key = new Map<string, any>()
  let active_capitals_by_name = new Map<string, any>()
  let active_capitals_list: any[] = []
  let active_polity_names = new Set<string>()
  let active_state_capitals_by_sid = new Map<string, { cap_coords?: [number, number]; capkey?: string; capname?: string }>()
  let active_state_ids = new Set<string>()
  let polity_features_by_name = new Map<string, any>()
  let polity_features_by_sid = new Map<string, any>()

  //Guard clauses
  if (!features || features.length === 0) {
    return {
      acapital_state_ids,
      active_capitals_by_key,
      active_capitals_by_name,
      active_capitals_list,
      active_polity_names,
      active_state_capitals_by_sid,
      active_state_ids,
      polity_features: {
        by_name: polity_features_by_name,
        by_sid: polity_features_by_sid,
      },
    }
  }

  //Function body
  for (let i = 0; i < features.length; i++) {
    let feat = features[i]
    if (!feat)
      continue
    let p = feat.properties || feat
    if (!p)
      continue

    let polity_color = p.color ||
      p.polygonFill ||
      p.symbol?.polygonFill ||
      p.fill_color ||
      p.fillColor ||
      p.symbol?.fillColor ||
      p.symbol?.strokeColor ||
      p.strokeColor
    let s_id = p.state_id !== undefined ? String(p.state_id) : (p.id !== undefined ? String(p.id) : undefined)
    let feat_bbox = feat.bbox || p.bbox
    let feat_area = p.area !== undefined ? Number(p.area) : 0
    if (!feat_area && feat_bbox && Array.isArray(feat_bbox) && feat_bbox.length >= 4)
      feat_area = Math.max(0, (feat_bbox[2] - feat_bbox[0])*(feat_bbox[3] - feat_bbox[1]))

    let feat_meta = {
      area: feat_area,
      bbox: feat_bbox,
      color: polity_color,
      geometry: feat.geometry,
      polity_name: p.name,
      state_id: p.state_id ?? p.id,
    }

    if (s_id) {
      active_state_ids.add(s_id)
      if (!polity_features_by_sid.has(s_id) || feat_area > (polity_features_by_sid.get(s_id)?.area || 0))
        polity_features_by_sid.set(s_id, feat_meta)
    }
    if (p.state_id !== undefined) {
      let raw_sid = String(p.state_id)
      active_state_ids.add(raw_sid)
      if (!polity_features_by_sid.has(raw_sid) || feat_area > (polity_features_by_sid.get(raw_sid)?.area || 0))
        polity_features_by_sid.set(raw_sid, feat_meta)
    }
    if (p.id !== undefined) {
      let raw_id = String(p.id)
      active_state_ids.add(raw_id)
      if (!polity_features_by_sid.has(raw_id) || feat_area > (polity_features_by_sid.get(raw_id)?.area || 0))
        polity_features_by_sid.set(raw_id, feat_meta)
    }
    if (p.name) {
      let nl = String(p.name).toLowerCase().trim()
      active_polity_names.add(nl)
      if (!polity_features_by_name.has(nl) || feat_area > (polity_features_by_name.get(nl)?.area || 0))
        polity_features_by_name.set(nl, feat_meta)
    }
    if (p.name_long) {
      let nll = String(p.name_long).toLowerCase().trim()
      active_polity_names.add(nll)
      if (!polity_features_by_name.has(nll) || feat_area > (polity_features_by_name.get(nll)?.area || 0))
        polity_features_by_name.set(nll, feat_meta)
    }

    if (p.is_acapital) {
      if (s_id)
        acapital_state_ids.add(s_id)
    } else if (p.capname || p.capkey || p.cap_coords || (p.caplong !== undefined && p.caplat !== undefined)) {
      let cap_lat: number | undefined
      let cap_lon: number | undefined
      if (p.cap_coords && Array.isArray(p.cap_coords) && p.cap_coords.length >= 2) {
        cap_lon = p.cap_coords[0]
        cap_lat = p.cap_coords[1]
      } else if (p.caplong !== undefined && p.caplat !== undefined) {
        cap_lon = Number(p.caplong)
        cap_lat = Number(p.caplat)
      }

      let cap_entry = {
        area: feat_area,
        bbox: feat_bbox,
        cap_coords: (cap_lon !== undefined && cap_lat !== undefined) ? [cap_lon, cap_lat] as [number, number] : undefined,
        capkey: p.capkey,
        capname: p.capname,
        color: polity_color,
        geometry: feat.geometry,
        polity_name: p.name,
        state_id: p.state_id,
      }

      active_capitals_list.push(cap_entry)

      if (s_id)
        active_state_capitals_by_sid.set(s_id, {
          cap_coords: cap_entry.cap_coords,
          capkey: p.capkey,
          capname: p.capname,
        })

      if (p.capkey) {
        let existing_k = active_capitals_by_key.get(p.capkey)
        let prim_k = normalizePrimaryCityKey(p.capkey)
        if (!existing_k || (cap_entry.area > (existing_k.area || 0))) {
          active_capitals_by_key.set(p.capkey, cap_entry)
          active_capitals_by_key.set(p.capkey.toLowerCase().trim(), cap_entry)
          if (prim_k)
            active_capitals_by_key.set(prim_k, cap_entry)
        }
      }
      if (p.capname) {
        let names = String(p.capname).split(/[,/]/).map((arg0_s: string) => arg0_s.trim().toLowerCase()).filter(Boolean)
        for (let x = 0; x < names.length; x++) {
          let nm = names[x]
          let existing_n = active_capitals_by_name.get(nm)
          if (!existing_n || (cap_entry.area > (existing_n.area || 0))) {
            active_capitals_by_name.set(nm, cap_entry)
            let n_nfd = NON_ASCII_RE.test(nm) ? nm.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : nm
            let n_clean = n_nfd.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
            let n_stem = normalizeCapitalNameStem(nm)
            if (n_clean)
              active_capitals_by_name.set(n_clean, cap_entry)
            if (n_stem)
              active_capitals_by_name.set(n_stem, cap_entry)
          }
        }
      }
    }
  }

  //Return statement
  return {
    acapital_state_ids,
    active_capitals_by_key,
    active_capitals_by_name,
    active_capitals_list,
    active_polity_names,
    active_state_capitals_by_sid,
    active_state_ids,
    polity_features: {
      by_name: polity_features_by_name,
      by_sid: polity_features_by_sid,
    },
  }
}


/**
 * Extracts minimal serialisable border feature payloads for postMessage transfer to the Stadestér Web Worker.
 *
 * @param {any} arg0_borders_data
 *
 * @returns {CompactBorderFeature[]}
 */
export function extractCompactBorderFeatures (arg0_borders_data: any): CompactBorderFeature[] {
  //Convert from parameters
  let borders_data = arg0_borders_data

  //Guard clauses
  if (!borders_data || !Array.isArray(borders_data.features) || borders_data.features.length === 0)
    return []

  //Declare local instance variables
  let features = borders_data.features
  let out: CompactBorderFeature[] = new Array(features.length)

  //Function body
  for (let i = 0; i < features.length; i++) {
    let feat = features[i]
    let p = feat?.properties || {}
    let polity_color = p.polygonFill ||
      p.symbol?.polygonFill ||
      p.fill_color ||
      p.fillColor ||
      p.color ||
      p.symbol?.fillColor ||
      p.symbol?.strokeColor ||
      p.strokeColor

    out[i] = {
      area: p.area !== undefined ? Number(p.area) : undefined,
      bbox: feat?.bbox || p.bbox,
      cap_coords: (Array.isArray(p.cap_coords) && p.cap_coords.length >= 2)
        ? [Number(p.cap_coords[0]), Number(p.cap_coords[1])]
        : undefined,
      capkey: p.capkey,
      caplat: p.caplat !== undefined ? Number(p.caplat) : undefined,
      caplong: p.caplong !== undefined ? Number(p.caplong) : undefined,
      capname: p.capname,
      color: polity_color,
      geometry: feat?.geometry,
      id: p.id,
      is_acapital: Boolean(p.is_acapital),
      name: p.name,
      name_long: p.name_long,
      state_id: p.state_id,
    }
  }

  //Return statement
  return out
}


/**
 * Unpacks a `STADWIRE` binary columnar response Buffer into `CityPoint[]`.
 *
 * @param {ArrayBuffer} arg0_buffer
 *
 * @returns {CityPoint[] | null}
 */
export function decodeBinaryCitiesWire (arg0_buffer: ArrayBuffer): CityPoint[] | null {
  //Convert from parameters
  let buffer = arg0_buffer

  //Guard clauses
  if (!buffer || buffer.byteLength < 16)
    return null

  //Declare local instance variables
  let view = new DataView(buffer)
  let magic = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
    view.getUint8(4), view.getUint8(5), view.getUint8(6), view.getUint8(7)
  )

  if (magic !== 'STADWIRE')
    return null

  //Function body
  let count = view.getUint32(8, true)
  let tail_len = view.getUint32(12, true)
  let offset = 16
  let coords = new Float32Array(buffer, offset, count*2)
  offset += count*8
  let pops = new Float32Array(buffer, offset, count)
  offset += count*4
  let growth = new Float32Array(buffer, offset, count)
  offset += count*4
  let capitals = new Uint8Array(buffer, offset, count)
  offset += count
  let state_ids_offset = offset
  offset += count*4

  let tail_bytes = new Uint8Array(buffer, offset, tail_len)
  let tail_str = text_decoder ? text_decoder.decode(tail_bytes) : ''
  let strings_obj = JSON.parse(tail_str)
  let city_list: CityPoint[] = []

  for (let i = 0; i < count; i++) {
    if (pops[i] < 0.01)
      continue
    let is_cap = Boolean(capitals[i])
    let raw_sid = view.getInt32(state_ids_offset + i*4, true)
    let cap_state_id = raw_sid !== -1 ? raw_sid : undefined
    let cap_color = strings_obj.capital_colors ? strings_obj.capital_colors[i] : undefined
    let cap_name = strings_obj.capital_names ? (strings_obj.capital_names[i] || undefined) : undefined

    city_list.push({
      capitalColor: cap_color,
      capitalOf: cap_name,
      capitalStateId: cap_state_id,
      capital_color: cap_color,
      capital_state_id: cap_state_id,
      capital_state_name: cap_name,
      coords: [coords[i*2], coords[i*2 + 1]],
      country: strings_obj.countries ? strings_obj.countries[i] : undefined,
      growthRate: growth[i],
      id: strings_obj.keys[i],
      isCapital: is_cap,
      is_capital: is_cap,
      key: strings_obj.keys[i],
      name: strings_obj.names[i],
      other_names: (strings_obj.other_names && strings_obj.other_names[i]) ? strings_obj.other_names[i] : undefined,
      population: pops[i],
      region: strings_obj.regions ? strings_obj.regions[i] : undefined,
    })
  }

  //Return statement
  return city_list
}


/**
 * Computes longitudinal span in degrees for a bounding box, accounting for antimeridian wrap.
 *
 * @param {number} arg0_west
 * @param {number} arg1_east
 *
 * @returns {number}
 */
export function getBBoxLonSpan (arg0_west: number, arg1_east: number): number {
  //Convert from parameters
  let east = arg1_east
  let west = arg0_west

  //Return statement
  return (west <= east) ? (east - west) : ((180 - west) + (east + 180))
}


/**
 * Returns whether an inner geographic bounding box is completely contained inside an outer bounding box.
 *
 * @param {[number, number, number, number]} arg0_inner
 * @param {[number, number, number, number]} arg1_outer
 *
 * @returns {boolean}
 */
export function isGeoBBoxContained (
  arg0_inner: [number, number, number, number],
  arg1_outer: [number, number, number, number]
): boolean {
  //Convert from parameters
  let inner = arg0_inner
  let outer = arg1_outer

  //Guard clauses
  if (inner[1] < outer[1] - 1e-6 || inner[3] > outer[3] + 1e-6)
    return false

  //Declare local instance variables
  let inner_span: number
  let outer_span: number
  let rel_w: number

  //Function body
  if (outer[0] <= -179.999 && outer[2] >= 179.999)
    return true

  outer_span = getBBoxLonSpan(outer[0], outer[2])
  inner_span = getBBoxLonSpan(inner[0], inner[2])
  rel_w = (((inner[0] - outer[0])%360) + 360)%360

  //Return statement
  return rel_w + inner_span <= outer_span + 1e-6
}


/**
 * Scales a geographic bounding box `[west, south, east, north]` around its midpoint while handling antimeridian wrapping.
 *
 * @param {[number, number, number, number]} arg0_bbox
 * @param {number} arg1_scale
 *
 * @returns {[number, number, number, number]}
 */
export function scaleGeoBBox (
  arg0_bbox: [number, number, number, number],
  arg1_scale: number
): [number, number, number, number] {
  //Convert from parameters
  let bbox = arg0_bbox
  let scale = arg1_scale

  //Declare local instance variables
  let east: number
  let lat_span = bbox[3] - bbox[1]
  let lon_span = getBBoxLonSpan(bbox[0], bbox[2])
  let mid_lat = (bbox[1] + bbox[3])/2
  let mid_lon = bbox[0] + lon_span/2
  let new_half_lat = (lat_span*scale)/2
  let new_half_lon = (lon_span*scale)/2
  let north = Math.min(90, mid_lat + new_half_lat)
  let south = Math.max(-90, mid_lat - new_half_lat)
  let west: number

  //Function body
  if (mid_lon > 180)
    mid_lon -= 360

  if (new_half_lon >= 180) {
    east = 180
    west = -180
  } else {
    west = mid_lon - new_half_lon
    east = mid_lon + new_half_lon
    if (west < -180)
      west += 360
    if (east > 180)
      east -= 360
  }

  //Return statement
  return [west, south, east, north]
}
