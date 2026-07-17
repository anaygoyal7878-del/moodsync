"use client";

import { LineChart, Line, ResponsiveContainer } from "recharts";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export interface SparklinePoint {
  value: number;
}

/** Compact inline trend indicator — no axes, grid, or tooltip. Pure
 * presentational: receives already-fetched data as a prop, never
 * fetches anything itself (the section components that use this already
 * get their data from the dashboard page's server-side fetch). */
export function Sparkline({ data, color = "var(--brand)", height = 32 }: { data: SparklinePoint[]; color?: string; height?: number }) {
  const reducedMotion = usePrefersReducedMotion();

  if (data.length < 2) return null;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data}>
        <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={!reducedMotion} />
      </LineChart>
    </ResponsiveContainer>
  );
}
