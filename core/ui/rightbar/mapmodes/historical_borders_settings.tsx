import React from 'react'
import { HistoricalBordersConfig } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { Slider } from '@ui/components/slider'

import { useLocalisation } from '@localisation'

export interface HistoricalBordersSettingsProps {
  config: HistoricalBordersConfig
  onChangeConfig: React.Dispatch<React.SetStateAction<HistoricalBordersConfig>>
}

let PRESET_COLOURS = [
  { colour: '#ffffff', key: 'white' as const, label: 'White' },
  { colour: '#000000', key: 'black' as const, label: 'Black' },
  { colour: '#d4af37', key: 'yellow' as const, label: 'Yellow' },
  { colour: '#f59e0b', key: 'orange' as const, label: 'Orange' },
  { colour: '#ef4444', key: 'red' as const, label: 'Red' },
  { colour: '#06b6d4', key: 'cyan' as const, label: 'Cyan' },
  { colour: '#a08db1', key: 'mauve' as const, label: 'Mauve' },
  { colour: '#10b981', key: 'green' as const, label: 'Green' },
]

/**
 * Settings panel for Historical Borders overlay styling (stroke colour, width, and polygon fill opacity).
 *
 * @param {HistoricalBordersSettingsProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let HistoricalBordersSettings: React.FC<HistoricalBordersSettingsProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let config = props.config
  let on_change_config = props.onChangeConfig

  //Declare local instance variables
  let fill_opacity = (config.fillOpacity !== undefined) ? config.fillOpacity : 0.0
  let stroke_color = config.strokeColor || '#d4af37'
  let stroke_width = (config.strokeWidth !== undefined) ? config.strokeWidth : 1.25
  let { t } = useLocalisation()

  //Function body
  //Return statement
  return (
    <div className="space-y-2 pt-1 text-xs select-none font-sans">
      {/* Header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <Icon name="flag" className="text-white text-xs" />
          <span className="font-semibold text-foreground">{t.mapmodes.borders.appearance}</span>
        </div>
        <span className="text-[10px] px-1.5 py-0.2 bg-muted/40 text-foreground border border-border font-mono">
          {stroke_color.toUpperCase()}
        </span>
      </div>

      {/* Stroke Colour Palette */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-muted-foreground block text-[11px]">{t.mapmodes.borders.strokeColour}</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={stroke_color}
              onChange={(arg0_e) => {
                let next_color = arg0_e.target.value
                on_change_config((arg0_prev) => ({
                  ...arg0_prev,
                  strokeColor: next_color,
                }))
              }}
              className="w-4 h-4 rounded-none cursor-pointer border border-border bg-transparent p-0"
              title={t.mapmodes.borders.colourPicker}
            />
            <span className="text-[10px] font-mono text-muted-foreground">{stroke_color}</span>
          </div>
        </div>

        {/* Preset Colour Chips */}
        <div className="grid grid-cols-4 gap-1">
          {PRESET_COLOURS.map((arg0_item) => {
            let is_active = stroke_color.toLowerCase() === arg0_item.colour.toLowerCase()
            let label = t.mapmodes.borders.colours[arg0_item.key] || arg0_item.label
            return (
              <button
                key={arg0_item.colour}
                type="button"
                onClick={() => {
                  on_change_config((arg0_prev) => ({
                    ...arg0_prev,
                    strokeColor: arg0_item.colour,
                  }))
                }}
                className={`flex items-center gap-1.5 px-1.5 py-1 border text-[10px] cursor-pointer transition-colors ${is_active
                  ? 'border-primary bg-primary/20 font-bold text-foreground shadow-xs'
                  : 'border-border/60 bg-muted/20 hover:bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                title={label}
              >
                <span
                  className="w-2.5 h-2.5 rounded-none shrink-0 border border-border"
                  style={{ backgroundColor: arg0_item.colour }}
                />
                <span className="truncate">{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Stroke Width Slider */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">{t.mapmodes.borders.strokeWidth}</span>
          <span className="font-mono text-foreground font-semibold">{stroke_width.toFixed(2)} px</span>
        </div>
        <Slider
          value={[stroke_width]}
          min={0.5}
          max={5.0}
          step={0.25}
          onValueChange={([arg0_val]) =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              strokeWidth: arg0_val,
            }))
          }
        />
      </div>

      {/* Fill Opacity Slider */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">{t.mapmodes.borders.fillOpacity}</span>
          <span className="font-mono text-foreground font-semibold">{Math.round(fill_opacity * 100)}%</span>
        </div>
        <Slider
          value={[fill_opacity]}
          min={0.0}
          max={0.5}
          step={0.05}
          onValueChange={([arg0_val]) =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              fillOpacity: arg0_val,
            }))
          }
        />
      </div>
    </div>
  )
}
