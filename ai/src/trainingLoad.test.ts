import { describe, it, expect } from 'vitest';
import { sessionLoad, summarizeTrainingLoad, type LoggedSession } from './trainingLoad.js';

const NOW = new Date('2026-09-25T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const s = (d: number, minutes: number | null, effort: number | null): LoggedSession => ({ completedAt: daysAgo(d), minutes, effort });

describe('sessionLoad', () => {
  it('is duration × effort', () => {
    expect(sessionLoad(s(1, 45, 4))).toBe(180);
  });

  it('refuses to guess when effort was not rated', () => {
    // An easy walk and intervals of equal length differ several-fold.
    expect(sessionLoad(s(1, 45, null))).toBeNull();
  });

  it('rejects out-of-range values rather than computing with them', () => {
    expect(sessionLoad(s(1, 45, 9))).toBeNull();
    expect(sessionLoad(s(1, 0, 3))).toBeNull();
  });
});

describe('summarizeTrainingLoad', () => {
  // Three prior weeks at 2 sessions × 60min × effort 3 = 360/week.
  const history = [s(9, 60, 3), s(11, 60, 3), s(16, 60, 3), s(18, 60, 3), s(23, 60, 3), s(25, 60, 3)];

  it('compares this week with the person’s own typical week', () => {
    const summary = summarizeTrainingLoad([...history, s(1, 60, 4), s(3, 60, 4), s(5, 60, 4)], NOW);
    expect(summary.typicalWeeklyLoad).toBe(360);
    expect(summary.acuteLoad).toBe(720);
    expect(summary.ratio).toBe(2);
  });

  it('has no "typical" until at least two prior weeks have data', () => {
    // One week of history is a single sample, not a norm.
    const summary = summarizeTrainingLoad([s(9, 60, 3), s(1, 60, 4)], NOW);
    expect(summary.typicalWeeklyLoad).toBeNull();
    expect(summary.ratio).toBeNull();
  });

  it('counts a rest week in the average rather than dropping it', () => {
    // Dropping empty weeks would inflate "typical" and make every
    // ordinary week look light.
    const twoOfThree = [s(9, 60, 3), s(11, 60, 3), s(16, 60, 3), s(18, 60, 3)]; // week 3 empty
    expect(summarizeTrainingLoad(twoOfThree, NOW).typicalWeeklyLoad).toBe(240);
  });

  it('tracks unrated sessions this week separately', () => {
    const summary = summarizeTrainingLoad([...history, s(1, 60, null), s(2, 45, null), s(3, 60, 3)], NOW);
    expect(summary.ratedSessionsThisWeek).toBe(1);
    expect(summary.unratedSessionsThisWeek).toBe(2);
  });

  it('ignores sessions dated in the future', () => {
    const summary = summarizeTrainingLoad([...history, { completedAt: new Date(NOW.getTime() + 86_400_000), minutes: 60, effort: 5 }], NOW);
    expect(summary.acuteLoad).toBe(0);
  });
});
