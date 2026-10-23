import React from 'react'
import { BoundsMode, ColorPalette, ScaleType } from '@framework/geopng/types.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select'
import { Slider } from '@ui/components/slider'
import { Input } from '@ui/components/input'
import { NumberInput } from '@ui/components/number_input'
import { Label } from '@ui/components/label'
import { Icon } from '@ui/components/icon'
import { D3ColorPaletteSelector } from './d3_color_palette_selector'

export interface SidebarVisualisationSectionProps {
  absoluteBreaks: string
  boundsMode: BoundsMode
  colorPalette: ColorPalette
  invertPalette: boolean
  isOpen: boolean
  legendSubtitle?: string
  legendTitle: string
  logSigma: number
  maxValOverride: string
  minValOverride: string
  onToggle: () => void
  opacity: number
  percentileList: string
  scaleType: ScaleType
  setAbsoluteBreaks: (p: string) => void
  setBoundsMode: (b: BoundsMode) => void
  setColorPalette: (p: ColorPalette) => void
  setInvertPalette: (inv: boolean) => void
  setLegendSubtitle?: (s: string) => void
  setLegendTitle: (t: string) => void
  setLogSigma: (s: number) => void
  setMaxValOverride: (v: string) => void
  setMinValOverride: (v: string) => void
  setOpacity: (o: number) => void
  setPercentileList: (p: string) => void
  setScaleType: (st: ScaleType) => void
  t: any
}

