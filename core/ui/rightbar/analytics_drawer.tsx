import React, { useState, useEffect, useRef } from 'react'
import { DecodedRaster, ScaleType } from '@framework/geopng/types.ts'
import { CountryFeature, CountryStats } from '@framework/geopng/polygon_binning.ts'
import { getAnalyticsPanelRightOffset, UI_LAYOUT } from '@framework/utils/ui_layout'
import { HistogramChart } from './histogram_chart'
import { StatsSummary } from './stats_summary'
import { PopulationPyramidChart } from './population_pyramid_chart'
import { CategoryBreakdownChart } from './category_breakdown_chart'
import { LargestCitiesChart } from './largest_cities_chart'
import { ParsedDataLayer } from '@server/layer_parser'
import { Button } from '@ui/components/button'
import { Icon } from '@ui/components/icon'
import { useLocalisation } from '@localisation'
import { UserRole, isPublicBuild } from '@common'

export interface AnalyticsDrawerProps {
  activeLayer?: ParsedDataLayer | null
  activeVariableSelectors?: Record<string, string | string[]>
  citiesMode?: boolean
  countryStats?: CountryStats | null
  currentYear?: number
  inspectData?: {
    countryName?: string
    lat: number
    lng: number
    pixelX: number
    pixelY: number
    value: number | null
  } | null
  isCalculatingStats?: boolean
  isMobile?: boolean
  isOpen: boolean
  isSettingsDrawerOpen?: boolean
  logSigma: number
  maxOverride?: number
  minOverride?: number
  onClearCountries?: () => void
  onForceRefresh?: () => void
  onChangeYear?: (arg0_year: number) => void
  onSelectCity?: (arg0_key: string) => void
  onSelectCountry?: (country: CountryFeature | null) => void
  onToggleOpen: () => void
  raster: DecodedRaster | null
  rasterKey?: string | number
  scaleType: ScaleType
  selectedCountries?: CountryFeature[]
  selectedCountry?: CountryFeature | null
  stadesterDataset?: 'stadester_1.1' | 'stadester_1.0'
  userRole?: UserRole
}

