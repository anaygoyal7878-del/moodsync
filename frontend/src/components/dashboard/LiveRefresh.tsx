"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the dashboard's numbers and recommendations current while the
 * app just sits open.
 *
 * The problem this fixes: every dashboard page is an async server
 * component, and they all fetch with `cache: "no-store"` — so the data
 * is genuinely fresh *at the moment the page renders*, and then frozen
 * forever. Recommendations (`/api/recommendations`), the daily brief and
 * the recovery actions are all regenerated per request server-side, so
 * they were never stale on the server; they were stale on screen,
 * because nothing ever asked again. Someone who opened the app at 7am
 * and glanced at it at noon was reading 7am.
 *
 * `router.refresh()` is the whole mechanism: it re-runs the server
 * components for the current route against the live database and
 * reconciles the result into the existing tree. Client component state
 * survives it, which is why this is safe to run under a half-typed
 * message to Clara or an open confirmation prompt.
 *
 * ## Why this doesn't sync the wearables
 *
 * It deliberately does *not* call `POST /api/sync/all`. That endpoint
 * reaches out to WHOOP and Google Health, and firing it automatically
 * from every open tab every few minutes would spend a third party's
 * rate limit on someone who isn't even looking. Pulling from the device
 * stays the explicit, human-initiated gesture — see `PullToRefresh`,
 * which this sits beside. The division: pull-to-refresh means "go ask my
 * watch", this means "show me what the server already knows".
 *
 * That division is also why the interval below is honest rather than
 * aggressive.
 */

/**
 * How often to re-render, in ms.
 *
 * Pinned to the cadence of the thing upstream that actually produces new
 * data: the `sync-all` worker runs on a five-minute cron (see
 * `workers/railway.sync-all.json`), so new biometric rows land at most
 * every five minutes. Refreshing faster than
 * the data changes doesn't make anything more current — it re-renders
 * identical numbers, on a phone, on battery. Five minutes is the point
 * where "quicker" stops buying anything real.
 *
 * If that cron ever changes, this should change with it.
 */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * The refresh decision, kept pure so it can be tested without timers or
 * a document.
 *
 * Two distinct reasons to refresh, and the second is the one people
 * actually feel:
 *
 * - the interval elapsed while the tab was open and visible;
 * - the tab was hidden for longer than the interval and just came back.
 *
 * The second case is a phone coming out of a pocket. Waiting for the
 * next tick there would show provably stale data for up to five minutes
 * at the exact moment someone is looking at it, which is the worst
 * possible time to be stale.
 */
export function shouldRefresh(input: { hidden: boolean; lastRefreshedAt: number; now: number }): boolean {
  // Never re-render a tab nobody is looking at: it burns battery and
  // buys nothing, since becoming visible triggers its own check below.
  if (input.hidden) return false;
  return input.now - input.lastRefreshedAt >= REFRESH_INTERVAL_MS;
}

export function LiveRefresh() {
  const router = useRouter();
  // Not state: changing it must never itself cause a render.
  //
  // Seeded to 0 and set for real in the effect below rather than to
  // `Date.now()` here — reading the clock during render is impure (React
  // may render a component more than once, or discard the render), and
  // the lint rule that catches it is right to. 0 is never observed as a
  // timestamp because the effect assigns before the first check runs.
  const lastRefreshedAt = useRef(0);

  const refreshIfDue = useCallback(() => {
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (!shouldRefresh({ hidden, lastRefreshedAt: lastRefreshedAt.current, now: Date.now() })) return;
    lastRefreshedAt.current = Date.now();
    router.refresh();
  }, [router]);

  useEffect(() => {
    // The real clock starts here, on mount: the page has just rendered
    // server-side against live data, so the interval should be measured
    // from now and not from some earlier moment.
    if (lastRefreshedAt.current === 0) lastRefreshedAt.current = Date.now();

    // Checked on a shorter tick than the interval itself, rather than a
    // single `setInterval(REFRESH_INTERVAL_MS)`. Browsers throttle timers
    // hard in background tabs, so a five-minute timer set before the
    // phone locked can fire arbitrarily late; a frequent cheap check
    // against a real clock can't drift the same way. The check is a
    // subtraction — the refresh is what's expensive, and that stays
    // gated by `shouldRefresh`.
    const timer = window.setInterval(refreshIfDue, 30_000);
    document.addEventListener("visibilitychange", refreshIfDue);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshIfDue);
    };
  }, [refreshIfDue]);

  // Renders nothing — this is behavior, not chrome. Anything visible
  // here would be a spinner announcing work the user didn't ask for.
  return null;
}
