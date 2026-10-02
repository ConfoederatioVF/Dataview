import { CountryFeature } from './polygon_binning.ts'
import { UfDate, UfDateObject } from '../utils/uf_date.ts'

export interface NaissanceEntityHistoryItem {
  feature?: {
    geometry?: any
    properties?: any
    type?: string
  }
  geometry?: any
  type?: string
  coordinates?: any
}

export interface NaissanceEntityRecord {
  class_name: string
  id: string
  keyframes: Map<number, [any, any, any]>
  max_ts: number
  min_ts: number
  name?: string
  sorted_timestamps: number[]
}

export interface CustomVectorDataset {
  entities?: Map<string, NaissanceEntityRecord>
  features?: CountryFeature[]
  fileName: string
  fileType: 'geojson' | 'naissance'
  format?: 'geojson' | 'naissance'
  is_temporal?: boolean
  maxYear?: number
  minYear?: number
  totalCount: number
}

/**
 * Parses arbitrary date string, year number, or minute timestamp into a standard continuous timestamp.
 *
 * @param {any} arg0_val
 *
 * @returns {number}
 */
export let parseDateStringToTimestamp = function (arg0_val: any): number {
  //Convert from parameters
  let val = arg0_val

  //Guard clauses
  if (typeof val === 'number') {
    if (Math.abs(val) <= 10000)
      return UfDate.getTimestamp({ day: 1, hour: 0, minute: 0, month: 1, year: Math.round(val) })
    return val
  }

  //Declare local instance variables
  let str = String(val || '').trim()

  //Function body
  if (str.includes('-')) {
    let parts = str.split('-').map(Number)
    let yr = parts[0] || 0
    let mo = parts.length > 1 ? parts[1] || 1 : 1
    let da = parts.length > 2 ? parts[2] || 1 : 1
    return UfDate.getTimestamp({ day: da, hour: 0, minute: 0, month: mo, year: yr })
  }

  let yr_num = parseFloat(str)
  if (!Number.isNaN(yr_num))
    return UfDate.getTimestamp({ day: 1, hour: 0, minute: 0, month: 1, year: Math.round(yr_num) })

  //Return statement
  return 0
}

/**
 * Normalises arbitrary GeoJSON geometry objects or coordinates into valid Polygon or MultiPolygon geometry.
 *
 * @param {any} arg0_geom
 *
 * @returns {any | null}
 */
export let normaliseGeometry = function (arg0_geom: any): any | null {
  //Convert from parameters
  let geom = arg0_geom

  //Guard clauses
  if (!geom)
    return null

  //Function body
  if (geom.feature && geom.feature.geometry)
    geom = geom.feature.geometry
  else if (geom.geometry)
    geom = geom.geometry

  if (!geom || !geom.coordinates || !geom.type)
    return null

  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')
    return null

  //Return statement
  return {
    coordinates: geom.coordinates,
    type: geom.type,
  }
}

/**
 * Parses raw JSON string content representing either a GeoJSON collection or a Svea .naissance file.
 *
 * @param {string} arg0_text - Raw file text content
 * @param {string} arg1_file_name - Name of the uploaded file
 *
 * @returns {CustomVectorDataset}
 */
