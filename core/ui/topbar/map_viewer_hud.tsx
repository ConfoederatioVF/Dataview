import React from 'react'
import {
  CountryFeature,
  ProjectionType,
  HeightmapConfig,
  CircleOverlayConfig,
  MapModeItem,
  CityPoint,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { UI_LAYOUT } from '@framework/utils/ui_layout'
import { MAP_CONFIG } from '@common'
import { useLocalisation, type SupportedLocale } from '@localisation'
import { ColorBarLegend } from './color_bar_legend'
import { StadesterLegendCard } from './stadester_legend_card'
import { InfoFlyoutPanel } from './info_flyout_panel'
import { Button } from '@ui/components/button'
import { Icon } from '@ui/components/icon'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@ui/components/select'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@ui/components/tooltip'

export interface MapViewerHUDProps {
  activeLayerId?: string | null
  analyticsOpen: boolean
  basemap: string
  cameraTilt: number
  circleOverlayConfig: CircleOverlayConfig
  colorPalette: any
  colourbarLeft?: number
  colourbarWidth?: number
  drawPointsCount?: number
  flyoutOpen: boolean
  hasCanvas?: boolean
  hasDrawnPolygon?: boolean
  heightmapConfig: HeightmapConfig
  hideColourbar?: boolean
  hoveredCity?: CityPoint | null
  infoPanelOpen?: boolean
  inspectData?: any
  invertPalette?: boolean
  isDrawing?: boolean
  isMobile?: boolean
  isTimelapseExporting?: boolean
  effectiveMapmodesBottom?: number
  legendBreaks?: number[]
  legendCountryName?: string
  legendMax: number
  legendMin: number
  legendPosition: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'
  legendSubtitle?: string
  legendTitle: string
  logSigma: number
  mapModes: MapModeItem[]
  mapmodesBounds?: { height?: number; left: number; right: number; top: number; width?: number } | null
  mapmodesClearance?: number
  mapmodesHeight?: number
  mapmodesTakenRight?: number
  mapmodesWidth?: number
  onChangeLegendPosition?: (arg0_pos: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right') => void
  onCancelDraw?: () => void
  onClearDrawnPolygon?: () => void
  onCloseInfoPanel?: () => void
  onDeleteLastDrawPoint?: () => void
  onDoubleClick?: () => void
  onFinishDraw?: () => void
  onResizeColourbarWidth?: (arg0_w: number) => void
  onToggleAnalytics: () => void
  onToggleDraw?: () => void
  onTogglePerformantMode?: (arg0_enabled: boolean) => void
  onToggleTooltips?: () => void
  onToggleUi?: () => void
  onUpdateBreaks?: (arg0_breaks: number[]) => void
  performantMode: boolean
  projection: ProjectionType
  raster?: any
  rasterVersion?: number
  scaleType: string
  selectedCountries?: CountryFeature[]
  setBasemap: (arg0_id: string) => void
  setFlyoutOpen: (arg0_open: boolean) => void
  setProjection: (arg0_p: ProjectionType) => void
  setShowGraticule: React.Dispatch<React.SetStateAction<boolean>>
  showGraticule: boolean
  showTooltips?: boolean
  stadesterCities?: CityPoint[]
  stadesterConfig?: StadesterConfig
  timelineBounds?: { left: number; right: number; top: number } | null
  timelineClearance?: number
  topRightTaken?: number
  topbarClearance?: number
  uiVisible: boolean
}

/**
 * HUD overlays component containing legend bars, top-right tools, and map settings flyout.
 *
 * @param {MapViewerHUDProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let MapViewerHUD: React.FC<MapViewerHUDProps> = React.memo(function (
  arg0_props: MapViewerHUDProps
) {
  //Convert from parameters
  let props = arg0_props
  let active_layer_id = props.activeLayerId
  let analytics_open = props.analyticsOpen
  let basemap = props.basemap
  let camera_tilt = props.cameraTilt
  let circle_overlay_config = props.circleOverlayConfig
  let color_palette = props.colorPalette
  let colourbar_left = props.colourbarLeft ?? 24
  let is_mobile = props.isMobile ?? false
  let current_colourbar_width = is_mobile
    ? Math.min(props.colourbarWidth ?? 336, typeof window !== 'undefined' ? window.innerWidth - 32 : 320)
    : (props.colourbarWidth ?? 336)
  let draw_points_count = props.drawPointsCount ?? 0
  let effective_mapmodes_bottom = props.effectiveMapmodesBottom
  let flyout_open = props.flyoutOpen
  let has_canvas = Boolean(props.hasCanvas)
  let has_drawn_polygon = Boolean(props.hasDrawnPolygon)
  let heightmap_config = props.heightmapConfig
  let hide_colourbar = Boolean(props.hideColourbar)
  let hovered_city = props.hoveredCity
  let info_panel_open = props.infoPanelOpen
  let inspect_data = props.inspectData
  let invert_palette = props.invertPalette
  let is_drawing = Boolean(props.isDrawing)
  let is_timelapse_exporting = props.isTimelapseExporting
  let legend_breaks = props.legendBreaks
  let legend_country_name = props.legendCountryName
  let legend_max = props.legendMax
  let legend_min = props.legendMin
  let legend_position = props.legendPosition
  let legend_subtitle = props.legendSubtitle
  let legend_title = props.legendTitle
  let log_sigma = props.logSigma
  let map_modes = props.mapModes
  let mapmodes_bounds = props.mapmodesBounds
  let mapmodes_clearance_prop = props.mapmodesClearance
  let mapmodes_height = props.mapmodesHeight ?? 0
  let mapmodes_taken_right = props.mapmodesTakenRight ?? 352
  let mapmodes_width = props.mapmodesWidth ?? 0
  let on_cancel_draw = props.onCancelDraw
  let on_change_legend_position = props.onChangeLegendPosition
  let on_clear_drawn_polygon = props.onClearDrawnPolygon
  let on_close_info_panel = props.onCloseInfoPanel
  let on_delete_last_draw_point = props.onDeleteLastDrawPoint
  let on_double_click = props.onDoubleClick
  let on_finish_draw = props.onFinishDraw
  let on_resize_colourbar_width = props.onResizeColourbarWidth
  let on_toggle_analytics = props.onToggleAnalytics
  let on_toggle_draw = props.onToggleDraw
  let on_toggle_performant_mode = props.onTogglePerformantMode
  let on_toggle_tooltips = props.onToggleTooltips
  let on_toggle_ui = props.onToggleUi
  let on_update_breaks = props.onUpdateBreaks
  let performant_mode = props.performantMode
  let projection = props.projection
  let raster = props.raster
  let raster_version = props.rasterVersion ?? 0
  let scale_type = props.scaleType
  let selected_countries = props.selectedCountries
  let set_basemap = props.setBasemap
  let set_flyout_open = props.setFlyoutOpen
  let set_projection = props.setProjection
  let set_show_graticule = props.setShowGraticule
  let show_graticule = props.showGraticule
  let show_tooltips = props.showTooltips ?? true
  let stadester_cities = props.stadesterCities
  let stadester_config = props.stadesterConfig
  let timeline_bounds = props.timelineBounds
  let timeline_clearance = props.timelineClearance ?? 128
  let top_right_taken = props.topRightTaken ?? 0
  let topbar_clearance_prop = props.topbarClearance
  let ui_visible = props.uiVisible

  let { formatString, locale, setLocale, t } = useLocalisation()

  //Declare local instance variables
  let available_top_width: number
  let container_style: React.CSSProperties = {}
  let effective_bottom: number
  let effective_right: number
  let effective_sidebar_left: number
  let effective_top_right: number
  let effective_topbar_clearance: number
  let is_bottom = legend_position.startsWith('bottom')
  let is_center_pos = legend_position.includes('center') || legend_position.includes('centre')
  let is_top_right_occupied: boolean
  let is_topbar_active: boolean
  let mapmodes_clearance: number
  let max_allowed_width: number
  let rightbar_target_width: number
  let top_right_clearance: number
  let top_right_offset: number
  let topbar_clearance: number
  let window_h: number
  let window_w: number

  //Function body
  window_h = (typeof window !== 'undefined' && window.visualViewport)
    ? window.visualViewport.height
    : (typeof window !== 'undefined' ? window.innerHeight : 800)
  window_w = (typeof window !== 'undefined' && window.visualViewport)
    ? window.visualViewport.width
    : (typeof window !== 'undefined' ? window.innerWidth : 1920)

  is_topbar_active = !hide_colourbar && legend_title !== 'None' && ((Boolean(raster) || Boolean(has_canvas)) || Boolean(stadester_config?.enabled) || Boolean(info_panel_open))
  is_top_right_occupied = is_topbar_active && legend_position === 'top-center'

  effective_topbar_clearance = (topbar_clearance_prop !== undefined && topbar_clearance_prop > 40)
    ? topbar_clearance_prop
    : 112

  top_right_clearance = is_top_right_occupied
    ? effective_topbar_clearance
    : UI_LAYOUT.margin
  topbar_clearance = top_right_clearance

  effective_sidebar_left = (!is_mobile && ui_visible && !is_timelapse_exporting)
    ? colourbar_left
    : UI_LAYOUT.margin
  effective_top_right = (is_mobile ? Math.max(top_right_taken, 44) : top_right_taken) + UI_LAYOUT.gap

  available_top_width = Math.max(0, window_w - effective_sidebar_left - effective_top_right)
  mapmodes_clearance = (mapmodes_clearance_prop !== undefined)
    ? mapmodes_clearance_prop
    : ((mapmodes_bounds && mapmodes_bounds.top > 0)
      ? Math.max(0, window_h - mapmodes_bounds.top + UI_LAYOUT.gap)
      : UI_LAYOUT.margin)

  if (is_mobile) {
    if (is_bottom) {
      container_style.bottom = '12px'
      container_style.left = '8px'
      container_style.maxWidth = 'calc(100vw - 16px)'
      container_style.right = '8px'
      container_style.transform = 'none'
      container_style.width = 'auto'
    } else {
      container_style.top = '54px'
      container_style.transform = 'none'

      if (legend_position === 'top-right') {
        container_style.maxWidth = `calc(100vw - ${effective_top_right + 16}px)`
        container_style.right = `${effective_top_right}px`
        container_style.width = `min(380px, calc(100vw - ${effective_top_right + 16}px))`
      } else if (legend_position === 'top-center') {
        container_style.left = '8px'
        container_style.maxWidth = `calc(100vw - ${effective_top_right + 16}px)`
        container_style.right = `${effective_top_right}px`
        container_style.width = 'auto'
      } else {
        // 'top-left'
        container_style.left = '8px'
        container_style.maxWidth = `calc(100vw - ${effective_top_right + 16}px)`
        container_style.width = `min(380px, calc(100vw - ${effective_top_right + 16}px))`
      }
    }
  } else if (legend_position === 'bottom-center') {
    container_style.bottom = `${timeline_clearance}px`
    container_style.left = '0px'
    container_style.marginLeft = 'auto'
    container_style.marginRight = 'auto'
    container_style.maxWidth = 'min(1100px, calc(100vw - 64px))'
    container_style.right = '0px'
    container_style.transform = 'none'
    container_style.width = 'min(1100px, calc(100vw - 64px))'
  } else if (legend_position === 'bottom-left') {
    max_allowed_width = Math.max(0, window_w - effective_sidebar_left - UI_LAYOUT.margin)
    container_style.bottom = `${timeline_clearance}px`
    container_style.left = `${effective_sidebar_left}px`
    container_style.maxWidth = `${max_allowed_width}px`
    container_style.transform = 'none'
    container_style.width = `${Math.min(current_colourbar_width, max_allowed_width)}px`
  } else if (legend_position === 'bottom-right') {
    effective_bottom = (effective_mapmodes_bottom !== undefined ? effective_mapmodes_bottom : UI_LAYOUT.margin) + (mapmodes_height > 0 ? (mapmodes_height + UI_LAYOUT.gap) : 0)
    rightbar_target_width = (mapmodes_width > 0) ? mapmodes_width : 340
    max_allowed_width = Math.max(0, window_w - effective_sidebar_left - UI_LAYOUT.margin)
    container_style.bottom = `${effective_bottom}px`
    container_style.maxHeight = `calc(100dvh - ${effective_bottom + UI_LAYOUT.margin}px)`
    container_style.maxWidth = `${max_allowed_width}px`
    container_style.overflowY = 'auto'
    container_style.right = `${UI_LAYOUT.margin}px`
    container_style.transform = 'none'
    container_style.width = `${Math.min(rightbar_target_width, max_allowed_width)}px`
  } else if (legend_position === 'top-center') {
    container_style.top = `${UI_LAYOUT.margin}px`
    container_style.left = '0px'
    container_style.marginLeft = 'auto'
    container_style.marginRight = 'auto'
    container_style.maxWidth = 'min(1100px, calc(100vw - 64px))'
    container_style.right = '0px'
    container_style.transform = 'none'
    container_style.width = 'min(1100px, calc(100vw - 64px))'
  } else if (legend_position === 'top-right') {
    top_right_offset = effective_top_right
    max_allowed_width = Math.max(0, window_w - effective_sidebar_left - top_right_offset)
    container_style.top = `${UI_LAYOUT.margin}px`
    container_style.right = `${top_right_offset}px`
    container_style.maxWidth = `${max_allowed_width}px`
    container_style.width = `${Math.min(current_colourbar_width, max_allowed_width)}px`
  } else {
    // 'top-left'
    max_allowed_width = Math.max(0, window_w - effective_sidebar_left - effective_top_right)
    container_style.top = `${UI_LAYOUT.margin}px`
    container_style.left = `${effective_sidebar_left}px`
    container_style.maxWidth = `${max_allowed_width}px`
    container_style.width = `${Math.min(current_colourbar_width, max_allowed_width)}px`
  }

  //Return statement
  return (
    <>
      {/* Floating Legend Container */}
      {!is_timelapse_exporting && ui_visible && ((!hide_colourbar && (Boolean(raster) || Boolean(has_canvas))) || Boolean(stadester_config?.enabled) || Boolean(info_panel_open)) && (
        <div
          id="dataview-legend-card-container"
          style={container_style}
          className={`absolute z-30 pointer-events-none flex flex-col gap-2 ${is_bottom ? 'justify-end' : 'justify-start'
            }`}
        >
          {/* Main Raster ColourBar Legend */}
          {!hide_colourbar && legend_title !== 'None' && (Boolean(raster) || Boolean(has_canvas)) && (
            <div className="pointer-events-auto w-full flex justify-center">
              <ColorBarLegend
                key={`colorbar-${active_layer_id ?? 'layer'}-${raster_version}-${legend_title}-${legend_subtitle}-${color_palette}`}
                palette={color_palette}
                invertPalette={invert_palette}
                isMobile={is_mobile}
                minVal={legend_min}
                maxVal={legend_max}
                legendTitle={legend_title}
                legendSubtitle={legend_subtitle}
                scaleType={scale_type}
                logSigma={log_sigma}
                currentVal={inspect_data?.value ?? null}
                breaks={legend_breaks}
                countryName={legend_country_name}
                onUpdateBreaks={on_update_breaks}
                width={is_mobile || is_center_pos || legend_position === 'bottom-right' ? '100%' : current_colourbar_width}
                onResizeWidth={is_mobile || is_center_pos || legend_position === 'bottom-right' ? undefined : on_resize_colourbar_width}
              />
            </div>
          )}

          {/* Stadestér Settlements Legend Card */}
          {stadester_config?.enabled && (
            <div className="pointer-events-auto w-full flex justify-center">
              <StadesterLegendCard
                config={stadester_config}
                hoveredCity={hovered_city}
                settlementCount={stadester_cities?.length ?? 0}
                width={is_mobile || is_center_pos || legend_position === 'bottom-right' ? '100%' : current_colourbar_width}
              />
            </div>
          )}

          {/* Information & Controls Flyout Panel */}
          {info_panel_open && !is_mobile && (
            <div className="pointer-events-auto">
              <InfoFlyoutPanel
                isOpen={info_panel_open}
                onClose={on_close_info_panel || (() => { })}
                mapModes={map_modes}
                heightmapConfig={heightmap_config}
                circleOverlayConfig={circle_overlay_config}
                selectedCountries={selected_countries || []}
                projection={projection}
                cameraTilt={camera_tilt}
                width={current_colourbar_width}
              />
            </div>
          )}
        </div>
      )}

      {/* Drawing Mode Floating Action Banner */}
      {ui_visible && is_drawing && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-40 bg-card/95 backdrop-blur-md border border-[rgb(200,40,40)] shadow-2xl p-2 px-3.5 flex items-center gap-3.5 text-[var(--body-font-size)] font-sans">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[rgb(200,40,40)] animate-pulse" />
            <span className="font-semibold text-foreground">
              {draw_points_count === 0
                ? t.hud.drawStartPrompt
                : formatString(t.hud.drawPointsPrompt, draw_points_count)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            {draw_points_count >= 3 && (
              <Button
                size="sm"
                variant="secondary"
                onClick={on_finish_draw}
                className="h-6 px-2 text-xs bg-emerald-600 hover:bg-emerald-500 text-white rounded-none cursor-pointer"
              >
                <Icon name="check" className="text-xs mr-1" />
                <span>{t.hud.finishDraw}</span>
              </Button>
            )}
            {draw_points_count > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={on_delete_last_draw_point}
                className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground rounded-none cursor-pointer"
                title={t.hud.deleteLastPoint}
              >
                <Icon name="undo" className="text-xs mr-1" />
                <span>{t.hud.undo}</span>
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={on_cancel_draw}
              className="h-6 px-2 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-none cursor-pointer"
            >
              <Icon name="close" className="text-xs mr-1" />
              <span>{t.hud.cancel}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Map Control Tools Toolbar (Top Right) */}
      {!is_timelapse_exporting && (
        <TooltipProvider delayDuration={150}>
          <div
            id="dataview-top-right-toolbar"
            style={{
              right: `${UI_LAYOUT.margin}px`,
              top: is_mobile
                ? (is_top_right_occupied ? `${Math.max(54, top_right_clearance)}px` : '54px')
                : `${top_right_clearance}px`,
            }}
            className="absolute z-30 flex flex-col gap-2"
          >
            {/* Tools Container */}
            <div className="flex flex-col gap-[var(--cell-padding)] bg-card/95 backdrop-blur-md p-[var(--cell-padding)] rounded-none border border-border shadow-md">
              {/* Map Display Settings Toggle */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={flyout_open ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={() => set_flyout_open(!flyout_open)}
                    className="h-7 w-7 rounded-none text-white cursor-pointer"
                    aria-label={t.settings.title}
                  >
                    <Icon name="settings" className="text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span>{t.settings.title}</span>
                </TooltipContent>
              </Tooltip>

              {/* Toggle Raster Calculator View Panel */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={analytics_open ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={on_toggle_analytics}
                    className="h-7 w-7 rounded-none text-white cursor-pointer"
                    aria-label={t.analytics.title}
                  >
                    <Icon name="analytics" className="text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span>{t.analytics.title}</span>
                </TooltipContent>
              </Tooltip>

              {/* Toggle Polygon Draw Measurement Tool */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={is_drawing ? 'secondary' : 'ghost'}
                    size="icon"
                    onClick={on_toggle_draw}
                    className={`h-7 w-7 rounded-none cursor-pointer transition-colors ${
                      is_drawing
                        ? 'bg-[rgb(200,40,40)] hover:bg-[rgb(220,50,50)] text-white shadow-md'
                        : 'text-white'
                    }`}
                    aria-label={t.hud.drawPolygon}
                  >
                    <Icon name="polyline" className="text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span>{is_drawing ? t.hud.cancelDraw : t.hud.drawPolygon}</span>
                </TooltipContent>
              </Tooltip>

              {/* Clear Drawn Polygon (when present) */}
              {has_drawn_polygon && !is_drawing && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={on_clear_drawn_polygon}
                      className="h-7 w-7 rounded-none text-red-400 hover:text-red-300 hover:bg-red-500/20 cursor-pointer"
                      aria-label={t.hud.clearDrawnPolygon}
                    >
                      <Icon name="delete_sweep" className="text-red-400" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="left">
                    <span>{t.hud.clearDrawnPolygon}</span>
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* View Options Container */}
            <div className="flex flex-col gap-[var(--cell-padding)] bg-card/95 backdrop-blur-md p-[var(--cell-padding)] rounded-none border border-border shadow-md">
              {/* Reset Map View */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={on_double_click}
                    className="h-7 w-7 rounded-none text-white cursor-pointer"
                    aria-label={t.hud.resetView}
                  >
                    <Icon name="restart_alt" className="text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span>{t.hud.resetView}</span>
                </TooltipContent>
              </Tooltip>

              {/* Toggle Fullscreen / UI Visibility */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={ui_visible ? 'ghost' : 'secondary'}
                    size="icon"
                    onClick={on_toggle_ui}
                    className="h-7 w-7 rounded-none text-white cursor-pointer"
                    aria-label={ui_visible ? t.hud.hideUi : t.hud.showUi}
                  >
                    <Icon name={ui_visible ? 'visibility' : 'visibility_off'} className="text-white" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="left">
                  <span>{ui_visible ? t.hud.hideUi : t.hud.showUi}</span>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Map Display Settings Flyout Panel */}
          {flyout_open && ui_visible && (
            <>
              <div
                id="dataview-settings-drawer"
                style={is_mobile ? {
                  bottom: '0px',
                  left: '0px',
                  maxHeight: 'calc(var(--app-height, 100dvh) - 54px)',
                  right: '0px',
                } : {
                  maxHeight: `calc(100dvh - ${top_right_clearance + (legend_position === 'bottom-center' ? 140 : 76)}px)`,
                  right: `${UI_LAYOUT.settingsDrawerRight}px`,
                  top: `${top_right_clearance}px`,
                  width: `${UI_LAYOUT.settingsDrawerWidth}px`,
                }}
                className={is_mobile
                  ? 'fixed z-50 bg-card/98 backdrop-blur-md border-t border-border rounded-t-lg p-[var(--padding)] pb-3 shadow-2xl text-[var(--body-font-size)] text-card-foreground font-sans space-y-[var(--padding)] overflow-y-auto custom-scrollbar'
                  : 'absolute z-35 bg-card/98 backdrop-blur-md border border-border rounded-none p-[var(--padding)] shadow-2xl text-[var(--body-font-size)] text-card-foreground font-sans space-y-[var(--padding)] overflow-y-auto custom-scrollbar'
                }
              >
                <div className="flex items-center justify-between pb-1.5 border-b border-border">
                  <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
                    <Icon name="settings" />
                    <span>{t.settings.title}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => set_flyout_open(false)}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer flex items-center justify-center"
                    title={t.settings.close}
                    aria-label={t.settings.close}
                  >
                    <Icon name="close" size="1.2rem" />
                  </button>
                </div>

                {/* Projection Mode */}
                <div className="space-y-1.5">
                  <span className="text-[var(--body-font-size)] font-bold text-foreground">{t.settings.projectionMode}</span>
                  <div className="grid grid-cols-2 gap-1 bg-background/60 p-[var(--cell-padding)] rounded-none border border-border">
                    {(['Mercator', 'Equirectangular', 'Globe', 'EqualEarth'] as ProjectionType[]).map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => set_projection(p)}
                        className={`px-2 py-1 rounded-none text-[var(--body-font-size)] transition-colors cursor-pointer text-center ${projection === p
                          ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground font-light'
                          }`}
                      >
                        {p === 'Equirectangular' ? t.settings.projections.equirectangular : p === 'EqualEarth' ? t.settings.projections.equalEarth : p === 'Globe' ? t.settings.projections.globe : t.settings.projections.mercator}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Basemap Layer */}
                <div className="space-y-1.5">
                  <span className="text-[var(--body-font-size)] font-bold text-foreground">{t.settings.basemapLayer}</span>
                  <div className="space-y-1 bg-background/60 p-[var(--cell-padding)] rounded-none border border-border">
                    {MAP_CONFIG.basemapLayers.map((arg0_item: { id: string; label: string }) => {
                      let basemap_label = (t.settings.basemaps as Record<string, string> | undefined)?.[arg0_item.id] || arg0_item.label
                      return (
                        <button
                          key={arg0_item.id}
                          type="button"
                          onClick={() => set_basemap(arg0_item.id)}
                          className={`w-full flex items-center justify-between px-2 py-1 rounded-none text-[var(--body-font-size)] transition-colors cursor-pointer text-left ${basemap === arg0_item.id
                            ? 'bg-muted text-foreground font-bold'
                            : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground font-light'
                            }`}
                        >
                          <span>{basemap_label}</span>
                          {basemap === arg0_item.id && <span className="w-1.5 h-1.5 rounded-none bg-primary" />}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Colourbar Position */}
                <div className="space-y-1.5">
                  <span className="text-[var(--body-font-size)] font-bold text-foreground">{t.settings.colourbarPosition}</span>
                  <div className="grid grid-cols-3 gap-1 bg-background/60 p-[var(--cell-padding)] rounded-none border border-border">
                    {[
                      { id: 'top-left', label: t.settings.positions.topLeft },
                      { id: 'top-center', label: t.settings.positions.topCenter },
                      { id: 'top-right', label: t.settings.positions.topRight },
                      { id: 'bottom-left', label: t.settings.positions.bottomLeft },
                      { id: 'bottom-center', label: t.settings.positions.bottomCenter },
                      { id: 'bottom-right', label: t.settings.positions.bottomRight },
                    ].map((pos) => (
                      <button
                        key={pos.id}
                        type="button"
                        onClick={() => on_change_legend_position && on_change_legend_position(pos.id as any)}
                        className={`px-1.5 py-1 rounded-none text-[10px] transition-colors cursor-pointer text-center ${legend_position === pos.id
                          ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                          : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground font-light'
                          }`}
                      >
                        {pos.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Language Selector (Endonymic Select) */}
                <div className="space-y-1.5">
                  <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
                    <Icon name="translate" className="text-xs" />
                    <span>{t.settings.language}</span>
                  </span>
                  <Select value={locale} onValueChange={(arg0_val) => setLocale(arg0_val as SupportedLocale)}>
                    <SelectTrigger className="w-full rounded-none h-8 text-[var(--body-font-size)] bg-background/80 border border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="rounded-none border border-border bg-card">
                      <SelectItem value="en-GB">English (EN-GB)</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Performant Mode (Optimization Logic) */}
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--body-font-size)] font-bold text-foreground">{t.settings.performantMode}</span>
                    <button
                      type="button"
                      onClick={() => on_toggle_performant_mode && on_toggle_performant_mode(!performant_mode)}
                      className={`px-2 py-0.5 rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors ${performant_mode
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      {performant_mode ? t.settings.enabled : t.settings.disabled}
                    </button>
                  </div>
                  <span className="text-[10px] text-muted-foreground block leading-normal">
                    {t.settings.performantDesc}
                  </span>
                </div>

                {/* Graticule Grid Lines */}
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
                      <span>{t.settings.graticules || t.hud.graticule}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => set_show_graticule(!show_graticule)}
                      className={`px-2 py-0.5 rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors ${show_graticule
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      {show_graticule ? t.settings.enabled : t.settings.disabled}
                    </button>
                  </div>
                  <span className="text-[10px] text-muted-foreground block leading-normal">
                    {t.settings.graticulesDesc || t.hud.graticule}
                  </span>
                </div>

                {/* On-Map Inspection Tooltips */}
                <div className="space-y-1.5 pt-1 border-t border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
                      <span>{t.settings.tooltips || t.hud.tooltips}</span>
                    </span>
                    <button
                      type="button"
                      onClick={on_toggle_tooltips}
                      className={`px-2 py-0.5 rounded-none text-[10px] font-mono font-bold cursor-pointer transition-colors ${show_tooltips
                        ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-xs'
                        : 'bg-muted text-muted-foreground hover:text-foreground'
                        }`}
                    >
                      {show_tooltips ? t.settings.enabled : t.settings.disabled}
                    </button>
                  </div>
                  <span className="text-[10px] text-muted-foreground block leading-normal">
                    {t.settings.tooltipsDesc || (t.hud.hideTooltips || 'Disable Tooltips')}
                  </span>
                </div>
              </div>
            </>
          )}
        </TooltipProvider>
      )}
    </>
  )
})
