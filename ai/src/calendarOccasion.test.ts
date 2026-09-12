import { describe, it, expect } from 'vitest';
import { inferCalendarOccasion, applicationTiming, type OccasionEvent } from './calendarOccasion.js';

/** All fixtures are UTC and localHour is passed as the UTC hour, so the
 * offset is zero and event-local hours equal their UTC hours. */
const at = (iso: string, minutes: number, title?: string): OccasionEvent => ({
  start: new Date(iso),
  end: new Date(new Date(iso).getTime() + minutes * 60_000),
  isAllDay: false,
  ...(title === undefined ? {} : { title }),
});

const NOW = new Date('2026-03-15T15:00:00Z'); // 15:00 UTC

describe('inferCalendarOccasion — titles (Google)', () => {
  it('reads a dinner as a date', () => {
    const result = inferCalendarOccasion([at('2026-03-15T19:00:00Z', 120, 'Dinner with Mara')], NOW, 15);
    expect(result.occasion).toBe('date');
    expect(result.basis).toBe('title');
    expect(result.reason).toContain('Dinner with Mara');
  });

  it('reads a wedding as a formal event, ahead of any other keyword', () => {
    const result = inferCalendarOccasion([at('2026-03-15T18:00:00Z', 300, "Priya's wedding — dinner after")], NOW, 15);
    expect(result.occasion).toBe('formal_event');
  });

  it('does not send "training" to travel on a substring match', () => {
    // "training" contains "train". Substring matching would put every
    // gym session on a plane.
    const result = inferCalendarOccasion([at('2026-03-15T17:00:00Z', 60, 'Strength training')], NOW, 15);
    expect(result.occasion).toBe('workout');
  });

  it('reads a flight as travel', () => {
    expect(inferCalendarOccasion([at('2026-03-15T20:00:00Z', 180, 'Flight to Denver')], NOW, 15).occasion).toBe('travel');
  });

  it('reads a standup as work', () => {
    expect(inferCalendarOccasion([at('2026-03-15T16:00:00Z', 30, 'Team standup')], NOW, 15).occasion).toBe('work');
  });
});

describe('inferCalendarOccasion — structure only (Apple)', () => {
  it('calls a long evening event an outing, not a date', () => {
    // The restraint that matters. An untitled 8pm block is equally a
    // dinner, a concert, or a parent's birthday — "for your date
    // tonight" about a mother's birthday is the confident wrongness
    // that makes someone switch a feature off.
    const result = inferCalendarOccasion([at('2026-03-15T20:00:00Z', 120)], NOW, 15);
    expect(result.occasion).toBe('casual_outing');
    expect(result.occasion).not.toBe('date');
    expect(result.basis).toBe('structure');
  });

  it('says out loud that the source shares no titles', () => {
    // An Apple-only user should know why this is vaguer than it could
    // be, rather than concluding MoodSync guessed badly.
    const result = inferCalendarOccasion([at('2026-03-15T20:00:00Z', 120)], NOW, 15);
    expect(result.reason).toMatch(/doesn't share event titles/i);
  });

  it('treats an untitled business-hours event as work', () => {
    const result = inferCalendarOccasion([at('2026-03-15T16:00:00Z', 45)], NOW, 15);
    expect(result.occasion).toBe('work');
    expect(result.basis).toBe('structure');
  });

  it('ignores a brief evening errand rather than dressing for it', () => {
    const result = inferCalendarOccasion([at('2026-03-15T20:00:00Z', 20)], NOW, 15);
    expect(result.occasion).toBe('unspecified');
    expect(result.basis).toBe('none');
  });

  it('never infers an occasion from an all-day block', () => {
    const allDay: OccasionEvent = { start: new Date('2026-03-15T00:00:00Z'), end: new Date('2026-03-16T00:00:00Z'), isAllDay: true };
    expect(inferCalendarOccasion([allDay], NOW, 15).basis).toBe('none');
  });
});

describe('inferCalendarOccasion — selection', () => {
  it('picks the next event, not the first of the day', () => {
    // Someone asking at 3pm cares about tonight, not this morning's
    // standup that already finished.
    const result = inferCalendarOccasion(
      [at('2026-03-15T09:00:00Z', 30, 'Team standup'), at('2026-03-15T19:00:00Z', 120, 'Dinner with Mara')],
      NOW,
      15,
    );
    expect(result.occasion).toBe('date');
  });

  it('still uses an event already in progress', () => {
    const result = inferCalendarOccasion([at('2026-03-15T14:30:00Z', 120, 'Client workshop')], NOW, 15);
    expect(result.occasion).toBe('work');
  });

  it('falls back to unspecified with an empty calendar', () => {
    const result = inferCalendarOccasion([], NOW, 15);
    expect(result).toMatchObject({ occasion: 'unspecified', basis: 'none', event: null });
  });
});

describe('applicationTiming', () => {
  it('says nothing when there is no event to time against', () => {
    expect(applicationTiming(inferCalendarOccasion([], NOW, 15), NOW)).toBeNull();
  });

  it('tells you to apply before leaving so people meet the heart notes', () => {
    // The actual insight: apply on the way out and everyone meets top
    // notes that are gone in 30 minutes.
    const occasion = inferCalendarOccasion([at('2026-03-15T17:00:00Z', 120, 'Dinner with Mara')], NOW, 15);
    const timing = applicationTiming(occasion, NOW)!;
    expect(timing.detail).toMatch(/heart notes/i);
  });

  it('says apply now when the event is inside the top-note window', () => {
    const occasion = inferCalendarOccasion([at('2026-03-15T15:20:00Z', 90, 'Dinner with Mara')], NOW, 15);
    expect(applicationTiming(occasion, NOW)!.headline).toMatch(/apply now/i);
  });

  it('says it is too early when the event is past the heart-note window', () => {
    const occasion = inferCalendarOccasion([at('2026-03-15T23:00:00Z', 120, 'Dinner with Mara')], NOW, 15);
    expect(applicationTiming(occasion, NOW)!.headline).toMatch(/too early/i);
  });

  it('mentions the base notes carrying a long event', () => {
    const occasion = inferCalendarOccasion([at('2026-03-15T14:00:00Z', 360, "Priya's wedding")], NOW, 15);
    expect(applicationTiming(occasion, NOW)!.detail).toMatch(/base notes/i);
  });
});
