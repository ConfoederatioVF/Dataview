import React from 'react'
import { BinningConfig, DownsampleMethod } from '@framework/geopng/types.ts'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@ui/components/select'
import { NumberInput } from '@ui/components/number_input'
import { Icon } from '@ui/components/icon'

export interface SidebarBinningSectionProps {
  binningConfig: BinningConfig
  isOpen: boolean
  onToggle: () => void
  setBinningConfig: React.Dispatch<React.SetStateAction<BinningConfig>>
  t: any
}

/**
 * Resolution and binning configuration section for grid downsampling.
 *
 * @param {SidebarBinningSectionProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export let SidebarBinningSection: React.FC<SidebarBinningSectionProps> = function (arg0_props) {
  //Convert from parameters
  let props = arg0_props

  //Declare local instance variables
  let binning_config = props.binningConfig
  let is_open = props.isOpen
  let on_toggle = props.onToggle
  let set_binning_config = props.setBinningConfig
  let t = props.t

  //Function body
  let binning_presets = [
    { h: 0, label: 'Native', w: 0 },
    { h: 1080, label: 'Full HD', w: 2160 },
    { h: 720, label: 'HD 720p', w: 1440 },
    { h: 540, label: '540p', w: 1080 },
    { h: 360, label: '360p', w: 720 },
    { h: 180, label: '180p', w: 360 },
    { h: 90, label: '90p', w: 180 },
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
          <Icon name="grid_view" />
          <span>{t.sidebar.folders.binning}</span>
        </div>
        <div className="flex items-center gap-1.5">
          {binning_config.enabled && (
            <span className="text-[10px] px-1.5 py-0.5 bg-primary/20 text-primary border border-primary/40 font-medium">
              {binning_config.width}×{binning_config.height}
            </span>
          )}
          <Icon name={is_open ? 'expand_less' : 'expand_more'} />
        </div>
      </button>

      {is_open && (
        <div className="p-[var(--padding)] space-y-[var(--padding)] text-[var(--body-font-size)] border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.downsampleGrid}</span>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={binning_config.enabled}
                onChange={(arg0_e) =>
                  set_binning_config((arg0_prev) => ({ ...arg0_prev, enabled: arg0_e.target.checked }))
                }
                className="w-3.5 h-3.5 rounded-none accent-emerald-500 cursor-pointer"
              />
              <span
                className={`text-xs font-bold uppercase ${binning_config.enabled ? 'text-emerald-400 font-bold' : 'text-muted-foreground'
                  }`}
              >
                {binning_config.enabled ? t.sidebar.binning.on : t.sidebar.binning.off}
              </span>
            </label>
          </div>

          {binning_config.enabled && (
            <div className="space-y-2 pt-1 border-t border-border/60">
              <div className="grid grid-cols-2 gap-1.5">
                <div className="space-y-1">
                  <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.width}</span>
                  <NumberInput
                    value={binning_config.width}
                    min={60}
                    max={4320}
                    step={60}
                    onChange={(arg0_val: any) => {
                      let parsed = parseInt(arg0_val, 10)
                      if (parsed > 0)
                        set_binning_config((arg0_prev) => ({ ...arg0_prev, width: parsed }))
                    }}
                    containerClassName="h-7 rounded-none text-[var(--body-font-size)]"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.height}</span>
                  <NumberInput
                    value={binning_config.height}
                    min={30}
                    max={2160}
                    step={30}
                    onChange={(arg0_val: any) => {
                      let parsed = parseInt(arg0_val, 10)
                      if (parsed > 0)
                        set_binning_config((arg0_prev) => ({ ...arg0_prev, height: parsed }))
                    }}
                    containerClassName="h-7 rounded-none text-[var(--body-font-size)]"
                  />
                </div>
              </div>

              {/* Presets */}
              <div className="space-y-1">
                <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.presets}</span>
                <div className="grid grid-cols-3 gap-1">
                  {binning_presets.slice(1).map((arg0_preset) => (
                    <button
                      key={arg0_preset.label}
                      type="button"
                      onClick={() =>
                        set_binning_config((arg0_prev) => ({
                          ...arg0_prev,
                          height: arg0_preset.h,
                          width: arg0_preset.w,
                        }))
                      }
                      className={`px-1.5 py-1 text-[var(--body-font-size)] border rounded-none text-center truncate transition-colors cursor-pointer ${binning_config.width === arg0_preset.w && binning_config.height === arg0_preset.h
                        ? 'bg-primary text-primary-foreground border-primary font-bold'
                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                        }`}
                    >
                      {arg0_preset.w}×{arg0_preset.h}
                    </button>
                  ))}
                </div>
              </div>

              {/* Method */}
              <div className="space-y-1">
                <span className="text-[var(--body-font-size)] text-muted-foreground">{t.sidebar.binning.downsampleMethod}</span>
                <Select
                  value={binning_config.method}
                  onValueChange={(arg0_v) =>
                    set_binning_config((arg0_prev) => ({
                      ...arg0_prev,
                      method: arg0_v as DownsampleMethod,
                    }))
                  }
                >
                  <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-none">
                    <SelectItem value="average" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodAverage}</SelectItem>
                    <SelectItem value="minimum" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodMinimum}</SelectItem>
                    <SelectItem value="maximum" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodMaximum}</SelectItem>
                    <SelectItem value="near" className="rounded-none text-[var(--body-font-size)]">{t.sidebar.binning.methodNear}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
