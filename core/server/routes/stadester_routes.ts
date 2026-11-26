import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import { promisify } from 'node:util'
import { gzip as gzipCallback } from 'node:zlib'
import { DEFAULT_STADESTER_SCALING_CONFIG, getOptimisationConfig } from '../../../common/optimisation/optimisation.ts'
import { getDefaultStadesterDatasetId } from '../stadester_config_loader.ts'
import { packBinaryCitiesResponse } from '../stadester_binary_queries.ts'
import { StadesterService } from '../stadester_service.ts'
import { AtlasBordersService } from '../AtlasBordersService.ts'

let compressed_cities_cache = new Map<string, Buffer>()
let gzipAsync = promisify(gzipCallback)

/**
 * Clears compressed HTTP response caches for Stadestér city endpoints, optionally scoped to one dataset stem.
 *
 * @param {string} [arg0_dataset_stem]
 *
 * @returns {void}
 */
export function clearCompressedCitiesCache (arg0_dataset_stem?: string): void {
  //Convert from parameters
  let dataset_stem = (arg0_dataset_stem) ? arg0_dataset_stem : ''

  //Function body
  if (!dataset_stem) {
    compressed_cities_cache.clear()
    return
  }

  let clean_stem = dataset_stem.endsWith('.json') ? dataset_stem.slice(0, -5) : dataset_stem
  let p1 = `${clean_stem}:`
  let p2 = `${clean_stem}.json:`
  let t1 = `tile:${clean_stem}:`
  let t2 = `tile:${clean_stem}.json:`

  for (let key of compressed_cities_cache.keys()) {
    if (key.startsWith(p1) || key.startsWith(p2) || key.startsWith(t1) || key.startsWith(t2))
      compressed_cities_cache.delete(key)
  }
}

StadesterService.registerBinaryStoreSwapListener((arg0_dataset_stem) => {
  clearCompressedCitiesCache(arg0_dataset_stem)
})


/**
 * Converts slippy tile indices (z, x, y) into a geographic bounding box [west, south, east, north] with small overlap margin.
 *
 * @param {number} arg0_z
 * @param {number} arg1_x
 * @param {number} arg2_y
 *
 * @returns {[number, number, number, number]}
 */
