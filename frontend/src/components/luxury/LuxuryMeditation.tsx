"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CloudRain, Trees, Waves, Wind, Play, Pause, RotateCcw } from "lucide-react";
import { AmbiencePlayer } from "@/lib/ambienceAudio";
import type { MeditationAmbience } from "@/lib/types";

const DURATIONS = [5, 10, 15, 20, 30] as const;

const AMBIENCES: Array<{ id: MeditationAmbience; label: string; sub: string; icon: typeof CloudRain }> = [
  { id: "rain", label: "Rain", sub: "Gentle patter", icon: CloudRain },
  { id: "forest", label: "Forest", sub: "Nature sounds", icon: Trees },
  { id: "ocean", label: "Ocean", sub: "Rhythmic waves", icon: Waves },
  { id: "noise", label: "Noise", sub: "Pure white", icon: Wind },
];

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Ported from the Superdesign Meditation Session draft, with the timer
 * and ambience made real rather than static UI: a genuine countdown
 * (setInterval, not a fake ring illustration) and genuine Web Audio
 * synthesis per ambience choice (see lib/ambienceAudio.ts — no external
 * audio files). On natural completion (timer reaches zero), logs a
 * real MeditationSession via POST /api/meditation-sessions; stopping
 * early logs nothing, matching the "only log a completed session"
 * decision from this feature's scoping. The draft's post-session
 * emoji-reflection card is dropped — it depends on a mood-log feature
 * this app doesn't have. */
export function LuxuryMeditation() {
  const router = useRouter();
  const [duration, setDuration] = useState<number>(5);
  const [ambience, setAmbience] = useState<MeditationAmbience>("rain");
  const [status, setStatus] = useState<"idle" | "running" | "paused" | "completed">("idle");
  const [remaining, setRemaining] = useState(duration * 60);
  const [saveError, setSaveError] = useState<string | null>(null);

  const playerRef = useRef<AmbiencePlayer | null>(null);
  const startedAtRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      playerRef.current?.stop();
    };
  }, []);

  function getPlayer(): AmbiencePlayer {
    if (!playerRef.current) playerRef.current = new AmbiencePlayer();
    return playerRef.current;
  }

  async function completeSession() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    playerRef.current?.stop();
    setStatus("completed");

    if (!startedAtRef.current) return;
    setSaveError(null);
    const response = await fetch("/api/meditation-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes: duration, ambience, startedAt: startedAtRef.current }),
    });
    if (!response.ok) setSaveError("Session finished, but couldn't be saved.");
    router.refresh();
  }

  function tick() {
    setRemaining((prev) => {
      if (prev <= 1) {
        void completeSession();
        return 0;
      }
      return prev - 1;
    });
  }

  function handleStart() {
    if (status === "idle") {
      startedAtRef.current = new Date().toISOString();
      setRemaining(duration * 60);
    }
    getPlayer().play(ambience);
    setStatus("running");
    intervalRef.current = setInterval(tick, 1000);
  }

  function handlePause() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    playerRef.current?.stop();
    setStatus("paused");
  }

  function handleReset() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    playerRef.current?.stop();
    startedAtRef.current = null;
    setStatus("idle");
    setRemaining(duration * 60);
    setSaveError(null);
  }

  const totalSeconds = duration * 60;
  const progress = totalSeconds === 0 ? 0 : (totalSeconds - remaining) / totalSeconds;
  const circumference = 2 * Math.PI * 120;
  const dashOffset = circumference * (1 - progress);

  return (
    <div className="flex flex-col gap-6">
      {/* Timer Hero */}
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
              {status === "idle" && "Ready to begin"}
              {status === "running" && "Breathe"}
              {status === "paused" && "Paused"}
              {status === "completed" && "Session complete"}
            </span>
          </div>
        </div>
      </section>

      {/* Duration Selector */}
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

      {/* Ambience Selector */}
      {status !== "completed" && (
        <section
          className="lux-stagger-3 rounded-[24px] p-5"
          style={{ background: "var(--lux-bg-card)", border: "1px solid var(--lux-hairline)" }}
        >
          <h2 className="font-luxury-display mb-4 text-[16px] font-semibold" style={{ color: "var(--lux-ink)" }}>
            Background Ambience
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {AMBIENCES.map((a) => {
              const Icon = a.icon;
              const active = ambience === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => {
                    setAmbience(a.id);
                    if (status === "running") getPlayer().play(a.id);
                  }}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl p-4"
                  style={{
                    background: "var(--lux-bg-card-2)",
                    border: active ? "2px solid var(--lux-sage)" : "1px solid var(--lux-hairline)",
                  }}
                >
                  <Icon size={22} style={{ color: active ? "var(--lux-sage)" : "var(--lux-muted)" }} aria-hidden="true" />
                  <div className="text-center">
                    <p className="text-[13px] font-semibold" style={{ color: "var(--lux-ink)" }}>
                      {a.label}
                    </p>
                    <p className="text-[11px]" style={{ color: "var(--lux-muted)" }}>
                      {a.sub}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {saveError && (
        <p className="text-[13px]" style={{ color: "var(--lux-rose)" }}>
          {saveError}
        </p>
      )}

      {status === "completed" ? (
        <button
          type="button"
          onClick={handleReset}
          className="flex h-14 w-full items-center justify-center rounded-2xl text-[16px] font-bold"
          style={{ background: "var(--lux-sage)", color: "#1a241e" }}
        >
          Start Another Session
        </button>
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
