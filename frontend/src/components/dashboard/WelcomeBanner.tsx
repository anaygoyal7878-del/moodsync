"use client";

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
  // Computed fresh every render rather than cached in state: the server
  // render and the client's first render read the clock at slightly
  // different instants, which can disagree right at an hour boundary —
  // suppressHydrationWarning tells React that's expected for this one
  // text node instead of discarding the whole SSR-ed tree over it.
  const greeting = timeOfDayGreeting(new Date().getHours());

  return (
    <div className="animate-fade-in-up flex flex-col gap-1.5">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Welcome back, {name} <span aria-hidden="true">👋</span>
      </h1>
      <p className="min-h-[1.5em] text-ink-secondary" suppressHydrationWarning>
        {greeting}
      </p>
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
