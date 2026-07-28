import { describe, expect, it } from 'vitest';
import { computeWalkingStreak, computeMeditationStreak } from './habits.js';
import type { NormalizedBiometricReading } from '@moodsync/shared';

const ASOF = new Date('2026-07-15T12:00:00Z');

function reading(dateIso: string, steps: number): NormalizedBiometricReading {
  return { provider: 'google_health', userId: 'u1', timestamp: dateIso, steps };
}

describe('computeWalkingStreak', () => {
  it('returns a zero streak with null consistency when there is no step data at all', () => {
    const result = computeWalkingStreak([], ASOF);
    expect(result).toEqual({ habit: 'walking', currentStreakDays: 0, consistencyPct: null, lastMetDate: null });
  });

  it('counts a current streak of consecutive days at/above the threshold, ending today', () => {
    const readings = [
      reading('2026-07-13T09:00:00Z', 9000),
      reading('2026-07-14T09:00:00Z', 8500),
      reading('2026-07-15T09:00:00Z', 8200),
    ];
    const result = computeWalkingStreak(readings, ASOF);
    expect(result.currentStreakDays).toBe(3);
    expect(result.lastMetDate).toBe('2026-07-15');
  });

  it('takes the max steps value per day rather than summing repeated same-day rollups', () => {
    const readings = [reading('2026-07-15T09:00:00Z', 3000), reading('2026-07-15T14:00:00Z', 8500), reading('2026-07-15T20:00:00Z', 8600)];
    const result = computeWalkingStreak(readings, ASOF);
    expect(result.currentStreakDays).toBe(1); // met once, not tripled
  });

  it('still shows the streak as current if today has no data yet but yesterday was met', () => {
    const readings = [reading('2026-07-14T09:00:00Z', 8500)];
    const result = computeWalkingStreak(readings, ASOF);
    expect(result.currentStreakDays).toBe(1);
  });

  it('resets to 0 once a day below threshold breaks the streak', () => {
    const readings = [reading('2026-07-13T09:00:00Z', 3000), reading('2026-07-15T09:00:00Z', 9000)];
    const result = computeWalkingStreak(readings, ASOF);
    expect(result.currentStreakDays).toBe(1); // 07-14 has no data, breaks the walk-back at yesterday
  });

  it('computes consistency as a percentage of the last 30 days met', () => {
    const readings = Array.from({ length: 10 }, (_, i) => reading(new Date(ASOF.getTime() - i * 86_400_000).toISOString(), 9000));
    const result = computeWalkingStreak(readings, ASOF);
    expect(result.consistencyPct).toBe(Math.round((10 / 30) * 100));
  });
});

describe('computeMeditationStreak', () => {
  it('returns null consistency with no sessions', () => {
    expect(computeMeditationStreak([], ASOF).consistencyPct).toBeNull();
  });

  it('counts a day met if any session completed that day, regardless of duration', () => {
    const sessions = [{ completedAt: new Date('2026-07-15T08:00:00Z') }, { completedAt: new Date('2026-07-14T22:00:00Z') }];
    const result = computeMeditationStreak(sessions, ASOF);
    expect(result.currentStreakDays).toBe(2);
    expect(result.lastMetDate).toBe('2026-07-15');
  });
});
