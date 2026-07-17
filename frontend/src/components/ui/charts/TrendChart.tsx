"use client";

import { LineChart, Line, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export interface TrendChartPoint {
  date: string;
  value: number;
}

/** Fuller chart with a minimal axis and a dark-theme tooltip — for a
 * dedicated chart section rather than an inline indicator (see
 * Sparkline for that). Pure presentational, same "receives data as a
 * prop" rule as Sparkline. Recharts renders its own SVG text/tooltip
 * DOM outside Tailwind's reach, so the tooltip's dark styling has to be
 * passed as inline style overrides here — that's expected, not a code
 * smell, for this one library. */
export function TrendChart({
  data,
  label,
  color = "var(--brand)",
  unit,
  height = 180,
}: {
  data: TrendChartPoint[];
  label?: string;
  color?: string;
  unit?: string;
  height?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();

  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
        <XAxis
          dataKey="date"
          tick={{ fill: "var(--ink-muted)", fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: "var(--line)" }}
        />
        <Tooltip
          contentStyle={{
            background: "var(--surface-raised)",
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.75rem",
            color: "var(--ink)",
          }}
          labelStyle={{ color: "var(--ink-muted)" }}
          formatter={(value) => [unit ? `${value} ${unit}` : String(value), label]}
        />
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
      </LineChart>
    </ResponsiveContainer>
  );
}
