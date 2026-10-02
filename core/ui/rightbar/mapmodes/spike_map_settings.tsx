import React from 'react';
import { HeightmapConfig, SpikeHeightScaleMode } from '@framework/geopng/types.ts';
import { Icon } from '@ui/components/icon';
import { Slider } from '@ui/components/slider';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@ui/components/select';
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from '@ui/components/tooltip';
import { useLocalisation } from '@localisation';
import { pseudoLogTransform, inversePseudoLogTransform } from '@framework/geopng/scales.ts';

let MAX_PERCENTILE_STRENGTH = 10.0;
let PERCENTILE_STRENGTH_SIGMA = 0.5;
let T_MAX_PERCENTILE = pseudoLogTransform(MAX_PERCENTILE_STRENGTH, PERCENTILE_STRENGTH_SIGMA);

/**
 * Converts strength to slider position.
 *
 * @param {number} arg0_strength
 *
 * @returns {number}
 */
export function strengthToSliderPos (arg0_strength: number): number {
  //Convert from parameters
  let strength = arg0_strength;

  //Declare local instance variables
  let clamped = Math.max(0, Math.min(MAX_PERCENTILE_STRENGTH, strength));
  let norm: number;
  let t: number;

  //Function body
  t = pseudoLogTransform(clamped, PERCENTILE_STRENGTH_SIGMA);
  norm = t/T_MAX_PERCENTILE;

  //Return statement
  return Math.round(Math.max(0, Math.min(100, norm*100)));
}

/**
 * Converts slider position to percentile strength.
 *
 * @param {number} arg0_pos
 *
 * @returns {number}
 */
export function sliderPosToStrength (arg0_pos: number): number {
  //Convert from parameters
  let pos = arg0_pos;

  //Declare local instance variables
  let norm = Math.max(0, Math.min(100, pos))/100;
  let strength: number;
  let y = norm*T_MAX_PERCENTILE;

  //Function body
  strength = inversePseudoLogTransform(y, PERCENTILE_STRENGTH_SIGMA);

  //Return statement
  return Math.max(0, Math.min(MAX_PERCENTILE_STRENGTH, Math.round(strength*100)/100));
}

export let SPIKE_RESOLUTION_OPTIONS = [
  { label: "120' (2°)", title: "Low granularity (120-arcminute / 2 degrees)", value: 120 },
  { label: "60' (1°)", title: "Standard granularity (60-arcminute / 1 degree)", value: 60 },
  { label: "30'", title: "Medium granularity (30-arcminute / 0.5 degree)", value: 30 },
  { label: "15'", title: "Fine granularity (15-arcminute / 0.25 degree)", value: 15 },
  { label: "10'", title: "Very fine granularity (10-arcminute)", value: 10 },
  { label: "5'", title: "Maximum granularity (5-arcminute) — Warning: can be laggy", value: 5 },
];

/**
 * Formats spike resolution in arcminutes to human-readable label.
 *
 * @param {number} arg0_arcmin
 *
 * @returns {string}
 */
export function formatSpikeResolution (arg0_arcmin: number): string {
  //Convert from parameters
  let arcmin = arg0_arcmin;

  //Return statement
  if (arcmin === 5)
    return "5' (0.08° • Max)";
  if (arcmin === 10)
    return "10' (0.17° • Very Fine)";
  if (arcmin === 15)
    return "15' (0.25° • Fine)";
  if (arcmin === 30)
    return "30' (0.50° • Medium)";
  if (arcmin === 60)
    return "60' (1.00° • Standard)";
  if (arcmin === 120)
    return "120' (2.00° • Coarse)";

  return `${arcmin}'`;
}

export interface SpikeMapSettingsProps {
  cameraTilt?: number;
  heightmapConfig: HeightmapConfig;
  onSetCameraTilt?: (tilt: number) => void;
  setHeightmapConfig: React.Dispatch<React.SetStateAction<HeightmapConfig>>;
}

