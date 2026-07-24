"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { useMusicKit } from "@/lib/musicKitClient";
import { artworkUrl } from "@/lib/appleMusicArtwork";

interface CatalogSearchResults {
  songs?: { data: MusicKit.MediaItem[] };
  albums?: { data: MusicKit.MediaItem[] };
  artists?: { data: MusicKit.MediaItem[] };
  playlists?: { data: MusicKit.MediaItem[] };
}

function isCatalogSearchResults(value: unknown): value is CatalogSearchResults {
  return typeof value === "object" && value !== null;
}

function ResultGrid({ title, items, onPlay }: { title: string; items: MusicKit.MediaItem[]; onPlay?: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => {
          const art = artworkUrl(item.attributes?.artwork, 200);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPlay?.(item.id)}
              disabled={!onPlay}
              className="flex flex-col gap-1.5 text-left disabled:cursor-default"
            >
              {art ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={art} alt="" className="aspect-square w-full rounded-lg object-cover shadow-[var(--shadow-sm)] transition-transform hover:scale-[1.02]" />
              ) : (
                <div className="aspect-square w-full rounded-lg bg-surface-raised" aria-hidden="true" />
              )}
              <p className="truncate text-xs font-medium">{item.attributes?.name}</p>
              {item.attributes?.artistName && <p className="truncate text-xs text-ink-muted">{item.attributes.artistName}</p>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function MusicSearchPage() {
  const { status, instance } = useMusicKit();
  const [term, setTerm] = useState("");
  const [results, setResults] = useState<CatalogSearchResults | null>(null);
  const [searching, setSearching] = useState(false);

  const canSearch = !!instance && status.kind === "ready" && status.authorized && term.trim().length >= 2;

  useEffect(() => {
    if (!canSearch || !instance) return;
    let cancelled = false;

    const timeout = setTimeout(() => {
      if (cancelled) return;
      setSearching(true);
      instance.api
        .music(`/v1/catalog/${instance.storefrontId}/search`, { term, types: "songs,albums,artists,playlists", limit: 10 })
        .then((body) => {
          if (cancelled) return;
          setResults(isCatalogSearchResults(body.results) ? body.results : {});
        })
        .catch(() => {
          if (!cancelled) setResults({});
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `instance` is intentionally omitted from re-triggering; only a new search term should restart the debounce
  }, [canSearch, term]);

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
        <p className="text-sm text-ink-muted">Connect Apple Music from the Home tab to search the catalog.</p>
      </Card>
    );
  }

  async function playSong(songId: string) {
    if (!instance) return;
    await instance.setQueue({ songs: [songId] });
    await instance.play();
  }

  return (
    <div className="flex flex-col gap-6">
      <Input
        type="search"
        placeholder="Search songs, albums, artists, playlists…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        autoFocus
      />

      {searching && <p className="text-xs text-ink-muted">Searching…</p>}

      {canSearch && results && (
        <>
          <ResultGrid title="Songs" items={results.songs?.data ?? []} onPlay={playSong} />
          <ResultGrid title="Albums" items={results.albums?.data ?? []} />
          <ResultGrid title="Artists" items={results.artists?.data ?? []} />
          <ResultGrid title="Playlists" items={results.playlists?.data ?? []} />
          {!results.songs && !results.albums && !results.artists && !results.playlists && (
            <p className="text-sm text-ink-muted">No results for &quot;{term}&quot;.</p>
          )}
        </>
      )}
    </div>
  );
}
