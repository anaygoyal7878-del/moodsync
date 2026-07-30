"use client";

import { useEffect, useState } from "react";
import { Play, Music2, Loader2 } from "lucide-react";
import { useMusicKit } from "@/lib/musicKitClient";
import { Section, EmptyState } from "./CompanionPrimitives";

interface RecommendedCategory {
  category: string;
  keywords: string[];
  reason: string;
}

/**
 * The mood categories the picker offers. Keywords mirror
 * `MUSIC_CATEGORY_KEYWORDS` in ai/src/musicIntelligence.ts — the same
 * best-effort name match, applied to whatever playlists the user
 * actually has. MoodSync ships no music catalog, so a tap either finds
 * one of *your* playlists or says it couldn't; it never invents one.
 */
const MOODS = [
  { label: "Deep Focus", keywords: ["focus", "deep work", "concentration", "study"] },
  { label: "Lo-fi", keywords: ["lo-fi", "lofi", "chillhop"] },
  { label: "Ambient", keywords: ["ambient", "atmospheric", "drone"] },
  { label: "Jazz", keywords: ["jazz", "bossa"] },
  { label: "Nature", keywords: ["nature", "rain", "forest", "ocean"] },
  { label: "Recovery", keywords: ["recovery", "rest", "calm", "relax", "unwind"] },
] as const;

type PlayState = { mood: string; status: "loading" | "not-found" | "playing" } | null;

/**
 * Adaptive Music — "you seem stressed → here's what to put on," one tap.
 *
 * The server picks the recommended category from real signals (wellness
 * scores, time of day, weather — see backend/src/api/routes/music.ts);
 * the match against the user's own Apple Music library happens here,
 * client-side, because that library is only reachable through MusicKit
 * in the browser. Both halves are real: neither the recommendation nor
 * the playlist is fabricated.
 */
export function AdaptiveMusic() {
  const { status, instance, playPlaylist } = useMusicKit();
  const [recommendation, setRecommendation] = useState<RecommendedCategory | null>(null);
  const [playState, setPlayState] = useState<PlayState>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/music/recommended-category", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<RecommendedCategory>) : null))
      .then((data) => {
        if (!cancelled && data) setRecommendation(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const authorized = status.kind === "ready" && status.authorized && instance !== null;

  async function handleMood(mood: string, keywords: readonly string[]) {
    if (!instance) return;
    setPlayState({ mood, status: "loading" });
    try {
      const body = await instance.api.music("/v1/me/library/playlists", { limit: 100 });
      const playlists = Array.isArray(body.data) ? (body.data as MusicKit.MediaItem[]) : [];
      const match = playlists.find((p) => {
        const name = p.attributes?.name?.toLowerCase() ?? "";
        return keywords.some((keyword) => name.includes(keyword));
      });

      if (!match) {
        setPlayState({ mood, status: "not-found" });
        return;
      }
      await playPlaylist(match.id);
      setPlayState({ mood, status: "playing" });
    } catch {
      setPlayState({ mood, status: "not-found" });
    }
  }

  return (
    <Section
      title="What to put on"
      subtitle={recommendation ? recommendation.reason : "One tap, matched against your own library."}
      icon={Music2}
    >
      {!authorized ? (
        <EmptyState
          icon={Music2}
          title="Connect Apple Music"
          body="MoodSync matches a mood against the playlists you already have — it doesn't ship its own catalog, so it needs access to yours."
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((mood) => {
              const recommended = recommendation?.category.toLowerCase().includes(mood.label.split(" ")[0]!.toLowerCase());
              const active = playState?.mood === mood.label;
              const loading = active && playState.status === "loading";

              return (
                <button
                  key={mood.label}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleMood(mood.label, mood.keywords)}
                  className="flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors disabled:opacity-60"
                  style={
                    recommended
                      ? { background: "var(--lux-sage)", color: "#1a241e" }
                      : { background: "var(--lux-bg-card-2)", color: "var(--lux-ink)", border: "1px solid var(--lux-hairline)" }
                  }
                >
                  {loading ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Play size={12} aria-hidden="true" />
                  )}
                  {mood.label}
                </button>
              );
            })}
          </div>

          {recommendation && (
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--lux-muted)" }}>
              Highlighted: what MoodSync suggests right now.
            </p>
          )}

          {playState?.status === "not-found" && (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--lux-rose)" }}>
              No playlist in your library matched &ldquo;{playState.mood}&rdquo;. MoodSync only plays playlists you already
              have — make one with that word in the name and it&apos;ll find it.
            </p>
          )}
          {playState?.status === "playing" && (
            <p className="mt-3 text-[12.5px]" style={{ color: "var(--lux-sage)" }}>
              Playing your {playState.mood} playlist.
            </p>
          )}
        </>
      )}
    </Section>
  );
}
