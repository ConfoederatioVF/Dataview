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
  targetDate?: UfDateObject
  targetYear?: number
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
  let num: number
  let str = String(val || '').trim()

  //Function body
  num = Number(str)
  if (!Number.isNaN(num)) {
    if (Math.abs(num) <= 10000)
      return UfDate.getTimestamp({ day: 1, hour: 0, minute: 0, month: 1, year: Math.round(num) })
    return num
  }

  if (str.includes('-')) {
    let is_bce = str.startsWith('-')
    let clean_str = is_bce ? str.slice(1) : str
    let parts = clean_str.split('-').map(Number)
    let yr = (parts[0] || 0)*(is_bce ? -1 : 1)
    let mo = parts.length > 1 ? parts[1] || 1 : 1
    let da = parts.length > 2 ? parts[2] || 1 : 1
    return UfDate.getTimestamp({ day: da, hour: 0, minute: 0, month: mo, year: yr })
  }

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

  //Declare local instance variables
  let closeRing = function (arg0_ring: any[]): any[] {
    if (!Array.isArray(arg0_ring) || arg0_ring.length === 0)
      return arg0_ring
    let first = arg0_ring[0]
    let last = arg0_ring[arg0_ring.length - 1]
    if (first && last && (first[0] !== last[0] || first[1] !== last[1]))
      return [...arg0_ring, [first[0], first[1]]]
    return arg0_ring
  }

  //Function body
  if (geom.feature && geom.feature.geometry)
    geom = geom.feature.geometry
  else if (geom.geometry)
    geom = geom.geometry

  if (!geom || !geom.coordinates || !geom.type)
    return null

  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon')
    return null

  if (geom.type === 'Polygon') {
    return {
      coordinates: geom.coordinates.map((arg0_r: any[]) => closeRing(arg0_r)),
      type: 'Polygon',
    }
  } else if (geom.type === 'MultiPolygon') {
    return {
      coordinates: geom.coordinates.map((arg0_poly: any[][]) =>
        arg0_poly.map((arg0_r: any[]) => closeRing(arg0_r))
      ),
      type: 'MultiPolygon',
    }
  }

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
/**
 * Extracts a year, month, and day from a file name if matching standard historical date formats.
 *
 * @param {string} arg0_file_name
 *
 * @returns {{ day?: number; month?: number; year?: number }}
 */
