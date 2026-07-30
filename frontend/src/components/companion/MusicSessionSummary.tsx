"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse, Info, Sparkles, X, Loader2, ArrowRight } from "lucide-react";
import { toneColor } from "./CompanionPrimitives";
import type { MusicOutcomeConfidence, MusicSessionSummaryResponse } from "@/lib/types";

const MODE_LABEL: Record<string, string> = {
  FOCUS: "Focus",
  RELAX: "Relax",
  SLEEP: "Sleep prep",
  RECOVERY: "Recovery",
  MORNING: "Morning",
  WORKOUT: "Workout",
};

/** Mirrors `confidenceLabel` in ai/src/musicFeedback.ts — the wording is
 * defined there; this is the visual treatment. */
const CONFIDENCE: Record<MusicOutcomeConfidence, { label: string; color: string }> = {
  measured: { label: "Measured change", color: "var(--lux-sage)" },
  interpretation: { label: "AI interpretation", color: "var(--lux-gold)" },
  insufficient: { label: "Not enough data yet", color: "var(--lux-muted)" },
};

function formatDuration(startedAt: string, endedAt: string | null): string {
  if (!endedAt) return "—";
  const minutes = Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * The card shown after a music session ends.
 *
 * Leads with the sentence, backs it with the number, and puts the
 * explainability underneath rather than hiding it behind a tooltip —
 * "what was played, what was measured, over what window, and how much
 * weight it deserves" is the whole point of the feature, not fine print.
 *
 * When the outcome is `insufficient` this still renders, saying so
 * plainly. A session that couldn't be measured is a normal outcome, not
 * an error state.
 */
export function MusicSessionSummary({ sessionId, onDismiss }: { sessionId: string; onDismiss: () => void }) {
  const [data, setData] = useState<MusicSessionSummaryResponse | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/music-sessions/${sessionId}/summary`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<MusicSessionSummaryResponse>) : null))
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (!loaded) {
    return (
      <section
        className="flex items-center gap-2.5 rounded-[24px] p-5"
        style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
      >
        <Loader2 size={15} className="animate-spin" style={{ color: "var(--lux-muted)" }} aria-hidden="true" />
        <span className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
          Working out what changed…
        </span>
      </section>
    );
  }

  if (!data) return null;

  const { session, nextNight, nextTime } = data;
  const confidence = CONFIDENCE[session.outcomeConfidence ?? "insufficient"];
  const delta = session.outcomeHeartRateDelta;

  return (
    <section
      className="lux-stagger-1 relative overflow-hidden rounded-[24px] p-5"
      style={{
        background: "linear-gradient(160deg, #241a2c 0%, #1d1622 60%, #171220 100%)",
        border: "1px solid var(--lux-hairline-gold)",
      }}
      aria-live="polite"
    >
      <div
        className="pointer-events-none absolute -top-20 -right-12 h-44 w-44 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(95,184,120,0.10) 0%, rgba(95,184,120,0) 70%)" }}
        aria-hidden="true"
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.07em]" style={{ color: "var(--lux-gold)" }}>
            {MODE_LABEL[session.mode] ?? session.mode} session complete
          </p>
          <h2 className="font-luxury-display mt-1 truncate text-[19px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            {session.itemName}
          </h2>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss session summary"
          className="shrink-0 rounded-full p-1"
          style={{ color: "var(--lux-muted)" }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      <p className="relative mt-4 text-[15px] leading-snug" style={{ color: "var(--lux-ink)" }}>
        {session.outcomeSummary ?? "This session hasn't been measured."}
      </p>

      <div className="relative mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div>
          <p className="text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
            Duration
          </p>
          <p className="font-luxury-display tabular mt-0.5 text-[17px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            {formatDuration(session.startedAt, session.endedAt)}
          </p>
        </div>

        {delta !== null && (
          <div>
            <p className="text-[10.5px] uppercase tracking-[0.06em]" style={{ color: "var(--lux-muted)" }}>
              Heart rate
            </p>
            <p
              className="font-luxury-display tabular mt-0.5 flex items-center gap-1 text-[17px] font-semibold"
              style={{ color: delta < 0 ? toneColor("positive") : toneColor("caution") }}
            >
              <HeartPulse size={13} aria-hidden="true" />
              {delta > 0 ? "+" : ""}
              {delta} BPM
            </p>
          </div>
        )}

        <span
          className="rounded-full px-2.5 py-1 text-[11px] font-medium"
          style={{ background: `${confidence.color}1f`, color: confidence.color }}
        >
          {confidence.label}
        </span>
      </div>

      {nextNight && (
        <div className="relative mt-4 border-t pt-3.5" style={{ borderColor: "var(--lux-hairline)" }}>
          <p className="text-[13.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
            {nextNight.summary}
          </p>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
            {nextNight.explanation.caveat}
          </p>
        </div>
      )}

      {/* Explainability, shown rather than tucked away. */}
      <details className="relative mt-4 border-t pt-3.5" style={{ borderColor: "var(--lux-hairline)" }}>
        <summary
          className="flex cursor-pointer list-none items-center gap-1.5 text-[12px]"
          style={{ color: "var(--lux-muted)" }}
        >
          <Info size={12} aria-hidden="true" />
          How this was worked out
        </summary>
        <dl className="mt-2.5 flex flex-col gap-1.5 text-[12px]">
          <div className="flex gap-2">
            <dt className="w-28 shrink-0" style={{ color: "var(--lux-muted)" }}>
              Played
            </dt>
            <dd style={{ color: "var(--lux-ink)" }}>
              {session.itemName} ({session.itemKind}
              {session.genre ? `, ${session.genre}` : ""})
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0" style={{ color: "var(--lux-muted)" }}>
              Measured
            </dt>
            <dd style={{ color: "var(--lux-ink)" }}>
              {delta === null ? "Nothing — too few readings in this window" : "Average heart rate"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0" style={{ color: "var(--lux-muted)" }}>
              Compared
            </dt>
            <dd style={{ color: "var(--lux-ink)" }}>
              {delta === null ? "—" : "15 min before the session vs. during it"}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-28 shrink-0" style={{ color: "var(--lux-muted)" }}>
              Confidence
            </dt>
            <dd style={{ color: "var(--lux-ink)" }}>{confidence.label}</dd>
          </div>
        </dl>
        <p className="mt-2.5 text-[11.5px] leading-relaxed" style={{ color: "var(--lux-muted)" }}>
          MoodSync reports changes that happened alongside your music. It doesn&apos;t claim the music caused them, and
          none of this is medical advice.
        </p>
      </details>

      {nextTime && (
        <div className="relative mt-4 flex items-start gap-2.5 rounded-[16px] p-3" style={{ background: "var(--lux-bg-card-2)" }}>
          <Sparkles size={14} className="mt-0.5 shrink-0" style={{ color: "var(--lux-gold)" }} aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-[12.5px] leading-snug" style={{ color: "var(--lux-ink)" }}>
              {nextTime.text}
            </p>
            <p className="mt-0.5 text-[11px]" style={{ color: "var(--lux-muted)" }}>
              Based on {nextTime.sessions} session{nextTime.sessions === 1 ? "" : "s"}.
            </p>
          </div>
        </div>
      )}

      <Link
        href="/dashboard/music/analytics"
        className="relative mt-4 inline-flex items-center gap-1 text-[12.5px] font-medium"
        style={{ color: "var(--lux-sage)" }}
      >
        See what music works for you
        <ArrowRight size={13} aria-hidden="true" />
      </Link>
    </section>
  );
}
