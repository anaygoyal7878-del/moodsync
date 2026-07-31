"use client";

import { Sparkles, Heart, ArrowRight } from "lucide-react";
import type { MusicLiveStateResponse } from "@/lib/types";

/**
 * The Emotional Progress panel — current state, and the journey from
 * the session's baseline to now.
 *
 * Every number here is real: the baseline columns come from the
 * biometric snapshot taken when the session opened (`MusicSession`'s
 * stored `baselineStressScore` / `baselineHeartRate`), and the "now"
 * columns from the live wellness scores. The design spec's example
 * figures (stress 80 → 12, focus 30 → 75) are illustrative of the
 * layout, not values the component hardcodes — a wellness app that
 * invents an improvement is worse than one that shows nothing.
 *
 * When a metric can't be measured the row says so and the bar stays
 * flat, rather than animating to a comforting number.
 */

function MetricRow({
  name,
  value,
  variant,
}: {
  name: string;
  value: number | null;
  /** "baseline" renders a flat white bar; "now" renders the gold→sage
   * gradient and animates. */
  variant: "baseline" | "now";
}) {
  const width = value ?? 0;

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[9px] uppercase tracking-[0.18em]" style={{ color: "var(--text-muted)" }}>
        <span>{name}</span>
        <span className="tabular-nums">{value === null ? "—" : `${value}%`}</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-secondary)" }}>
        {value !== null && (
          <div
            className={variant === "now" ? "bar-grow h-full rounded-full" : "h-full rounded-full"}
            style={
              variant === "now"
                ? { width: `${width}%`, background: "linear-gradient(to right, var(--gold), var(--sage))" }
                : { width: `${width}%`, background: "rgba(255,255,255,0.14)" }
            }
          />
        )}
      </div>
    </div>
  );
}

/** Circular ring driven by the real progress value from
 * `describeActiveState`. Renders as an empty track — never a partial
 * arc — when nothing measurable has moved. */
function ProgressRing({ progress }: { progress: number | null }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (progress ?? 0));

  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg className="h-full w-full -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="var(--surface-highlight)" strokeWidth="2" />
        <defs>
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--gold)" />
            <stop offset="100%" stopColor="var(--sage)" />
          </linearGradient>
        </defs>
        {progress !== null && (
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="url(#ring-gradient)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 3s cubic-bezier(0.4, 0, 0.2, 1)" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <Heart
          size={15}
          className={progress !== null ? "wave-liquid" : ""}
          style={{ color: "var(--gold)" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}

export function EmotionalProgressPanel({ live }: { live: MusicLiveStateResponse }) {
  const { session, current, activeState } = live;
  const hasBaseline = session !== null;

  return (
    <div className="space-y-4">
      {/* Current state */}
      <div className="metallic-border overflow-hidden rounded-[28px]">
        <div className="glass-surface flex items-center gap-4 rounded-[27px] p-4">
          <div className="min-w-0 flex-1">
            <span className="text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
              Active State
            </span>
            <div className="mt-2 flex items-center gap-2">
              <Sparkles size={14} style={{ color: "var(--gold)" }} aria-hidden="true" />
              <span className="font-display text-[15px] font-medium" style={{ color: "var(--text-primary)" }}>
                {activeState?.label ?? "Nothing playing"}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-snug" style={{ color: "var(--text-muted)" }}>
              {activeState?.detail ?? "Start something from the Music page and MoodSync will follow along."}
            </p>
          </div>
          <ProgressRing progress={activeState?.progress ?? null} />
        </div>
      </div>

      {/* Baseline → now */}
      <div className="metallic-border overflow-hidden rounded-[28px]">
        <div className="glass-surface rounded-[27px] p-4">
          <div className="mb-4 flex items-center justify-between">
            <span className="text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
              {live.journeyLabel ?? "Baseline → Now"}
            </span>
            {live.elapsedMinutes !== undefined && live.elapsedMinutes !== null && (
              <span className="text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>
                {live.elapsedMinutes} min in
              </span>
            )}
          </div>

          {hasBaseline ? (
            <div className="flex items-stretch gap-3">
              <div className="flex-1 space-y-3">
                <p className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--text-muted)" }}>
                  When you started
                </p>
                <MetricRow name="Stress" value={session.baselineStressScore} variant="baseline" />
                <MetricRow name="Recovery" value={session.baselineRecoveryScore} variant="baseline" />
              </div>

              <div className="flex flex-col items-center justify-center px-1">
                <div className="w-px flex-1" style={{ background: "var(--surface-highlight)" }} aria-hidden="true" />
                <ArrowRight size={12} className="my-2 shrink-0" style={{ color: "var(--text-faint)" }} aria-hidden="true" />
                <div className="w-px flex-1" style={{ background: "var(--surface-highlight)" }} aria-hidden="true" />
              </div>

              <div className="flex-1 space-y-3">
                <p className="text-[8px] font-bold uppercase tracking-[0.2em]" style={{ color: "var(--sage)" }}>
                  Now
                </p>
                <MetricRow name="Stress" value={current.stress} variant="now" />
                <MetricRow name="Focus" value={current.focus} variant="now" />
              </div>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              MoodSync takes a reading when a session starts, then watches how it changes. Nothing is being measured
              right now.
            </p>
          )}

          {hasBaseline && current.stress === null && (
            <p className="mt-4 text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Stress scoring needs heart rate variability and a few days of history. The bars fill in once your wearable
              has enough to compare against.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
