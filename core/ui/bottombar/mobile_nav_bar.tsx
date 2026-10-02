/**
 * Fixed top navigation bar for mobile viewports.
 *
 * Provides single-tap access to Sidebar, Timeline, Analytics, Settings, and Map views.
 *
 * @module core/ui/bottombar/mobile_nav_bar
 */

import React from 'react'
import { Icon } from '../components/icon'
import { useLocalisation } from '@localisation'
import type { MobileTab } from '../use_app_layout_state'

export interface MobileNavBarProps {
  activeTab: MobileTab
  onSelectTab: (arg0_tab: MobileTab) => void
}

/**
 * Renders the mobile top navigation dock.
 *
 * @param {MobileNavBarProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export function MobileNavBar (arg0_props: MobileNavBarProps) {
  //Convert from parameters
  let active_tab = arg0_props.activeTab
  let on_select_tab = arg0_props.onSelectTab

  //Declare local instance variables
  let handleTabClick: (arg0_tab: MobileTab) => void
  let items: { icon: string; id: MobileTab; label: string }[]
  let localisation: ReturnType<typeof useLocalisation>
  let t: ReturnType<typeof useLocalisation>['t']

  //Function body
  localisation = useLocalisation()
  t = localisation.t

  items = [
    {
      icon: 'view_sidebar',
      id: 'sidebar',
      label: t.mobile.sidebar,
    },
    {
      icon: 'history',
      id: 'timeline',
      label: t.mobile.timeline,
    },
    {
      icon: 'show_chart',
      id: 'analytics',
      label: t.mobile.analytics,
    },
    {
      icon: 'tune',
      id: 'settings',
      label: t.mobile.settings,
    },
    {
      icon: 'map',
      id: null,
      label: t.mobile.map,
    },
  ]

  handleTabClick = (arg0_tab: MobileTab) => {
    if (arg0_tab === null) {
      on_select_tab(null)
      return
    }
    if (active_tab === arg0_tab) {
      on_select_tab(null)
      return
    }
    on_select_tab(arg0_tab)
  }

  //Return statement
  return (
    <nav
      id="dataview-mobile-navbar"
      className="fixed top-0 inset-x-0 h-12 bg-black/90 backdrop-blur-md border-b border-white/10 z-40 flex items-stretch justify-around px-1 select-none pointer-events-auto"
      aria-label="Mobile Navigation"
    >
      {items.map((arg0_item) => {
        let is_active = (arg0_item.id === null && active_tab === null) || (arg0_item.id !== null && active_tab === arg0_item.id)

        return (
          <button
            key={arg0_item.id ?? 'map'}
            type="button"
            className={`flex flex-col items-center justify-center flex-1 py-1 h-full touch-manipulation cursor-pointer transition-colors ${
              is_active
                ? 'text-[rgb(200,40,40)] font-semibold border-b-2 border-[rgb(200,40,40)]'
                : 'text-white/70 hover:text-white active:text-[rgb(200,40,40)]'
            }`}
            onClick={() => handleTabClick(arg0_item.id)}
            aria-pressed={is_active}
          >
            <Icon
              name={arg0_item.icon}
              size="1.15rem"
              className={is_active ? 'text-[rgb(200,40,40)]' : 'text-white/70'}
            />
            <span className="text-[9.5px] tracking-wide mt-0.5 leading-none font-normal">
              {arg0_item.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

export default MobileNavBar
