import React, { useMemo, useState, useEffect, useRef } from 'react'
import ReactECharts from 'echarts-for-react'
import { CityPoint } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { UfDate } from '@framework/utils/uf_date'
import { getPrimaryCityName } from '@framework/stadester/city_name_framework'
import { useLocalisation } from '@localisation'

export interface LargestCitiesChartProps {
  currentYear: number
  dataset?: 'stadester_1.1' | 'stadester_1.0'
  onSelectCity?: (arg0_key: string) => void
}

let REGION_COLOR_MAP: Record<string, string> = {
  africa: '#f97316',
  central_asia: '#a855f7',
  eastasia: '#ef4444',
  eastern_europe_and_russia: '#3b82f6',
  europe: '#6366f1',
  indian_subcontinent: '#ec4899',
  latin_america: '#10b981',
  maghreb_egypt: '#eab308',
  middle_east: '#d97706',
  northern_america: '#0ea5e9',
  oceania: '#14b8a6',
  south_asia: '#ec4899',
  southeast_asia: '#8b5cf6',
  sub_saharan_africa: '#f97316',
}

/**
 * Special analytical chart displaying the ranked largest cities at the current timeline year.
 *
 * @param {LargestCitiesChartProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let LargestCitiesChart: React.FC<LargestCitiesChartProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let current_year = props.currentYear
  let dataset = props.dataset || 'stadester_1.1'
  let on_select_city = props.onSelectCity

  //Declare local instance variables
  let cities_list: CityPoint[]
  let container_height: number
  let container_ref = useRef<HTMLDivElement>(null)
  let container_width: number
  let current_page: number
  let echart_option: any
  let echart_ref = useRef<any>(null)
  let effective_cities: CityPoint[]
  let format: ReturnType<typeof useLocalisation>['format']
  let handle_next_page: () => void
  let handle_prev_page: () => void
  let is_loading: boolean
  let limit: number
  let localisation: ReturnType<typeof useLocalisation>
  let page: number
  let page_size: number
  let paged_cities: CityPoint[]
  let set_cities_list: React.Dispatch<React.SetStateAction<CityPoint[]>>
  let set_container_height: React.Dispatch<React.SetStateAction<number>>
  let set_container_width: React.Dispatch<React.SetStateAction<number>>
  let set_is_loading: React.Dispatch<React.SetStateAction<boolean>>
  let set_limit: React.Dispatch<React.SetStateAction<number>>
  let set_page: React.Dispatch<React.SetStateAction<number>>
  let t: ReturnType<typeof useLocalisation>['t']
  let total_pages: number

  //Function body
  localisation = useLocalisation()
  format = localisation.format
  t = localisation.t

  ;[cities_list, set_cities_list] = useState<CityPoint[]>([])
  ;[container_height, set_container_height] = useState<number>(240)
  ;[container_width, set_container_width] = useState<number>(640)
  ;[is_loading, set_is_loading] = useState<boolean>(false)
  ;[limit, set_limit] = useState<number>(15)
  ;[page, set_page] = useState<number>(0)

  //Resize observer to dynamically adapt page size and bar dimensions to container height
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

  effective_cities = cities_list.slice(0, limit)
  page_size = Math.max(3, Math.min(limit, Math.floor(Math.max(60, container_height - 30) / 21)))
  total_pages = Math.max(1, Math.ceil(effective_cities.length / page_size))
  current_page = Math.min(page, Math.max(0, total_pages - 1))
  paged_cities = effective_cities.slice(current_page * page_size, (current_page + 1) * page_size)

  handle_next_page = function () {
    if (page < total_pages - 1)
      set_page(page + 1)
  }

  handle_prev_page = function () {
    if (page > 0)
      set_page(page - 1)
  }

  //Fetch largest cities whenever year, dataset or limit changes
  useEffect(() => {
    let controller = new AbortController()
    let rounded_year = Math.round(current_year)

    set_is_loading(true)
    set_page(0)
    fetch(`/api/stadester/largest?dataset=${dataset}&year=${rounded_year}&limit=${limit}`, {
      signal: controller.signal,
    })
      .then((arg0_res) => {
        if (!arg0_res.ok)
          throw new Error(`HTTP error: ${arg0_res.status}`)
        return arg0_res.json()
      })
      .then((arg0_data) => {
        set_cities_list(arg0_data.cities || [])
        set_is_loading(false)
      })
      .catch((arg0_err) => {
        if (arg0_err.name !== 'AbortError') {
          console.error('[LargestCitiesChart] Error fetching largest cities:', arg0_err)
          set_is_loading(false)
        }
      })

    return () => {
      controller.abort()
    }
  }, [current_year, dataset, limit])

  //Build horizontal bar chart option for ECharts
  echart_option = useMemo(() => {
    let available_plot_height = Math.max(60, container_height - 30)
    let bar_max_width = Math.max(6, Math.min(18, Math.round((available_plot_height / Math.max(1, paged_cities.length)) * 0.55)))
    let label_font_size = Math.max(8.5, Math.min(11, Math.round((available_plot_height / Math.max(1, paged_cities.length)) * 0.45)))
    let series_data: any[] = []
    let y_names: string[] = []

    for (let i = 0; i < paged_cities.length; i++) {
      let c = paged_cities[i]
      let clean_name = getPrimaryCityName(c.name)
      let region_key = (c.region || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
      let item_color = REGION_COLOR_MAP[region_key] || '#3b82f6'

      y_names.push(clean_name)
      series_data.push({
        cityData: c,
        itemStyle: {
          borderRadius: [0, 2, 2, 0],
          color: item_color,
        },
        value: c.population,
      })
    }

    return {
      animationDuration: 300,
      grid: {
        bottom: 22,
        containLabel: true,
        left: 8,
        right: 34,
        top: 6,
      },
      series: [
        {
          barCategoryGap: '22%',
          barMaxWidth: bar_max_width,
          data: series_data,
          emphasis: {
            itemStyle: {
              shadowBlur: 6,
              shadowColor: 'rgba(255, 255, 255, 0.4)',
            },
          },
          label: {
            color: '#cbd5e1',
            fontFamily: 'monospace',
            fontSize: Math.max(8.5, label_font_size - 0.5),
            formatter: (arg0_p: any) => {
              let val = arg0_p.value
              if (val >= 1000000)
                return `${(val / 1000000).toFixed(1)}M`
              if (val >= 1000)
                return `${Math.round(val / 1000)}k`
              return String(val)
            },
            position: 'right',
            show: true,
          },
          type: 'bar',
        },
      ],
      tooltip: {
        appendToBody: true,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        extraCssText: 'z-index: 99999999; pointer-events: none;',
        formatter: function (arg0_params: any) {
          let c: CityPoint = arg0_params.data?.cityData
          if (!c)
            return ''
          let clean_name = getPrimaryCityName(c.name)
          let rank = effective_cities.findIndex((arg0_item) => arg0_item.key === c.key) + 1
          let pop_formatted = Math.round(c.population).toLocaleString('de-DE')
          let other_parts = c.name && c.name.includes(';') ? c.name.split(';').slice(1, 4).map((s) => s.trim()).join(', ') : ''
          return `<div style="font-size: 11px; max-width: 280px;">
            <div style="font-weight: bold; color: #ffffff;">#${rank} ${clean_name}</div>
            <div style="color: #94a3b8; font-size: 10px; margin-bottom: 3px;">
              ${[c.country, c.region].filter(Boolean).join(' • ')}
            </div>
            <div>${t.analytics.population}: <b style="color: #38bdf8;">${pop_formatted}</b></div>
            ${c.area ? `<div style="color: #cbd5e1;">${t.analytics.area}: ${Math.round(c.area).toLocaleString('de-DE')} km²</div>` : ''}
            ${c.density ? `<div style="color: #cbd5e1;">${t.analytics.density}: ${Math.round(c.density).toLocaleString('de-DE')} /km²</div>` : ''}
            ${other_parts ? `<div style="color: #64748b; font-size: 9px; margin-top: 3px; line-height: 1.2;">${t.analytics.agglomerationIncludes}: ${other_parts}...</div>` : ''}
            <div style="font-size: 9px; color: #475569; margin-top: 4px;">${t.analytics.clickToInspectCity}</div>
          </div>`
        },
        trigger: 'item',
      },
      xAxis: {
        axisLabel: {
          color: '#94a3b8',
          fontSize: 8.5,
          formatter: (arg0_v: number) => {
            if (arg0_v >= 1000000)
              return `${(arg0_v / 1000000).toFixed(0)}M`
            if (arg0_v >= 1000)
              return `${Math.round(arg0_v / 1000)}k`
            return String(arg0_v)
          },
        },
        axisLine: { lineStyle: { color: '#334155' } },
        splitLine: { lineStyle: { color: '#1e293b' } },
        type: 'value',
      },
      yAxis: {
        axisLabel: {
          color: '#f8fafc',
          ellipsis: '...',
          fontSize: label_font_size,
          interval: 0,
          overflow: 'truncate',
          width: Math.max(70, Math.min(140, Math.round(container_width * 0.22))),
        },
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        data: y_names,
        inverse: true,
        type: 'category',
      },
    }
  }, [container_height, container_width, effective_cities, paged_cities, t])

  //Return statement
  return (
    <div className="h-full w-full flex flex-col justify-between min-h-0 select-none overflow-hidden gap-1.5">
      {/* Top Controls: Ranking limits & pagination */}
      <div className="flex items-center justify-between border-b border-border/60 pb-1 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon name="leaderboard" className="text-white text-xs shrink-0" />
          <span className="font-bold text-foreground text-xs uppercase tracking-wider truncate">
            {t.analytics.largestCitiesTitle}
          </span>
        </div>

        {/* Limit Chips & Page Switcher */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1 shrink-0 flex-nowrap">
            {[10, 15, 25, 50].map((arg0_n) => (
              <button
                key={arg0_n}
                type="button"
                onClick={() => {
                  set_limit(arg0_n)
                  set_page(0)
                }}
                className={`px-1.5 py-0.5 text-[10px] whitespace-nowrap shrink-0 rounded-none border transition-colors cursor-pointer ${
                  limit === arg0_n
                    ? 'bg-primary text-primary-foreground border-primary font-bold'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                }`}
              >
                {format(t.analytics.topN, arg0_n)}
              </button>
            ))}
          </div>

          {total_pages > 1 && (
            <div className="flex items-center gap-0.5 border-l border-border/60 pl-1.5">
              <button
                type="button"
                disabled={page <= 0}
                onClick={handle_prev_page}
                className="h-5 w-5 flex items-center justify-center border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:pointer-events-none cursor-pointer transition-colors"
                title="Previous page"
              >
                <Icon name="chevron_left" className="text-xs" />
              </button>
              <span className="text-[10px] font-mono text-muted-foreground px-1 select-none">
                {page + 1}/{total_pages}
              </span>
              <button
                type="button"
                disabled={page >= total_pages - 1}
                onClick={handle_next_page}
                className="h-5 w-5 flex items-center justify-center border border-border bg-background hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-25 disabled:pointer-events-none cursor-pointer transition-colors"
                title="Next page"
              >
                <Icon name="chevron_right" className="text-xs" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Ranked Bar Chart Container bounded to available space */}
      <div ref={container_ref} className="flex-1 min-h-0 relative w-full overflow-hidden">
        {is_loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/60 backdrop-blur-xs text-xs text-muted-foreground animate-pulse">
            {format(t.analytics.rankingUrbanSettlements, UfDate.formatYear(current_year))}
          </div>
        )}

        {paged_cities.length > 0 ? (
          <ReactECharts
            ref={echart_ref}
            option={echart_option}
            style={{ height: '100%', width: '100%' }}
            notMerge={true}
            onEvents={{
              click: function (arg0_params: any) {
                let city_key = arg0_params?.data?.cityData?.key
                if (city_key && on_select_city)
                  on_select_city(city_key)
              },
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
            {format(t.analytics.noSettlementsRecorded, UfDate.formatYear(current_year))}
          </div>
        )}
      </div>
    </div>
  )
}

export default LargestCitiesChart
