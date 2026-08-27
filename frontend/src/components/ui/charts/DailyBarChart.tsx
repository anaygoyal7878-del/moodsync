"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE } from "./chartChrome";

export interface DailyBarPoint {
  x: string;
  value: number;
}

/**
 * One-bar-per-day magnitude chart (steps, calories). Bars are anchored
 * to a zero baseline with 4px rounded data-ends; hover highlights the
 * bar with a soft wash rather than a crosshair (per-mark hover is the
 * right interaction for bars).
 */
export function DailyBarChart({
  data,
  color,
  label,
  unit,
  height = 150,
  formatValue,
}: {
  data: DailyBarPoint[];
  /** A CSS color — one of the --viz-* tokens. */
  color: string;
  label: string;
  unit?: string;
  height?: number;
  formatValue?: (value: number) => string;
}) {
  const reducedMotion = usePrefersReducedMotion();

  if (data.length < 2) return null;

  const format = formatValue ?? ((v: number) => (unit ? `${v.toLocaleString()} ${unit}` : v.toLocaleString()));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="x" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval="preserveStartEnd" />
        <YAxis hide domain={[0, "auto"]} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: "var(--surface-highlight)" }}
          formatter={(value) => [format(Number(value)), label]}
        />
        <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={!reducedMotion} />
      </BarChart>
    </ResponsiveContainer>
  );
}
