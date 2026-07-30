"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, RotateCcw, HeartPulse, ExternalLink, Footprints, Droplets, Wind, StretchHorizontal, X } from "lucide-react";
import type { BreakSuggestionResponse } from "@/lib/types";

const DURATIONS = [15, 25, 45, 60, 90] as const;
const HR_POLL_INTERVAL_MS = 30_000;
/** How often to *ask* whether a break is due. The answer is almost
 * always no — the pacing lives server-side in ai/src/smartBreaks.ts, not
 * in this interval. */
const BREAK_CHECK_INTERVAL_MS = 5 * 60_000;

const BREAK_ICON = {
  walk: Footprints,
  stretch: StretchHorizontal,
  water: Droplets,
  breathing: Wind,
} as const;

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Focus Session — same real-timer, log-on-completion-only pattern as
 * LuxuryMeditation.tsx (no server-side timer enforcement; stopping
 * early logs nothing). The focus score shown at completion is computed
 * server-side from heart rate stability during the session window (see
 * ai/src/focusScore.ts) — it is a proxy for sustained engagement, not a
 * measurement of attention. Notification-silencing and
 * distraction-detection are explicitly not built: iOS has no public API
 * for a third-party app to silence notifications, and no distraction
 * signal exists in this app — see docs/FOCUS_SESSIONS.md.
 */
