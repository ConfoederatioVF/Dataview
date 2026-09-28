import fs from 'fs'
import path from 'path'
import url from 'url'
import type { IncomingMessage, ServerResponse } from 'http'
import JSON5 from 'json5'
import { loadAndParseLayers, type LayerRegistryCache, type ParsedDataLayer } from './layer_parser.ts'
import {
  calculateDemographicPyramid,
  calculateSectorBreakdown,
  getLayerYearSourceMtime,
} from './raster_demographics_service.ts'
import { getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import {
  startTimelapseRenderJob,
  getTimelapseJobStatus,
  cancelTimelapseJob,
  type TimelapseRenderOptions,
} from './video_renderer.ts'
import { StadesterService } from './stadester_service.ts'
import { AtlasBordersService } from './AtlasBordersService.ts'
import { UfDate } from '../framework/utils/uf_date.ts'

export interface ApiMiddlewareOptions {
  configDir: string
  exportsDir: string
}

/**
 * Creates Connect/Express compatible HTTP middleware for Vite backend routes.
 *
 * @param {ApiMiddlewareOptions} arg0_options
 *
 * @returns {(req: IncomingMessage, res: ServerResponse, next: () => void) => void}
 */
export let createApiMiddleware = function (arg0_options: ApiMiddlewareOptions) {
  //Convert from parameters
  let options = arg0_options

  //Declare local instance variables
  let breakdown_cache = new Map<string, { mtime: number; payload: any }>()
  let config_dir = path.resolve(options.configDir)
  let exports_dir = path.resolve(options.exportsDir)
  let is_public_instance: () => boolean
  let permissions_path = fs.existsSync(path.join(config_dir, 'permissions', 'permissions.json5'))
    ? path.join(config_dir, 'permissions', 'permissions.json5')
    : path.join(config_dir, 'permissions.json5')
  let registry: LayerRegistryCache

  //Function body
  is_public_instance = function () {
    //Convert from parameters

    //Declare local instance variables
    let is_public = process.env.VITE_PUBLIC_BUILD === 'true'
    let parsed: any
    let raw: string

    //Function body
    if (fs.existsSync(permissions_path)) {
      try {
        raw = fs.readFileSync(permissions_path, 'utf-8')
        parsed = JSON5.parse(raw)
        if (parsed.is_public_build)
          is_public = true
      } catch {
        //Ignore
      }
    }

    //Return statement
    return is_public
  }

  //Check fallback for config_dir
  if (!fs.existsSync(path.join(config_dir, 'layers')) && fs.existsSync(path.resolve(process.cwd(), 'common/layers'))) {
    config_dir = path.resolve(process.cwd(), 'common')
    permissions_path = fs.existsSync(path.join(config_dir, 'permissions', 'permissions.json5'))
      ? path.join(config_dir, 'permissions', 'permissions.json5')
      : path.join(config_dir, 'permissions.json5')
  }

  //Initialise registry
  try {
    registry = loadAndParseLayers(config_dir)
  } catch (arg0_err) {
    console.error('[ApiMiddleware] Error initialising layer registry:', arg0_err)
    registry = {
      file_cache: new Map(),
      layers: {},
      resolved_roots: {},
    }
  }

  //Ensure exports directory exists
  if (!fs.existsSync(exports_dir))
    fs.mkdirSync(exports_dir, { recursive: true })

  //Return statement
  return function (req: IncomingMessage, res: ServerResponse, next: () => void) {
    let parsed_url = url.parse(req.url || '', true)
    let pathname = parsed_url.pathname || ''
    let query = parsed_url.query

    //Ensure config_dir fallback in request lifecycle
    if (!fs.existsSync(path.join(config_dir, 'layers')) && fs.existsSync(path.resolve(process.cwd(), 'common/layers'))) {
      config_dir = path.resolve(process.cwd(), 'common')
      permissions_path = fs.existsSync(path.join(config_dir, 'permissions', 'permissions.json5'))
        ? path.join(config_dir, 'permissions', 'permissions.json5')
        : path.join(config_dir, 'permissions.json5')
    }

    //Route 1: GET /api/layers
    if (pathname === '/layers' || pathname === '/api/layers') {
      try {
        registry = loadAndParseLayers(config_dir)
      } catch (arg0_err) {
        console.error('[ApiMiddleware] Error reloading layer registry:', arg0_err)
      }
      res.setHeader('Content-Type', 'application/json')
      res.statusCode = 200
      res.end(JSON.stringify({ layers: registry.layers, total: Object.keys(registry.layers).length }))
      return
    }

    //Route 2: GET /api/permissions
    if (pathname === '/permissions' || pathname === '/api/permissions') {
      res.setHeader('Content-Type', 'application/json')
      if (fs.existsSync(permissions_path)) {
        try {
          let raw = fs.readFileSync(permissions_path, 'utf-8')
          let parsed = JSON5.parse(raw)
          res.statusCode = 200
          res.end(JSON.stringify(parsed))
          return
        } catch (arg0_e) {
          console.error('[ApiMiddleware] Failed to parse permissions.json5:', arg0_e)
        }
      }
      res.statusCode = 200
      res.end(JSON.stringify({ roles: {}, default_role: 'default' }))
      return
    }

    //Route 2b: GET /api/optimisation
    if (pathname === '/optimisation' || pathname === '/api/optimisation') {
      let opt_info = getOptimisationConfig()
      res.setHeader('Content-Type', 'application/json')
      res.statusCode = 200
      res.end(JSON.stringify(opt_info))
      return
    }

    //Route 3: GET /api/raster/bounding
    if (pathname === '/raster/bounding' || pathname === '/api/raster/bounding') {
      let layer_id = query.layer as string
      let raw_year = parseFloat(query.year as string)

      if (!layer_id || Number.isNaN(raw_year)) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing or invalid layer or year parameter' }))
        return
      }

      //Find target layer
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
      return
    }

    //Route 4: GET /api/raster/file
    if (pathname === '/raster/file' || pathname === '/api/raster/file') {
      let layer = query.layer as string
      let year = query.year as string

      if (!layer || !year) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing layer or year parameter' }))
        return
      }

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

      //Strategy 1: Canonical sorted key (e.g. layer:indicator=net_wealth:1950)
      if (selector_param_keys.length > 0) {
        let combo_str = selector_param_keys.map((arg0_k) => `${arg0_k}=${query[arg0_k]}`).join(':')
        file_path = registry.file_cache.get(`${layer}:${combo_str}:${year}`)
      }

      //Strategy 2: Values-only key (e.g. layer:net_wealth:1950)
      if (!file_path && selector_param_keys.length > 0) {
        let vals_str = selector_param_keys.map((arg0_k) => query[arg0_k]).join(':')
        file_path = registry.file_cache.get(`${layer}:${vals_str}:${year}`)
      }

      //Strategy 3: Legacy positional (e.g. layer:profession:gender:1950)
      if (!file_path && (query.profession || query.gender)) {
        let prof = (query.profession as string) || 'agriculture'
        let gen = (query.gender as string) || 't'
        file_path = registry.file_cache.get(`${layer}:${prof}:${gen}:${year}`)
      }

      //Strategy 4: Single parameter fallback
      if (!file_path && selector_param_keys.length === 1) {
        let val = query[selector_param_keys[0]] as string
        file_path = registry.file_cache.get(`${layer}:${val}:${year}`)
      }

      //Strategy 5: Default layer:year key
      if (!file_path) {
        file_path = registry.file_cache.get(`${layer}:${year}`)
      }

      //Strategy 6: Legacy default fallback
      if (!file_path) {
        file_path = registry.file_cache.get(`${layer}:agriculture:t:${year}`)
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

    //Route 5: GET / POST /api/raster/breakdown
    if (pathname === '/raster/breakdown' || pathname === '/api/raster/breakdown') {
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
        let params = arg0_params
        let countries_str = Array.isArray(params.countries)
          ? params.countries.join(',')
          : (params.countries || '').trim()
        let country = (params.country || '').trim()
        let geometries = params.geometries
        let geometry = params.geometry
        let layer = params.layer || 'age_sex'
        let raw_x = params.x
        let raw_y = params.y
        let year = params.year || 1950

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
      return
    }

    //Guard Clause: Block developer export endpoints on public instances
    if (pathname.startsWith('/export/') || pathname.startsWith('/api/export/')) {
      if (is_public_instance()) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Developer export tools are disabled on public instances.' }))
        return
      }
    }

    //Route 6: POST /api/export/video
    if ((pathname === '/export/video' || pathname === '/api/export/video') && req.method === 'POST') {
      let body_chunks: Buffer[] = []
      req.on('data', (arg0_chunk) => {
        body_chunks.push(arg0_chunk)
      })

      req.on('end', () => {
        try {
          let raw_body = Buffer.concat(body_chunks).toString('utf-8')
          let payload = JSON.parse(raw_body)
          let base64_data = (payload.data || payload.videoData) as string

          if (!base64_data) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing video data in payload' }))
            return
          }

          let is_webm =
            base64_data.startsWith('data:video/webm') ||
            (payload.metadata?.mimeType && payload.metadata.mimeType.includes('webm')) ||
            payload.format === 'webm'
          let default_ext = is_webm ? '.webm' : '.mp4'
          let filename = payload.filename || `export_${Date.now()}${default_ext}`
          if (!filename.endsWith('.mp4') && !filename.endsWith('.webm'))
            filename = `${filename}${default_ext}`

          if (!fs.existsSync(exports_dir))
            fs.mkdirSync(exports_dir, { recursive: true })

          let out_path = path.join(exports_dir, filename)
          let clean_base64 = base64_data.replace(/^data:[^;]+;base64,/, '')
          let video_buffer = Buffer.from(clean_base64, 'base64')
          fs.writeFileSync(out_path, video_buffer)
          console.log(`[ApiMiddleware] Saved video export to: ${out_path} (${video_buffer.length} bytes)`)

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              filename,
              message: 'Video export successfully saved to exports directory.',
              path: out_path,
              sizeBytes: video_buffer.length,
              success: true,
            })
          )
        } catch (arg0_e) {
          console.error('[ApiMiddleware] Failed to save video export:', arg0_e)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to process video export payload' }))
        }
      })
      return
    }

    //Route 7: POST /api/export/start-render
    if ((pathname === '/export/start-render' || pathname === '/api/export/start-render') && req.method === 'POST') {
      let body_chunks: Buffer[] = []
      req.on('data', (arg0_chunk) => {
        body_chunks.push(arg0_chunk)
      })

      req.on('end', async () => {
        try {
          let raw_body = Buffer.concat(body_chunks).toString('utf-8')
          let payload: TimelapseRenderOptions = JSON.parse(raw_body)

          let job = await startTimelapseRenderJob(payload, exports_dir, undefined, registry.layers)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(job))
        } catch (arg0_err: any) {
          console.error('[ApiMiddleware] Failed to start timelapse render job:', arg0_err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: arg0_err?.message || 'Failed to start timelapse render job' }))
        }
      })
      return
    }

    //Route 8: GET /api/export/status
    if (pathname === '/export/status' || pathname === '/api/export/status') {
      let job_id = (query.jobId as string) || (query.id as string) || ''
      if (!job_id) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing jobId parameter' }))
        return
      }

      let job = getTimelapseJobStatus(job_id)
      if (!job) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `No timelapse job found with ID: ${job_id}` }))
        return
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify(job))
      return
    }

    //Route 9: POST /api/export/cancel
    if ((pathname === '/export/cancel' || pathname === '/api/export/cancel') && req.method === 'POST') {
      let body_chunks: Buffer[] = []
      req.on('data', (arg0_chunk) => {
        body_chunks.push(arg0_chunk)
      })

      req.on('end', () => {
        try {
          let raw_body = Buffer.concat(body_chunks).toString('utf-8')
          let payload = JSON.parse(raw_body)
          let job_id = payload.jobId || ''

          if (!job_id) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing jobId parameter' }))
            return
          }

          cancelTimelapseJob(job_id)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ message: `Timelapse job ${job_id} cancelled.`, success: true }))
        } catch (arg0_err: any) {
          console.error('[ApiMiddleware] Failed to cancel timelapse job:', arg0_err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Failed to cancel timelapse job' }))
        }
      })
      return
    }

    //Route 10: GET /api/export/download
    if (pathname === '/export/download' || pathname === '/api/export/download') {
      let filename = (query.filename as string) || ''
      if (!filename) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing filename parameter' }))
        return
      }

      let safe_filename = path.basename(filename)
      let file_path = path.join(exports_dir, safe_filename)

      if (!fs.existsSync(file_path)) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: `File not found: ${safe_filename}` }))
        return
      }

      let stats = fs.statSync(file_path)
      res.statusCode = 200
      res.setHeader('Content-Type', 'video/mp4')
      res.setHeader('Content-Length', stats.size)
      res.setHeader('Content-Disposition', `inline; filename="${safe_filename}"`)
      let stream = fs.createReadStream(file_path)
      stream.pipe(res)
      return
    }

    //Route 11: GET /api/export/folders
    if (pathname === '/export/folders' || pathname === '/api/export/folders') {
      let folders_list: any[] = []
      let frames_root = path.join(exports_dir, 'frames')

      if (fs.existsSync(frames_root)) {
        let entries = fs.readdirSync(frames_root, { withFileTypes: true })
        for (let i = 0; i < entries.length; i++) {
          let ent = entries[i]
          if (ent.isDirectory()) {
            let folder_path = path.join(frames_root, ent.name)
            let manifest: any = null
            let manifest_path = path.join(folder_path, 'manifest.json')
            if (fs.existsSync(manifest_path)) {
              try {
                manifest = JSON.parse(fs.readFileSync(manifest_path, 'utf-8'))
              } catch {
                //Ignore malformed manifest
              }
            }

            //Count rendered PNG frames across target subdirectories
            let completed_frames = 0
            try {
              let sub_items = fs.readdirSync(folder_path, { withFileTypes: true })
              for (let x = 0; x < sub_items.length; x++) {
                let sub = sub_items[x]
                if (sub.isDirectory() && sub.name.startsWith('target_')) {
                  let sub_dir = path.join(folder_path, sub.name)
                  let files = fs.readdirSync(sub_dir)
                  for (let f = 0; f < files.length; f++) {
                    if (files[f].endsWith('.png'))
                      completed_frames++
                  }
                }
              }
            } catch {
              //Ignore read errors
            }

            let stats = fs.statSync(folder_path)
            folders_list.push({
              completedFrames: completed_frames,
              createdAt: stats.birthtimeMs || stats.mtimeMs,
              folder: ent.name,
              manifest,
              mtimeMs: stats.mtimeMs,
              name: ent.name,
              totalFrames: manifest?.total_frames || completed_frames,
            })
          }
        }
      }

      folders_list.sort((arg0_a, arg0_b) => arg0_b.mtimeMs - arg0_a.mtimeMs)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ folders: folders_list }))
      return
    }

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
    if (pathname === '/stadester/cities' || pathname === '/api/stadester/cities') {
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

      try {
        if (format === 'compact') {
          let compact_payload = StadesterService.getCompactCitiesAtYear(dataset, year, {
            bbox,
            color_mode,
            max_cities,
            min_pop,
          })
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(compact_payload))
          return
        }

        let cities = StadesterService.getCitiesAtYear(dataset, year, {
          bbox,
          color_mode,
          max_cities,
          min_pop,
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

        res.end(JSON.stringify({
          cities,
          count: cities.length,
          dataset,
          year,
        }))
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
      let dataset = (query.dataset as string) || 'stadester_1.1'

      if (!city_key) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: 'Missing city key parameter' }))
        return
      }

      try {
        let city = StadesterService.getCityByKey(dataset, city_key)
        if (!city) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: `City not found: ${city_key}` }))
          return
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'public, max-age=3600')
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

    //Route 16: GET /api/atlas/borders or /api/gis/borders (Streamed or batch historical country boundaries)
    if (
      pathname === '/atlas/borders' ||
      pathname === '/api/atlas/borders' ||
      pathname === '/gis/borders' ||
      pathname === '/api/gis/borders'
    ) {
      let bbox_param = query.bbox as string
      let bbox: [number, number, number, number] | undefined = undefined
      if (bbox_param) {
        let parts = bbox_param.split(',').map(Number)
        if (parts.length === 4 && !parts.some(Number.isNaN))
          bbox = [parts[0], parts[1], parts[2], parts[3]]
      }
      let dataset = (query.dataset as string) || 'statistical_borders'
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

        let borders_payload = AtlasBordersService.getBordersAtYear(year, { bbox, dataset, day, month })
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'public, max-age=3600')
        res.end(JSON.stringify(borders_payload))
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
      let target_layer = registry.layers[layer_id]

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

    //Continue to next middleware
    next()
  }
}
