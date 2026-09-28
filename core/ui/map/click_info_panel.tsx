import React, { useEffect, useRef } from 'react'
import { CityPoint, InspectionData, StadesterConfig } from '@framework/geopng/types.ts'
import { ParsedDataLayer } from '@server/layer_parser.ts'
import { pickBestCityDisplayName } from '@framework/stadester/stadester_utils'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import { useLocalisation } from '@localisation'

export interface ClickInfoPanelProps {
  activeLayer?: ParsedDataLayer | null
  activeVariableSelectors?: Record<string, string | string[]>
  hoveredCity?: CityPoint | null
  hoveredHistoricalFeature?: HistoricalBorderFeature | null
  info: InspectionData | null
  pos: { x: number; y: number } | null
  stadesterConfig?: StadesterConfig
}

/**
 * Formats gender and age cohort selections into concise notation (e.g. T50-55, F15-45, 55-60; M80+).
 *
 * @param {string|string[]|undefined} arg0_gender
 * @param {string|string[]|undefined} arg1_age
 * @param {ParsedDataLayer|null} [arg2_active_layer]
 *
 * @returns {string}
 */
export function formatCohortDisplay(arg0_gender: string | string[] | undefined, arg1_age: string | string[] | undefined, arg2_active_layer?: ParsedDataLayer | null): string {
  //Convert from parameters
  let active_layer = arg2_active_layer
  let age_param = arg1_age
  let gender_param = arg0_gender

  //Declare local instance variables
  let age_keys: string[]
  let age_lookup: Record<string, { end: number; is_plus?: boolean; start: number }> = {
    '00': { start: 0, end: 1 },
    '01': { start: 1, end: 5 },
    '05': { start: 5, end: 10 },
    '10': { start: 10, end: 15 },
    '15': { start: 15, end: 20 },
    '20': { start: 20, end: 25 },
    '25': { start: 25, end: 30 },
    '30': { start: 30, end: 35 },
    '35': { start: 35, end: 40 },
    '40': { start: 40, end: 45 },
    '45': { start: 45, end: 50 },
    '50': { start: 50, end: 55 },
    '55': { start: 55, end: 60 },
    '60': { start: 60, end: 65 },
    '65': { start: 65, end: 70 },
    '70': { start: 70, end: 75 },
    '75': { start: 75, end: 80 },
    '80': { start: 80, end: 80, is_plus: true },
  }
  let age_ranges: string[] = []
  let current_range: { end: number; is_plus?: boolean; start: number } | null = null
  let fallback_labels: string[] = []
  let gender_list: string[] = []
  let has_f: boolean
  let has_m: boolean
  let merged_age_str: string
  let ordered_keys = ['00', '01', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55', '60', '65', '70', '75', '80']
  let sorted_keys: string[]

  //Normalise genders
  if (Array.isArray(gender_param)) {
    gender_list = gender_param
  } else if (gender_param) {
    gender_list = [gender_param]
  } else {
    gender_list = ['t']
  }

  //Normalise ages
  if (Array.isArray(age_param)) {
    age_keys = age_param
  } else if (age_param) {
    age_keys = [age_param]
  } else {
    age_keys = ordered_keys
  }

  //Sort ages by natural order
  sorted_keys = [...age_keys].sort((arg0_a, arg1_b) => {
    let idx_a = ordered_keys.indexOf(arg0_a)
    let idx_b = ordered_keys.indexOf(arg1_b)
    if (idx_a !== -1 && idx_b !== -1)
      return idx_a - idx_b
    return arg0_a.localeCompare(arg1_b)
  })

  //Compress age ranges
  for (let i = 0; i < sorted_keys.length; i++) {
    let local_key = sorted_keys[i]
    let local_info = age_lookup[local_key]

    if (local_info) {
      if (!current_range) {
        current_range = { start: local_info.start, end: local_info.end, is_plus: local_info.is_plus }
      } else if (current_range.end === local_info.start && !current_range.is_plus) {
        current_range.end = local_info.end
        if (local_info.is_plus)
          current_range.is_plus = true
      } else {
        if (current_range.is_plus) {
          age_ranges.push(`${current_range.start}+`)
        } else {
          age_ranges.push(`${current_range.start}-${current_range.end}`)
        }
        current_range = { start: local_info.start, end: local_info.end, is_plus: local_info.is_plus }
      }
    } else {
      let custom_name = active_layer?.variable_selectors?.age?.options?.[local_key]?.name || local_key
      fallback_labels.push(custom_name)
    }
  }

  if (current_range) {
    if (current_range.is_plus) {
      age_ranges.push(`${current_range.start}+`)
    } else {
      age_ranges.push(`${current_range.start}-${current_range.end}`)
    }
  }

  merged_age_str = [...age_ranges, ...fallback_labels].join(', ')
  if (sorted_keys.length === ordered_keys.length && age_ranges.length === 1 && age_ranges[0] === '0+')
    merged_age_str = ' All Ages'

  //Format gender prefixes
  has_f = gender_list.some((arg0_g) => arg0_g.toLowerCase() === 'f' || arg0_g.toLowerCase() === 'female')
  has_m = gender_list.some((arg0_g) => arg0_g.toLowerCase() === 'm' || arg0_g.toLowerCase() === 'male')

  //Return statement
  if (has_f && has_m) {
    return `F${merged_age_str}; M${merged_age_str}`
  } else if (has_f) {
    return `F${merged_age_str}`
  } else if (has_m) {
    return `M${merged_age_str}`
  } else {
    return `T${merged_age_str}`
  }
}

/**
 * Unified floating tooltip container displaying inspected pixel values and active overlays (e.g. Stadestér).
 *
 * @param {ClickInfoPanelProps} arg0_props
 * @returns {React.ReactElement|null}
 */
export let ClickInfoPanel: React.FC<ClickInfoPanelProps> = React.memo(function (arg0_props: ClickInfoPanelProps) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as ClickInfoPanelProps)

  //Declare local instance variables
  let active_layer = props.activeLayer
  let active_selectors = props.activeVariableSelectors || {}
  let city_display_name = ''
  let cohort_label = ''
  let formatted_lat = ''
  let formatted_lng = ''
  let formatted_val = ''
  let has_historical = Boolean(props.hoveredHistoricalFeature)
  let has_raster = Boolean(props.info && (props.info.pixelX !== undefined || (props.info.value !== null && Number.isFinite(props.info.value))))
  let has_stadester = Boolean(props.stadesterConfig?.enabled && props.hoveredCity)
  let hovered_city = props.hoveredCity
  let hovered_historical = props.hoveredHistoricalFeature
  let info = props.info
  let is_age_sex = Boolean(
    active_layer?.type === 'raster.age_sex' ||
    active_layer?.id === 'age_sex'
  )
  let is_percentage_unit = Boolean(
    active_layer?.unit && (
      active_layer.unit === '%' ||
      active_layer.unit.includes('%') ||
      active_layer.unit.toLowerCase().includes('percent')
    )
  )
  let is_profession = Boolean(
    active_layer?.type === 'raster.category_profession' ||
    active_layer?.id?.includes('profession')
  )
  let localisation = useLocalisation()
  let offset_y = has_raster ? -70 : (has_stadester ? -24 : -16)
  let panel_ref = useRef<HTMLDivElement>(null)
  let pos = props.pos
  let profession_label = ''
  let stadester_config = props.stadesterConfig
  let t = localisation.t

  //Function body
  useEffect(() => {
    if (panel_ref.current && pos)
      panel_ref.current.style.transform = `translate3d(${pos.x + 14}px, ${pos.y + offset_y}px, 0)`
  }, [pos, offset_y])

  //Guard clauses
  if ((!has_raster && !has_stadester && !has_historical) || !pos)
    return null

  if (has_raster && info) {
    if (info.value !== null && Number.isFinite(info.value)) {
      if (is_percentage_unit) {
        let pct_num = Math.abs(info.value) <= 1.0 ? info.value * 100 : info.value
        formatted_val = `${pct_num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}%`
      } else {
        formatted_val = info.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      }
    } else {
      formatted_val = 'NA'
    }
    formatted_lat = info.lat.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })
    formatted_lng = info.lng.toLocaleString(undefined, { minimumFractionDigits: 5, maximumFractionDigits: 5 })

    cohort_label = formatCohortDisplay(active_selectors.gender, active_selectors.age, active_layer)

    let raw_prof = active_selectors.profession
    if (Array.isArray(raw_prof)) {
      profession_label = raw_prof.map((arg0_p) => arg0_p.replace(/_/g, ' ')).join(', ')
    } else if (raw_prof) {
      profession_label = active_layer?.variable_selectors?.profession?.options?.[raw_prof]?.name || raw_prof.replace(/_/g, ' ')
    } else {
      profession_label = t.mapPanels.clickInfo.agriculture
    }
  }

  if (has_stadester && hovered_city) {
    city_display_name = hovered_city.shortName || pickBestCityDisplayName(
      hovered_city.name,
      hovered_city.other_names,
      stadester_config?.display_options
    )
  }

  //Return statement
  return (
    <div
      ref={panel_ref}
      className="absolute top-0 left-0 pointer-events-none z-10 rounded-none border border-border bg-popover/95 p-[var(--padding)] shadow-md font-sans text-[var(--body-font-size)] text-popover-foreground will-change-transform whitespace-nowrap"
      style={{
        transform: `translate3d(${pos.x + 14}px, ${pos.y + offset_y}px, 0)`,
        minWidth: '200px',
        width: 'max-content',
        transition: 'none',
      }}
    >
      {/* 1. Raster Inspection Section */}
      {has_raster && info && (
        <>
          <div className="font-bold text-white mb-1 flex items-baseline gap-1.5 whitespace-nowrap leading-snug">
            <span>X: {info.pixelX.toLocaleString()},</span>
            <span>Y: {info.pixelY.toLocaleString()}</span>
          </div>
          <div className="space-y-0.1 text-[var(--body-font-size)] font-light">
            <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-snug">
              <span className="text-muted-foreground font-bold shrink-0">{t.mapPanels.clickInfo.value}</span>
              <span className="font-bold text-foreground">{formatted_val}</span>
              {active_layer?.unit && !is_percentage_unit && (
                <span className="text-[10px] text-muted-foreground font-mono ml-0.5">({active_layer.unit})</span>
              )}
            </div>
            <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-snug">
              <span className="text-muted-foreground font-bold shrink-0">{t.mapPanels.clickInfo.latLng}</span>
              <span className="text-muted-foreground">
                {formatted_lat}, {formatted_lng}
              </span>
            </div>
            {info.countryName && (
              <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-snug">
                <span className="text-muted-foreground font-bold shrink-0">{t.mapPanels.clickInfo.country}</span>
                <span className="font-bold text-primary">{info.countryName}</span>
              </div>
            )}

            {is_age_sex && (
              <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-snug pt-1 border-t border-border/40">
                <span className="text-muted-foreground font-bold shrink-0">{t.mapPanels.clickInfo.cohort}</span>
                <span className={`font-bold ${cohort_label.startsWith('M')
                    ? 'text-blue-400'
                    : cohort_label.startsWith('F')
                      ? 'text-rose-400'
                      : 'text-primary'
                  }`}>
                  {cohort_label}
                </span>
              </div>
            )}

            {is_profession && (
              <div className="flex items-baseline gap-1.5 whitespace-nowrap leading-snug pt-1 border-t border-border/40">
                <span className="text-muted-foreground font-bold shrink-0">{t.mapPanels.clickInfo.sector}</span>
                <span className="font-bold text-primary">
                  {profession_label}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {/* 2. Appended Stadestér City Section */}
      {has_stadester && hovered_city && hovered_city.population >= 0.01 && (
        <div className={has_raster ? 'pt-1.5 mt-1.5 border-t border-border/60' : ''}>
          <div className="font-semibold text-white flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
            <span className="truncate">{city_display_name}</span>
            {hovered_city.country && (
              <span className="text-[10px] text-muted-foreground font-normal">({hovered_city.country})</span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-mono mt-0.5">
            <span>{t.mapPanels.clickInfo.pop} <strong className="text-white">{Math.round(hovered_city.population).toLocaleString('de-DE')}</strong></span>
            {hovered_city.growthRate !== undefined && (
              <span className="text-white">
                {(hovered_city.growthRate >= 0) ? '+' : ''}{(hovered_city.growthRate * 100).toFixed(2)}{t.mapPanels.clickInfo.perYear}
              </span>
            )}
          </div>
        </div>
      )}

      {/* 3. Appended Historical Country Section */}
      {has_historical && hovered_historical && (
        <div className={(has_raster || (has_stadester && hovered_city)) ? 'pt-1.5 mt-1.5 border-t border-border/60' : ''}>
          <div className="font-semibold text-foreground flex items-center gap-1.5">
            <span className="w-2 h-2 bg-red-500 shrink-0" />
            <span className="truncate">{hovered_historical.properties?.name || t.mapPanels.clickInfo.historicalEntity}</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono mt-0.5">
            <span>
              {hovered_historical.properties?.startYear !== undefined && hovered_historical.properties?.endYear !== undefined
                ? `${hovered_historical.properties.startYear} – ${hovered_historical.properties.endYear}`
                : hovered_historical.properties?.date || ''}
            </span>
            {hovered_historical.properties?.keyframes && (
              <span className="text-muted-foreground">({hovered_historical.properties.keyframes.length} kf)</span>
            )}
          </div>
        </div>
      )}
    </div>
  )
})

export default ClickInfoPanel
