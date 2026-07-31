"use client";

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Real seek bar over MusicKit's playback position.
 *
 * Seeking is a genuine `seekToTime` call, not a CSS-only illusion —
 * clicking the track moves the playhead. It's also keyboard-operable:
 * an `input[type=range]` sits invisibly over the visual bar so arrow
 * keys work and the control is reachable by tab, which a div with a
 * click handler would not be.
 */
export function SeekBar({
  positionSeconds,
  durationSeconds,
  onSeek,
  disabled,
}: {
  positionSeconds: number;
  durationSeconds: number;
  onSeek: (seconds: number) => void;
  disabled: boolean;
}) {
  const safeDuration = durationSeconds > 0 ? durationSeconds : 0;
  const progressPct = safeDuration > 0 ? Math.min(100, (positionSeconds / safeDuration) * 100) : 0;

  return (
    <div className="w-full">
      <div className="group relative py-2">
        <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-secondary)" }}>
          <div
            className="progress-glow h-full rounded-full"
            style={{
              width: `${progressPct}%`,
              background: "linear-gradient(to right, var(--gold), var(--sage))",
              transition: "width 250ms cubic-bezier(0.4, 0, 0.2, 1)",
            }}
          />
        </div>

        {/* Scrubber — hidden until hover/focus, per the spec. */}
        <div
          className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 scale-0 rounded-full transition-transform duration-200 group-hover:scale-100 group-focus-within:scale-100"
          style={{ left: `${progressPct}%`, background: "#fff", boxShadow: "0 0 10px rgba(201,169,97,0.5)" }}
          aria-hidden="true"
        />

        <input
          type="range"
          min={0}
          max={safeDuration || 1}
          step={1}
          value={Math.min(positionSeconds, safeDuration || 1)}
          disabled={disabled || safeDuration === 0}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-label="Seek"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"
        />
      </div>

      <div className="mt-1 flex justify-between text-[9px] tabular-nums" style={{ color: "var(--text-muted)" }}>
        <span>{formatTime(positionSeconds)}</span>
        <span>{safeDuration > 0 ? formatTime(safeDuration) : "--:--"}</span>
      </div>
    </div>
  );
}
