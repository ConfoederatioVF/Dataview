import React, { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { CityFullRecord, CityPoint } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { UfDate } from '@framework/utils/uf_date'
import { isCityCapitalAtYear, resolveHistoricalCityName } from '@framework/stadester/city_metadata_framework.ts'
import { useLocalisation } from '@localisation'

export interface CityDetailsPanelProps {
  anchorPos?: { x: number; y: number } | null
  city: CityFullRecord | CityPoint | null
  currentYear: number
  embedded?: boolean
  onClose: () => void
}

/**
 * Truncates city name to at most 3 city names with '...', or 40 characters maximum limit,
 * whichever is shorter.
 *
 * @param {string} arg0_name
 * @returns {string}
 */
function formatPanelCityName (arg0_name: string): string {
  //Convert from parameters
  let name = arg0_name || ''

  //Guard clauses
  if (!name)
    return 'Settlement'

  //Function body
  let parts = name.split(';').map((s) => s.trim()).filter(Boolean)
  let joined: string

  if (parts.length > 3) {
    joined = parts.slice(0, 3).join('; ') + '...'
  } else {
    joined = parts.join('; ')
  }

  if (joined.length > 40)
    joined = joined.substring(0, 37).trim() + '...'

  //Return statement
  return joined || name
}

/**
 * Interactive statistics and historical properties panel for a selected city.
 * Anchored to the map settlement location with strictly compliant theme:
 * Non-interactive text is pure white, interactive elements are red.
 *
 * @param {CityDetailsPanelProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let CityDetailsPanel: React.FC<CityDetailsPanelProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let anchor_pos = props.anchorPos
  let city = props.city
  let current_year = props.currentYear
  let embedded = Boolean(props.embedded)
  let on_close = props.onClose

  //Declare local instance variables
  let active_metric_tab: 'population' | 'area' | 'density'
  let area_at_year: number | undefined
  let chart_option: any
  let density_at_year: number | undefined
  let display_city_name: string
  let format: ReturnType<typeof useLocalisation>['format']
  let formatted_current_year: string
  let full_record: CityFullRecord | null
  let is_capital: boolean
  let localisation: ReturnType<typeof useLocalisation>
  let other_names_list: string[]
  let panel_style: React.CSSProperties
  let polity_name: string | undefined
  let pop_at_year: number
  let set_active_metric_tab: React.Dispatch<React.SetStateAction<'population' | 'area' | 'density'>>
  let t: ReturnType<typeof useLocalisation>['t']
  let timeseries_data: Array<[number, number]>

  //Function body
  localisation = useLocalisation()
  format = localisation.format
  t = localisation.t

  ;[active_metric_tab, set_active_metric_tab] = useState<'population' | 'area' | 'density'>('population')

  full_record = city ? (city as CityFullRecord) : null
  formatted_current_year = UfDate.formatYear(current_year)
  display_city_name = city
    ? formatPanelCityName(
        city.historical_names && city.historical_names.length > 0
          ? resolveHistoricalCityName(city as any, current_year)
          : city.name
      )
    : ''

  is_capital = Boolean(
    (city as any)?.is_capital ||
    (city as any)?.isCapital ||
    ((city as any)?.capital_records && isCityCapitalAtYear(city as any, current_year)) ||
    ((city as any)?.capital && isCityCapitalAtYear(city as any, current_year))
  )

  polity_name =
    (city as any)?.capitalOf ||
    (city as any)?.capital_state_name ||
    (city as any)?.capitalStateName

  //Extract population for current year (safely handle primitive vs dictionary)
  pop_at_year = 0
  if (typeof (city as any).population === 'number') {
    pop_at_year = (city as any).population
  } else if (full_record?.population && typeof full_record.population === 'object') {
    let yr_str = String(current_year)
    if (full_record.population[yr_str] !== undefined) {
      pop_at_year = full_record.population[yr_str]
    } else {
      let yrs = Object.keys(full_record.population).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
      let best_yr: number | null = null
      for (let i = 0; i < yrs.length; i++) {
        if (yrs[i] <= current_year)
          best_yr = yrs[i]
      }
      if (best_yr === null && yrs.length > 0)
        best_yr = yrs[0]
      if (best_yr !== null)
        pop_at_year = full_record.population[String(best_yr)] || 0
    }
  }

  //Extract area for current year (safely handle primitive vs dictionary)
  area_at_year = undefined
  if (typeof (city as any).area === 'number' && !Number.isNaN((city as any).area)) {
    area_at_year = (city as any).area
  } else if (full_record?.area && typeof full_record.area === 'object') {
    let yr_str = String(current_year)
    if (full_record.area[yr_str] !== undefined && !Number.isNaN(full_record.area[yr_str])) {
      area_at_year = full_record.area[yr_str]
    } else {
      let a_yrs = Object.keys(full_record.area).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
      let best_a_yr: number | null = null
      for (let i = 0; i < a_yrs.length; i++) {
        if (a_yrs[i] <= current_year)
          best_a_yr = a_yrs[i]
      }
      if (best_a_yr === null && a_yrs.length > 0)
        best_a_yr = a_yrs[a_yrs.length - 1]
      if (best_a_yr !== null) {
        let a_val = full_record.area[String(best_a_yr)]
        if (typeof a_val === 'number' && !Number.isNaN(a_val))
          area_at_year = a_val
      }
    }
  }

  //Extract density for current year (safely handle primitive vs dictionary)
  density_at_year = undefined
  if (typeof (city as any).density === 'number' && !Number.isNaN((city as any).density)) {
    density_at_year = (city as any).density
  } else if (full_record?.density && typeof full_record.density === 'object') {
    let yr_str = String(current_year)
    if (full_record.density[yr_str] !== undefined && !Number.isNaN(full_record.density[yr_str])) {
      density_at_year = full_record.density[yr_str]
    } else {
      let d_yrs = Object.keys(full_record.density).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
      let best_d_yr: number | null = null
      for (let i = 0; i < d_yrs.length; i++) {
        if (d_yrs[i] <= current_year)
          best_d_yr = d_yrs[i]
      }
      if (best_d_yr === null && d_yrs.length > 0)
        best_d_yr = d_yrs[d_yrs.length - 1]
      if (best_d_yr !== null) {
        let d_val = full_record.density[String(best_d_yr)]
        if (typeof d_val === 'number' && !Number.isNaN(d_val))
          density_at_year = d_val
      }
    }
  }

  //Fallback: Calculate density from population and area if density is missing
  if ((density_at_year === undefined || Number.isNaN(density_at_year)) && pop_at_year >= 0.01 && area_at_year && area_at_year > 0) {
    density_at_year = pop_at_year / area_at_year
  }

  //Extract other recorded names
  other_names_list = []
  if (full_record?.other_names) {
    if (Array.isArray(full_record.other_names)) {
      other_names_list.push(...full_record.other_names)
    } else if (typeof full_record.other_names === 'string') {
      other_names_list.push(full_record.other_names)
    }
  }
  if (full_record?.original_names) {
    if (Array.isArray(full_record.original_names)) {
      other_names_list.push(...full_record.original_names)
    } else if (typeof full_record.original_names === 'string') {
      other_names_list.push(full_record.original_names)
    }
  }
  if (city)
    other_names_list = Array.from(new Set(other_names_list)).filter((arg0_n) => arg0_n !== city.name)

  //Assemble timeseries for selected tab
  timeseries_data = useMemo(() => {
    if (!full_record)
      return []

    let target_obj: Record<string, number> | undefined
    if (active_metric_tab === 'population' && typeof full_record.population === 'object')
      target_obj = full_record.population
    else if (active_metric_tab === 'area' && typeof full_record.area === 'object')
      target_obj = full_record.area
    else if (active_metric_tab === 'density' && typeof full_record.density === 'object')
      target_obj = full_record.density

    if (!target_obj)
      return []

    let keys = Object.keys(target_obj).map(Number).sort((arg0_a, arg0_b) => arg0_a - arg0_b)
    let points: Array<[number, number]> = []

    for (let i = 0; i < keys.length; i++) {
      let yr = keys[i]
      let val = target_obj[String(yr)]
      if (val !== undefined && typeof val === 'number' && !Number.isNaN(val))
        points.push([yr, val])
    }

    return points
  }, [full_record, active_metric_tab])

  //Construct ECharts configuration - styled with red active theme and crisp typography
  chart_option = useMemo(() => {
    if (!city)
      return {}

    let line_color = '#ef4444'
    let metric_label = active_metric_tab === 'population'
      ? t.mapPanels.cityDetails.population
      : active_metric_tab === 'area'
        ? t.mapPanels.cityDetails.areaKm2
        : t.mapPanels.cityDetails.densityPeopleKm2

    let x_min = timeseries_data.length > 0 ? timeseries_data[0][0] : undefined
    let x_max = timeseries_data.length > 0 ? timeseries_data[timeseries_data.length - 1][0] : undefined
    let is_current_in_domain = x_min !== undefined && x_max !== undefined && current_year >= x_min && current_year <= x_max

    return {
      animation: false,
      dataZoom: [
        {
          filterMode: 'filter',
          type: 'inside',
          xAxisIndex: [0],
        },
        {
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          borderColor: '#334155',
          bottom: 2,
          brushSelect: false,
          fillerColor: 'rgba(239, 68, 68, 0.3)',
          handleStyle: {
            borderColor: '#ef4444',
            color: '#ef4444',
          },
          height: 14,
          moveHandleStyle: {
            color: '#ef4444',
          },
          textStyle: {
            color: '#94a3b8',
            fontSize: 9,
          },
          type: 'slider',
          xAxisIndex: [0],
        },
      ],
      grid: {
        bottom: 34,
        left: 55,
        right: 20,
        top: 20,
      },
      series: [
        {
          areaStyle: {
            color: {
              colorStops: [
                { color: 'rgba(239, 68, 68, 0.35)', offset: 0 },
                { color: 'rgba(239, 68, 68, 0.02)', offset: 1 },
              ],
              type: 'linear',
              x: 0,
              x2: 0,
              y: 0,
              y2: 1,
            },
          },
          data: timeseries_data,
          itemStyle: {
            color: line_color,
          },
          lineStyle: {
            color: line_color,
            width: 2,
          },
          markLine: is_current_in_domain ? {
            data: [
              {
                label: {
                  color: '#ffffff',
                  fontSize: 10,
                  formatter: `${UfDate.formatYear(current_year)}`,
                  position: 'insideEndTop',
                },
                lineStyle: {
                  color: '#ef4444',
                  type: 'dashed',
                  width: 1.5,
                },
                name: t.mapPanels.cityDetails.currentYear,
                xAxis: current_year,
              },
            ],
            silent: true,
            symbol: 'none',
          } : undefined,
          name: metric_label,
          showSymbol: timeseries_data.length < 30,
          smooth: true,
          symbolSize: 4,
          type: 'line',
        },
      ],
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        formatter: function (arg0_params: any) {
          let p = Array.isArray(arg0_params) ? arg0_params[0] : arg0_params
          let yr = p.data[0]
          let v = p.data[1]
          let yr_str = UfDate.formatYear(yr)
          let v_str = Math.round(v).toLocaleString('de-DE')
          return `<div style="font-size: 11px;">
            <div style="color: #94a3b8; margin-bottom: 2px;">${t.mapPanels.cityDetails.year} <b style="color: #ffffff;">${yr_str}</b></div>
            <div>${metric_label}: <b style="color: #ffffff;">${v_str}</b></div>
          </div>`
        },
        textStyle: {
          color: '#e2e8f0',
          fontSize: 11,
        },
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: (arg0_v: number) => UfDate.formatYear(arg0_v),
        },
        axisLine: { lineStyle: { color: '#334155' } },
        max: x_max,
        min: x_min,
        splitLine: { show: false },
        type: 'value',
      },
      yAxis: {
        axisLabel: {
          color: '#94a3b8',
          fontSize: 10,
          formatter: (arg0_v: number) => {
            if (arg0_v >= 1000000)
              return `${(arg0_v / 1000000).toFixed(1)}M`
            if (arg0_v >= 1000)
              return `${Math.round(arg0_v / 1000)}k`
            return String(arg0_v)
          },
        },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        type: 'value',
      },
    }
  }, [timeseries_data, active_metric_tab, current_year, city, t])

  //Guard clauses
  if (!city)
    return null

  //Anchored positioning calculations
  panel_style = {}
  if (!embedded && anchor_pos && anchor_pos.x !== undefined && anchor_pos.y !== undefined) {
    let panel_w = 384
    let panel_h = 390
    let target_x = anchor_pos.x + 24
    let target_y = anchor_pos.y - 120

    let max_x = (typeof window !== 'undefined') ? window.innerWidth - panel_w - 16 : 800
    let max_y = (typeof window !== 'undefined') ? window.innerHeight - panel_h - 70 : 600

    if (target_x > max_x)
      target_x = anchor_pos.x - panel_w - 24
    if (target_x < 16)
      target_x = 16

    if (target_y > max_y)
      target_y = max_y
    if (target_y < 16)
      target_y = 16

    panel_style = {
      left: `${Math.round(target_x)}px`,
      position: 'fixed',
      top: `${Math.round(target_y)}px`,
    }
  } else if (embedded) {
    panel_style = {
      position: 'relative',
      width: '100%',
    }
  }

  //Return statement
  return (
    <div
      id="dataview-city-details-panel"
      style={panel_style}
      className={embedded
        ? 'w-full text-foreground select-none font-sans space-y-2'
        : `z-15 w-96 max-w-[calc(100vw-32px)] bg-card/95 backdrop-blur-md border border-border shadow-2xl p-3 text-foreground select-none font-sans ${
            !anchor_pos ? 'absolute bottom-20 left-4' : ''
          }`
      }
    >
      {/* Panel Header */}
      {!embedded && (
        <div className="flex items-start justify-between pb-2 border-b border-border/60">
          <div className="min-w-0 pr-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Icon name="location_city" className="text-primary text-base shrink-0" />
              <span className="font-bold text-sm truncate text-white" title={city.name}>
                {display_city_name}
              </span>
              {is_capital && (
                <span className="text-xs font-normal text-muted-foreground">
                  ({t.mapPanels.cityDetails.capitalBadge || 'Capital'})
                </span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate mt-0.5">
              {[city.country, city.region].filter(Boolean).join(' • ') || t.mapPanels.cityDetails.urbanSettlement}
              {city.coords && ` [${city.coords[0].toFixed(2)}°, ${city.coords[1].toFixed(2)}°]`}
            </div>
          </div>
          <button
            type="button"
            onClick={on_close}
            className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-pointer shrink-0"
            title={t.mapPanels.cityDetails.closeCityDetails}
          >
            <Icon name="close" className="text-sm" />
          </button>
        </div>
      )}

      {embedded && (
        <div className="pb-1 text-[11px] text-muted-foreground border-b border-border/60 flex items-center justify-between">
          <div>
            {[city.country, city.region].filter(Boolean).join(' • ') || t.mapPanels.cityDetails.urbanSettlement}
            {city.coords && ` [${city.coords[0].toFixed(2)}°, ${city.coords[1].toFixed(2)}°]`}
          </div>
          {is_capital && (
            <span className="text-xs font-normal text-muted-foreground">
              ({t.mapPanels.cityDetails.capitalBadge || 'Capital'})
            </span>
          )}
        </div>
      )}

      {/* Capital of Polity */}
      {is_capital && polity_name && (
        <div className="py-1 text-[11px] text-muted-foreground/90 border-b border-border/30 flex items-center gap-1.5">
          <span className="text-muted-foreground font-semibold">{t.mapPanels.cityDetails.capitalOf || 'Capital of:'}</span>
          <span className="text-white font-medium">{polity_name}</span>
        </div>
      )}

      {/* Historical Name Changes */}
      {city && (city as any).historical_names && (city as any).historical_names.length > 0 && (
        <div className="py-1 text-[10px] text-muted-foreground/90 border-b border-border/30">
          <span className="text-muted-foreground font-semibold">{t.mapPanels.cityDetails.historicalNames} </span>
          <span className="text-white/90">
            {((city as any).historical_names as Array<{ date: string; name: string }>).map((arg0_h) => `${arg0_h.name} (${arg0_h.date})`).join(' • ')}
          </span>
        </div>
      )}

      {/* Other Recorded / Native Names */}
      {other_names_list.length > 0 && (
        <div className="py-1 text-[10px] text-muted-foreground/90 truncate border-b border-border/30">
          <span className="text-muted-foreground font-semibold">{t.mapPanels.cityDetails.alsoRecordedAs} </span>
          <span>{other_names_list.slice(0, 4).join(', ')}</span>
          {other_names_list.length > 4 && <span> (+{other_names_list.length - 4} more)</span>}
        </div>
      )}

      {/* Current Timeline Year Statistics Cards - Pure White Values (Strict Theme) */}
      <div className="grid grid-cols-3 gap-1.5 my-2">
        <div className="bg-muted/30 border border-border/50 p-1.5 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t.mapPanels.cityDetails.population}</div>
          <div className="text-xs font-bold font-mono text-white truncate mt-0.5">
            {pop_at_year >= 0.01 ? Math.round(pop_at_year).toLocaleString('de-DE') : '–'}
          </div>
          <div className="text-[9px] text-muted-foreground/70 mt-0.2">{formatted_current_year}</div>
        </div>

        <div className="bg-muted/30 border border-border/50 p-1.5 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t.mapPanels.cityDetails.areaKm2}</div>
          <div className="text-xs font-bold font-mono text-white truncate mt-0.5">
            {area_at_year !== undefined && !Number.isNaN(area_at_year) && area_at_year > 0
              ? `${Math.round(area_at_year).toLocaleString('de-DE')} km²`
              : '–'}
          </div>
          <div className="text-[9px] text-muted-foreground/70 mt-0.2">{t.mapPanels.cityDetails.estimated}</div>
        </div>

        <div className="bg-muted/30 border border-border/50 p-1.5 text-center">
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{t.mapPanels.cityDetails.density}</div>
          <div className="text-xs font-bold font-mono text-white truncate mt-0.5">
            {density_at_year !== undefined && !Number.isNaN(density_at_year) && density_at_year > 0
              ? `${Math.round(density_at_year).toLocaleString('de-DE')}/km²`
              : '–'}
          </div>
          <div className="text-[9px] text-muted-foreground/70 mt-0.2">{t.mapPanels.cityDetails.peoplePerKm2}</div>
        </div>
      </div>

      {/* Metric Selector Tabs for ECharts Curve - Red Interactive Theme */}
      <div className="flex items-center justify-between border-b border-border/60 pb-1 mt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{t.mapPanels.cityDetails.historicalTrajectory}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => set_active_metric_tab('population')}
            className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${
              active_metric_tab === 'population'
                ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-muted-foreground hover:text-white border-border'
            }`}
          >
            {t.mapPanels.cityDetails.population}
          </button>
          {full_record?.area && (
            <button
              type="button"
              onClick={() => set_active_metric_tab('area')}
              className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${
                active_metric_tab === 'area'
                  ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                  : 'bg-background hover:bg-muted text-muted-foreground hover:text-white border-border'
              }`}
            >
              {t.mapPanels.cityDetails.area}
            </button>
          )}
          {full_record?.density && (
            <button
              type="button"
              onClick={() => set_active_metric_tab('density')}
              className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${
                active_metric_tab === 'density'
                  ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                  : 'bg-background hover:bg-muted text-muted-foreground hover:text-white border-border'
              }`}
            >
              {t.mapPanels.cityDetails.density}
            </button>
          )}
        </div>
      </div>

      {/* Historical Timeseries Chart */}
      <div className="h-40 w-full mt-1">
        {timeseries_data.length > 0 ? (
          <ReactECharts option={chart_option} style={{ height: '100%', width: '100%' }} notMerge={true} />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            {format(t.mapPanels.cityDetails.noHistoricalRecords, active_metric_tab === 'population' ? t.mapPanels.cityDetails.population : active_metric_tab === 'area' ? t.mapPanels.cityDetails.area : t.mapPanels.cityDetails.density)}
          </div>
        )}
      </div>
    </div>
  )
}
