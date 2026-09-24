"use client";

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useChartMotion, CHART_ANIMATION } from "./useChartMotion";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, formatMinutesAsDuration } from "./chartChrome";

export interface SleepStagesPoint {
  x: string;
  deep: number;
  rem: number;
  light: number;
}

/**
 * Stacked minutes-per-stage bars, one per night. Stage depth is ordered
 * data, so the encoding is an ordinal ramp of one violet hue (deep =
 * lightest/most prominent step on this dark surface — see the
 * --viz-sleep-* ramp in globals.css, validated monotone with every step
 * clearing the card surface) rather than three unrelated hues. Deep sits
 * at the baseline with REM and light stacked above, so the stage that
 * matters most is also the one anchored and easiest to compare across
 * nights. A 2px card-surface stroke keeps adjacent segments separated
 * without relying on hue alone.
 */
const STAGES = [
  { key: "deep", label: "Deep", color: "var(--viz-sleep-deep)" },
  { key: "rem", label: "REM", color: "var(--viz-sleep-rem)" },
  { key: "light", label: "Light", color: "var(--viz-sleep-light)" },
] as const;

export function SleepStagesChart({ data, height = 180 }: { data: SleepStagesPoint[]; height?: number }) {
  const { ref, visible, animate } = useChartMotion();

  if (data.length === 0) return null;

  return (
    <div ref={ref} style={{ height }}>
      {visible && (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="x" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval="preserveStartEnd" />
        <YAxis hide domain={[0, "auto"]} />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: "var(--surface-highlight)" }}
          formatter={(value, name) => [formatMinutesAsDuration(Number(value)), String(name)]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: "0.75rem", color: "var(--ink-secondary)", paddingTop: 6 }}
        />
        {STAGES.map((stage, i) => (
          <Bar
            key={stage.key}
            dataKey={stage.key}
            name={stage.label}
            stackId="sleep"
            fill={stage.color}
            stroke="var(--lux-bg-card)"
            strokeWidth={2}
            maxBarSize={36}
            radius={i === STAGES.length - 1 ? [4, 4, 0, 0] : undefined}
            isAnimationActive={animate} {...CHART_ANIMATION}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
      )}
    </div>
  );
}
