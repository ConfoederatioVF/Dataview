import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AppMode,
  BinningConfig,
  BoundsMode,
  CircleOverlayConfig,
  ColorPalette,
  DataFormat,
  HeightmapConfig,
  HistoricalBordersConfig,
  MapModeId,
  MapModeItem,
  ProjectionType,
  ScaleType,
  StadesterConfig,
} from '@framework/geopng/types.ts'
import { CountryFeature } from '@framework/geopng/polygon_binning'
import { CustomVectorDataset } from '@framework/geopng/custom_vector_service.ts'
import { Icon } from '@ui/components/icon'
import { useInfoPanelConfig, UserRole } from '@common'
import { useLocalisation } from '@localisation'
import { ParsedDataLayer } from '@server/layer_parser'
import { MarkdownRenderer } from '@ui/components/markdown_renderer'
import { InfoFlyoutPanel } from '@ui/topbar/info_flyout_panel'
import { SidebarBinningSection } from './sidebar_binning_section'
import { SidebarHeader } from './sidebar_header'
import { SidebarManualUploadSection } from './sidebar_manual_upload_section'
import { SidebarVisualisationSection } from './sidebar_visualisation_section'

export interface SidebarControlsProps {
  absoluteBreaks: string
  activeFileName?: string
  activeLayerId?: string | null
  activeVariableSelectors?: Record<string, string | string[]>
  appMode: AppMode
  binningConfig: BinningConfig
  bottomClearance?: number
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
  isLoadingLayers?: boolean
  isMobile?: boolean
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
  topClearance?: number
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

  //Declare local instance variables
  let absolute_breaks = props.absoluteBreaks
  let active_file_name = props.activeFileName
  let active_layer_id = props.activeLayerId
  let active_variable_selectors = props.activeVariableSelectors
  let app_mode = props.appMode
  let binning_config = props.binningConfig
  let bottom_clearance = props.bottomClearance
  let bounds_mode = props.boundsMode
  let camera_tilt = props.cameraTilt
  let circle_overlay_config = props.circleOverlayConfig
  let color_palette = props.colorPalette
  let custom_vector_dataset = props.customVectorDataset
  let custom_vector_visible = props.customVectorVisible
  let data_format = props.dataFormat
  let diff_name_a = props.diffNameA
  let diff_name_b = props.diffNameB
  let heightmap_config = props.heightmapConfig
  let historical_borders_config = props.historicalBordersConfig
  let info_config = useInfoPanelConfig()
  let info_panel_open = props.infoPanelOpen
  let invert_palette = props.invertPalette
  let is_loading_layers = props.isLoadingLayers
  let is_mobile = props.isMobile
  let layers = props.layers
  let legend_subtitle = props.legendSubtitle
  let legend_title = props.legendTitle
  let log_sigma = props.logSigma
  let map_modes = props.mapModes
  let max_val_override = props.maxValOverride
  let min_val_override = props.minValOverride
  let on_change_user_role = props.onChangeUserRole
  let on_change_variable_selector = props.onChangeVariableSelector
  let on_close = props.onClose
  let on_file_upload = props.onFileUpload
  let on_open_video_export = props.onOpenVideoExport
  let on_remove_custom_vector = props.onRemoveCustomVector
  let on_select_layer = props.onSelectLayer
  let on_toggle_custom_vector_visible = props.onToggleCustomVectorVisible
  let on_toggle_info_panel = props.onToggleInfoPanel
  let on_toggle_map_mode = props.onToggleMapMode
  let on_upload_custom_vector = props.onUploadCustomVector
  let on_width_change = props.onWidthChange
  let opacity = props.opacity
  let percentile_list = props.percentileList
  let projection = props.projection
  let scale_type = props.scaleType
  let selected_countries = props.selectedCountries
  let set_absolute_breaks = props.setAbsoluteBreaks
  let set_app_mode = props.setAppMode
  let set_binning_config = props.setBinningConfig
  let set_bounds_mode = props.setBoundsMode
  let set_color_palette = props.setColorPalette
  let set_data_format = props.setDataFormat
  let set_invert_palette = props.setInvertPalette
  let set_legend_subtitle = props.setLegendSubtitle
  let set_legend_title = props.setLegendTitle
  let set_log_sigma = props.setLogSigma
  let set_max_val_override = props.setMaxValOverride
  let set_min_val_override = props.setMinValOverride
  let set_opacity = props.setOpacity
  let set_percentile_list = props.setPercentileList
  let set_scale_type = props.setScaleType
  let stadester_config = props.stadesterConfig
  let top_clearance = props.topClearance
  let user_role = props.userRole
  let width = props.width