export let parseCustomVectorText = function (
  arg0_text: string,
  arg1_file_name: string
): CustomVectorDataset {
  //Convert from parameters
  let file_name = arg1_file_name
  let text = arg0_text

  //Declare local instance variables
  let entities = new Map<string, NaissanceEntityRecord>()
  let features: CountryFeature[] = []
  let is_naissance = file_name.toLowerCase().endsWith('.naissance')
  let max_year = -Infinity
  let min_year = Infinity
  let parsed_json: any

  //Function body
  try {
    parsed_json = JSON.parse(text)
  } catch (arg0_err) {
    console.error('[CustomVectorService] Failed to parse JSON text:', arg0_err)
    return {
      fileName: file_name,
      fileType: is_naissance ? 'naissance' : 'geojson',
      format: is_naissance ? 'naissance' : 'geojson',
      is_temporal: is_naissance,
      totalCount: 0,
    }
  }

  let has_feature_keyframes = Boolean(
    parsed_json &&
    Array.isArray(parsed_json.features) &&
    parsed_json.features.some((arg0_f: any) => Boolean(arg0_f && (arg0_f.keyframes || arg0_f.history)))
  )
  let is_naissance_type = Boolean(
    parsed_json &&
    typeof parsed_json.type === 'string' &&
    parsed_json.type.toLowerCase().includes('naissance')
  )
  let is_svea_dict = Boolean(
    parsed_json &&
    typeof parsed_json === 'object' &&
    !parsed_json.type &&
    !parsed_json.features
  )

  //1. Handle Naissance format (both Svea dictionary and FeatureCollection with keyframes)
  if (is_naissance || is_naissance_type || has_feature_keyframes || is_svea_dict) {
    if (parsed_json && Array.isArray(parsed_json.features)) {
      //FeatureCollection with keyframes
      let raw_list = parsed_json.features
      for (let i = 0; i < raw_list.length; i++) {
        let feat = raw_list[i]
        if (!feat)
          continue
        let feat_id = String(feat.id || `naissance_feat_${i}`)
        let raw_kfs = Array.isArray(feat.keyframes) ? feat.keyframes : []
        if (raw_kfs.length === 0)
          continue

        let kf_items: { ts: number; val: [any, any, any] }[] = []
        for (let x = 0; x < raw_kfs.length; x++) {
          let kf = raw_kfs[x]
          let raw_date = kf.date ?? kf.year ?? kf.timestamp ?? kf.time
          let ts = parseDateStringToTimestamp(raw_date)
          let geom = kf.geometry || (Array.isArray(kf) ? kf[0] : null)
          let symbol = kf.symbol || (Array.isArray(kf) ? kf[1] : {}) || {}
          let props = kf.properties || (Array.isArray(kf) ? kf[2] : {}) || {}
          kf_items.push({ ts, val: [geom, symbol, props] })
        }

        if (feat.demise || feat.demise_date || feat.end_year) {
          let demise_ts = parseDateStringToTimestamp(feat.demise || feat.demise_date || feat.end_year)
          kf_items.push({ ts: demise_ts, val: [null, {}, { hidden: true }] })
        }

        kf_items.sort((arg0_a, arg0_b) => arg0_a.ts - arg0_b.ts)
        let sorted_ts = kf_items.map((arg0_it) => arg0_it.ts)
        let kf_map = new Map<number, [any, any, any]>()
        for (let x = 0; x < kf_items.length; x++) {
          kf_map.set(kf_items[x].ts, kf_items[x].val)
        }

        let start_date = UfDate.convertTimestampToDate(sorted_ts[0])
        let end_date = UfDate.convertTimestampToDate(sorted_ts[sorted_ts.length - 1])
        if (start_date.year < min_year)
          min_year = start_date.year
        if (end_date.year > max_year)
          max_year = end_date.year

        entities.set(feat_id, {
          class_name: 'GeometryPolygon',
          id: feat_id,
          keyframes: kf_map,
          max_ts: sorted_ts[sorted_ts.length - 1],
          min_ts: sorted_ts[0],
          name: feat.name || feat.properties?.name,
          sorted_timestamps: sorted_ts,
        })
      }
    } else {
      //Native Svea dictionary format
      let keys = Object.keys(parsed_json)
      for (let i = 0; i < keys.length; i++) {
        let ent_id = keys[i]
        if (ent_id === 'map_settings')
          continue

        let ent = parsed_json[ent_id]
        if (!ent || ent.class_name !== 'GeometryPolygon' || !ent.history)
          continue

        let raw_ts_keys = Object.keys(ent.history)
        if (raw_ts_keys.length === 0)
          continue

        let sorted_ts = raw_ts_keys.map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
        let kf_map = new Map<number, [any, any, any]>()

        for (let x = 0; x < sorted_ts.length; x++) {
          let ts = sorted_ts[x]
          let val = ent.history[String(ts)]
          if (Array.isArray(val))
            kf_map.set(ts, val as [any, any, any])
        }

        let start_date = UfDate.convertTimestampToDate(sorted_ts[0])
        let end_date = UfDate.convertTimestampToDate(sorted_ts[sorted_ts.length - 1])
        if (start_date.year < min_year)
          min_year = start_date.year
        if (end_date.year > max_year)
          max_year = end_date.year

        entities.set(ent_id, {
          class_name: ent.class_name,
          id: ent_id,
          keyframes: kf_map,
          max_ts: sorted_ts[sorted_ts.length - 1],
          min_ts: sorted_ts[0],
          name: ent.name,
          sorted_timestamps: sorted_ts,
        })
      }
    }

    //Return statement
    return {
      entities,
      fileName: file_name,
      fileType: 'naissance',
      format: 'naissance',
      is_temporal: true,
      maxYear: Number.isFinite(max_year) ? max_year : undefined,
      minYear: Number.isFinite(min_year) ? min_year : undefined,
      totalCount: entities.size,
    }
  }

  //2. Handle GeoJSON format
  let raw_features: any[] = []
  if (parsed_json.type === 'FeatureCollection' && Array.isArray(parsed_json.features)) {
    raw_features = parsed_json.features
  } else if (parsed_json.type === 'Feature') {
    raw_features = [parsed_json]
  } else if (Array.isArray(parsed_json)) {
    raw_features = parsed_json
  }

  for (let i = 0; i < raw_features.length; i++) {
    let f = raw_features[i]
    if (!f || !f.geometry)
      continue

    let valid_geom = normaliseGeometry(f.geometry)
    if (!valid_geom)
      continue

    let feat_id = String(f.id || f.properties?.id || f.properties?.name || `custom_${i}`)
    let feat_name = f.properties?.name || f.properties?.name_long || f.properties?.NAME || `Polygon ${i + 1}`

    features.push({
      bbox: f.bbox,
      geometry: valid_geom,
      id: feat_id,
      properties: {
        ...f.properties,
        id: feat_id,
        is_custom: true,
        name: feat_name,
      },
      type: 'Feature',
    } as CountryFeature)
  }

  //Return statement
  return {
    features,
    fileName: file_name,
    fileType: 'geojson',
    format: 'geojson',
    is_temporal: false,
    totalCount: features.length,
  }
}

