import React, { useState } from 'react'
import {
  MapModeItem,
  HeightmapConfig,
  CircleOverlayConfig,
  ProjectionType,
} from '@framework/geopng/types.ts'
import { CountryFeature } from '@framework/geopng/polygon_binning'
import { Icon } from '@ui/components/icon'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@ui/components/tabs'
import { MarkdownRenderer } from '@ui/components/markdown_renderer'
import { Window } from '@ui/components/window'
import { useInfoPanelConfig, useMapmodesConfig, MarkdownSectionItem } from '@common'
import { useLocalisation } from '@localisation'

export interface InfoCollapsibleSectionProps {
  idx: number
  sec: MarkdownSectionItem
}

/**
 * Collapsible accordion section inside the information flyout panel.
 *
 * @param {InfoCollapsibleSectionProps} arg0_props
 * @returns {React.ReactElement}
 */
export let InfoCollapsibleSection: React.FC<InfoCollapsibleSectionProps> = function (arg0_props: InfoCollapsibleSectionProps) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as InfoCollapsibleSectionProps)

  //Declare local instance variables
  let content = props.sec.content || props.sec.text
  let is_open: boolean
  let sec = props.sec
  let set_is_open: React.Dispatch<React.SetStateAction<boolean>>
  let title = props.sec.title || props.sec.heading || props.sec.summary

  //Function body
  let [open_state, set_open_state] = useState<boolean>(() => {
    if (sec.open !== undefined)
      return Boolean(sec.open)
    if (sec.defaultOpen !== undefined)
      return Boolean(sec.defaultOpen)
    return true
  })
  is_open = open_state
  set_is_open = set_open_state

  //Return statement
  return (
    <details
      open={is_open}
      onToggle={(e) => set_is_open(e.currentTarget.open)}
      className="group border border-border bg-background/60 rounded-none transition-colors"
    >
      <summary className="cursor-pointer font-bold text-foreground text-[var(--body-font-size)] p-2 flex items-center justify-between hover:bg-muted/40 transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <Icon
            name="chevron_right"
            className="transition-transform duration-200 group-open:rotate-90 text-primary shrink-0"
          />
          <span>{title}</span>
        </span>
      </summary>
      <div className="p-2.5 pt-1 border-t border-border/40 text-[var(--body-font-size)]">
        <MarkdownRenderer content={content} />
      </div>
    </details>
  )
}

export interface InfoFlyoutPanelProps {
  cameraTilt?: number
  circleOverlayConfig: CircleOverlayConfig
  className?: string
  defaultPinned?: boolean
  embedded?: boolean
  heightmapConfig: HeightmapConfig
  isOpen: boolean
  isPinned?: boolean
  mapModes: MapModeItem[]
  onClose: () => void
  onTogglePin?: (pinned: boolean) => void
  projection: ProjectionType
  selectedCountries: CountryFeature[]
  width?: number
}

/**
 * Information and active modes control flyout window.
 *
 * @param {InfoFlyoutPanelProps} arg0_props
 * @returns {React.ReactElement|null}
 */
