import * as fs from 'fs'
import * as path from 'path'
import { A_buildPolityLinkRegistry } from './a_build_polity_link_registry.ts'
import { B_fetchWikipediaSources } from './b_fetch_wikipedia_sources.ts'
import { C_parsePolityCapitals } from './c_parse_capital_infoboxes.ts'
import { D_correlatePolityWithStadester, type CityLookupEntry } from './d_correlate_capitals_with_stadester.ts'
import { E_generateAuthoritativeCapitals } from './e_generate_authoritative_capitals.ts'

export interface PipelineOptions {
  batch_size?: number
  concurrency_delay_ms?: number
  force_fetch?: boolean
  max_entries?: number
  only_state_ids?: number[]
}

/**
 * Sanitises title strings for safe cross-platform filesystem filenames.
 *
 * @param {string} arg0_title
 * @returns {string}
 */
function sanitizeFilename (arg0_title: string): string {
  //Convert from parameters
  let title = arg0_title

  //Function body
  let clean = title.replace(/[/\\?%*:|"<>]/g, '_').trim()
  if (clean.length > 120)
    clean = clean.substring(0, 120)

  //Return statement
  return clean || 'unnamed'
}

/**
 * Runs the end-to-end Wikipedia capital correlation pipeline in tests/capitals.
 *
 * @param {PipelineOptions} [arg0_options]
 *
 * @returns {Promise<any>}
 */
export let runCapitalPipeline = async function (arg0_options?: PipelineOptions): Promise<any> {
  //Convert from parameters
  let options = arg0_options ? arg0_options : {}

  //Declare local instance variables
  let base_cache_dir = path.resolve(process.cwd(), 'data/atlas/cache/wikipedia')
  let city_candidates = new Map<string, CityLookupEntry[]>()
  let coords_path = path.resolve(process.cwd(), 'data/stadester/all_cities_coords.json')
  let correlated_results: Record<string, any> = {}
  let registry: any[]

  //Function body
  console.log('[runCapitalPipeline] Step A: Building polity link registry...')
  registry = await A_buildPolityLinkRegistry()

  console.log('[runCapitalPipeline] Step B: Fetching Wikipedia sources...')
  await B_fetchWikipediaSources(registry, {
    batch_size: options.batch_size,
    concurrency_delay_ms: options.concurrency_delay_ms,
    force_refresh: options.force_fetch,
    max_entries: options.max_entries,
    only_state_ids: options.only_state_ids,
  })

  console.log('[runCapitalPipeline] Loading Stadestér city indices for spatiotemporal correlation...')
  if (fs.existsSync(coords_path)) {
    try {
      let raw_coords = JSON.parse(fs.readFileSync(coords_path, 'utf-8'))
      for (let k of Object.keys(raw_coords)) {
        let c = raw_coords[k]
        if (c && c.name && c.coords) {
          let ent: CityLookupEntry = { coords: [c.coords[0], c.coords[1]], country: c.country, key: c.key || k, name: c.name }
          let c_name_lower = c.name.toLowerCase().trim()
          if (!city_candidates.has(c_name_lower))
            city_candidates.set(c_name_lower, [])
          city_candidates.get(c_name_lower)!.push(ent)

          if (c.key) {
            let k_lower = c.key.toLowerCase().trim()
            if (!city_candidates.has(k_lower))
              city_candidates.set(k_lower, [])
            city_candidates.get(k_lower)!.push(ent)
          }

          if (c.other_names) {
            for (let on of c.other_names) {
              let on_lower = on.toLowerCase().trim()
              if (!city_candidates.has(on_lower))
                city_candidates.set(on_lower, [])
              city_candidates.get(on_lower)!.push(ent)
            }
          }
        }
      }
    } catch (arg0_err) {
      console.warn(`[runCapitalPipeline] Failed to index all_cities_coords.json: ${arg0_err}`)
    }
  }

  console.log('[runCapitalPipeline] Steps C & D: Parsing infoboxes and correlating with Stadestér...')
  let target_ids = options.only_state_ids ? new Set(options.only_state_ids) : null

  for (let i = 0; i < registry.length; i++) {
    let polity = registry[i]
    if (target_ids && !target_ids.has(polity.state_id))
      continue

    let cache_file = path.join(base_cache_dir, polity.lang, `${sanitizeFilename(polity.title)}.json`)
    if (!fs.existsSync(cache_file))
      continue

    try {
      let wiki_data = JSON.parse(fs.readFileSync(cache_file, 'utf-8'))
      let parsed = C_parsePolityCapitals(polity, wiki_data)
      let correlated = D_correlatePolityWithStadester(parsed, polity, city_candidates)
      correlated_results[String(polity.state_id)] = correlated
    } catch (arg0_err) {
      console.warn(`[runCapitalPipeline] Error processing state ${polity.state_id}: ${arg0_err}`)
    }
  }

  console.log(`[runCapitalPipeline] Step E: Non-destructively synthesizing ${Object.keys(correlated_results).length} correlated entries against capital_chunks...`)
  let report = E_generateAuthoritativeCapitals(correlated_results)
  console.log('[runCapitalPipeline] Synthesis report:', report)

  //Return statement
  return report
}
