"use client";

import { useEffect, useState } from "react";
import { CHART_ANIMATION } from "@/components/ui/charts/useChartMotion";
import Link from "next/link";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { HeartPulse, Brain } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePrefersReducedMotion } from "@/components/ui/charts/usePrefersReducedMotion";
import { AXIS_TICK, GRID_STROKE, TOOLTIP_CONTENT_STYLE, TOOLTIP_LABEL_STYLE } from "@/components/ui/charts/chartChrome";
import { SampleBadge } from "@/components/ui/SampleBadge";
import { sampleMusicSessions } from "@/lib/sampleData";
import type { MusicSessionEntry } from "@/lib/types";

interface EffectPoint {
  x: string;
  delta: number;
  itemName: string;
  mode: string;
}

/** Signed per-session deltas around a zero baseline: bars below zero
 * mean the number came DOWN while listening — for heart rate and
 * stress, usually the point. One metric per chart (bpm and stress
 * points are different scales; never share an axis), each in the
 * metric's own app-wide hue. */
function DeltaBars({
  data,
  color,
  unit,
  height = 130,
}: {
  data: EffectPoint[];
  color: string;
  unit: string;
  height?: number;
}) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: 4, bottom: 0 }} barCategoryGap="35%">
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="x" tick={AXIS_TICK} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis hide />
        <ReferenceLine y={0} stroke="var(--line-strong)" />
        <Tooltip
          contentStyle={TOOLTIP_CONTENT_STYLE}
          labelStyle={TOOLTIP_LABEL_STYLE}
          cursor={{ fill: "var(--surface-highlight)" }}
          formatter={(value, _name, entry) => {
            const point = entry.payload as EffectPoint;
            const signed = `${Number(value) > 0 ? "+" : ""}${value} ${unit}`;
            return [signed, point.itemName];
          }}
        />
        <Bar dataKey="delta" fill={color} radius={2} maxBarSize={26} isAnimationActive={!reducedMotion} {...CHART_ANIMATION} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function MetricBlock({
  icon: Icon,
  label,
  color,
  data,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  color: string;
  data: EffectPoint[];
  unit: string;
}) {
  const mean = data.reduce((sum, p) => sum + p.delta, 0) / data.length;
  const rounded = Math.round(mean * 10) / 10;

  return (
    <div className="rounded-[16px] p-4" style={{ border: "1px solid var(--lux-hairline)" }}>
      <div className="flex items-center gap-1.5">
        <Icon size={13} style={{ color }} aria-hidden="true" />
        <p className="text-[11px] font-medium uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
          {label}
        </p>
      </div>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 text-[13px]" style={{ color: "var(--lux-ink)" }}>
        <span className="font-luxury-display tabular text-[22px] font-semibold leading-none">
          {rounded > 0 ? "+" : ""}
          {rounded}
          <span className="ml-1 text-[12px] font-normal" style={{ color: "var(--lux-muted)" }}>
            {unit}
          </span>
        </span>
        <span className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
          avg per session
        </span>
      </p>
      <div className="mt-3">
        <DeltaBars data={data} color={color} unit={unit} />
      </div>
    </div>
  );
}

/**
 * How music actually moves this person's body: per-session change in
 * heart rate and stress from the session's own baseline (captured when
 * playback starts) to when it ends. Built from the same stored session
 * outcomes the analytics page ranks playlists by — this is the raw
 * session-by-session view, oldest to newest.
 */
export function MusicEffectChart() {
  const [sessions, setSessions] = useState<MusicSessionEntry[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/music-sessions?limit=30", { cache: "no-store" })
      // A failed fetch resolves to "no sessions" rather than staying in
      // the loading state forever — the empty-state copy is the honest
      // render for both "none yet" and "couldn't load".
      .then((res) => (res.ok ? (res.json() as Promise<{ sessions: MusicSessionEntry[] }>) : { sessions: [] }))
      .then((data) => {
        if (!cancelled) setSessions(data.sessions);
      })
      .catch(() => {
        if (!cancelled) setSessions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (sessions === null) return null; // still loading — no skeleton flash for a secondary section

  const real = sessions.filter(
    (s) => s.endedAt !== null && (s.outcomeHeartRateDelta !== null || s.outcomeStressDelta !== null),
  );
  // Nothing measured yet → draw the sample week, always behind the
  // badge below. Real sessions win whenever any exist.
  const isSample = real.length === 0;
  const measured = (isSample ? sampleMusicSessions() : real).slice().reverse(); // API is newest-first; charts read oldest → newest

  const toPoint = (s: MusicSessionEntry, delta: number): EffectPoint => ({
    x: new Date(s.startedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    delta,
    itemName: s.itemName,
    mode: s.mode,
  });

  const heartData = measured.filter((s) => s.outcomeHeartRateDelta !== null).map((s) => toPoint(s, s.outcomeHeartRateDelta as number));
  const stressData = measured.filter((s) => s.outcomeStressDelta !== null).map((s) => toPoint(s, s.outcomeStressDelta as number));

  if (heartData.length === 0 && stressData.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      {isSample && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <SampleBadge />
          <p className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
            Nothing measured yet — this is what a week of sessions looks like, not your own.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {heartData.length > 0 && (
          <MetricBlock icon={HeartPulse} label="Heart rate change" color="var(--viz-heart)" data={heartData} unit="bpm" />
        )}
        {stressData.length > 0 && (
          <MetricBlock icon={Brain} label="Stress change" color="var(--viz-stress)" data={stressData} unit="pts" />
        )}
      </div>
      <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
        Each bar is one session, measured from its own starting baseline — below the line means it came down while you
        listened.{" "}
        <Link href="/dashboard/music/analytics" className="underline underline-offset-2" style={{ color: "var(--lux-sage)" }}>
          See which playlists work best
        </Link>
      </p>
    </div>
  );
}
