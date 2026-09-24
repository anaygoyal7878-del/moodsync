"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE, TOOLTIP_CURSOR, ACTIVE_DOT } from "@/components/ui/charts/chartChrome";
import { useChartMotion, CHART_ANIMATION } from "@/components/ui/charts/useChartMotion";

/**
 * How heart rate and stress moved *during* one listening session.
 *
 * This is the chart the session model could not draw before: it stored
 * a baseline and an outcome delta, which answers "did anything change"
 * but not "how". A session that dropped ten beats in the first two
 * minutes and drifted back is a completely different session from one
 * that came down steadily, and a delta reports them identically.
 *
 * Two series on two axes, because they are on different scales and
 * forcing them onto one would flatten whichever has the smaller range.
 * Heart rate is the honest measurement and leads in the warm metric
 * colour; stress is MoodSync's own computed score and is drawn
 * deliberately quieter — a dashed, muted line — so the two never read
 * as equally direct observations of the body.
 */

interface SamplePoint {
  at: string;
  heartRate: number | null;
  stressScore: number | null;
}

interface ChartRow {
  /** Seconds since the first sample. Seconds rather than minutes
   * because rounding to whole minutes collapsed every sample in a short
   * session onto the same tick — a six-sample session rendered its axis
   * as "0m 0m 0m 0m 0m 0m". The axis formatter turns these back into
   * something readable. */
  elapsed: number;
  heartRate: number | null;
  stressScore: number | null;
}

/** m:ss under ten minutes, whole minutes past that. A 40-minute session
 * labelled in m:ss is unreadable; a four-minute one labelled in whole
 * minutes has three identical ticks. */
function formatElapsed(seconds: number): string {
  if (seconds < 600) {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `${Math.round(seconds / 60)}m`;
}

export function SessionEvolutionChart({ sessionId }: { sessionId: string }) {
  const [rows, setRows] = useState<ChartRow[] | null>(null);
  // Was hardcoded to never animate, which ignored the motion preference
  // in both directions — no motion for people who wanted it.
  const { animate } = useChartMotion();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/music-sessions/${sessionId}/samples`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((data: { samples: SamplePoint[] }) => {
        if (cancelled) return;
        const samples = data.samples ?? [];
        if (samples.length === 0) {
          setRows([]);
          return;
        }
        // Plotted against time-into-session rather than wall clock:
        // "eleven minutes in" is the axis someone reads a session on,
        // and it makes two sessions comparable.
        const start = new Date(samples[0]!.at).getTime();
        setRows(
          samples.map((s) => ({
            elapsed: Math.round((new Date(s.at).getTime() - start) / 1000),
            heartRate: s.heartRate,
            stressScore: s.stressScore,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load this session's readings.");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (error) {
    return (
      <p role="alert" className="text-[12.5px]" style={{ color: "var(--lux-muted)" }}>
        {error}
      </p>
    );
  }

  if (rows === null) {
    return <div className="h-[180px] w-full animate-pulse rounded-[14px]" style={{ background: "var(--lux-bg-card-2)" }} />;
  }

  // Two samples is a line between two points, which is a delta drawn
  // long-ways rather than an evolution. Say so instead of drawing it.
  if (rows.length < 3) {
    return (
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
        Not enough readings came through during this session to chart how it moved. Sessions need a few minutes of
        samples from your device before a trend is real.
      </p>
    );
  }

  const firstHr = rows.find((r) => r.heartRate !== null)?.heartRate ?? null;

  return (
    <div className="h-[200px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 4, left: -18 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="elapsed"
            type="number"
            domain={[0, "dataMax"]}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickFormatter={formatElapsed}
          />
          <YAxis yAxisId="hr" tick={AXIS_TICK} tickLine={false} axisLine={false} width={38} domain={["dataMin - 5", "dataMax + 5"]} />
          <YAxis yAxisId="stress" orientation="right" hide domain={[0, 100]} />

          {/* Where the session started, so the line is read as movement
              from a known point rather than as an absolute level. */}
          {firstHr !== null && (
            <ReferenceLine
              yAxisId="hr"
              y={firstHr}
              stroke="var(--gold-muted)"
              strokeDasharray="3 4"
              label={{ value: "start", position: "insideTopLeft", fill: "var(--lux-muted)", fontSize: 10 }}
            />
          )}

          <Tooltip
            contentStyle={TOOLTIP_CONTENT_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            cursor={TOOLTIP_CURSOR}
            labelFormatter={(seconds) => `${formatElapsed(Number(seconds))} into the session`}
            formatter={(value, name) => [value as number, name === "heartRate" ? "Heart rate (bpm)" : "Stress"]}
          />

          <Line
            yAxisId="hr"
            type="monotone"
            dataKey="heartRate"
            stroke="var(--viz-heart)"
            strokeWidth={2}
            dot={false}
            activeDot={ACTIVE_DOT}
            connectNulls
            isAnimationActive={animate} {...CHART_ANIMATION}
          />
          <Line
            yAxisId="stress"
            type="monotone"
            dataKey="stressScore"
            stroke="var(--viz-stress)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={ACTIVE_DOT}
            connectNulls
            isAnimationActive={animate} {...CHART_ANIMATION}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
