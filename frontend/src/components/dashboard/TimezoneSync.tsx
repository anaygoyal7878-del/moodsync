"use client";

import { useEffect } from "react";

/** Silent, no-UI sync: quiet hours and timeWindow rules (Focus Mode,
 * Sleep Preparation) are evaluated server-side against `User.timezone`
 * (see ai/src/ruleEngine.ts's `withinTimeWindow`), which defaults to
 * "UTC" and is otherwise never set by anything. Detects the browser's
 * real IANA timezone and pushes it to the backend once per mismatch,
 * so those features actually evaluate in the user's local time instead
 * of silently defaulting to UTC forever. */
export function TimezoneSync({ serverTimezone }: { serverTimezone: string }) {
  useEffect(() => {
    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!detected || detected === serverTimezone) return;

    fetch("/api/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: detected }),
    }).catch(() => {
      // Best-effort — a failed sync just leaves the previous timezone in
      // place until the next page load tries again.
    });
  }, [serverTimezone]);

  return null;
}
