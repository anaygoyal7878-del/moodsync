"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MusicMode, MusicProviderKind, MusicSessionEntry } from "@/lib/types";

export interface StartMusicSessionArgs {
  mode: MusicMode;
  provider: MusicProviderKind;
  itemName: string;
  itemKind: "playlist" | "track" | "album" | "station";
  itemExternalId?: string;
}

/**
 * Client-side handle on the music + biometrics feedback loop.
 *
 * One session is open at a time. Starting a new one implicitly closes
 * any previous open session server-side, so a user who bounces between
 * playlists never accumulates phantom sessions — and never sees an
 * error for doing something perfectly reasonable.
 *
 * On mount this reattaches to whatever session is already open, so a
 * page reload mid-playlist resumes measuring rather than starting over
 * with a fresh (and wrong) baseline.
 *
 * Deliberately does NOT stop playback on `end()` — the brief's
 * "never interrupt the user's music abruptly" constraint. Ending a
 * session ends the *measurement*; whatever is playing keeps playing.
 */
export function useMusicSession() {
  const [session, setSession] = useState<MusicSessionEntry | null>(null);
  const [completedSessionId, setCompletedSessionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    fetch("/api/music-sessions/open", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ session: MusicSessionEntry | null }>) : null))
      .then((data) => {
        if (!cancelledRef.current && data?.session) setSession(data.session);
      })
      .catch(() => {});
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const start = useCallback(async (args: StartMusicSessionArgs) => {
    setBusy(true);
    setCompletedSessionId(null);
    try {
      const res = await fetch("/api/music-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
      if (!res.ok) return null;
      const { session: started } = (await res.json()) as { session: MusicSessionEntry };
      setSession(started);
      return started;
    } catch {
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  /** `endedEarly` is the honest engagement signal the learning loop
   * weighs — the caller knows whether the user let it run or bailed. */
  const end = useCallback(
    async (endedEarly: boolean) => {
      if (!session) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/music-sessions/${session.id}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endedEarly }),
        });
        if (res.ok) setCompletedSessionId(session.id);
        setSession(null);
      } catch {
        setSession(null);
      } finally {
        setBusy(false);
      }
    },
    [session],
  );

  return { session, completedSessionId, busy, start, end, dismissSummary: () => setCompletedSessionId(null) };
}
