import type { BorderPropertyFieldLabel, BorderPropertyFields } from '@framework/geopng/types.ts'

export interface BorderPropertyItem {
  key: string
  label: string
  value: string
}

/**
 * Helpers for resolving configured keyframe [2] properties into displayable infobox rows.
 */
export let BorderPropertyUtils = {
  /**
   * Formats a raw property value as a single-line display string.
   *
   * @param {any} arg0_value
   *
   * @returns {string}
   */
  formatValue: function (arg0_value: any): string {
    //Convert from parameters
    let value = arg0_value

    //Return statement
    if (Array.isArray(value)) {
      return value.map((arg0_v) => String(arg0_v)).join(', ')
    } else if (typeof value === 'object') {
      return JSON.stringify(value)
    } else {
      return String(value).replace(/\s*\n+\s*/g, ' ').trim()
    }
  },


  /**
   * Returns a short hostname label for a URL, falling back to the raw value if it cannot be parsed.
   *
   * @param {string} arg0_url
   *
   * @returns {string}
   */
  getLinkLabel: function (arg0_url: string): string {
    //Convert from parameters
    let url = arg0_url

    //Function body
    try {
      //Return statement
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      //Return statement
      return url
    }
  },


  /**
   * Returns whether a raw property value carries displayable information.
   *
   * @param {any} arg0_value
   *
   * @returns {boolean}
   */
  isDisplayableValue: function (arg0_value: any): boolean {
    //Convert from parameters
    let value = arg0_value

    //Guard clauses
    if (value === undefined || value === null)
      return false

    //Declare local instance variables
    let normalised = String(value).trim().toLowerCase()

    //Return statement
    return !['', '-1', '0', 'none', 'null', 'undefined'].includes(normalised)
  },


  /**
   * Builds ordered infobox rows from configured fields. Values are read from keyframe [2] attributes first, then from computed feature properties.
   *
   * @param {BorderPropertyFields | undefined} arg0_fields
   * @param {Record<string, any> | undefined} arg1_properties
   * @param {string} arg2_locale
   *
   * @returns {BorderPropertyItem[]}
   */
  resolveItems: function (arg0_fields: BorderPropertyFields | undefined, arg1_properties: Record<string, any> | undefined, arg2_locale: string): BorderPropertyItem[] {
    //Convert from parameters
    let fields = arg0_fields
    let properties = arg1_properties
    let locale = arg2_locale

    //Guard clauses
    if (!fields || typeof fields !== 'object' || !properties)
      return []

    //Declare local instance variables
    let all_keys = Object.keys(fields)
    let attributes = properties.attributes || {}
    let items_array: BorderPropertyItem[] = []

    //Function body
    for (let i = 0; i < all_keys.length; i++) {
      let local_key = all_keys[i]
      let local_value = attributes[local_key] ?? properties[local_key]

      if (!BorderPropertyUtils.isDisplayableValue(local_value))
        continue

      items_array.push({
        key: local_key,
        label: BorderPropertyUtils.resolveLabel(fields[local_key], local_key, locale),
        value: BorderPropertyUtils.formatValue(local_value),
      })
    }

    //Return statement
    return items_array
  },


  /**
   * Resolves a configured field label for the active locale.
   *
   * @param {BorderPropertyFieldLabel | undefined} arg0_label
   * @param {string} arg1_key - Fallback when no label resolves.
   * @param {string} arg2_locale
   *
   * @returns {string}
   */
  resolveLabel: function (arg0_label: BorderPropertyFieldLabel | undefined, arg1_key: string, arg2_locale: string): string {
    //Convert from parameters
    let label = arg0_label
    let key = arg1_key
    let locale = arg2_locale

    //Guard clauses
    if (typeof label === 'string')
      return label || key
    if (!label || typeof label !== 'object')
      return key

    //Return statement
    return label[locale] || label['en-GB'] || Object.values(label)[0] || key
  },
}
