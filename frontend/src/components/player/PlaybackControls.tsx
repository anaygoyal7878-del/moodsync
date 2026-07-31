"use client";

import { SkipBack, SkipForward, Play, Pause, Speaker } from "lucide-react";

/**
 * Hardware-inspired transport.
 *
 * Every button is a real MusicKit call. Touch targets are 44px minimum
 * (the spec's own accessibility floor) — the skip buttons render a 40px
 * visual circle inside a 44px hit area rather than shrinking the target
 * to match the art.
 *
 * The device indicator shows the real provider MoodSync is playing
 * through. It deliberately does not claim an AirPlay route or a speaker
 * name: MusicKit JS exposes no output-routing API in the browser, so
 * naming a room would be decoration pretending to be status.
 */
export function PlaybackControls({
  playing,
  disabled,
  providerLabel,
  onTogglePlay,
  onSkipBack,
  onSkipForward,
}: {
  playing: boolean;
  disabled: boolean;
  providerLabel: string;
  onTogglePlay: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
}) {
  return (
    <div className="metallic-border overflow-hidden rounded-[28px]">
      <div className="glass-surface rounded-[27px] p-4">
        <div className="flex items-center justify-center gap-6">
          <button
            type="button"
            onClick={onSkipBack}
            disabled={disabled}
            aria-label="Previous track"
            className="control-press flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => !disabled && (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <SkipBack size={18} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={disabled}
            aria-label={playing ? "Pause" : "Play"}
            className="control-press flex h-16 w-16 items-center justify-center rounded-full transition-colors disabled:opacity-40"
            style={{ background: "#fff", color: "var(--base)", boxShadow: "0 8px 24px rgba(0,0,0,0.45)" }}
            onMouseEnter={(e) => !disabled && (e.currentTarget.style.background = "var(--gold)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#fff")}
          >
            {playing ? (
              <Pause size={22} aria-hidden="true" />
            ) : (
              <Play size={22} className="ml-0.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onSkipForward}
            disabled={disabled}
            aria-label="Next track"
            className="control-press flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-30"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => !disabled && (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            <SkipForward size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5">
          <Speaker size={10} style={{ color: "var(--text-faint)" }} aria-hidden="true" />
          <span className="text-[8px] font-bold uppercase tracking-[0.24em]" style={{ color: "var(--text-muted)" }}>
            {providerLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
