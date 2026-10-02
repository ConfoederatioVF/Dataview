import React, { useState, useEffect, useMemo } from 'react'
import {
  AppMode,
  DataFormat,
  ScaleType,
  ColorPalette,
  BoundsMode,
  BinningConfig,
  DownsampleMethod,
  MapModeItem,
  MapModeId,
  HeightmapConfig,
  CircleOverlayConfig,
  HistoricalBordersConfig,
  ProjectionType,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { CountryFeature } from '@framework/geopng/polygon_binning'
import { CustomVectorDataset } from '@framework/geopng/custom_vector_service.ts'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/select'
import { Slider } from '@ui/components/slider'
import { Input } from '@ui/components/input'
import { NumberInput } from '@ui/components/number_input'
import { Label } from '@ui/components/label'
import { Icon } from '@ui/components/icon'
import { useInfoPanelConfig, UserRole, isPublicBuild, isRoleAllowed } from '@common'
import { useLocalisation } from '@localisation'
import { ParsedDataLayer } from '@server/layer_parser'
import { D3ColorPaletteSelector } from './d3_color_palette_selector'
import { MarkdownRenderer } from '@ui/components/markdown_renderer'
import { InfoFlyoutPanel } from '@ui/topbar/info_flyout_panel'

export interface SidebarControlsProps {
  activeFileName?: string
  activeLayerId?: string | null
  activeVariableSelectors?: Record<string, string | string[]>
  appMode: AppMode
  binningConfig: BinningConfig
  bottomClearance?: number
  topClearance?: number
  boundsMode: BoundsMode
  cameraTilt?: number
  circleOverlayConfig?: CircleOverlayConfig
  colorPalette: ColorPalette
  customVectorDataset?: CustomVectorDataset | null
  customVectorVisible?: boolean
  dataFormat: DataFormat
  diffNameA?: string
  diffNameB?: string
  heightmapConfig?: HeightmapConfig
  historicalBordersConfig?: HistoricalBordersConfig
  infoPanelOpen?: boolean
  invertPalette: boolean
  isMobile?: boolean
  isLoadingLayers?: boolean
  layers?: Record<string, ParsedDataLayer>
  legendSubtitle?: string
  legendTitle: string
  logSigma: number
  mapModes?: MapModeItem[]
  maxValOverride: string
  minValOverride: string
  onChangeUserRole?: (role: UserRole) => void
  onChangeVariableSelector?: (key: string, option: string | string[]) => void
  onClose?: () => void
  onFileUpload: (file: File, target: 'single' | 'diff_a' | 'diff_b') => void
  onOpenVideoExport?: () => void
  onRemoveCustomVector?: () => void
  onSelectLayer?: (layerId: string) => void
  onToggleCustomVectorVisible?: (arg0_visible: boolean) => void
  onToggleInfoPanel?: () => void
  onToggleMapMode?: (id: MapModeId) => void
  onUploadCustomVector?: (arg0_file: File) => void
  onWidthChange?: (newWidth: number) => void
  opacity: number
  percentileList: string
  absoluteBreaks: string
  projection?: ProjectionType
  scaleType: ScaleType
  selectedCountries?: CountryFeature[]
  setAbsoluteBreaks: (p: string) => void
  setAppMode: (mode: AppMode) => void
  setBinningConfig: React.Dispatch<React.SetStateAction<BinningConfig>>
  setBoundsMode: (b: BoundsMode) => void
  setColorPalette: (p: ColorPalette) => void
  setDataFormat: (fmt: DataFormat) => void
  setInvertPalette: (inv: boolean) => void
  setLegendSubtitle?: (s: string) => void
  setLegendTitle: (t: string) => void
  setLogSigma: (s: number) => void
  setMaxValOverride: (v: string) => void
  setMinValOverride: (v: string) => void
  setOpacity: (o: number) => void
  setPercentileList: (p: string) => void
  setScaleType: (st: ScaleType) => void
  stadesterConfig?: StadesterConfig
  userRole?: UserRole
  width?: number
}

/**
 * SidebarControls primary control panel component for styling, downsampling, and manual file preview.
 *
 * @param {SidebarControlsProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let SidebarControls: React.FC<SidebarControlsProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    absoluteBreaks: absolute_breaks,
    activeFileName: active_file_name,
    activeLayerId: active_layer_id = null,
    appMode: app_mode,
    binningConfig: binning_config,
    bottomClearance: bottom_clearance,
    boundsMode: bounds_mode,
    cameraTilt: camera_tilt = 0,
    circleOverlayConfig: circle_overlay_config,
    colorPalette: color_palette,
    customVectorDataset: custom_vector_dataset,
    customVectorVisible: custom_vector_visible = true,
    dataFormat: data_format,
    diffNameA: diff_name_a,
    diffNameB: diff_name_b,
    heightmapConfig: heightmap_config,
    historicalBordersConfig: historical_borders_config,
    infoPanelOpen: info_panel_open,
    invertPalette: invert_palette,
    isMobile: is_mobile = false,
    layers = {},
    legendSubtitle: legend_subtitle = '',
    legendTitle: legend_title,
    logSigma: log_sigma,
    mapModes: map_modes = [],
    maxValOverride: max_val_override,
    minValOverride: min_val_override,
    onChangeUserRole: on_change_user_role,
    onClose: on_close,
    onFileUpload: on_file_upload,
    onOpenVideoExport: on_open_video_export,
    onRemoveCustomVector: on_remove_custom_vector,
    onToggleCustomVectorVisible: on_toggle_custom_vector_visible,
    onToggleInfoPanel: on_toggle_info_panel,
    onUploadCustomVector: on_upload_custom_vector,
    onWidthChange: on_width_change,
    opacity,
    percentileList: percentile_list,
    projection = 'Globe',
    scaleType: scale_type,
    selectedCountries: selected_countries,
    setAbsoluteBreaks: set_absolute_breaks,
    setAppMode: set_app_mode,
    setBinningConfig: set_binning_config,
    setBoundsMode: set_bounds_mode,
    setColorPalette: set_color_palette,
    setDataFormat: set_data_format,
    setInvertPalette: set_invert_palette,
    setLegendSubtitle: set_legend_subtitle,
    setLegendTitle: set_legend_title,
    setLogSigma: set_log_sigma,
    setMaxValOverride: set_max_val_override,
    setMinValOverride: set_min_val_override,
    setOpacity: set_opacity,
    setPercentileList: set_percentile_list,
    setScaleType: set_scale_type,
    stadesterConfig: stadester_config,
    topClearance: top_clearance,
    userRole: user_role = 'default',
    width,
  } = props

  let { formatString, t } = useLocalisation()
  let info_config = useInfoPanelConfig()

  //Declare local instance variables
  let active_descriptions: { id: string; markdown: string; title: string }[]
  let active_layer: ParsedDataLayer | null
  let binning_presets = [
    { h: 2160, label: 'Native (4320×2160)', w: 4320 },
    { h: 1080, label: '2× (2160×1080)', w: 2160 },
    { h: 540, label: '4× (1080×540)', w: 1080 },
    { h: 360, label: '6× (720×360)', w: 720 },
    { h: 180, label: '12× (360×180)', w: 360 },
  ]
  let current_width = (width !== undefined) ? width : 336
  let handle_resize_mouse_down: (arg0_e: React.MouseEvent) => void
  let is_full_width: boolean
  let is_sidebar_collapsed: boolean
  let open_folders: Record<string, boolean>
  let set_is_sidebar_collapsed: React.Dispatch<React.SetStateAction<boolean>>
  let set_open_folders: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  let set_viewport_width: React.Dispatch<React.SetStateAction<number>>
  let toggle_folder: (arg0_folder_key: string) => void
  let viewport_width: number

  //Function body
  ;[is_sidebar_collapsed, set_is_sidebar_collapsed] = useState<boolean>(false)
  ;[open_folders, set_open_folders] = useState<Record<string, boolean>>({
    binning: false,
    custom_vector: true,
    description: true,
    manual: false,
    visual: true,
  })
  ;[viewport_width, set_viewport_width] = useState<number>(() => {
    if (typeof window !== 'undefined')
      return window.innerWidth
    return 1024
  })

  useEffect(() => {
    let handle_resize = function () {
      set_viewport_width(window.innerWidth)
    }

    window.addEventListener('resize', handle_resize)
    return () => {
      window.removeEventListener('resize', handle_resize)
    }
  }, [set_viewport_width])

  is_full_width = is_mobile || (current_width >= viewport_width * 0.8)

  active_layer = useMemo(() => {
    if (!active_layer_id)
      return null
    if (layers && layers[active_layer_id])
      return layers[active_layer_id]
    if (active_layer_id.includes('.')) {
      let parent_id = active_layer_id.split('.')[0]
      let parent = layers ? layers[parent_id] : null
      if (parent && parent.sub_layers) {
        let sub = parent.sub_layers.find((arg0_sub: any) => arg0_sub.id === active_layer_id)
        if (sub)
          return sub
      }
    }
    return null
  }, [active_layer_id, layers])

  active_descriptions = useMemo(() => {
    let active_entries: { id: string; markdown: string; title: string }[] = []
    let added_ids = new Set<string>()

    //1. Active primary raster/vector layer
    if (active_layer && active_layer.id !== 'default_basemap' && active_layer.type !== 'vector.basemap' && active_layer.description) {
      let raw_md = (Array.isArray(active_layer.description)) ? active_layer.description.join('\n') : String(active_layer.description)
      active_entries.push({
        id: active_layer.id,
        markdown: raw_md,
        title: active_layer.name || active_layer.id,
      })
      added_ids.add(active_layer.id)
    }

    //2. Stadestér settlements overlay
    if (stadester_config?.enabled && layers?.['stadester']?.description) {
      let raw_md = (Array.isArray(layers['stadester'].description)) ? layers['stadester'].description.join('\n') : String(layers['stadester'].description)
      active_entries.push({
        id: 'stadester',
        markdown: raw_md,
        title: layers['stadester'].name || 'Stadestér (Cities)',
      })
      added_ids.add('stadester')
    }

    //3. Historical Borders overlay
    if (historical_borders_config?.enabled) {
      let border_dataset = historical_borders_config.dataset || 'statistical_borders'
      if (layers?.[border_dataset]?.description) {
        let raw_md = (Array.isArray(layers[border_dataset].description)) ? layers[border_dataset].description.join('\n') : String(layers[border_dataset].description)
        active_entries.push({
          id: border_dataset,
          markdown: raw_md,
          title: layers[border_dataset].name || 'Historical Borders',
        })
        added_ids.add(border_dataset)
      }
    }

    //4. Other active map modes
    if (map_modes && map_modes.length > 0) {
      for (let i = 0; i < map_modes.length; i++) {
        let mode = map_modes[i]
        if (mode.active && mode.id !== 'default' && !added_ids.has(mode.id)) {
          let desc = (mode as any).description || layers?.[mode.id]?.description
          if (desc) {
            let raw_md = (Array.isArray(desc)) ? desc.join('\n') : String(desc)
            active_entries.push({
              id: mode.id,
              markdown: raw_md,
              title: mode.label || layers?.[mode.id]?.name || mode.id,
            })
            added_ids.add(mode.id)
          }
        }
      }
    }

    //5. Fallback to default basemap if no other overlays or modes have descriptions
    if (active_entries.length === 0 && active_layer?.description) {
      let raw_md = (Array.isArray(active_layer.description)) ? active_layer.description.join('\n') : String(active_layer.description)
      active_entries.push({
        id: active_layer.id || 'default_basemap',
        markdown: raw_md,
        title: active_layer.name || 'Description',
      })
    }

    return active_entries
  }, [active_layer, historical_borders_config?.dataset, historical_borders_config?.enabled, layers, map_modes, stadester_config?.enabled])

  toggle_folder = function (arg0_folder_key: string) {
    let folder_key = arg0_folder_key
    set_open_folders((arg0_prev) => ({ ...arg0_prev, [folder_key]: !arg0_prev[folder_key] }))
  }

  //Right-border resize handler to adjust shared width
  handle_resize_mouse_down = function (arg0_e: React.MouseEvent) {
    let e = arg0_e
    e.preventDefault()
    e.stopPropagation()

    let start_w = current_width
    let start_x = e.clientX

    let on_mouse_move = function (arg0_move_event: MouseEvent) {
      let delta = arg0_move_event.clientX - start_x
      let next_w = Math.max(260, Math.min(window.innerWidth, start_w + delta))
      if (on_width_change)
        on_width_change(next_w)
    }

    let on_mouse_up = function () {
      window.removeEventListener('mousemove', on_mouse_move)
      window.removeEventListener('mouseup', on_mouse_up)
    }

    window.addEventListener('mousemove', on_mouse_move)
    window.addEventListener('mouseup', on_mouse_up)
  }

  //Return statement
  return (
    <>
      <div
        style={is_mobile ? {
          bottom: is_sidebar_collapsed ? 'auto' : '0px',
          left: '0px',
          maxWidth: '100vw',
          right: '0px',
          top: '48px',
          width: '100vw',
        } : is_full_width ? {
          bottom: is_sidebar_collapsed ? 'auto' : ((bottom_clearance !== undefined) ? `${bottom_clearance}px` : '12px'),
          left: '0px',
          maxWidth: '100vw',
          right: '0px',
          top: '0px',
          width: '100vw',
        } : {
          bottom: is_sidebar_collapsed ? 'auto' : ((bottom_clearance !== undefined) ? `${bottom_clearance}px` : '12px'),
          left: '12px',
          maxHeight: `calc(100dvh - ${((top_clearance !== undefined) ? top_clearance : 12) + (is_sidebar_collapsed ? 12 : ((bottom_clearance !== undefined) ? bottom_clearance : 12))}px)`,
          maxWidth: 'calc(100vw - 24px)',
          top: (top_clearance !== undefined) ? `${top_clearance}px` : '12px',
          width: `${current_width}px`,
        }}
        className={is_mobile
          ? `fixed left-0 z-50 flex flex-col bg-card/95 backdrop-blur-md ${is_sidebar_collapsed ? 'border-b' : ''} border-border text-card-foreground overflow-hidden select-none font-sans shadow-2xl transition-transform duration-200 ease-out pb-2 max-h-[calc(var(--app-height,100dvh)-48px)]`
          : is_full_width
          ? `fixed left-0 top-0 z-40 flex flex-col bg-card/95 backdrop-blur-md border-b ${is_sidebar_collapsed ? 'border-b' : ''} border-border text-card-foreground overflow-hidden select-none font-sans shadow-2xl transition-all duration-150 ease-out max-h-[100dvh]`
          : 'absolute left-3 z-20 flex flex-col bg-card/95 backdrop-blur-md border border-border text-card-foreground overflow-hidden select-none font-sans shadow-2xl transition-all duration-150 ease-out'
        }
      >
        {/* Draggable Right Border Resize Handle */}
        {!is_mobile && !is_sidebar_collapsed && (
          <div
            onMouseDown={handle_resize_mouse_down}
            className="absolute top-0 right-0 bottom-0 w-3 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-30 group"
            title="Drag right border to resize sidebar"
          >
            <div className="w-[2px] h-8 bg-border group-hover:bg-primary absolute top-1/2 -translate-y-1/2 right-0.5" />
          </div>
        )}

        {/* App Header / Mobile Info Header */}
        {is_mobile && info_panel_open ? (
          <div className="p-[var(--padding)] border-b border-border bg-card/80 shrink-0 flex items-center justify-between">
            <button
              type="button"
              onClick={on_toggle_info_panel}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors cursor-pointer px-1 py-0.5"
            >
              <Icon name="arrow_back" className="text-sm" />
              <span>Back</span>
            </button>
            <span
              className="font-bold text-foreground text-xs uppercase tracking-wider truncate max-w-[200px]"
              title={info_config.title || 'Information & Controls'}
            >
              {info_config.title || 'Information & Controls'}
            </span>
            <button
              type="button"
              onClick={on_close || on_toggle_info_panel}
              className="p-1 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Close"
            >
              <Icon name="close" className="text-sm" />
            </button>
          </div>
        ) : (
          <div className={`p-[var(--padding)] ${is_sidebar_collapsed ? '' : 'border-b border-border'} bg-card/60 shrink-0`}>
            <div className="flex items-center justify-between">
              <h1 className="text-[var(--header-font-size)] font-bold tracking-tight text-foreground flex items-center gap-2">
                <img
                  src="/gfx/interface/logos/confoederatio_icon_256x256.png"
                  alt="Confoederatio Icon"
                  className="w-8 h-8 object-contain"
                />
                <span className="text-xl tracking-[1px]">{t.app.title}</span>
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="text-[var(--body-font-size)] px-2 py-0.5 rounded-none bg-muted text-muted-foreground border border-border font-medium tracking-wider">
                  {t.app.badge}
                </span>
                <button
                  type="button"
                  onClick={() => set_is_sidebar_collapsed((arg0_prev) => !arg0_prev)}
                  className="p-1 rounded-none hover:bg-muted text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title={is_sidebar_collapsed ? t.sidebar.toolbar.expandSidebar : t.sidebar.toolbar.collapseSidebar}
                  aria-label={is_sidebar_collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                  <Icon name={is_sidebar_collapsed ? 'expand_less' : 'expand_more'} className="text-base" />
                </button>
                {is_mobile && on_close && (
                  <button
                    type="button"
                    onClick={on_close}
                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground touch-manipulation"
                    title="Close sidebar"
                    aria-label="Close sidebar"
                  >
                    <Icon name="close" size="1.25rem" />
                  </button>
                )}
              </div>
            </div>
          <MarkdownRenderer
            content={t.app.subtitle}
            className="text-[var(--body-font-size)] text-muted-foreground font-light mt-1 [&_p]:my-0 [&_p]:text-inherit [&_p]:font-light [&_p]:leading-snug"
          />

          {/* Toolbar: Information toggle, Role switcher, Video export */}
          <div className="mt-2.5 flex items-center justify-between gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={on_toggle_info_panel}
              className={`px-2 py-1 text-xs font-medium rounded-none border transition-colors cursor-pointer inline-flex items-center gap-1.5 ${info_panel_open
                ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-foreground border-border'
                }`}
              title={t.sidebar.toolbar.infoTooltip}
            >
              <Icon name="info" className={info_panel_open ? 'text-primary-foreground' : 'text-foreground'} />
              <span>{t.sidebar.toolbar.info}</span>
            </button>

            <div className="flex items-center gap-1">
              {/* Role Switcher or Public Locked Badge */}
              {isPublicBuild() ? (
                <div
                  className="h-6 text-[11px] bg-muted/40 border border-border px-2 flex items-center gap-1 text-muted-foreground select-none"
                  title={t.sidebar.toolbar.roles.lockedTooltip}
                >
                  <Icon name="lock" className="text-[10px] text-muted-foreground" />
                  <span>{t.sidebar.toolbar.roles.default}</span>
                </div>
              ) : (
                <Select
                  value={user_role}
                  onValueChange={(arg0_v) => on_change_user_role && on_change_user_role(arg0_v as UserRole)}
                >
                  <SelectTrigger className="h-6 text-[11px] rounded-none bg-muted/40 border-border px-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    {isRoleAllowed('default') && (
                      <SelectItem value="default" className="rounded-none text-xs">{t.sidebar.toolbar.roles.default}</SelectItem>
                    )}
                    {isRoleAllowed('privileged') && (
                      <SelectItem value="privileged" className="rounded-none text-xs">{t.sidebar.toolbar.roles.privileged}</SelectItem>
                    )}
                    {isRoleAllowed('developer') && (
                      <SelectItem value="developer" className="rounded-none text-xs">{t.sidebar.toolbar.roles.developer}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              )}

              {/* Developer Video Export Button */}
              {!isPublicBuild() && user_role === 'developer' && on_open_video_export && (
                <button
                  type="button"
                  onClick={on_open_video_export}
                  className="h-6 px-1.5 bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/40 text-[11px] font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                  title={t.sidebar.toolbar.videoTooltip}
                >
                  <Icon name="videocam" className="text-xs" />
                  <span>{t.sidebar.toolbar.video}</span>
                </button>
              )}
            </div>
          </div>
        </div>
        )}

      {/* Main Scrollable Controls */}
      {!is_sidebar_collapsed && (
        (is_mobile && info_panel_open) ? (
          <div className="flex-1 p-[var(--padding)] flex flex-col min-h-0 overflow-y-auto">
            <InfoFlyoutPanel
              isOpen={true}
              embedded={true}
              onClose={on_toggle_info_panel || (() => {})}
              mapModes={map_modes}
              heightmapConfig={heightmap_config || { enabled: false, elevationScale: 1 }}
              circleOverlayConfig={circle_overlay_config || { enabled: false, percentileCutoff: 99, baseRadius: 10, strokeWidth: 1, haloWidth: 1 }}
              selectedCountries={selected_countries || []}
              projection={projection}
              cameraTilt={camera_tilt}
            />
          </div>
        ) : (
          <div className="flex-1 p-[var(--padding)] space-y-[var(--padding)] overflow-y-auto">
        {/* ========================================================================= */}
        {/* SECTION 0: MAPMODE DESCRIPTION(S) */}
        {/* ========================================================================= */}
        {active_descriptions && active_descriptions.map((arg0_entry) => {
          let entry = arg0_entry
          let folder_key = (active_descriptions.length === 1) ? 'description' : `description_${entry.id}`
          let is_open = (open_folders[folder_key] !== undefined) ? open_folders[folder_key] : true
          let card_title = (active_descriptions.length === 1)
            ? t.sidebar.folders.description
            : `${t.sidebar.folders.description} (${entry.title})`

          return (
            <div key={entry.id} className="border border-border bg-card/50">
              <button
                type="button"
                onClick={() => toggle_folder(folder_key)}
                className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate">
                  <Icon name="description" className="shrink-0" />
                  <span className="truncate">{card_title}</span>
                </div>
                <Icon
                  name={is_open ? 'expand_less' : 'expand_more'}
                  className="shrink-0"
                />
              </button>

              {is_open && (
                <div className="p-[var(--padding)] text-[var(--body-font-size)] border-t border-border overflow-x-hidden">
                  <MarkdownRenderer content={entry.markdown} />
                </div>
              )}
            </div>
          )
        })}

        {/* ========================================================================= */}
        {/* SECTION 1: VISUALISATION SETTINGS */}
        {/* ========================================================================= */}
        <div className="border border-border bg-card/50">
          <button
            type="button"
            onClick={() => toggle_folder('visual')}
            className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Icon name="palette" />
              <span>{t.sidebar.folders.visualisation}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon
                name={open_folders.visual ? 'expand_less' : 'expand_more'}
              />
            </div>
          </button>

          {open_folders.visual && (
            <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
              {/* Scale Transformation */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.visualisation.scaleTransformation}</Label>
                <Select value={scale_type} onValueChange={(arg0_v) => set_scale_type(arg0_v as ScaleType)}>
                  <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="pseudo-log" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.pseudoLog}</SelectItem>
                    <SelectItem value="linear" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.linear}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Steepness (Sigma) */}
              {scale_type === 'pseudo-log' && (
                <div className="space-y-2 rounded-none border border-border p-[var(--padding)] bg-muted/20">
                  <div className="flex justify-between items-center text-[var(--body-font-size)]">
                    <Label className="text-muted-foreground text-[var(--body-font-size)] font-normal">
                      {t.sidebar.visualisation.logSigma}
                    </Label>
                    <NumberInput
                      value={log_sigma}
                      min={0.0001}
                      step={log_sigma >= 100 ? 5 : log_sigma >= 10 ? 1 : log_sigma >= 1 ? 0.1 : 0.01}
                      onChange={(arg0_val: any) => {
                        let parsed = parseFloat(arg0_val)
                        if (!Number.isNaN(parsed) && parsed > 0)
                          set_log_sigma(parsed)
                      }}
                      containerClassName="h-7 w-20 rounded-none text-[var(--body-font-size)]"
                    />
                  </div>

                  <Slider
                    value={[log_sigma]}
                    min={0.01}
                    max={Math.max(1000000, Math.ceil(log_sigma * 1.5))}
                    step={log_sigma >= 10000 ? 500 : log_sigma >= 100 ? 5 : log_sigma >= 10 ? 1 : log_sigma >= 1 ? 0.1 : 0.01}
                    onValueChange={(arg0_vals: number[]) => set_log_sigma(arg0_vals[0])}
                  />

                  {/* Preset buttons */}
                  <div className="flex items-center justify-between gap-1 pt-0.5 flex-wrap">
                    {[
                      { label: '0.1', value: 0.1 },
                      { label: '1', value: 1 },
                      { label: '10', value: 10 },
                      { label: '100', value: 100 },
                      { label: '1k', value: 1000 },
                      { label: '10k', value: 10000 },
                      { label: '100k', value: 100000 },
                      { label: '1M', value: 1000000 },
                    ].map((arg0_preset) => (
                      <button
                        key={arg0_preset.label}
                        type="button"
                        onClick={() => set_log_sigma(arg0_preset.value)}
                        className={`px-1 py-0.5 text-[10px] font-mono rounded-none border transition-colors cursor-pointer ${Math.abs(log_sigma - arg0_preset.value) < 0.001
                          ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                          : 'bg-background hover:bg-muted text-muted-foreground border-border'
                          }`}
                      >
                        {arg0_preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Colourscheme */}
              <D3ColorPaletteSelector
                value={color_palette}
                onChange={set_color_palette}
                invert={invert_palette}
                onInvertChange={set_invert_palette}
                showInvert={true}
              />

              {/* Visual Bounds Mode */}
              <div className="space-y-2">
                <Label className="text-[var(--body-font-size)] font-bold text-foreground">{t.sidebar.visualisation.manualRange}</Label>
                <Select value={bounds_mode} onValueChange={(arg0_v) => set_bounds_mode(arg0_v as BoundsMode)}>
                  <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="Manual" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.manualMinMax}</SelectItem>
                    <SelectItem value="Percentile" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.percentileBreaks}</SelectItem>
                    <SelectItem value="Absolute" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.absoluteBreaks}</SelectItem>
                  </SelectContent>
                </Select>

                {bounds_mode === 'Manual' && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div className="space-y-1">
                      <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.min}</span>
                      <NumberInput
                        placeholder={t.sidebar.visualisation.auto}
                        value={min_val_override}
                        step="any"
                        onChange={(arg0_val: any) => set_min_val_override(arg0_val)}
                        containerClassName="rounded-none h-7 text-[var(--body-font-size)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.max}</span>
                      <NumberInput
                        placeholder={t.sidebar.visualisation.auto}
                        value={max_val_override}
                        step="any"
                        onChange={(arg0_val: any) => set_max_val_override(arg0_val)}
                        containerClassName="rounded-none h-7 text-[var(--body-font-size)]"
                      />
                    </div>
                  </div>
                )}

                {bounds_mode === 'Percentile' && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.percentileBreaks}</span>
                    <Input
                      type="text"
                      value={percentile_list}
                      onChange={(arg0_e) => set_percentile_list(arg0_e.target.value)}
                      className="rounded-none h-7 text-[var(--body-font-size)]"
                    />
                  </div>
                )}

                {bounds_mode === 'Absolute' && (
                  <div className="space-y-1 pt-1">
                    <div className="flex justify-between items-center">
                      <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.absoluteBreaks}</span>
                      <button
                        type="button"
                        onClick={() => set_absolute_breaks('0, 10, 50, 100, 500, 1000')}
                        className="text-[var(--body-font-size)] text-primary hover:underline cursor-pointer"
                      >
                        {t.sidebar.visualisation.resetDefaults}
                      </button>
                    </div>
                    <Input
                      type="text"
                      placeholder="e.g. 0, 10, 50, 100, 500, 1000"
                      value={absolute_breaks}
                      onChange={(arg0_e) => set_absolute_breaks(arg0_e.target.value)}
                      className="rounded-none h-7 text-[var(--body-font-size)]"
                    />
                    <span className="text-[var(--body-font-size)] text-muted-foreground leading-tight block">
                      {t.sidebar.visualisation.absoluteBreaksDesc}
                    </span>
                  </div>
                )}
              </div>

              {/* Layer Opacity */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[var(--body-font-size)]">
                  <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.visualisation.opacity}</Label>
                  <span className="text-foreground font-bold text-[var(--body-font-size)]">
                    {Math.round(opacity * 100)}%
                  </span>
                </div>
                <Slider
                  value={[opacity * 100]}
                  min={10}
                  max={100}
                  step={1}
                  onValueChange={(arg0_vals: number[]) => set_opacity(arg0_vals[0] / 100)}
                />
              </div>

              {/* Legend Title (Supports line breaks) */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">
                    {t.sidebar.visualisation.legendTitle}
                  </Label>
                  <span className="text-[10px] text-muted-foreground/70 font-light">{t.sidebar.visualisation.supportsEnter}</span>
                </div>
                <textarea
                  value={legend_title}
                  onChange={(arg0_e) => set_legend_title(arg0_e.target.value)}
                  rows={2}
                  placeholder="e.g. Population Density&#10;(people per km²)"
                  className="w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-[var(--body-font-size)] text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-sans leading-tight"
                />
              </div>

              {/* Legend Subtitle */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">
                    {t.sidebar.visualisation.legendSubtitle}
                  </Label>
                  <span className="text-[10px] text-muted-foreground/70 font-light">{t.sidebar.visualisation.optional}</span>
                </div>
                <textarea
                  value={legend_subtitle}
                  onChange={(arg0_e) => {
                    if (set_legend_subtitle)
                      set_legend_subtitle(arg0_e.target.value)
                  }}
                  rows={1}
                  placeholder={t.sidebar.visualisation.subtitlePlaceholder}
                  className="w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-[var(--body-font-size)] text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-sans leading-tight"
                />
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 2: RESOLUTION & BINNING */}
        {/* ========================================================================= */}
        <div className="border border-border bg-card/50">
          <button
            type="button"
            onClick={() => toggle_folder('binning')}
            className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Icon name="grid_view" />
              <span>{t.sidebar.folders.binning}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {binning_config.enabled && (
                <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/40 font-medium">
                  {binning_config.width}×{binning_config.height}
                </span>
              )}
              <Icon
                name={open_folders.binning ? 'expand_less' : 'expand_more'}
              />
            </div>
          </button>

          {open_folders.binning && (
            <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.downsampleGrid}</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={binning_config.enabled}
                    onChange={(arg0_e) =>
                      set_binning_config((arg0_prev) => ({ ...arg0_prev, enabled: arg0_e.target.checked }))
                    }
                    className="w-3.5 h-3.5 rounded-none accent-emerald-500 cursor-pointer"
                  />
                  <span
                    className={`text-xs font-bold uppercase ${binning_config.enabled ? 'text-emerald-400 font-bold' : 'text-muted-foreground'
                      }`}
                  >
                    {binning_config.enabled ? t.sidebar.binning.on : t.sidebar.binning.off}
                  </span>
                </label>
              </div>

              {binning_config.enabled && (
                <div className="space-y-2 pt-1 border-t border-border/60">
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="space-y-1">
                      <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.width}</span>
                      <NumberInput
                        value={binning_config.width}
                        min={60}
                        max={4320}
                        step={60}
                        onChange={(arg0_val: any) => {
                          let parsed = parseInt(arg0_val, 10)
                          if (parsed > 0)
                            set_binning_config((arg0_prev) => ({ ...arg0_prev, width: parsed }))
                        }}
                        containerClassName="h-7 rounded-none text-[var(--body-font-size)]"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.height}</span>
                      <NumberInput
                        value={binning_config.height}
                        min={30}
                        max={2160}
                        step={30}
                        onChange={(arg0_val: any) => {
                          let parsed = parseInt(arg0_val, 10)
                          if (parsed > 0)
                            set_binning_config((arg0_prev) => ({ ...arg0_prev, height: parsed }))
                        }}
                        containerClassName="h-7 rounded-none text-[var(--body-font-size)]"
                      />
                    </div>
                  </div>

                  {/* Presets */}
                  <div className="space-y-1">
                    <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.presets}</span>
                    <div className="grid grid-cols-3 gap-1">
                      {binning_presets.slice(1).map((arg0_preset) => (
                        <button
                          key={arg0_preset.label}
                          type="button"
                          onClick={() =>
                            set_binning_config((arg0_prev) => ({
                              ...arg0_prev,
                              height: arg0_preset.h,
                              width: arg0_preset.w,
                            }))
                          }
                          className={`px-1.5 py-1 text-[var(--body-font-size)] border rounded-none text-center truncate transition-colors cursor-pointer ${binning_config.width === arg0_preset.w && binning_config.height === arg0_preset.h
                            ? 'bg-primary text-primary-foreground border-primary font-bold'
                            : 'bg-background hover:bg-muted text-muted-foreground border-border'
                            }`}
                        >
                          {arg0_preset.w}×{arg0_preset.h}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Method */}
                  <div className="space-y-1">
                    <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.downsampleMethod}</span>
                    <Select
                      value={binning_config.method}
                      onValueChange={(arg0_v) =>
                        set_binning_config((arg0_prev) => ({
                          ...arg0_prev,
                          method: arg0_v as DownsampleMethod,
                        }))
                      }
                    >
                      <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-none">
                        <SelectItem value="average" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodAverage}</SelectItem>
                        <SelectItem value="minimum" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodMinimum}</SelectItem>
                        <SelectItem value="maximum" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodMaximum}</SelectItem>
                        <SelectItem value="near" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodNear}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 3: MANUAL FILE PREVIEW */}
        {/* ========================================================================= */}
        <div className="border border-border bg-card/50">
          <button
            type="button"
            onClick={() => toggle_folder('manual')}
            className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Icon name="upload_file" />
              <span>{t.sidebar.folders.manualUpload}</span>
            </div>
            <Icon
              name={open_folders.manual ? 'expand_less' : 'expand_more'}
            />
          </button>

          {open_folders.manual && (
            <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
              {/* Mode Selector */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.mode}</Label>
                <div className="grid grid-cols-2 gap-1 bg-muted/50 p-0.5 border border-border">
                  <button
                    type="button"
                    onClick={() => set_app_mode('Single Image')}
                    className={`h-7 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${app_mode === 'Single Image'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <Icon name="image" className="text-xs" />
                    <span>{t.sidebar.upload.single}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => set_app_mode('Image Difference')}
                    className={`h-7 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${app_mode === 'Image Difference'
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    <Icon name="compare_arrows" className="text-xs" />
                    <span>{t.sidebar.upload.difference}</span>
                  </button>
                </div>
              </div>

              {/* File Inputs */}
              {app_mode === 'Single Image' ? (
                <div className="space-y-1">
                  <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.selectSingle}</Label>
                  <input
                    type="file"
                    accept=".png"
                    id="single-file-upload"
                    className="hidden"
                    onClick={(arg0_e) => {
                      ; (arg0_e.target as HTMLInputElement).value = ''
                    }}
                    onChange={(arg0_e) => {
                      let file = arg0_e.target.files?.[0]
                      if (file)
                        on_file_upload(file, 'single')
                      arg0_e.target.value = ''
                    }}
                  />
                  <label
                    htmlFor="single-file-upload"
                    className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                  >
                    <span className="truncate text-[var(--body-font-size)]">
                      {active_file_name || t.sidebar.upload.singlePlaceholder}
                    </span>
                    <Icon name="folder_open" className="text-muted-foreground shrink-0 ml-1" />
                  </label>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.firstImage}</Label>
                    <input
                      type="file"
                      accept=".png"
                      id="diff-file-a"
                      className="hidden"
                      onClick={(arg0_e) => {
                        ; (arg0_e.target as HTMLInputElement).value = ''
                      }}
                      onChange={(arg0_e) => {
                        let file = arg0_e.target.files?.[0]
                        if (file)
                          on_file_upload(file, 'diff_a')
                        arg0_e.target.value = ''
                      }}
                    />
                    <label
                      htmlFor="diff-file-a"
                      className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <span className="truncate text-[var(--body-font-size)]">{diff_name_a || t.sidebar.upload.firstPlaceholder}</span>
                      <Icon name="file_upload" className="text-muted-foreground shrink-0 ml-1" />
                    </label>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.secondImage}</Label>
                    <input
                      type="file"
                      accept=".png"
                      id="diff-file-b"
                      className="hidden"
                      onClick={(arg0_e) => {
                        ; (arg0_e.target as HTMLInputElement).value = ''
                      }}
                      onChange={(arg0_e) => {
                        let file = arg0_e.target.files?.[0]
                        if (file)
                          on_file_upload(file, 'diff_b')
                        arg0_e.target.value = ''
                      }}
                    />
                    <label
                      htmlFor="diff-file-b"
                      className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                    >
                      <span className="truncate text-[var(--body-font-size)]">{diff_name_b || t.sidebar.upload.secondPlaceholder}</span>
                      <Icon name="file_upload" className="text-muted-foreground shrink-0 ml-1" />
                    </label>
                  </div>
                </div>
              )}

              {/* Encoding Format */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.upload.encodingFormat}</Label>
                <Select value={data_format} onValueChange={(arg0_v) => set_data_format(arg0_v as DataFormat)}>
                  <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="float32" className="rounded-none text-[var(--body-font-size)]">float32 (IEEE 754)</SelectItem>
                    <SelectItem value="int32" className="rounded-none text-[var(--body-font-size)]">int32 (Signed Integer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* SECTION 4: CUSTOM VECTOR BOUNDARIES (.naissance / .geojson) */}
        {/* ========================================================================= */}
        <div className="border border-border bg-card/50">
          <button
            type="button"
            onClick={() => toggle_folder('custom_vector')}
            className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Icon name="layers" />
              <span>{t.sidebar.folders.customVector}</span>
            </div>
            <div className="flex items-center gap-1.5">
              {custom_vector_dataset && (
                <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/40 font-medium uppercase">
                  {custom_vector_dataset.fileType}
                </span>
              )}
              <Icon
                name={open_folders.custom_vector ? 'expand_less' : 'expand_more'}
              />
            </div>
          </button>

          {open_folders.custom_vector && (
            <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
              <p className="text-xs text-muted-foreground leading-normal">
                {t.sidebar.vectorUpload.description}
              </p>

              {/* Upload Input */}
              <div className="space-y-1">
                <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">
                  {t.sidebar.vectorUpload.selectFile}
                </Label>
                <input
                  type="file"
                  accept=".geojson,.naissance,.json"
                  id="custom-vector-file-upload"
                  className="hidden"
                  onClick={(arg0_e) => {
                    ;(arg0_e.target as HTMLInputElement).value = ''
                  }}
                  onChange={(arg0_e) => {
                    let file = arg0_e.target.files?.[0]
                    if (file && on_upload_custom_vector)
                      on_upload_custom_vector(file)
                    arg0_e.target.value = ''
                  }}
                />
                <label
                  htmlFor="custom-vector-file-upload"
                  className="flex items-center justify-between w-full h-8 px-2 border border-input rounded-none bg-background text-foreground hover:bg-muted/40 cursor-pointer transition-colors"
                >
                  <span className="truncate text-[var(--body-font-size)]">
                    {custom_vector_dataset?.fileName || t.sidebar.vectorUpload.placeholder}
                  </span>
                  <Icon name="upload_file" className="text-muted-foreground shrink-0 ml-1" />
                </label>
              </div>

              {/* Dataset Details & Toggles */}
              {custom_vector_dataset && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">
                      {custom_vector_dataset.fileType === 'naissance'
                        ? t.sidebar.vectorUpload.temporalNaissance
                        : t.sidebar.vectorUpload.staticGeoJson}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {formatString(t.sidebar.vectorUpload.entitiesCount, custom_vector_dataset.totalCount)}
                    </span>
                  </div>

                  {custom_vector_dataset.fileType === 'naissance' && (
                    <p className="text-[10px] text-muted-foreground/90 italic leading-snug">
                      {t.sidebar.vectorUpload.temporalDynamicNote}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[var(--body-font-size)] text-muted-foreground">
                      {t.sidebar.vectorUpload.showLayer}
                    </span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={custom_vector_visible}
                        onChange={(arg0_e) => {
                          if (on_toggle_custom_vector_visible)
                            on_toggle_custom_vector_visible(arg0_e.target.checked)
                        }}
                        className="w-3.5 h-3.5 rounded-none accent-emerald-500 cursor-pointer"
                      />
                      <span
                        className={`text-xs font-bold uppercase ${
                          custom_vector_visible ? 'text-emerald-400 font-bold' : 'text-muted-foreground'
                        }`}
                      >
                        {custom_vector_visible ? t.sidebar.binning.on : t.sidebar.binning.off}
                      </span>
                    </label>
                  </div>

                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        if (on_remove_custom_vector)
                          on_remove_custom_vector()
                      }}
                      className="w-full h-7 px-2 text-xs font-medium border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                    >
                      <Icon name="delete" className="text-xs" />
                      <span>{t.sidebar.vectorUpload.removeVector}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
        )
    )}
  </div>
</>
  )
}

export default SidebarControls
