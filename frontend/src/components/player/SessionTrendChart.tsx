"use client";

import { useId } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { usePrefersReducedMotion } from "@/components/ui/charts/usePrefersReducedMotion";
import { TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_CURSOR } from "@/components/ui/charts/chartChrome";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { sampleSessionHeartRate } from "@/lib/sampleData";

export interface SessionTrendPoint {
  minute: number;
  bpm: number;
}

/**
 * Heart rate through the current listening session, against the
 * baseline captured when playback started.
 *
 * The player could already say what your heart rate *is*; this is the
 * part that shows it *moving*, which is the whole premise of the
 * Listening Journey screen. With no session running it draws the sample
 * curve behind a "Sample data" badge, so the screen demonstrates what it
 * measures instead of sitting empty — never implying the shape is yours.
 */
export function SessionTrendChart({
  data,
  baseline,
  isSample = false,
}: {
  data: SessionTrendPoint[];
  /** Session-start heart rate — drawn as the reference line every point
   * is read against. */
  baseline: number | null;
  isSample?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const gradientId = useId();

  const points = data.length > 1 ? data : sampleSessionHeartRate();
  const sample = isSample || data.length < 2;
  const effectiveBaseline = sample ? points[0].bpm : baseline;

  const current = points[points.length - 1].bpm;
  const delta = effectiveBaseline === null ? null : current - effectiveBaseline;

  return (
    <div className="metallic-border overflow-hidden rounded-[28px]">
      <div className="glass-surface rounded-[27px] p-4">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
              Heart rate this session
            </span>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-[22px] font-medium tabular-nums" style={{ color: "var(--text-primary)" }}>
                {current}
                <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--text-muted)" }}>
                  bpm
                </span>
              </span>
              {delta !== null && delta !== 0 && (
                <span
                  className="text-[11px] font-medium tabular-nums"
                  style={{ color: delta < 0 ? "var(--sage)" : "var(--gold)" }}
                >
                  {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} from baseline
                </span>
              )}
            </div>
          </div>
          {sample && <SampleBadge />}
        </div>

        <ResponsiveContainer width="100%" height={110}>
          <AreaChart data={points} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--viz-heart)" stopOpacity={0.32} />
                <stop offset="100%" stopColor="var(--viz-heart)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="minute"
              tick={{ fill: "var(--text-muted)", fontSize: 9 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(m) => `${m}m`}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis hide domain={["dataMin - 4", "dataMax + 4"]} />
            {effectiveBaseline !== null && (
              <ReferenceLine
                y={effectiveBaseline}
                stroke="var(--text-faint)"
                strokeDasharray="4 4"
                label={{
                  value: "baseline",
                  position: "insideTopLeft",
                  fill: "var(--text-muted)",
                  fontSize: 9,
                }}
              />
            )}
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              cursor={TOOLTIP_CURSOR}
              labelFormatter={(m) => `${m} min in`}
              formatter={(value) => [`${value} bpm`, "Heart rate"]}
            />
            <Area
              type="monotone"
              dataKey="bpm"
              stroke="var(--viz-heart)"
              strokeWidth={2}
              fill={`url(#${gradientId})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--base)" }}
              isAnimationActive={!reducedMotion}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
