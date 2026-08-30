"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, ArrowDown, Check, AlertTriangle } from "lucide-react";
import { WEARABLE_LABELS } from "@/lib/providerDisplay";

/** How far the finger travels before a release actually refreshes. Below
 * this the sheet springs back and nothing happens — a short accidental
 * drag while reading should never trigger a network round trip. */
const TRIGGER_DISTANCE_PX = 72;
/** Ceiling on how far the content follows the finger. The pull is damped
 * (see `resistance`), so this is reached well after the trigger point —
 * the gesture keeps giving feedback without the page sliding off. */
const MAX_PULL_PX = 120;
/** Pull distance is divided by this, so the sheet moves slower than the
 * finger. Standard rubber-banding: it signals "this is a gesture, not
 * scrolling" without a hard stop. */
const RESISTANCE = 2.2;
/** How long the result banner stays before fading. Long enough to read a
 * per-provider outcome, short enough not to linger. */
const RESULT_VISIBLE_MS = 4000;

interface ProviderSyncResult {
  provider: string;
  status: "synced" | "failed" | "push_only";
  readingsInserted?: number;
  detail?: string;
}

interface SyncResponse {
  results: ProviderSyncResult[];
  readingsInserted: number;
  syncedCount: number;
  failedCount: number;
}

type Phase = "idle" | "pulling" | "refreshing" | "done";

function providerLabel(provider: string): string {
  return (WEARABLE_LABELS[provider] as string | undefined) ?? provider;
}

/**
 * Summarizes what a refresh actually accomplished.
 *
 * Deliberately not a flat "Updated!" — `/api/sync/all` reports per
 * provider because only WHOOP and Fitbit can be pulled on demand;
 * Apple Health and Amazfit push on their own schedule (see that route's
 * doc comment). Someone who pulls to refresh with only an Apple Watch
 * connected has genuinely not fetched anything new, and saying otherwise
 * would teach them to distrust the number on screen the first time it
 * didn't move.
 */
export function summarizeSync(response: SyncResponse): { tone: "ok" | "warn"; message: string } {
  const failed = response.results.filter((r) => r.status === "failed");
  const pushOnly = response.results.filter((r) => r.status === "push_only");

  if (response.results.length === 0) {
    return { tone: "warn", message: "No wearable connected yet." };
  }
  if (failed.length > 0) {
    return {
      tone: "warn",
      message: `Couldn't reach ${failed.map((r) => providerLabel(r.provider)).join(", ")}.`,
    };
  }
  if (response.syncedCount === 0 && pushOnly.length > 0) {
    // Every connected provider is push-only. Name them, so "nothing
    // happened" reads as an explanation rather than a failure.
    return {
      tone: "ok",
      message: `${pushOnly.map((r) => providerLabel(r.provider)).join(" and ")} sends data from your device — showing the latest it sent.`,
    };
  }
  if (response.readingsInserted === 0) {
    return { tone: "ok", message: "Up to date — no new readings." };
  }
  return {
    tone: "ok",
    message: `${response.readingsInserted} new reading${response.readingsInserted === 1 ? "" : "s"}.`,
  };
}

