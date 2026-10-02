import React from 'react'
import { ParsedDataLayer } from '@server/layer_parser'
import { HistoricalBordersConfig, StadesterConfig } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { formatLocalisedString, useLocalisation } from '@localisation'
import { HistoricalBordersSettings } from './historical_borders_settings'
import { MapmodeTooltip } from './mapmode_tooltip'
import { StadesterSettings } from './stadester_settings'

export interface data_layer_nodeProps {
  activeLayerId: string | null
  activeVariableSelectors: Record<string, string | string[]>
  depth?: number
  expandedNodes: Record<string, boolean>
  historicalBordersConfig?: HistoricalBordersConfig
  isLayerAccessible: (arg0_layer: ParsedDataLayer) => boolean
  layer: ParsedDataLayer
  onChangeVariableSelector?: (arg0_key: string, arg1_option: string | string[]) => void
  onSelectLayer?: (arg0_layer_id: string) => void
  searchQuery: string
  setHistoricalBordersConfig?: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
  setStadesterConfig?: React.Dispatch<React.SetStateAction<StadesterConfig>>
  stadesterCityCount?: number
  stadesterConfig?: StadesterConfig
  toggleNode: (arg0_id: string) => void
}

/**
 * Recursive tree node rendering a single dataset layer, folder, or multi-variable cohort selector.
 *
 * @param {data_layer_nodeProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let data_layer_node: React.FC<data_layer_nodeProps> = function (arg0_props) {
  //Convert from parameters
  let active_layer_id = arg0_props.activeLayerId
  let active_variable_selectors = arg0_props.activeVariableSelectors
  let depth = arg0_props.depth || 0
  let expanded_nodes = arg0_props.expandedNodes
  let historical_borders_config = arg0_props.historicalBordersConfig
  let is_layer_accessible = arg0_props.isLayerAccessible
  let layer = arg0_props.layer
  let on_change_variable_selector = arg0_props.onChangeVariableSelector
  let on_select_layer = arg0_props.onSelectLayer
  let search_query = arg0_props.searchQuery
  let set_historical_borders_config = arg0_props.setHistoricalBordersConfig
  let set_stadester_config = arg0_props.setStadesterConfig
  let stadester_city_count = arg0_props.stadesterCityCount ?? 0
  let stadester_config = arg0_props.stadesterConfig
  let toggle_node = arg0_props.toggleNode

  //Declare local instance variables
  let has_sub_layers = Boolean(layer.sub_layers && layer.sub_layers.length > 0)
  let has_variable_selectors = Boolean(layer.variable_selectors && Object.keys(layer.variable_selectors).length > 0)
  let is_accessible = is_layer_accessible(layer)
  let is_active = active_layer_id === layer.id
  let is_border_dataset_match: boolean
  let is_borders = layer.id === 'statistical_borders' || layer.id === 'detailed_borders' || layer.type === 'vector.polygon' || layer.id.includes('borders')
  let is_node_expanded = Boolean(search_query.trim()) || (expanded_nodes[layer.id] ?? true)
  let is_overlay_active: boolean
  let is_searching = Boolean(search_query.trim())
  let is_stadester = layer.id.includes('stadester')
  let is_stadester_dataset_match: boolean
  let is_vector_overlay = layer.type === 'vector.points' || is_stadester || is_borders
  let { t } = useLocalisation()

  //Function body
  is_border_dataset_match = is_borders
    ? (historical_borders_config?.dataset === layer.id || (!historical_borders_config?.dataset && layer.id === 'statistical_borders'))
    : false
  is_stadester_dataset_match = is_stadester
    ? (layer.id === 'stadester' || stadester_config?.dataset === layer.id || (!stadester_config?.dataset && layer.id === 'stadester_1.1'))
    : false
  is_overlay_active = is_borders
    ? (Boolean(historical_borders_config?.enabled) && is_border_dataset_match)
    : is_stadester
      ? (Boolean(stadester_config?.enabled) && is_stadester_dataset_match)
      : false

  //Return statement
  return (
    <div key={layer.id} className="space-y-1" style={{ paddingLeft: `${depth * 12}px` }}>
      {is_vector_overlay ? (
        <div className="border border-border/70 bg-card/40 mb-1">
          <MapmodeTooltip name={layer.name} unit={layer.unit}>
            <div
              onClick={() => {
                if (is_borders) {
                  if (set_historical_borders_config) {
                    set_historical_borders_config((arg0_prev) => {
                      let is_currently_active = arg0_prev.enabled && (
                        arg0_prev.dataset === layer.id ||
                        (!arg0_prev.dataset && layer.id === 'statistical_borders')
                      )
                      if (is_currently_active) {
                        return {
                          ...arg0_prev,
                          enabled: false,
                        }
                      }
                      return {
                        ...arg0_prev,
                        dataset: layer.id,
                        enabled: true,
                      }
                    })
                  } else if (on_select_layer) {
                    on_select_layer(layer.id)
                  }
                } else if (is_stadester && set_stadester_config) {
                  set_stadester_config((arg0_prev) => {
                    let is_currently_active = arg0_prev.enabled && (layer.id === 'stadester' || arg0_prev.dataset === layer.id || (!arg0_prev.dataset && layer.id === 'stadester_1.1'))
                    if (is_currently_active) {
                      return {
                        ...arg0_prev,
                        enabled: false,
                      }
                    }
                    return {
                      ...arg0_prev,
                      dataset: (layer.id === 'stadester') ? (arg0_prev.dataset || 'stadester_1.1') : (layer.id as 'stadester_1.1' | 'stadester_1.0'),
                      display_options: layer.display_options || arg0_prev.display_options,
                      enabled: true,
                    }
                  })
                }
              }}
              className={`flex items-center justify-between px-2 py-1.5 text-left cursor-pointer border transition-colors ${is_overlay_active
                  ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                  : 'hover:bg-muted/40 text-foreground border-transparent'
                }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3.5 h-3.5 ${is_borders ? 'rounded-full' : 'rounded-none'} border flex items-center justify-center shrink-0 transition-colors ${is_overlay_active ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/60'
                    }`}
                >
                  {is_overlay_active && (
                    is_borders ? (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />
                    ) : (
                      <Icon name="check" className="text-[10px]" />
                    )
                  )}
                </span>
                <Icon name={is_borders ? 'flag' : 'location_city'} className="text-primary text-xs shrink-0" />
                <span className="text-xs truncate">{layer.name}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {is_overlay_active ? t.mapmodes.overlayOn : t.mapmodes.overlayOff}
                </span>
                {(is_stadester || is_borders) && (
                  <Icon
                    name={is_overlay_active ? 'expand_less' : 'expand_more'}
                    className="text-xs text-muted-foreground"
                  />
                )}
              </div>
            </div>
          </MapmodeTooltip>

          {is_borders && is_overlay_active && historical_borders_config && set_historical_borders_config && (
            <div className="p-2 border-t border-border/60 bg-card/60 space-y-1 text-xs">
              <HistoricalBordersSettings
                config={historical_borders_config}
                onChangeConfig={set_historical_borders_config}
              />
            </div>
          )}

          {is_stadester && is_overlay_active && stadester_config && set_stadester_config && (
            <div className="p-2 border-t border-border/60 bg-card/60 space-y-1 text-xs">
              <StadesterSettings
                config={stadester_config}
                onChangeConfig={set_stadester_config}
                cityCount={stadester_city_count}
              />
            </div>
          )}
        </div>
      ) : has_sub_layers ? (
        <div>
          <div
            onClick={() => toggle_node(layer.id)}
            className="flex items-center justify-between px-2 py-1 cursor-pointer border border-border/60 bg-muted/30 hover:bg-muted/60 transition-colors"
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <Icon name={is_node_expanded ? 'folder_open' : 'folder'} className="text-primary text-xs shrink-0" />
              <span className="text-xs font-bold text-foreground truncate">{layer.name}</span>
            </div>
            <div className="flex items-center shrink-0 p-0.5">
              <Icon
                name={is_node_expanded ? 'expand_less' : 'expand_more'}
                className="text-xs text-muted-foreground shrink-0"
              />
            </div>
          </div>

          {is_node_expanded && (
            <div className="mt-1 space-y-1 border-l-2 border-border/40 pl-1.5 ml-2">
              {layer.sub_layers!.map((arg0_sub: any) => (
                <DataLayerNode
                  key={arg0_sub.id}
                  activeLayerId={active_layer_id}
                  activeVariableSelectors={active_variable_selectors}
                  depth={0}
                  expandedNodes={expanded_nodes}
                  historicalBordersConfig={historical_borders_config}
                  isLayerAccessible={is_layer_accessible}
                  layer={arg0_sub}
                  onChangeVariableSelector={on_change_variable_selector}
                  onSelectLayer={on_select_layer}
                  searchQuery={search_query}
                  setHistoricalBordersConfig={set_historical_borders_config}
                  setStadesterConfig={set_stadester_config}
                  stadesterCityCount={stadester_city_count}
                  stadesterConfig={stadester_config}
                  toggleNode={toggle_node}
                />
              ))}
            </div>
          )}
        </div>
      ) : has_variable_selectors ? (
        <div>
          <MapmodeTooltip name={layer.name} unit={layer.unit}>
            <div
              className={`flex items-center justify-between px-2 py-1 cursor-pointer border transition-colors ${is_active
                  ? 'bg-primary/20 border-primary text-primary font-bold shadow-xs'
                  : 'bg-muted/30 hover:bg-muted/60 border-border/60 text-foreground'
                }`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={(arg0_e) => {
                    arg0_e.stopPropagation()
                    if (on_select_layer)
                      on_select_layer(layer.id)
                    if (!is_node_expanded)
                      toggle_node(layer.id)
                  }}
                  className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${is_active ? 'border-primary bg-primary' : 'border-muted-foreground/60 hover:border-primary'
                    }`}
                  title={formatLocalisedString(t.mapmodes.selectLayer, layer.name)}
                >
                  {is_active && <span className="w-1.5 h-1.5 rounded-full bg-primary-foreground" />}
                </button>
                <div
                  onClick={() => {
                    if (on_select_layer)
                      on_select_layer(layer.id)
                    if (!is_node_expanded)
                      toggle_node(layer.id)
                  }}
                  className="flex items-center gap-1.5 min-w-0 flex-1"
                >
                  <Icon
                    name={is_node_expanded ? 'folder_open' : 'folder'}
                    className="text-primary text-xs shrink-0"
                  />
                  <span className="text-xs font-bold truncate">{layer.name}</span>
                </div>
              </div>
              <div
                onClick={(arg0_e) => {
                  arg0_e.stopPropagation()
                  toggle_node(layer.id)
                }}
                className="flex items-center gap-1 shrink-0 ml-1 cursor-pointer p-0.5"
              >
                {layer.unit && (
                  <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[110px] shrink ml-1">
                    {layer.unit}
                  </span>
                )}
                <span className="text-[9px] px-1 py-0.2 bg-muted text-muted-foreground font-mono">
                  {formatLocalisedString(t.mapmodes.varsCount, Object.keys(layer.variable_selectors!).length)}
                </span>
                <Icon
                  name={is_node_expanded ? 'expand_less' : 'expand_more'}
                  className="text-xs text-muted-foreground shrink-0"
                />
              </div>
            </div>
          </MapmodeTooltip>

          {is_node_expanded && (
            <div className="mt-1 space-y-1.5 border-l-2 border-primary/40 pl-1.5 ml-2">
              {Object.entries(layer.variable_selectors!).map(([arg0_var_key, arg0_sel]) => {
                let is_discrete = arg0_sel.category_type === 'discrete' || arg0_sel.type === 'discrete'
                let opts = Object.entries(arg0_sel.options)
                let raw_val = active_variable_selectors[arg0_var_key]
                let selected_vals: string[] = []
                let var_node_id = `${layer.id}_var_${arg0_var_key}`
                let is_var_open = is_searching || (expanded_nodes[var_node_id] ?? true)

                if (opts.length > 0 && opts.every(([arg0_k]) => !Number.isNaN(parseInt(arg0_k, 10))))
                  opts.sort((arg0_a, arg0_b) => parseInt(arg0_a[0], 10) - parseInt(arg0_b[0], 10))

                let valid_keys = opts.map(([k]) => k)
                if (Array.isArray(raw_val)) {
                  selected_vals = raw_val.filter((arg0_v) => valid_keys.includes(arg0_v))
                } else if (typeof raw_val === 'string' && raw_val.length > 0) {
                  if (valid_keys.includes(raw_val))
                    selected_vals = [raw_val]
                }
                if (selected_vals.length === 0 && opts[0]?.[0]) {
                  selected_vals = [opts[0][0]]
                }

                return (
                  <div key={arg0_var_key} className="border border-border/70 bg-muted/20">
                    <div
                      onClick={() => toggle_node(var_node_id)}
                      className="flex items-center justify-between px-2 py-1 bg-muted/40 hover:bg-muted/60 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Icon name="tune" className="text-primary text-[10px] shrink-0" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-foreground truncate">
                          {arg0_sel.name || arg0_var_key}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!is_discrete && (
                          <>
                            <button
                              type="button"
                              onClick={(arg0_e) => {
                                arg0_e.stopPropagation()
                                if (!is_active && on_select_layer)
                                  on_select_layer(layer.id)
                                let all_keys = opts.map(([k]) => k)
                                if (on_change_variable_selector)
                                  on_change_variable_selector(arg0_var_key, all_keys)
                              }}
                              className="text-[9px] text-primary hover:underline font-mono cursor-pointer"
                            >
                              {t.mapmodes.all}
                            </button>
                            <span className="text-[9px] text-muted-foreground/40">•</span>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={(arg0_e) => {
                            arg0_e.stopPropagation()
                            if (!is_active && on_select_layer)
                              on_select_layer(layer.id)
                            if (on_change_variable_selector)
                              on_change_variable_selector(arg0_var_key, opts[0]?.[0] ? [opts[0][0]] : [])
                          }}
                          className="text-[9px] text-muted-foreground hover:underline font-mono cursor-pointer"
                        >
                          {t.mapmodes.reset}
                        </button>
                        <Icon
                          name={is_var_open ? 'expand_less' : 'expand_more'}
                          className="text-xs text-muted-foreground shrink-0 ml-1"
                        />
                      </div>
                    </div>

                    {is_var_open && (
                      <div className="p-1.5 max-h-52 overflow-y-auto space-y-0.5">
                        {opts.map(([arg0_opt_key, arg0_opt_val]) => {
                          let is_opt_selected = selected_vals.includes(arg0_opt_key)
                          return (
                            <div
                              key={arg0_opt_key}
                              onClick={(arg0_e) => {
                                arg0_e.stopPropagation()
                                if (!is_active && on_select_layer)
                                  on_select_layer(layer.id)
                                if (on_change_variable_selector) {
                                  if (is_discrete) {
                                    on_change_variable_selector(arg0_var_key, [arg0_opt_key])
                                  } else {
                                    let is_shift = Boolean(arg0_e.shiftKey)
                                    let next: string[]
                                    if (is_shift && selected_vals.length > 0) {
                                      let all_keys = opts.map(([k]) => k)
                                      let last_selected_idx = all_keys.indexOf(selected_vals[selected_vals.length - 1])
                                      let target_idx = all_keys.indexOf(arg0_opt_key)
                                      if (last_selected_idx !== -1 && target_idx !== -1) {
                                        let min_idx = Math.min(last_selected_idx, target_idx)
                                        let max_idx = Math.max(last_selected_idx, target_idx)
                                        let range_keys = all_keys.slice(min_idx, max_idx + 1)
                                        next = Array.from(new Set([...selected_vals, ...range_keys]))
                                      } else {
                                        next = is_opt_selected
                                          ? selected_vals.filter((arg0_k) => arg0_k !== arg0_opt_key)
                                          : [...selected_vals, arg0_opt_key]
                                      }
                                    } else {
                                      next = is_opt_selected
                                        ? selected_vals.filter((arg0_k) => arg0_k !== arg0_opt_key)
                                        : [...selected_vals, arg0_opt_key]
                                    }
                                    if (next.length === 0)
                                      next = [arg0_opt_key]
                                    on_change_variable_selector(arg0_var_key, next)
                                  }
                                }
                              }}
                              className={`flex items-center justify-between px-2 py-0.5 cursor-pointer text-xs transition-colors rounded-none ${is_opt_selected
                                  ? 'bg-primary/20 text-primary font-bold'
                                  : 'hover:bg-muted/40 text-muted-foreground hover:text-foreground'
                                }`}
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`w-3 h-3 ${is_discrete ? 'rounded-full' : 'rounded-none'} border flex items-center justify-center shrink-0 transition-colors ${is_opt_selected
                                      ? 'border-primary bg-primary text-primary-foreground'
                                      : 'border-muted-foreground/60'
                                    }`}
                                >
                                  {is_opt_selected && (
                                    is_discrete ? (
                                      <span className="w-1 h-1 rounded-full bg-primary-foreground" />
                                    ) : (
                                      <Icon name="check" className="text-[9px]" />
                                    )
                                  )}
                                </span>
                                <span className="truncate">{arg0_opt_val.name || arg0_opt_key}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <div>
          <MapmodeTooltip name={layer.name} unit={layer.unit}>
            <button
              type="button"
              disabled={!is_accessible}
              onClick={() => on_select_layer && on_select_layer(layer.id)}
              className={`w-full flex items-center justify-between px-2 py-1 text-left cursor-pointer border transition-colors ${is_active
                  ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                  : 'hover:bg-muted/40 text-foreground border-transparent'
                } ${!is_accessible ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3 h-3 rounded-full border flex items-center justify-center shrink-0 ${is_active ? 'border-primary bg-primary' : 'border-muted-foreground/60'
                    }`}
                >
                  {is_active && <span className="w-1 h-1 rounded-full bg-primary-foreground" />}
                </span>
                <span className="text-xs truncate">{layer.name}</span>
              </div>
              {layer.unit && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[110px] shrink ml-1">
                  {layer.unit}
                </span>
              )}
            </button>
          </MapmodeTooltip>
        </div>
      )}
    </div>
  )
}

export let DataLayerNode = data_layer_node;
