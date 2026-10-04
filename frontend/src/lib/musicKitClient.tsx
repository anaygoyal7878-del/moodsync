"use client";

import Script from "next/script";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * MusicKit JS (Apple's real, official browser SDK for MusicKit — see
 * developer.apple.com/documentation/musickitjs) has no npm package; it's
 * loaded from Apple's own CDN at runtime, same as e.g. Stripe.js or the
 * Google Maps JS SDK. This is the first `next/script` usage in this
 * codebase (confirmed via repo search before adding it) — scoped to
 * whichever pages mount `MusicKitProvider` (the /dashboard/music/*
 * pages and the Apple Music connections card), not loaded globally in
 * layout.tsx, since most routes never touch Apple Music at all.
 *
 * Apple's own docs say NOT to assume `window.MusicKit` exists the
 * instant the script tag's onload fires — the SDK does its own internal
 * setup afterward and dispatches a `musickitloaded` event on `document`
 * when it's actually ready to call `configure()`. This waits for that
 * event (falling back to an immediate check in case it already fired
 * before this listener attached).
 */

type MusicKitStatus =
  | { kind: "loading" }
  | { kind: "not_configured"; message: string }
  | { kind: "ready"; authorized: boolean };

interface MusicKitContextValue {
  status: MusicKitStatus;
  /** Why the last connect attempt didn't complete, in the user's terms.
   * Cleared when a new attempt starts. */
  connectError: string | null;
  /** Never throws — a failure lands in `connectError` instead, so every
   * caller shows the same message without its own catch. */
  authorize: () => Promise<void>;
  unauthorize: () => Promise<void>;
  instance: MusicKit.MusicKitInstance | null;
  nowPlayingItem: MusicKit.MediaItem | null;
  playbackState: MusicKit.PlaybackStates | null;
  play: () => Promise<void>;
  /** Queue a specific playlist from the user's library and start it —
   * what makes the Adaptive Music "one tap" actually one tap. `play()`
   * alone only resumes whatever was already queued. */
  playPlaylist: (playlistId: string) => Promise<void>;
  pause: () => void;
  skipNext: () => Promise<void>;
  skipPrevious: () => Promise<void>;
}

const MusicKitContext = createContext<MusicKitContextValue | null>(null);

export function useMusicKit(): MusicKitContextValue {
  const ctx = useContext(MusicKitContext);
  if (!ctx) throw new Error("useMusicKit must be called within a MusicKitProvider");
  return ctx;
}

export function MusicKitProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<MusicKitStatus>({ kind: "loading" });
  const [connectError, setConnectError] = useState<string | null>(null);
  const [nowPlayingItem, setNowPlayingItem] = useState<MusicKit.MediaItem | null>(null);
  const [playbackState, setPlaybackState] = useState<MusicKit.PlaybackStates | null>(null);
  // The ref is for internal use inside callbacks (authorize/play/etc,
  // which run in event handlers, where reading a ref is fine) — reading
  // `.current` during render is disallowed by this project's lint rule,
  // so `instance` state below is what the context actually exposes to
  // consumers, kept in sync with the ref right after it's set.
  const instanceRef = useRef<MusicKit.MusicKitInstance | null>(null);
  const [instance, setInstance] = useState<MusicKit.MusicKitInstance | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      const musicKit = window.MusicKit;
      if (!musicKit) return;

      try {
        const res = await fetch("/api/integrations/apple-music/developer-token");
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (!cancelled) {
            setStatus({
              kind: "not_configured",
              message: typeof body.error === "string" ? body.error : "Apple Music isn't set up on this server yet.",
            });
          }
          return;
        }
        const { developerToken } = (await res.json()) as { developerToken: string };
        if (cancelled) return;

        // v3's configure() is async. It was called synchronously, so
        // `instance` was a Promise, the addEventListener call below threw,
        // and the catch reported "couldn't reach the server" — Apple Music
        // could never finish setting up, with or without a valid key.
        let instance: MusicKit.MusicKitInstance;
        try {
          instance = await musicKit.configure({ developerToken, app: { name: "MoodSync", build: "1.0.0" } });
        } catch (error) {
          console.error("MusicKit.configure failed", error);
          if (!cancelled) {
            setStatus({
              kind: "not_configured",
              message: "Apple Music rejected this server's MusicKit credentials. Check the Apple Music key settings.",
            });
          }
          return;
        }
        if (cancelled) return;
        instanceRef.current = instance;

        const updateNowPlaying = () => setNowPlayingItem(instance.nowPlayingItem);
        const updatePlaybackState = () => setPlaybackState(instance.playbackState);
        instance.addEventListener("nowPlayingItemDidChange", updateNowPlaying);
        instance.addEventListener("playbackStateDidChange", updatePlaybackState);

        // MusicKit remembers its authorization in the browser, and that
        // outlives a disconnect made on the Connections page (which only
        // deletes MoodSync's stored token). Without this check the Music
        // page kept playing as "connected" after the user disconnected.
        // The server is the source of truth for whether MoodSync is
        // connected; a failed check leaves the browser state alone.
        let authorized = instance.isAuthorized;
        if (authorized) {
          const serverConnected = await fetch("/api/integrations/apple-music/status")
            .then((r) => (r.ok ? (r.json() as Promise<{ connected: boolean }>) : null))
            .then((body) => body?.connected ?? null)
            .catch(() => null);
          if (serverConnected === false) {
            await instance.unauthorize().catch(() => undefined);
            authorized = false;
          }
        }

        if (!cancelled) {
          setInstance(instance);
          setStatus({ kind: "ready", authorized });
        }
      } catch (error) {
        // Logged because this branch previously hid a TypeError behind a
        // network-sounding message, which cost a real diagnosis.
        console.error("Apple Music setup failed", error);
        if (!cancelled) setStatus({ kind: "not_configured", message: "Couldn't reach MoodSync's server to set up Apple Music." });
      }
    }

    if (window.MusicKit) {
      void init();
    } else {
      document.addEventListener("musickitloaded", init, { once: true });
    }

    return () => {
      cancelled = true;
      document.removeEventListener("musickitloaded", init);
    };
  }, []);

  async function authorize() {
    const instance = instanceRef.current;
    if (!instance) return;
    setConnectError(null);

    let musicUserToken: string;
    try {
      musicUserToken = await instance.authorize();
    } catch {
      // Closing Apple's sign-in window rejects here. Previously that was
      // an unhandled rejection and the button silently reset.
      setConnectError("Apple Music sign-in didn't finish. Try again when you're ready.");
      return;
    }

    // Persisted server-side so background sync / AI recommendations can
    // eventually use it too — see docs/APPLE_MUSIC_ARCHITECTURE.md §3.
    // Only reported as connected once the server confirms it stored the
    // token: before, a failed save still showed "connected" here while
    // the Connections page said otherwise.
    const saved = await fetch("/api/integrations/apple-music/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicUserToken, storefront: instance.storefrontId }),
    })
      .then((r) => r.ok)
      .catch(() => false);

    if (!saved) {
      // Don't leave the browser authorized against a connection MoodSync
      // doesn't have — the next check on load would undo it anyway.
      await instance.unauthorize().catch(() => undefined);
      setConnectError("Apple approved access, but MoodSync couldn't save the connection. Please try again.");
      return;
    }
    setStatus({ kind: "ready", authorized: true });
  }

  async function unauthorize() {
    const instance = instanceRef.current;
    if (!instance) return;
    await instance.unauthorize();
    setStatus({ kind: "ready", authorized: false });
  }

  async function play() {
    await instanceRef.current?.play();
  }
  /** MusicKit's documented two-step: `setQueue` replaces the queue, then
   * `play` starts it. Library playlists use the `library-playlists`
   * queue key rather than the catalog `playlist` one — these ids come
   * from the user's own `/v1/me/library/playlists`. */
  async function playPlaylist(playlistId: string) {
    const instance = instanceRef.current;
    if (!instance) return;
    await instance.setQueue({ playlist: playlistId });
    await instance.play();
  }
  function pause() {
    instanceRef.current?.pause();
  }
  async function skipNext() {
    await instanceRef.current?.skipToNextItem();
  }
  async function skipPrevious() {
    await instanceRef.current?.skipToPreviousItem();
  }

  return (
    <>
      <Script
        src="https://js-cdn.music.apple.com/musickit/v3/musickit.js"
        strategy="afterInteractive"
        onLoad={() => {
          if (window.MusicKit) document.dispatchEvent(new Event("musickitloaded"));
        }}
      />
      <MusicKitContext.Provider
        value={{
          status,
          connectError,
          authorize,
          unauthorize,
          instance,
          nowPlayingItem,
          playbackState,
          play,
          playPlaylist,
          pause,
          skipNext,
          skipPrevious,
        }}
      >
        {children}
      </MusicKitContext.Provider>
    </>
  );
}