/**
 * AnalyticsDrawer slide-in container providing raster metrics, distribution histograms, and summary statistics.
 *
 * @param {AnalyticsDrawerProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let AnalyticsDrawer: React.FC<AnalyticsDrawerProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    activeLayer: active_layer = null,
    activeVariableSelectors: active_variable_selectors = {},
    citiesMode: cities_mode = false,
    countryStats: country_stats,
    currentYear: current_year = 1950,
    inspectData: inspect_data = null,
    isCalculatingStats: is_calculating_stats = false,
    isMobile: is_mobile = false,
    isOpen: is_open,
    isSettingsDrawerOpen: is_settings_drawer_open = false,
    logSigma: log_sigma,
    maxOverride: max_override,
    minOverride: min_override,
    onClearCountries: on_clear_countries,
    onForceRefresh: on_force_refresh,
    onChangeYear: on_change_year,
    onSelectCity: on_select_city,
    onSelectCountry: on_select_country,
    onToggleOpen: on_toggle_open,
    raster,
    rasterKey: raster_key,
    scaleType: scale_type,
    selectedCountries: selected_countries,
    selectedCountry: selected_country,
    stadesterDataset: stadester_dataset = 'stadester_1.1',
    userRole: user_role = 'default',
  } = props

  //Declare local instance variables
  let active_tab: 'cities' | 'pyramid' | 'breakdown' | 'histogram' | 'stats'
  let effective_countries: CountryFeature[]
  let format_string: (template: string, ...args: any[]) => string
  let handle_clear: () => void
  let has_category_breakdown = Boolean(
    active_layer?.type === 'raster.category_profession' ||
    active_layer?.id?.includes('profession')
  )
  let has_cities_chart = Boolean(
    cities_mode ||
    active_layer?.id?.includes('stadester') ||
    active_layer?.type === 'vector.points'
  )
  let has_population_pyramid = Boolean(
    active_layer?.type === 'raster.age_sex' ||
    active_layer?.id === 'age_sex'
  )
  let is_dev = user_role === 'developer' && !isPublicBuild()
  let localisation: ReturnType<typeof useLocalisation>
  let right_offset = getAnalyticsPanelRightOffset(is_settings_drawer_open)
  let set_active_tab: React.Dispatch<React.SetStateAction<'cities' | 'pyramid' | 'breakdown' | 'histogram' | 'stats'>>
  let set_stats_progress_pct: React.Dispatch<React.SetStateAction<number>>
  let set_stats_time_remaining: React.Dispatch<React.SetStateAction<number>>
  let set_use_placeholder_breakdown: React.Dispatch<React.SetStateAction<boolean>>
  let set_use_placeholder_pyramid: React.Dispatch<React.SetStateAction<boolean>>
  let stats_duration_estimate_ref = useRef<number>(1.5)
  let stats_progress_pct: number
  let stats_start_time_ref = useRef<number>(0)
  let stats_time_remaining: number
  let t: ReturnType<typeof useLocalisation>['t']
  let use_placeholder_breakdown: boolean
  let use_placeholder_pyramid: boolean

  //Function body
  localisation = useLocalisation()
  format_string = localisation.formatString
  t = localisation.t
  let initial_tab: 'cities' | 'pyramid' | 'breakdown' | 'histogram' | 'stats' = has_cities_chart
    ? 'cities'
    : has_population_pyramid
      ? 'pyramid'
      : has_category_breakdown
        ? 'breakdown'
        : 'histogram'

    ;[active_tab, set_active_tab] = useState<'cities' | 'pyramid' | 'breakdown' | 'histogram' | 'stats'>(initial_tab)
    ;[use_placeholder_pyramid, set_use_placeholder_pyramid] = useState<boolean>(
      is_dev ? false : (active_layer?.synthetic_by_default !== false)
    )
    ;[use_placeholder_breakdown, set_use_placeholder_breakdown] = useState<boolean>(
      is_dev ? false : (active_layer?.synthetic_by_default !== false)
    )
    ;[stats_progress_pct, set_stats_progress_pct] = useState<number>(0)
    ;[stats_time_remaining, set_stats_time_remaining] = useState<number>(1.5)

  //Synchronise placeholder defaults when user role changes
  useEffect(() => {
    if (user_role === 'developer') {
      set_use_placeholder_pyramid(false)
      set_use_placeholder_breakdown(false)
    }
  }, [user_role])

  //Track stats calculation progress and time remaining
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null

    if (is_calculating_stats) {
      stats_start_time_ref.current = performance.now()
      set_stats_progress_pct(15)
      set_stats_time_remaining(Math.max(0.2, Math.round(stats_duration_estimate_ref.current * 10) / 10))

      interval = setInterval(() => {
        let elapsed_sec = (performance.now() - stats_start_time_ref.current) / 1000
        let est = Math.max(0.6, stats_duration_estimate_ref.current)
        let pct = Math.min(96, Math.round((1 - Math.exp(-elapsed_sec / (est * 0.6))) * 100))
        let rem = Math.max(0.1, Math.round((est - elapsed_sec) * 10) / 10)

        set_stats_progress_pct(Math.max(15, pct))
        set_stats_time_remaining(rem)
      }, 80)
    } else if (stats_start_time_ref.current > 0) {
      let actual_sec = (performance.now() - stats_start_time_ref.current) / 1000
      if (actual_sec > 0.2)
        stats_duration_estimate_ref.current = Math.min(5.0, Math.max(0.5, stats_duration_estimate_ref.current * 0.7 + actual_sec * 0.3))

      set_stats_progress_pct(100)
      set_stats_time_remaining(0)
      stats_start_time_ref.current = 0
    }

    return () => {
      if (interval)
        clearInterval(interval)
    }
  }, [is_calculating_stats])

  //Update active tab automatically when layer type transitions
  useEffect(() => {
    if (cities_mode || active_layer?.id?.includes('stadester')) {
      set_active_tab('cities')
    } else if (has_population_pyramid) {
      set_active_tab('pyramid')
    } else if (has_category_breakdown) {
      set_active_tab('breakdown')
    } else if (active_tab === 'pyramid' || active_tab === 'breakdown' || active_tab === 'cities') {
      set_active_tab('histogram')
    }
  }, [active_layer?.id, active_layer?.type, cities_mode, has_cities_chart, has_population_pyramid, has_category_breakdown])

  //Staggered resize events when opening panel or when raster changes to notify ECharts
  useEffect(() => {
    if (is_open) {
      let t1 = setTimeout(() => window.dispatchEvent(new Event('resize')), 50)
      let t2 = setTimeout(() => window.dispatchEvent(new Event('resize')), 200)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [is_open, right_offset, raster, raster_key, active_tab])

  //Guard clauses
  if (!is_open)
    return null

  effective_countries =
    selected_countries && selected_countries.length > 0
      ? selected_countries
      : selected_country
        ? [selected_country]
        : []

  handle_clear = function () {
    if (on_clear_countries) {
      on_clear_countries()
    } else if (on_select_country) {
      on_select_country(null)
    }
  }

  //Return statement
  return (
    <>
      <div
        id="dataview-analytics-drawer"
        onTransitionEnd={() => {
          window.dispatchEvent(new Event('resize'))
        }}
        style={is_mobile ? {
          bottom: '0px',
          left: '0px',
          right: '0px',
        } : {
          right: `${right_offset}px`,
          top: `${UI_LAYOUT.margin}px`,
        }}
        className={is_mobile
          ? 'fixed z-50 w-full max-w-none h-[380px] max-h-[calc(var(--app-height,100dvh)-54px)] pb-3 bg-card/95 backdrop-blur-md border-t border-border rounded-t-lg text-card-foreground shadow-2xl flex flex-col font-sans transition-transform duration-200 ease-out'
          : 'absolute z-40 w-[640px] max-w-[min(640px,calc(100vw-420px))] h-[340px] max-h-[calc(100dvh-40px)] bg-card/95 backdrop-blur-md border border-border rounded-none text-card-foreground shadow-2xl flex flex-col font-sans transition-all duration-200 ease-out animate-in fade-in-0 zoom-in-95 duration-150'
        }
      >
        {/* Panel Header */}
        <div className="px-[var(--padding)] py-1.5 flex flex-col border-b border-border select-none gap-1.5 bg-card/90">
          <div className="flex items-center justify-between w-full gap-2">
            <span className="text-[var(--header-font-size)] font-bold text-foreground flex items-center gap-1.5 shrink-0">
              <Icon name="bar_chart" />
              <span>{t.analytics.title}</span>
            </span>

            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-none text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => {
                  if (on_force_refresh)
                    on_force_refresh()
                  window.dispatchEvent(new Event('resize'))
                }}
                title={t.analytics.refresh}
                aria-label={t.analytics.refresh}
              >
                <Icon name="refresh" className="text-white text-xs" />
              </Button>

              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 rounded-none text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={on_toggle_open}
                title={t.analytics.summary}
              >
                <Icon name="close" className="text-white" />
              </Button>
            </div>
          </div>

          {/* Tab Navigation Row: Wraps into multiple rows when needed */}
          <div className="flex flex-wrap items-center gap-1 bg-muted p-[var(--cell-padding)] rounded-none w-full">
            {/* Largest Cities Tab for Stadestér */}
            {has_cities_chart && (
              <button
                type="button"
                onClick={() => set_active_tab('cities')}
                className={`px-2 py-0.5 text-[var(--body-font-size)] rounded-none transition-colors flex items-center gap-1.5 cursor-pointer ${active_tab === 'cities'
                  ? 'bg-background text-foreground shadow-sm font-bold'
                  : 'text-muted-foreground hover:text-foreground font-light'
                  }`}
              >
                <Icon name="location_city" className="text-white text-xs" />
                {t.analytics.largestCities}
              </button>
            )}

            {/* Population Pyramid Tab for raster.age_sex */}
            {has_population_pyramid && (
              <button
                type="button"
                onClick={() => set_active_tab('pyramid')}
                className={`px-2 py-0.5 text-[var(--body-font-size)] rounded-none transition-colors flex items-center gap-1.5 cursor-pointer ${active_tab === 'pyramid'
                  ? 'bg-background text-foreground shadow-sm font-bold'
                  : 'text-muted-foreground hover:text-foreground font-light'
                  }`}
              >
                <Icon name="people" className="text-white text-xs" />
                {t.analytics.pyramid}
              </button>
            )}

            {/* Sector Breakdown Tab for raster.category_profession */}
            {has_category_breakdown && (
              <button
                type="button"
                onClick={() => set_active_tab('breakdown')}
                className={`px-2 py-0.5 text-[var(--body-font-size)] rounded-none transition-colors flex items-center gap-1.5 cursor-pointer ${active_tab === 'breakdown'
                  ? 'bg-background text-foreground shadow-sm font-bold'
                  : 'text-muted-foreground hover:text-foreground font-light'
                  }`}
              >
                <Icon name="briefcase" className="text-white text-xs" />
                {t.analytics.breakdown}
              </button>
            )}

            <button
              type="button"
              onClick={() => set_active_tab('histogram')}
              className={`px-2 py-0.5 text-[var(--body-font-size)] rounded-none transition-colors flex items-center gap-1.5 cursor-pointer ${active_tab === 'histogram'
                ? 'bg-background text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground font-light'
                }`}
            >
              <Icon name="bar_chart" className="text-white text-xs" />
              {t.analytics.histogram}
            </button>

            <button
              type="button"
              onClick={() => set_active_tab('stats')}
              className={`px-2 py-0.5 text-[var(--body-font-size)] rounded-none transition-colors flex items-center gap-1.5 cursor-pointer ${active_tab === 'stats'
                ? 'bg-background text-foreground shadow-sm font-bold'
                : 'text-muted-foreground hover:text-foreground font-light'
                }`}
            >
              <Icon name="info" className="text-white text-xs" />
              {t.analytics.summary}
            </button>
          </div>
        </div>

        {/* Dedicated Second Row: Active country filter badge */}
        {effective_countries.length > 0 && (
          <div className="flex items-center justify-between px-[var(--padding)] py-1 bg-muted/20 border-b border-border text-xs shrink-0 select-none">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className={`w-1.5 h-1.5 rounded-none ${is_calculating_stats ? 'bg-amber-400 animate-pulse' : 'bg-primary'} shrink-0`} />
              <span className="text-muted-foreground font-light text-[var(--body-font-size)]">{t.analytics.filter}</span>
              <span className="font-medium text-foreground text-[var(--body-font-size)] truncate max-w-[320px]">
                {effective_countries.length === 1
                  ? effective_countries[0].properties.name
                  : `${effective_countries[0].properties.name} (+${effective_countries.length - 1} other${effective_countries.length > 2 ? 's' : ''})`}
              </span>
              {is_calculating_stats && (
                <span className="text-[10px] text-amber-400 font-mono ml-1.5 flex items-center gap-1.5 bg-amber-500/10 px-1.5 py-0.5 border border-amber-500/30">
                  <Icon name="sync" className="text-[10px] animate-spin" />
                  <span>{format_string(t.analytics.refiningCalculations, stats_progress_pct, stats_time_remaining.toFixed(1))}</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={handle_clear}
              className="text-muted-foreground hover:text-foreground text-[10px] underline cursor-pointer shrink-0 ml-2"
              title={t.analytics.clearFilter}
            >
              {t.analytics.clearFilter}
            </button>
          </div>
        )}

        {/* Panel Body */}
        <div className="flex-1 p-[var(--padding)] overflow-y-auto custom-scrollbar bg-background/50 flex flex-col min-h-0">
          {active_tab === 'cities' ? (
            <LargestCitiesChart
              key={`cities-${stadester_dataset}-${current_year}`}
              currentYear={current_year}
              dataset={stadester_dataset}
              onSelectCity={on_select_city}
            />
          ) : !raster ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground text-[var(--body-font-size)] space-y-1 px-4">
              <Icon name="upload_file" className="text-white/60 mb-1" />
              <span className="font-medium text-foreground">{t.analytics.noRasterLoaded ?? 'No raster loaded.'}</span>
              <span className="text-[var(--body-font-size)] text-muted-foreground/70 text-center max-w-sm">
                {t.analytics.noRasterDesc ?? 'Select a mapmode or upload a GeoPNG file in the sidebar to inspect statistics & distributions.'}
              </span>
            </div>
          ) : is_calculating_stats && effective_countries.length > 0 && !country_stats ? (
            <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground text-[var(--body-font-size)] space-y-2 px-4">
              <div className="flex items-center gap-2 text-amber-400 font-medium font-mono text-xs">
                <Icon name="sync" className="text-amber-400 text-sm animate-spin" />
                <span>{format_string(t.analytics.refiningCalculations, stats_progress_pct, stats_time_remaining.toFixed(1))}</span>
              </div>
              <span className="text-[var(--body-font-size)] text-muted-foreground/70 text-center max-w-sm">
                {t.analytics.processingWorker}
              </span>
            </div>
          ) : (
            (() => {
              let country_id_str = effective_countries.length > 0
                ? effective_countries.map((arg0_c) => arg0_c.properties.name).join('_')
                : 'all'
              let derived_key = `${raster_key ?? ''}-${raster ? `${raster.width}x${raster.height}-${raster.min}-${raster.max}` : 'none'}-${country_id_str}-${active_layer?.id ?? 'default'}`
              let effective_country_stats = effective_countries.length > 0 ? country_stats : null
              return (
                <>
                  {active_tab === 'pyramid' && (
                    <PopulationPyramidChart
                      key={`pyramid-${derived_key}`}
                      raster={raster}
                      countryStats={effective_country_stats}
                      selectedCountries={effective_countries}
                      selectedCountry={selected_country}
                      currentYear={current_year}
                      activeVariableSelectors={active_variable_selectors}
                      inspectData={inspect_data}
                      isMobile={is_mobile}
                      usePlaceholder={use_placeholder_pyramid}
                      onTogglePlaceholder={set_use_placeholder_pyramid}
                      syntheticByDefault={active_layer?.synthetic_by_default}
                    />
                  )}

                  {active_tab === 'breakdown' && (
                    <CategoryBreakdownChart
                      key={`breakdown-${derived_key}`}
                      raster={raster}
                      countryStats={effective_country_stats}
                      selectedCountries={effective_countries}
                      selectedCountry={selected_country}
                      currentYear={current_year}
                      layerId={active_layer?.id}
                      activeVariableSelectors={active_variable_selectors}
                      inspectData={inspect_data}
                      usePlaceholder={use_placeholder_breakdown}
                      onTogglePlaceholder={set_use_placeholder_breakdown}
                      syntheticByDefault={active_layer?.synthetic_by_default}
                    />
                  )}

                  {active_tab === 'histogram' && (
                    <HistogramChart
                      key={`hist-${derived_key}`}
                      raster={raster}
                      scaleType={scale_type}
                      logSigma={log_sigma}
                      minOverride={min_override}
                      maxOverride={max_override}
                      countryStats={effective_country_stats}
                    />
                  )}

                  {active_tab === 'stats' && (
                    <div className="h-full w-full p-[var(--padding)] overflow-y-auto">
                      <StatsSummary key={`stats-${derived_key}`} raster={raster} countryStats={effective_country_stats} />
                    </div>
                  )}
                </>
              )
            })()
          )}
        </div>
      </div>
    </>
  )
}

export default AnalyticsDrawer
