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
  authorize: () => Promise<void>;
  unauthorize: () => Promise<void>;
  instance: MusicKit.MusicKitInstance | null;
  nowPlayingItem: MusicKit.MediaItem | null;
  playbackState: MusicKit.PlaybackStates | null;
  play: () => Promise<void>;
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

        const instance = musicKit.configure({ developerToken, app: { name: "MoodSync", build: "1.0.0" } });
        instanceRef.current = instance;

        const updateNowPlaying = () => setNowPlayingItem(instance.nowPlayingItem);
        const updatePlaybackState = () => setPlaybackState(instance.playbackState);
        instance.addEventListener("nowPlayingItemDidChange", updateNowPlaying);
        instance.addEventListener("playbackStateDidChange", updatePlaybackState);

        if (!cancelled) {
          setInstance(instance);
          setStatus({ kind: "ready", authorized: instance.isAuthorized });
        }
      } catch {
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
    const musicUserToken = await instance.authorize();
    // Persisted server-side so background sync / AI recommendations can
    // eventually use it too — see docs/APPLE_MUSIC_ARCHITECTURE.md §3.
    await fetch("/api/integrations/apple-music/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ musicUserToken, storefront: instance.storefrontId }),
    });
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
        value={{ status, authorize, unauthorize, instance, nowPlayingItem, playbackState, play, pause, skipNext, skipPrevious }}
      >
        {children}
      </MusicKitContext.Provider>
    </>
  );
}
