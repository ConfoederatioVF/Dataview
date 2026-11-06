import React from 'react'
import type { BorderPropertyFields } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { useLocalisation } from '@localisation'
import { BorderPropertyUtils, type BorderPropertyItem } from './historical_border_property_utils'

export interface HistoricalBorderPropertyListProps {
  fields?: BorderPropertyFields
  properties?: Record<string, any>
}

/**
 * Standardised key/value viewer for de jure and de facto country infoboxes. Field keys and labels are configured in common/layers/atlas.json5.
 *
 * @param {HistoricalBorderPropertyListProps} arg0_props
 *
 * @returns {React.ReactElement | null}
 */
export let HistoricalBorderPropertyList: React.FC<HistoricalBorderPropertyListProps> = function (arg0_props) {
  //Convert from parameters
  let fields = arg0_props.fields
  let properties = arg0_props.properties

  //Declare local instance variables
  let items_array: BorderPropertyItem[]
  let localisation = useLocalisation()

  //Function body
  items_array = BorderPropertyUtils.resolveItems(fields, properties, localisation.locale)

  //Guard clauses
  if (items_array.length === 0)
    return null

  //Return statement
  return (
    <div className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-0.5 p-2 bg-muted/20 border border-border/50 text-[11px]">
      {items_array.map((arg0_item) => {
        let is_link = /^https?:\/\//i.test(arg0_item.value)

        return (
          <React.Fragment key={arg0_item.key}>
            <span className="text-muted-foreground">{arg0_item.label}</span>
            {is_link ? (
              <a
                href={arg0_item.value}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 text-[rgb(200,40,40)] hover:underline truncate translate-y-[1px] min-w-0"
                title={arg0_item.value}
              >
                <span className="truncate">{BorderPropertyUtils.getLinkLabel(arg0_item.value)}</span>
                <Icon name="open_in_new" size={10} className="shrink-0 text-[rgb(200,40,40)]" />
              </a>
            ) : (
              <span className="text-foreground font-medium truncate" title={arg0_item.value}>{arg0_item.value}</span>
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}
