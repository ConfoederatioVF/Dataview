import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'fs'
import path from 'path'
import JSON5 from 'json5'
import { createApiMiddleware } from './core/server/api_middleware.ts'
import { clearAtlasConfigCache } from './core/server/atlas_config_loader.ts'
import { loadAndParseLayers } from './core/server/layer_parser.ts'
import { clearCompressedBordersCache } from './core/server/routes/atlas_routes.ts'

/**
 * Broadcasts an HMR custom payload across all available Vite server hot channels.
 *
 * @param {any} arg0_server
 * @param {string} arg1_event
 * @param {any} arg2_data
 *
 * @returns {void}
 */
function broadcastHotMessage (arg0_server: any, arg0_event: string, arg1_data: any): void {
  //Convert from parameters
  let data = arg1_data
  let event = arg0_event
  let server = arg0_server

  //Declare local instance variables
  let payload = {
    data: data,
    event: event,
    type: 'custom',
  }

  //Function body
  try {
    if (server.hot) {
      server.hot.send(event, data)
    } else if (server.ws) {
      server.ws.send(payload)
    }
  } catch (arg0_err) {
    console.error(`[HMR] Failed to broadcast event '${event}':`, arg0_err)
  }
}

/**
 * Processes hot update events for configuration, layer, and localisation files.
 *
 * @param {string} arg0_file
 * @param {any} arg1_server
 *
 * @returns {Array<any> | undefined}
 */
function handleDataviewHotUpdate (arg0_file: string, arg1_server: any): any[] | void {
  //Convert from parameters
  let file = arg0_file
  let server = arg1_server

  //Declare local instance variables
  let normalized_file = file.replace(/\\/g, '/')

  //Guard clauses
  if (
    normalized_file.includes('/data/') ||
    normalized_file.includes('/dist/') ||
    normalized_file.includes('/exports/') ||
    normalized_file.includes('/.agents/') ||
    normalized_file.includes('/docs/') ||
    normalized_file.includes('/tests/') ||
    normalized_file.endsWith('.log') ||
    normalized_file.includes('/.git/')
  )
    return []

  //Function body

  //Handle common/ and localisation/ hot updates
  if (normalized_file.includes('/common/') || normalized_file.includes('/localisation/')) {
    //1. Layers update: common/layers/ (including filepath_defines.json5 and individual layer configs)
    if (normalized_file.includes('/common/layers/')) {
      try {
        clearAtlasConfigCache()
        clearCompressedBordersCache()

        let config_dir = path.resolve(import.meta.dirname, './common')
        let registry = loadAndParseLayers(config_dir)

        broadcastHotMessage(server, 'dataview:layers-update', {
          layers: registry.layers,
          total: Object.keys(registry.layers).length,
        })
        console.log(`[HMR] Reloaded layers config and broadcasted dataview:layers-update (${Object.keys(registry.layers).length} layers) for: ${normalized_file}`)
      } catch (arg0_err) {
        console.error('[HMR] Error reloading layers:', arg0_err)
      }

      //Return statement
      return []
    }

    //2. Localisation update: localisation/*.json5 or *.json
    if (normalized_file.includes('/localisation/') && (normalized_file.endsWith('.json5') || normalized_file.endsWith('.json'))) {
      try {
        let base_name = path.basename(file, path.extname(file))
        let normalized_base = base_name.toLowerCase()
        let locale_key = (normalized_base === 'en_gb' || normalized_base === 'en-gb') ? 'en-GB' : normalized_base
        let raw_content = fs.readFileSync(file, 'utf-8')
        let parsed_dict = JSON5.parse(raw_content)

        broadcastHotMessage(server, 'dataview:config-update', {
          category: 'localisation',
          data: parsed_dict,
          dictionary: parsed_dict,
          file: normalized_file,
          locale: locale_key,
        })
      } catch (arg0_err) {
        console.error('[HMR] Error reloading localisation:', arg0_err)
      }

      //Return statement
      return []
    }

    //3. Common config files: panes/info, panes/mapmodes, panes/alerts, etc.
    if (normalized_file.endsWith('.json5') || normalized_file.endsWith('.json')) {
      try {
        let base_name = path.basename(file, path.extname(file))
        let raw_content = fs.readFileSync(file, 'utf-8')
        let parsed_data = JSON5.parse(raw_content)

        broadcastHotMessage(server, 'dataview:config-update', {
          category: base_name,
          data: parsed_data,
          file: normalized_file,
        })
      } catch (arg0_err) {
        console.error(`[HMR] Error reloading config ${file}:`, arg0_err)
      }

      //Return statement
      return []
    }

    //4. Markdown documentation or notes in common/ or localisation/
    if (normalized_file.endsWith('.md')) {
      try {
        let base_name = path.basename(file, '.md')
        let raw_content = fs.readFileSync(file, 'utf-8')

        broadcastHotMessage(server, 'dataview:config-update', {
          category: base_name,
          data: raw_content,
          file: normalized_file,
        })
      } catch (arg0_err) {
        console.error(`[HMR] Error reloading markdown ${file}:`, arg0_err)
      }

      //Return statement
      return []
    }

    //For other non-script data files in common, prevent full-page reload
    if (!normalized_file.endsWith('.ts') && !normalized_file.endsWith('.tsx') && !normalized_file.endsWith('.js') && !normalized_file.endsWith('.jsx')) {
      //Return statement
      return []
    }
  }

  //Return statement
  return undefined
}


