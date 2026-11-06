import type { CityPoint } from '@framework/geopng/types.ts'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'

export interface ResolveCapitalCityOptions {
  capName: string
  cities?: CityPoint[]
  countryName: string
  currentYear: number
  feature: HistoricalBorderFeature
  onSelectCity?: (arg0_city: CityPoint) => void
  stateId?: number
}

/**
 * Resolves a capital city click for a historical border feature, attempting to
 * match existing city points by coordinates, state ID, name, or fetching synthetic city data.
 *
 * @param {ResolveCapitalCityOptions} arg0_options
 *
 * @returns {void}
 */
export let resolveCapitalCityClick = function (arg0_options: ResolveCapitalCityOptions): void {
  //Convert from parameters
  let options = arg0_options
  let cap_name = options.capName
  let cities = options.cities
  let country_name = options.countryName
  let current_year = options.currentYear
  let feature = options.feature
  let on_select_city = options.onSelectCity
  let state_id = options.stateId

  //Declare local instance variables
  let cap_coords: [number, number] | undefined
  let single_name = cap_name.trim()
  let target_city: CityPoint | null = null

  //Guard clauses
  if (!single_name)
    return

  //Function body
  if (feature.properties?.cap_coords && Array.isArray(feature.properties.cap_coords) && feature.properties.cap_coords.length >= 2) {
    cap_coords = feature.properties.cap_coords as [number, number]
  } else if (feature.properties?.caplong !== undefined && feature.properties?.caplat !== undefined) {
    cap_coords = [Number(feature.properties.caplong), Number(feature.properties.caplat)]
  }

  if (cities && cities.length > 0) {
    //0. Coordinate proximity match if cap_coords or caplat/caplong available on feature
    if (cap_coords) {
      let best_score = -1
      for (let arg0_c of cities) {
        let c_lat = (arg0_c as any).rawCoords ? (arg0_c as any).rawCoords[1] : ((arg0_c as any).lat !== undefined ? (arg0_c as any).lat : (arg0_c.coords ? arg0_c.coords[0] : undefined))
        let c_lon = (arg0_c as any).rawCoords ? (arg0_c as any).rawCoords[0] : ((arg0_c as any).lon !== undefined ? (arg0_c as any).lon : (arg0_c.coords ? arg0_c.coords[1] : undefined))
        if (c_lat === undefined || c_lon === undefined)
          continue
        let dist = Math.hypot(c_lon - cap_coords[0], c_lat - cap_coords[1])
        if (dist <= 0.20) {
          let score = 0
          if (feature.properties?.capkey && (arg0_c.key === feature.properties.capkey || (arg0_c as any).id === feature.properties.capkey))
            score += 200000
          if (arg0_c.isCapital || (arg0_c as any).is_capital)
            score += 100000
          score += Math.max(0, Math.round((0.25 - dist) * 5000))
          score += Math.min(1000, Math.round((arg0_c.population || 0) / 1000))
          if (score > best_score) {
            best_score = score
            target_city = arg0_c
          }
        }
      }
    }

    //1. Check for active capital matching state_id
    if (!target_city && state_id !== undefined) {
      target_city = cities.find((arg0_c) =>
        Boolean(arg0_c.isCapital || (arg0_c as any).is_capital) &&
        (arg0_c.capitalStateId === state_id || arg0_c.capitalStateId === Number(state_id) || (arg0_c as any).capital_state_id === state_id || (arg0_c as any).capital_state_id === Number(state_id))
      ) || null
    }

    //2. Check any city matching state_id
    if (!target_city && state_id !== undefined) {
      target_city = cities.find((arg0_c) =>
        (arg0_c.capitalStateId === state_id || arg0_c.capitalStateId === Number(state_id) || (arg0_c as any).capital_state_id === state_id || (arg0_c as any).capital_state_id === Number(state_id))
      ) || null
    }

    let s_clean = single_name.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
    let s_norm = s_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')

    //3. Check matching country and name/alias
    if (!target_city && country_name) {
      let c_norm = country_name.toLowerCase().trim()
      target_city = cities.find((arg0_c) => {
        let city_country = (arg0_c.country || '').toLowerCase().trim()
        let is_country_match = city_country && (city_country === c_norm || c_norm.includes(city_country) || city_country.includes(c_norm))
        if (!is_country_match)
          return false
        let c_n_clean = (arg0_c.name || '').replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let c_n_norm = c_n_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        let c_s_clean = (arg0_c.shortName || '').replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let c_s_norm = c_s_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        let is_alias_match = Boolean((arg0_c as any).other_names && Array.isArray((arg0_c as any).other_names) && (arg0_c as any).other_names.some((arg0_o: string) => {
          let o_clean = arg0_o.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
          let o_norm = o_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
          return o_clean === s_clean || o_norm === s_norm
        }))
        return c_n_clean === s_clean || c_n_norm === s_norm || c_s_clean === s_clean || c_s_norm === s_norm || is_alias_match
      }) || null
    }

    //4. Fallback: match by name, shortName or aliases
    if (!target_city) {
      target_city = cities.find((arg0_c) => {
        if (cap_coords) {
          let c_lat = (arg0_c as any).rawCoords ? (arg0_c as any).rawCoords[1] : ((arg0_c as any).lat !== undefined ? (arg0_c as any).lat : (arg0_c.coords ? arg0_c.coords[0] : undefined))
          let c_lon = (arg0_c as any).rawCoords ? (arg0_c as any).rawCoords[0] : ((arg0_c as any).lon !== undefined ? (arg0_c as any).lon : (arg0_c.coords ? arg0_c.coords[1] : undefined))
          if (c_lat !== undefined && c_lon !== undefined) {
            let dist = Math.hypot(c_lon - cap_coords[0], c_lat - cap_coords[1])
            if (dist > 1.5)
              return false
          }
        }
        let c_n_clean = (arg0_c.name || '').replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let c_n_norm = c_n_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        let c_s_clean = (arg0_c.shortName || '').replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
        let c_s_norm = c_s_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
        let is_alias_match = Boolean((arg0_c as any).other_names && Array.isArray((arg0_c as any).other_names) && (arg0_c as any).other_names.some((arg0_o: string) => {
          let o_clean = arg0_o.replace(/\(.*?\)/g, '').replace(/\(s\)/gi, '').trim().toLowerCase()
          let o_norm = o_clean.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^(al-|ar-|ash-|az-|an-|at-|ad-|el-|er-)/, '').replace(/h$/, '')
          return o_clean === s_clean || o_norm === s_norm
        }))
        return c_n_clean === s_clean || c_n_norm === s_norm || c_s_clean === s_clean || c_s_norm === s_norm || is_alias_match
      }) || null
    }
  }

  if (target_city) {
    let enriched_target: CityPoint = {
      ...target_city,
      capitalColor: target_city.capitalColor || (target_city as any).capital_color || feature.properties?.fill_color || '#FFDC00',
      capitalOf: target_city.capitalOf || target_city.capital_state_name || country_name,
      capitalStateId: target_city.capitalStateId || (target_city as any).capital_state_id || state_id,
      capital_color: target_city.capitalColor || (target_city as any).capital_color || feature.properties?.fill_color || '#FFDC00',
      capital_state_id: (target_city as any).capital_state_id || target_city.capitalStateId || state_id,
      capital_state_name: target_city.capital_state_name || target_city.capitalOf || country_name,
      isCapital: true,
      is_capital: true,
    }
    if (on_select_city)
      on_select_city(enriched_target)
    if ((window as any).setSelectedCityKey)
      (window as any).setSelectedCityKey(enriched_target.key)
    if ((window as any).selectedCityRecord !== undefined)
      (window as any).selectedCityRecord = enriched_target
  } else {
    let cap_key = feature.properties?.capkey || ''
    let query_params = new URLSearchParams()
    if (cap_key)
      query_params.set('key', cap_key)
    query_params.set('name', single_name)
    query_params.set('year', String(current_year))
    if (country_name)
      query_params.set('country', country_name)
    if (state_id !== undefined)
      query_params.set('state_id', String(state_id))
    if (cap_coords) {
      query_params.set('lat', String(cap_coords[1]))
      query_params.set('lon', String(cap_coords[0]))
    }

    if (cap_coords) {
      let initial_synth_city: CityPoint = {
        capitalColor: feature.properties?.fill_color || '#FFDC00',
        capitalOf: feature.properties?.name || country_name,
        capitalStateId: state_id,
        capital_color: feature.properties?.fill_color || '#FFDC00',
        capital_state_id: state_id,
        capital_state_name: feature.properties?.name || country_name,
        coords: [cap_coords[1], cap_coords[0]],
        country: feature.properties?.name || country_name,
        id: cap_key || single_name,
        isCapital: true,
        is_capital: true,
        key: cap_key || single_name,
        name: single_name,
        population: 0,
      }
      if (on_select_city)
        on_select_city(initial_synth_city)
      if ((window as any).setSelectedCityKey)
        (window as any).setSelectedCityKey(cap_key || single_name)
      if ((window as any).selectedCityRecord !== undefined)
        (window as any).selectedCityRecord = initial_synth_city
    }

    fetch(`/api/stadester/city?${query_params.toString()}`)
      .then((arg0_r) => (arg0_r.ok ? arg0_r.json() : null))
      .then((arg0_data) => {
        if (arg0_data && arg0_data.key) {
          let synth_city: CityPoint = {
            area: arg0_data.area ? (typeof arg0_data.area === 'object' ? Object.values(arg0_data.area)[0] as number : arg0_data.area) : undefined,
            capitalColor: arg0_data.capitalColor || arg0_data.capital_color || feature.properties?.fill_color || '#FFDC00',
            capitalOf: arg0_data.capitalOf || arg0_data.capital_state_name || feature.properties?.name || country_name,
            capitalStateId: arg0_data.capitalStateId || arg0_data.capital_state_id || state_id,
            capital_color: arg0_data.capital_color || arg0_data.capitalColor || feature.properties?.fill_color || '#FFDC00',
            capital_state_id: arg0_data.capital_state_id || arg0_data.capitalStateId || state_id,
            capital_state_name: arg0_data.capital_state_name || arg0_data.capitalOf || feature.properties?.name || country_name,
            coords: arg0_data.coords || [0, 0],
            country: arg0_data.country || feature.properties?.name || country_name,
            id: arg0_data.key,
            isCapital: true,
            is_capital: true,
            key: arg0_data.key,
            name: arg0_data.name || single_name,
            population: typeof arg0_data.population === 'number'
              ? arg0_data.population
              : (arg0_data.population && typeof arg0_data.population === 'object'
                ? (arg0_data.population[String(current_year)] || Object.values(arg0_data.population)[0] || 0)
                : 0),
          }
          if (on_select_city)
            on_select_city(synth_city)
          if ((window as any).setSelectedCityKey)
            (window as any).setSelectedCityKey(arg0_data.key)
          if ((window as any).selectedCityRecord !== undefined)
            (window as any).selectedCityRecord = synth_city
        }
      })
      .catch((arg0_err) => {
        console.error('[HistoricalBorderDetailsPanel] Failed to fetch city details:', arg0_err)
      })
  }

  //Return statement
  return
}
