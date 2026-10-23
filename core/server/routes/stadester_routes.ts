import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import { gzipSync } from 'node:zlib'
import { StadesterService } from '../stadester_service.ts'
import { AtlasBordersService } from '../AtlasBordersService.ts'

let compressed_cities_cache = new Map<string, Buffer>()

export interface StadesterRouteContext {
  pathname: string
  query: ParsedUrlQuery
  req: IncomingMessage
  res: ServerResponse
}

/**
 * Handles Stadester historical cities API endpoints: lite cache, active cities, city details, and ranked largest cities.
 *
 * @param {StadesterRouteContext} arg0_context
 *
 * @returns {void}
 */
export function handleStadesterRoute (arg0_context: StadesterRouteContext): void {
  //Convert from parameters
  let context = arg0_context

  //Declare local instance variables
  let pathname = context.pathname
  let query = context.query
  let req = context.req
  let res = context.res

  //Function body

  //Route 12: GET /api/stadester/lite (Static lightweight cache)
  if (pathname === '/stadester/lite' || pathname === '/api/stadester/lite') {
    let dataset = (query.dataset as string) || 'stadester_1.1'
    let lite_path: string

    try {
      lite_path = StadesterService.ensureLiteCache(dataset)
    } catch (arg0_err) {
      console.error('[ApiMiddleware] Error generating lite cache:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Failed to generate lightweight cache' }))
      return
    }

    if (!fs.existsSync(lite_path)) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Lite cache file not found' }))
      return
    }

    let stats = fs.statSync(lite_path)
    let etag = `"${dataset}-lite-${stats.mtimeMs}"`

    if (req.headers['if-none-match'] === etag) {
      res.statusCode = 304
      res.end()
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Length', stats.size)
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'public, max-age=86400')

    let stream = fs.createReadStream(lite_path)
    stream.pipe(res)
    return
  }

  //Route 13: GET /api/stadester/cities (Active cities at year, with streaming and compact support)
  if (
    pathname === '/stadester/cities' ||
    pathname === '/stadester/cities.json' ||
    pathname === '/api/stadester/cities' ||
    pathname === '/api/stadester/cities.json'
  ) {
    let bbox_param = query.bbox as string
    let bbox: [number, number, number, number] | undefined = undefined
    if (bbox_param) {
      let parts = bbox_param.split(',').map(Number)
      if (parts.length === 4 && !parts.some(Number.isNaN))
        bbox = [parts[0], parts[1], parts[2], parts[3]]
    }
    let color_mode = (query.colorMode as 'growth' | 'population' | 'region' | 'continent') || 'growth'
    let dataset = (query.dataset as string) || 'stadester_1.1'
    let format = (query.format as string) || 'standard'
    let is_streaming = query.stream === '1' || query.stream === 'true'
    let max_cities = query.maxCities !== undefined ? parseInt(query.maxCities as string, 10) : 4000
    let min_pop = query.minPop !== undefined ? Math.max(0.01, parseFloat(query.minPop as string)) : 0.01
    let raw_year = parseFloat(query.year as string)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year
    let day = query.day !== undefined ? parseInt(query.day as string, 10) : undefined
    let month = query.month !== undefined ? parseInt(query.month as string, 10) : undefined

    try {
      let accept_encoding = (req.headers['accept-encoding'] as string) || ''
      let cache_key = `${dataset}:${year}:${color_mode}:${min_pop}:${max_cities}:${format}:${bbox ? bbox.join(',') : ''}`
      let supports_gzip = accept_encoding.includes('gzip')

      if (format === 'compact') {
        res.statusCode = 200
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
        res.setHeader('Content-Type', 'application/json')

        if (supports_gzip && compressed_cities_cache.has(cache_key)) {
          let cached_buf = compressed_cities_cache.get(cache_key)!
          res.setHeader('Content-Encoding', 'gzip')
          res.setHeader('Content-Length', cached_buf.length)
          res.end(cached_buf)
          return
        }

        let compact_payload = StadesterService.getCompactCitiesAtYear(dataset, year, {
          bbox,
          color_mode,
          day,
          max_cities,
          min_pop,
          month,
        })
        let json_str = JSON.stringify(compact_payload)

        if (supports_gzip) {
          let compressed = gzipSync(Buffer.from(json_str, 'utf-8'), { level: 6 })

          if (compressed_cities_cache.size >= 150) {
            let oldest_key = compressed_cities_cache.keys().next().value
            if (oldest_key)
              compressed_cities_cache.delete(oldest_key)
          }
          compressed_cities_cache.set(cache_key, compressed)

          res.setHeader('Content-Encoding', 'gzip')
          res.setHeader('Content-Length', compressed.length)
          res.end(compressed)
        } else {
          res.setHeader('Content-Length', Buffer.byteLength(json_str))
          res.end(json_str)
        }
        return
      }

      let cities = StadesterService.getCitiesAtYear(dataset, year, {
        bbox,
        color_mode,
        day,
        max_cities,
        min_pop,
        month,
      })

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')

      if (is_streaming) {
        res.setHeader('Transfer-Encoding', 'chunked')
        res.write('[\n')
        for (let i = 0; i < cities.length; i++) {
          let is_last = i === cities.length - 1
          res.write(JSON.stringify(cities[i]) + (is_last ? '\n' : ',\n'))
        }
        res.write(']')
        res.end()
        return
      }

      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')

      let json_str = JSON.stringify({
        cities,
        count: cities.length,
        dataset,
        year,
      })

      if (supports_gzip) {
        let compressed = gzipSync(Buffer.from(json_str, 'utf-8'), { level: 6 })
        res.setHeader('Content-Encoding', 'gzip')
        res.setHeader('Content-Length', compressed.length)
        res.end(compressed)
      } else {
        res.setHeader('Content-Length', Buffer.byteLength(json_str))
        res.end(json_str)
      }
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error querying stadester cities:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching cities' }))
      return
    }
  }

  //Route 14: GET /api/stadester/city (Full historical details for one city)
  if (pathname === '/stadester/city' || pathname === '/api/stadester/city') {
    let city_key = (query.key as string) || ''
    let city_name = (query.name as string) || ''
    let country = (query.country as string) || ''
    let dataset = (query.dataset as string) || 'stadester_1.1'

    let day = query.day !== undefined ? parseInt(query.day as string, 10) : undefined
    let lat = query.lat !== undefined ? parseFloat(query.lat as string) : undefined
    let lon = query.lon !== undefined ? parseFloat(query.lon as string) : undefined
    let month = query.month !== undefined ? parseInt(query.month as string, 10) : undefined
    let state_id = query.state_id !== undefined ? (typeof query.state_id === 'string' && !isNaN(Number(query.state_id)) ? Number(query.state_id) : query.state_id as string) : undefined
    let year = (query.year !== undefined && !isNaN(Number(query.year))) ? parseFloat(query.year as string) : (query.year ? (query.year as string) : 1950)

    let coords: [number, number] | undefined = (lat !== undefined && !isNaN(lat) && lon !== undefined && !isNaN(lon)) ? [lat, lon] : undefined
    if (!coords && (city_name || city_key)) {
      let resolved_coords = AtlasBordersService.findCityCoordsByName(city_name || city_key, country)
      if (resolved_coords?.coords) {
        coords = [resolved_coords.coords[1], resolved_coords.coords[0]]
      }
    }

    if (!city_key && !city_name && !coords) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing city key, name, or coords parameter' }))
      return
    }

    try {
      let city_options = { coords, country, name: city_name, state_id }
      let city = city_key ? StadesterService.getCityByKey(dataset, city_key, year, month, day, city_options) : null
      if (!city && city_name) {
        city = StadesterService.getCityByKey(dataset, city_name, year, month, day, city_options)
      }
      if (!city && coords) {
        city = StadesterService.getCityByKey(dataset, '', year, month, day, city_options)
      }
      if (!city) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `City not found: ${city_key || city_name || (coords ? coords.join(',') : '')}` }))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.end(JSON.stringify(city))
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error retrieving city details:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching city details' }))
      return
    }
  }

  //Route 15: GET /api/stadester/largest (Ranked largest cities at year)
  if (pathname === '/stadester/largest' || pathname === '/api/stadester/largest') {
    let dataset = (query.dataset as string) || 'stadester_1.1'
    let limit = query.limit !== undefined ? parseInt(query.limit as string, 10) : 20
    let raw_year = parseFloat(query.year as string)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year

    try {
      let largest = StadesterService.getLargestCitiesAtYear(dataset, year, limit)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        cities: largest,
        dataset,
        limit,
        year,
      }))
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error fetching largest cities:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching largest cities' }))
      return
    }
  }

  //Return statement
  return
}
