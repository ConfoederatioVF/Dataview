import React from 'react'
import { StadesterConfig, StadesterColorMode } from '@framework/geopng/types.ts'
import { Icon } from '@ui/components/icon'
import { Slider } from '@ui/components/slider'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/select'
import { formatLocalisedString, useLocalisation } from '@localisation'
import { D3ColorPaletteSelector } from '@ui/leftbar/d3_color_palette_selector'

export interface StadesterSettingsProps {
  cityCount?: number
  config: StadesterConfig
  onChangeConfig: React.Dispatch<React.SetStateAction<StadesterConfig>>
}

let MIN_POP_PRESETS = [
  { label: 'All', value: 0.01 },
  { label: '5k+', value: 5000 },
  { label: '10k+', value: 10000 },
  { label: '50k+', value: 50000 },
  { label: '100k+', value: 100000 },
  { label: '500k+', value: 500000 },
  { label: '1M+', value: 1000000 },
]

let MAX_CITIES_PRESETS = [
  { label: '500', value: 500 },
  { label: '1,000', value: 1000 },
  { label: '2,000', value: 2000 },
  { label: '4,000', value: 4000 },
  { label: '8,000', value: 8000 },
  { label: 'All', value: 50000 },
]

/**
 * Settings panel for the Stadestér Historical Cities mapmode.
 *
 * @param {StadesterSettingsProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let StadesterSettings: React.FC<StadesterSettingsProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props
  let city_count = props.cityCount
  let config = props.config
  let on_change_config = props.onChangeConfig

  //Declare local instance variables
  let bubble_size = config.bubbleSize
  let color_mode = config.colorMode
  let dataset = config.dataset || 'stadester_1.1'
  let heuristic_culling = Boolean(config.heuristicCulling)
  let large_city_contrast = (config.largeCityContrast !== undefined) ? config.largeCityContrast : 1.0
  let max_cities = config.maxCities
  let min_pop = config.minPop
  let show_labels = config.showLabels
  let { t } = useLocalisation()

  //Function body
  //Return statement
  return (
    <div className="space-y-2.5 pt-1 text-xs">
      {/* City count & status header */}
      <div className="flex items-center justify-between pb-1 border-b border-border/40">
        <div className="flex items-center gap-1.5">
          <Icon name="location_city" className="text-primary text-xs" />
          <span className="font-semibold text-foreground">{t.mapmodes.stadester.title}</span>
        </div>
        {city_count !== undefined && (
          <span className="text-[10px] px-1.5 py-0.2 bg-primary/20 text-primary border border-primary/40 font-mono">
            {formatLocalisedString(t.mapmodes.stadester.renderedCount, city_count.toLocaleString('de-DE'))}
          </span>
        )}
      </div>

      {/* Dataset Version Selector */}
      <div className="space-y-1">
        <label className="text-muted-foreground block text-[11px]">{t.mapmodes.stadester.datasetVersion}</label>
        <Select
          value={dataset}
          onValueChange={(arg0_val: any) =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              dataset: arg0_val as 'stadester_1.1' | 'stadester_1.0',
            }))
          }
        >
          <SelectTrigger className="h-7 w-full text-xs">
            <SelectValue placeholder={t.mapmodes.stadester.selectDataset} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="stadester_1.1">{t.mapmodes.stadester.stadester11}</SelectItem>
            <SelectItem value="stadester_1.0">{t.mapmodes.stadester.stadester10}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Circle Rendering Style: Outline vs Fill */}
      <div className="space-y-1">
        <label className="text-muted-foreground block text-[11px]">{t.mapmodes.stadester.circleStyle}</label>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() =>
              on_change_config((arg0_prev) => ({
                ...arg0_prev,
                filled: true,
                halo: false,
              }))
            }
            className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${config.filled !== false && !config.halo
                ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
          >
            {t.mapmodes.stadester.fill}
          </button>
          <button
            type="button"
            onClick={() =>
              on_change_config((arg0_prev) => ({
                ...arg0_prev,
                filled: false,
                halo: true,
              }))
            }
            className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${config.halo || config.filled === false
                ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
          >
            {t.mapmodes.stadester.outline}
          </button>
        </div>
      </div>

      {/* Circle Transparency / Opacity Slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">Circle Opacity</span>
          <span className="font-mono text-[10px] text-foreground">
            {Math.round(((config.opacity !== undefined) ? config.opacity : 0.7) * 100)}%
          </span>
        </div>
        <Slider
          value={[((config.opacity !== undefined) ? config.opacity : 0.7) * 100]}
          min={10}
          max={100}
          step={5}
          onValueChange={(arg0_val: any) =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              opacity: arg0_val[0] / 100,
            }))
          }
          className="py-1 cursor-pointer"
        />
      </div>

      {/* Colour Mode Selector */}
      <div className="space-y-1">
        <label className="text-muted-foreground block text-[11px]">{t.mapmodes.stadester.colorMode}</label>
        <div className="grid grid-cols-3 gap-1">
          <button
            type="button"
            onClick={() =>
              on_change_config((arg0_prev) => ({
                ...arg0_prev,
                colorMode: 'growth',
              }))
            }
            className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${color_mode === 'growth'
                ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
          >
            Growth Rate
          </button>
          <button
            type="button"
            onClick={() =>
              on_change_config((arg0_prev) => ({
                ...arg0_prev,
                colorMode: 'population',
              }))
            }
            className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${color_mode === 'population'
                ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
          >
            Population
          </button>
          <button
            type="button"
            onClick={() =>
              on_change_config((arg0_prev) => ({
                ...arg0_prev,
                colorMode: 'region',
              }))
            }
            className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${color_mode === 'region' || color_mode === 'continent'
                ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
          >
            Region
          </button>
        </div>
      </div>

      {/* Growth Colourscheme Selector (active when Growth Rate is selected) */}
      {color_mode === 'growth' && (
        <D3ColorPaletteSelector
          label={t.sidebar.visualisation.colorPalette}
          value={config.growthPalette || 'Rainbow'}
          onChange={(arg0_pal: any) =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              growthPalette: arg0_pal,
            }))
          }
        />
      )}

      {/* Population Threshold (minPop) Slider & Number Input */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">Min Population Threshold</span>
          <div className="flex items-center gap-1 font-mono">
            <input
              type="number"
              min={0.01}
              max={10000000}
              step={1000}
              value={min_pop <= 0.01 ? 0.01 : min_pop}
              onChange={(arg0_e) => {
                let v = Math.max(0.01, parseFloat(arg0_e.target.value) || 0.01)
                on_change_config((arg0_prev) => ({ ...arg0_prev, minPop: v }))
              }}
              className="w-16 h-5 px-1 bg-background border border-input rounded-none text-right text-xs font-mono text-foreground"
            />
          </div>
        </div>
        <Slider
          value={[Math.min(1000000, Math.max(0, min_pop))]}
          min={0}
          max={500000}
          step={5000}
          onValueChange={(arg0_vals: number[]) => {
            let next_val = arg0_vals[0] <= 0 ? 0.01 : arg0_vals[0]
            on_change_config((arg0_prev) => ({ ...arg0_prev, minPop: next_val }))
          }}
        />
        {/* Preset chips for Min Pop */}
        <div className="flex items-center gap-1 flex-wrap pt-0.5">
          {MIN_POP_PRESETS.map((arg0_preset) => {
            let is_sel = (arg0_preset.value === 0.01 && (min_pop === 0 || min_pop <= 0.01)) || min_pop === arg0_preset.value
            return (
              <button
                key={arg0_preset.value}
                type="button"
                onClick={() =>
                  on_change_config((arg0_prev) => ({ ...arg0_prev, minPop: arg0_preset.value }))
                }
                className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${is_sel
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  }`}
              >
                {arg0_preset.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Max Cities Limit Slider & Number Input */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">Max Settlements Displayed</span>
          <div className="flex items-center gap-1 font-mono">
            <input
              type="number"
              min={100}
              max={50000}
              step={100}
              value={max_cities >= 50000 ? 50000 : max_cities}
              onChange={(arg0_e) => {
                let v = Math.max(10, parseInt(arg0_e.target.value, 10) || 100)
                on_change_config((arg0_prev) => ({ ...arg0_prev, maxCities: v }))
              }}
              className="w-16 h-5 px-1 bg-background border border-input rounded-none text-right text-xs font-mono text-foreground"
            />
          </div>
        </div>
        <Slider
          value={[Math.min(10000, max_cities)]}
          min={100}
          max={10000}
          step={100}
          onValueChange={(arg0_vals: number[]) => {
            on_change_config((arg0_prev) => ({ ...arg0_prev, maxCities: arg0_vals[0] }))
          }}
        />
        {/* Preset chips for Max Cities */}
        <div className="flex items-center gap-1 flex-wrap pt-0.5">
          {MAX_CITIES_PRESETS.map((arg0_preset) => {
            let is_sel = max_cities === arg0_preset.value
            return (
              <button
                key={arg0_preset.value}
                type="button"
                onClick={() =>
                  on_change_config((arg0_prev) => ({ ...arg0_prev, maxCities: arg0_preset.value }))
                }
                className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${is_sel
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  }`}
              >
                {arg0_preset.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Bubble Size Multiplier */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">Circle Bubble Size</span>
          <span className="text-foreground font-mono font-bold">{bubble_size.toFixed(2)}x</span>
        </div>
        <Slider
          value={[bubble_size]}
          min={0.4}
          max={2.5}
          step={0.05}
          onValueChange={(arg0_vals: number[]) => {
            on_change_config((arg0_prev) => ({ ...arg0_prev, bubbleSize: arg0_vals[0] }))
          }}
        />
      </div>

      {/* Large-City Contrast Slider */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[11px]">
          <span className="text-muted-foreground">Large-City Contrast</span>
          <span className="text-foreground font-mono font-bold">{large_city_contrast.toFixed(2)}x</span>
        </div>
        <Slider
          value={[large_city_contrast]}
          min={0.2}
          max={2.5}
          step={0.05}
          onValueChange={(arg0_vals: number[]) => {
            on_change_config((arg0_prev) => ({ ...arg0_prev, largeCityContrast: arg0_vals[0] }))
          }}
        />
      </div>

      {/* Labels & Collision Filter Toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <div className="flex flex-col">
          <span className="text-foreground text-[11px] font-medium">{t.mapmodes.stadester.cityLabels}</span>
        </div>
        <button
          type="button"
          onClick={() =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              showLabels: !arg0_prev.showLabels,
            }))
          }
          className={`px-2 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer font-bold ${show_labels
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted text-muted-foreground border-border'
            }`}
        >
          {show_labels ? t.mapmodes.on : t.mapmodes.off}
        </button>
      </div>

      {/* Zoom Heuristic Culling Toggle */}
      <div className="flex items-center justify-between pt-1 border-t border-border/40">
        <div className="flex flex-col">
          <span className="text-foreground text-[11px] font-medium">{t.mapmodes.stadester.heuristicCulling}</span>
          {t.mapmodes.stadester.heuristicCullingDesc && (
            <span className="text-[10px] text-muted-foreground">{t.mapmodes.stadester.heuristicCullingDesc}</span>
          )}
        </div>
        <button
          type="button"
          onClick={() =>
            on_change_config((arg0_prev) => ({
              ...arg0_prev,
              heuristicCulling: !arg0_prev.heuristicCulling,
            }))
          }
          className={`px-2 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer font-bold ${heuristic_culling
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-background hover:bg-muted text-muted-foreground border-border'
            }`}
        >
          {heuristic_culling ? t.mapmodes.on : t.mapmodes.off}
        </button>
      </div>

      {/* Capital Cities Display & Colour Settings */}
      <div className="space-y-1.5 pt-1.5 border-t border-border/30">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-foreground text-[11px] font-medium">{t.mapmodes.stadester.capitalMarkers}</span>
          </div>
          <button
            type="button"
            onClick={() =>
              on_change_config((arg0_prev) => ({
                ...arg0_prev,
                showCapitals: arg0_prev.showCapitals === false ? true : false,
              }))
            }
            className={`px-2 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer font-bold ${config.showCapitals !== false
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted text-muted-foreground border-border'
              }`}
          >
            {config.showCapitals !== false ? t.mapmodes.on : t.mapmodes.off}
          </button>
        </div>

        {config.showCapitals !== false && (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">{t.mapmodes.stadester.capitalUnderlines}</span>
              <button
                type="button"
                onClick={() =>
                  on_change_config((arg0_prev) => ({
                    ...arg0_prev,
                    showCapitalUnderlines: arg0_prev.showCapitalUnderlines === false ? true : false,
                  }))
                }
                className={`px-2 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer font-bold ${config.showCapitalUnderlines !== false
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  }`}
              >
                {config.showCapitalUnderlines !== false ? t.mapmodes.on : t.mapmodes.off}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() =>
                  on_change_config((arg0_prev) => ({
                    ...arg0_prev,
                    capitalColorMode: 'state',
                  }))
                }
                className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${config.capitalColorMode !== 'constant'
                    ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  }`}
              >
                Use Country Colour
              </button>
              <button
                type="button"
                onClick={() =>
                  on_change_config((arg0_prev) => ({
                    ...arg0_prev,
                    capitalColorMode: 'constant',
                  }))
                }
                className={`px-1.5 py-1 text-[11px] rounded-none border text-center transition-colors cursor-pointer ${config.capitalColorMode === 'constant'
                    ? 'bg-primary/20 text-primary border-primary font-bold shadow-xs'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                  }`}
              >
                Constant Colour
              </button>
            </div>

            {config.capitalColorMode === 'constant' && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-muted-foreground">Custom Colour</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="color"
                      value={config.capitalConstantColor || '#FFDC00'}
                      onChange={(arg0_e) =>
                        on_change_config((arg0_prev) => ({
                          ...arg0_prev,
                          capitalConstantColor: arg0_e.target.value,
                        }))
                      }
                      className="w-5 h-5 p-0 border border-border cursor-pointer bg-transparent"
                    />
                    <input
                      type="text"
                      value={config.capitalConstantColor || '#FFDC00'}
                      onChange={(arg0_e) =>
                        on_change_config((arg0_prev) => ({
                          ...arg0_prev,
                          capitalConstantColor: arg0_e.target.value,
                        }))
                      }
                      className="w-16 h-5 px-1 bg-background border border-input rounded-none text-right text-[10px] font-mono text-foreground"
                    />
                  </div>
                </div>
                {/* Preset Chips */}
                <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                  {[
                    { label: 'Yellow', value: '#FFDC00' },
                    { label: 'Green', value: '#5b8a5a' },
                    { label: 'Red', value: '#FF4136' },
                    { label: 'Grey', value: '#969696' },
                    { label: 'Cyan', value: '#7FDBFF' },
                  ].map((arg0_preset) => {
                    let is_active = (config.capitalConstantColor || '#FFDC00').toLowerCase() === arg0_preset.value.toLowerCase()
                    return (
                      <button
                        key={arg0_preset.value}
                        type="button"
                        onClick={() =>
                          on_change_config((arg0_prev) => ({
                            ...arg0_prev,
                            capitalConstantColor: arg0_preset.value,
                          }))
                        }
                        className={`px-1.5 py-0.5 text-[9px] rounded-none border transition-colors cursor-pointer flex items-center gap-1 ${is_active
                            ? 'border-primary font-bold text-foreground bg-muted'
                            : 'border-border text-muted-foreground hover:bg-muted'
                          }`}
                      >
                        <span className="w-2 h-2 inline-block border border-black/30" style={{ backgroundColor: arg0_preset.value }} />
                        {arg0_preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
