import { describe, expect, it } from 'vitest';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { computeWeeklyInsights } from './weeklyReport.js';

function makeReading(overrides: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return { provider: 'whoop', userId: 'user-1', timestamp: new Date().toISOString(), ...overrides };
}

describe('computeWeeklyInsights', () => {
  it('returns no rows for too few readings', () => {
    const periodStart = new Date('2026-07-10T00:00:00Z');
    const periodEnd = new Date('2026-07-17T00:00:00Z');
    expect(computeWeeklyInsights({ userId: 'user-1', periodStart, periodEnd, readingsOldestFirst: [] })).toEqual([]);
  });

  it('produces raw-biometric rows, stamped with the given period and userId', () => {
    const periodStart = new Date('2026-07-10T00:00:00Z');
    const periodEnd = new Date('2026-07-17T00:00:00Z');
    const readings = [
      makeReading({ heartRate: 90, restingHeartRate: 70, heartRateVariability: 20 }),
      makeReading({ heartRate: 92, restingHeartRate: 71, heartRateVariability: 18 }),
      makeReading({ heartRate: 60, restingHeartRate: 55, heartRateVariability: 60 }),
      makeReading({ heartRate: 58, restingHeartRate: 54, heartRateVariability: 62 }),
    ];

    const rows = computeWeeklyInsights({ userId: 'user-1', periodStart, periodEnd, readingsOldestFirst: readings });

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.userId).toBe('user-1');
      expect(row.period).toBe('WEEKLY');
      expect(row.periodStart).toBe(periodStart);
      expect(row.periodEnd).toBe(periodEnd);
      expect(typeof row.summary).toBe('string');
    }

    const heartRateRow = rows.find((r) => r.metric === 'heartRate');
    expect(heartRateRow).toBeDefined();
    expect(heartRateRow?.summary).toContain('Heart rate');
  });

  it('includes a wellness.* row once enough baseline history exists for a score to compute', () => {
    // computeWellnessTrends splits readings in half and requires a
    // computable score in *both* halves. Each reading's own score is
    // computed against its own preceding history (>= 5 points, real
    // variance — see ai/src/wellness.ts's stdev === 0 guard), so the
    // first ~5 readings in the whole array always score null. 14
    // readings with real HRV variance ensures both the older and newer
    // half have readings past that 5-point threshold. This mirrors the
    // real bug caught and documented in docs/MILESTONES.md's
    // wellness-rule verification: identical baseline values collapse
    // the score.
    const periodStart = new Date('2026-07-10T00:00:00Z');
    const periodEnd = new Date('2026-07-17T00:00:00Z');
    const hrvValues = [42, 47, 44, 48, 43, 46, 45, 41, 49, 44, 20, 18, 22, 19];
    const readings = hrvValues.map((hrv) => makeReading({ heartRateVariability: hrv, restingHeartRate: 60 }));

    const rows = computeWeeklyInsights({ userId: 'user-1', periodStart, periodEnd, readingsOldestFirst: readings });

    const stressRow = rows.find((r) => r.metric === 'wellness.stress');
    expect(stressRow).toBeDefined();
    expect(stressRow?.summary).toContain('Stress');
  });
});
