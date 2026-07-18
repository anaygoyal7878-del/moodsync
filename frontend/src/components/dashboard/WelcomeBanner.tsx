"use client";

import { useState } from "react";

function timeOfDayGreeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** The personalized dashboard-home header — greeting + today's real
 * insight sentences (computed server-side from actual wellness trends,
 * passed in as `insights`; never invented copy). Time-of-day is read
 * from the browser's own clock (client component) rather than computed
 * server-side, so it always matches the device the user is actually
 * looking at right now rather than the server's or a stored timezone's
 * clock. */
export function WelcomeBanner({ name, insights }: { name: string; insights: string[] }) {
  // Lazy initializer (not an effect) — this only needs to compute once
  // per mount, not subscribe to ongoing changes, so there's no reason to
  // pay for a second render just to set it. `typeof window` gates the
  // server-render pass (which has no real "now" to read) the same way
  // usePrefersReducedMotion.ts does for its own client-only value.
  const [greeting] = useState<string | null>(() =>
    typeof window !== "undefined" ? timeOfDayGreeting(new Date().getHours()) : null,
  );

  return (
    <div className="animate-fade-in-up flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Welcome back, {name} <span aria-hidden="true">👋</span>
      </h1>
      {/* Reserves the line's height even before the client-only greeting
       * resolves, so nothing shifts layout on hydration. */}
      <p className="min-h-[1.5em] text-ink-secondary">{greeting ?? " "}</p>
      {insights.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1 text-sm text-ink-secondary">
          {insights.map((line) => (
            <li key={line} className="flex items-start gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
