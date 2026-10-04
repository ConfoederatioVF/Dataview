import { useState, useEffect, useRef } from 'react'
import type { HistoricalBorderFeature, HistoricalBordersResponse } from '@server/AtlasBordersService'
import { UfDate } from '@framework/utils/uf_date'

export interface HistoricalBordersHookResult {
  bordersData: {
    features: HistoricalBorderFeature[]
    type: 'FeatureCollection'
  } | null
  domain: [number, number] | null
  error: string | null
  isLoading: boolean
  source: 'cshapes' | 'naissance' | null
  year: number
}

let client_borders_cache = new Map<string, HistoricalBordersResponse>()

/**
 * Hook to asynchronously fetch and cache historical borders from CShapes-2.0 and atlas.naissance.
 * Supports sub-yearly continuous dates and capped client caching.
 *
 * @param {string | null} [arg0_active_layer_id]
 * @param {number} arg1_timeline_year
 * @param {boolean} [arg2_enabled=false]
 * @param {string} [arg3_dataset]
 *
 * @returns {HistoricalBordersHookResult}
 */
export let useHistoricalBorders = function (
  arg0_active_layer_id?: string | null,
  arg1_timeline_year: number = 1950,
  arg2_enabled: boolean = false,
  arg3_dataset?: string
): HistoricalBordersHookResult {
  //Convert from parameters
  let active_layer_id = arg0_active_layer_id
  let custom_dataset = arg3_dataset
  let enabled = arg2_enabled
  let timeline_year = arg1_timeline_year

  //Declare local instance variables
  let abort_controller_ref = useRef<AbortController | null>(null)
  let borders_data: { features: HistoricalBorderFeature[]; type: 'FeatureCollection' } | null
  let cache_key: string
  let dataset = custom_dataset || (active_layer_id && active_layer_id.includes('border') ? active_layer_id : 'statistical_borders')
  let date_obj = UfDate.fromFractionalYear(timeline_year)
  let domain: [number, number] | null
  let error: string | null
  let is_active: boolean
  let is_loading: boolean
  let set_borders_data: React.Dispatch<React.SetStateAction<{ features: HistoricalBorderFeature[]; type: 'FeatureCollection' } | null>>
  let set_domain: React.Dispatch<React.SetStateAction<[number, number] | null>>
  let set_error: React.Dispatch<React.SetStateAction<string | null>>
  let set_is_loading: React.Dispatch<React.SetStateAction<boolean>>
  let set_source: React.Dispatch<React.SetStateAction<'cshapes' | 'naissance' | null>>
  let source: 'cshapes' | 'naissance' | null

  //Function body
  ;[borders_data, set_borders_data] = useState<{ features: HistoricalBorderFeature[]; type: 'FeatureCollection' } | null>(null)
  ;[domain, set_domain] = useState<[number, number] | null>(null)
  ;[error, set_error] = useState<string | null>(null)
  ;[is_loading, set_is_loading] = useState<boolean>(false)
  ;[source, set_source] = useState<'cshapes' | 'naissance' | null>(null)

  cache_key = `${dataset}:${date_obj.year}-${date_obj.month}-${date_obj.day}`
  is_active = enabled || active_layer_id === 'statistical_borders' || active_layer_id === 'detailed_borders' || active_layer_id === 'simplified_borders' || Boolean(active_layer_id && active_layer_id.includes('border'))

  useEffect(() => {
    //Guard clauses
    if (!is_active) {
      set_borders_data(null)
      set_is_loading(false)
      set_error(null)
      return
    }

    //Check client cache
    if (client_borders_cache.has(cache_key)) {
      let cached = client_borders_cache.get(cache_key)!
      let cached_collection: { features: HistoricalBorderFeature[]; type: 'FeatureCollection' } =
        (cached as any).collection || {
          features: cached.features,
          type: 'FeatureCollection',
        }
      ;(cached as any).collection = cached_collection

      set_borders_data((arg0_prev) => (arg0_prev?.features === cached_collection.features ? arg0_prev : cached_collection))
      set_domain(cached.domain)
      set_source(cached.source)
      set_is_loading(false)
      set_error(null)
      return
    }

    //Abort any pending in-flight request
    if (abort_controller_ref.current)
      abort_controller_ref.current.abort()

    let controller = new AbortController()
    abort_controller_ref.current = controller
    set_is_loading(true)
    set_error(null)

    //Fetch sliced borders from backend API with sub-yearly precision
    fetch(`/api/atlas/borders?year=${timeline_year}&dataset=${dataset}&day=${date_obj.day}&month=${date_obj.month}`, {
      signal: controller.signal,
    })
      .then((arg0_res) => {
        if (!arg0_res.ok)
          throw new Error(`HTTP error ${arg0_res.status}`)
        return arg0_res.json()
      })
      .then((arg0_json: HistoricalBordersResponse) => {
        //Cap client-side cache to 40 entries
        if (client_borders_cache.size >= 40) {
          let oldest_k = client_borders_cache.keys().next().value
          if (oldest_k)
            client_borders_cache.delete(oldest_k)
        }

        let new_collection: { features: HistoricalBorderFeature[]; type: 'FeatureCollection' } = {
          features: arg0_json.features,
          type: 'FeatureCollection',
        }
        ;(arg0_json as any).collection = new_collection

        client_borders_cache.set(cache_key, arg0_json)
        set_borders_data((arg0_prev) => (arg0_prev?.features === new_collection.features ? arg0_prev : new_collection))
        set_domain(arg0_json.domain)
        set_source(arg0_json.source)
        set_is_loading(false)
      })
      .catch((arg0_err: any) => {
        if (arg0_err?.name === 'AbortError')
          return
        console.error('[useHistoricalBorders] Failed to load borders:', arg0_err)
        set_error(arg0_err?.message || 'Error loading historical borders')
        set_is_loading(false)
      })

    return () => {
      controller.abort()
    }
  }, [cache_key, dataset, is_active, timeline_year, date_obj.day, date_obj.month])

  //Return statement
  return {
    bordersData: borders_data,
    domain,
    error,
    isLoading: is_loading,
    source,
    year: timeline_year,
  }
}

