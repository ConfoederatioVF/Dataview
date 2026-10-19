import React, { useState, useMemo, useCallback } from 'react'
import { ParsedDataLayer } from '@server/layer_parser'
import { Icon } from '@ui/components/icon'
import { HistoricalBordersConfig, StadesterConfig, isBorderDatasetMatch } from '@framework/geopng/types.ts'
import { HistoricalBordersSettings } from '@ui/rightbar/mapmodes/historical_borders_settings'
import { StadesterSettings } from '@ui/rightbar/mapmodes/stadester_settings'
import { useLocalisation } from '@localisation'

import { UserRole, isPublicBuild, isRoleAllowed } from '@common'
export type { UserRole }

export interface DataLayersTabProps {
  activeLayerId: string | null
  activeVariableSelectors: Record<string, string | string[]>
  historicalBordersConfig?: HistoricalBordersConfig
  isLoadingLayers?: boolean
  layers: Record<string, ParsedDataLayer>
  onChangeHistoricalBordersConfig?: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
  onChangeStadesterConfig?: React.Dispatch<React.SetStateAction<StadesterConfig>>
  onChangeUserRole?: (arg0_role: UserRole) => void
  onChangeVariableSelector: (arg0_key: string, arg1_option: string | string[]) => void
  onOpenVideoExport?: () => void
  onSelectLayer: (arg0_layer_id: string) => void
  stadesterCityCount?: number
  stadesterConfig?: StadesterConfig
  userRole?: UserRole
}

