"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useMusicKit } from "@/lib/musicKitClient";
import { artworkUrl } from "@/lib/appleMusicArtwork";

export default function MusicLibraryPage() {
  const { status, instance } = useMusicKit();
  const [playlists, setPlaylists] = useState<MusicKit.MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status.kind !== "ready" || !status.authorized || !instance) return;
    let cancelled = false;

    instance.api
      .music("/v1/me/library/playlists", { limit: 25 })
      .then((body) => {
        if (cancelled) return;
        setPlaylists(Array.isArray(body.data) ? (body.data as MusicKit.MediaItem[]) : []);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your library.");
      });

    return () => {
      cancelled = true;
    };
  }, [instance, status]);

  if (status.kind === "not_configured") {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{status.message}</p>
      </Card>
    );
  }

  if (status.kind === "ready" && !status.authorized) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">Connect Apple Music from the Home tab to see your library.</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">{error}</p>
      </Card>
    );
  }

  if (!playlists) {
    return <p className="text-sm text-ink-muted">Loading your library…</p>;
  }

  if (playlists.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">No playlists in your Apple Music library yet.</p>
      </Card>
    );
  }

  async function playPlaylist(playlistId: string) {
    if (!instance) return;
    await instance.setQueue({ playlist: playlistId });
    await instance.play();
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Your playlists</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {playlists.map((playlist) => {
          const art = artworkUrl(playlist.attributes?.artwork, 200);
          return (
            <button
              key={playlist.id}
              type="button"
              onClick={() => void playPlaylist(playlist.id)}
              className="flex flex-col gap-1.5 text-left"
            >
              {art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art} alt="" className="aspect-square w-full rounded-lg object-cover shadow-[var(--shadow-sm)] transition-transform hover:scale-[1.02]" />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-surface-raised" aria-hidden="true">
                  <span className="text-2xl">🎵</span>
                </div>
              )}
              <p className="truncate text-xs font-medium">{playlist.attributes?.name}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