/**
 * Settings configuration subpanel for 3D elevation spike map mode.
 *
 * @param {SpikeMapSettingsProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export function SpikeMapSettings (arg0_props: SpikeMapSettingsProps) {
  //Convert from parameters
  let props = arg0_props;
  let {
    cameraTilt: camera_tilt,
    heightmapConfig: heightmap_config,
    onSetCameraTilt: on_set_camera_tilt,
    setHeightmapConfig: set_heightmap_config,
  } = props;

  //Declare local instance variables
  let { t } = useLocalisation();

  //Return statement
  return (
    <div className="w-full space-y-1.5 animate-in fade-in-0 duration-100">
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
          <Icon name="view_in_ar" />
          <span>{t.mapmodes.spikes.title}</span>
        </span>
      </div>

      {/* Spike Height Scale */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.spikes.heightScale}</span>
          <span className="text-foreground font-bold">
            {(heightmap_config.elevationScale/1000).toFixed(0)} km
          </span>
        </div>
        <Slider
          value={[heightmap_config.elevationScale]}
          min={50000}
          max={2500000}
          step={25000}
          onValueChange={(arg0_vals: number[]) =>
            set_heightmap_config((arg0_prev) => ({ ...arg0_prev, elevationScale: arg0_vals[0] }))
          }
        />
      </div>

      {/* Spike Height Scale Mode Dropdown */}
      <div className="space-y-1">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.spikes.scalingMode}</span>
        </div>
        <Select
          value={heightmap_config.heightScaleMode ?? 'linear'}
          onValueChange={(arg0_v) =>
            set_heightmap_config((arg0_prev) => ({
              ...arg0_prev,
              heightScaleMode: arg0_v as SpikeHeightScaleMode,
            }))
          }
        >
          <SelectTrigger className="rounded-none h-7 text-[var(--body-font-size)] bg-background/50 border border-border/80">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-none">
            <SelectItem value="linear" className="rounded-none text-[var(--body-font-size)]">
              {t.mapmodes.spikes.pureLinear}
            </SelectItem>
            <SelectItem value="percentile" className="rounded-none text-[var(--body-font-size)]">
              {t.mapmodes.spikes.purePercentile}
            </SelectItem>
            <SelectItem value="blend" className="rounded-none text-[var(--body-font-size)]">
              {t.mapmodes.spikes.interpolated}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Interpolation / Blend Slider */}
      {heightmap_config.heightScaleMode === 'blend' && (
        <div className="space-y-1.5 p-2 bg-muted/20 border border-border/70 rounded-none animate-in fade-in duration-200">
          <div className="flex justify-between items-center text-[var(--body-font-size)]">
            <span className="text-muted-foreground">{t.mapmodes.spikes.blend}</span>
            <span className="text-foreground font-mono text-xs font-semibold">
              {Math.round((1 - (heightmap_config.blendWeight ?? 0.5))*100)}% Lin / {Math.round((heightmap_config.blendWeight ?? 0.5)*100)}% %ile
            </span>
          </div>
          <Slider
            value={[Math.round((heightmap_config.blendWeight ?? 0.5)*100)]}
            min={0}
            max={100}
            step={1}
            onValueChange={(arg0_vals: number[]) =>
              set_heightmap_config((arg0_prev) => ({ ...arg0_prev, blendWeight: arg0_vals[0]/100 }))
            }
          />
          <div className="flex justify-between text-[10px] text-muted-foreground font-light">
            <span>0% ({t.mapmodes.spikes.pureLinear})</span>
            <span>{t.mapmodes.spikes.halfBlend}</span>
            <span>100% ({t.mapmodes.spikes.purePercentile})</span>
          </div>
        </div>
      )}

      {/* Spike Resolution */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.spikes.granularity}</span>
          <div className="flex items-center gap-1.5">
            <span className="text-foreground font-bold font-mono">
              {formatSpikeResolution(heightmap_config.resolutionArcmin ?? 60)}
            </span>
            {(heightmap_config.resolutionArcmin ?? 60) === 5 && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="cursor-help text-amber-400 text-[10px] font-semibold px-1 py-0.5 bg-amber-500/20 border border-amber-500/40 rounded-none inline-flex items-center gap-0.5 animate-in fade-in">
                    {t.mapmodes.spikes.degradedPerformance}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-amber-950/95 border-amber-500/80 text-amber-200 text-xs max-w-[240px] p-2 leading-tight">
                  <div className="font-semibold text-amber-300 mb-0.5 flex items-center gap-1">
                    <span>{t.mapmodes.spikes.performanceWarning}</span>
                  </div>
                  {t.mapmodes.spikes.performanceDesc}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        </div>
        <Slider
          value={[
            Math.max(
              0,
              SPIKE_RESOLUTION_OPTIONS.findIndex(
                (arg0_o) => arg0_o.value === (heightmap_config.resolutionArcmin ?? 60)
              )
            ),
          ]}
          min={0}
          max={SPIKE_RESOLUTION_OPTIONS.length - 1}
          step={1}
          onValueChange={(arg0_vals: number[]) => {
            let opt = SPIKE_RESOLUTION_OPTIONS[arg0_vals[0]];
            if (opt)
              set_heightmap_config((arg0_prev) => ({ ...arg0_prev, resolutionArcmin: opt.value }));
          }}
        />
        <div className="flex justify-between text-[10px] text-muted-foreground font-light">
          <span>{t.mapmodes.spikes.resolutionCoarse}</span>
          <span>{t.mapmodes.spikes.resolutionStandard}</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-help text-amber-400/90 underline decoration-dotted decoration-amber-500/60 hover:text-amber-300">
                {t.mapmodes.spikes.resolutionMax}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-amber-950/95 border-amber-500/80 text-amber-200 text-xs max-w-[240px] p-2 leading-tight">
              <div className="font-semibold text-amber-300 mb-0.5 flex items-center gap-1">
                <span>{t.mapmodes.spikes.performanceWarning}</span>
              </div>
              {t.mapmodes.spikes.performanceDesc}
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Quick preset chips */}
        <div className="flex items-center gap-1 pt-0.5 flex-wrap">
          {SPIKE_RESOLUTION_OPTIONS.map((arg0_opt) => {
            let opt = arg0_opt;
            let is5Arcmin = opt.value === 5;
            let isSelected = (heightmap_config.resolutionArcmin ?? 60) === opt.value;
            let chip_btn = (
              <button
                key={opt.value}
                type="button"
                onClick={() =>
                  set_heightmap_config((arg0_prev) => ({
                    ...arg0_prev,
                    resolutionArcmin: opt.value,
                  }))
                }
                title={opt.title}
                className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${
                  isSelected
                    ? is5Arcmin
                      ? 'bg-amber-500 text-black border-amber-400 font-bold shadow-xs'
                      : 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : is5Arcmin
                      ? 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border-amber-500/40'
                      : 'bg-background hover:bg-muted text-muted-foreground border-border'
                }`}
              >
                {opt.label}
                {is5Arcmin && ' ⚠'}
              </button>
            );

            if (is5Arcmin) {
              return (
                <Tooltip key={opt.value}>
                  <TooltipTrigger asChild>{chip_btn}</TooltipTrigger>
                  <TooltipContent side="top" className="bg-amber-950/95 border-amber-500/80 text-amber-200 text-xs max-w-[240px] p-2 leading-tight">
                    <div className="font-semibold text-amber-300 mb-0.5 flex items-center gap-1">
                      <span>⚠ Performance Warning</span>
                    </div>
                    5-arcmin resolution renders high-density 3D geometry and can be laggy on some systems.
                  </TooltipContent>
                </Tooltip>
              );
            }

            return chip_btn;
          })}
        </div>
      </div>

      {/* Camera 3D Tilt / Pitch */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">Camera Tilt (Pitch)</span>
          <span className="text-foreground font-bold">
            {Math.round(camera_tilt ?? 0)}°
          </span>
        </div>
        <Slider
          value={[Math.round(camera_tilt ?? 0)]}
          min={0}
          max={80}
          step={1}
          onValueChange={(arg0_vals: number[]) => {
            if (on_set_camera_tilt)
              on_set_camera_tilt(arg0_vals[0]);
          }}
        />
      </div>

      {/* Spikes Transparency / Opacity */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">Spikes Opacity</span>
          <span className="text-foreground font-bold">
            {Math.round((heightmap_config.opacity ?? 0.9)*100)}%
          </span>
        </div>
        <Slider
          value={[Math.round((heightmap_config.opacity ?? 0.9)*100)]}
          min={10}
          max={100}
          step={5}
          onValueChange={(arg0_vals: number[]) =>
            set_heightmap_config((arg0_prev) => ({ ...arg0_prev, opacity: arg0_vals[0]/100 }))
          }
        />
      </div>

      {/* Opacity Tied to Percentile Toggle */}
      <div className="pt-1">
        <label className="flex items-center justify-between gap-2 p-1.5 bg-background/50 border border-border/80 cursor-pointer hover:bg-muted/40 transition-colors">
          <div className="flex flex-col gap-0.5">
            <span className="text-[var(--body-font-size)] font-medium text-foreground">
              Opacity by Percentile
            </span>
            <span className="text-[10px] text-muted-foreground font-light leading-tight">
              Tie spike transparency to empirical cell percentile rank
            </span>
          </div>
          <input
            type="checkbox"
            checked={Boolean(heightmap_config.opacityByPercentile)}
            onChange={(arg0_e) =>
              set_heightmap_config((arg0_prev) => ({
                ...arg0_prev,
                opacityByPercentile: arg0_e.target.checked,
              }))
            }
            className="w-[var(--body-font-size)] h-[var(--body-font-size)] rounded-none accent-emerald-500 cursor-pointer shrink-0"
          />
        </label>

        {/* Adjustable Percentile Opacity Strength Slider with Pseudo-Log Ramp */}
        {Boolean(heightmap_config.opacityByPercentile) && (
          <div className="mt-2 pl-2 border-l-2 border-primary/50 space-y-2 animate-in fade-in-0 duration-150">
            <div className="flex justify-between items-center text-[var(--body-font-size)]">
              <span className="text-muted-foreground">Percentile Effect Strength</span>
              <span className="text-foreground font-bold font-mono">
                {Math.round((heightmap_config.opacityByPercentileStrength ?? 1.0)*100)}%
                <span className="text-muted-foreground font-normal text-xs ml-1">
                  ({(heightmap_config.opacityByPercentileStrength ?? 1.0).toFixed(1)}x)
                </span>
              </span>
            </div>
            <Slider
              value={[strengthToSliderPos(heightmap_config.opacityByPercentileStrength ?? 1.0)]}
              min={0}
              max={100}
              step={1}
              onValueChange={(arg0_vals: number[]) =>
                set_heightmap_config((arg0_prev) => ({
                  ...arg0_prev,
                  opacityByPercentileStrength: sliderPosToStrength(arg0_vals[0]),
                }))
              }
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-light">
              <span>Uniform (0%)</span>
              <span>100% (1.0x)</span>
              <span>Max (1000% / 10x)</span>
            </div>

            {/* Quick preset chips */}
            <div className="flex items-center gap-1 pt-0.5 flex-wrap">
              {[
                { label: '0%', val: 0.0 },
                { label: '50%', val: 0.5 },
                { label: '100%', val: 1.0 },
                { label: '300%', val: 3.0 },
                { label: '500%', val: 5.0 },
                { label: '1000%', val: 10.0 },
              ].map((arg0_preset) => {
                let preset = arg0_preset;
                let curr = heightmap_config.opacityByPercentileStrength ?? 1.0;
                let isSelected = Math.abs(curr - preset.val) < 0.05;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      set_heightmap_config((arg0_prev) => ({
                        ...arg0_prev,
                        opacityByPercentileStrength: preset.val,
                      }))
                    }
                    className={`px-1.5 py-0.5 text-[10px] rounded-none border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                        : 'bg-background hover:bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <p className="text-[var(--body-font-size)] text-muted-foreground font-light leading-tight">
        • Right-click / Ctrl+Drag on map to orbit in 3D perspective across all projections.
      </p>
    </div>
  );
}

export default SpikeMapSettings;
