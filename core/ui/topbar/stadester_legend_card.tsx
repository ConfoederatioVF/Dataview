import React, { useEffect, useRef, useState } from 'react'
import { ColorPalette, StadesterConfig } from '@framework/geopng/types.ts'
import { getPaletteCssGradient } from '@framework/geopng/palettes.ts'
import { RAINBOW_GROWTH_GRADIENT, resolveRegionChipColours } from '@framework/stadester/stadester_colours.ts'
import { resolveDefaultStadesterDataset, resolveStadesterVersionLabel } from '@framework/stadester/stadester_versions.ts'
import { STADESTER_CONFIG } from '@common'
import { Icon } from '@ui/components/icon'
import { useLocalisation } from '@localisation'

export interface StadesterLegendCardProps {
  config: StadesterConfig
  hoveredCity?: any | null
  isMobile?: boolean
  settlementCount?: number
  width?: number | string
}

/**
 * Information card displayed beneath the main colourbar whenever Stadestér Historical Settlements is toggled on.
 * Informs the user of what metric is displaying, active colour scheme, gradient scale stops, and visibility state.
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
  let colour_mode = config.colorMode || 'growth'
  let dataset_id = resolveDefaultStadesterDataset(STADESTER_CONFIG?.stadester, config.dataset)
  let dataset_version: string
  let format: ReturnType<typeof useLocalisation>['format']
  let gradient_style: string
  let growth_palette = config.growthPalette || 'Rainbow'
  let indicator_pct: number | null = null
  let is_halo = config.halo !== false && !config.filled
  let [is_minimised, set_is_minimised] = useState<boolean>(() => is_mobile)
  let localisation: ReturnType<typeof useLocalisation>
  let metric_title: string
  let population_palette = config.populationPalette || 'Plasma'
  let prev_is_mobile_ref = useRef(is_mobile)
  let region_chips: Array<{ colour: string; key: string; name: string }>
  let region_palette = config.regionPalette || 'Default'
  let t: ReturnType<typeof useLocalisation>['t']

  //Function body
  localisation = useLocalisation()
  dataset_version = resolveStadesterVersionLabel(dataset_id, STADESTER_CONFIG?.stadester?.versions, localisation.locale)
  format = localisation.format
  region_chips = resolveRegionChipColours(region_palette)
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
    gradient_style = (growth_palette === 'Rainbow')
      ? RAINBOW_GROWTH_GRADIENT
      : getPaletteCssGradient(growth_palette as ColorPalette)
  } else if (colour_mode === 'population') {
    metric_title = t.mapPanels.stadesterLegend.metricPopulation
    gradient_style = getPaletteCssGradient(population_palette as ColorPalette)
  } else {
    metric_title = t.mapPanels.stadesterLegend.metricRegion
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
              {format(t.mapPanels.stadesterLegend.settlementsCount, settlement_count.toLocaleString('de-DE'))}
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
          <div className="flex items-center justify-between gap-2 mb-2 text-[11px]">
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              <span className="text-muted-foreground">{t.mapPanels.stadesterLegend.displaying}</span>
              <span className="text-[10px] text-white/90 font-mono">
                {is_halo ? t.mapPanels.stadesterLegend.outline : t.mapPanels.stadesterLegend.fill} &bull; {config.showLabels ? t.mapPanels.stadesterLegend.labelsActive : t.mapPanels.stadesterLegend.noLabels}
              </span>
            </div>
            <span className="font-semibold text-white truncate text-right">{metric_title}</span>
          </div>

          {/* Colour Scheme Information & Gradient Bar */}
          <div className="space-y-1">
            {colour_mode === 'region' || colour_mode === 'continent' ? (
              <div className="flex flex-wrap gap-1 pt-0.5">
                {region_chips.map((chip) => {
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
        </>
      )}
    </div>
  )
})

export default StadesterLegendCard
