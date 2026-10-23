import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import type { LayerRegistryCache, ParsedDataLayer } from '../layer_parser.ts'
import {
  calculateDemographicPyramid,
  calculateSectorBreakdown,
  getLayerYearSourceMtime,
} from '../raster_demographics_service.ts'
import { getOptimisationConfig } from '../../../common/optimisation/optimisation.ts'

export interface RasterRouteContext {
  breakdown_cache: Map<string, { mtime: number; payload: any }>
  query: ParsedUrlQuery
  registry: LayerRegistryCache
  req: IncomingMessage
  res: ServerResponse
}

/**
 * Handles the bounding query for a given raster layer and target year.
 *
 * @param {RasterRouteContext} arg0_context
 *
 * @returns {void}
 */
export function handleRasterBounding (arg0_context: RasterRouteContext): void {
  //Convert from parameters
  let context = arg0_context

  //Declare local instance variables
  let layer_id = context.query.layer as string
  let query = context.query
  let raw_year = parseFloat(query.year as string)
  let registry = context.registry
  let res = context.res

  //Guard clauses
  if (raw_year === 0)
    raw_year = 1

  if (!layer_id || Number.isNaN(raw_year)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing or invalid layer or year parameter' }))
    return
  }

  //Function body
  let target_layer: ParsedDataLayer | undefined = registry.layers[layer_id]
  if (!target_layer && layer_id.includes('.')) {
    let parent_id = layer_id.split('.')[0]
    let parent_layer = registry.layers[parent_id]
    if (parent_layer && parent_layer.sub_layers)
      target_layer = parent_layer.sub_layers.find((arg0_sub: ParsedDataLayer) => arg0_sub.id === layer_id)
  }

  if (!target_layer || !target_layer.available_years || target_layer.available_years.length === 0) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `Layer ${layer_id} not found or has no available years` }))
    return
  }

  let years = target_layer.available_years
  let prev_year = years[0]
  let next_year = years[years.length - 1]
  let t = 0

  if (raw_year <= years[0]) {
    prev_year = years[0]
    next_year = years[0]
    t = 0
  } else if (raw_year >= years[years.length - 1]) {
    prev_year = years[years.length - 1]
    next_year = years[years.length - 1]
    t = 0
  } else {
    for (let i = 0; i < years.length - 1; i++) {
      if (raw_year >= years[i] && raw_year <= years[i + 1]) {
        prev_year = years[i]
        next_year = years[i + 1]
        if (next_year > prev_year)
          t = (raw_year - prev_year)/(next_year - prev_year)
        else
          t = 0
        break
      }
    }
  }

  res.setHeader('Content-Type', 'application/json')
  res.statusCode = 200
  res.end(
    JSON.stringify({
      layer: layer_id,
      next_year,
      prev_year,
      t,
      target_year: raw_year,
    })
  )

  //Return statement
  return
}


/**
 * Handles streaming static GeoPNG raster file assets.
 *
 * @param {RasterRouteContext} arg0_context
 *
 * @returns {void}
 */
