"use client";

import { Music2 } from "lucide-react";

/**
 * The aurora gradient disc — gold → sage → dark → sage flowing on a
 * 12-second cycle with a subtle hue rotation, so it reads as liquid
 * metal rather than a spinning record.
 *
 * Pausing playback pauses the animation rather than stopping it, so
 * resuming picks the gradient up mid-phase instead of snapping back to
 * the start. A hard reset would be the one jarring moment in an
 * otherwise calm screen.
 *
 * The album art at the centre is the real artwork for whatever is
 * actually playing (Apple-hosted, from MusicKit's `nowPlayingItem`).
 * With nothing playing it falls back to a quiet glyph rather than a
 * stock image.
 */
export function AuroraDisc({ artworkUrl, playing }: { artworkUrl: string | null; playing: boolean }) {
  return (
    <div className="relative flex items-center justify-center">
      {/* Ambient bloom behind the disc. */}
      <div
        className="pointer-events-none absolute h-72 w-72 rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, var(--accent-soft) 0%, transparent 65%)" }}
        aria-hidden="true"
      />

      <div
        className="gradient-disc satin-depth relative flex h-64 w-64 items-center justify-center rounded-full"
        style={{ animationPlayState: playing ? "running" : "paused" }}
      >
        {/* Dark vignette over the gradient. Without this the aurora
            reads as flat poster-paint rather than brushed metal — the
            spec's own brief is "calming, meditative, never distracting",
            and an undimmed sage circle is the brightest thing on the
            screen. The gradient definition itself is untouched; this
            only lowers its luminance toward the rim. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 50% 42%, rgba(10,11,10,0.15) 0%, rgba(10,11,10,0.55) 58%, rgba(10,11,10,0.78) 100%)",
          }}
          aria-hidden="true"
        />

        {/* Premium top-light reflection, over the vignette so the
            highlight still reads. */}
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            background: "radial-gradient(circle at 50% 0%, rgba(255,255,255,0.16) 0%, transparent 42%)",
          }}
          aria-hidden="true"
        />

        {/* Inner disc — glass over the flowing gradient. */}
        <div
          className="glass-surface relative flex h-44 w-44 items-center justify-center rounded-full"
          style={{ background: "rgba(0,0,0,0.62)" }}
        >
          {artworkUrl ? (
            // The artwork IS the record label, so it carries the centre
            // on its own — the spindle below would otherwise punch a
            // black dot through the middle of the album art.
            // eslint-disable-next-line @next/next/no-img-element -- Apple-hosted artwork, arbitrary hosts per the user's library
            <img
              src={artworkUrl}
              alt=""
              className="h-24 w-24 rounded-2xl object-cover"
              style={{ boxShadow: "0 0 24px rgba(201,169,97,0.25)" }}
            />
          ) : (
            <>
              <div
                className="flex h-24 w-24 items-center justify-center rounded-2xl"
                style={{ background: "var(--surface-primary)", color: "var(--text-muted)" }}
              >
                <Music2 size={22} aria-hidden="true" />
              </div>
              {/* Spindle — only with no artwork, as the disc's centre detail. */}
              <div
                className="absolute h-5 w-5 rounded-full"
                style={{ background: "var(--base)", boxShadow: "inset 0 1px 2px rgba(255,255,255,0.08)" }}
                aria-hidden="true"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
