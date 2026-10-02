import React, { useMemo } from 'react'
import type { HistoricalBorderFeature } from '@server/AtlasBordersService'
import type { CountryFeature, CountryStats } from '@framework/geopng/polygon_binning.ts'
import { calculateFeatureArea } from '@framework/geopng/polygon_area.ts'
import type { DecodedRaster, CityPoint } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { UfDate } from '@framework/utils/uf_date'
import { useLocalisation } from '@localisation'

export interface HistoricalBorderDetailsPanelProps {
  anchorPos?: { x: number; y: number } | null
  cities?: CityPoint[]
  countryStats?: CountryStats | null
  currentYear: number
  embedded?: boolean
  feature: HistoricalBorderFeature | null
  isCalculatingStats?: boolean
  onClose: () => void
  onJumpToYear?: (arg0_year: number) => void
  onOpenAnalytics?: () => void
  onSelectCity?: (city: CityPoint) => void
  raster?: DecodedRaster | null
  sidebarWidth?: number
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
  let is_calculating_stats = props.isCalculatingStats
  let on_close = props.onClose
  let on_jump_to_year = props.onJumpToYear
  let on_open_analytics = props.onOpenAnalytics
  let on_select_city = props.onSelectCity
  let raster = props.raster
  let sidebar_width = props.sidebarWidth

  //Hooks
  let localisation = useLocalisation()

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
  let active_kf_index = -1
  let alt_names_str: string | undefined
  let area_val_str: string
  let cap_name: string | undefined
  let cap_names: string[] = []
  let country_name: string
  let current_date: { day: number; month: number; year: number }
  let current_ts: number
  let display_year: string
  let end_year: number | undefined
  let format = localisation.format
  let handle_capital_click: (arg0_e: React.MouseEvent) => void
  let handle_single_capital_click: (arg0_cap_name: string, arg0_e: React.MouseEvent) => void
  let is_acapital = false
  let keyframes_list: any[]
  let max_x: number
  let max_y: number
  let min_x: number
  let panel_h: number
  let panel_style: React.CSSProperties
  let panel_w: number
  let raster_metric_str: string
  let raster_metric_tooltip: string
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
  current_date = UfDate.fromFractionalYear(current_year)
  current_ts = UfDate.getTimestamp(current_date)
  display_year = (current_year !== Math.floor(current_year))
    ? UfDate.formatDate(current_date)
    : UfDate.formatYear(current_year)
  end_year = feature.properties?.endYear
  is_acapital = Boolean(feature.properties?.is_acapital)
  keyframes_list = feature.properties?.keyframes || []
  start_year = feature.properties?.startYear
  state_id = (feature.properties?.state_id !== undefined && feature.properties?.state_id !== null)
    ? Number(feature.properties.state_id)
    : (feature.properties?.id !== undefined && !feature.id?.toString().startsWith('cshapes') ? Number(feature.properties.id) : undefined)

  if (cap_name) {
    cap_names = cap_name.split(/[,/]/).map((arg0_s) => arg0_s.trim()).filter(Boolean)
  } else if (!is_acapital && state_id !== undefined && cities && cities.length > 0) {
    let matching_cities = cities.filter((arg0_c) => arg0_c.isCapital && (arg0_c.capitalStateId === state_id || arg0_c.capitalStateId === Number(state_id)))
    if (matching_cities.length > 0) {
      cap_names = Array.from(new Set(matching_cities.map((arg0_c) => arg0_c.name).filter(Boolean)))
    }
  }

