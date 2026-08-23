import { describe, expect, it } from 'vitest';
import { nextNudgeKind, isRecurringNudgeDue, NUDGE_CONTENT } from './recurringNudge.js';

describe('nextNudgeKind', () => {
  it('starts a brand-new subscriber at the first entry, deterministically', () => {
    expect(nextNudgeKind(null)).toBe('hydration');
  });

  it('rotates through the fixed order', () => {
    expect(nextNudgeKind('hydration')).toBe('movement');
    expect(nextNudgeKind('movement')).toBe('posture');
  });

  it('wraps back to the start after the last entry', () => {
    expect(nextNudgeKind('posture')).toBe('hydration');
  });

  it('restarts the cycle rather than throwing on an unrecognized stored kind', () => {
    // e.g. a future rotation change, or a hand-edited row.
    expect(nextNudgeKind('some-retired-kind' as never)).toBe('hydration');
  });

  it('every kind in the rotation has real content, so nothing in the cycle sends an empty message', () => {
    for (const kind of ['hydration', 'movement', 'posture'] as const) {
      expect(NUDGE_CONTENT[kind].title.length).toBeGreaterThan(0);
      expect(NUDGE_CONTENT[kind].body.length).toBeGreaterThan(0);
    }
  });
});

describe('isRecurringNudgeDue', () => {
  const now = new Date('2026-08-22T15:00:00Z');

  it('is always due for a subscriber who has never gotten one', () => {
    // Waiting a full interval for the first nudge would be a bad first
    // impression, the same way a new subscription doesn't make you
    // wait for the first issue.
    expect(isRecurringNudgeDue(3, null, now)).toBe(true);
  });

  it('is not due before the interval elapses', () => {
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60_000);
    expect(isRecurringNudgeDue(3, twoHoursAgo, now)).toBe(false);
  });

  it('is due once the interval has fully elapsed', () => {
    const threeHoursAgo = new Date(now.getTime() - 3 * 60 * 60_000);
    expect(isRecurringNudgeDue(3, threeHoursAgo, now)).toBe(true);
  });

  it('is due well past the interval too — a missed worker tick does not un-due it', () => {
    const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60_000);
    expect(isRecurringNudgeDue(3, twoDaysAgo, now)).toBe(true);
  });
});
