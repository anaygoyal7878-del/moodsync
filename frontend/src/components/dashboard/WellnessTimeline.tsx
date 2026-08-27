"use client";

import { LineChart, Line, XAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Card } from "@/components/ui/Card";
import { usePrefersReducedMotion } from "@/components/ui/charts/usePrefersReducedMotion";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_CURSOR } from "@/components/ui/charts/chartChrome";
import type { NormalizedBiometricReading } from "@moodsync/shared";

interface SeriesDef {
  key: "recoveryScore" | "sleepScore" | "stressLevel";
  label: string;
  color: string;
}

/** Each series wears its metric's own app-wide hue (--viz-*, defined in
 * globals.css) — this exact triple is one of the validated adjacent
 * sets, so the three lines stay separable under CVD simulation on the
 * card surface. */
const SERIES: SeriesDef[] = [
  { key: "recoveryScore", label: "Recovery", color: "var(--viz-recovery)" },
  { key: "sleepScore", label: "Sleep", color: "var(--viz-sleep)" },
  { key: "stressLevel", label: "Stress", color: "var(--viz-stress)" },
];

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric" });
}

/** Adapts web/'s WellnessTimeline concept to this product's real,
 * provider-native scores instead of a simulated 6-state taxonomy — the
 * `history` array is already fetched by BiometricsSection for the
 * single-metric heart rate TrendChart, so this reuses that same data. */
export function WellnessTimeline({ history }: { history: NormalizedBiometricReading[] }) {
  const reducedMotion = usePrefersReducedMotion();

  const data = [...history]
    .reverse()
    .filter((r) => r.recoveryScore !== undefined || r.sleepScore !== undefined || r.stressLevel !== undefined)
    .map((r) => ({
      date: shortTime(r.timestamp),
      recoveryScore: r.recoveryScore,
      sleepScore: r.sleepScore,
      stressLevel: r.stressLevel,
    }));

  const availableSeries = SERIES.filter((s) => data.some((d) => d[s.key] !== undefined));
  if (data.length < 2 || availableSeries.length === 0) return null;

  return (
    <Card>
      <p className="mb-3 text-xs uppercase tracking-wide text-ink-muted">Wellness timeline · last {data.length} readings</p>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="date" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} />
          <Tooltip contentStyle={TOOLTIP_CONTENT_STYLE} labelStyle={TOOLTIP_LABEL_STYLE} cursor={TOOLTIP_CURSOR} />
          <Legend wrapperStyle={{ fontSize: "0.75rem", color: "var(--ink-secondary)" }} />
          {availableSeries.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
              isAnimationActive={!reducedMotion}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