export function handleRasterFile (arg0_context: RasterRouteContext): void {
  //Convert from parameters
  let context = arg0_context

  //Declare local instance variables
  let layer = context.query.layer as string
  let query = context.query
  let registry = context.registry
  let res = context.res
  let req = context.req
  let year = context.query.year as string

  //Guard clauses
  if (!layer || !year) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing layer or year parameter' }))
    return
  }

  //Function body
  let file_path: string | undefined = undefined
  let target_layer: ParsedDataLayer | undefined = registry.layers[layer]
  if (!target_layer && layer.includes('.')) {
    let parent_id = layer.split('.')[0]
    let parent = registry.layers[parent_id]
    if (parent && parent.sub_layers)
      target_layer = parent.sub_layers.find((arg0_sub: any) => arg0_sub.id === layer)
  }

  //Collect selector query parameters
  let selector_param_keys = Object.keys(query).filter(
    (arg0_k) => arg0_k !== 'layer' && arg0_k !== 'year' && typeof query[arg0_k] === 'string'
  ).sort()

  if (target_layer?.variable_selectors) {
    let valid_keys = Object.keys(target_layer.variable_selectors)
    selector_param_keys = selector_param_keys.filter((arg0_k) => valid_keys.includes(arg0_k))
  }

  //Strategy 1: Canonical sorted key
  if (selector_param_keys.length > 0) {
    let combo_str = selector_param_keys.map((arg0_k) => `${arg0_k}=${query[arg0_k]}`).join(':')
    file_path = registry.file_cache.get(`${layer}:${combo_str}:${year}`)
    if (!file_path && year === '1')
      file_path = registry.file_cache.get(`${layer}:${combo_str}:0`)
    if (!file_path && year === '0')
      file_path = registry.file_cache.get(`${layer}:${combo_str}:1`)
  }

  //Strategy 2: Values-only key
  if (!file_path && selector_param_keys.length > 0) {
    let vals_str = selector_param_keys.map((arg0_k) => query[arg0_k]).join(':')
    file_path = registry.file_cache.get(`${layer}:${vals_str}:${year}`)
    if (!file_path && year === '1')
      file_path = registry.file_cache.get(`${layer}:${vals_str}:0`)
    if (!file_path && year === '0')
      file_path = registry.file_cache.get(`${layer}:${vals_str}:1`)
  }

  //Strategy 3: Legacy positional
  if (!file_path && (query.profession || query.gender)) {
    let prof = (query.profession as string) || 'agriculture'
    let gen = (query.gender as string) || 't'
    file_path = registry.file_cache.get(`${layer}:${prof}:${gen}:${year}`)
    if (!file_path && year === '1')
      file_path = registry.file_cache.get(`${layer}:${prof}:${gen}:0`)
    if (!file_path && year === '0')
      file_path = registry.file_cache.get(`${layer}:${prof}:${gen}:1`)
  }

  //Strategy 4: Single parameter fallback
  if (!file_path && selector_param_keys.length === 1) {
    let val = query[selector_param_keys[0]] as string
    file_path = registry.file_cache.get(`${layer}:${val}:${year}`)
    if (!file_path && year === '1')
      file_path = registry.file_cache.get(`${layer}:${val}:0`)
    if (!file_path && year === '0')
      file_path = registry.file_cache.get(`${layer}:${val}:1`)
  }

  //Strategy 5: Default layer:year key
  if (!file_path) {
    file_path = registry.file_cache.get(`${layer}:${year}`)
    if (!file_path && year === '1')
      file_path = registry.file_cache.get(`${layer}:0`)
    if (!file_path && year === '0')
      file_path = registry.file_cache.get(`${layer}:1`)
  }

  //Strategy 6: Legacy default fallback
  if (!file_path) {
    file_path = registry.file_cache.get(`${layer}:agriculture:t:${year}`)
    if (!file_path && year === '1')
      file_path = registry.file_cache.get(`${layer}:agriculture:t:0`)
    if (!file_path && year === '0')
      file_path = registry.file_cache.get(`${layer}:agriculture:t:1`)
  }

  if (!file_path || !fs.existsSync(file_path)) {
    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(
      JSON.stringify({
        error: `GeoPNG raster file not found for layer: ${layer}, year: ${year}`,
        query,
      })
    )
    return
  }

  try {
    let stats = fs.statSync(file_path)
    let etag = `"${layer}-${year}-${stats.mtimeMs}"`

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304
      res.end()
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Content-Length', stats.size)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')

    let stream = fs.createReadStream(file_path)
    stream.pipe(res)
    return
  } catch (arg0_err) {
    console.error('[ApiMiddleware] Failed to stream raster file:', arg0_err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal server error streaming raster file' }))
    return
  }
}


/**
 * Handles demographic and sector breakdown queries across points, polygons or countries.
 *
 * @param {RasterRouteContext} arg0_context
 *
 * @returns {void}
 */