export let extractDateFromFileName = function (
  arg0_file_name: string
): { day?: number; month?: number; year?: number } {
  //Convert from parameters
  let file_name = arg0_file_name

  //Declare local instance variables
  let m_order_quad: RegExpMatchArray | null
  let m_quad: RegExpMatchArray | null
  let m_year: RegExpMatchArray | null

  //Function body
  //1. Pattern: <order>.<year>.<month>.<day>... (e.g., 8.2026.1.1.naissance or 0.476.1.1.naissance)
  m_order_quad = file_name.match(/^(\d+)\.(-?\d+)\.(\d+)\.(\d+)/)
  if (m_order_quad) {
    return {
      day: parseInt(m_order_quad[4], 10),
      month: parseInt(m_order_quad[3], 10),
      year: parseInt(m_order_quad[2], 10),
    }
  }

  //2. Pattern: <prefix>.<year>.<month>.<day>.naissance
  m_quad = file_name.match(/(?:^|\.)(-?\d+)\.(\d+)\.(\d+)\.naissance$/i)
  if (m_quad) {
    return {
      day: parseInt(m_quad[3], 10),
      month: parseInt(m_quad[2], 10),
      year: parseInt(m_quad[1], 10),
    }
  }

  //3. Pattern: <year>.naissance or <year>.<month>.<day>.naissance
  m_year = file_name.match(/^(-?\d+)(?:\.0*(\d+))?(?:\.0*(\d+))?\.naissance$/i)
  if (m_year) {
    return {
      day: m_year[3] ? parseInt(m_year[3], 10) : 1,
      month: m_year[2] ? parseInt(m_year[2], 10) : 1,
      year: parseInt(m_year[1], 10),
    }
  }

  //Return statement
  return {}
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
  let extracted_file_date: { day?: number; month?: number; year?: number }
  let features: CountryFeature[] = []
  let has_feature_keyframes = false
  let is_naissance = file_name.toLowerCase().endsWith('.naissance')
  let is_naissance_type = false
  let is_svea_dict = false
  let max_year = -Infinity
  let min_year = Infinity
  let parsed_json: any
  let target_date: UfDateObject | undefined
  let target_year: number | undefined

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

  has_feature_keyframes = Boolean(
    parsed_json &&
    Array.isArray(parsed_json.features) &&
    parsed_json.features.some((arg0_f: any) => Boolean(arg0_f && (arg0_f.keyframes || arg0_f.history)))
  )
  is_naissance_type = Boolean(
    parsed_json &&
    typeof parsed_json.type === 'string' &&
    parsed_json.type.toLowerCase().includes('naissance')
  )
  is_svea_dict = Boolean(
    parsed_json &&
    typeof parsed_json === 'object' &&
    !parsed_json.type &&
    !parsed_json.features
  )

  //1. Handle Naissance format (both Svea dictionary and FeatureCollection with keyframes)
  if (is_naissance || is_naissance_type || has_feature_keyframes || is_svea_dict) {
    extracted_file_date = extractDateFromFileName(file_name)
    if (extracted_file_date.year !== undefined) {
      target_date = {
        day: extracted_file_date.day || 1,
        hour: 0,
        minute: 0,
        month: extracted_file_date.month || 1,
        year: extracted_file_date.year,
      }
      target_year = extracted_file_date.year
    }

    if (parsed_json && parsed_json.map_settings) {
      let raw_date = parsed_json.map_settings.date
      if (typeof raw_date === 'string') {
        try {
          raw_date = JSON.parse(raw_date)
        } catch {}
      }
      if (raw_date && typeof raw_date === 'object' && typeof raw_date.year === 'number') {
        target_date = {
          day: raw_date.day || 1,
          hour: raw_date.hour || 0,
          minute: raw_date.minute || 0,
          month: raw_date.month || 1,
          year: raw_date.year,
        }
        target_year = raw_date.year
      }
    }

    if (parsed_json && Array.isArray(parsed_json.features)) {
      //FeatureCollection with keyframes
      let raw_list = parsed_json.features
      for (let i = 0; i < raw_list.length; i++) {
        let feat = raw_list[i]
        if (!feat)
          continue
        let feat_id = String(feat.id || `naissance_feat_${i}`)
        let raw_history = feat.keyframes || feat.history
        if (typeof raw_history === 'string') {
          try {
            raw_history = JSON.parse(raw_history)
          } catch {}
        }
        let keyframes_obj = (raw_history && raw_history.keyframes) ? raw_history.keyframes : raw_history
        let raw_kfs = Array.isArray(keyframes_obj) ? keyframes_obj : Object.values(keyframes_obj || {})
        if (raw_kfs.length === 0)
          continue

        let kf_items: { ts: number; val: [any, any, any] }[] = []
        for (let x = 0; x < raw_kfs.length; x++) {
          let kf = raw_kfs[x] as any
          let raw_date = kf.date ?? kf.year ?? kf.timestamp ?? kf.time
          let ts = parseDateStringToTimestamp(raw_date)
          let raw_val = Array.isArray(kf) ? kf : kf?.value
          let geom = Array.isArray(raw_val) ? raw_val[0] : (kf.geometry || kf.feature || null)
          let symbol = Array.isArray(raw_val) ? (raw_val[1] || {}) : (kf.symbol || {})
          let props = Array.isArray(raw_val) ? (raw_val[2] || {}) : (kf.properties || {})
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

        let entity_name = feat.name || feat.properties?.name || kf_items[0].val[2]?.name || kf_items[0].val[2]?.state

        entities.set(feat_id, {
          class_name: 'GeometryPolygon',
          id: feat_id,
          keyframes: kf_map,
          max_ts: sorted_ts[sorted_ts.length - 1],
          min_ts: sorted_ts[0],
          name: String(entity_name || `Feature ${feat_id}`).replace(/\\n/g, ' ').replace(/\n+/g, ' ').trim(),
          sorted_timestamps: sorted_ts,
        })
      }
    } else {
      //Native Svea dictionary format
      let keys = Object.keys(parsed_json)
      for (let i = 0; i < keys.length; i++) {
        let ent_id = keys[i]
        if (ent_id === 'map_settings' || ent_id === 'metadata' || ent_id === 'timelines')
          continue

        let ent = parsed_json[ent_id]
        if (!ent || typeof ent !== 'object')
          continue

        let raw_history = ent.history || ent.keyframes
        if (typeof raw_history === 'string') {
          try {
            raw_history = JSON.parse(raw_history)
          } catch (arg0_err) {
            console.warn(`[CustomVectorService] Failed to parse history for entity ${ent_id}:`, arg0_err)
          }
        }

        let keyframes_obj = (raw_history && raw_history.keyframes) ? raw_history.keyframes : raw_history
        if (!keyframes_obj || typeof keyframes_obj !== 'object')
          continue

        let raw_ts_keys = Object.keys(keyframes_obj)
        if (raw_ts_keys.length === 0)
          continue

        let kf_items: { ts: number; val: [any, any, any] }[] = []
        for (let x = 0; x < raw_ts_keys.length; x++) {
          let raw_key = raw_ts_keys[x]
          let ts = parseDateStringToTimestamp(raw_key)
          let raw_val = keyframes_obj[raw_key]
          let val = Array.isArray(raw_val) ? raw_val : raw_val?.value

          if (Array.isArray(val)) {
            let geom = val[0] ?? null
            let symbol = (typeof val[1] === 'object' && val[1] !== null) ? val[1] : {}
            let props = (typeof val[2] === 'object' && val[2] !== null) ? val[2] : {}
            kf_items.push({ ts, val: [geom, symbol, props] })
          } else if (raw_val && typeof raw_val === 'object') {
            let geom = raw_val.geometry || raw_val.feature || null
            let symbol = raw_val.symbol || {}
            let props = raw_val.properties || {}
            kf_items.push({ ts, val: [geom, symbol, props] })
          }
        }

        if (kf_items.length === 0)
          continue

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

        let first_val = kf_items[0].val
        let entity_name = ent.name || first_val[2]?.name || first_val[2]?.state || first_val[2]?.PROVNAME || ent.metadata?.name || `Entity ${ent_id}`

        entities.set(ent_id, {
          class_name: ent.class_name || 'GeometryPolygon',
          id: ent_id,
          keyframes: kf_map,
          max_ts: sorted_ts[sorted_ts.length - 1],
          min_ts: sorted_ts[0],
          name: String(entity_name).replace(/\\n/g, ' ').replace(/\n+/g, ' ').trim(),
          sorted_timestamps: sorted_ts,
        })
      }
    }

    if (target_year === undefined && Number.isFinite(max_year)) {
      target_year = max_year
      if (!target_date && Number.isFinite(target_year)) {
        target_date = { day: 1, hour: 0, minute: 0, month: 1, year: target_year }
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
      targetDate: target_date,
      targetYear: target_year,
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
  } else if (dataset.targetDate && Math.floor(timeline_year) === dataset.targetDate.year) {
    target_date_obj = { ...dataset.targetDate }
  } else if (timeline_year !== Math.floor(timeline_year)) {
    target_date_obj = UfDate.fromFractionalYear(timeline_year)
  } else {
    //Whole year view: evaluate at end of year so keyframes within the year are active
    target_date_obj = {
      day: 31,
      hour: 23,
      minute: 59,
      month: 12,
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

    let entity_name = current_props.name || current_props.state || current_props.PROVNAME || ent.name || `Entity ${ent_id}`
    let fill_color = current_symbol.polygonFill || current_symbol.fillColor || current_props.colour || current_props.color || '#38bdf8'

    active_features.push({
      geometry: valid_geom,
      id: `custom_naissance_${ent_id}`,
      properties: {
        ...current_props,
        color: fill_color,
        date: UfDate.formatDate(target_date_obj),
        description: current_props.descriptions || current_props.description || '',
        id: `custom_naissance_${ent_id}`,
        is_custom: true,
        name: String(entity_name).replace(/\\n/g, ' ').replace(/\n+/g, ' ').trim(),
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
