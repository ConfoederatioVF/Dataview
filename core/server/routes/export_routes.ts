import fs from 'fs'
import type { IncomingMessage, ServerResponse } from 'http'
import path from 'path'
import type { ParsedUrlQuery } from 'querystring'
import type { ParsedDataLayer } from '../layer_parser.ts'
import {
  cancelTimelapseJob,
  getTimelapseJobStatus,
  startTimelapseRenderJob,
  type TimelapseRenderOptions,
} from '../video_renderer.ts'

export interface ExportRouteContext {
  exports_dir: string
  layers: Record<string, ParsedDataLayer>
  pathname: string
  query: ParsedUrlQuery
  req: IncomingMessage
  res: ServerResponse
}

/**
 * Handles developer video export routes: video save, start render, status, cancel, download, and folders.
 *
 * @param {ExportRouteContext} arg0_context
 *
 * @returns {void}
 */
export function handleExportRoute (arg0_context: ExportRouteContext): void {
  //Convert from parameters
  let context = arg0_context

  //Declare local instance variables
  let exports_dir = context.exports_dir
  let layers = context.layers
  let pathname = context.pathname
  let query = context.query
  let req = context.req
  let res = context.res

  //Function body

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

        let job = await startTimelapseRenderJob(payload, exports_dir, undefined, layers)
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

  //Return statement
  return
}
