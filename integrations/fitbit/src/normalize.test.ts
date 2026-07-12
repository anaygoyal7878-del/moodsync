import { describe, expect, it } from 'vitest';
import { normalizeGoogleHealthData } from './normalize.js';
import type { RollupDataPoint, DailyRestingHeartRatePoint, SleepDataPoint, HeartRateSamplePoint } from './client.js';

function civil(year: number, month: number, day: number) {
  return { year, month, day, hour: 0, minute: 0, second: 0 };
}

function makeStepsRollup(overrides: Partial<RollupDataPoint> = {}): RollupDataPoint {
  return {
    civilStartTime: civil(2026, 7, 10),
    civilEndTime: civil(2026, 7, 11),
    steps: { countSum: 8000 },
    ...overrides,
  };
}

function makeHeartRateRollup(overrides: Partial<RollupDataPoint> = {}): RollupDataPoint {
  return {
    civilStartTime: civil(2026, 7, 10),
    civilEndTime: civil(2026, 7, 11),
    heartRate: { beatsPerMinuteMin: 55, beatsPerMinuteMax: 140, beatsPerMinuteAvg: 72 },
    ...overrides,
  };
}

function makeHeartRateSample(overrides: { physicalTime?: string; beatsPerMinute?: string } = {}): HeartRateSamplePoint {
  return {
    name: 'users/me/dataTypes/heart-rate/dataPoints/1',
    data: {
      heartRate: {
        sampleTime: { physicalTime: overrides.physicalTime ?? '2026-07-10T12:00:00Z' },
        beatsPerMinute: overrides.beatsPerMinute ?? '68',
      },
    },
  };
}

function makeRestingHeartRate(overrides: Partial<DailyRestingHeartRatePoint['data']['dailyRestingHeartRate']> = {}) {
  return {
    name: 'users/me/dataTypes/daily-resting-heart-rate/dataPoints/1',
    data: { dailyRestingHeartRate: { date: { year: 2026, month: 7, day: 10 }, beatsPerMinute: 54, ...overrides } },
  };
}

function makeSleep(summary: { minutesAsleep: string; minutesInSleepPeriod: string }): SleepDataPoint {
  return {
    name: 'users/me/dataTypes/sleep/dataPoints/1',
    data: {
      sleep: {
        interval: { startTime: '2026-07-10T00:00:00Z', endTime: '2026-07-10T08:00:00Z' },
        summary,
      },
    },
  };
}

describe('normalizeGoogleHealthData', () => {
  it('merges same-day steps, heart rate, and resting heart rate into one reading', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup()],
      heartRateRollups: [makeHeartRateRollup()],
      caloriesRollups: [],
      restingHeartRates: [makeRestingHeartRate()],
      sleeps: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: 'google_health',
      userId: 'user-1',
      steps: 8000,
      heartRate: 72,
      restingHeartRate: 54,
    });
    expect(result[0]?.recoveryScore).toBeUndefined();
    expect(result[0]?.stressLevel).toBeUndefined();
  });

  it('produces separate readings for different days', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup(), makeStepsRollup({ civilStartTime: civil(2026, 7, 9), steps: { countSum: 5000 } })],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [],
    });
    expect(result).toHaveLength(2);
  });

  it('derives activityLevel from steps, scaled against a 10,000-step benchmark', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup({ steps: { countSum: 5000 } })],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [],
    });
    expect(result[0]?.activityLevel).toBeCloseTo(50, 5);
  });

  it('caps activityLevel at 100 for step counts above the benchmark', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup({ steps: { countSum: 20_000 } })],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [],
    });
    expect(result[0]?.activityLevel).toBe(100);
  });

  it('computes sleepScore as efficiency (minutesAsleep / minutesInSleepPeriod) on the most recent day', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup()],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [makeSleep({ minutesAsleep: '419', minutesInSleepPeriod: '465' })],
    });
    // 419 / 465 * 100 ≈ 90.1 -> rounds to 90
    expect(result[0]?.sleepScore).toBe(90);
  });

  it('leaves sleepScore unset when no sleep data is available', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup()],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [],
    });
    expect(result[0]?.sleepScore).toBeUndefined();
  });

  it('emits a separate reading per heart-rate sample, at its own timestamp, not merged into the day bucket', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup()],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [],
      heartRateSamples: [
        makeHeartRateSample({ physicalTime: '2026-07-10T12:00:00Z', beatsPerMinute: '68' }),
        makeHeartRateSample({ physicalTime: '2026-07-10T12:05:00Z', beatsPerMinute: '71' }),
      ],
    });

    const latest = [...result].sort((a, b) => a.timestamp.localeCompare(b.timestamp)).at(-1);
    expect(latest?.timestamp).toBe('2026-07-10T12:05:00Z');
    expect(latest?.heartRate).toBe(71);
    expect(result).toHaveLength(3); // 1 day bucket (steps) + 2 heart-rate samples
  });

  it('skips heart-rate samples missing a physicalTime or a parseable bpm value', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [],
      heartRateSamples: [
        { name: 'x', data: { heartRate: { sampleTime: {}, beatsPerMinute: '70' } } },
        { name: 'y', data: { heartRate: { sampleTime: { physicalTime: '2026-07-10T12:00:00Z' }, beatsPerMinute: 'not-a-number' } } },
      ],
    });
    expect(result).toHaveLength(0);
  });
});
