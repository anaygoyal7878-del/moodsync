"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useMusicKit } from "@/lib/musicKitClient";
import { artworkUrl } from "@/lib/appleMusicArtwork";

/** Real, honest roadmap — every one of these needs either real listening
 * history (which can't exist before a working connection does) or
 * things this session was explicitly told to defer. Shown as a labeled
 * roadmap, not built as dead nav links returning empty pages — see
 * docs/APPLE_MUSIC_ARCHITECTURE.md §5 for why each is deferred. */
const ROADMAP_ITEMS = [
  { title: "AI Recommendations", detail: "Context-aware suggestions from your biometrics + listening history." },
  { title: "Mood Playlists", detail: "Auto-built playlists for stress, focus, sleep, and recovery." },
  { title: "Automation Music", detail: "Let automations start music client-side when a rule fires." },
  { title: "Listening Analytics", detail: "Genre/mood breakdowns and wellness correlations." },
];

function PlaybackStateLabel({ state }: { state: MusicKit.PlaybackStates | null }) {
  // Numeric values per Apple's documented MusicKit.PlaybackStates enum.
  if (state === 2) return <span className="text-xs text-brand">Playing</span>;
  if (state === 3) return <span className="text-xs text-ink-muted">Paused</span>;
  return <span className="text-xs text-ink-muted">Idle</span>;
}

function NowPlayingCard() {
  const { nowPlayingItem, playbackState, play, pause, skipNext, skipPrevious } = useMusicKit();

  if (!nowPlayingItem) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">Nothing playing — search the catalog or open your library to start something.</p>
      </Card>
    );
  }

  const art = artworkUrl(nowPlayingItem.attributes?.artwork, 300);
  const isPlaying = playbackState === 2;

  return (
    <Card className="flex items-center gap-4">
      {art ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Apple-hosted artwork, arbitrary hosts per user's library
        <img src={art} alt="" className="h-20 w-20 shrink-0 rounded-xl object-cover shadow-[var(--shadow-sm)]" />
      ) : (
        <div className="h-20 w-20 shrink-0 rounded-xl bg-surface-raised" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <PlaybackStateLabel state={playbackState} />
        <p className="truncate text-base font-semibold">{nowPlayingItem.attributes?.name ?? "Untitled"}</p>
        <p className="truncate text-sm text-ink-muted">{nowPlayingItem.attributes?.artistName ?? "Unknown artist"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="ghost" onClick={() => void skipPrevious()} aria-label="Previous">
          ⏮
        </Button>
        <Button variant="primary" onClick={() => (isPlaying ? pause() : void play())} aria-label={isPlaying ? "Pause" : "Play"}>
          {isPlaying ? "⏸" : "▶"}
        </Button>
        <Button variant="ghost" onClick={() => void skipNext()} aria-label="Next">
          ⏭
        </Button>
      </div>
    </Card>
  );
}

function RecentlyPlayed() {
  const { instance, status } = useMusicKit();
  const [tracks, setTracks] = useState<MusicKit.MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status.kind !== "ready" || !status.authorized || !instance) return;
    let cancelled = false;

    instance.api
      .music("/v1/me/recent/played/tracks")
      .then((body) => {
        if (cancelled) return;
        const data = body.data;
        setTracks(Array.isArray(data) ? (data as MusicKit.MediaItem[]) : []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your recently played tracks.");
      });

    return () => {
      cancelled = true;
    };
  }, [instance, status]);

  if (status.kind !== "ready" || !status.authorized) return null;
  if (error) return <p className="text-xs text-ink-muted">{error}</p>;
  if (!tracks) return <p className="text-xs text-ink-muted">Loading recently played…</p>;
  if (tracks.length === 0) return <p className="text-xs text-ink-muted">No recently played tracks yet.</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {tracks.slice(0, 8).map((track) => {
        const art = artworkUrl(track.attributes?.artwork, 200);
        return (
          <div key={track.id} className="flex flex-col gap-1.5">
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt="" className="aspect-square w-full rounded-lg object-cover shadow-[var(--shadow-sm)]" />
            ) : (
              <div className="aspect-square w-full rounded-lg bg-surface-raised" aria-hidden="true" />
            )}
            <p className="truncate text-xs font-medium">{track.attributes?.name}</p>
            <p className="truncate text-xs text-ink-muted">{track.attributes?.artistName}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function MusicHomePage() {
  const { status, authorize } = useMusicKit();
  const [connecting, setConnecting] = useState(false);

  if (status.kind === "loading") {
    return (
      <Card>
        <p className="text-sm text-ink-muted">Loading Apple Music…</p>
      </Card>
    );
  }

  if (status.kind === "not_configured") {
    return (
      <Card>
        <p className="text-sm font-medium">Apple Music isn&apos;t connected yet</p>
        <p className="mt-1 text-sm text-ink-muted">{status.message}</p>
      </Card>
    );
  }

  if (!status.authorized) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <div>
          <p className="text-sm font-medium">Connect Apple Music</p>
          <p className="mt-1 text-sm text-ink-muted">
            Authorize with your Apple ID to browse your library, search the catalog, and control playback. Requires
            an active Apple Music subscription.
          </p>
        </div>
        <Button
          variant="primary"
          disabled={connecting}
          onClick={async () => {
            setConnecting(true);
            try {
              await authorize();
            } finally {
              setConnecting(false);
            }
          }}
        >
          {connecting ? "Connecting…" : "Connect Apple Music"}
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <NowPlayingCard />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/dashboard/music/search">
          <Card className="transition-colors hover:bg-surface-hover">
            <p className="text-sm font-medium">Search</p>
            <p className="mt-0.5 text-xs text-ink-muted">Songs, albums, artists, playlists</p>
          </Card>
        </Link>
        <Link href="/dashboard/music/library">
          <Card className="transition-colors hover:bg-surface-hover">
            <p className="text-sm font-medium">Library</p>
            <p className="mt-0.5 text-xs text-ink-muted">Your saved playlists</p>
          </Card>
        </Link>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Recently played</h2>
        <RecentlyPlayed />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Coming next</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {ROADMAP_ITEMS.map((item) => (
            <Card key={item.title} className="opacity-70">
              <p className="text-sm font-medium">{item.title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{item.detail}</p>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