export function handleRasterBreakdown (arg0_context: RasterRouteContext): void {
  //Convert from parameters
  let context = arg0_context

  //Declare local instance variables
  let breakdown_cache = context.breakdown_cache
  let query = context.query
  let req = context.req
  let res = context.res

  //Function body
  let process_breakdown = function (arg0_params: {
    countries?: string | string[]
    country?: string
    geometries?: { geometry: any; name: string }[]
    geometry?: any
    layer?: string
    x?: number
    y?: number
    year?: number
  }) {
    //Convert from parameters
    let params = arg0_params

    //Declare local instance variables
    let countries_str = Array.isArray(params.countries)
      ? params.countries.join(',')
      : (params.countries || '').trim()
    let country = (params.country || '').trim()
    let geometries = params.geometries
    let geometry = params.geometry
    let layer = params.layer || 'age_sex'
    let raw_x = params.x
    let raw_y = params.y
    let year = params.year === 0 ? 1 : (params.year || 1950)

    //Function body
    let current_source_mtime = getLayerYearSourceMtime(layer, year)
    let opt_info = getOptimisationConfig()
    let effective_mtime = Math.max(current_source_mtime, opt_info.mtimeMs)
    let geom_key = geometry ? (geometry.coordinates?.[0]?.[0]?.[0] ?? 'custom') : 'none'
    let cache_key = `${layer}:${year}:${country}:${countries_str}:${geom_key}:${raw_x ?? 'all'}:${raw_y ?? 'all'}`
    let cached = breakdown_cache.get(cache_key)
    if (cached) {
      if (effective_mtime > 0 && effective_mtime > cached.mtime) {
        breakdown_cache.delete(cache_key)
      } else {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(cached.payload))
        return
      }
    }

    if (layer === 'age_sex') {
      let demo_res = calculateDemographicPyramid({ country: country || 'Global', geometry, year })
      let result = {
        country: demo_res.country,
        dependencyRatio: demo_res.dependencyRatio,
        female: demo_res.female,
        lastModified: demo_res.lastModified,
        layer,
        male: demo_res.male,
        oldAgeDependencyRatio: demo_res.oldAgeDependencyRatio !== undefined ? demo_res.oldAgeDependencyRatio : demo_res.dependencyRatio,
        sexRatio: demo_res.sexRatio,
        totalFemale: demo_res.totalFemale,
        totalMale: demo_res.totalMale,
        x: raw_x,
        y: raw_y,
        year,
      }
      breakdown_cache.set(cache_key, { mtime: effective_mtime, payload: result })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
      return
    }

    if (layer.includes('profession')) {
      let target_countries: string[] = []

      if (countries_str) {
        target_countries = countries_str
          .split(',')
          .map((arg0_c) => arg0_c.trim())
          .filter((arg0_c) => arg0_c && arg0_c.toLowerCase() !== 'global')
      } else if (country && country.toLowerCase() !== 'global') {
        target_countries = [country]
      }

      let sector_res = calculateSectorBreakdown({ countries: target_countries, geometries, year })
      let result = {
        by_country: sector_res.byCountry,
        global: sector_res.global,
        lastModified: sector_res.lastModified,
        layer,
        sectors: sector_res.global,
        x: raw_x,
        y: raw_y,
        year,
      }
      breakdown_cache.set(cache_key, { mtime: effective_mtime, payload: result })
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(result))
      return
    }

    res.statusCode = 404
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `Breakdown not supported for layer: ${layer}` }))

    //Return statement
    return
  }

  if (req.method === 'POST') {
    let body_chunks: Buffer[] = []
    req.on('data', (arg0_chunk) => {
      body_chunks.push(arg0_chunk)
    })
    req.on('end', () => {
      let body_data: any = {}
      try {
        let body_str = Buffer.concat(body_chunks).toString('utf-8')
        if (body_str)
          body_data = JSON.parse(body_str)
      } catch (arg0_err) {
        console.error('[ApiMiddleware] Failed to parse JSON body for breakdown:', arg0_err)
      }
      process_breakdown(body_data)
    })
  } else {
    process_breakdown({
      countries: (query.countries as string) || '',
      country: (query.country as string) || '',
      layer: (query.layer as string) || 'age_sex',
      x: query.x !== undefined ? parseInt(query.x as string, 10) : undefined,
      y: query.y !== undefined ? parseInt(query.y as string, 10) : undefined,
      year: parseInt(query.year as string, 10) || 1950,
    })
  }

  //Return statement
  return
}
