/**
 * Hour of day (0-23) for an instant, in a named IANA timezone.
 *
 * Lives here because three callers needed it and two of them had already
 * grown byte-identical private copies — `backend/src/api/routes/companion.ts`
 * and `backend/src/api/routes/musicSessions.ts`. A third copy was about
 * to appear in `ai/src/intelligenceContext.ts`, which is the point at
 * which duplication stops being harmless.
 *
 * The fallback matters: `Intl` throws on an invalid timezone string, and
 * a user's stored timezone is data that can be wrong. Falling back to
 * UTC keeps an hour-of-day feature slightly inaccurate rather than
 * taking down the request that needed it.
 */
export function hourInZone(date: Date, timezone: string): number {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(date);
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour % 24 : date.getUTCHours();
  } catch {
    return date.getUTCHours();
  }
}
