import React, { useMemo, useState, useRef, useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { DecodedRaster, ScaleType } from '@framework/geopng/types.ts'
import { useLocalisation } from '@localisation'

export interface HistogramChartProps {
  raster: DecodedRaster | null
  scaleType: ScaleType
  logSigma: number
  minOverride?: number
  maxOverride?: number
  countryStats?: {
    name: string
    histogram: { bins: number[]; counts: number[]; min: number; max: number }
    quantiles: Record<number, number>
  } | null
}

/**
 * HistogramChart renders an ECharts-based frequency distribution histogram.
 *
 * @param {HistogramChartProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let HistogramChart: React.FC<HistogramChartProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    countryStats: country_stats,
    logSigma: _log_sigma,
    maxOverride: max_override,
    minOverride: min_override,
    raster,
    scaleType: scale_type,
  } = props

  //Declare local instance variables
  let container_ref = useRef<HTMLDivElement>(null)
  let echart_ref = useRef<any>(null)
  let format: ReturnType<typeof useLocalisation>['format']
  let localisation: ReturnType<typeof useLocalisation>
  let option: any
  let scale_mode: 'log' | 'linear'
  let set_scale_mode: React.Dispatch<React.SetStateAction<'log' | 'linear'>>
  let set_steepness_input: React.Dispatch<React.SetStateAction<string>>
  let steepness: number
  let steepness_input: string
  let t: ReturnType<typeof useLocalisation>['t']

  //Function body
  localisation = useLocalisation()
  format = localisation.format
  t = localisation.t
  ;[scale_mode, set_scale_mode] = useState<'log' | 'linear'>('log')
  ;[steepness_input, set_steepness_input] = useState<string>('1.0')

  steepness = useMemo(() => {
    let val = parseFloat(steepness_input)
    return Number.isFinite(val) && val !== 0 ? val : 1.0
  }, [steepness_input])

  //Robust resize listener using ResizeObserver and animation frame dispatching
  useEffect(() => {
    let container = container_ref.current
    if (!container)
      return

    let trigger_resize = function () {
      if (echart_ref.current) {
        let instance = echart_ref.current.getEchartsInstance?.()
        if (instance)
          if (!instance.isDisposed?.())
            instance.resize()
      }
    }

    let observer = new ResizeObserver((arg0_entries) => {
      for (let i = 0; i < arg0_entries.length; i++) {
        let entry = arg0_entries[i]
        if (entry.contentRect.width > 0 && entry.contentRect.height > 0)
          requestAnimationFrame(trigger_resize)
      }
    })

    observer.observe(container)

    //Fire immediately and at staggered intervals to catch CSS transition settling
    trigger_resize()
    let t1 = setTimeout(trigger_resize, 60)
    let t2 = setTimeout(trigger_resize, 220)
    let t3 = setTimeout(trigger_resize, 350)

    window.addEventListener('resize', trigger_resize)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', trigger_resize)
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  option = useMemo(() => {
    let active_histogram = country_stats ? country_stats.histogram : raster?.histogram
    let active_quantiles = country_stats ? country_stats.quantiles : raster?.quantiles

    if (!active_histogram) {
      return {
        title: {
          left: 'center',
          text: 'No raster data available',
          textStyle: { color: '#71717a', fontSize: 12 },
          top: 'center',
        },
      }
    }

    let { bins, counts } = active_histogram
    let bin_labels: string[] = []
    for (let i = 0; i < counts.length; i++) {
      let mid = (bins[i] + bins[i + 1])/2
      bin_labels.push(mid.toFixed(2))
    }

    let find_closest_bin_index = function (arg0_val: number) {
      let closest_idx = 0
      let min_diff = Infinity
      let val = arg0_val
      for (let i = 0; i < counts.length; i++) {
        let diff = Math.abs((bins[i] + bins[i + 1])/2 - val)
        if (diff < min_diff) {
          min_diff = diff
          closest_idx = i
        }
      }
      return closest_idx
    }

    //Mark lines for percentiles (P25, P75), median (M), and average (A)
    let active_mean = country_stats ? (country_stats as any).mean : raster?.mean
    let mark_lines: any[] = []
    let raw_candidates: {
      abbr: string
      color: string
      key: string
      lineType: 'solid' | 'dashed' | 'dotted'
      lineWidth: number
      name: string
      val: number
    }[] = []

    if (active_quantiles) {
      if (active_quantiles[25] !== undefined) {
        raw_candidates.push({
          abbr: 'P25',
          color: '#a1a1aa',
          key: 'p25',
          lineType: 'dashed',
          lineWidth: 1,
          name: '25th Percentile',
          val: active_quantiles[25],
        })
      }
      if (active_quantiles[50] !== undefined) {
        raw_candidates.push({
          abbr: 'M',
          color: '#60a5fa',
          key: 'med',
          lineType: 'solid',
          lineWidth: 2,
          name: 'Median',
          val: active_quantiles[50],
        })
      }
      if (active_quantiles[75] !== undefined) {
        raw_candidates.push({
          abbr: 'P75',
          color: '#a1a1aa',
          key: 'p75',
          lineType: 'dashed',
          lineWidth: 1,
          name: '75th Percentile',
          val: active_quantiles[75],
        })
      }
    }

    if (active_mean !== undefined && Number.isFinite(active_mean)) {
      raw_candidates.push({
        abbr: 'A',
        color: '#34d399',
        key: 'avg',
        lineType: 'dashed',
        lineWidth: 1.5,
        name: 'Average',
        val: active_mean,
      })
    }

    //Map each candidate to closest bin index and sort by bin index
    let sorted_candidates = raw_candidates
      .map((arg0_c) => ({
        ...arg0_c,
        binIdx: find_closest_bin_index(arg0_c.val),
      }))
      .sort((arg0_a, arg0_b) => arg0_a.binIdx - arg0_b.binIdx || arg0_a.val - arg0_b.val)

    //Check for clustering
    let is_clustered_with_neighbor = sorted_candidates.map((arg0_c, arg0_i) => {
      let c = arg0_c
      let i = arg0_i
      let next = sorted_candidates[i + 1]
      let prev = sorted_candidates[i - 1]
      let close_next = next && Math.abs(c.binIdx - next.binIdx) <= 2
      let close_prev = prev && Math.abs(c.binIdx - prev.binIdx) <= 2
      return Boolean(close_prev || close_next)
    })

    sorted_candidates.forEach((arg0_c, arg0_i) => {
      let c = arg0_c
      let i = arg0_i
      let is_clustered = is_clustered_with_neighbor[i]
      let label_text = is_clustered ? `${i + 1}` : c.abbr
      let v_offset = (i%2)*12

      mark_lines.push({
        label: {
          backgroundColor: 'rgba(24, 24, 27, 0.95)',
          borderColor: c.color,
          borderRadius: 0,
          borderWidth: 1,
          color: c.color,
          distance: [0, -2 - v_offset],
          fontFamily: 'Karla, sans-serif',
          fontSize: 9,
          fontWeight: c.key === 'med' ? 'bold' : 'normal',
          formatter: label_text,
          padding: [2, 4],
          position: 'end',
          rotate: 0,
          show: true,
        },
        lineStyle: {
          color: c.color,
          type: c.lineType,
          width: c.lineWidth,
        },
        name: c.name,
        xAxis: bin_labels[c.binIdx],
      })
    })

    //Apply steepness scaling in log mode
    let effective_steepness = Number.isFinite(steepness) && steepness !== 0 ? steepness : 1.0
    let transformed_data =
      scale_mode === 'log'
        ? counts.map((arg0_c) => (arg0_c > 0 ? Math.pow(arg0_c, effective_steepness) : null))
        : counts

    return {
      backgroundColor: 'transparent',
      grid: {
        bottom: 25,
        left: 48,
        right: 20,
        top: 22,
      },
      series: [
        {
          barWidth: '95%',
          data: transformed_data,
          itemStyle: {
            borderRadius: 0,
            color: '#3b82f6',
          },
          markLine: {
            data: mark_lines,
            silent: true,
            symbol: 'none',
          },
          name: 'Cell Count',
          type: 'bar',
        },
      ],
      textStyle: {
        fontFamily: 'Karla, sans-serif',
      },
      tooltip: {
        appendToBody: true,
        axisPointer: { type: 'shadow' },
        backgroundColor: '#18181b',
        borderColor: '#27272a',
        borderRadius: 0,
        extraCssText: 'z-index: 99999999; pointer-events: none;',
        formatter: (arg0_params: any) => {
          let item = arg0_params[0]
          let idx = item.dataIndex
          let actual_count = counts[idx] ?? 0
          let b1 = bins[idx]?.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
          let b2 = bins[idx + 1]?.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
          let range = `[${b1} to ${b2}]`
          return `<strong>${t.analytics.valueRange}:</strong> ${range}<br/><strong>${t.analytics.totalCells}:</strong> ${actual_count.toLocaleString()}`
        },
        textStyle: { color: '#f4f4f5', fontFamily: 'Karla, sans-serif', fontSize: 12 },
        trigger: 'axis',
      },
      xAxis: {
        axisLabel: {
          color: '#a1a1aa',
          fontFamily: 'Karla, sans-serif',
          fontSize: 11,
          interval: Math.floor(bin_labels.length/6),
        },
        axisLine: { lineStyle: { color: '#3f3f46' } },
        data: bin_labels,
        splitLine: { show: false },
        type: 'category',
      },
      yAxis: {
        axisLabel: {
          color: '#a1a1aa',
          fontFamily: 'Karla, sans-serif',
          fontSize: 11,
          formatter: (arg0_v: number) => {
            let actual =
              scale_mode === 'log'
                ? effective_steepness !== 0
                  ? Math.pow(arg0_v, 1/effective_steepness)
                  : arg0_v
                : arg0_v
            let abs_actual = Math.abs(actual)
            if (abs_actual >= 1e12)
              return `${(actual/1e12).toFixed(1).replace(/\.0$/, '')}T`
            if (abs_actual >= 1e9)
              return `${(actual/1e9).toFixed(1).replace(/\.0$/, '')}B`
            if (abs_actual >= 1e6)
              return `${(actual/1e6).toFixed(1).replace(/\.0$/, '')}M`
            if (abs_actual >= 1e3)
              return `${(actual/1e3).toFixed(1).replace(/\.0$/, '')}k`
            return Math.round(actual).toLocaleString()
          },
        },
        axisLine: { lineStyle: { color: '#3f3f46' } },
        logBase: 10,
        min: scale_mode === 'log' ? 1 : 0,
        name: scale_mode === 'log' ? `${t.analytics.frequencyCells} (log)` : t.analytics.frequencyCells,
        nameTextStyle: { color: '#71717a', fontFamily: 'Karla, sans-serif', fontSize: 11 },
        splitLine: { lineStyle: { color: '#27272a', type: 'dashed' } },
        type: scale_mode === 'log' ? 'log' : 'value',
      },
    }
  }, [raster, country_stats, scale_type, min_override, max_override, scale_mode, steepness, t])

  //Return statement
  return (
    <div className="relative w-full h-full flex flex-col justify-between font-sans">
      {/* Top Controls: Scope Title, Log Steepness Adjuster & Scale Mode Switch */}
      <div className="flex items-center justify-between px-[var(--cell-padding)] pt-0.5 pb-[var(--cell-padding)] select-none gap-[var(--padding)]">
        <span className="text-[var(--body-font-size)] font-light text-muted-foreground truncate">
          {country_stats ? format(t.analytics.distributionCountry, country_stats.name) : t.analytics.globalDistribution}
        </span>

        <div className="flex items-center gap-[var(--cell-padding)] shrink-0">
          {/* Steepness Option for Logarithmic Scale with Custom Textbox */}
          {scale_mode === 'log' && (
            <div className="flex items-center gap-1.5 bg-muted px-[var(--padding)] py-0.5 rounded-none text-[var(--body-font-size)] border border-border">
              <span className="text-muted-foreground font-normal">{t.analytics.steepnessLabel}</span>
              <button
                type="button"
                onClick={() => {
                  let curr = parseFloat(steepness_input)
                  let base = Number.isFinite(curr) ? curr : 1.0
                  let next = Math.round((base - 0.1)*100)/100
                  set_steepness_input(next.toString())
                }}
                className="w-5 h-5 rounded-none bg-background hover:bg-muted text-foreground flex items-center justify-center font-bold cursor-pointer border border-border/60"
                title={t.analytics.decreaseSteepness}
              >
                −
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={steepness_input}
                onChange={(arg0_e) => set_steepness_input(arg0_e.target.value)}
                className="w-14 h-5 px-1 font-bold text-center bg-background border border-border rounded-none text-foreground focus:outline-none focus:border-primary text-[var(--body-font-size)]"
                placeholder="1.0"
                title={t.analytics.customSteepnessTooltip}
              />
              <button
                type="button"
                onClick={() => {
                  let curr = parseFloat(steepness_input)
                  let base = Number.isFinite(curr) ? curr : 1.0
                  let next = Math.round((base + 0.1)*100)/100
                  set_steepness_input(next.toString())
                }}
                className="w-5 h-5 rounded-none bg-background hover:bg-muted text-foreground flex items-center justify-center font-bold cursor-pointer border border-border/60"
                title={t.analytics.increaseSteepness}
              >
                +
              </button>

              <div className="flex items-center gap-1 ml-1 border-l border-border pl-1.5">
                {[0.2, 0.5, 1.0, 2.0].map((arg0_preset) => (
                  <button
                    key={arg0_preset}
                    type="button"
                    onClick={() => set_steepness_input(arg0_preset.toString())}
                    className={`px-1.5 py-0.5 rounded-none text-[var(--body-font-size)] cursor-pointer transition-colors ${
                      Math.abs(steepness - arg0_preset) < 0.01
                        ? 'bg-primary text-primary-foreground font-bold'
                        : 'text-muted-foreground hover:text-foreground font-light'
                    }`}
                  >
                    {arg0_preset}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Logarithmic vs Linear Switch */}
          <div className="flex items-center gap-1 bg-muted p-[var(--cell-padding)] rounded-none text-[var(--body-font-size)] border border-border">
            <button
              type="button"
              onClick={() => set_scale_mode('log')}
              className={`px-2 py-0.5 rounded-none transition-colors cursor-pointer ${
                scale_mode === 'log'
                  ? 'bg-background text-foreground shadow-sm font-bold'
                  : 'text-muted-foreground hover:text-foreground font-light'
              }`}
            >
              {t.analytics.logarithmic}
            </button>
            <button
              type="button"
              onClick={() => set_scale_mode('linear')}
              className={`px-2 py-0.5 rounded-none transition-colors cursor-pointer ${
                scale_mode === 'linear'
                  ? 'bg-background text-foreground shadow-sm font-bold'
                  : 'text-muted-foreground hover:text-foreground font-light'
              }`}
            >
              {t.analytics.linear}
            </button>
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div ref={container_ref} className="flex-1 w-full min-h-0 relative">
        <ReactECharts
          ref={echart_ref}
          option={option}
          notMerge={true}
          lazyUpdate={false}
          style={{ bottom: 0, height: '100%', left: 0, position: 'absolute', right: 0, top: 0, width: '100%' }}
          opts={{ renderer: 'canvas' }}
        />
      </div>
    </div>
  )
}

export default HistogramChart
