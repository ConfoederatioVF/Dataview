/**
 * Client-side event dispatcher and listener management for real-time config hot reloading.
 *
 * @module framework/config/config_hot_reload
 */

export type ConfigUpdateListener = (arg0_data: any) => void
export type LayersUpdateListener = (arg0_layers: Record<string, any>) => void

let all_config_listeners: Map<string, Set<ConfigUpdateListener>> = new Map()
let all_layers_listeners: Set<LayersUpdateListener> = new Set()

/**
 * Notifies all registered listeners for a specific config category.
 *
 * @param {string} arg0_category
 * @param {any} arg1_data
 */
export function notifyConfigUpdate (arg0_category: string, arg1_data: any): void {
  //Convert from parameters
  let category = arg0_category
  let data = arg1_data

  //Declare local instance variables
  let category_listeners = all_config_listeners.get(category)

  //Guard clauses
  if (!category_listeners || category_listeners.size === 0)
    return

  //Function body
  category_listeners.forEach((arg0_cb) => {
    try {
      arg0_cb(data)
    } catch (arg0_err) {
      console.error(`[ConfigHotReload] Error executing listener for category '${category}':`, arg0_err)
    }
  })
}

/**
 * Notifies all registered listeners for layers updates.
 *
 * @param {Record<string, any>} arg0_layers
 */
export function notifyLayersUpdate (arg0_layers: Record<string, any>): void {
  //Convert from parameters
  let layers = arg0_layers

  //Guard clauses
  if (!all_layers_listeners || all_layers_listeners.size === 0)
    return

  //Function body
  all_layers_listeners.forEach((arg0_cb) => {
    try {
      arg0_cb(layers)
    } catch (arg0_err) {
      console.error('[ConfigHotReload] Error executing layers listener:', arg0_err)
    }
  })
}

/**
 * Subscribes a callback to hot updates for a specific configuration category.
 * Returns an unsubscribe function.
 *
 * @param {string} arg0_category
 * @param {ConfigUpdateListener} arg1_callback
 *
 * @returns {() => void}
 */
export function onConfigUpdate (
  arg0_category: string,
  arg1_callback: ConfigUpdateListener
): () => void {
  //Convert from parameters
  let callback = arg1_callback
  let category = arg0_category

  //Declare local instance variables
  let listeners_set: Set<ConfigUpdateListener>

  //Function body
  if (!all_config_listeners.has(category))
    all_config_listeners.set(category, new Set())

  listeners_set = all_config_listeners.get(category)!
  listeners_set.add(callback)

  //Return statement
  return function () {
    listeners_set.delete(callback)
  }
}

/**
 * Subscribes a callback to hot updates for layers definitions.
 * Returns an unsubscribe function.
 *
 * @param {LayersUpdateListener} arg0_callback
 *
 * @returns {() => void}
 */
export function onLayersUpdate (arg0_callback: LayersUpdateListener): () => void {
  //Convert from parameters
  let callback = arg0_callback

  //Function body
  all_layers_listeners.add(callback)

  //Return statement
  return function () {
    all_layers_listeners.delete(callback)
  }
}

//Initialise Vite HMR listener if running in development environment
if (import.meta.hot) {
  import.meta.hot.on('dataview:layers-update', (arg0_payload: any) => {
    let payload = arg0_payload
    let next_layers = payload?.layers || payload?.data?.layers || (payload && !payload.type ? payload : null)
    if (next_layers && typeof next_layers === 'object') {
      console.log(`[ConfigHotReload] Received dataview:layers-update for ${Object.keys(next_layers).length} layers.`)
      notifyLayersUpdate(next_layers)
    }
  })

  import.meta.hot.on('dataview:config-update', (arg0_payload: any) => {
    let payload = arg0_payload
    let category = payload?.category || payload?.data?.category
    let data = payload?.data !== undefined ? payload.data : payload
    if (category) {
      console.log(`[ConfigHotReload] Hot reloaded config category '${category}' in real time.`)
      if (category === 'localisation') {
        notifyConfigUpdate(category, {
          data: data,
          dictionary: payload.dictionary || payload.data || data,
          locale: payload.locale,
        })
      } else {
        notifyConfigUpdate(category, data)
      }
    }
  })
}
