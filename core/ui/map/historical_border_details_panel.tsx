import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import type { CountryFeature, CountryStats } from '@framework/geopng/polygon_binning.ts'
import { calculateFeatureArea } from '@framework/geopng/polygon_area.ts'
import type { BorderPropertyFields, DecodedRaster, CityPoint } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { MarkdownRenderer } from '@ui/components/markdown_renderer'
import { resolveCapitalCityClick } from './historical_border_capital_utils'
import { HistoricalBorderPropertyList } from './historical_border_property_list'
import { UfDate } from '@framework/utils/uf_date'
import { useLocalisation } from '@localisation'

export interface HistoricalBorderDetailsPanelProps {
  anchorPos?: { x: number; y: number } | null
  cities?: CityPoint[]
  countryStats?: CountryStats | null
  currentYear: number
  embedded?: boolean
  feature: HistoricalBorderFeature | null
  hideDescription?: boolean
  isCalculatingStats?: boolean
  onBack?: () => void
  onClearPolygon?: () => void
  onClose: () => void
  onEditPolygon?: (arg0_feature: CountryFeature) => void
  onJumpToYear?: (arg0_year: number) => void
  onOpenAnalytics?: () => void
  onSelectCity?: (city: CityPoint) => void
  propertyFields?: BorderPropertyFields
  raster?: DecodedRaster | null
  sidebarWidth?: number
}

let global_is_description_collapsed = true

/**
 * Returns whether polity descriptions are collapsed globally across all polities.
 *
 * @returns {boolean}
 */
export let isPolityDescriptionCollapsed = function (): boolean {
  if (typeof window !== 'undefined' && window.localStorage) {
    let stored = window.localStorage.getItem('dataview_polity_desc_collapsed')
    if (stored !== null)
      return stored !== 'false'
  }

  //Return statement
  return global_is_description_collapsed
}


/**
 * Sets whether polity descriptions are collapsed globally across all polities.
 *
 * @param {boolean} arg0_collapsed
 *
 * @returns {void}
 */
export let setPolityDescriptionCollapsed = function (arg0_collapsed: boolean): void {
  //Convert from parameters
  let collapsed = arg0_collapsed

  //Function body
  global_is_description_collapsed = collapsed
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      window.localStorage.setItem('dataview_polity_desc_collapsed', String(collapsed))
    } catch {
      //Ignore storage errors
    }
  }
}


