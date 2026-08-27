"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, BarChart3 } from "lucide-react";
import { useMusicKit } from "@/lib/musicKitClient";
import { artworkUrl } from "@/lib/appleMusicArtwork";
import { AuroraDisc } from "./AuroraDisc";
import { EmotionalProgressPanel } from "./EmotionalProgressPanel";
import { SessionTrendChart, type SessionTrendPoint } from "./SessionTrendChart";
import { SeekBar } from "./SeekBar";
import { PlaybackControls } from "./PlaybackControls";
import type { MusicLiveStateResponse } from "@/lib/types";

/** How often the emotional panel re-reads live biometrics. Biometric
 * syncs land every few minutes at best, so a slower cadence than the
 * playhead — polling faster would just re-render the same numbers. */
const LIVE_POLL_MS = 60_000;
/** Playhead tick. Fast enough to feel continuous, slow enough to stay
 * off the main thread's critical path. */
const POSITION_TICK_MS = 500;

const EMPTY_LIVE: MusicLiveStateResponse = {
  session: null,
  current: { stress: null, focus: null, heartRate: null },
  activeState: null,
};

/**
 * The Listening Journey player.
 *
 * Two things are happening on this screen at once, and keeping them
 * separate is the whole design: MusicKit drives what's *playing*
 * (artwork, position, transport), and MoodSync's session feedback loop
 * drives what's *changing* (baseline vs. now). The player never invents
 * either half — with no music connected it says so, and with no
 * biometric baseline the emotional panel says that instead of animating
 * to a flattering number.
 */
export function PremiumPlayer() {
  const { status, instance, nowPlayingItem, playbackState, play, pause, skipNext, skipPrevious } = useMusicKit();
  const [live, setLive] = useState<MusicLiveStateResponse>(EMPTY_LIVE);
  const [position, setPosition] = useState(0);
  const cancelledRef = useRef(false);

  const authorized = status.kind === "ready" && status.authorized && instance !== null;
  // MusicKit's documented PlaybackStates enum: 2 === playing.
  const playing = playbackState === 2;

  useEffect(() => {
    cancelledRef.current = false;

    function pollLive() {
      fetch("/api/music-sessions/live", { cache: "no-store" })
        .then((res) => (res.ok ? (res.json() as Promise<MusicLiveStateResponse>) : null))
        .then((data) => {
          if (!cancelledRef.current && data) setLive(data);
        })
        .catch(() => {});
    }

    pollLive();
    const interval = setInterval(pollLive, LIVE_POLL_MS);
    return () => {
      cancelledRef.current = true;
      clearInterval(interval);
    };
  }, []);

  // Playhead. Read from the instance rather than counted locally, so it
  // stays truthful across seeks, track changes and buffering.
  useEffect(() => {
    if (!instance) return;
    const tick = () => setPosition(instance.currentPlaybackTime ?? 0);
    tick();
    const interval = setInterval(tick, POSITION_TICK_MS);
    return () => clearInterval(interval);
  }, [instance]);

  // Two real points when a session is running (start → now); anything
  // less and SessionTrendChart draws its sample curve instead.
  const trendPoints: SessionTrendPoint[] =
    live.session?.baselineHeartRate != null && live.current.heartRate != null
      ? [
          { minute: 0, bpm: live.session.baselineHeartRate },
          { minute: Math.max(1, Math.round(live.elapsedMinutes ?? 1)), bpm: live.current.heartRate },
        ]
      : [];

  const art = nowPlayingItem ? artworkUrl(nowPlayingItem.attributes?.artwork, 400) : null;
  const trackTitle = nowPlayingItem?.attributes?.name ?? live.session?.itemName ?? "Nothing playing";
  const artist = nowPlayingItem?.attributes?.artistName ?? null;
  const duration = instance?.currentPlaybackDuration ?? 0;

  function handleSeek(seconds: number) {
    void instance?.seekToTime(seconds);
    setPosition(seconds);
  }

  return (
    <div className="ms-player min-h-screen">
      <div className="bg-adaptive relative min-h-screen">
        <div className="noise-overlay pointer-events-none absolute inset-0" aria-hidden="true" />

        <div className="relative mx-auto flex min-h-screen w-full max-w-md flex-col">
          {/* Header */}
          <header className="flex items-start justify-between px-6 pt-10">
            <Link
              href="/dashboard/music"
              aria-label="Back to Music"
              className="control-press -ml-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </Link>

            <div className="min-w-0 flex-1 px-2 text-center">
              <p className="text-[8px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--text-muted)" }}>
                Listening Journey
              </p>
              <h1 className="font-display mt-1.5 truncate text-[13px] font-medium" style={{ color: "var(--text-primary)" }}>
                {trackTitle}
              </h1>
              {artist && (
                <p className="mt-0.5 truncate text-[10px]" style={{ color: "var(--text-muted)" }}>
                  {artist}
                </p>
              )}
            </div>

            <Link
              href="/dashboard/music/analytics"
              aria-label="What music works for you"
              className="control-press -mr-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              <BarChart3 size={18} aria-hidden="true" />
            </Link>
          </header>

          <main className="flex flex-1 flex-col gap-5 px-6 pt-4">
            <EmotionalProgressPanel live={live} />

            {/* The moving half of the story the panel above tells in
                numbers. `/music-sessions/live` returns the current
                reading rather than a series, so a running session plots
                the two points it can prove — baseline and now — and the
                chart falls back to its labeled sample curve otherwise. */}
            <SessionTrendChart data={trendPoints} baseline={live.session?.baselineHeartRate ?? null} />

            <div className="flex justify-center py-2">
              <AuroraDisc artworkUrl={art} playing={playing} />
            </div>

            <div className="mt-auto flex flex-col gap-5 pb-12">
              <SeekBar
                positionSeconds={position}
                durationSeconds={duration}
                onSeek={handleSeek}
                disabled={!authorized || !nowPlayingItem}
              />

              <PlaybackControls
                playing={playing}
                disabled={!authorized}
                providerLabel={authorized ? "Apple Music" : "Not connected"}
                onTogglePlay={() => void (playing ? pause() : play())}
                onSkipBack={() => void skipPrevious()}
                onSkipForward={() => void skipNext()}
              />

              {!authorized && (
                <Link
                  href="/dashboard/connections"
                  className="text-center text-[11px] underline-offset-4 hover:underline"
                  style={{ color: "var(--sage)" }}
                >
                  Connect Apple Music to play from here
                </Link>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
