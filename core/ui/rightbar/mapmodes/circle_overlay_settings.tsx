import React from 'react';
import { CircleOverlayConfig } from '@framework/geopng/types.ts';
import { Icon } from '@ui/components/icon';
import { Slider } from '@ui/components/slider';
import { useLocalisation } from '@localisation';

export interface CircleOverlaySettingsProps {
  circleOverlayConfig: CircleOverlayConfig;
  setCircleOverlayConfig: React.Dispatch<React.SetStateAction<CircleOverlayConfig>>;
}

/**
 * Settings configuration subpanel for equal-area circle sizing overlay mode.
 *
 * @param {CircleOverlaySettingsProps} arg0_props
 *
 * @returns {React.ReactElement}
 */
export function CircleOverlaySettings (arg0_props: CircleOverlaySettingsProps) {
  //Convert from parameters
  let props = arg0_props;
  let {
    circleOverlayConfig: circle_overlay_config,
    setCircleOverlayConfig: set_circle_overlay_config,
  } = props;

  //Declare local instance variables
  let { t } = useLocalisation();

  //Return statement
  return (
    <div className="w-full space-y-1.5 animate-in fade-in-0 duration-100">
      <div className="flex items-center justify-between pb-1 border-b border-border/60">
        <span className="text-[var(--body-font-size)] font-bold text-foreground flex items-center gap-1.5">
          <Icon name="scatter_plot" />
          <span>{t.mapmodes.circles.title}</span>
        </span>
      </div>

      {/* Custom Percentile Cutoff */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.circles.percentileCutoff}</span>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground font-medium">P</span>
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={circle_overlay_config.percentileCutoff}
              onChange={(arg0_e) => {
                let val = parseFloat(arg0_e.target.value);
                if (Number.isFinite(val))
                  set_circle_overlay_config((arg0_prev) => ({
                    ...arg0_prev,
                    percentileCutoff: Math.max(0, Math.min(100, val)),
                  }));
              }}
              className="w-14 h-6 px-1 font-bold text-center bg-background border border-border text-foreground focus:outline-none focus:border-primary text-[var(--body-font-size)]"
            />
          </div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-5 gap-1">
          {[90, 95, 98, 99, 99.5].map((arg0_p) => {
            let p = arg0_p;
            return (
              <button
                key={p}
                type="button"
                onClick={() =>
                  set_circle_overlay_config((arg0_prev) => ({ ...arg0_prev, percentileCutoff: p }))
                }
                className={`px-1 py-0.5 text-[var(--body-font-size)] border rounded-none text-center cursor-pointer transition-colors ${
                  circle_overlay_config.percentileCutoff === p
                    ? 'bg-primary text-white font-bold border-accent shadow-sm'
                    : 'bg-background hover:bg-muted text-muted-foreground border-border'
                }`}
              >
                P{p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Linear Area Expansion Scale */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.circles.areaScale}</span>
          <span className="text-foreground font-bold">
            {(circle_overlay_config.baseRadius || 1.0).toFixed(1)} ha/unit
          </span>
        </div>
        <Slider
          value={[Math.round((circle_overlay_config.baseRadius || 1.0)*10)]}
          min={1}
          max={50}
          step={1}
          onValueChange={(arg0_vals: number[]) =>
            set_circle_overlay_config((arg0_prev) => ({
              ...arg0_prev,
              baseRadius: arg0_vals[0]/10,
            }))
          }
        />
      </div>

      {/* Outline Stroke Width */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.circles.outlineStroke}</span>
          <span className="text-foreground font-bold">
            {circle_overlay_config.strokeWidth || 2} px
          </span>
        </div>
        <Slider
          value={[circle_overlay_config.strokeWidth || 2]}
          min={1}
          max={6}
          step={1}
          onValueChange={(arg0_vals: number[]) =>
            set_circle_overlay_config((arg0_prev) => ({
              ...arg0_prev,
              strokeWidth: arg0_vals[0],
            }))
          }
        />
      </div>

      {/* Black Halo Thickness */}
      <div className="space-y-1.5">
        <div className="flex justify-between items-center text-[var(--body-font-size)]">
          <span className="text-muted-foreground">{t.mapmodes.haloThicknessLabel}</span>
          <span className="text-foreground font-bold">
            {circle_overlay_config.haloWidth ?? 1} {t.mapmodes.haloThicknessUnit}
          </span>
        </div>
        <Slider
          value={[circle_overlay_config.haloWidth ?? 1]}
          min={0}
          max={6}
          step={1}
          onValueChange={(arg0_vals: number[]) =>
            set_circle_overlay_config((arg0_prev) => ({
              ...arg0_prev,
              haloWidth: arg0_vals[0],
            }))
          }
        />
      </div>

      <p className="text-[var(--body-font-size)] text-muted-foreground font-light leading-tight">
        {t.mapmodes.haloDescription}
      </p>
    </div>
  );
}

export default CircleOverlaySettings;