export let InfoFlyoutPanel: React.FC<InfoFlyoutPanelProps> = function (arg0_props: InfoFlyoutPanelProps) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as InfoFlyoutPanelProps)

  //Declare local instance variables
  let active_modes_array: MapModeItem[]
  let active_tab: string
  let camera_tilt = props.cameraTilt ?? 0
  let circle_overlay_config = props.circleOverlayConfig
  let class_name = props.className
  let default_pinned = props.defaultPinned ?? true
  let embedded = Boolean(props.embedded)
  let heightmap_config = props.heightmapConfig
  let is_open = props.isOpen
  let is_pinned = props.isPinned
  let localisation: ReturnType<typeof useLocalisation>
  let map_modes = props.mapModes
  let on_close = props.onClose
  let on_toggle_pin = props.onTogglePin
  let projection = props.projection
  let selected_countries = props.selectedCountries
  let set_active_tab: React.Dispatch<React.SetStateAction<string>>
  let t: ReturnType<typeof useLocalisation>['t']
  let tabs_element: React.ReactElement
  let width = props.width ?? 336

  //Function body
  let info_config = useInfoPanelConfig()
  let mapmodes_config = useMapmodesConfig()
  localisation = useLocalisation()
  t = localisation.t

  let [current_tab, set_current_tab] = useState<string>(
    info_config.defaultTab || info_config.tabs[0]?.id || 'controls'
  )
  active_tab = current_tab
  set_active_tab = set_current_tab

  //Guard clauses
  if (!is_open)
    return null

  active_modes_array = map_modes.filter((m) => m.active)

  tabs_element = (
    <Tabs
      value={active_tab}
      onValueChange={set_active_tab}
      className="flex flex-col flex-1 min-h-0 overflow-hidden"
    >
        <TabsList className="w-full flex h-8 bg-muted/60 border border-border rounded-none p-0.5 shrink-0">
          {info_config.tabs.map((tab) => (
            <TabsTrigger
              key={tab.id}
              value={tab.id}
              className="flex-1 text-[var(--body-font-size)] h-full flex items-center justify-center gap-1.5 rounded-none font-medium data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:font-bold transition-colors cursor-pointer truncate"
            >
              {tab.icon && <Icon name={tab.icon} size={14} className="shrink-0 text-white" />}
              <span className="truncate">{tab.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Tab Contents Scroll Area with Prominent Vertical Scrollbar */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-3 pr-2 space-y-3 custom-scrollbar">
          {info_config.tabs.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="m-0 focus-visible:outline-none space-y-3"
            >
              {(tab.type === 'controls') ? (
                /* TAB 1: CONTROLS & ACTIVE MODES */
                <div className="space-y-3">
                  {/* Live Active Modes Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground text-[var(--body-font-size)] uppercase tracking-wider flex items-center gap-1.5">
                        <Icon name="layers" size={14} className="text-white" />
                        <span>{t.infoPanel.activeRenderingModes}</span>
                      </span>
                      <span className="text-[var(--body-font-size)] px-2 py-0.5 bg-primary/20 text-primary border border-primary/40 font-semibold leading-none flex items-center">
                        {localisation.format(t.infoPanel.activeCount, active_modes_array.length)}
                      </span>
                    </div>

                    <div className="space-y-1.5 bg-background/60 p-2 border border-border">
                      {(active_modes_array.length === 0) ? (
                        <p className="text-muted-foreground text-[var(--body-font-size)] italic">
                          {t.infoPanel.noActiveMapmodes}
                        </p>
                      ) : (
                        active_modes_array.map((m) => {
                          let config_item = mapmodes_config.modes.find((c) => c.id === m.id)
                          let desc =
                            config_item?.controlDescription ||
                            config_item?.description ||
                            'Active layer'

                          if (m.id === 'country_analysis') {
                            let count = selected_countries.length
                            desc = (count > 0)
                              ? `${count} ${(count === 1) ? 'country' : 'countries'} isolated`
                              : config_item?.controlDescription || 'Active (select country)'
                          } else if (m.id === 'spike_map') {
                            let mode_str =
                              (heightmap_config.heightScaleMode === 'percentile')
                                ? ' • % height'
                                : (heightmap_config.heightScaleMode === 'blend')
                                  ? ` • blend (${Math.round((heightmap_config.blendWeight ?? 0.5) * 100)}%)`
                                  : ' • linear height'
                            let pct_str = (heightmap_config.opacityByPercentile) ? ' (pct opacity)' : ''
                            let res_str = (heightmap_config.resolutionArcmin) ? ` • ${heightmap_config.resolutionArcmin}' res` : ''
                            desc = `${Math.round(
                              (heightmap_config.elevationScale ?? 800000) / 1000
                            )}km peak • ${Math.round((heightmap_config.opacity ?? 0.9) * 100)}% opacity${pct_str}${mode_str}${res_str}`
                          } else if (m.id === 'circle_sizing') {
                            desc = `≥P${circle_overlay_config.percentileCutoff ?? 99} cutoff • ${(
                              circle_overlay_config.baseRadius ?? 1.0
                            ).toFixed(1)} ha/unit`
                          }

                          return (
                            <div
                              key={m.id}
                              className="flex items-center justify-between gap-2 text-[var(--body-font-size)] leading-snug"
                            >
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="w-1.5 h-1.5 bg-primary rounded-none" />
                                <span className="font-semibold text-foreground">{m.label}:</span>
                              </div>
                              <span className="text-muted-foreground text-right text-[var(--body-font-size)]">
                                {desc}
                              </span>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* Camera & Projection State */}
                  <div className="flex items-center justify-between p-2 bg-background/40 border border-border text-[var(--body-font-size)]">
                    <span className="text-muted-foreground">{t.infoPanel.projection}: <strong className="text-foreground">{projection}</strong></span>
                    <span className="text-muted-foreground">{t.infoPanel.tilt}: <strong className="text-foreground">{Math.round(camera_tilt)}°</strong></span>
                  </div>

                  {/* Navigation Shortcuts Section */}
                  <div className="space-y-1.5">
                    <span className="font-bold text-foreground text-[var(--body-font-size)] uppercase tracking-wider block">
                      {tab.shortcutsHeader || t.infoPanel.navigationShortcuts}
                    </span>

                    <div className="space-y-1 bg-background/60 p-2 border border-border">
                      {(tab.shortcuts || []).map((sc, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 py-1.5 border-b border-border/40 last:border-0 text-[var(--body-font-size)]"
                        >
                          <kbd className="inline-flex items-center justify-center px-2 py-0.5 bg-muted text-foreground border border-border text-[var(--body-font-size)] font-mono font-semibold shadow-sm shrink-0 leading-normal">
                            {sc.key}
                          </kbd>
                          <span className="text-muted-foreground text-right text-[var(--body-font-size)] leading-normal">
                            {sc.action}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2+: CUSTOM CONTENT */
                <div className="space-y-3 text-[var(--body-font-size)]">
                  {(() => {
                    let data = tab.markdown || tab.content
                    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
                      return (
                        <div className="space-y-2">
                          {(data as MarkdownSectionItem[]).map((sec, idx) => (
                            <InfoCollapsibleSection key={idx} idx={idx} sec={sec} />
                          ))}
                        </div>
                      )
                    } else if (data) {
                      return (
                        <div className="p-3 bg-background/60 border border-border">
                          <MarkdownRenderer content={data as any} />
                        </div>
                      )
                    } else if (tab.sections && tab.sections.length > 0) {
                      return (
                        <div className="space-y-2">
                          {tab.title && (
                            <div className="font-bold text-foreground text-[var(--header-font-size)] mb-2">
                              {tab.title}
                            </div>
                          )}
                          {tab.sections.map((sec, idx) => (
                            <div
                              key={idx}
                              className="p-2.5 bg-background/60 border border-border space-y-1"
                            >
                              <h3 className="font-bold text-foreground text-[var(--body-font-size)]">
                                {sec.heading}
                              </h3>
                              <p className="text-muted-foreground font-light leading-relaxed text-[var(--body-font-size)]">
                                {sec.text}
                              </p>
                            </div>
                          ))}
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
  )

  if (embedded) {
    return (
      <div className={`flex flex-col flex-1 min-h-0 w-full ${class_name || ''}`}>
        {tabs_element}
      </div>
    )
  }

  //Return statement
  return (
    <Window
      id="info-and-controls"
      title={info_config.title || 'Information & Controls'}
      icon="info"
      isOpen={is_open}
      onClose={on_close}
      isPinned={is_pinned}
      defaultPinned={default_pinned}
      onTogglePin={on_toggle_pin}
      defaultWidth={width}
      className={`flex-1 min-h-0 max-h-full ${class_name || ''}`}
    >
      {tabs_element}
    </Window>
  )
}

export default InfoFlyoutPanel
