import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import type { ParsedUrlQuery } from 'querystring'
import { gzipSync } from 'node:zlib'
import type { ParsedDataLayer } from '../layer_parser.ts'
import { AtlasBordersService, registerAtlasCacheClearer } from '../AtlasBordersService.ts'
import { normaliseBorderDatasetId } from '../../framework/geopng/types.ts'
import { UfDate } from '../../framework/utils/uf_date.ts'

let compressed_borders_cache = new Map<string, Buffer>()

/**
 * Clears the in-memory compressed borders buffer cache.
 *
 * @returns {void}
 */
export function clearCompressedBordersCache (): void {
  //Function body
  compressed_borders_cache.clear()
}

registerAtlasCacheClearer(() => {
  clearCompressedBordersCache()
})

export interface AtlasRouteContext {
  layers: Record<string, ParsedDataLayer>
  pathname: string
  query: ParsedUrlQuery
  req: IncomingMessage
  res: ServerResponse
}

/**
 * Handles Atlas and GIS vector and border endpoints: single border, batch/streamed borders, entity keyframes, and raw GIS files.
 *
 * @param {AtlasRouteContext} arg0_context
 *
 * @returns {void}
 */
export function handleAtlasRoute (arg0_context: AtlasRouteContext): void {
  //Convert from parameters
  let context = arg0_context

  //Declare local instance variables
  let layers = context.layers
  let pathname = context.pathname
  let query = context.query
  let req = context.req
  let res = context.res

  //Function body

  //Route 15: GET /api/atlas/border or /api/gis/border (Single country/state boundary feature)
  if (
    pathname === '/atlas/border' ||
    pathname === '/api/atlas/border' ||
    pathname === '/gis/border' ||
    pathname === '/api/gis/border'
  ) {
    let dataset = normaliseBorderDatasetId(query.dataset as string, 'defacto_borders')
    let day_param = query.day ? parseInt(query.day as string, 10) : undefined
    let month_param = query.month ? parseInt(query.month as string, 10) : undefined
    let day = Number.isInteger(day_param) ? day_param : undefined
    let month = Number.isInteger(month_param) ? month_param : undefined
    let raw_year = parseFloat(query.year as string)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year
    let state_id = query.state_id !== undefined ? (query.state_id as string) : (query.id as string)
    let name = query.name !== undefined ? (query.name as string) : undefined

    if (day === undefined || month === undefined) {
      if (!Number.isInteger(year)) {
        let parsed_date = UfDate.fromFractionalYear(year)
        day = parsed_date.day
        month = parsed_date.month
        year = parsed_date.year
      }
    }

    try {
      let border_feat = AtlasBordersService.getBorderFeature(year, state_id, name, { dataset, day, month })
      if (!border_feat) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `Border feature not found for state_id=${state_id} name=${name} at year=${year}` }))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.end(JSON.stringify(border_feat))
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error querying single border feature:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching border feature' }))
      return
    }
  }

  //Route 16: GET /api/atlas/borders or /api/gis/borders (Streamed or batch historical country boundaries)
  if (
    pathname === '/atlas/borders' ||
    pathname === '/atlas/borders.json' ||
    pathname === '/api/atlas/borders' ||
    pathname === '/api/atlas/borders.json' ||
    pathname === '/gis/borders' ||
    pathname === '/gis/borders.json' ||
    pathname === '/api/gis/borders' ||
    pathname === '/api/gis/borders.json'
  ) {
    let bbox_param = query.bbox as string
    let bbox: [number, number, number, number] | undefined = undefined
    if (bbox_param) {
      let parts = bbox_param.split(',').map(Number)
      if (parts.length === 4 && !parts.some(Number.isNaN))
        bbox = [parts[0], parts[1], parts[2], parts[3]]
    }
    let dataset = normaliseBorderDatasetId(query.dataset as string, 'dejure_borders')
    let day_param = query.day ? parseInt(query.day as string, 10) : undefined
    let month_param = query.month ? parseInt(query.month as string, 10) : undefined
    let day = Number.isInteger(day_param) ? day_param : undefined
    let is_streaming = query.stream === '1' || query.stream === 'true'
    let month = Number.isInteger(month_param) ? month_param : undefined
    let raw_year = parseFloat(query.year as string)
    let year = Number.isNaN(raw_year) ? 1950 : raw_year

    if (day === undefined || month === undefined) {
      if (!Number.isInteger(year)) {
        let parsed_date = UfDate.fromFractionalYear(year)
        day = parsed_date.day
        month = parsed_date.month
        year = parsed_date.year
      }
    }

    try {
      if (is_streaming) {
        AtlasBordersService.streamBorders(res, year, { bbox, dataset, day, month })
        return
      }

      let accept_encoding = (req.headers['accept-encoding'] as string) || ''
      let cache_key = `${dataset}:${year}-${month || 1}-${day || 1}:${bbox ? bbox.join(',') : ''}`
      let supports_gzip = accept_encoding.includes('gzip')

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')

      let cache_control_header = (process.env.NODE_ENV === 'production' && process.env.VITE_PUBLIC_BUILD)
        ? 'public, max-age=86400, stale-while-revalidate=604800'
        : 'no-cache, must-revalidate'

      if (supports_gzip && compressed_borders_cache.has(cache_key)) {
        let cached_buf = compressed_borders_cache.get(cache_key)!
        res.setHeader('Cache-Control', cache_control_header)
        res.setHeader('Content-Encoding', 'gzip')
        res.setHeader('Content-Length', cached_buf.length)
        res.end(cached_buf)
        return
      }

      let borders_payload = AtlasBordersService.getBordersAtYear(year, { bbox, dataset, day, month })

      if (borders_payload.features.length === 0 && year >= -3000) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
      } else {
        res.setHeader('Cache-Control', cache_control_header)
      }

      let json_str = JSON.stringify(borders_payload)

      if (supports_gzip) {
        let compressed = gzipSync(Buffer.from(json_str, 'utf-8'), { level: 6 })

        if (compressed_borders_cache.size >= 150) {
          let oldest_key = compressed_borders_cache.keys().next().value
          if (oldest_key)
            compressed_borders_cache.delete(oldest_key)
        }
        compressed_borders_cache.set(cache_key, compressed)

        res.setHeader('Content-Encoding', 'gzip')
        res.setHeader('Content-Length', compressed.length)
        res.end(compressed)
      } else {
        res.setHeader('Content-Length', Buffer.byteLength(json_str))
        res.end(json_str)
      }
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error querying historical borders:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching historical borders' }))
      return
    }
  }

  //Route 17: GET /api/atlas/entity or /api/gis/entity (Detailed temporal keyframe history of an entity)
  if (
    pathname === '/atlas/entity' ||
    pathname === '/api/atlas/entity' ||
    pathname === '/gis/entity' ||
    pathname === '/api/gis/entity'
  ) {
    let entity_id = (query.id as string) || (query.key as string) || ''
    if (!entity_id) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Missing entity id parameter' }))
      return
    }

    try {
      let details = AtlasBordersService.getEntityDetails(entity_id)
      if (!details) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `Entity not found: ${entity_id}` }))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.end(JSON.stringify(details))
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error querying entity details:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: arg0_err?.message || 'Error fetching entity details' }))
      return
    }
  }

  //Route 18: GET /api/gis/file (Safely serve static GIS file by layer identifier)
  if (pathname === '/gis/file' || pathname === '/api/gis/file') {
    let layer_id = (query.layer as string) || ''
    let target_layer = layers[layer_id]

    if (!target_layer) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Layer not found: ${layer_id}` }))
      return
    }

    let file_path = target_layer.filepath_template
    if (!file_path || !fs.existsSync(file_path)) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `File not found on disk for layer: ${layer_id}` }))
      return
    }

    try {
      let stats = fs.statSync(file_path)
      let etag = `"${layer_id}-${stats.mtimeMs}"`
      if (req.headers['if-none-match'] === etag) {
        res.statusCode = 304
        res.end()
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', file_path.endsWith('.geojson') || file_path.endsWith('.json') || file_path.endsWith('.naissance') ? 'application/json' : 'application/octet-stream')
      res.setHeader('Content-Length', stats.size)
      res.setHeader('ETag', etag)
      res.setHeader('Cache-Control', 'public, max-age=86400')

      let stream = fs.createReadStream(file_path)
      stream.pipe(res)
      return
    } catch (arg0_err: any) {
      console.error('[ApiMiddleware] Error streaming static GIS file:', arg0_err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Failed to stream static GIS file' }))
      return
    }
  }

  //Return statement
  return
}