  handle_single_capital_click = (arg0_cap_name: string, arg0_e: React.MouseEvent) => {
    arg0_e.stopPropagation()
    let single_name = arg0_cap_name.trim()
    if (!single_name)
      return

    let target_city: CityPoint | null = null
    if (cities && cities.length > 0) {
      target_city = cities.find((arg0_c) =>
        (arg0_c.name && arg0_c.name.toLowerCase() === single_name.toLowerCase()) ||
        (arg0_c.shortName && arg0_c.shortName.toLowerCase() === single_name.toLowerCase()) ||
        (state_id !== undefined && arg0_c.capitalStateId === state_id && arg0_c.name && arg0_c.name.toLowerCase().includes(single_name.toLowerCase()))
      ) || null
    }

    if (target_city) {
      if (on_select_city)
        on_select_city(target_city)
      if ((window as any).setSelectedCityKey)
        (window as any).setSelectedCityKey(target_city.key)
    } else {
      let cap_key = feature.properties?.capkey || ''
      let query_params = new URLSearchParams()
      if (cap_key)
        query_params.set('key', cap_key)
      query_params.set('name', single_name)
      query_params.set('year', String(current_year))

      fetch(`/api/stadester/city?${query_params.toString()}`)
        .then((arg0_r) => (arg0_r.ok ? arg0_r.json() : null))
        .then((arg0_data) => {
          if (arg0_data && arg0_data.key) {
            let synth_city: CityPoint = {
              area: arg0_data.area ? (typeof arg0_data.area === 'object' ? Object.values(arg0_data.area)[0] as number : arg0_data.area) : undefined,
              capitalOf: arg0_data.capitalOf || feature.properties?.name,
              capital_state_id: arg0_data.capital_state_id || state_id,
              coords: arg0_data.coords || [0, 0],
              country: arg0_data.country || feature.properties?.name,
              id: arg0_data.key,
              isCapital: true,
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
              (window as any).selectedCityRecord = arg0_data
          }
        })
        .catch((arg0_err) => {
          console.error('[HistoricalBorderDetailsPanel] Failed to fetch city details:', arg0_err)
        })
    }
  }

  handle_capital_click = (arg0_e: React.MouseEvent) => {
    if (cap_names.length > 0) {
      handle_single_capital_click(cap_names[0], arg0_e)
    }
  }

  //Determine the single active keyframe index for current timeline timestamp
  active_kf_index = -1
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
      active_kf_index = i
    } else {
      break
    }
  }
  if (active_kf_index === -1 && keyframes_list.length > 0)
    active_kf_index = 0

  if (feature.id?.toString().startsWith('cshapes') || feature.properties?.gwcode) {
    source_label = 'CShapes-2.0'
  } else {
    source_label = 'atlas.naissance'
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

  //Anchored positioning calculations with strict sidebar collision avoidance
  min_x = (sidebar_width !== undefined ? sidebar_width : 336) + 16
  panel_w = 384
  panel_h = 420
  target_x = anchor_pos ? anchor_pos.x + 24 : min_x
  target_y = anchor_pos ? anchor_pos.y - 120 : 60

  max_x = (typeof window !== 'undefined') ? window.innerWidth - panel_w - 16 : 800
  max_y = (typeof window !== 'undefined') ? window.innerHeight - panel_h - 70 : 600

  if (!embedded) {
    if (anchor_pos) {
      if (target_x > max_x)
        target_x = anchor_pos.x - panel_w - 24
      if (target_x < min_x)
        target_x = min_x

      if (target_y > max_y)
        target_y = max_y
      if (target_y < 16)
        target_y = 16
    }

    panel_style = {
      left: `${Math.round(target_x)}px`,
      position: 'fixed',
      top: `${Math.round(target_y)}px`,
    }
  } else {
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
        ? 'w-full text-foreground select-none font-sans animate-in fade-in-0 duration-150 space-y-2'
        : 'z-15 w-96 max-w-[calc(100vw-32px)] bg-card/95 backdrop-blur-md border border-border shadow-2xl p-3 text-foreground select-none font-sans animate-in fade-in-0 zoom-in-95 duration-150'
      }
    >
      {/* Header */}
      {!embedded && (
        <div className="flex items-start justify-between border-b border-border/70 pb-2 mb-2.5">
          <div className="flex items-center gap-2 min-w-0">
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
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-mono border-b border-border/70 pb-1.5">
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

      {/* Alternate names & Capital info */}
      {(alt_names_str || cap_names.length > 0) && (
        <div className="text-[11px] text-muted-foreground mb-2.5 space-y-0.5">
          {alt_names_str && (
            <div>
              <span className="text-muted-foreground/80">{t.mapPanels.historicalBorders.alsoRecordedAs} </span>
              <span className="text-foreground font-medium">{alt_names_str}</span>
            </div>
          )}
        </div>
      )}

      {/* Primary Statistics Grid (3 Cards matching Image 1 layout) */}
      <div className="grid grid-cols-3 gap-1.5 mb-3">
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
            {t.mapPanels.historicalBorders.keyframes}
          </div>
          <div className="text-sm font-bold text-foreground font-mono mt-0.5">
            {keyframes_list.length > 0 ? keyframes_list.length : 1}
          </div>
          <div className="text-[9px] text-muted-foreground/70 truncate mt-0.5">
            {t.mapPanels.historicalBorders.historicalRecords}
          </div>
        </div>
      </div>

      {/* Raster Statistics & Full Calculator Header */}
      {effective_stats ? (
        <div className="mb-2.5 p-2 bg-muted/20 border border-border/50 text-xs space-y-1">
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
        <div className="mb-2.5 p-2 bg-muted/20 border border-border/50 text-xs flex items-center justify-center gap-2 text-muted-foreground">
          <Icon name="sync" className="animate-spin text-xs text-primary" />
          <span className="text-[11px] font-mono">{t.mapPanels.historicalBorders.computingStats}</span>
        </div>
      ) : null}

      {/* Keyframe Timeline Trajectory Header */}
      <div className="flex items-center justify-between text-[11px] font-semibold text-foreground mb-1.5 border-t border-border/50 pt-2">
        <span className="flex items-center gap-1.5">
          <Icon name="timeline" className="text-xs text-white" />
          <span className="uppercase tracking-wider font-mono text-[10px]">{t.mapPanels.historicalBorders.historicalTrajectory}</span>
        </span>
        {on_open_analytics && !effective_stats && (
          <button
            type="button"
            onClick={on_open_analytics}
            className="text-[10px] text-red-500 hover:text-red-400 hover:underline cursor-pointer"
          >
            {t.mapPanels.historicalBorders.analyticsDrawer}
          </button>
        )}
      </div>

      {/* Interactive Keyframes List */}
      {keyframes_list.length > 0 ? (
        <div className="max-h-44 overflow-y-auto custom-scrollbar space-y-1 pr-0.5">
          {keyframes_list.map((arg0_kf: any, arg1_idx: number) => {
            let is_curr = arg1_idx === active_kf_index
            let is_unrecorded = Boolean(arg0_kf.label?.toLowerCase().includes('unrecorded') || arg0_kf.label?.toLowerCase().includes('hidden') || arg0_kf.label?.toLowerCase().includes('dissolved') || arg0_kf.label?.toLowerCase().includes('deleted'))
            let kf = arg0_kf
            let kf_date_str = kf.date || UfDate.formatYear(kf.year)
            let kf_label = kf.label || t.mapPanels.historicalBorders.boundaryUpdated

            return (
              <button
                key={`${kf.timestamp || kf.year}-${arg1_idx}`}
                type="button"
                onClick={() => {
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
                className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center justify-between transition-colors cursor-pointer border ${is_curr
                  ? 'bg-red-500/20 border-red-500/60 text-red-400 font-bold shadow-xs'
                  : is_unrecorded
                    ? 'bg-muted/30 border-border/40 hover:bg-muted/50 text-muted-foreground'
                    : 'bg-card hover:bg-muted/50 border-border/40 text-muted-foreground hover:text-foreground'
                  }`}
                title={format(t.mapPanels.historicalBorders.jumpTimelineTo, kf_date_str)}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${is_curr ? 'bg-red-500' : (is_unrecorded ? 'bg-muted-foreground/40' : 'bg-muted-foreground/60')
                      }`}
                  />
                  <span className="font-mono font-semibold shrink-0 text-foreground">{kf_date_str}</span>
                  <span className="truncate text-[10px] text-muted-foreground ml-1">{kf_label}</span>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {is_unrecorded && (
                    <span className="text-[9px] px-1 py-0.2 bg-muted text-muted-foreground border border-border/60 font-mono">
                      {t.mapPanels.historicalBorders.unrecorded}
                    </span>
                  )}
                  <span className="text-[10px] text-red-500 hover:text-red-400 hover:underline font-mono">
                    {t.mapPanels.historicalBorders.jump}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground italic py-1 text-center bg-muted/20 border border-border/40">
          {t.mapPanels.historicalBorders.noKeyframeEvents}
        </div>
      )}
    </div>
  )
}