/**
 * Historical country details panel displaying temporally sliced attributes,
 * SVEA/CShapes keyframe timelines, and regional raster statistics.
 * Anchored to the map click location with sidebar collision avoidance.
 *
 * @param {HistoricalBorderDetailsPanelProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let HistoricalBorderDetailsPanel: React.FC<HistoricalBorderDetailsPanelProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let anchor_pos = props.anchorPos
  let cities = props.cities
  let country_stats = props.countryStats
  let current_year = props.currentYear
  let embedded = Boolean(props.embedded)
  let feature = props.feature
  let hide_description = Boolean(props.hideDescription)
  let is_calculating_stats = props.isCalculatingStats
  let on_back = props.onBack
  let on_clear_polygon = props.onClearPolygon
  let on_close = props.onClose
  let on_edit_polygon = props.onEditPolygon
  let on_jump_to_year = props.onJumpToYear
  let on_open_analytics = props.onOpenAnalytics
  let on_select_city = props.onSelectCity
  let property_fields = props.propertyFields
  let raster = props.raster
  let sidebar_width = props.sidebarWidth

  //Hooks
  let active_keyframe_ref = useRef<HTMLDivElement | null>(null)
  let [fetched_description, set_fetched_description] = useState<string | null>(null)
  let [is_desc_collapsed, set_is_desc_collapsed] = useState<boolean>(isPolityDescriptionCollapsed)
  let keyframes_container_ref = useRef<HTMLDivElement | null>(null)
  let last_country_id_ref = useRef<string | null>(null)
  let last_pos_ref = useRef<{ x: number; y: number } | null>(null)
  let localisation = useLocalisation()

  //Determine effective keyframes and active keyframe index for current timeline timestamp
  let current_date = useMemo(() => UfDate.fromFractionalYear(current_year), [current_year])
  let current_ts = useMemo(() => UfDate.getTimestamp(current_date), [current_date])
  let current_feature_id = useMemo(() => {
    return feature ? String(feature.id || feature.properties?.id || feature.properties?.name || '') : null
  }, [feature])
  let keyframes_list = useMemo(() => feature?.properties?.keyframes || [], [feature])

  let active_kf_index = useMemo(() => {
    let active_idx = -1
    for (let i = 0; i < keyframes_list.length; i++) {
      let kf = keyframes_list[i]
      let kf_ts = kf.timestamp !== undefined
        ? kf.timestamp
        : UfDate.getTimestamp({
          day: kf.day || 1,
          month: kf.month || 1,
          year: kf.year,
        })
      if (kf_ts <= current_ts) {
        active_idx = i
      } else {
        break
      }
    }
    if (active_idx === -1 && keyframes_list.length > 0)
      active_idx = 0
    return active_idx
  }, [keyframes_list, current_ts])

  //Fetch entity details description if not already provided on feature
  useEffect(() => {
    let current_id = current_feature_id
    let has_desc = Boolean(
      feature?.properties?.description ||
      feature?.properties?.metadata?.description ||
      (feature as any)?.description ||
      (feature as any)?.metadata?.description
    )
    if (!current_id || has_desc || hide_description)
      return

    let is_cancelled = false
    let clean_id = current_id.replace(/^(naissance_|detailed_|defacto_|cshapes_)/, '')
    fetch(`/api/atlas/entity?id=${encodeURIComponent(clean_id)}`)
      .then((arg0_res) => (arg0_res.ok ? arg0_res.json() : null))
      .then((arg0_data) => {
        let desc = arg0_data?.description || arg0_data?.metadata?.description
        if (!is_cancelled && desc) {
          set_fetched_description(typeof desc === 'string' ? desc : Array.isArray(desc) ? desc.join('\n') : JSON.stringify(desc))
        }
      })
      .catch(() => {})

    return () => {
      is_cancelled = true
      set_fetched_description(null)
    }
  }, [current_feature_id, hide_description, feature?.properties?.description, feature?.properties?.metadata?.description, (feature as any)?.description, (feature as any)?.metadata?.description])

  //Scroll keyframes list to current keyframe
  useEffect(() => {
    let scrollToActive = () => {
      let container = keyframes_container_ref.current
      let active_el = active_keyframe_ref.current
      if (container && active_el) {
        let relative_y = (active_el.offsetParent === container)
          ? active_el.offsetTop
          : (active_el.getBoundingClientRect().top - container.getBoundingClientRect().top) + container.scrollTop
        let target_scroll = Math.max(0, Math.round(relative_y - (container.clientHeight - active_el.clientHeight) / 2))
        container.scrollTop = target_scroll
      }
    }

    let raf_id = requestAnimationFrame(scrollToActive)
    let timer1 = setTimeout(scrollToActive, 40)
    let timer2 = setTimeout(scrollToActive, 200)

    return () => {
      cancelAnimationFrame(raf_id)
      clearTimeout(timer1)
      clearTimeout(timer2)
    }
  }, [current_feature_id, active_kf_index])

  //Determine effective raster statistics for feature (computed asynchronously via Web Worker)
  let effective_stats = useMemo(() => {
    if (country_stats)
      return country_stats
    return null
  }, [country_stats])

  //Calculate geodesic area clientside from geometry
  let calculated_geom_area = useMemo(() => {
    if (!feature?.geometry)
      return null
    if (feature.properties?.calculated_area && typeof feature.properties.calculated_area === 'number')
      return feature.properties.calculated_area

    let area_km2 = calculateFeatureArea(feature)
    if (area_km2 > 0) {
      let rounded = Math.round(area_km2)
      if (!feature.properties)
        feature.properties = {} as any
      feature.properties.calculated_area = rounded
      feature.properties.area = rounded
      return rounded
    }
    return null
  }, [feature])

  //Guard clauses
  if (!feature)
    return null

  //Declare local instance variables
  let alt_names_str: string | undefined
  let area_val_str: string
  let cap_name: string | undefined
  let cap_names: string[] = []
  let country_name: string
  let display_year: string
  let end_year: number | undefined
  let feature_id: string | null
  let format = localisation.format
  let handle_single_capital_click: (arg0_cap_name: string, arg0_e: React.MouseEvent) => void
  let handle_toggle_description: () => void
  let is_acapital = false
  let is_drawn_feature = Boolean(feature?.properties?.is_drawn)
  let max_x: number
  let max_y: number
  let min_x: number
  let min_y: number
  let panel_h: number
  let panel_style: React.CSSProperties
  let panel_w: number
  let polity_description: string | undefined
  let raster_metric_str: string
  let raster_metric_tooltip: string
  let raw_description: any
  let source_label: string
  let start_year: number | undefined
  let state_id: number | undefined
  let t = localisation.t
  let target_x: number
  let target_y: number
  let validity_str: string

  //Function body
  cap_name = feature.properties?.capname
  country_name = feature.properties?.name || t.mapPanels.historicalBorders.historicalEntity
  display_year = (current_year !== Math.floor(current_year))
    ? UfDate.formatDate(current_date)
    : UfDate.formatYear(current_year)
  end_year = feature.properties?.endYear
  is_acapital = Boolean(feature.properties?.is_acapital)
  start_year = feature.properties?.startYear
  state_id = (feature.properties?.state_id !== undefined && feature.properties?.state_id !== null)
    ? Number(feature.properties.state_id)
    : undefined

  if (cap_name) {
    cap_names = cap_name.split(/[,/]/).map((arg0_s) => arg0_s.trim()).filter(Boolean)
  } else if (!is_acapital && cities && cities.length > 0) {
    let c_norm = (country_name || '').toLowerCase().trim()
    let matching_cities = cities.filter((arg0_c) => {
      if (!arg0_c.isCapital)
        return false
      if (state_id !== undefined && (arg0_c.capitalStateId === state_id || arg0_c.capitalStateId === Number(state_id)))
        return true
      if (state_id === undefined && c_norm) {
        let cap_of = (arg0_c.capitalOf || arg0_c.capital_state_name || '').toLowerCase().trim()
        if (cap_of && cap_of === c_norm)
          return true
      }
      return false
    })
    if (matching_cities.length > 0) {
      cap_names = Array.from(new Set(matching_cities.map((arg0_c) => arg0_c.name).filter(Boolean)))
    }
  }

  handle_single_capital_click = (arg0_cap_name: string, arg0_e: React.MouseEvent) => {
    arg0_e.stopPropagation()
    if (feature) {
      resolveCapitalCityClick({
        capName: arg0_cap_name,
        cities,
        countryName: country_name,
        currentYear: current_year,
        feature,
        onSelectCity: on_select_city,
        stateId: state_id,
      })
    }
  }

  handle_toggle_description = () => {
    let next_state = !is_desc_collapsed
    setPolityDescriptionCollapsed(next_state)
    set_is_desc_collapsed(next_state)
  }

  raw_description = feature.properties?.description ||
    feature.properties?.metadata?.description ||
    (feature as any)?.description ||
    (feature as any)?.metadata?.description ||
    feature.properties?.descriptions ||
    (feature as any)?.descriptions ||
    (keyframes_list[active_kf_index] && ((keyframes_list[active_kf_index] as any).description || (keyframes_list[active_kf_index] as any).properties?.description)) ||
    fetched_description

  if (Array.isArray(raw_description)) {
    polity_description = raw_description.join('\n').trim()
  } else if (typeof raw_description === 'string') {
    polity_description = raw_description.trim()
  } else if (raw_description && typeof raw_description === 'object') {
    polity_description = JSON.stringify(raw_description)
  }

  if (feature.id?.toString().startsWith('cshapes')) {
    source_label = 'CShapes-2.0'
  } else if (feature.id?.toString().startsWith('defacto')) {
    source_label = 'atlas_defacto.naissance'
  } else {
    source_label = 'atlas_dejure.naissance'
  }

  if (start_year !== undefined && end_year !== undefined) {
    validity_str = `${UfDate.formatYear(start_year)} – ${UfDate.formatYear(end_year)}`
  } else if (feature.properties?.date) {
    validity_str = feature.properties.date
  } else {
    validity_str = format(t.mapPanels.historicalBorders.activeAt, display_year)
  }

  //Assemble recorded names if distinct
  if (feature.properties?.name_long && feature.properties.name_long !== country_name) {
    alt_names_str = feature.properties.name_long
  } else if (feature.properties?.adm0_a3 && feature.properties.adm0_a3 !== country_name) {
    alt_names_str = feature.properties.adm0_a3
  }

  //Format area value
  if (calculated_geom_area !== null && calculated_geom_area > 0) {
    area_val_str = `${calculated_geom_area.toLocaleString('de-DE')}`
  } else if (feature.properties?.area && typeof feature.properties.area === 'number') {
    area_val_str = `${Math.round(feature.properties.area).toLocaleString('de-DE')}`
  } else if (effective_stats?.validCount) {
    area_val_str = `${effective_stats.validCount.toLocaleString('de-DE')} ${t.mapPanels.historicalBorders.cells}`
  } else {
    area_val_str = t.mapPanels.historicalBorders.estimated
  }

  //Format raster statistic value
  if (effective_stats) {
    let abs_val: number
    let sum_val = (effective_stats.total !== undefined && Number.isFinite(effective_stats.total))
      ? effective_stats.total
      : effective_stats.mean * effective_stats.validCount

    abs_val = Math.abs(sum_val)
    raster_metric_tooltip = `${t.mapPanels.historicalBorders.sum} ${sum_val.toLocaleString('de-DE', { maximumFractionDigits: 2 })}\n${t.mapPanels.historicalBorders.mean} ${effective_stats.mean.toLocaleString('de-DE', { maximumFractionDigits: 2 })}\n${t.mapPanels.historicalBorders.validCells} ${effective_stats.validCount.toLocaleString('de-DE')}`

    if (abs_val >= 1e12) {
      raster_metric_str = `${(sum_val / 1e12).toLocaleString('de-DE', { maximumFractionDigits: 2 })} T`
    } else if (abs_val >= 1e9) {
      raster_metric_str = `${(sum_val / 1e9).toLocaleString('de-DE', { maximumFractionDigits: 2 })} B`
    } else if (abs_val >= 1e6) {
      raster_metric_str = `${(sum_val / 1e6).toLocaleString('de-DE', { maximumFractionDigits: 2 })} M`
    } else if (abs_val >= 1e3) {
      raster_metric_str = `${(sum_val / 1e3).toLocaleString('de-DE', { maximumFractionDigits: 2 })} k`
    } else {
      raster_metric_str = sum_val.toLocaleString('de-DE', { maximumFractionDigits: 2 })
    }
  } else if (is_calculating_stats) {
    raster_metric_str = t.mapPanels.historicalBorders.computing
    raster_metric_tooltip = t.mapPanels.historicalBorders.computingStats
  } else {
    raster_metric_str = t.mapPanels.historicalBorders.noData
    raster_metric_tooltip = t.mapPanels.historicalBorders.noRasterData
  }

  //Anchored positioning calculations with strict sidebar and HUD collision avoidance
  min_x = (sidebar_width !== undefined ? sidebar_width : 336) + 16
  min_y = 60
  panel_w = 384
  panel_h = 420

  max_x = (typeof window !== 'undefined') ? window.innerWidth - panel_w - 60 : 800
  max_y = (typeof window !== 'undefined') ? window.innerHeight - panel_h - 70 : 600

  feature_id = feature ? String(feature.id || feature.properties?.id || feature.properties?.name || '') : null
  if (feature_id && feature_id !== last_country_id_ref.current) {
    last_country_id_ref.current = feature_id
    last_pos_ref.current = null
  }

  if (!embedded) {
    if (anchor_pos && Number.isFinite(anchor_pos.x) && Number.isFinite(anchor_pos.y)) {
      target_x = anchor_pos.x + 24
      target_y = anchor_pos.y - 120

      if (target_x > max_x) {
        if (anchor_pos.x - panel_w - 24 >= min_x) {
          target_x = anchor_pos.x - panel_w - 24
        } else {
          target_x = max_x
        }
      }
      if (target_x < min_x)
        target_x = min_x

      if (target_y > max_y)
        target_y = max_y
      if (target_y < min_y)
        target_y = min_y

      //Strict collision avoidance with the top-left floating colourbar / settlements card
      if (typeof document !== 'undefined') {
        let legend_el = document.getElementById('dataview-legend-card-container')
        if (legend_el) {
          let legend_rect = legend_el.getBoundingClientRect()
          if (legend_rect.width > 0 && legend_rect.height > 0) {
            let overlaps_x = target_x < legend_rect.right + 16 && (target_x + panel_w) > (legend_rect.left - 16)
            let overlaps_y = target_y < legend_rect.bottom + 16 && (target_y + panel_h) > (legend_rect.top - 16)
            if (overlaps_x && overlaps_y) {
              if (legend_rect.right + 16 + panel_w <= (typeof window !== 'undefined' ? window.innerWidth - 16 : 1200)) {
                target_x = legend_rect.right + 16
              } else {
                target_y = Math.min(max_y, legend_rect.bottom + 16)
              }
            }
          }
        }
      }

      last_pos_ref.current = { x: target_x, y: target_y }
    } else if (last_pos_ref.current) {
      target_x = last_pos_ref.current.x
      target_y = last_pos_ref.current.y
    } else {
      target_x = max_x
      target_y = min_y
      last_pos_ref.current = { x: target_x, y: target_y }
    }

    //Outer panel clips; only the content body scrolls, so the pinned header stays put and scrollbars never nest
    panel_style = {
      left: `${Math.round(target_x)}px`,
      maxHeight: (typeof window !== 'undefined')
        ? `min(calc(100vh - ${Math.round(target_y) + 16}px), 480px)`
        : '480px',
      overflow: 'hidden',
      position: 'fixed',
      top: `${Math.round(target_y)}px`,
    }
  } else {
    //Embedded hosts (i.e. the mobile tray) provide the single scroll container, so the panel grows to its natural height
    panel_style = {
      position: 'relative',
      width: '100%',
    }
  }

  //Return statement
  return (
    <div
      id="dataview-historical-border-panel"
      style={panel_style}
      className={embedded
        ? 'w-full text-foreground select-none font-sans animate-in fade-in-0 duration-150 flex flex-col p-2.5'
        : 'z-15 w-96 max-w-[calc(100vw-32px)] max-h-[480px] flex flex-col bg-card/95 backdrop-blur-md border border-border shadow-2xl p-2.5 text-foreground select-none font-sans animate-in fade-in-0 zoom-in-95 duration-150'
      }
    >
      {/* Header (Pinned) */}
      {!embedded && (
        <div className="flex items-start justify-between border-b border-border/70 pb-2 mb-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {on_back && (
              <button
                type="button"
                onClick={on_back}
                className="w-8 h-8 rounded-none bg-muted/40 border border-border hover:bg-muted/80 hover:border-primary/60 flex items-center justify-center shrink-0 text-muted-foreground hover:text-white cursor-pointer transition-colors"
                title={t.mapPanels.historicalBorders.back || 'Back'}
              >
                <Icon name="arrow_back" className="text-sm" />
              </button>
            )}
            <div className="w-8 h-8 rounded-none bg-muted/40 border border-border flex items-center justify-center shrink-0">
              <Icon name="flag" className="text-white text-base" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-foreground truncate" title={country_name}>
                {country_name}
              </h3>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono">
                {state_id !== undefined ? (
                  is_acapital || cap_names.length === 0 ? (
                    <span className="text-foreground font-semibold">Capital: None</span>
                  ) : (
                    <span className="text-foreground font-semibold">
                      {cap_names.length > 1 ? 'Capitals: ' : 'Capital: '}
                      {cap_names.map((single_cap, idx) => (
                        <React.Fragment key={single_cap}>
                          {idx > 0 && <span className="text-muted-foreground font-normal">, </span>}
                          <button
                            type="button"
                            onClick={(arg0_e) => handle_single_capital_click(single_cap, arg0_e)}
                            className="underline text-foreground hover:text-white cursor-pointer transition-colors"
                            title={single_cap}
                          >
                            {single_cap}
                          </button>
                        </React.Fragment>
                      ))}
                    </span>
                  )
                ) : (
                  <span className="text-foreground font-semibold">{source_label}</span>
                )}
                <span>•</span>
                <span className="truncate">{validity_str}</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={on_close}
            className="p-1 text-muted-foreground hover:text-foreground cursor-pointer shrink-0 transition-colors"
            title={t.mapPanels.historicalBorders.closeHistoricalDetails}
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      )}

      {embedded && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono border-b border-border/70 pb-2 mb-2 shrink-0">
          {on_back && (
            <button
              type="button"
              onClick={on_back}
              className="p-0.5 text-muted-foreground hover:text-white cursor-pointer shrink-0 transition-colors"
              title={t.mapPanels.historicalBorders.back || 'Back'}
            >
              <Icon name="arrow_back" className="text-xs" />
            </button>
          )}
          {state_id !== undefined ? (
            is_acapital || cap_names.length === 0 ? (
              <span className="text-foreground font-semibold">Capital: None</span>
            ) : (
              <span className="text-foreground font-semibold">
                {cap_names.length > 1 ? 'Capitals: ' : 'Capital: '}
                {cap_names.map((single_cap, idx) => (
                  <React.Fragment key={single_cap}>
                    {idx > 0 && <span className="text-muted-foreground font-normal">, </span>}
                    <button
                      type="button"
                      onClick={(arg0_e) => handle_single_capital_click(single_cap, arg0_e)}
                      className="underline text-foreground hover:text-white cursor-pointer transition-colors"
                      title={single_cap}
                    >
                      {single_cap}
                    </button>
                  </React.Fragment>
                ))}
              </span>
            )
          ) : (
            <span className="text-foreground font-semibold">{source_label}</span>
          )}
          <span>•</span>
          <span className="truncate">{validity_str}</span>
        </div>
      )}

      {/* Scrollable Content Body */}
      <div className={embedded
        ? 'pb-1 space-y-2.5'
        : 'flex-1 min-h-0 overflow-y-auto custom-scrollbar pr-1 pb-1 space-y-2.5'
      }>

      {/* Alternate names & Capital info */}
      {(alt_names_str || cap_names.length > 0) && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          {alt_names_str && (
            <div>
              <span className="text-muted-foreground/80">{t.mapPanels.historicalBorders.alsoRecordedAs} </span>
              <span className="text-foreground font-medium">{alt_names_str}</span>
            </div>
          )}
        </div>
      )}

      {/* Primary Statistics Grid (3 Cards matching Image 1 layout) */}
      <div className="grid grid-cols-3 gap-1.5">
        {/* Metric 1: Area */}
        <div className="border border-border/60 bg-muted/20 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-wider">
            {t.mapPanels.historicalBorders.areaKm2}
          </div>
          <div className="text-sm font-bold text-foreground font-mono mt-0.5 truncate" title={area_val_str}>
            {area_val_str}
          </div>
          <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">&nbsp;</div>
        </div>

        {/* Metric 2: Raster Sum */}
        <div className="border border-border/60 bg-muted/20 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-wider">
            {t.mapPanels.historicalBorders.rasterSum}
          </div>
          <div className="text-sm font-bold text-primary font-mono mt-0.5 truncate" title={raster_metric_tooltip}>
            {raster_metric_str}
          </div>
          <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5" title={display_year}>
            {effective_stats ? `${effective_stats.validCount.toLocaleString('de-DE')} ${t.mapPanels.historicalBorders.cells}` : display_year}
          </div>
        </div>

        {/* Metric 3: Keyframes or Span */}
        <div className="border border-border/60 bg-muted/20 p-2 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-mono tracking-wider">
            {is_drawn_feature ? (t.mapPanels.historicalBorders.vertices || 'Vertices') : t.mapPanels.historicalBorders.keyframes}
          </div>
          <div className="text-sm font-bold text-foreground font-mono mt-0.5">
            {is_drawn_feature
              ? (feature?.geometry?.type === 'Polygon' ? Math.max(0, (feature.geometry.coordinates?.[0]?.length || 1) - 1) : 0)
              : (keyframes_list.length > 0 ? keyframes_list.length : 1)}
          </div>
          <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
            {is_drawn_feature ? (t.mapPanels.historicalBorders.measurementPolygon || 'Measurement') : t.mapPanels.historicalBorders.historicalRecords}
          </div>
        </div>
      </div>

      {/* Keyframe Properties (configured per layer in common/layers/atlas.json5) */}
      <HistoricalBorderPropertyList fields={property_fields} properties={feature.properties} />

      {/* Raster Statistics & Full Calculator Header */}
      {effective_stats ? (
        <div className="p-2 bg-muted/20 border border-border/50 text-xs space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-foreground">
            <span className="flex items-center gap-1">
              <Icon name="bar_chart" className="text-xs text-primary" />
              <span>{format(t.mapPanels.historicalBorders.statisticsAt, display_year)}</span>
            </span>
            {on_open_analytics && (
              <button
                type="button"
                onClick={on_open_analytics}
                className="text-[10px] text-red-500 hover:text-red-400 hover:underline cursor-pointer"
              >
                {t.mapPanels.historicalBorders.fullCalculator}
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px] font-mono pt-1">
            <div>
              <span className="text-muted-foreground">{t.mapPanels.historicalBorders.sum} </span>
              <span className="font-bold text-foreground">
                {(effective_stats.total !== undefined ? effective_stats.total : effective_stats.mean * effective_stats.validCount).toLocaleString('de-DE', { maximumFractionDigits: 1 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t.mapPanels.historicalBorders.mean} </span>
              <span className="font-bold text-foreground">
                {effective_stats.mean.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t.mapPanels.historicalBorders.median} </span>
              <span className="font-bold text-foreground">
                {effective_stats.median.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t.mapPanels.historicalBorders.stdDev} </span>
              <span className="font-bold text-foreground">
                {effective_stats.stdDev.toLocaleString('de-DE', { maximumFractionDigits: 2 })}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t.mapPanels.historicalBorders.minMax} </span>
              <span className="font-bold text-foreground">
                {effective_stats.min.toFixed(1)} / {effective_stats.max.toFixed(1)}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">{t.mapPanels.historicalBorders.validCells} </span>
              <span className="font-bold text-foreground">
                {effective_stats.validCount.toLocaleString('de-DE')}
              </span>
            </div>
          </div>
        </div>
      ) : is_calculating_stats ? (
        <div className="p-2 bg-muted/20 border border-border/50 text-xs flex items-center justify-center gap-2 text-muted-foreground">
          <Icon name="sync" className="animate-spin text-xs text-primary" />
          <span className="text-[11px] font-mono">{t.mapPanels.historicalBorders.computingStats}</span>
        </div>
      ) : null}

      {/* Keyframe Timeline Trajectory Header OR Drawn Polygon Actions */}
      <div className="flex items-center justify-between text-[11px] font-semibold text-foreground border-t border-border/50 pt-2">
        <span className="flex items-center gap-1.5">
          <Icon name={is_drawn_feature ? 'polyline' : 'timeline'} className="text-xs text-white" />
          <span className="uppercase tracking-wider font-mono text-[10px]">
            {is_drawn_feature
              ? (t.mapPanels.historicalBorders.polygonActions || 'Polygon Actions')
              : t.mapPanels.historicalBorders.historicalTrajectory}
          </span>
        </span>
        {on_open_analytics && !effective_stats && !is_drawn_feature && (
          <button
            type="button"
            onClick={on_open_analytics}
            className="text-[10px] text-red-500 hover:text-red-400 hover:underline cursor-pointer"
          >
            {t.mapPanels.historicalBorders.analyticsDrawer}
          </button>
        )}
      </div>

      {/* Interactive Keyframes List OR Polygon Actions */}
      {is_drawn_feature ? (
        <div className="grid grid-cols-2 gap-2 pt-0.5">
          <button
            type="button"
            onClick={() => {
              if (on_edit_polygon && feature)
                on_edit_polygon(feature as unknown as CountryFeature)
            }}
            className="px-2 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 bg-muted/60 hover:bg-muted text-foreground border border-border transition-colors cursor-pointer rounded-none"
            title={t.mapPanels.historicalBorders.editPolygon}
          >
            <Icon name="edit" className="text-xs text-[rgb(200,40,40)]" />
            <span>{t.mapPanels.historicalBorders.editPolygon || 'Edit Polygon'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (on_clear_polygon)
                on_clear_polygon()
            }}
            className="px-2 py-1.5 text-xs font-semibold flex items-center justify-center gap-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/40 transition-colors cursor-pointer rounded-none"
            title={t.mapPanels.historicalBorders.clearPolygon}
          >
            <Icon name="delete_sweep" className="text-xs text-red-400" />
            <span>{t.mapPanels.historicalBorders.clearPolygon || 'Clear Polygon'}</span>
          </button>
        </div>
      ) : keyframes_list.length > 0 ? (
        <div ref={keyframes_container_ref} className="relative max-h-[168px] overflow-y-auto custom-scrollbar p-2 space-y-1 bg-muted/15 border border-border/40">
          {keyframes_list.map((arg0_kf: any, arg1_idx: number) => {
            let is_curr = arg1_idx === active_kf_index
            let is_unrecorded = Boolean(arg0_kf.label?.toLowerCase().includes('unrecorded') || arg0_kf.label?.toLowerCase().includes('hidden') || arg0_kf.label?.toLowerCase().includes('dissolved') || arg0_kf.label?.toLowerCase().includes('deleted'))
            let kf = arg0_kf
            let kf_date_str = kf.date || UfDate.formatYear(kf.year)
            let kf_label = kf.label || t.mapPanels.historicalBorders.boundaryUpdated

            return (
              <div
                key={`${kf.timestamp || kf.year}-${arg1_idx}`}
                ref={is_curr ? active_keyframe_ref : undefined}
                className={`w-full text-left px-2 py-1.5 text-[var(--body-font-size)] flex items-center justify-between transition-colors border ${is_curr
                  ? 'bg-red-500/20 border-red-500/60 text-red-400 font-bold shadow-xs'
                  : is_unrecorded
                    ? 'bg-muted/30 border-border/40 text-muted-foreground'
                    : 'bg-card border-border/40 text-muted-foreground'
                  }`}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${is_curr ? 'bg-red-500' : (is_unrecorded ? 'bg-muted-foreground/40' : 'bg-muted-foreground/60')
                      }`}
                  />
                  <span className="font-mono font-semibold shrink-0 text-foreground text-[var(--body-font-size)]">{kf_date_str}</span>
                  <span className="truncate text-muted-foreground ml-1 text-[var(--body-font-size)]">{kf_label}</span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {is_unrecorded && (
                    <span className="text-[var(--body-font-size)] px-1.5 py-0.5 bg-muted text-muted-foreground border border-border/60 font-mono">
                      {t.mapPanels.historicalBorders.unrecorded}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(arg0_e: React.MouseEvent) => {
                      arg0_e.stopPropagation()
                      if (on_jump_to_year) {
                        if (kf.timestamp !== undefined) {
                          let kf_date_obj = UfDate.convertTimestampToDate(kf.timestamp)
                          let kf_frac = UfDate.toFractionalYear(kf_date_obj)
                          on_jump_to_year(kf_frac)
                        } else if (kf.year !== undefined) {
                          let kf_frac = UfDate.toFractionalYear({
                            day: kf.day || 1,
                            month: kf.month || 1,
                            year: kf.year,
                          })
                          on_jump_to_year(kf_frac)
                        }
                      }
                    }}
                    className="text-[var(--body-font-size)] text-red-500 hover:text-red-400 hover:underline font-mono cursor-pointer transition-colors"
                    title={format(t.mapPanels.historicalBorders.jumpTimelineTo, kf_date_str)}
                  >
                    {t.mapPanels.historicalBorders.jump}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-[var(--body-font-size)] text-muted-foreground italic py-1 text-center bg-muted/20 border border-border/40">
          {t.mapPanels.historicalBorders.noKeyframeEvents}
        </div>
      )}

      {/* Polity Description */}
      {!hide_description && polity_description && (
        <div className="border-t border-border/50 pt-2">
          <button
            type="button"
            onClick={handle_toggle_description}
            className={`w-full flex items-center justify-between text-xs font-semibold text-foreground py-2 px-2.5 bg-muted/20 hover:bg-muted/40 border border-border/40 cursor-pointer select-none transition-colors group ${
              !is_desc_collapsed ? 'border-b-0' : ''
            }`}
            title={is_desc_collapsed
              ? (t.mapPanels.historicalBorders.expandDescription || 'Expand description')
              : (t.mapPanels.historicalBorders.collapseDescription || 'Collapse description')
            }
          >
            <div className="flex items-center gap-2">
              <Icon name="description" className="text-sm text-white" />
              <span className="uppercase tracking-wider font-mono text-[11px]">
                {t.mapPanels.historicalBorders.description || 'Description'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-muted-foreground group-hover:text-white">
              <Icon
                name={is_desc_collapsed ? 'expand_more' : 'expand_less'}
                className="text-base transition-transform"
              />
            </div>
          </button>
          {!is_desc_collapsed && (
            <div className="text-[var(--body-font-size)] text-muted-foreground leading-relaxed select-text overflow-hidden p-3 bg-muted/10 border border-border/40 border-t-0 animate-in fade-in-0 duration-150">
              <MarkdownRenderer content={polity_description} />
            </div>
          )}
        </div>
      )}
      </div>
    </div>
  )
}
