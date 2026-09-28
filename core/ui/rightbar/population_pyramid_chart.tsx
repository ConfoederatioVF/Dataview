import React, { useMemo, useState, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { DecodedRaster } from '@framework/geopng/types.ts'
import { CountryFeature, CountryStats, getFeatureEntityName } from '@framework/geopng/polygon_binning.ts'
import { Icon } from '@ui/components/icon'
import { formatLegendValue } from '@ui/topbar/color_bar_legend'
import { computeSyntheticDemographicPyramid } from '@framework/raster/synthetic_demographics'
import { useLocalisation } from '@localisation'

export interface PopulationPyramidChartProps {
  activeVariableSelectors?: Record<string, string | string[]>
  countryStats?: CountryStats | null
  currentYear: number
  inspectData?: {
    countryName?: string
    lat: number
    lng: number
    pixelX: number
    pixelY: number
    value: number | null
  } | null
  isMobile?: boolean
  onTogglePlaceholder?: (arg0_val: boolean) => void
  raster: DecodedRaster | null
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
  syntheticByDefault?: boolean
  usePlaceholder?: boolean
}

export interface AgeCohortItem {
  compactLabel: string
  id: string
  label: string
}

export let AGE_COHORTS: AgeCohortItem[] = [
  { compactLabel: '0-1', id: '00', label: '0-1yo, Infants' },
  { compactLabel: '1-5', id: '01', label: '1-5yo' },
  { compactLabel: '5-10', id: '05', label: '5-10yo' },
  { compactLabel: '10-15', id: '10', label: '10-15yo' },
  { compactLabel: '15-20', id: '15', label: '15-20yo' },
  { compactLabel: '20-25', id: '20', label: '20-25yo' },
  { compactLabel: '25-30', id: '25', label: '25-30yo' },
  { compactLabel: '30-35', id: '30', label: '30-35yo' },
  { compactLabel: '35-40', id: '35', label: '35-40yo' },
  { compactLabel: '40-45', id: '40', label: '40-45yo' },
  { compactLabel: '45-50', id: '45', label: '45-50yo' },
  { compactLabel: '50-55', id: '50', label: '50-55yo' },
  { compactLabel: '55-60', id: '55', label: '55-60yo' },
  { compactLabel: '60-65', id: '60', label: '60-65yo' },
  { compactLabel: '65-70', id: '65', label: '65-70yo' },
  { compactLabel: '70-75', id: '70', label: '70-75yo' },
  { compactLabel: '75-80', id: '75', label: '75-80yo' },
  { compactLabel: '80+', id: '80', label: '80+, Seniors' },
]

/**
 * PopulationPyramidChart renders bidirectional population pyramids with support for
 * individual country analysis and country switching.
 *
 * @param {PopulationPyramidChartProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let PopulationPyramidChart: React.FC<PopulationPyramidChartProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    activeVariableSelectors: active_variable_selectors = {},
    countryStats: country_stats,
    currentYear: current_year,
    inspectData: inspect_data,
    isMobile: is_mobile_prop = false,
    onTogglePlaceholder: on_toggle_placeholder,
    raster,
    selectedCountries: selected_countries = [],
    selectedCountry: selected_country = null,
    syntheticByDefault: synthetic_by_default = true,
    usePlaceholder: controlled_use_placeholder,
  } = props

  //Declare local instance variables
  let active_country_name: string | null
  let container_ref = useRef<HTMLDivElement>(null)
  let container_width: number
  let echart_ref = useRef<any>(null)
  let effective_countries: CountryFeature[]
  let effective_use_placeholder: boolean
  let female_values: number[]
  let format: ReturnType<typeof useLocalisation>['format']
  let handle_toggle_placeholder: (arg0_val: boolean) => void
  let is_loading: boolean
  let is_narrow: boolean
  let is_refining: boolean
  let is_use_placeholder: boolean
  let localisation: ReturnType<typeof useLocalisation>
  let male_values: number[]
  let old_age_dependency_ratio: number
  let option: any
  let pyramid_data: { female: Record<string, number>; male: Record<string, number> } | null
  let raw_old_age_dependency_ratio: number
  let refine_duration_estimate_ref = useRef<number>(3.5)
  let refine_start_time_ref = useRef<number>(0)
  let refining_pct: number
  let refining_time_remaining: number
  let set_active_country_name: React.Dispatch<React.SetStateAction<string | null>>
  let set_container_width: React.Dispatch<React.SetStateAction<number>>
  let set_internal_use_placeholder: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_loading: React.Dispatch<React.SetStateAction<boolean>>
  let set_is_refining: React.Dispatch<React.SetStateAction<boolean>>
  let set_pyramid_data: React.Dispatch<React.SetStateAction<{ female: Record<string, number>; male: Record<string, number> } | null>>
  let set_raw_old_age_dependency_ratio: React.Dispatch<React.SetStateAction<number>>
  let set_refining_pct: React.Dispatch<React.SetStateAction<number>>
  let set_refining_time_remaining: React.Dispatch<React.SetStateAction<number>>
  let set_sex_ratio: React.Dispatch<React.SetStateAction<number>>
  let set_total_female: React.Dispatch<React.SetStateAction<number>>
  let set_total_male: React.Dispatch<React.SetStateAction<number>>
  let sex_ratio: number
  let t: ReturnType<typeof useLocalisation>['t']
  let total_female: number
  let total_male: number

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

    ;[active_country_name, set_active_country_name] = useState<string | null>(
      effective_countries.length > 0 ? getFeatureEntityName(effective_countries[effective_countries.length - 1]) : null
    )
    ;[container_width, set_container_width] = useState<number>(() => {
      if (typeof window !== 'undefined')
        return window.innerWidth < 768 ? window.innerWidth : 640
      return 640
    })
    ;[is_use_placeholder, set_internal_use_placeholder] = useState<boolean>(
      controlled_use_placeholder !== undefined ? controlled_use_placeholder : synthetic_by_default
    )
    ;[pyramid_data, set_pyramid_data] = useState<{ female: Record<string, number>; male: Record<string, number> } | null>(null)
    ;[is_loading, set_is_loading] = useState<boolean>(false)
    ;[is_refining, set_is_refining] = useState<boolean>(false)
    ;[refining_pct, set_refining_pct] = useState<number>(0)
    ;[refining_time_remaining, set_refining_time_remaining] = useState<number>(3.5)
    ;[total_male, set_total_male] = useState<number>(0)
    ;[total_female, set_total_female] = useState<number>(0)
    ;[sex_ratio, set_sex_ratio] = useState<number>(1.0)
    ;[raw_old_age_dependency_ratio, set_raw_old_age_dependency_ratio] = useState<number>(15.0)

  effective_use_placeholder = controlled_use_placeholder !== undefined ? controlled_use_placeholder : is_use_placeholder
  is_narrow = Boolean(is_mobile_prop || container_width < 500)

  handle_toggle_placeholder = function (arg0_val: boolean) {
    if (on_toggle_placeholder)
      on_toggle_placeholder(arg0_val)
    set_internal_use_placeholder(arg0_val)
  }

  //Auto-synchronize active country selection when user selects or clicks countries
  useEffect(() => {
    if (effective_countries.length > 0) {
      let names = effective_countries.map((arg0_c) => getFeatureEntityName(arg0_c)).filter(Boolean)
      if (!active_country_name || !names.includes(active_country_name)) {
        set_active_country_name(names[names.length - 1])
      }
    } else {
      set_active_country_name(null)
    }
  }, [effective_countries])

  //Fetch individual country or global pyramid breakdown with instantaneous synthetic responsiveness
  useEffect(() => {
    let cancelled = false
    let current_yr = Math.round(current_year)
    let interval: NodeJS.Timeout | null = null

    //1. Instantaneous responsiveness: initialize immediately with synthetic demographic model
    let synthetic = computeSyntheticDemographicPyramid(active_country_name || 'Global', current_yr)
    set_pyramid_data({ female: synthetic.female, male: synthetic.male })
    set_total_male(synthetic.totalMale)
    set_total_female(synthetic.totalFemale)
    set_sex_ratio(synthetic.sexRatio)
    set_raw_old_age_dependency_ratio(
      synthetic.oldAgeDependencyRatio !== undefined
        ? synthetic.oldAgeDependencyRatio
        : synthetic.dependencyRatio
    )

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
    set_refining_time_remaining(Math.max(0.3, Math.round(refine_duration_estimate_ref.current*10)/10))

    interval = setInterval(() => {
      let elapsed_sec = (performance.now() - refine_start_time_ref.current)/1000
      let est_total = Math.max(1.0, refine_duration_estimate_ref.current)
      let pct = Math.min(96, Math.round((1 - Math.exp(-elapsed_sec/(est_total*0.65)))*100))
      let rem = Math.max(0.1, Math.round((est_total - elapsed_sec)*10)/10)

      set_refining_pct(Math.max(15, pct))
      set_refining_time_remaining(rem)
    }, 80)

    let active_feat = effective_countries.find(
      (arg0_c) => getFeatureEntityName(arg0_c) === active_country_name
    ) || (effective_countries.length > 0 ? effective_countries[effective_countries.length - 1] : null)

    let fetch_promise: Promise<Response>
    if (active_feat && active_feat.geometry) {
      fetch_promise = fetch('/api/raster/breakdown', {
        body: JSON.stringify({
          country: active_country_name,
          geometry: active_feat.geometry,
          layer: 'age_sex',
          year: current_yr,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      })
    } else {
      let url = `/api/raster/breakdown?layer=age_sex&year=${current_yr}`
      if (active_country_name) {
        url += `&country=${encodeURIComponent(active_country_name)}`
      } else if (inspect_data && Number.isFinite(inspect_data.pixelX) && Number.isFinite(inspect_data.pixelY)) {
        url += `&x=${inspect_data.pixelX}&y=${inspect_data.pixelY}`
      }
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

        let actual_sec = (performance.now() - refine_start_time_ref.current)/1000
        if (actual_sec > 0.3)
          refine_duration_estimate_ref.current = Math.min(10.0, Math.max(0.8, refine_duration_estimate_ref.current*0.6 + actual_sec*0.4))

        if (arg0_json && arg0_json.male && arg0_json.female) {
          set_pyramid_data({ female: arg0_json.female, male: arg0_json.male })
          if (arg0_json.totalMale !== undefined)
            set_total_male(arg0_json.totalMale)
          if (arg0_json.totalFemale !== undefined)
            set_total_female(arg0_json.totalFemale)
          if (arg0_json.sexRatio !== undefined)
            set_sex_ratio(arg0_json.sexRatio)
          if (arg0_json.oldAgeDependencyRatio !== undefined) {
            set_raw_old_age_dependency_ratio(arg0_json.oldAgeDependencyRatio)
          } else if (arg0_json.dependencyRatio !== undefined) {
            set_raw_old_age_dependency_ratio(arg0_json.dependencyRatio)
          }
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
  }, [active_country_name, current_year, effective_countries, effective_use_placeholder, inspect_data?.pixelX, inspect_data?.pixelY])

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
        if (width > 0)
          set_container_width(Math.round(width))
      }
      requestAnimationFrame(trigger_resize)
    })
    observer.observe(container)

    if (container.clientWidth > 0)
      set_container_width(container.clientWidth)

    trigger_resize()
    let t1 = setTimeout(trigger_resize, 100)
    let t2 = setTimeout(trigger_resize, 300)

    let handle_window_resize = function () {
      if (container_ref.current && container_ref.current.clientWidth > 0)
        set_container_width(container_ref.current.clientWidth)
      trigger_resize()
    }

    window.addEventListener('resize', handle_window_resize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', handle_window_resize)
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [])

  male_values = useMemo(() => {
    if (!pyramid_data?.male)
      return AGE_COHORTS.map(() => 0)
    return AGE_COHORTS.map((arg0_c) => -(pyramid_data!.male[arg0_c.id] || 0))
  }, [pyramid_data])

  female_values = useMemo(() => {
    if (!pyramid_data?.female)
      return AGE_COHORTS.map(() => 0)
    return AGE_COHORTS.map((arg0_c) => pyramid_data!.female[arg0_c.id] || 0)
  }, [pyramid_data])

  old_age_dependency_ratio = useMemo(() => {
    if (pyramid_data?.male && pyramid_data?.female) {
      let old_count = 0
      let working_count = 0

      for (let i = 0; i < AGE_COHORTS.length; i++) {
        let cid = AGE_COHORTS[i].id
        let cohort_total = (pyramid_data.male[cid] || 0) + (pyramid_data.female[cid] || 0)

        if (i >= 14) {
          old_count += cohort_total
        } else if (i >= 4) {
          working_count += cohort_total
        }
      }

      if (working_count > 0)
        return Math.round((old_count/working_count)*1000)/10
    }
    return raw_old_age_dependency_ratio
  }, [pyramid_data, raw_old_age_dependency_ratio])

  option = useMemo(() => {
    let active_gender = Array.isArray(active_variable_selectors.gender)
      ? active_variable_selectors.gender[0] || 't'
      : active_variable_selectors.gender || 't'
    let axis_limit: number
    let effective_width = container_width > 0 ? container_width : (typeof window !== 'undefined' ? (window.innerWidth < 768 ? window.innerWidth : 640) : 640)
    let grid_bottom = 30
    let grid_inset_x = is_narrow ? 14 : '4%'
    let label_margin = Math.max(16, Math.round(effective_width * 0.07))
    let max_abs_val = 1
    let y_labels = AGE_COHORTS.map((arg0_c) => arg0_c.label)

    for (let i = 0; i < AGE_COHORTS.length; i++) {
      let m = Math.abs(male_values[i] || 0)
      let f = female_values[i] || 0
      if (m > max_abs_val)
        max_abs_val = m
      if (f > max_abs_val)
        max_abs_val = f
    }
    axis_limit = Math.ceil(max_abs_val * 1.15)

    return {
      animationDuration: 250,
      backgroundColor: 'transparent',
      grid: [
        {
          bottom: grid_bottom,
          containLabel: false,
          left: grid_inset_x,
          right: '57%',
          top: effective_countries.length > 0 ? '34px' : '28px',
        },
        {
          bottom: grid_bottom,
          containLabel: false,
          left: '57%',
          right: grid_inset_x,
          top: effective_countries.length > 0 ? '34px' : '28px',
        },
      ],
      legend: {
        data: [t.analytics.maleCohorts, t.analytics.femaleCohorts],
        itemGap: 14,
        itemHeight: 10,
        itemWidth: 12,
        right: '4%',
        textStyle: { color: '#a1a1aa', fontSize: 11 },
        top: '2px',
      },
      series: [
        {
          barCategoryGap: '18%',
          data: male_values.map((arg0_v) => Math.abs(arg0_v)),
          emphasis: {
            itemStyle: {
              borderColor: '#ffffff',
              borderWidth: 1.5,
              shadowBlur: 8,
              shadowColor: 'rgba(59, 130, 246, 0.5)',
            },
          },
          itemStyle: {
            borderColor: active_gender === 'm' ? '#ffffff' : 'transparent',
            borderWidth: active_gender === 'm' ? 1.5 : 0,
            color: '#3b82f6',
          },
          name: t.analytics.maleCohorts,
          type: 'bar',
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          barCategoryGap: '18%',
          data: female_values,
          emphasis: {
            itemStyle: {
              borderColor: '#ffffff',
              borderWidth: 1.5,
              shadowBlur: 8,
              shadowColor: 'rgba(236, 72, 153, 0.5)',
            },
          },
          itemStyle: {
            borderColor: active_gender === 'f' ? '#ffffff' : 'transparent',
            borderWidth: active_gender === 'f' ? 1.5 : 0,
            color: '#ec4899',
          },
          name: t.analytics.femaleCohorts,
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ],
      tooltip: {
        axisPointer: { type: 'shadow' },
        backgroundColor: 'rgba(20, 20, 25, 0.95)',
        borderColor: '#3f3f46',
        borderWidth: 1,
        formatter: (arg0_params: any) => {
          let param = Array.isArray(arg0_params) ? arg0_params[0] : arg0_params
          let idx = param.dataIndex
          let cohort = AGE_COHORTS[idx]
          let f = female_values[idx] || 0
          let m = Math.abs(male_values[idx] || 0)
          let ratio = f > 0 ? (m / f).toFixed(2) : 'N/A'

          return `
            <div style="font-family: sans-serif; font-size: 11px; line-height: 1.4;">
              <div style="font-weight: bold; border-bottom: 1px solid #3f3f46; padding-bottom: 3px; margin-bottom: 4px; color: #f4f4f5;">
                Cohort: ${cohort.label} <span style="font-weight: normal; color: #a1a1aa;">(${active_country_name || 'Global'})</span>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 14px; color: #60a5fa;">
                <span>Male:</span>
                <b>${Math.round(m).toLocaleString('de-DE')}k (${formatLegendValue(m * 1000)})</b>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 14px; color: #f472b6;">
                <span>Female:</span>
                <b>${Math.round(f).toLocaleString('de-DE')}k (${formatLegendValue(f * 1000)})</b>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 14px; color: #e4e4e7; margin-top: 2px; border-top: 1px dashed #3f3f46; padding-top: 2px;">
                <span>Cohort Total:</span>
                <b>${Math.round(m + f).toLocaleString('de-DE')}k (${formatLegendValue((m + f) * 1000)})</b>
              </div>
              <div style="display: flex; justify-content: space-between; gap: 14px; color: #a1a1aa; margin-top: 2px;">
                <span>Sex Ratio (M/F):</span>
                <b>${ratio}</b>
              </div>
            </div>
          `
        },
        padding: [6, 10],
        textStyle: { color: '#ffffff', fontSize: 11 },
        trigger: 'axis',
      },
      xAxis: [
        {
          axisLabel: {
            color: '#71717a',
            fontSize: is_narrow ? 8.5 : 9,
            formatter: (arg0_val: number) => {
              if (arg0_val === 0)
                return '0'
              return `${Math.round(arg0_val).toLocaleString('de-DE')}`
            },
          },
          axisLine: { lineStyle: { color: '#27272a' } },
          gridIndex: 0,
          inverse: true, //Male points to the left
          max: axis_limit,
          min: 0,
          name: 'Thousands',
          nameGap: 14,
          nameLocation: 'middle',
          nameTextStyle: { color: '#71717a', fontSize: is_narrow ? 8.5 : 9 },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
          splitNumber: is_narrow ? 3 : 4,
          type: 'value',
        },
        {
          axisLabel: {
            color: '#71717a',
            fontSize: is_narrow ? 8.5 : 9,
            formatter: (arg0_val: number) => {
              if (arg0_val === 0)
                return '0'
              return `${Math.round(arg0_val).toLocaleString('de-DE')}`
            },
          },
          axisLine: { lineStyle: { color: '#27272a' } },
          gridIndex: 1,
          max: axis_limit,
          min: 0,
          name: 'Thousands',
          nameGap: 14,
          nameLocation: 'middle',
          nameTextStyle: { color: '#71717a', fontSize: is_narrow ? 8.5 : 9 },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
          splitNumber: is_narrow ? 3 : 4,
          type: 'value',
        },
      ],
      yAxis: [
        {
          axisLabel: { show: false },
          axisLine: { lineStyle: { color: '#3f3f46' } },
          axisTick: { show: false },
          data: y_labels,
          gridIndex: 0,
          position: 'right',
          type: 'category',
        },
        {
          axisLabel: {
            align: 'center',
            color: '#e4e4e7',
            fontFamily: 'sans-serif',
            fontSize: is_narrow ? 9 : 9.5,
            formatter: (arg0_val: string, arg1_idx: number) => {
              let cohort = AGE_COHORTS[arg1_idx]
              return cohort ? (cohort.compactLabel || cohort.label) : arg0_val
            },
            margin: label_margin,
          },
          axisLine: { lineStyle: { color: '#3f3f46' } },
          axisTick: { show: false },
          data: y_labels,
          gridIndex: 1,
          position: 'left',
          type: 'category',
        },
      ],
    }
  }, [
    active_country_name,
    active_variable_selectors.gender,
    container_width,
    effective_countries.length,
    female_values,
    is_narrow,
    male_values,
    t,
  ])

  //Return statement
  return (
    <div ref={container_ref} className="h-full w-full flex flex-col min-h-0 select-none">
      {/* Header bar with demographic summary metrics */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between px-2 pt-1 pb-1 border-b border-border/40 text-[11px] bg-muted/20 gap-x-2 gap-y-1">
        <div className="flex items-center gap-2 truncate min-w-0">
          <span className="font-bold text-foreground flex items-center gap-1 shrink-0">
            <Icon name="people" className="text-primary text-xs" />
            <span className="truncate">{format(t.analytics.pyramidTitle, active_country_name || t.analytics.global)}</span>
          </span>
          <span className="text-muted-foreground font-mono shrink-0">
            ({current_year < 0 ? `${Math.abs(current_year)}BC` : `${current_year}AD`})
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-[10px] font-mono text-muted-foreground shrink-0 flex-wrap">
          <span>
            {t.analytics.totalLabel} <b className="text-foreground">{formatLegendValue((total_male + total_female)*1000)}</b>
          </span>
          <span>
            {t.analytics.sexRatio} <b className="text-foreground">{sex_ratio.toFixed(2)}</b> M/F
          </span>
          <span title={t.analytics.oldAgeDependencyTooltip}>
            {t.analytics.oldAgeDependencyRatio} <b className="text-foreground">{old_age_dependency_ratio.toFixed(1)}%</b>
          </span>
        </div>
      </div>

      {/* Secondary Controls Bar */}
      <div className="flex items-center justify-between px-2 py-1 bg-muted/35 border-b border-border/40 text-[10px] font-mono shrink-0">
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
              title="Showing instantaneous synthetic demographic proxy. Uncheck 'Use Placeholder' to compute from authentic rasters."
            >
              {t.analytics.syntheticProxy}
            </span>
          ) : (
            <span className="px-1.5 py-0.2 text-[9px] font-semibold bg-primary/20 text-primary border border-primary/30 rounded">
              {t.analytics.exact}
            </span>
          )}
        </div>
      </div>

      {/* Country Selector Switcher Bar when countries are selected */}
      {effective_countries.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1 bg-muted/40 border-b border-border/40 overflow-x-auto select-none shrink-0 scrollbar-thin">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mr-1 shrink-0">
            {t.analytics.viewPyramid}
          </span>
          <button
            type="button"
            onClick={() => set_active_country_name(null)}
            className={`px-2 py-0.5 text-[11px] rounded-none cursor-pointer transition-colors shrink-0 ${!active_country_name
              ? 'bg-primary text-primary-foreground font-bold shadow-sm'
              : 'bg-background/60 text-muted-foreground hover:text-foreground border border-border/40'
              }`}
          >
            {t.analytics.global}
          </button>
          {effective_countries.map((arg0_c) => {
            let name = getFeatureEntityName(arg0_c)
            let is_active = active_country_name === name
            return (
              <button
                key={name}
                type="button"
                onClick={() => set_active_country_name(name)}
                className={`px-2 py-0.5 text-[11px] rounded-none cursor-pointer transition-colors truncate max-w-[140px] flex items-center gap-1 shrink-0 ${is_active
                  ? 'bg-primary text-primary-foreground font-bold shadow-sm'
                  : 'bg-background/60 text-muted-foreground hover:text-foreground border border-border/40'
                  }`}
                title={format(t.analytics.pyramidTitle, name)}
              >
                <Icon name="flag" className="text-[10px]" />
                <span className="truncate">{name}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Chart Canvas */}
      <div className="flex-1 min-h-0 relative">
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
                  Refining Calculations: {refining_pct}% (~{refining_time_remaining.toFixed(1)}s)
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

export default PopulationPyramidChart
