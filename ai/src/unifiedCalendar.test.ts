import { describe, it, expect } from 'vitest';
import { mergeCalendarSources, DEDUP_TOLERANCE_MS, type SourceEvent } from './unifiedCalendar.js';

const ev = (startIso: string, minutes: number, title?: string, isAllDay = false): SourceEvent => ({
  start: new Date(startIso),
  end: new Date(new Date(startIso).getTime() + minutes * 60_000),
  isAllDay,
  ...(title === undefined ? {} : { title }),
});

describe('mergeCalendarSources', () => {
  it('10. collapses the same event present in both calendars into one', () => {
    // A Google calendar subscribed on the iPhone shows up through
    // EventKit too. Counting it twice doubles booked hours for every
    // synced event, every day.
    const result = mergeCalendarSources(
      [ev('2026-09-24T15:00:00Z', 60)],
      [ev('2026-09-24T15:00:00Z', 60, 'Sprint planning')],
    )!;
    expect(result).toHaveLength(1);
    expect(result[0]!.sources.sort()).toEqual(['apple', 'google']);
  });

  it('keeps the Google title on a merged pair, since Apple never has one', () => {
    const result = mergeCalendarSources([ev('2026-09-24T15:00:00Z', 60)], [ev('2026-09-24T15:00:00Z', 60, 'Sprint planning')])!;
    expect(result[0]!.title).toBe('Sprint planning');
  });

  it('includes Google events when an Apple snapshot also exists — the bug this fixes', () => {
    // Previously a fresh Apple snapshot returned immediately and Google
    // was never read, so every Google-only event silently vanished.
    const result = mergeCalendarSources(
      [ev('2026-09-24T09:00:00Z', 30)],
      [ev('2026-09-24T18:00:00Z', 120, 'Dinner with Mara')],
    )!;
    expect(result).toHaveLength(2);
    expect(result.some((e) => e.title === 'Dinner with Mara')).toBe(true);
  });

  it('tolerates the small timing differences between the two APIs', () => {
    const result = mergeCalendarSources(
      [ev('2026-09-24T15:00:00Z', 60)],
      [{ ...ev('2026-09-24T15:00:30Z', 60, 'Standup') }],
    )!;
    expect(result).toHaveLength(1);
  });

  it('keeps events apart once they differ by more than the tolerance', () => {
    const later = new Date(new Date('2026-09-24T15:00:00Z').getTime() + DEDUP_TOLERANCE_MS * 5).toISOString();
    const result = mergeCalendarSources([ev('2026-09-24T15:00:00Z', 60)], [ev(later, 60, 'Other thing')])!;
    expect(result).toHaveLength(2);
  });

  it('does not merge a timed event with an all-day event on the same day', () => {
    const result = mergeCalendarSources(
      [ev('2026-09-24T00:00:00Z', 24 * 60, undefined, true)],
      [ev('2026-09-24T00:00:00Z', 24 * 60, 'Conference')],
    )!;
    expect(result).toHaveLength(2);
  });

  it('returns null only when neither calendar is connected', () => {
    // "No calendar" and "free day" say different things to the user, so
    // they must not collapse into the same value.
    expect(mergeCalendarSources(null, null)).toBeNull();
    expect(mergeCalendarSources([], null)).toEqual([]);
    expect(mergeCalendarSources(null, [])).toEqual([]);
  });

  it('works with only one source connected', () => {
    expect(mergeCalendarSources(null, [ev('2026-09-24T15:00:00Z', 60, 'Only Google')])).toHaveLength(1);
    expect(mergeCalendarSources([ev('2026-09-24T15:00:00Z', 60)], null)).toHaveLength(1);
  });

  it('returns events in time order across both sources', () => {
    const result = mergeCalendarSources(
      [ev('2026-09-24T18:00:00Z', 30), ev('2026-09-24T08:00:00Z', 30)],
      [ev('2026-09-24T12:00:00Z', 30, 'Lunch')],
    )!;
    expect(result.map((e) => e.start.toISOString())).toEqual([
      '2026-09-24T08:00:00.000Z',
      '2026-09-24T12:00:00.000Z',
      '2026-09-24T18:00:00.000Z',
    ]);
  });

  it('drops malformed events rather than letting an invalid date poison the list', () => {
    const bad: SourceEvent = { start: new Date('not a date'), end: new Date('also not'), isAllDay: false };
    const backwards = ev('2026-09-24T15:00:00Z', -30);
    const result = mergeCalendarSources([bad, backwards, ev('2026-09-24T09:00:00Z', 30)], null)!;
    expect(result).toHaveLength(1);
  });

  it('does not merge two duplicates within one source into each other twice', () => {
    // A single calendar can legitimately hold the same slot twice; the
    // merge is between sources, and this guards that it stays stable.
    const result = mergeCalendarSources([ev('2026-09-24T15:00:00Z', 60), ev('2026-09-24T15:00:00Z', 60)], null)!;
    expect(result).toHaveLength(1);
    expect(result[0]!.sources).toEqual(['apple']);
  });
});
