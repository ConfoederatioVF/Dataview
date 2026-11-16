import type { StadesterVersionDefinition, StadesterVersionLabel } from '../geopng/types.ts'

/**
 * Normalises a raw Stadestér versions config (object map or array) into an ordered array of version definitions.
 *
 * @param {Record<string, any> | StadesterVersionDefinition[] | undefined} arg0_raw_versions
 *
 * @returns {StadesterVersionDefinition[]}
 */
export function normaliseStadesterVersions (
  arg0_raw_versions?: Record<string, any> | StadesterVersionDefinition[]
): StadesterVersionDefinition[] {
  //Convert from parameters
  let raw_versions = arg0_raw_versions

  //Guard clauses
  if (!raw_versions || typeof raw_versions !== 'object')
    return []

  //Declare local instance variables
  let entries: Array<[string, any]>
  let result: StadesterVersionDefinition[] = []

  //Function body
  if (Array.isArray(raw_versions)) {
    for (let i = 0; i < raw_versions.length; i++) {
      let item = raw_versions[i]
      if (!item || typeof item !== 'object')
        continue
      let id = String(item.id || '').trim()
      if (!id)
        continue
      result.push({
        available: item.available,
        id,
        metadata_path: item.metadata_path,
        name: (item.name || item.label || id) as StadesterVersionLabel,
        path: String(item.path || item.filepath || ''),
      })
    }

    //Return statement
    return result
  }

  entries = Object.entries(raw_versions)
  for (let i = 0; i < entries.length; i++) {
    let [id, val] = entries[i]
    if (!id || !val || typeof val !== 'object')
      continue
    result.push({
      available: val.available,
      id,
      metadata_path: val.metadata_path,
      name: (val.name || val.label || id) as StadesterVersionLabel,
      path: String(val.path || val.filepath || ''),
    })
  }

  //Return statement
  return result
}


/**
 * Returns available Stadestér dataset versions from a parsed layer or raw layer config.
 * Filters out versions explicitly marked unavailable on disk while keeping configured order.
 *
 * @param {any} [arg0_layer_or_config]
 *
 * @returns {StadesterVersionDefinition[]}
 */
export function getAvailableStadesterVersions (arg0_layer_or_config?: any): StadesterVersionDefinition[] {
  //Convert from parameters
  let layer_or_config = arg0_layer_or_config

  //Declare local instance variables
  let all_versions = normaliseStadesterVersions(layer_or_config?.versions)
  let available_versions: StadesterVersionDefinition[] = []
  let has_availability_flags = false

  //Guard clauses
  if (all_versions.length === 0)
    return []

  //Function body
  for (let i = 0; i < all_versions.length; i++) {
    if (all_versions[i].available !== undefined)
      has_availability_flags = true
    if (all_versions[i].available !== false)
      available_versions.push(all_versions[i])
  }

  //Return statement
  return (has_availability_flags) ? available_versions : all_versions
}


/**
 * Resolves the display label for a Stadestér dataset version ID from configured versions.
 *
 * @param {string | undefined} arg0_dataset_id
 * @param {Record<string, any> | StadesterVersionDefinition[] | undefined} arg1_versions
 * @param {string} [arg2_locale='en-GB']
 *
 * @returns {string}
 */
export function resolveStadesterVersionLabel (
  arg0_dataset_id?: string,
  arg1_versions?: Record<string, any> | StadesterVersionDefinition[],
  arg2_locale?: string
): string {
  //Convert from parameters
  let dataset_id = arg0_dataset_id || ''
  let locale = arg2_locale || 'en-GB'
  let versions = normaliseStadesterVersions(arg1_versions)

  //Declare local instance variables
  let matched = versions.find((arg0_v) => arg0_v.id === dataset_id)
  let raw_label = matched?.name

  //Guard clauses
  if (!raw_label)
    return dataset_id
  if (typeof raw_label === 'string')
    return raw_label || dataset_id
  if (typeof raw_label !== 'object')
    return dataset_id

  //Return statement
  return raw_label[locale] || raw_label['en-GB'] || Object.values(raw_label)[0] || dataset_id
}


/**
 * Resolves the active/default Stadestér dataset ID against available versions configured in stadester.json5.
 *
 * @param {any} [arg0_layer_or_config]
 * @param {string} [arg1_preferred_id]
 *
 * @returns {string}
 */
export function resolveDefaultStadesterDataset (
  arg0_layer_or_config?: any,
  arg1_preferred_id?: string
): string {
  //Convert from parameters
  let layer_or_config = arg0_layer_or_config
  let preferred_id = arg1_preferred_id

  //Declare local instance variables
  let available = getAvailableStadesterVersions(layer_or_config)
  let configured_default = layer_or_config?.display_options?.dataset as string | undefined

  //Function body
  if (preferred_id && available.some((arg0_v) => arg0_v.id === preferred_id))
    return preferred_id
  if (configured_default && available.some((arg0_v) => arg0_v.id === configured_default))
    return configured_default
  if (available.length > 0)
    return available[0].id
  if (configured_default)
    return configured_default

  //Return statement
  return 'stadester_2.0'
}
