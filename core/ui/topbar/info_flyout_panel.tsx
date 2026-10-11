import React, { useState, useEffect } from 'react'
import {
  MapModeItem,
  HeightmapConfig,
  CircleOverlayConfig,
  ProjectionType,
} from '@framework/geopng/types.ts'
import { CountryFeature } from '@framework/geopng/polygon_binning'
import { UI_BREAKPOINTS } from '@framework/utils/ui_layout'
import { Icon } from '@ui/components/icon'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@ui/components/tabs'
import { MarkdownRenderer } from '@ui/components/markdown_renderer'
import { Window } from '@ui/components/window'
import { useInfoPanelConfig, MarkdownSectionItem } from '@common'
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
  circleOverlayConfig?: CircleOverlayConfig
  className?: string
  defaultPinned?: boolean
  embedded?: boolean
  heightmapConfig?: HeightmapConfig
  isMobile?: boolean
  isOpen: boolean
  isPinned?: boolean
  mapModes?: MapModeItem[]
  onClose: () => void
  onTogglePin?: (pinned: boolean) => void
  projection?: ProjectionType
  selectedCountries?: CountryFeature[]
  width?: number
}

/**
 * Information and camera controls flyout window.
 *
 * @param {InfoFlyoutPanelProps} arg0_props
 * @returns {React.ReactElement|null}
 */
export let InfoFlyoutPanel: React.FC<InfoFlyoutPanelProps> = function (arg0_props: InfoFlyoutPanelProps) {
  //Convert from parameters
  let props = (arg0_props) ? arg0_props : ({} as InfoFlyoutPanelProps)

  //Declare local instance variables
  let active_tab: string
  let class_name = props.className
  let default_pinned = props.defaultPinned ?? true
  let device_mode: 'desktop' | 'mobile'
  let embedded = Boolean(props.embedded)
  let info_config: ReturnType<typeof useInfoPanelConfig>
  let is_device_mobile: boolean
  let is_open = props.isOpen
  let is_pinned = props.isPinned
  let localisation: ReturnType<typeof useLocalisation>
  let on_close = props.onClose
  let on_toggle_pin = props.onTogglePin
  let set_active_tab: React.Dispatch<React.SetStateAction<string>>
  let set_device_mode: React.Dispatch<React.SetStateAction<'desktop' | 'mobile'>>
  let set_is_device_mobile: React.Dispatch<React.SetStateAction<boolean>>
  let t: ReturnType<typeof useLocalisation>['t']
  let tabs_element: React.ReactElement
  let width = props.width ?? 336

  //Function body
  info_config = useInfoPanelConfig()
  localisation = useLocalisation()
  t = localisation.t

  let [current_tab, set_current_tab] = useState<string>(
    info_config.defaultTab || info_config.tabs[0]?.id || 'controls'
  )
  active_tab = current_tab
  set_active_tab = set_current_tab

  let [mobile_detected, set_mobile_detected] = useState<boolean>(() => {
    if (typeof props.isMobile === 'boolean')
      return props.isMobile
    if (typeof window !== 'undefined')
      return (window.innerWidth < UI_BREAKPOINTS.mobile || (('ontouchstart' in window) && window.innerWidth < UI_BREAKPOINTS.tablet))
    return false
  })
  is_device_mobile = mobile_detected
  set_is_device_mobile = set_mobile_detected

  let [current_device_mode, set_current_device_mode] = useState<'desktop' | 'mobile'>(() => {
    if (typeof props.isMobile === 'boolean')
      return (props.isMobile) ? 'mobile' : 'desktop'
    if (typeof window !== 'undefined')
      return (window.innerWidth < UI_BREAKPOINTS.mobile || (('ontouchstart' in window) && window.innerWidth < UI_BREAKPOINTS.tablet)) ? 'mobile' : 'desktop'
    return 'desktop'
  })
  device_mode = current_device_mode
  set_device_mode = set_current_device_mode

  useEffect(() => {
    if (typeof props.isMobile === 'boolean') {
      set_is_device_mobile(props.isMobile)
      set_device_mode((props.isMobile) ? 'mobile' : 'desktop')
      return
    }

    let handleResize = () => {
      let is_mobile_now = (window.innerWidth < UI_BREAKPOINTS.mobile || (('ontouchstart' in window) && window.innerWidth < UI_BREAKPOINTS.tablet))
      set_is_device_mobile(is_mobile_now)
      set_device_mode((is_mobile_now) ? 'mobile' : 'desktop')
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [props.isMobile])

  //Guard clauses
  if (!is_open)
    return null

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
        {info_config.tabs.map((tab) => {
          let shortcuts_list = (device_mode === 'mobile')
            ? (tab.mobileShortcuts || tab.shortcuts || [])
            : (tab.desktopShortcuts || tab.shortcuts || [])

          return (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="m-0 focus-visible:outline-none space-y-3"
            >
              {(tab.type === 'controls') ? (
                /* TAB 1: CONTROLS */
                <div className="space-y-3">
                  {/* Navigation Shortcuts Section */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-foreground text-[var(--body-font-size)] uppercase tracking-wider block truncate">
                        {tab.shortcutsHeader || t.infoPanel.navigationShortcuts}
                      </span>

                      <div className="flex items-center border border-border bg-background/60 p-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => set_device_mode('desktop')}
                          className={`px-2 py-0.5 text-[var(--body-font-size)] flex items-center gap-1 cursor-pointer transition-colors ${
                            (device_mode === 'desktop')
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title={t.infoPanel.desktopControls}
                        >
                          <Icon name="desktop_windows" size={13} />
                          <span>{t.infoPanel.desktop}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => set_device_mode('mobile')}
                          className={`px-2 py-0.5 text-[var(--body-font-size)] flex items-center gap-1 cursor-pointer transition-colors ${
                            (device_mode === 'mobile')
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          title={t.infoPanel.mobileControls}
                        >
                          <Icon name="smartphone" size={13} />
                          <span>{t.infoPanel.mobile}</span>
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1 bg-background/60 p-2 border border-border">
                      {shortcuts_list.map((sc, idx) => (
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
          )})}
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
