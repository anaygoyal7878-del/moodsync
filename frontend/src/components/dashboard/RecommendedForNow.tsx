"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { useMusicKit } from "@/lib/musicKitClient";

interface RecommendedCategory {
  category: string;
  keywords: string[];
  reason: string;
}

/** Music Intelligence's "Recommended for Right Now" — the category is
 * computed server-side from real signals (wellness scores, time of day,
 * weather, see backend/src/api/routes/music.ts). The playlist match
 * happens here, client-side, against the user's own real Apple Music
 * library (keyword match on playlist name) — MoodSync has no curated
 * playlist catalog, so this either finds a real playlist or honestly
 * says none was found, never fabricates one. See
 * docs/MUSIC_INTELLIGENCE.md. */
export function RecommendedForNow() {
  const { status, instance } = useMusicKit();
  const [recommendation, setRecommendation] = useState<RecommendedCategory | null>(null);
  const [matchedPlaylist, setMatchedPlaylist] = useState<MusicKit.MediaItem | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/music/recommended-category")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setRecommendation(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!recommendation || status.kind !== "ready" || !status.authorized || !instance) return;
    let cancelled = false;

    instance.api
      .music("/v1/me/library/playlists", { limit: 25 })
      .then((body) => {
        if (cancelled) return;
        const playlists = Array.isArray(body.data) ? (body.data as MusicKit.MediaItem[]) : [];
        const match = playlists.find((p) => {
          const name = p.attributes?.name?.toLowerCase() ?? "";
          return recommendation.keywords.some((keyword) => name.includes(keyword));
        });
        setMatchedPlaylist(match ?? null);
      })
      .catch(() => {
        if (!cancelled) setMatchedPlaylist(null);
      });

    return () => {
      cancelled = true;
    };
  }, [recommendation, instance, status]);

  if (!recommendation) return null;

  return (
    <Card>
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Recommended for right now</p>
      <p className="text-base font-semibold">{recommendation.category}</p>
      <p className="mb-3 text-sm text-ink-secondary">{recommendation.reason}</p>
      {status.kind !== "ready" || !status.authorized ? (
        <p className="text-sm text-ink-muted">Connect Apple Music to match this against your own library.</p>
      ) : matchedPlaylist === undefined ? (
        <p className="text-sm text-ink-muted">Checking your library…</p>
      ) : matchedPlaylist === null ? (
        <p className="text-sm text-ink-muted">
          No playlist in your library matches &ldquo;{recommendation.category}&rdquo; — try naming one with that word.
        </p>
      ) : (
        <p className="text-sm text-ink">
          Matched your playlist: <span className="font-medium">{matchedPlaylist.attributes?.name}</span>
        </p>
      )}
    </Card>
  );
}
