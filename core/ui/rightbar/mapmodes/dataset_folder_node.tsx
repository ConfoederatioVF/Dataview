import React from 'react'
import { ParsedDataLayer } from '@server/layer_parser'
import { HistoricalBordersConfig, StadesterConfig } from '@framework/geopng/types.ts'
import { formatLocalisedString, useLocalisation } from '@localisation'
import { Icon } from '@ui/components/icon'
import { DataLayerNode } from './data_layer_node'

export interface DatasetFolderNodeProps {
  activeLayerId: string | null
  activeVariableSelectors: Record<string, string | string[]>
  expandedNodes: Record<string, boolean>
  folderLayers: ParsedDataLayer[]
  folderName: string
  historicalBordersConfig?: HistoricalBordersConfig
  isLayerAccessible: (arg0_layer: ParsedDataLayer) => boolean
  onChangeVariableSelector?: (arg0_key: string, arg1_option: string | string[]) => void
  onSelectLayer?: (arg0_layer_id: string) => void
  searchQuery: string
  setHistoricalBordersConfig?: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
  setStadesterConfig?: React.Dispatch<React.SetStateAction<StadesterConfig>>
  stadesterCityCount?: number
  stadesterConfig?: StadesterConfig
  toggleNode: (arg0_id: string, arg1_current_open?: boolean) => void
}

/**
 * Renders an expandable category folder containing a grouped subset of data layers.
 *
 * @param {DatasetFolderNodeProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let DatasetFolderNode: React.FC<DatasetFolderNodeProps> = function (arg0_props) {
  //Convert from parameters
  let active_layer_id = arg0_props.activeLayerId
  let active_variable_selectors = arg0_props.activeVariableSelectors
  let expanded_nodes = arg0_props.expandedNodes
  let folder_layers = arg0_props.folderLayers
  let folder_name = arg0_props.folderName
  let historical_borders_config = arg0_props.historicalBordersConfig
  let is_layer_accessible = arg0_props.isLayerAccessible
  let on_change_variable_selector = arg0_props.onChangeVariableSelector
  let on_select_layer = arg0_props.onSelectLayer
  let search_query = arg0_props.searchQuery
  let set_historical_borders_config = arg0_props.setHistoricalBordersConfig
  let set_stadester_config = arg0_props.setStadesterConfig
  let stadester_city_count = arg0_props.stadesterCityCount
  let stadester_config = arg0_props.stadesterConfig
  let toggle_node = arg0_props.toggleNode

  //Declare local instance variables
  let default_open: boolean
  let is_open: boolean
  let is_searching = Boolean(search_query.trim())
  let node_id = `dataset_${folder_name}`
  let { t } = useLocalisation()

  //Function body
  default_open = folder_layers.length > 0 && folder_layers[0].category_open !== undefined
    ? Boolean(folder_layers[0].category_open)
    : false
  is_open = is_searching || (expanded_nodes[node_id] !== undefined ? expanded_nodes[node_id] : default_open)

  //Return statement
  return (
    <div key={node_id} className="border border-border/60 bg-muted/10 mb-1">
      <div
        onClick={() => toggle_node(node_id, is_open)}
        className="flex items-center justify-between px-2.5 py-1.5 bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors border-b border-border/40"
      >
        <div className="flex items-center gap-2 min-w-0">
          <Icon
            name={is_open ? 'folder_open' : 'folder'}
            className="text-primary text-sm shrink-0"
          />
          <span className="text-xs font-bold uppercase tracking-wide text-foreground truncate">
            {folder_name}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-muted-foreground font-mono">
            {formatLocalisedString(folder_layers.length === 1 ? t.mapmodes.layerCount : t.mapmodes.layersCount, folder_layers.length)}
          </span>
          <Icon
            name={is_open ? 'expand_less' : 'expand_more'}
            className="text-xs text-muted-foreground"
          />
        </div>
      </div>

      {is_open && (
        <div className="p-1 space-y-1">
          {folder_layers.map((arg0_layer) => (
            <DataLayerNode
              key={arg0_layer.id}
              activeLayerId={active_layer_id}
              activeVariableSelectors={active_variable_selectors}
              depth={0}
              expandedNodes={expanded_nodes}
              historicalBordersConfig={historical_borders_config}
              isLayerAccessible={is_layer_accessible}
              layer={arg0_layer}
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
  )
}

export let dataset_folder_node = DatasetFolderNode
