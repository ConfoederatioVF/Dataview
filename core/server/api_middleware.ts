import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import JSON5 from 'json5'
import path from 'path'
import url from 'url'
import { getOptimisationConfig } from '../../common/optimisation/optimisation.ts'
import { loadAndParseLayers, type LayerRegistryCache } from './layer_parser.ts'
import { handleAtlasRoute } from './routes/atlas_routes.ts'
import { handleExportRoute } from './routes/export_routes.ts'
import { handleRasterBounding, handleRasterBreakdown, handleRasterFile } from './routes/raster_routes.ts'
import { handleStadesterRoute } from './routes/stadester_routes.ts'

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
      handleRasterBounding({ breakdown_cache, query, registry, req, res })
      return
    }

    //Route 4: GET /api/raster/file
    if (pathname === '/raster/file' || pathname === '/api/raster/file') {
      handleRasterFile({ breakdown_cache, query, registry, req, res })
      return
    }

    //Route 5: GET / POST /api/raster/breakdown
    if (pathname === '/raster/breakdown' || pathname === '/api/raster/breakdown') {
      handleRasterBreakdown({ breakdown_cache, query, registry, req, res })
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

      handleExportRoute({ exports_dir, layers: registry.layers, pathname, query, req, res })
      return
    }

    //Route 12 - 15: Stadester historical city routes
    if (pathname.startsWith('/stadester/') || pathname.startsWith('/api/stadester/')) {
      handleStadesterRoute({ pathname, query, req, res })
      return
    }

    //Route 15 - 18: Atlas / GIS historical border routes
    if (
      pathname.startsWith('/atlas/') ||
      pathname.startsWith('/api/atlas/') ||
      pathname.startsWith('/gis/') ||
      pathname.startsWith('/api/gis/')
    ) {
      handleAtlasRoute({ layers: registry.layers, pathname, query, req, res })
      return
    }

    //Continue to next middleware
    next()
  }
}