  let [current_width, set_current_width] = useState<number>(width || 384)
  let is_full_width = !is_mobile && current_width >= (typeof window !== 'undefined' ? window.innerWidth - 30 : 2500)
  let [is_sidebar_collapsed, set_is_sidebar_collapsed] = useState<boolean>(false)
  let [open_folders, set_open_folders] = useState<Record<string, boolean>>({
    binning: false,
    description: true,
    manual: false,
    visual: false,
  })
  let scroll_container_ref = useRef<HTMLDivElement>(null)
  let { t } = useLocalisation()

  //Function body
  let active_layer = useMemo(() => {
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

  let active_descriptions = useMemo(() => {
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
      let border_dataset = historical_borders_config.dataset || 'dejure_borders'
      let border_layer = layers?.[border_dataset] ||
        ((border_dataset === 'dejure_borders' || border_dataset === 'statistical_borders' || border_dataset === 'simplified_borders')
          ? (layers?.['dejure_borders'] || layers?.['simplified_borders'] || layers?.['statistical_borders'])
          : (layers?.['defacto_borders'] || layers?.['detailed_borders']))
      if (border_layer?.description) {
        let raw_md = (Array.isArray(border_layer.description)) ? border_layer.description.join('\n') : String(border_layer.description)
        active_entries.push({
          id: border_dataset,
          markdown: raw_md,
          title: border_layer.name || 'Historical Borders',
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

  let toggle_folder = function (arg0_folder: string) {
    set_open_folders((arg0_prev) => ({
      ...arg0_prev,
      [arg0_folder]: !arg0_prev[arg0_folder],
    }))
  }

  //Right-border resize handler to adjust shared width
  let handle_resize_mouse_down = function (arg0_e: React.MouseEvent) {
    arg0_e.preventDefault()
    let start_x = arg0_e.clientX
    let start_width = current_width

    let on_mouse_move = function (arg1_move_e: MouseEvent) {
      let max_allowed = window.innerWidth - 24
      let new_width = Math.min(Math.max(280, start_width + (arg1_move_e.clientX - start_x)), max_allowed)
      if (new_width >= max_allowed - 25)
        new_width = window.innerWidth

      set_current_width(new_width)
      if (on_width_change)
        on_width_change(new_width)
    }

    let on_mouse_up = function () {
      window.removeEventListener('mousemove', on_mouse_move)
      window.removeEventListener('mouseup', on_mouse_up)
    }

    window.addEventListener('mousemove', on_mouse_move)
    window.addEventListener('mouseup', on_mouse_up)
  }

  useEffect(() => {
    if (width !== undefined && width !== current_width)
      set_current_width(width)
  }, [width])

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
            onWheel={(arg0_e) => {
              if (scroll_container_ref.current)
                scroll_container_ref.current.scrollTop += arg0_e.deltaY
            }}
            className="absolute top-0 right-0 bottom-0 w-2.5 cursor-col-resize hover:bg-primary/50 active:bg-primary transition-colors z-30 group"
            title="Drag right border to resize sidebar"
          >
            <div className="w-[2px] h-8 bg-border group-hover:bg-primary absolute top-1/2 -translate-y-1/2 right-0.5" />
          </div>
        )}

        {/* Top Header & Toolbar */}
        <SidebarHeader
          infoConfig={info_config}
          infoPanelOpen={info_panel_open}
          isMobile={is_mobile}
          isSidebarCollapsed={is_sidebar_collapsed}
          onChangeUserRole={on_change_user_role}
          onClose={on_close}
          onOpenVideoExport={on_open_video_export}
          onToggleInfoPanel={on_toggle_info_panel}
          setIsSidebarCollapsed={set_is_sidebar_collapsed}
          t={t}
          userRole={user_role}
        />

        {/* Main Scrollable Controls */}
        {!is_sidebar_collapsed && (
          (is_mobile && info_panel_open) ? (
            <div className="flex-1 p-[var(--padding)] flex flex-col min-h-0 overflow-y-auto">
              <InfoFlyoutPanel
                isOpen={true}
                isMobile={is_mobile}
                embedded={true}
                onClose={on_toggle_info_panel || (() => {})}
                mapModes={map_modes}
                heightmapConfig={heightmap_config || { elevationScale: 1, enabled: false }}
                circleOverlayConfig={circle_overlay_config || { baseRadius: 10, enabled: false, haloWidth: 1, percentileCutoff: 99, strokeWidth: 1 }}
                selectedCountries={selected_countries || []}
                projection={projection}
                cameraTilt={camera_tilt}
              />
            </div>
          ) : (
            <div
              ref={scroll_container_ref}
              className="flex-1 p-[var(--padding)] space-y-[var(--padding)] overflow-y-auto mr-2.5 custom-scrollbar"
            >
              {/* SECTION 0: MAPMODE DESCRIPTION(S) */}
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

              {/* SECTION 1: VISUALISATION SETTINGS */}
              <SidebarVisualisationSection
                absoluteBreaks={absolute_breaks}
                boundsMode={bounds_mode}
                colorPalette={color_palette}
                invertPalette={invert_palette}
                isOpen={open_folders.visual}
                legendSubtitle={legend_subtitle}
                legendTitle={legend_title}
                logSigma={log_sigma}
                maxValOverride={max_val_override}
                minValOverride={min_val_override}
                onToggle={() => toggle_folder('visual')}
                opacity={opacity}
                percentileList={percentile_list}
                scaleType={scale_type}
                setAbsoluteBreaks={set_absolute_breaks}
                setBoundsMode={set_bounds_mode}
                setColorPalette={set_color_palette}
                setInvertPalette={set_invert_palette}
                setLegendSubtitle={set_legend_subtitle}
                setLegendTitle={set_legend_title}
                setLogSigma={set_log_sigma}
                setMaxValOverride={set_max_val_override}
                setMinValOverride={set_min_val_override}
                setOpacity={set_opacity}
                setPercentileList={set_percentile_list}
                setScaleType={set_scale_type}
                t={t}
              />

              {/* SECTION 2: RESOLUTION & BINNING */}
              <SidebarBinningSection
                binningConfig={binning_config}
                isOpen={open_folders.binning}
                onToggle={() => toggle_folder('binning')}
                setBinningConfig={set_binning_config}
                t={t}
              />

              {/* SECTION 3: MANUAL FILE UPLOAD */}
              <SidebarManualUploadSection
                activeFileName={active_file_name}
                appMode={app_mode}
                customVectorDataset={custom_vector_dataset}
                customVectorVisible={custom_vector_visible}
                dataFormat={data_format}
                diffNameA={diff_name_a}
                diffNameB={diff_name_b}
                isOpen={open_folders.manual}
                onFileUpload={on_file_upload}
                onRemoveCustomVector={on_remove_custom_vector}
                onToggle={() => toggle_folder('manual')}
                onToggleCustomVectorVisible={on_toggle_custom_vector_visible}
                onUploadCustomVector={on_upload_custom_vector}
                setAppMode={set_app_mode}
                setDataFormat={set_data_format}
                t={t}
              />
            </div>
          )
        )}
      </div>
    </>
  )
}

export default SidebarControls
