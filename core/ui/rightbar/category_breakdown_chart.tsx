import React, { useMemo, useState, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { DecodedRaster } from '@framework/geopng/types.ts'
import { CountryFeature, CountryStats, getFeatureEntityName } from '@framework/geopng/polygon_binning.ts'
import { Icon } from '@ui/components/icon'
import { computeSyntheticSectorBreakdown } from '@framework/raster/synthetic_demographics'
import { useLocalisation } from '@localisation'

export interface CategoryBreakdownChartProps {
  activeVariableSelectors?: Record<string, string | string[]>
  countryStats?: CountryStats | null
  currentYear?: number
  layerId?: string
  onTogglePlaceholder?: (arg0_val: boolean) => void
  raster: DecodedRaster | null
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
  syntheticByDefault?: boolean
  usePlaceholder?: boolean
}

export interface SectorItem {
  color: string
  id: string
  label: string
}

let PROFESSION_SECTORS: SectorItem[] = [
  { color: '#8c510a', id: 'agriculture', label: 'Agriculture' },
  { color: '#457b9d', id: 'informal_labour', label: 'Informal Labour' },
  { color: '#2a9d8f', id: 'manufacturing', label: 'Manufacturing' },
  { color: '#e76f51', id: 'services', label: 'Services' },
]

/**
 * CategoryBreakdownChart renders a split bar share per country when countries are selected,
 * and a single split bar of the global total when no countries are selected.
 *
 * @param {CategoryBreakdownChartProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let CategoryBreakdownChart: React.FC<CategoryBreakdownChartProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    activeVariableSelectors: active_variable_selectors = {},
    countryStats: country_stats,
    currentYear: current_year = 1950,
    layerId: layer_id = 'professions_percentage',
    onTogglePlaceholder: on_toggle_placeholder,
    raster,
    selectedCountries: selected_countries = [],
    selectedCountry: selected_country = null,
    syntheticByDefault: synthetic_by_default = true,
    usePlaceholder: controlled_use_placeholder,
  } = props

  //Declare local instance variables
  let by_country_data: Record<string, Record<string, number>>
  let container_height: number
  let container_ref = useRef<HTMLDivElement>(null)
  let container_width: number
  let countries_key: string
  let current_page: number
  let echart_ref = useRef<any>(null)
  let effective_countries: CountryFeature[]
  let effective_use_placeholder: boolean
  let format: ReturnType<typeof useLocalisation>['format']
  let global_sector_data: Record<string, number>
  let handle_next_page: () => void
  let handle_prev_page: () => void
  let handle_toggle_placeholder: (arg0_val: boolean) => void
  let has_countries: boolean
  let is_loading: boolean
  let is_percentage_mode = !layer_id.includes('total')
  let is_refining: boolean
  let is_use_placeholder: boolean
  let localisation: ReturnType<typeof useLocalisation>
  let option: any
  let page: number
  let page_size: number
  let paged_country_names: string[]
  let refine_duration_estimate_ref = useRef<number>(3.0)
  let refine_start_time_ref = useRef<number>(0)
  let refining_pct: number
  let refining_time_remaining: number
  let set_by_country_data: React.Dispatch<React.SetStateAction<Record<string, Record<string, number>>>>
  let set_container_height: React.Dispatch<React.SetStateAction<number>>
  let set_container_width: React.Dispatch<React.SetStateAction<number>>
  let set_global_sector_data: React.Dispatch<React.SetStateAction<Record<string, number>>>
  let set_internal_use_placeholder: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_loading: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_refining: React.Dispatch<React.SetStateAction<boolean>>
  let set_page: React.Dispatch<React.SetStateAction<number>>
  let set_refining_pct: React.Dispatch<React.SetStateAction<number>>
  let set_refining_time_remaining: React.Dispatch<React.SetStateAction<number>>
  let t: ReturnType<typeof useLocalisation>['t']
  let total_pages: number

  //Function body
  localisation = useLocalisation()
  format = localisation.format
  t = localisation.t
  effective_countries = useMemo(() => {
    if (selected_countries && selected_countries.length > 0)
      return selected_countries
    if (selected_country)
      return [selected_country]
    return []
  }, [selected_countries, selected_country])
  countries_key = effective_countries.map((arg0_c) => getFeatureEntityName(arg0_c)).filter(Boolean).sort().join(',')

  has_countries = effective_countries.length > 0

  ;[container_height, set_container_height] = useState<number>(240)
  ;[container_width, set_container_width] = useState<number>(640)
  ;[global_sector_data, set_global_sector_data] = useState<Record<string, number>>({
    agriculture: 25.0,
    informal_labour: 15.0,
    manufacturing: 35.0,
    services: 25.0,
  })
  ;[by_country_data, set_by_country_data] = useState<Record<string, Record<string, number>>>({})
  ;[is_use_placeholder, set_internal_use_placeholder] = useState<boolean>(
    controlled_use_placeholder !== undefined ? controlled_use_placeholder : synthetic_by_default
  )
  ;[is_loading, set_is_loading] = useState<boolean>(false)
  ;[is_refining, set_is_refining] = useState<boolean>(false)
  ;[page, set_page] = useState<number>(0)
  ;[refining_pct, set_refining_pct] = useState<number>(0)
  ;[refining_time_remaining, set_refining_time_remaining] = useState<number>(3.0)

  effective_use_placeholder = controlled_use_placeholder !== undefined ? controlled_use_placeholder : is_use_placeholder
  page_size = Math.max(2, Math.min(8, Math.floor(Math.max(60, container_height - 56) / 30)))
  total_pages = Math.max(1, Math.ceil((has_countries ? effective_countries.length : 1) / page_size))
  current_page = Math.min(page, Math.max(0, total_pages - 1))
  paged_country_names = has_countries
    ? effective_countries.slice(current_page * page_size, (current_page + 1) * page_size).map((arg0_c) => getFeatureEntityName(arg0_c)).filter(Boolean)
    : ['Global']

  handle_next_page = function () {
    if (page < total_pages - 1)
      set_page(page + 1)
  }

  handle_prev_page = function () {
    if (page > 0)
      set_page(page - 1)
  }

  handle_toggle_placeholder = function (arg0_val: boolean) {
    if (on_toggle_placeholder)
      on_toggle_placeholder(arg0_val)
    set_internal_use_placeholder(arg0_val)
  }

  //Fetch breakdown from backend API with instantaneous synthetic responsiveness
  useEffect(() => {
    let cancelled = false
    let current_yr = Math.round(current_year)
    let interval: NodeJS.Timeout | null = null

    let country_names = effective_countries.map((arg0_c) => getFeatureEntityName(arg0_c)).filter(Boolean)

    //1. Instantaneous synthetic responsiveness: initialize immediately with synthetic sector model
    let synthetic = computeSyntheticSectorBreakdown(country_names, current_yr)
    set_global_sector_data(synthetic.global)
    if (country_names.length > 0)
      set_by_country_data(synthetic.byCountry)

    //If placeholder is enabled, do not query the backend API
    if (effective_use_placeholder) {
      set_is_loading(false)
      set_is_refining(false)
      return () => {
        cancelled = true
      }
    }

    //2. Indicate that authentic calculations are being refined
    set_is_loading(true)
    set_is_refining(true)
    refine_start_time_ref.current = performance.now()
    set_refining_pct(15)
    set_refining_time_remaining(Math.max(0.3, Math.round(refine_duration_estimate_ref.current * 10) / 10))

    interval = setInterval(() => {
      let elapsed_sec = (performance.now() - refine_start_time_ref.current) / 1000
      let est_total = Math.max(1.0, refine_duration_estimate_ref.current)
      let pct = Math.min(96, Math.round((1 - Math.exp(-elapsed_sec / (est_total * 0.65))) * 100))
      let rem = Math.max(0.1, Math.round((est_total - elapsed_sec) * 10) / 10)

      set_refining_pct(Math.max(15, pct))
      set_refining_time_remaining(rem)
    }, 80)

    let geometries = effective_countries
      .filter((arg0_c) => arg0_c.geometry && getFeatureEntityName(arg0_c))
      .map((arg0_c) => ({ geometry: arg0_c.geometry, name: getFeatureEntityName(arg0_c) }))

    let fetch_promise: Promise<Response>
    if (geometries.length > 0) {
      fetch_promise = fetch('/api/raster/breakdown', {
        body: JSON.stringify({
          countries: country_names,
          geometries,
          layer: layer_id,
          year: current_yr,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    } else {
      let url = `/api/raster/breakdown?layer=${layer_id}&year=${current_yr}`
      if (country_names.length > 0)
        url += `&countries=${encodeURIComponent(country_names.join(','))}`
      fetch_promise = fetch(url)
    }

    fetch_promise
      .then((arg0_res) => {
        if (arg0_res.ok)
          return arg0_res.json()
        return null
      })
      .then((arg0_json) => {
        if (cancelled)
          return
        if (interval)
          clearInterval(interval)

        let actual_sec = (performance.now() - refine_start_time_ref.current) / 1000
        if (actual_sec > 0.3)
          refine_duration_estimate_ref.current = Math.min(10.0, Math.max(0.8, refine_duration_estimate_ref.current * 0.6 + actual_sec * 0.4))

        if (arg0_json) {
          if (arg0_json.global)
            set_global_sector_data(arg0_json.global)
          else if (arg0_json.sectors)
            set_global_sector_data(arg0_json.sectors)

          if (arg0_json.by_country)
            set_by_country_data(arg0_json.by_country)
        }
        set_refining_pct(100)
        set_refining_time_remaining(0)
        set_is_refining(false)
        set_is_loading(false)
      })
      .catch(() => {
        if (!cancelled) {
          if (interval)
            clearInterval(interval)
          set_is_refining(false)
          set_is_loading(false)
        }
      })

    return () => {
      cancelled = true
      if (interval)
        clearInterval(interval)
    }
  }, [countries_key, current_year, effective_use_placeholder, layer_id])

  //Resize observer for responsive panel updates
  useEffect(() => {
    let container = container_ref.current
    if (!container)
      return

    let trigger_resize = function () {
      if (echart_ref.current) {
        let instance = echart_ref.current.getEchartsInstance?.()
        if (instance && !instance.isDisposed?.())
          instance.resize()
      }
    }

    let observer = new ResizeObserver((arg0_entries) => {
      for (let i = 0; i < arg0_entries.length; i++) {
        let entry = arg0_entries[i]
        let width = entry.contentRect.width
        let height = entry.contentRect.height
        if (width > 0)
          set_container_width(Math.round(width))
        if (height > 0)
          set_container_height(Math.round(height))
      }
      requestAnimationFrame(trigger_resize)
    })
    observer.observe(container)

    if (container.clientWidth > 0)
      set_container_width(container.clientWidth)
    if (container.clientHeight > 0)
      set_container_height(container.clientHeight)

    trigger_resize()
    let t1 = setTimeout(trigger_resize, 100)
    let t2 = setTimeout(trigger_resize, 300)

    window.addEventListener('resize', trigger_resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', trigger_resize)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  //Build ECharts 100% split-bar configuration
  option = useMemo(() => {
    let active_prof = active_variable_selectors.profession || 'agriculture'
    let entity_labels = paged_country_names
    let normalized_entities: Record<string, number>[]
    let plot_height = Math.max(60, container_height - 56)
    let series_list: any[]
    let slot_height = plot_height / entity_labels.length
    let bar_max_width = Math.max(8, Math.min(32, Math.round(slot_height * 0.58)))

    //Normalize each entity's sector percentages so their sum is strictly 100.0%
    normalized_entities = (has_countries ? paged_country_names : ['Global']).map((arg0_name) => {
      let c_dict = has_countries ? by_country_data[arg0_name] : global_sector_data
      if (has_countries && !c_dict) {
        let found_k = Object.keys(by_country_data).find(
          (arg0_k) => arg0_k.toLowerCase().trim() === arg0_name.toLowerCase().trim()
        )
        if (found_k)
          c_dict = by_country_data[found_k]
      }
      let raw_vals = PROFESSION_SECTORS.map((arg0_s) =>
        c_dict && c_dict[arg0_s.id] !== undefined ? Math.max(0, c_dict[arg0_s.id]) : (global_sector_data[arg0_s.id] ?? 25.0)
      )
      let sum = raw_vals.reduce((arg0_a, arg0_b) => arg0_a + arg0_b, 0)
      let norm_vals = raw_vals.map((arg0_v) => (sum > 0 ? (arg0_v / sum) * 100 : 25.0))
      let last_idx = norm_vals.length - 1
      let lead_sum = 0
      for (let s = 0; s < last_idx; s++) {
        norm_vals[s] = Math.round(norm_vals[s] * 10) / 10
        lead_sum += norm_vals[s]
      }
      norm_vals[last_idx] = Math.round((100 - lead_sum) * 10) / 10

      let res: Record<string, number> = {}
      for (let s = 0; s < PROFESSION_SECTORS.length; s++)
        res[PROFESSION_SECTORS[s].id] = norm_vals[s]
      return res
    })

    series_list = PROFESSION_SECTORS.map((arg0_sector) => {
      let is_active_prof = arg0_sector.id === active_prof
      let sector_data_points = normalized_entities.map((arg0_dict) => arg0_dict[arg0_sector.id] ?? 25.0)

      return {
        barCategoryGap: '20%',
        barMaxWidth: bar_max_width,
        data: sector_data_points,
        emphasis: {
          focus: 'series',
          itemStyle: {
            borderColor: '#ffffff',
            borderWidth: 1,
            shadowBlur: 6,
            shadowColor: 'rgba(255,255,255,0.4)',
          },
        },
        itemStyle: {
          borderColor: '#18181b',
          borderWidth: 0.5,
          color: arg0_sector.color,
          opacity: is_active_prof ? 1 : 0.88,
        },
        label: {
          color: '#ffffff',
          fontSize: Math.max(8, Math.min(10.5, Math.round(bar_max_width * 0.6))),
          formatter: (arg0_param: any) => {
            let v = arg0_param.value
            return v >= 8 ? `${v.toFixed(0)}%` : ''
          },
          position: 'inside',
          show: true,
        },
        name: arg0_sector.label,
        stack: 'total', //Split bar stacked share
        type: 'bar',
      }
    })

    return {
      animationDuration: 300,
      backgroundColor: 'transparent',
      grid: {
        bottom: 20,
        containLabel: true,
        left: 8,
        right: 18,
        top: 26,
      },
      legend: {
        itemGap: 10,
        itemHeight: 9,
        itemWidth: 12,
        right: '4%',
        textStyle: { color: '#a1a1aa', fontSize: 10 },
        top: '2px',
      },
      series: series_list,
      tooltip: {
        appendToBody: true,
        backgroundColor: 'rgba(20, 20, 25, 0.95)',
        borderColor: '#3f3f46',
        borderWidth: 1,
        extraCssText: 'z-index: 99999999; pointer-events: none;',
        formatter: (arg0_param: any) => {
          let c_name = arg0_param.name
          let pct = arg0_param.value
          let s_name = arg0_param.seriesName
          let s_obj = PROFESSION_SECTORS.find((arg0_s) => arg0_s.label === s_name)
          let color = s_obj ? s_obj.color : '#ffffff'

          return `
            <div style="font-family: sans-serif; font-size: 11px; line-height: 1.4;">
              <div style="font-weight: bold; border-bottom: 1px solid #3f3f46; padding-bottom: 3px; margin-bottom: 4px; color: #f4f4f5;">
                ${c_name} <span style="font-weight: normal; color: #a1a1aa;">(${current_year < 0 ? `${Math.abs(current_year)}BC` : `${current_year}AD`})</span>
              </div>
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 16px; color: ${color};">
                <span><b>${s_name}:</b></span>
                <b style="font-size: 12px;">${pct.toFixed(1)}%</b>
              </div>
            </div>
          `
        },
        padding: [6, 10],
        textStyle: { color: '#ffffff', fontSize: 11 },
        trigger: 'item',
      },
      xAxis: {
        axisLabel: {
          color: '#71717a',
          fontSize: 8.5,
          formatter: '{value}%',
        },
        axisLine: { lineStyle: { color: '#27272a' } },
        max: 100,
        min: 0,
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        type: 'value',
      },
      yAxis: {
        axisLabel: {
          color: '#d4d4d8',
          ellipsis: '...',
          fontSize: 10,
          fontWeight: 'bold',
          interval: 0,
          overflow: 'truncate',
          width: 140,
        },
        axisLine: { lineStyle: { color: '#3f3f46' } },
        axisTick: { show: false },
        data: entity_labels,
        inverse: true,
        type: 'category',
      },
    }
  }, [
    active_variable_selectors.profession,
    by_country_data,
    current_year,
    global_sector_data,
    has_countries,
    paged_country_names,
  ])

  //Return statement
  return (
    <div className="h-full w-full flex flex-col min-h-0 select-none">
      <div className="flex items-center justify-between px-2 pt-1 pb-1 border-b border-border/40 text-[11px] bg-muted/20">
        <div className="flex items-center gap-2 truncate">
          <span className="font-bold text-foreground flex items-center gap-1">
            <Icon name="work" className="text-primary text-xs" />
            <span>
              {has_countries
                ? format(t.analytics.categorySplitSelected, effective_countries.length)
                : t.analytics.globalCategorySplit}
            </span>
          </span>
          <span className="text-muted-foreground font-mono">
            ({current_year < 0 ? `${Math.abs(current_year)}BC` : `${current_year}AD`})
          </span>
        </div>

        <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground shrink-0">
          <span>{t.analytics.activeLabel}</span>
          <span className="text-primary font-bold capitalize">
            {Array.isArray(active_variable_selectors.profession)
              ? active_variable_selectors.profession.map((arg0_p) => arg0_p.replace(/_/g, ' ')).join(', ') || 'Agriculture'
              : active_variable_selectors.profession?.replace(/_/g, ' ') || 'Agriculture'}
          </span>
        </div>
      </div>

      {/* Secondary Controls Bar & Pagination */}
      <div className="flex items-center justify-between px-2 py-0.5 bg-muted/35 border-b border-border/40 text-[10px] font-mono shrink-0">
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none text-foreground/80 hover:text-foreground">
            <input
              type="checkbox"
              checked={effective_use_placeholder}
              onChange={(arg0_e) => handle_toggle_placeholder(arg0_e.target.checked)}
              className="h-3 w-3 rounded border-border text-primary accent-primary cursor-pointer"
            />
            <span>{t.analytics.usePlaceholder}</span>
          </label>
          {effective_use_placeholder ? (
            <span
              className="px-1.5 py-0.2 text-[9px] text-muted-foreground bg-muted/50 border border-border/50 rounded cursor-help"
              title="Showing instantaneous synthetic sector proxy. Uncheck 'Use Placeholder' to compute from authentic rasters."
            >
              {t.analytics.syntheticProxy}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30 rounded">
              {t.analytics.exact}
            </span>
          )}
        </div>

        {total_pages > 1 && (
          <div className="flex items-center gap-1 border-l border-border/60 pl-2">
            <button
              type="button"
              disabled={page <= 0}
              onClick={handle_prev_page}
              className="h-4.5 w-4.5 flex items-center justify-center border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:pointer-events-none cursor-pointer transition-colors"
              title="Previous page"
            >
              <Icon name="chevron_left" className="text-xs" />
            </button>
            <span className="text-[9px] font-mono text-muted-foreground px-1 select-none">
              {page + 1}/{total_pages}
            </span>
            <button
              type="button"
              disabled={page >= total_pages - 1}
              onClick={handle_next_page}
              className="h-4.5 w-4.5 flex items-center justify-center border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:pointer-events-none cursor-pointer transition-colors"
              title="Next page"
            >
              <Icon name="chevron_right" className="text-xs" />
            </button>
          </div>
        )}
      </div>

      <div ref={container_ref} className="flex-1 min-h-0 relative w-full overflow-hidden">
        <ReactECharts
          ref={echart_ref}
          option={option}
          style={{ height: '100%', width: '100%' }}
          opts={{ renderer: 'canvas' }}
          notMerge={true}
        />

        {/* Faint centered refining calculation indicator overlay */}
        {is_refining && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none select-none">
            <div className="flex flex-col items-center gap-1.5 px-3 py-1.5 bg-background/55 backdrop-blur-[2px] border border-border/40 text-foreground/80 text-xs font-mono shadow-sm">
              <div className="flex items-center gap-2">
                <Icon name="sync" className="text-amber-400 text-xs animate-spin" />
                <span className="font-semibold text-amber-400/90">
                  {format(t.analytics.refiningCalculations, refining_pct, refining_time_remaining.toFixed(1))}
                </span>
              </div>
              <div className="w-32 h-1 bg-muted/60 border border-border/60 overflow-hidden">
                <div
                  className="h-full bg-amber-400/80 transition-all duration-100 ease-out"
                  style={{ width: `${refining_pct}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CategoryBreakdownChart
