import React, { useEffect, useRef, useState } from 'react'
import { StadesterConfig } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { useLocalisation } from '@localisation'

export interface StadesterLegendCardProps {
  config: StadesterConfig
  hoveredCity?: any | null
  isMobile?: boolean
  settlementCount?: number
  width?: number | string
}

let REGION_CHIPS = [
  { name: 'Sub-Saharan Africa', colour: '#f97316' },
  { name: 'Maghreb & Egypt', colour: '#eab308' },
  { name: 'Middle East', colour: '#d97706' },
  { name: 'Central Asia', colour: '#a855f7' },
  { name: 'Indian Subcontinent', colour: '#ec4899' },
  { name: 'East Asia', colour: '#ef4444' },
  { name: 'Southeast Asia', colour: '#8b5cf6' },
  { name: 'Europe', colour: '#6366f1' },
  { name: 'E. Europe & Russia', colour: '#3b82f6' },
  { name: 'N. America', colour: '#0ea5e9' },
  { name: 'Latin America', colour: '#10b981' },
  { name: 'Oceania', colour: '#14b8a6' },
]

/**
 * Information card displayed beneath the main colourbar whenever Stadestér Historical Settlements is toggled on.
 * Informs the user of what metric is displaying, active colour scheme, gradient scale stops, and bubble sizing parameters.
 * Supports minimising via a chevron button, and defaults to minimised on mobile devices.
 *
 * @param {StadesterLegendCardProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let StadesterLegendCard: React.FC<StadesterLegendCardProps> = React.memo(function (arg0_props) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as StadesterLegendCardProps)
  let config = props.config
  let hovered_city = props.hoveredCity
  let is_mobile = (props.isMobile !== undefined)
    ? props.isMobile
    : (typeof window !== 'undefined' ? window.innerWidth < 768 : false)
  let settlement_count = props.settlementCount
  let width = props.width ?? 336

  //Declare local instance variables
  let bubble_size = (config.bubbleSize !== undefined) ? config.bubbleSize : 1
  let colour_mode = config.colorMode || 'growth'
  let dataset_version = (config.dataset === 'stadester_1.0') ? 'Stadestér 1.0' : 'Stadestér 1.1'
  let format: ReturnType<typeof useLocalisation>['format']
  let gradient_style: string
  let growth_palette = config.growthPalette || 'Rainbow'
  let indicator_pct: number | null = null
  let is_halo = config.halo !== false && !config.filled
  let [is_minimised, set_is_minimised] = useState<boolean>(() => is_mobile)
  let localisation: ReturnType<typeof useLocalisation>
  let metric_subtitle: string
  let metric_title: string
  let palette_label: string
  let prev_is_mobile_ref = useRef(is_mobile)
  let t: ReturnType<typeof useLocalisation>['t']

  //Function body
  localisation = useLocalisation()
  format = localisation.format
  t = localisation.t

  useEffect(() => {
    if (prev_is_mobile_ref.current !== is_mobile) {
      prev_is_mobile_ref.current = is_mobile
      if (is_mobile)
        set_is_minimised(true)
    }
  }, [is_mobile])

  if (colour_mode === 'growth') {
    metric_title = t.mapPanels.stadesterLegend.metricGrowth
    metric_subtitle = t.mapPanels.stadesterLegend.annualCompoundGrowth
    palette_label = `${growth_palette} (Heat / Cool Spectrum)`
    gradient_style = 'linear-gradient(to right, rgb(93, 96, 226), rgb(72, 156, 240), rgb(69, 207, 119), rgb(198, 219, 85), rgb(253, 224, 71), rgb(251, 146, 60), rgb(239, 68, 68), rgb(232, 121, 249))'
  } else if (colour_mode === 'population') {
    metric_title = t.mapPanels.stadesterLegend.metricPopulation
    metric_subtitle = t.mapPanels.stadesterLegend.urbanPopulationTotals
    palette_label = t.mapPanels.stadesterLegend.logarithmicScale
    gradient_style = 'linear-gradient(to right, rgb(13, 8, 135), rgb(80, 18, 170), rgb(140, 41, 129), rgb(200, 72, 73), rgb(245, 125, 21), rgb(240, 249, 33))'
  } else {
    metric_title = t.mapPanels.stadesterLegend.metricRegion
    metric_subtitle = t.mapPanels.stadesterLegend.regionalDistribution
    palette_label = t.mapPanels.stadesterLegend.regionalCategoricalPalette
    gradient_style = ''
  }

  if (hovered_city && !is_minimised) {
    let g = (hovered_city.growthRate !== undefined)
      ? hovered_city.growthRate
      : (hovered_city.growth_rate !== undefined)
        ? hovered_city.growth_rate
        : (typeof hovered_city.growth === 'number')
          ? hovered_city.growth
          : undefined

    if (colour_mode === 'growth' && g !== undefined) {
      indicator_pct = Math.max(0, Math.min(100, ((g - (-0.05)) / (0.08 - (-0.05))) * 100))
    } else if (colour_mode === 'population' && hovered_city.population !== undefined) {
      let p = Math.max(5000, hovered_city.population)
      indicator_pct = Math.max(0, Math.min(100, ((Math.log10(p) - Math.log10(5000)) / (Math.log10(10000000) - Math.log10(5000))) * 100))
    }
  }

  //Return statement
  return (
    <div
      id="dataview-stadester-legend-card"
      style={{ width: (typeof width === 'number') ? `${width}px` : width }}
      className={`relative rounded-none border border-border bg-card/95 backdrop-blur-md px-[var(--padding)] ${is_minimised ? 'py-1.5' : 'pt-[var(--padding)] pb-2.5'} shadow-lg text-[var(--body-font-size)] text-card-foreground select-none font-sans`}
    >
      {/* Header: Title, Dataset Tag, Rendered Count, and Chevron Toggle */}
      <div
        className={`flex items-center justify-between gap-2 ${is_minimised ? 'cursor-pointer' : 'pb-1.5 mb-1.5 border-b border-border/50'}`}
        onClick={is_minimised ? () => set_is_minimised(false) : undefined}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon name="location_city" className="text-primary text-xs shrink-0" />
          <span className="font-bold text-white text-xs truncate">{t.mapPanels.stadesterLegend.settlements}</span>
          <span className="text-[10px] px-1 py-0.2 bg-muted text-muted-foreground border border-border shrink-0 font-mono">
            {dataset_version}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {settlement_count !== undefined && (
            <span className="text-white text-[11px] font-mono shrink-0">
              {format(t.mapPanels.stadesterLegend.citiesCount, settlement_count.toLocaleString('de-DE'))}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              set_is_minimised(!is_minimised)
            }}
            className="flex items-center justify-center p-0.5 text-muted-foreground hover:text-white hover:bg-white/10 rounded-none transition-colors cursor-pointer"
            title={is_minimised ? t.mapPanels.stadesterLegend.expandLegend : t.mapPanels.stadesterLegend.collapseLegend}
            aria-expanded={!is_minimised}
            aria-label={is_minimised ? t.mapPanels.stadesterLegend.expandLegend : t.mapPanels.stadesterLegend.collapseLegend}
          >
            <Icon name={is_minimised ? 'expand_more' : 'expand_less'} className="text-base leading-none" />
          </button>
        </div>
      </div>

      {!is_minimised && (
        <>
          {/* Metric Display Information */}
          <div className="flex flex-col gap-0.5 mb-2">
            <div className="flex items-center justify-between gap-1 text-[11px]">
              <span className="text-muted-foreground">{t.mapPanels.stadesterLegend.displaying}</span>
              <span className="font-semibold text-white truncate text-right">{metric_title}</span>
            </div>
            <p className="text-[10px] text-muted-foreground/80 font-light leading-tight">
              {metric_subtitle}
            </p>
          </div>

          {/* Colour Scheme Information & Gradient Bar */}
          <div className="space-y-1 mb-2">
            {colour_mode === 'region' || colour_mode === 'continent' ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {REGION_CHIPS.map((chip) => {
                  let is_active = Boolean(
                    hovered_city?.region && (
                      chip.name.toLowerCase().includes(hovered_city.region.toLowerCase()) ||
                      hovered_city.region.toLowerCase().includes(chip.name.toLowerCase().split(' ')[0])
                    )
                  )
                  return (
                    <span
                      key={chip.name}
                      className={`flex items-center gap-1 text-[9px] px-1 py-0.5 border transition-all ${is_active
                        ? 'bg-white/20 border-white font-bold text-white shadow-xs scale-105'
                        : 'bg-background border-border text-white'
                        }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-none shrink-0" style={{ backgroundColor: chip.colour }} />
                      {chip.name}
                    </span>
                  )
                })}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="relative">
                  <div
                    className="h-3 w-full border border-border/80 shadow-inner"
                    style={{ background: gradient_style }}
                  />
                  {indicator_pct !== null && (
                    <div
                      className="absolute top-[-4px] bottom-[-4px] pointer-events-none transition-all duration-75 ease-out z-20 flex flex-col items-center justify-between"
                      style={{ left: `${indicator_pct}%` }}
                    >
                      <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-t-[6px] border-t-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
                      <div className="w-[2.5px] flex-1 bg-white rounded-none shadow-[0_0_6px_rgba(0,0,0,0.9)] border border-black/30" />
                      <div className="w-0 h-0 border-l-[4.5px] border-l-transparent border-r-[4.5px] border-r-transparent border-b-[6px] border-b-white drop-shadow-[0_-1px_2px_rgba(0,0,0,0.9)]" />
                    </div>
                  )}
                </div>
                {colour_mode === 'growth' ? (
                  <div className="flex justify-between items-center text-[9px] text-muted-foreground font-mono">
                    <span>&le; -5%/yr ({t.mapPanels.stadesterLegend.loss})</span>
                    <span className="text-white font-bold">0%/yr ({t.mapPanels.stadesterLegend.stable})</span>
                    <span>&ge; +8%/yr ({t.mapPanels.stadesterLegend.surge})</span>
                  </div>
                ) : (
                  <div className="flex justify-between items-center text-[9px] text-muted-foreground font-mono">
                    <span>5.000 ({t.mapPanels.stadesterLegend.small})</span>
                    <span className="text-white font-bold">500.000</span>
                    <span>10.000.000+ ({t.mapPanels.stadesterLegend.megacity})</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bubble Geometry & Collision Status Footer */}
          <div className="pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground font-mono">
            <span>{format(t.mapPanels.stadesterLegend.radiusPropPop, bubble_size.toFixed(2))}</span>
            <span className="text-white">
              {is_halo ? t.mapPanels.stadesterLegend.outline : t.mapPanels.stadesterLegend.fill} &bull; {config.showLabels ? t.mapPanels.stadesterLegend.labelsActive : t.mapPanels.stadesterLegend.noLabels}
            </span>
          </div>
        </>
      )}
    </div>
  )
})

export default StadesterLegendCard
