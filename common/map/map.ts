import JSON5 from 'json5'
import rawAtlasConfig from '../layers/atlas.json5?raw'
import rawMapConfig from './map.json5?raw'
import { onConfigUpdate, onLayersUpdate } from '@framework/config/config_hot_reload'

export interface BasemapDefinition {
  id: 'dark' | 'light' | 'satellite' | 'topo' | 'none'
  label: string
  url?: string
  attribution?: string
}

export interface MapDefines {
  initialMercator: {
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
    maxZoom: number
    minZoom: number
    pixelOffset?: number
  }
  initialGlobe: {
    longitude: number
    latitude: number
    zoom: number
    pitch: number
    bearing: number
    maxZoom: number
    minZoom: number
    pixelOffset?: number
  }
  initialEquirectangular: {
    target: [number, number, number]
    zoom: number
    minZoom: number
    maxZoom: number
    pixelOffset?: number
  }
  initialEqualEarth?: {
    target: [number, number, number]
    zoom: number
    minZoom: number
    maxZoom: number
    pixelOffset?: number
  }
  graticule: {
    latInterval: number
    lngInterval: number
    color: [number, number, number, number]
  }
}

export interface MapConfig {
  basemapLayers: BasemapDefinition[]
  defaultDataLayers?: string[]
  defaultPercentileBreaks: string
  desktopPickRadius?: number
  equalEarthPixelOffset?: number
  equirectangularPixelOffset?: number
  globePixelOffset?: number
  mapDefines: MapDefines
  mercatorPixelOffset?: number
  touchPickRadius?: number
}

export let ATLAS_CONFIG: Record<string, any> = JSON5.parse(rawAtlasConfig)
export let MAP_CONFIG: MapConfig = JSON5.parse(rawMapConfig)

//Keep in-place object reference synchronised on hot reload
onConfigUpdate('map', (arg0_next_config) => {
  if (arg0_next_config && typeof arg0_next_config === 'object')
    Object.assign(MAP_CONFIG, arg0_next_config)
})

onLayersUpdate((arg0_next_layers) => {
  if (arg0_next_layers && typeof arg0_next_layers === 'object') {
    if (arg0_next_layers.dejure_borders)
      ATLAS_CONFIG.dejure_borders = arg0_next_layers.dejure_borders
    if (arg0_next_layers.defacto_borders)
      ATLAS_CONFIG.defacto_borders = arg0_next_layers.defacto_borders
  }
})

/**
 * Returns the configured pixel offset for a given projection mode.
 * Defaults to 0 if unspecified.
 *
 * @param {string} arg0_projection
 *
 * @returns {number}
 */
export function getPixelOffset (arg0_projection: string): number {
  //Convert from parameters
  let projection = arg0_projection

  //Declare local instance variables
  let defs = MAP_CONFIG.mapDefines as any

  //Guard clauses
  if (!defs)
    return 0

  //Function body
  if (projection === 'Mercator') {
    return defs.initialMercator?.pixelOffset ?? defs.mercator?.pixelOffset ?? MAP_CONFIG.mercatorPixelOffset ?? 0
  } else if (projection === 'Globe') {
    return defs.initialGlobe?.pixelOffset ?? defs.globe?.pixelOffset ?? MAP_CONFIG.globePixelOffset ?? 0
  } else if (projection === 'Equirectangular') {
    return defs.initialEquirectangular?.pixelOffset ?? defs.equirectangular?.pixelOffset ?? MAP_CONFIG.equirectangularPixelOffset ?? 0
  } else if (projection === 'EqualEarth') {
    return defs.initialEqualEarth?.pixelOffset ?? defs.equalEarth?.pixelOffset ?? MAP_CONFIG.equalEarthPixelOffset ?? 0
  }

  //Return statement
  return 0
}