/**
 * DataLayersTab component providing full layer directory, category grouping, variable selectors, and permissions.
 *
 * @param {DataLayersTabProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let DataLayersTab: React.FC<DataLayersTabProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let {
    activeLayerId: active_layer_id,
    activeVariableSelectors: active_variable_selectors,
    historicalBordersConfig: historical_borders_config,
    isLoadingLayers: is_loading_layers = false,
    layers,
    onChangeHistoricalBordersConfig: on_change_historical_borders_config,
    onChangeStadesterConfig: on_change_stadester_config,
    onChangeUserRole: on_change_user_role,
    onChangeVariableSelector: on_change_variable_selector,
    onOpenVideoExport: on_open_video_export,
    onSelectLayer: on_select_layer,
    stadesterCityCount: stadester_city_count = 0,
    stadesterConfig: stadester_config,
    userRole: user_role = 'default',
  } = props

  //Declare local instance variables
  let active_layer: ParsedDataLayer | null
  let all_roles: { description: string; id: UserRole; name: string }[] = [
    { description: 'Open access to default data layers', id: 'default', name: 'Default' },
    { description: 'Access to privileged research layers', id: 'privileged', name: 'Privileged' },
    { description: 'Full access + Video Export tools', id: 'developer', name: 'Developer' },
  ]
  let filtered_layers: ParsedDataLayer[]
  let grouped_categories: Record<string, ParsedDataLayer[]>
  let handle_role_change: (arg0_role: UserRole) => void
  let is_layer_accessible: (arg0_layer: ParsedDataLayer) => boolean
  let layer_search: string
  let localisation: ReturnType<typeof useLocalisation>
  let roles_list = all_roles.filter((arg0_r) => isRoleAllowed(arg0_r.id))
  let selected_category: string
  let set_layer_search: React.Dispatch<React.SetStateAction<string>>
  let set_selected_category: React.Dispatch<React.SetStateAction<string>>
  let t: ReturnType<typeof useLocalisation>['t']

  //Function body
  localisation = useLocalisation()
  t = localisation.t
  ;[layer_search, set_layer_search] = useState('')
  ;[selected_category, set_selected_category] = useState('all')

  handle_role_change = useCallback(
    function (arg0_role: UserRole) {
      let r = arg0_role
      if (isRoleAllowed(r) && on_change_user_role)
        on_change_user_role(r)
    },
    [on_change_user_role]
  )

  is_layer_accessible = useCallback(
    function (arg0_layer: ParsedDataLayer) {
      let layer = arg0_layer
      if (user_role === 'developer' && !isPublicBuild())
        return true
      if (user_role === 'privileged' && !isPublicBuild())
        return !layer.permissions.includes('developer')
      //Default role only accesses default layers
      return layer.permissions.includes('default') || layer.permissions.length === 0
    },
    [user_role]
  )

  active_layer = useMemo(() => {
    if (!active_layer_id)
      return null
    if (layers[active_layer_id])
      return layers[active_layer_id]
    //Check sublayers
    let keys = Object.keys(layers)
    for (let i = 0; i < keys.length; i++) {
      let l = layers[keys[i]]
      if (l.sub_layers) {
        let found = l.sub_layers.find((arg0_sub: any) => arg0_sub.id === active_layer_id)
        if (found)
          return found
      }
    }
    return null
  }, [active_layer_id, layers])

  //Group layers by category
  grouped_categories = useMemo(() => {
    let result: Record<string, ParsedDataLayer[]> = {}
    let all_keys = Object.keys(layers)

    for (let i = 0; i < all_keys.length; i++) {
      let l = layers[all_keys[i]]
      let cat = l.category || 'General Rasters'
      if (!result[cat])
        result[cat] = []
      result[cat].push(l)
    }
    return result
  }, [layers])

  //Filter layers by search query and category
  filtered_layers = useMemo(() => {
    let q = layer_search.toLowerCase().trim()
    let all_keys = Object.keys(layers)
    let list: ParsedDataLayer[] = []

    for (let i = 0; i < all_keys.length; i++) {
      let l = layers[all_keys[i]]
      let matches_cat = selected_category === 'all' || l.category === selected_category
      let matches_q =
        !q ||
        l.name.toLowerCase().includes(q) ||
        l.id.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))

      if (matches_cat && matches_q)
        list.push(l)
    }

    return list
  }, [layers, layer_search, selected_category])

  //Return statement
  return (
    <div className="space-y-[var(--padding)] text-[var(--body-font-size)] font-sans">
      {/* Role & Permissions Banner */}
      <div className="border border-border bg-card/60 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Icon name="verified_user" className="text-primary text-xs" />
            <span>Active Permissions Role</span>
          </span>
          {!isPublicBuild() && user_role === 'developer' && on_open_video_export && (
            <button
              type="button"
              onClick={on_open_video_export}
              className="px-2 py-0.5 bg-primary text-primary-foreground text-[10px] font-bold shadow-xs hover:bg-primary/90 transition-colors cursor-pointer flex items-center gap-1"
              title="Open Developer Video Timelapse Export Tool"
            >
              <Icon name="movie" className="text-xs" />
              <span>Video Export</span>
            </button>
          )}
        </div>

        {roles_list.length > 1 && !isPublicBuild() ? (
          <div className="grid grid-cols-3 gap-1 bg-muted/40 p-0.5 border border-border">
            {roles_list.map((arg0_r) => {
              let active = user_role === arg0_r.id
              return (
                <button
                  key={arg0_r.id}
                  type="button"
                  onClick={() => handle_role_change(arg0_r.id)}
                  className={`py-1 px-1.5 text-center text-[11px] font-medium transition-colors cursor-pointer ${active
                      ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                  title={arg0_r.description}
                >
                  {arg0_r.name}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-[11px] px-2 py-1 bg-muted/30 border border-border text-muted-foreground flex items-center gap-1.5">
            <Icon name="lock" className="text-xs text-muted-foreground" />
            <span>Role: <strong className="text-foreground capitalize">{user_role}</strong> (Public Instance Locked)</span>
          </div>
        )}
      </div>

      {/* Layer Search & Category Filter */}
      <div className="space-y-1.5">
        <div className="relative">
          <input
            type="text"
            placeholder={t.sidebar.layers.searchPlaceholder}
            value={layer_search}
            onChange={(arg0_e) => set_layer_search(arg0_e.target.value)}
            className="w-full h-8 pl-8 pr-2.5 text-[var(--body-font-size)] bg-background border border-border text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
          />
          <Icon name="search" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm" />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => set_selected_category('all')}
            className={`px-2 py-0.5 border whitespace-nowrap cursor-pointer ${selected_category === 'all'
                ? 'bg-primary text-primary-foreground border-primary font-bold'
                : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'
              }`}
          >
            {t.sidebar.layers.allCategories}
          </button>
          {Object.keys(grouped_categories).map((arg0_cat) => (
            <button
              key={arg0_cat}
              type="button"
              onClick={() => set_selected_category(arg0_cat)}
              className={`px-2 py-0.5 border whitespace-nowrap cursor-pointer ${selected_category === arg0_cat
                  ? 'bg-primary text-primary-foreground border-primary font-bold'
                  : 'bg-muted/30 border-border text-muted-foreground hover:text-foreground'
                }`}
            >
              {arg0_cat}
            </button>
          ))}
        </div>
      </div>

      {/* Layer List Directory */}
      <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
        {is_loading_layers && (
          <div className="p-4 text-center text-muted-foreground text-xs font-mono animate-pulse">
            {t.sidebar.layers.loadingLayers}
          </div>
        )}

        {!is_loading_layers && filtered_layers.length === 0 && (
          <div className="p-4 text-center text-muted-foreground text-xs border border-dashed border-border">
            {t.sidebar.layers.noLayersFound}
          </div>
        )}

        {filtered_layers.map((arg0_layer) => {
          let accessible = is_layer_accessible(arg0_layer)
          let is_exact_active = active_layer_id === arg0_layer.id
          let is_parent_of_active = Boolean(active_layer && active_layer.parent_id === arg0_layer.id)
          let is_highlighted = is_exact_active || is_parent_of_active
          let years_count = arg0_layer.available_years ? arg0_layer.available_years.length : 0
          let is_borders = arg0_layer.id === 'statistical_borders' || arg0_layer.id === 'detailed_borders' || arg0_layer.id === 'simplified_borders' || arg0_layer.type === 'vector.polygon' || arg0_layer.id.includes('borders')
          let is_border_dataset_match = is_borders
            ? isBorderDatasetMatch(historical_borders_config?.dataset, arg0_layer.id)
            : false
          let is_stadester = arg0_layer.id.includes('stadester')
          let is_stadester_dataset_match = is_stadester
            ? (arg0_layer.id === 'stadester' || stadester_config?.dataset === arg0_layer.id || (!stadester_config?.dataset && arg0_layer.id === 'stadester_1.1'))
            : false
          let is_vector_overlay = arg0_layer.type === 'vector.points' || is_stadester || is_borders
          let is_overlay_active = is_borders
            ? (Boolean(historical_borders_config?.enabled) && is_border_dataset_match)
            : is_stadester
              ? (Boolean(stadester_config?.enabled) && is_stadester_dataset_match)
              : false

          return (
            <div
              key={arg0_layer.id}
              className={`border transition-all overflow-hidden ${is_highlighted || (is_vector_overlay && is_overlay_active)
                  ? 'border-primary bg-primary/10 shadow-sm'
                  : 'border-border bg-card/40 hover:bg-muted/40'
                }`}
            >
              <button
                type="button"
                onClick={() => {
                  if (accessible) {
                    if (is_borders && on_change_historical_borders_config) {
                      on_change_historical_borders_config((arg0_prev) => {
                        let is_currently_active = arg0_prev.enabled && isBorderDatasetMatch(arg0_prev.dataset, arg0_layer.id)
                        if (is_currently_active) {
                          return {
                            ...arg0_prev,
                            enabled: false,
                          }
                        }
                        return {
                          ...arg0_prev,
                          dataset: arg0_layer.id,
                          enabled: true,
                        }
                      })
                    } else if (is_vector_overlay && is_stadester && on_change_stadester_config) {
                      on_change_stadester_config((arg0_prev) => ({
                        ...arg0_prev,
                        enabled: !arg0_prev.enabled,
                      }))
                    } else {
                      on_select_layer(arg0_layer.id)
                    }
                  }
                }}
                disabled={!accessible}
                className={`w-full p-2.5 text-left flex items-start justify-between gap-2 cursor-pointer ${!accessible ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
              >
                <div className="flex items-start gap-2 min-w-0">
                  <Icon
                    name={arg0_layer.icon || (is_borders ? 'flag' : 'layers')}
                    className={`mt-0.5 text-sm shrink-0 ${is_exact_active || (is_vector_overlay && is_overlay_active) ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-xs text-foreground truncate">{arg0_layer.name}</span>
                      {arg0_layer.unit && (
                        <span
                          className="text-[10px] px-1 bg-muted text-muted-foreground border border-border font-mono truncate max-w-[130px]"
                          title={arg0_layer.unit}
                        >
                          {arg0_layer.unit}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                      <span className="capitalize">{arg0_layer.type}</span>
                      <span>•</span>
                      <span>{years_count} keyframes</span>
                      <span>•</span>
                      <span>{arg0_layer.encoding}</span>
                    </div>
                  </div>
                </div>

                {/* Status / Permission Lock Badge / Overlay Checkbox */}
                <div className="shrink-0 flex items-center gap-1.5">
                  {!accessible && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-destructive/20 text-destructive border border-destructive/40 font-mono flex items-center gap-1">
                      <Icon name="lock" className="text-xs" />
                      <span>{t.sidebar.layers.restricted}</span>
                    </span>
                  )}
                  {is_vector_overlay ? (
                    <label
                      className={`flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-mono px-2 py-0.5 border transition-colors ${is_overlay_active
                          ? 'border-primary bg-primary/20 text-primary font-bold'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        }`}
                      onClick={(arg0_e) => arg0_e.stopPropagation()}
                    >
                      <input
                        type={is_borders ? 'radio' : 'checkbox'}
                        name={is_borders ? 'historical_borders_dataset' : undefined}
                        checked={is_overlay_active}
                        onChange={() => {
                          if (is_borders && on_change_historical_borders_config) {
                            on_change_historical_borders_config((arg0_prev) => ({
                              ...arg0_prev,
                              dataset: arg0_layer.id,
                              enabled: true,
                            }))
                          } else if (is_stadester && on_change_stadester_config) {
                            on_change_stadester_config((arg0_prev) => ({
                              ...arg0_prev,
                              enabled: !arg0_prev.enabled,
                            }))
                          }
                        }}
                        className="accent-primary cursor-pointer h-3.5 w-3.5"
                      />
                      <span>{is_overlay_active ? t.sidebar.layers.overlayOn : t.sidebar.layers.overlayOff}</span>
                    </label>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${is_exact_active
                            ? 'border-primary bg-primary'
                            : 'border-muted-foreground/60'
                          }`}
                      >
                        {is_exact_active && (
                          <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                        )}
                      </span>
                      {is_exact_active && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-primary text-primary-foreground font-bold shadow-xs">
                          {t.sidebar.layers.active}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </button>

              {/* Historical Borders Inline Configuration */}
              {is_borders && is_overlay_active && historical_borders_config && on_change_historical_borders_config && (
                <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-card/60">
                  <HistoricalBordersSettings
                    config={historical_borders_config}
                    onChangeConfig={on_change_historical_borders_config}
                  />
                </div>
              )}

              {/* Stadestér Inline Configuration */}
              {is_stadester && is_overlay_active && stadester_config && on_change_stadester_config && (
                <div className="px-3 pb-3 pt-1 border-t border-border/40 bg-card/60">
                  <StadesterSettings
                    config={stadester_config}
                    onChangeConfig={on_change_stadester_config}
                    cityCount={stadester_city_count}
                  />
                </div>
              )}

              {/* Sub-layers (e.g. female / male in labourforce) */}
              {arg0_layer.sub_layers && arg0_layer.sub_layers.length > 0 && (
                <div className="px-2.5 pb-2 pt-1 border-t border-border/40 bg-card/30 flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-muted-foreground font-mono mr-1">{t.sidebar.layers.subIndicators}</span>
                  {arg0_layer.sub_layers.map((arg0_sub: any) => {
                    let sub_active = active_layer_id === arg0_sub.id
                    return (
                      <button
                        key={arg0_sub.id}
                        type="button"
                        onClick={() => on_select_layer(arg0_sub.id)}
                        className={`text-[10px] px-1.5 py-0.5 border cursor-pointer transition-colors flex items-center gap-1.5 ${sub_active
                            ? 'bg-primary text-primary-foreground border-primary font-bold'
                            : 'bg-background hover:bg-muted text-foreground border-border'
                          }`}
                      >
                        <span className={`w-2 h-2 rounded-full border shrink-0 ${sub_active ? 'border-primary-foreground bg-primary-foreground' : 'border-muted-foreground/60'}`} />
                        <span>{arg0_sub.name}</span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Active Layer Detail & Variable Selectors */}
      {active_layer && (
        <div className="border border-border bg-card/50 p-2.5 space-y-2.5">
          <div className="flex items-center justify-between border-b border-border pb-1.5">
            <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
              <Icon name="tune" className="text-primary text-xs" />
              <span>{t.sidebar.layers.layerConfig}</span>
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">
              ID: {active_layer.id}
            </span>
          </div>

          {/* Description Preview */}
          {active_layer.description && (
            <p className="text-[11px] text-muted-foreground leading-relaxed italic bg-muted/20 p-1.5 border border-border">
              {active_layer.description}
            </p>
          )}

          {/* Variable Selectors (e.g. gender and profession in professions) */}
          {active_layer.variable_selectors && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-foreground">{t.sidebar.layers.variableSelectors}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (active_layer?.variable_selectors && on_change_variable_selector) {
                        let sel_keys = Object.keys(active_layer.variable_selectors)
                        for (let i = 0; i < sel_keys.length; i++) {
                          let s_key = sel_keys[i]
                          let sel_item = active_layer.variable_selectors[s_key]
                          let is_disc = sel_item.category_type === 'discrete' || sel_item.type === 'discrete'
                          if (!is_disc) {
                            let all_opts = Object.keys(sel_item.options)
                            on_change_variable_selector(s_key, all_opts)
                          }
                        }
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary transition-colors cursor-pointer"
                    title={t.sidebar.layers.selectAll}
                  >
                    {t.sidebar.layers.selectAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (active_layer?.variable_selectors && on_change_variable_selector) {
                        let sel_keys = Object.keys(active_layer.variable_selectors)
                        for (let i = 0; i < sel_keys.length; i++) {
                          let s_key = sel_keys[i]
                          let first_opt = Object.keys(active_layer.variable_selectors[s_key].options)[0]
                          on_change_variable_selector(s_key, first_opt ? [first_opt] : [])
                        }
                      }
                    }}
                    className="text-[10px] px-1.5 py-0.5 border border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:border-primary transition-colors cursor-pointer"
                    title={t.sidebar.layers.resetAll}
                  >
                    {t.sidebar.layers.resetAll}
                  </button>
                </div>
              </div>

              {Object.keys(active_layer.variable_selectors).map((arg0_sel_key) => {
                let raw_val = active_variable_selectors[arg0_sel_key]
                let sel = active_layer.variable_selectors![arg0_sel_key]
                let is_discrete = sel.category_type === 'discrete' || sel.type === 'discrete'
                let selected_vals: string[] = []
                let valid_opt_keys = Object.keys(sel.options)
                if (valid_opt_keys.length > 0 && valid_opt_keys.every((arg0_k) => !Number.isNaN(parseInt(arg0_k, 10))))
                  valid_opt_keys.sort((arg0_a, arg0_b) => parseInt(arg0_a, 10) - parseInt(arg0_b, 10))

                if (Array.isArray(raw_val)) {
                  selected_vals = raw_val.filter((arg0_v: string) => valid_opt_keys.includes(arg0_v))
                } else if (typeof raw_val === 'string' && raw_val.length > 0) {
                  if (valid_opt_keys.includes(raw_val))
                    selected_vals = [raw_val]
                }
                if (selected_vals.length === 0 && valid_opt_keys[0])
                  selected_vals = [valid_opt_keys[0]]

                let display_label = selected_vals.map((arg0_k) => sel.options[arg0_k]?.name || arg0_k).join(', ')

                return (
                  <div key={arg0_sel_key} className="space-y-1 bg-muted/20 p-1.5 border border-border">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-medium text-foreground">{sel.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-primary font-mono font-bold truncate max-w-[120px]">{display_label}</span>
                        {!is_discrete && (
                          <>
                            <span className="text-muted-foreground/40">•</span>
                            <button
                              type="button"
                              onClick={() => {
                                if (on_change_variable_selector)
                                  on_change_variable_selector(arg0_sel_key, valid_opt_keys)
                              }}
                              className="text-[10px] text-primary hover:underline font-mono cursor-pointer"
                            >
                              {t.sidebar.layers.all}
                            </button>
                          </>
                        )}
                        <span className="text-muted-foreground/40">•</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (on_change_variable_selector)
                              on_change_variable_selector(arg0_sel_key, valid_opt_keys[0] ? [valid_opt_keys[0]] : [])
                          }}
                          className="text-[10px] text-muted-foreground hover:underline font-mono cursor-pointer"
                        >
                          {t.sidebar.layers.reset}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      {valid_opt_keys.map((arg0_opt_key) => {
                        let opt = sel.options[arg0_opt_key]
                        let is_opt_active = selected_vals.includes(arg0_opt_key)

                        return (
                          <button
                            key={arg0_opt_key}
                            type="button"
                            onClick={(arg0_e) => {
                              if (is_discrete) {
                                if (on_change_variable_selector)
                                  on_change_variable_selector(arg0_sel_key, [arg0_opt_key])
                              } else {
                                let is_shift = Boolean(arg0_e.shiftKey)
                                let next_vals: string[]
                                if (is_shift && selected_vals.length > 0) {
                                  let last_selected_idx = valid_opt_keys.indexOf(selected_vals[selected_vals.length - 1])
                                  let target_idx = valid_opt_keys.indexOf(arg0_opt_key)
                                  if (last_selected_idx !== -1 && target_idx !== -1) {
                                    let min_idx = Math.min(last_selected_idx, target_idx)
                                    let max_idx = Math.max(last_selected_idx, target_idx)
                                    let range_keys = valid_opt_keys.slice(min_idx, max_idx + 1)
                                    next_vals = Array.from(new Set([...selected_vals, ...range_keys]))
                                  } else {
                                    next_vals = is_opt_active
                                      ? selected_vals.filter((arg0_v) => arg0_v !== arg0_opt_key)
                                      : [...selected_vals, arg0_opt_key]
                                  }
                                } else {
                                  next_vals = is_opt_active
                                    ? selected_vals.filter((arg0_v) => arg0_v !== arg0_opt_key)
                                    : [...selected_vals, arg0_opt_key]
                                }
                                if (next_vals.length === 0)
                                  next_vals = [arg0_opt_key]
                                if (on_change_variable_selector)
                                  on_change_variable_selector(arg0_sel_key, next_vals)
                              }
                            }}
                            className={`px-2 py-0.5 text-[10px] border transition-colors cursor-pointer flex items-center gap-1 ${is_opt_active
                                ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                                : 'bg-background text-muted-foreground hover:text-foreground border-border'
                              }`}
                          >
                            <span className={`w-2.5 h-2.5 border ${is_discrete ? 'rounded-full' : 'rounded-none'} flex items-center justify-center shrink-0 ${is_opt_active ? (is_discrete ? 'bg-primary border-primary-foreground' : 'bg-primary-foreground/20 border-primary-foreground') : 'border-muted-foreground/60'
                              }`}>
                              {is_opt_active && (
                                is_discrete ? (
                                  <span className="w-1 h-1 rounded-full bg-primary-foreground" />
                                ) : (
                                  <Icon name="check" className="text-[8px] text-white" />
                                )
                              )}
                            </span>
                            <span>{opt.name}</span>
                            {opt.discounted && <span className="ml-0.5 opacity-60 text-[9px]">*</span>}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