/**
 * Pull down at the top of the dashboard to re-sync wearables and reload
 * the page's data.
 *
 * Two implementation details are load-bearing:
 *
 * 1. **Finding the scroll container.** DashboardShellFrame scrolls a
 *    `div` in web mode (`h-screen overflow-y-auto`) but the window in
 *    mobile mode, so "am I at the top?" has two different answers. This
 *    walks up from its own node to whichever ancestor actually scrolls,
 *    rather than assuming `window` — assuming wrong means the gesture
 *    fires mid-page on desktop, which feels broken.
 *
 * 2. **Only starting the gesture at scrollTop 0.** Otherwise a normal
 *    upward flick through content would be captured as a pull.
 *
 * Touch only, by design: this responds to `touchstart`/`touchmove`, so
 * it's inert with a mouse. Desktop already has a real refresh (the
 * browser's own, plus per-provider Sync buttons on Connections); adding
 * a drag-to-refresh for cursors would be inventing a gesture nobody
 * expects on that platform.
 */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollerRef = useRef<HTMLElement | Window | null>(null);
  const startYRef = useRef<number | null>(null);
  const phaseRef = useRef<Phase>("idle");

  const [phase, setPhase] = useState<Phase>("idle");
  const [pull, setPull] = useState(0);
  const [result, setResult] = useState<{ tone: "ok" | "warn"; message: string } | null>(null);

  // Mirror phase into a ref so the touch handlers (bound once, on a
  // passive-sensitive listener) read the current value without being
  // re-bound on every state change.
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  /** Nearest ancestor that actually scrolls, or `window`. */
  const resolveScroller = useCallback((): HTMLElement | Window => {
    let node = containerRef.current?.parentElement ?? null;
    while (node) {
      const overflowY = getComputedStyle(node).overflowY;
      if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
        return node;
      }
      node = node.parentElement;
    }
    return window;
  }, []);

  const scrollTopOf = useCallback((scroller: HTMLElement | Window): number => {
    return scroller instanceof Window ? window.scrollY : scroller.scrollTop;
  }, []);

  const runRefresh = useCallback(async () => {
    setPhase("refreshing");
    setPull(TRIGGER_DISTANCE_PX);
    try {
      const response = await fetch("/api/sync/all", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      const data = (await response.json()) as SyncResponse;
      setResult(summarizeSync(data));
      // Re-render server components so the freshly-synced rows actually
      // appear — syncing without this would update the database and
      // leave the screen showing the old numbers.
      router.refresh();
    } catch {
      setResult({ tone: "warn", message: "Couldn't refresh just now." });
    } finally {
      setPhase("done");
      setPull(0);
      window.setTimeout(() => {
        setResult(null);
        setPhase("idle");
      }, RESULT_VISIBLE_MS);
    }
  }, [router]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function onTouchStart(event: TouchEvent) {
      if (phaseRef.current === "refreshing") return;
      const scroller = resolveScroller();
      scrollerRef.current = scroller;
      // Only a pull that begins at the very top is a refresh gesture.
      if (scrollTopOf(scroller) > 0) {
        startYRef.current = null;
        return;
      }
      startYRef.current = event.touches[0]?.clientY ?? null;
    }

    function onTouchMove(event: TouchEvent) {
      if (startYRef.current === null || phaseRef.current === "refreshing") return;
      const currentY = event.touches[0]?.clientY ?? 0;
      const delta = currentY - startYRef.current;
      // Upward drag is ordinary scrolling — hand it back immediately.
      if (delta <= 0) {
        if (phaseRef.current === "pulling") {
          setPhase("idle");
          setPull(0);
        }
        return;
      }
      // A scroller that moved after touchstart means the finger is
      // scrolling content, not pulling the sheet.
      const scroller = scrollerRef.current;
      if (scroller && scrollTopOf(scroller) > 0) {
        startYRef.current = null;
        setPhase("idle");
        setPull(0);
        return;
      }

      const damped = Math.min(delta / RESISTANCE, MAX_PULL_PX);
      setPhase("pulling");
      setPull(damped);
      // Suppress the browser's own overscroll/bounce only once this is
      // unambiguously a pull, so short drags still scroll normally.
      if (damped > 4 && event.cancelable) event.preventDefault();
    }

    function onTouchEnd() {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (phaseRef.current !== "pulling") return;
      // `pull` is read via the functional form so this doesn't need to
      // be re-bound every time the distance changes.
      setPull((current) => {
        if (current >= TRIGGER_DISTANCE_PX) void runRefresh();
        else setPhase("idle");
        return current >= TRIGGER_DISTANCE_PX ? current : 0;
      });
    }

    // Not passive: onTouchMove calls preventDefault to stop the browser's
    // native overscroll fighting the gesture.
    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [resolveScroller, scrollTopOf, runRefresh]);

  const armed = pull >= TRIGGER_DISTANCE_PX;
  const showIndicator = phase !== "idle" || pull > 0;

  return (
    <div ref={containerRef} className="relative">
      {/* Gesture affordance. aria-hidden because the live region below
          is what actually announces the outcome — a spinner that reads
          out its own rotation is noise. */}
      {showIndicator && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center"
          style={{ height: Math.max(pull, phase === "refreshing" ? TRIGGER_DISTANCE_PX : 0) }}
        >
          <span
            className="mt-3 flex h-9 w-9 items-center justify-center rounded-full"
            style={{
              background: "var(--lux-bg-card-2)",
              border: "1px solid var(--lux-hairline)",
              opacity: Math.min(pull / TRIGGER_DISTANCE_PX, 1),
            }}
          >
            {phase === "refreshing" ? (
              <RefreshCw size={15} className="animate-spin" style={{ color: "var(--lux-sage)" }} />
            ) : (
              <ArrowDown
                size={15}
                className="transition-transform duration-150"
                style={{
                  color: armed ? "var(--lux-sage)" : "var(--lux-muted)",
                  transform: armed ? "rotate(180deg)" : "none",
                }}
              />
            )}
          </span>
        </div>
      )}

      {result && (
        <div
          role="status"
          className="mb-3 flex items-center gap-2 rounded-[14px] px-3 py-2 text-[12.5px]"
          style={{
            background: "var(--lux-bg-card)",
            border: `1px solid ${result.tone === "warn" ? "var(--lux-hairline-gold)" : "var(--lux-hairline)"}`,
            color: "var(--lux-muted)",
          }}
        >
          {result.tone === "warn" ? (
            <AlertTriangle size={13} style={{ color: "var(--lux-gold)" }} aria-hidden="true" />
          ) : (
            <Check size={13} style={{ color: "var(--lux-sage)" }} aria-hidden="true" />
          )}
          {result.message}
        </div>
      )}

      <div
        style={{
          transform: pull > 0 ? `translateY(${pull}px)` : undefined,
          transition: phase === "pulling" ? "none" : "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