function tileToGeoBBox (arg0_z: number, arg1_x: number, arg2_y: number): [number, number, number, number] {
  //Convert from parameters
  let x = arg1_x
  let y = arg2_y
  let z = Math.max(0, Math.min(18, arg0_z))

  //Declare local instance variables
  let n = Math.pow(2, z)
  let tile_lon = function (arg0_tx: number): number {
    return (arg0_tx/n)*360 - 180
  }
  let tile_lat = function (arg0_ty: number): number {
    let rad = Math.atan(Math.sinh(Math.PI*(1 - (2*arg0_ty)/n)))
    return (rad*180)/Math.PI
  }

  //Function body
  let west = Math.max(-180, tile_lon(x) - 0.5)
  let east = Math.min(180, tile_lon(x + 1) + 0.5)
  let north = Math.min(90, tile_lat(y) + 0.5)
  let south = Math.max(-90, tile_lat(y + 1) - 0.5)

  //Return statement
  return [west, south, east, north]
}

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
    let dataset = (query.dataset as string) || getDefaultStadesterDatasetId()
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
    let dataset = (query.dataset as string) || getDefaultStadesterDatasetId()
    let format = (query.format as string) || 'standard'
    let is_streaming = query.stream === '1' || query.stream === 'true'
    let parsed_max = query.maxCities !== undefined ? parseInt(query.maxCities as string, 10) : 4000
    let max_cities = Number.isNaN(parsed_max) ? 4000 : parsed_max
    let min_pop = query.minPop !== undefined ? Math.max(0.01, parseFloat(query.minPop as string)) : 0.01
    let raw_year = parseFloat(query.year as string)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year
    let day = query.day !== undefined ? parseInt(query.day as string, 10) : undefined
    let month = query.month !== undefined ? parseInt(query.month as string, 10) : undefined

    let accept_encoding = (req.headers['accept-encoding'] as string) || ''
    let cache_key = `${dataset}:${year}:${color_mode}:${min_pop}:${max_cities}:${format}:${bbox ? bbox.join(',') : ''}`
    let supports_gzip = accept_encoding.includes('gzip')

    StadesterService.getBinaryDatasetStoreAsync(dataset).then((arg0_load_res) => {
      if (res.destroyed || res.writableEnded)
        return

      let cache_control_hdr = arg0_load_res.cache_status === 'stale-revalidating'
        ? 'no-cache'
        : 'public, max-age=86400, stale-while-revalidate=604800'
      res.setHeader('X-Stadester-Cache', arg0_load_res.cache_status)

      if (format === 'bin') {
        res.statusCode = 200
        res.setHeader('Cache-Control', cache_control_hdr)
        res.setHeader('Content-Type', 'application/octet-stream')

        let bin_cache_key = `${cache_key}:${supports_gzip ? 'gz' : 'raw'}`
        if (compressed_cities_cache.has(bin_cache_key)) {
          let cached_buf = compressed_cities_cache.get(bin_cache_key)!
          if (supports_gzip)
            res.setHeader('Content-Encoding', 'gzip')
          res.setHeader('Content-Length', cached_buf.length)
          res.end(cached_buf)
          return
        }

        let opt_scaling = getOptimisationConfig().config?.stadester_scaling || DEFAULT_STADESTER_SCALING_CONFIG
        let stream_threshold = opt_scaling.stream_min_cities_threshold ?? DEFAULT_STADESTER_SCALING_CONFIG.stream_min_cities_threshold
        let use_multi_chunk_stream = is_streaming && (max_cities === 0 || max_cities >= stream_threshold)

        if (use_multi_chunk_stream) {
          let initial_chunk_sz = opt_scaling.stream_initial_chunk_size ?? DEFAULT_STADESTER_SCALING_CONFIG.stream_initial_chunk_size
          let chunk_sz = opt_scaling.stream_chunk_size ?? DEFAULT_STADESTER_SCALING_CONFIG.stream_chunk_size
          let aborted = false
          req.on('close', () => {
            aborted = true
          })

          res.setHeader('Transfer-Encoding', 'chunked')
          res.setHeader('X-Stadwire-Stream', '1')

          StadesterService.streamCompactBinaryCitiesAtYear(
            dataset,
            year,
            { bbox, color_mode, day, max_cities, min_pop, month },
            initial_chunk_sz,
            chunk_sz,
            (arg0_wire_buf) => {
              if (aborted || res.destroyed || res.writableEnded)
                return
              let len_hdr = Buffer.allocUnsafe(4)
              len_hdr.writeUInt32LE(arg0_wire_buf.length, 0)
              res.write(len_hdr)
              res.write(arg0_wire_buf)
            },
            () => aborted || res.destroyed || res.writableEnded
          ).then(() => {
            if (!res.destroyed && !res.writableEnded)
              res.end()
          }).catch((arg0_err) => {
            console.error('[ApiMiddleware] Binary stream error:', arg0_err)
            if (!res.destroyed && !res.writableEnded)
              res.end()
          })
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
        let bin_buf = packBinaryCitiesResponse(compact_payload)

        if (supports_gzip) {
          gzipAsync(bin_buf, { level: 5 }).then((arg0_compressed) => {
            if (arg0_load_res.cache_status !== 'stale-revalidating') {
              if (compressed_cities_cache.size >= 150) {
                let oldest_key = compressed_cities_cache.keys().next().value
                if (oldest_key)
                  compressed_cities_cache.delete(oldest_key)
              }
              compressed_cities_cache.set(bin_cache_key, arg0_compressed)
            }
            if (!res.destroyed && !res.writableEnded) {
              res.setHeader('Content-Encoding', 'gzip')
              res.setHeader('Content-Length', arg0_compressed.length)
              res.end(arg0_compressed)
            }
          }).catch(() => {
            if (!res.destroyed && !res.writableEnded) {
              res.setHeader('Content-Length', bin_buf.length)
              res.end(bin_buf)
            }
          })
        } else {
          if (arg0_load_res.cache_status !== 'stale-revalidating') {
            if (compressed_cities_cache.size >= 150) {
              let oldest_key = compressed_cities_cache.keys().next().value
              if (oldest_key)
                compressed_cities_cache.delete(oldest_key)
            }
            compressed_cities_cache.set(bin_cache_key, bin_buf)
          }
          res.setHeader('Content-Length', bin_buf.length)
          res.end(bin_buf)
        }
        return
      }

      if (format === 'compact') {
        res.statusCode = 200
        res.setHeader('Cache-Control', cache_control_hdr)
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
        let raw_buf = Buffer.from(json_str, 'utf-8')

        if (supports_gzip) {
          gzipAsync(raw_buf, { level: 5 }).then((arg0_compressed) => {
            if (arg0_load_res.cache_status !== 'stale-revalidating') {
              if (compressed_cities_cache.size >= 150) {
                let oldest_key = compressed_cities_cache.keys().next().value
                if (oldest_key)
                  compressed_cities_cache.delete(oldest_key)
              }
              compressed_cities_cache.set(cache_key, arg0_compressed)
            }
            if (!res.destroyed && !res.writableEnded) {
              res.setHeader('Content-Encoding', 'gzip')
              res.setHeader('Content-Length', arg0_compressed.length)
              res.end(arg0_compressed)
            }
          }).catch(() => {
            if (!res.destroyed && !res.writableEnded) {
              res.setHeader('Content-Length', raw_buf.byteLength)
              res.end(raw_buf)
            }
          })
        } else {
          res.setHeader('Content-Length', raw_buf.byteLength)
          res.end(raw_buf)
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

      res.setHeader('Cache-Control', cache_control_hdr)

      let json_str = JSON.stringify({
        cities,
        count: cities.length,
        dataset,
        year,
      })
      let raw_buf = Buffer.from(json_str, 'utf-8')

      if (supports_gzip) {
        gzipAsync(raw_buf, { level: 5 }).then((arg0_compressed) => {
          if (!res.destroyed && !res.writableEnded) {
            res.setHeader('Content-Encoding', 'gzip')
            res.setHeader('Content-Length', arg0_compressed.length)
            res.end(arg0_compressed)
          }
        }).catch(() => {
          if (!res.destroyed && !res.writableEnded) {
            res.setHeader('Content-Length', raw_buf.byteLength)
            res.end(raw_buf)
          }
        })
      } else {
        res.setHeader('Content-Length', raw_buf.byteLength)
        res.end(raw_buf)
      }
    }).catch((arg0_err: any) => {
      console.error('[ApiMiddleware] Error querying stadester cities:', arg0_err)
      if (!res.destroyed && !res.writableEnded) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching cities' }))
      }
    })
    return
  }

  //Route 13b: GET /api/stadester/tile (Spatial LOD tile query by slippy z/x/y or explicit bbox)
  if (pathname === '/stadester/tile' || pathname === '/api/stadester/tile') {
    let color_mode = (query.colorMode as 'growth' | 'population' | 'region' | 'continent') || 'growth'
    let dataset = (query.dataset as string) || getDefaultStadesterDatasetId()
    let day = query.day !== undefined ? parseInt(query.day as string, 10) : undefined
    let format = (query.format as string) || 'bin'
    let max_cities = query.maxCities !== undefined ? parseInt(query.maxCities as string, 10) : 2500
    let min_pop = query.minPop !== undefined ? Math.max(0.01, parseFloat(query.minPop as string)) : 0.01
    let month = query.month !== undefined ? parseInt(query.month as string, 10) : undefined
    let raw_year = parseFloat(query.year as string)
    let tile_x = parseInt(query.x as string, 10)
    let tile_y = parseInt(query.y as string, 10)
    let tile_z = parseInt(query.z as string, 10)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year
    let bbox: [number, number, number, number] | undefined = undefined

    if (query.bbox) {
      let parts = String(query.bbox).split(',').map(Number)
      if (parts.length === 4 && !parts.some(Number.isNaN))
        bbox = [parts[0], parts[1], parts[2], parts[3]]
    } else if (!Number.isNaN(tile_z) && !Number.isNaN(tile_x) && !Number.isNaN(tile_y)) {
      bbox = tileToGeoBBox(tile_z, tile_x, tile_y)
    }

    let accept_encoding = (req.headers['accept-encoding'] as string) || ''
    let supports_gzip = accept_encoding.includes('gzip')
    let tile_cache_key = `tile:${dataset}:${year}:${color_mode}:${min_pop}:${max_cities}:${format}:${bbox ? bbox.join(',') : ''}:${supports_gzip ? 'gz' : 'raw'}`

    StadesterService.getBinaryDatasetStoreAsync(dataset).then((arg0_load_res) => {
      if (res.destroyed || res.writableEnded)
        return

      let cache_control_hdr = arg0_load_res.cache_status === 'stale-revalidating'
        ? 'no-cache'
        : 'public, max-age=86400, stale-while-revalidate=604800'
      res.statusCode = 200
      res.setHeader('Cache-Control', cache_control_hdr)
      res.setHeader('Content-Type', format === 'bin' ? 'application/octet-stream' : 'application/json')
      res.setHeader('X-Stadester-Cache', arg0_load_res.cache_status)

      if (compressed_cities_cache.has(tile_cache_key)) {
        let cached_buf = compressed_cities_cache.get(tile_cache_key)!
        if (supports_gzip)
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
        preserve_capitals: true,
      })
      let out_buf = format === 'bin'
        ? packBinaryCitiesResponse(compact_payload)
        : Buffer.from(JSON.stringify(compact_payload), 'utf-8')

      if (supports_gzip) {
        gzipAsync(out_buf, { level: 5 }).then((arg0_compressed) => {
          if (arg0_load_res.cache_status !== 'stale-revalidating') {
            if (compressed_cities_cache.size >= 250) {
              let oldest_key = compressed_cities_cache.keys().next().value
              if (oldest_key)
                compressed_cities_cache.delete(oldest_key)
            }
            compressed_cities_cache.set(tile_cache_key, arg0_compressed)
          }
          if (!res.destroyed && !res.writableEnded) {
            res.setHeader('Content-Encoding', 'gzip')
            res.setHeader('Content-Length', arg0_compressed.length)
            res.end(arg0_compressed)
          }
        }).catch(() => {
          if (!res.destroyed && !res.writableEnded) {
            res.setHeader('Content-Length', out_buf.length)
            res.end(out_buf)
          }
        })
      } else {
        res.setHeader('Content-Length', out_buf.length)
        res.end(out_buf)
      }
    }).catch((arg0_err: any) => {
      console.error('[ApiMiddleware] Error querying stadester tile:', arg0_err)
      if (!res.destroyed && !res.writableEnded) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching city tile' }))
      }
    })
    return
  }

  //Route 14: GET /api/stadester/city (Full historical details for one city)
  if (pathname === '/stadester/city' || pathname === '/api/stadester/city') {
    let city_key = (query.key as string) || ''
    let city_name = (query.name as string) || ''
    let country = (query.country as string) || ''
    let dataset = (query.dataset as string) || getDefaultStadesterDatasetId()

    let day = query.day !== undefined ? parseInt(query.day as string, 10) : undefined
    let lat = query.lat !== undefined ? parseFloat(query.lat as string) : undefined
    let lon = query.lon !== undefined ? parseFloat(query.lon as string) : undefined
    let month = query.month !== undefined ? parseInt(query.month as string, 10) : undefined
    let state_id = query.state_id !== undefined ? (typeof query.state_id === 'string' && !isNaN(Number(query.state_id)) ? Number(query.state_id) : query.state_id as string) : undefined
    let year = (query.year !== undefined && !isNaN(Number(query.year))) ? parseFloat(query.year as string) : (query.year ? (query.year as string) : 1950)

    let coords: [number, number] | undefined = (lat !== undefined && !isNaN(lat) && lon !== undefined && !isNaN(lon)) ? [lat, lon] : undefined
    if (!coords && city_name && !city_key) {
      let resolved_coords = AtlasBordersService.findCityCoordsByName(city_name, country)
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

    StadesterService.getBinaryDatasetStoreAsync(dataset).then((arg0_load_res) => {
      if (res.destroyed || res.writableEnded)
        return

      res.setHeader('X-Stadester-Cache', arg0_load_res.cache_status)
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
    }).catch((arg0_err: any) => {
      console.error('[ApiMiddleware] Error retrieving city details:', arg0_err)
      if (!res.destroyed && !res.writableEnded) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching city details' }))
      }
    })
    return
  }

  //Route 15: GET /api/stadester/largest (Ranked largest cities at year)
  if (pathname === '/stadester/largest' || pathname === '/api/stadester/largest') {
    let dataset = (query.dataset as string) || getDefaultStadesterDatasetId()
    let limit = query.limit !== undefined ? parseInt(query.limit as string, 10) : 20
    let raw_year = parseFloat(query.year as string)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year

    StadesterService.getBinaryDatasetStoreAsync(dataset).then((arg0_load_res) => {
      if (res.destroyed || res.writableEnded)
        return

      res.setHeader('X-Stadester-Cache', arg0_load_res.cache_status)
      let largest = StadesterService.getLargestCitiesAtYear(dataset, year, limit)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({
        cities: largest,
        dataset,
        limit,
        year,
      }))
    }).catch((arg0_err: any) => {
      console.error('[ApiMiddleware] Error fetching largest cities:', arg0_err)
      if (!res.destroyed && !res.writableEnded) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching largest cities' }))
      }
    })
    return
  }

  //Return statement
  return
}