/**
 * Visualisation settings section for scales, palette, manual bounds, opacity, and legend descriptions.
 *
 * @param {SidebarVisualisationSectionProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let SidebarVisualisationSection: React.FC<SidebarVisualisationSectionProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props

  //Declare local instance variables
  let absolute_breaks = props.absoluteBreaks
  let bounds_mode = props.boundsMode
  let color_palette = props.colorPalette
  let invert_palette = props.invertPalette
  let is_open = props.isOpen
  let legend_subtitle = props.legendSubtitle
  let legend_title = props.legendTitle
  let log_sigma = props.logSigma
  let max_val_override = props.maxValOverride
  let min_val_override = props.minValOverride
  let on_toggle = props.onToggle
  let opacity = props.opacity
  let percentile_list = props.percentileList
  let scale_type = props.scaleType
  let set_absolute_breaks = props.setAbsoluteBreaks
  let set_bounds_mode = props.setBoundsMode
  let set_color_palette = props.setColorPalette
  let set_invert_palette = props.setInvertPalette
  let set_legend_subtitle = props.setLegendSubtitle
  let set_legend_title = props.setLegendTitle
  let set_log_sigma = props.setLogSigma
  let set_max_val_override = props.setMaxValOverride
  let set_min_val_override = props.setMinValOverride
  let set_opacity = props.setOpacity
  let set_percentile_list = props.setPercentileList
  let set_scale_type = props.setScaleType
  let t = props.t

  //Function body
  let sigma_presets = [
    { label: '0.1', value: 0.1 },
    { label: '1', value: 1 },
    { label: '10', value: 10 },
    { label: '100', value: 100 },
    { label: '1k', value: 1000 },
    { label: '10k', value: 10000 },
    { label: '100k', value: 100000 },
    { label: '1M', value: 1000000 },
  ]

  //Return statement
  return (
    <div className="border border-border bg-card/50">
      <button
        type="button"
        onClick={on_toggle}
        className="w-full h-8 px-[var(--padding)] flex items-center justify-between text-[var(--body-font-size)] font-bold text-foreground bg-muted/40 hover:bg-muted/70 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Icon name="palette" />
          <span>{t.sidebar.folders.visualisation}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Icon name={is_open ? 'expand_less' : 'expand_more'} />
        </div>
      </button>

      {is_open && (
        <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
          {/* Scale Transformation */}
          <div className="space-y-1">
            <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.visualisation.scaleTransformation}</Label>
            <Select value={scale_type} onValueChange={(arg0_v) => set_scale_type(arg0_v as ScaleType)}>
              <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="pseudo-log" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.pseudoLog}</SelectItem>
                <SelectItem value="linear" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.linear}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Steepness (Sigma) */}
          {scale_type === 'pseudo-log' && (
            <div className="space-y-2 rounded-none border border-border p-[var(--padding)] bg-muted/20">
              <div className="flex justify-between items-center text-[var(--body-font-size)]">
                <Label className="text-muted-foreground text-[var(--body-font-size)] font-normal">
                  {t.sidebar.visualisation.logSigma}
                </Label>
                <NumberInput
                  value={log_sigma}
                  min={0.0001}
                  step={log_sigma >= 100 ? 5 : log_sigma >= 10 ? 1 : log_sigma >= 1 ? 0.1 : 0.01}
                  onChange={(arg0_val: any) => {
                    let parsed = parseFloat(arg0_val)
                    if (!Number.isNaN(parsed) && parsed > 0)
                      set_log_sigma(parsed)
                  }}
                  containerClassName="h-7 w-20 rounded-none text-[var(--body-font-size)]"
                />
              </div>

              <Slider
                value={[log_sigma]}
                min={0.01}
                max={Math.max(1000000, Math.ceil(log_sigma * 1.5))}
                step={log_sigma >= 10000 ? 500 : log_sigma >= 100 ? 5 : log_sigma >= 10 ? 1 : log_sigma >= 1 ? 0.1 : 0.01}
                onValueChange={(arg0_vals: number[]) => set_log_sigma(arg0_vals[0])}
              />

              {/* Preset buttons */}
              <div className="flex items-center justify-between gap-1 pt-0.5 flex-wrap">
                {sigma_presets.map((arg0_preset) => (
                  <button
                    key={arg0_preset.label}
                    type="button"
                    onClick={() => set_log_sigma(arg0_preset.value)}
                    className={`px-1 py-0.5 text-[10px] font-mono rounded-none border transition-colors cursor-pointer ${Math.abs(log_sigma - arg0_preset.value) < 0.001
                      ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                      }`}
                  >
                    {arg0_preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Colourscheme */}
          <D3ColorPaletteSelector
            value={color_palette}
            onChange={set_color_palette}
            invert={invert_palette}
            onInvertChange={set_invert_palette}
            showInvert={true}
          />

          {/* Visual Bounds Mode */}
          <div className="space-y-2">
            <Label className="text-[var(--body-font-size)] font-bold text-foreground">{t.sidebar.visualisation.manualRange}</Label>
            <Select value={bounds_mode} onValueChange={(arg0_v) => set_bounds_mode(arg0_v as BoundsMode)}>
              <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-none">
                <SelectItem value="Manual" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.manualMinMax}</SelectItem>
                <SelectItem value="Percentile" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.percentileBreaks}</SelectItem>
                <SelectItem value="Absolute" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.visualisation.absoluteBreaks}</SelectItem>
              </SelectContent>
            </Select>

            {bounds_mode === 'Manual' && (
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.min}</span>
                  <NumberInput
                    placeholder={t.sidebar.visualisation.auto}
                    value={min_val_override}
                    step="any"
                    onChange={(arg0_val: any) => set_min_val_override(arg0_val)}
                    containerClassName="rounded-none h-7 text-[var(--body-font-size)]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.max}</span>
                  <NumberInput
                    placeholder={t.sidebar.visualisation.auto}
                    value={max_val_override}
                    step="any"
                    onChange={(arg0_val: any) => set_max_val_override(arg0_val)}
                    containerClassName="rounded-none h-7 text-[var(--body-font-size)]"
                  />
                </div>
              </div>
            )}

            {bounds_mode === 'Percentile' && (
              <div className="space-y-1 pt-1">
                <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.percentileBreaks}</span>
                <Input
                  type="text"
                  value={percentile_list}
                  onChange={(arg0_e) => set_percentile_list(arg0_e.target.value)}
                  className="rounded-none h-7 text-[var(--body-font-size)]"
                />
              </div>
            )}

            {bounds_mode === 'Absolute' && (
              <div className="space-y-1 pt-1">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.visualisation.absoluteBreaks}</span>
                  <button
                    type="button"
                    onClick={() => set_absolute_breaks('0, 10, 50, 100, 500, 1000')}
                    className="text-[var(--body-font-size)] text-primary hover:underline cursor-pointer"
                  >
                    {t.sidebar.visualisation.resetDefaults}
                  </button>
                </div>
                <Input
                  type="text"
                  placeholder="e.g. 0, 10, 50, 100, 500, 1000"
                  value={absolute_breaks}
                  onChange={(arg0_e) => set_absolute_breaks(arg0_e.target.value)}
                  className="rounded-none h-7 text-[var(--body-font-size)]"
                />
                <span className="text-[var(--body-font-size)] text-muted-foreground leading-tight block">
                  {t.sidebar.visualisation.absoluteBreaksDesc}
                </span>
              </div>
            )}
          </div>

          {/* Layer Opacity */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[var(--body-font-size)]">
              <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">{t.sidebar.visualisation.opacity}</Label>
              <span className="text-foreground font-bold text-[var(--body-font-size)]">
                {Math.round(opacity * 100)}%
              </span>
            </div>
            <Slider
              value={[opacity * 100]}
              min={10}
              max={100}
              step={1}
              onValueChange={(arg0_vals: number[]) => set_opacity(arg0_vals[0] / 100)}
            />
          </div>

          {/* Legend Title (Supports line breaks) */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">
                {t.sidebar.visualisation.legendTitle}
              </Label>
              <span className="text-[10px] text-muted-foreground/70 font-light">{t.sidebar.visualisation.supportsEnter}</span>
            </div>
            <textarea
              value={legend_title}
              onChange={(arg0_e) => set_legend_title(arg0_e.target.value)}
              rows={2}
              placeholder="e.g. Population Density&#10;(people per km²)"
              className="w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-[var(--body-font-size)] text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-sans leading-tight"
            />
          </div>

          {/* Legend Subtitle */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <Label className="text-[var(--body-font-size)] text-muted-foreground font-normal">
                {t.sidebar.visualisation.legendSubtitle}
              </Label>
              <span className="text-[10px] text-muted-foreground/70 font-light">{t.sidebar.visualisation.optional}</span>
            </div>
            <textarea
              value={legend_subtitle}
              onChange={(arg0_e) => {
                if (set_legend_subtitle)
                  set_legend_subtitle(arg0_e.target.value)
              }}
              rows={1}
              placeholder={t.sidebar.visualisation.subtitlePlaceholder}
              className="w-full rounded-none border border-input bg-transparent px-2.5 py-1 text-[var(--body-font-size)] text-foreground shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y font-sans leading-tight"
            />
          </div>
        </div>
      )}
    </div>
  )
}
