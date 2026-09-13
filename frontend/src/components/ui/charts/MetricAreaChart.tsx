"use client";

import { useId } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_CURSOR, ACTIVE_DOT } from "./chartChrome";

export interface MetricPoint {
  x: string;
  value: number;
}

/**
 * Single-metric trend: a 2px line over a soft gradient wash in the
 * metric's own hue. One series per chart on purpose — each health
 * metric owns a hue and a labeled panel (see --viz-* in globals.css),
 * which is what lets every panel stay legible without a legend and
 * sidesteps multi-series CVD constraints entirely.
 */
export function MetricAreaChart({
  data,
  color,
  label,
  unit,
  height = 150,
  domain,
}: {
  data: MetricPoint[];
  /** A CSS color — one of the --viz-* tokens. */
  color: string;
  /** Tooltip series name, e.g. "Resting HR". */
  label: string;
  unit?: string;
  height?: number;
  /** Y domain override, e.g. [0, 100] for score metrics. */
  domain?: [number, number];
}) {
  const reducedMotion = usePrefersReducedMotion();
  const gradientId = useId();

  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.28} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="x" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={28} interval="preserveStartEnd" />
        <YAxis hide domain={domain ?? ["auto", "auto"]} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={TOOLTIP_CURSOR}
          formatter={(value) => [unit ? `${value} ${unit}` : String(value), label]}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          dot={false}
          activeDot={ACTIVE_DOT}
          isAnimationActive={!reducedMotion}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