let dataview_hot_timeout: NodeJS.Timeout | null = null

/**
 * Debounced wrapper for processing hot update events for configuration, layer, and localisation files.
 *
 * @param {string} arg0_file
 * @param {any} arg1_server
 *
 * @returns {Array<any> | undefined}
 */
function debouncedHandleDataviewHotUpdate (arg0_file: string, arg1_server: any): any[] | void {
  //Convert from parameters
  let file = arg0_file
  let server = arg1_server

  //Function body
  if (dataview_hot_timeout)
    clearTimeout(dataview_hot_timeout)

  dataview_hot_timeout = setTimeout(() => {
    handleDataviewHotUpdate(file, server)
  }, 100)

  //Return statement
  return []
}


/**
 * Custom Vite plugin providing backend API middleware and hot update handling.
 *
 * @returns {Plugin}
 */
function dataviewBackendPlugin (): Plugin {
  //Return statement
  return {
    name: 'dataview-backend',
    enforce: 'pre',
    configureServer (arg0_server) {
      //Convert from parameters
      let server = arg0_server

      //Explicitly watch common/ and localisation/ directories to ensure non-module JSON5 edits trigger HMR
      server.watcher.add(path.resolve(import.meta.dirname, './common'))
      server.watcher.add(path.resolve(import.meta.dirname, './localisation'))

      server.watcher.on('all', (arg0_event, arg1_file_path) => {
        if (arg0_event === 'change' || arg0_event === 'add' || arg0_event === 'unlink')
          debouncedHandleDataviewHotUpdate(arg1_file_path, server)
      })

      //Function body
      server.middlewares.use(
        createApiMiddleware({
          configDir: path.resolve(import.meta.dirname, './common'),
          exportsDir: path.resolve(import.meta.dirname, './exports'),
        })
      )
    },
    configurePreviewServer (arg0_server) {
      //Convert from parameters
      let server = arg0_server

      //Function body
      server.middlewares.use(
        createApiMiddleware({
          configDir: path.resolve(import.meta.dirname, './common'),
          exportsDir: path.resolve(import.meta.dirname, './exports'),
        })
      )
    },
    hotUpdate: {
      order: 'pre',
      handler (arg0_ctx) {
        //Convert from parameters
        let ctx = arg0_ctx

        //Return statement
        return debouncedHandleDataviewHotUpdate(ctx.file, ctx.server) as any
      },
    },
    handleHotUpdate (arg0_ctx) {
      //Convert from parameters
      let ctx = arg0_ctx

      //Return statement
      return debouncedHandleDataviewHotUpdate(ctx.file, ctx.server) as any
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  server: {
    port: 15000,
    strictPort: true,
    host: true,
    allowedHosts: true,
    hmr: {
      timeout: 120000,
    },
    watch: {
      ignored: [
        '**/data/**',
        '**/dist/**',
        '**/exports/**',
        '**/.agents/**',
        '**/docs/**',
        '**/tests/**',
        '**/*.log',
      ],
    },
  },
  preview: {
    port: 15000,
    strictPort: true,
    host: true,
    allowedHosts: true,
  },
  plugins: [dataviewBackendPlugin(), react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './core'),
      '@core': path.resolve(import.meta.dirname, './core'),
      '@common': path.resolve(import.meta.dirname, './common'),
      '@config': path.resolve(import.meta.dirname, './common'),
      'config': path.resolve(import.meta.dirname, './common'),
      '@framework': path.resolve(import.meta.dirname, './core/framework'),
      '@server': path.resolve(import.meta.dirname, './core/server'),
      '@ui': path.resolve(import.meta.dirname, './core/ui'),
      '@localisation': path.resolve(import.meta.dirname, './localisation'),
    },
  },
})