/**
 * Slices a custom vector dataset at a specific timeline year and returns an array of GeoJSON CountryFeatures.
 * For GeoJSON datasets, returns the constant static features.
 * For Naissance datasets, computes the temporally active geometry and properties at target timestamp.
 *
 * @param {CustomVectorDataset | null} arg0_dataset
 * @param {number} arg1_timeline_year
 * @param {number} [arg2_month]
 * @param {number} [arg3_day]
 *
 * @returns {CountryFeature[]}
 */
export let sliceCustomVectorDataset = function (
  arg0_dataset: CustomVectorDataset | null,
  arg1_timeline_year: number,
  arg2_month?: number,
  arg3_day?: number
): CountryFeature[] {
  //Convert from parameters
  let dataset = arg0_dataset
  let day = arg3_day
  let month = arg2_month
  let timeline_year = arg1_timeline_year

  //Guard clauses
  if (!dataset)
    return []

  if (dataset.fileType === 'geojson')
    return dataset.features || []

  if (!dataset.entities || dataset.entities.size === 0)
    return []

  //Declare local instance variables
  let active_features: CountryFeature[] = []
  let target_date_obj: UfDateObject
  let target_ts: number

  //Function body
  if (day !== undefined && month !== undefined) {
    target_date_obj = {
      day,
      hour: 0,
      minute: 0,
      month,
      year: (timeline_year < 0 ? Math.ceil(timeline_year) : Math.floor(timeline_year)),
    }
  } else if (timeline_year !== Math.floor(timeline_year)) {
    target_date_obj = UfDate.fromFractionalYear(timeline_year)
  } else {
    target_date_obj = {
      day: 1,
      hour: 0,
      minute: 0,
      month: 1,
      year: timeline_year,
    }
  }

  target_ts = UfDate.getTimestamp(target_date_obj)

  for (let [ent_id, ent] of dataset.entities.entries()) {
    //Check whether entity exists at or before target timestamp
    if (ent.min_ts > target_ts)
      continue

    let current_geom: any = null
    let current_props: Record<string, any> = {}
    let current_symbol: Record<string, any> = {}

    for (let i = 0; i < ent.sorted_timestamps.length; i++) {
      let ts = ent.sorted_timestamps[i]
      if (ts > target_ts)
        break

      let kf = ent.keyframes.get(ts)
      if (!kf)
        continue

      if (kf[0] !== undefined)
        current_geom = kf[0]
      if (kf[1] !== undefined && typeof kf[1] === 'object' && kf[1] !== null)
        current_symbol = { ...current_symbol, ...kf[1] }
      if (kf[2] !== undefined && typeof kf[2] === 'object' && kf[2] !== null)
        current_props = { ...current_props, ...kf[2] }
    }

    if (current_props.hidden === true || !current_geom)
      continue

    let valid_geom = normaliseGeometry(current_geom)
    if (!valid_geom)
      continue

    let entity_name = current_props.name || ent.name || `Entity ${ent_id}`
    let fill_color = current_symbol.polygonFill || current_symbol.fillColor || current_props.color || '#38bdf8'

    active_features.push({
      geometry: valid_geom,
      id: `custom_naissance_${ent_id}`,
      properties: {
        ...current_props,
        color: fill_color,
        date: UfDate.formatDate(target_date_obj),
        id: `custom_naissance_${ent_id}`,
        is_custom: true,
        name: String(entity_name).replace(/\n+/g, ' '),
        symbol: current_symbol,
        timestamp: target_ts,
        year: target_date_obj.year,
      },
      type: 'Feature',
    } as CountryFeature)
  }

  //Return statement
  return active_features
}
