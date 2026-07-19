"use client";

import type { ReactNode } from "react";

interface LabeledSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Renders the current value with its unit, e.g. "75%" or "2700 K". */
  formatValue: (value: number) => ReactNode;
  /** Evenly-spaced labels drawn under the track, e.g. ["Very Warm", …,
   * "Daylight"] — purely descriptive, doesn't change the real min/max. */
  segments?: string[];
  helpText?: string;
  id?: string;
}

/** A native `<input type="range">` (real OS-level slider behavior —
 * keyboard, touch, screen readers all work for free) styled to match the
 * dashboard's tokens via `accentColor`, paired with a large current-value
 * readout so no control on the automation builder ever shows a bare
 * number. Deliberately not built on ElasticSlider — that component bakes
 * in its own `Math.round(value)`-only readout with no way to inject a
 * unit/label, which is exactly the "250" / "60" problem this is meant to
 * fix. */
export function LabeledSlider({ label, value, min, max, step = 1, onChange, formatValue, segments, helpText, id }: LabeledSliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <span className="tabular text-sm font-semibold text-brand">{formatValue(value)}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-hover"
        style={{ accentColor: "var(--brand)" }}
      />
      {segments && segments.length > 0 && (
        <div className="flex justify-between text-[11px] text-ink-muted">
          {segments.map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      )}
      {helpText && <p className="text-xs text-ink-muted">{helpText}</p>}
    </div>
  );
}