export function LuxuryFocusSession() {
  const router = useRouter();
  const [duration, setDuration] = useState<number>(25);
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");
  const [remaining, setRemaining] = useState(duration * 60);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [focusScore, setFocusScore] = useState<number | null | undefined>(undefined);
  const [liveHeartRate, setLiveHeartRate] = useState<number | null>(null);
  const [breakSuggestion, setBreakSuggestion] = useState<BreakSuggestionResponse["suggestion"]>(null);

  const startedAtRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hrIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const breakIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** When the last suggestion was shown, so the server can space the
   * next one out — the spacing rule lives in smartBreaks.ts, this just
   * reports what it needs to apply it. */
  const lastSuggestionAtRef = useRef<number | null>(null);

  function clearTimers() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (hrIntervalRef.current) clearInterval(hrIntervalRef.current);
    if (breakIntervalRef.current) clearInterval(breakIntervalRef.current);
  }

  useEffect(() => clearTimers, []);

  function pollHeartRate() {
    fetch("/api/biometrics/latest", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { reading: { heartRate?: number } | null } | null) => {
        if (data?.reading?.heartRate !== undefined) setLiveHeartRate(data.reading.heartRate);
      })
      .catch(() => {});
  }

  function checkForBreak() {
    if (!startedAtRef.current) return;
    const params = new URLSearchParams({ startedAt: startedAtRef.current });
    if (lastSuggestionAtRef.current !== null) {
      params.set("minutesSinceLastSuggestion", String((Date.now() - lastSuggestionAtRef.current) / 60_000));
    }
    fetch(`/api/focus-sessions/break-suggestion?${params}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<BreakSuggestionResponse>) : null))
      .then((data) => {
        if (!data?.suggestion) return;
        setBreakSuggestion(data.suggestion);
        lastSuggestionAtRef.current = Date.now();
      })
      .catch(() => {});
  }

  function completeSession() {
    clearTimers();
    setBreakSuggestion(null);
    setStatus("completed");

    if (!startedAtRef.current) return;
    setSaveError(null);
    fetch("/api/focus-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes: duration, startedAt: startedAtRef.current }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("save failed"))))
      .then((data: { session: { focusScore: number | null } }) => setFocusScore(data.session.focusScore))
      .catch(() => setSaveError("Session finished, but couldn't be saved."))
      .finally(() => router.refresh());
  }

  function tick() {
    setRemaining((prev) => {
      if (prev <= 1) {
        completeSession();
        return 0;
      }
      return prev - 1;
    });
  }

  function handleStart() {
    if (status === "idle") {
      startedAtRef.current = new Date().toISOString();
      setRemaining(duration * 60);
      setFocusScore(undefined);
    }
    setStatus("running");
    intervalRef.current = setInterval(tick, 1000);
    pollHeartRate();
    hrIntervalRef.current = setInterval(pollHeartRate, HR_POLL_INTERVAL_MS);
    breakIntervalRef.current = setInterval(checkForBreak, BREAK_CHECK_INTERVAL_MS);
  }

  function handlePause() {
    clearTimers();
    setStatus("paused");
  }

  function handleReset() {
    clearTimers();
    startedAtRef.current = null;
    lastSuggestionAtRef.current = null;
    setStatus("idle");
    setRemaining(duration * 60);
    setSaveError(null);
    setLiveHeartRate(null);
    setBreakSuggestion(null);
  }

  const totalSeconds = duration * 60;
  const progress = totalSeconds === 0 ? 0 : (totalSeconds - remaining) / totalSeconds;
  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col gap-6">
      <section className="lux-stagger-1 relative flex flex-col items-center justify-center py-6">
        <div
          className="pointer-events-none absolute top-1/2 left-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "radial-gradient(circle, rgba(95,184,120,0.15) 0%, rgba(95,184,120,0) 70%)",
            filter: "blur(40px)",
          }}
        />
        <div className="relative flex h-64 w-64 items-center justify-center">
          <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 256 256">
            <circle cx="128" cy="128" r="120" stroke="var(--lux-hairline)" strokeWidth="4" fill="transparent" />
            <circle
              cx="128"
              cy="128"
              r="120"
              stroke="var(--lux-sage)"
              strokeWidth="4"
              fill="transparent"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 1s linear" }}
            />
          </svg>
          <div className="z-10 flex flex-col items-center">
            <span className="font-luxury-display tabular text-[64px] font-bold" style={{ color: "var(--lux-ink)" }}>
              {formatTime(remaining)}
            </span>
            <span className="text-[14px] uppercase tracking-widest" style={{ color: "var(--lux-sage)" }}>
              {status === "idle" && "Ready to focus"}
              {status === "running" && "Focusing"}
              {status === "paused" && "Paused"}
              {status === "completed" && "Session complete"}
            </span>
            {status === "running" && liveHeartRate !== null && (
              <span className="mt-2 flex items-center gap-1 text-[13px]" style={{ color: "var(--lux-muted)" }}>
                <HeartPulse size={13} aria-hidden="true" /> {liveHeartRate} bpm
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Smart Break — adaptive, not a fixed interval. The decision of
          whether and what to suggest is made server-side from the
          session's heart-rate trend (see ai/src/smartBreaks.ts); this
          only renders the answer when there is one. Dismissible, and
          never interrupts the timer itself. */}
      {breakSuggestion && status === "running" && (
        <section
          className="flex items-start gap-3 rounded-[20px] p-4"
          style={{ background: "rgba(212,175,120,0.10)", border: "1px solid var(--lux-hairline-gold)" }}
          role="status"
        >
          {(() => {
            const Icon = BREAK_ICON[breakSuggestion.kind];
            return (
              <span
                className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
                style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-gold)" }}
              >
                <Icon size={15} aria-hidden="true" />
              </span>
            );
          })()}
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-medium" style={{ color: "var(--lux-ink)" }}>
              {breakSuggestion.label}
            </p>
            <p className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--lux-muted)" }}>
              {breakSuggestion.reason}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setBreakSuggestion(null)}
            aria-label="Dismiss break suggestion"
            className="shrink-0 rounded-full p-1"
            style={{ color: "var(--lux-muted)" }}
          >
            <X size={15} aria-hidden="true" />
          </button>
        </section>
      )}

      {status === "idle" && (
        <section className="lux-stagger-2">
          <h2 className="mb-3 text-[14px] font-medium" style={{ color: "var(--lux-muted)" }}>
            Choose Duration
          </h2>
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {DURATIONS.map((mins) => (
              <button
                key={mins}
                type="button"
                onClick={() => {
                  setDuration(mins);
                  setRemaining(mins * 60);
                }}
                className="h-11 shrink-0 whitespace-nowrap rounded-full px-5 text-[13px] font-semibold transition-colors"
                style={
                  duration === mins
                    ? { background: "var(--lux-sage)", color: "#1a241e" }
                    : { background: "var(--lux-bg-card-2)", color: "var(--lux-muted)", border: "1px solid var(--lux-hairline)" }
                }
              >
                {mins} min
              </button>
            ))}
          </div>
        </section>
      )}

      {status !== "completed" && (
        <section
          className="lux-stagger-3 flex items-center justify-between rounded-[24px] p-5"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <div>
            <h2 className="font-luxury-display text-[15px] font-semibold" style={{ color: "var(--lux-ink)" }}>
              Focus music
            </h2>
            <p className="text-[12px]" style={{ color: "var(--lux-muted)" }}>
              Opens in a new tab — pick whatever you already have queued.
            </p>
          </div>
          <div className="flex gap-2">
            <a
              href="https://open.spotify.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
            >
              Spotify <ExternalLink size={12} aria-hidden="true" />
            </a>
            <a
              href="https://music.apple.com"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium"
              style={{ background: "var(--lux-bg-card-2)", color: "var(--lux-ink)" }}
            >
              Apple Music <ExternalLink size={12} aria-hidden="true" />
            </a>
          </div>
        </section>
      )}

      {saveError && (
        <p className="text-[13px]" style={{ color: "var(--lux-rose)" }}>
          {saveError}
        </p>
      )}

      {status === "completed" ? (
        <div className="flex flex-col gap-4">
          <section
            className="rounded-[24px] p-6 text-center"
            style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
          >
            <p className="text-[13px]" style={{ color: "var(--lux-muted)" }}>
              Focus score
            </p>
            <p className="font-luxury-display tabular mt-1 text-[40px] font-bold" style={{ color: "var(--lux-ink)" }}>
              {focusScore === undefined ? "…" : focusScore === null ? "—" : focusScore}
            </p>
            <p className="mt-1 text-[11px]" style={{ color: "var(--lux-muted)" }}>
              {focusScore === null
                ? "Not enough heart rate data during this session to compute a score."
                : "Based on heart rate stability during your session — a proxy for steady engagement, not a measurement of attention."}
            </p>
          </section>
          <button
            type="button"
            onClick={handleReset}
            className="flex h-14 w-full items-center justify-center rounded-2xl text-[16px] font-bold"
            style={{ background: "var(--lux-sage)", color: "#1a241e" }}
          >
            Start Another Session
          </button>
        </div>
      ) : (
        <div className="relative flex items-center justify-center gap-4 px-8">
          {status !== "idle" && (
            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset session"
              className="flex h-11 w-11 items-center justify-center rounded-full"
              style={{ background: "var(--lux-bg-card-2)", border: "1px solid var(--lux-hairline)" }}
            >
              <RotateCcw size={18} style={{ color: "var(--lux-muted)" }} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            onClick={status === "running" ? handlePause : handleStart}
            aria-label={status === "running" ? "Pause session" : "Start session"}
            className="flex h-16 w-16 items-center justify-center rounded-full transition-transform active:scale-95"
            style={{ background: "var(--lux-sage)", boxShadow: "0 8px 24px rgba(95,184,120,0.35), 0 2px 8px rgba(0,0,0,0.4)" }}
          >
            {status === "running" ? (
              <Pause size={28} style={{ color: "#1a241e" }} aria-hidden="true" />
            ) : (
              <Play size={28} className="ml-1" style={{ color: "#1a241e" }} aria-hidden="true" />
            )}
          </button>
        </div>
      )}
    </div>
  );
}
