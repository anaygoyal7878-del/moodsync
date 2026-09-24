/**
 * One calendar, from two sources.
 *
 * ## The bug this fixes
 *
 * Every calendar read in `calendarSignal.ts` was either/or: a fresh
 * Apple snapshot returned immediately and Google was never consulted.
 * So someone with work events in Google Calendar and personal ones in
 * Apple Calendar lost every Google event without any indication — load
 * was undercounted, `inMeeting` missed their meetings, and the
 * occasion inference never saw their dinners. The two integrations
 * existed side by side without ever being combined.
 *
 * This merges them into a single list the rest of the app reads.
 *
 * ## Deduplication, and why it matches on time
 *
 * The same event commonly appears in both — a Google calendar
 * subscribed on the iPhone shows up through EventKit too. Counting it
 * twice would double "booked hours" for every such event, which is a
 * large, systematic error for anyone who syncs their work calendar to
 * their phone.
 *
 * Matching has to be on the time window, because Apple events carry no
 * title: `AppleCalendarSnapshot` stores start, end and all-day only, as
 * a deliberate privacy decision recorded on that schema model. Two
 * events are treated as one when their start and end both agree within
 * `DEDUP_TOLERANCE_MS` and their all-day flag matches.
 *
 * The known cost: two genuinely different events with identical start
 * *and* end times, one in each calendar, collapse into one. That is
 * rare and undercounts by a single event; the alternative — never
 * deduplicating — overcounts every synced event, every day. The first
 * error is the smaller one.
 *
 * When a pair merges, the Google copy's title is kept, since it is the
 * only one that has one.
 */

export type CalendarSource = 'apple' | 'google';

export interface SourceEvent {
  start: Date;
  end: Date;
  isAllDay: boolean;
  /** Google only. Apple's snapshot stores no titles by design. */
  title?: string | null | undefined;
}

export interface UnifiedEvent {
  start: Date;
  end: Date;
  isAllDay: boolean;
  /** Present only when a Google copy supplied one. */
  title: string | null;
  /** Every source this event was seen in. Two entries means it was
   * deduplicated, which is worth surfacing in debugging and in the
   * "what MoodSync is using" screen. */
  sources: CalendarSource[];
}

/**
 * How close two start (and two end) times must be to count as the same
 * event. A minute rather than zero, because the two APIs round
 * differently and an exact-match rule would miss real duplicates.
 */
export const DEDUP_TOLERANCE_MS = 60_000;

function sameWindow(a: SourceEvent, b: SourceEvent): boolean {
  return (
    a.isAllDay === b.isAllDay &&
    Math.abs(a.start.getTime() - b.start.getTime()) <= DEDUP_TOLERANCE_MS &&
    Math.abs(a.end.getTime() - b.end.getTime()) <= DEDUP_TOLERANCE_MS
  );
}

function isValid(event: SourceEvent): boolean {
  return !Number.isNaN(event.start.getTime()) && !Number.isNaN(event.end.getTime()) && event.end >= event.start;
}

/**
 * Merges both sources into one time-ordered, deduplicated list.
 *
 * `null` for a source means "not connected or unreadable", and is
 * different from `[]` ("connected, nothing on"). The result is `null`
 * only when *both* are null, preserving the distinction the rest of the
 * calendar code already relies on: "no calendar connected" must stay
 * distinguishable from "connected, genuinely free day", because one
 * should say "connect a calendar" and the other should say nothing.
 */
export function mergeCalendarSources(apple: SourceEvent[] | null, google: SourceEvent[] | null): UnifiedEvent[] | null {
  if (apple === null && google === null) return null;

  const merged: UnifiedEvent[] = [];

  // Google first, so a merged pair keeps the copy with a title.
  for (const event of (google ?? []).filter(isValid)) {
    const existing = merged.find((m) => sameWindow(m, event));
    if (existing) {
      if (!existing.sources.includes('google')) existing.sources.push('google');
      continue;
    }
    merged.push({ start: event.start, end: event.end, isAllDay: event.isAllDay, title: event.title ?? null, sources: ['google'] });
  }

  for (const event of (apple ?? []).filter(isValid)) {
    const existing = merged.find((m) => sameWindow(m, event));
    if (existing) {
      if (!existing.sources.includes('apple')) existing.sources.push('apple');
      continue;
    }
    merged.push({ start: event.start, end: event.end, isAllDay: event.isAllDay, title: null, sources: ['apple'] });
  }

  return merged.sort((a, b) => a.start.getTime() - b.start.getTime());
}
