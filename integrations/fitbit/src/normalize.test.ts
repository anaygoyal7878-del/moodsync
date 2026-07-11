import { describe, expect, it } from 'vitest';
import { normalizeGoogleHealthData } from './normalize.js';
import type { RollupDataPoint, DailyRestingHeartRatePoint, SleepDataPoint } from './client.js';

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
    heartRate: { bpmMin: 55, bpmMax: 140, bpmAvg: 72 },
    ...overrides,
  };
}

function makeRestingHeartRate(overrides: Partial<DailyRestingHeartRatePoint['data']['dailyRestingHeartRate']> = {}) {
  return {
    name: 'users/me/dataTypes/daily-resting-heart-rate/dataPoints/1',
    data: { dailyRestingHeartRate: { date: { year: 2026, month: 7, day: 10 }, beatsPerMinute: 54, ...overrides } },
  };
}

function makeSleep(stageSummary: Array<{ sleepStageType: 'AWAKE' | 'LIGHT' | 'DEEP' | 'REM'; totalDuration: string }>): SleepDataPoint {
  return {
    name: 'users/me/dataTypes/sleep/dataPoints/1',
    data: { sleep: { startTime: null, endTime: null, sleepSummary: { stageSummary } } },
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

  it('computes sleepScore as efficiency (time asleep / time in bed) on the most recent day', () => {
    const result = normalizeGoogleHealthData({
      userId: 'user-1',
      stepsRollups: [makeStepsRollup()],
      heartRateRollups: [],
      caloriesRollups: [],
      restingHeartRates: [],
      sleeps: [
        makeSleep([
          { sleepStageType: 'LIGHT', totalDuration: '18000s' },
          { sleepStageType: 'DEEP', totalDuration: '3600s' },
          { sleepStageType: 'REM', totalDuration: '3600s' },
          { sleepStageType: 'AWAKE', totalDuration: '2700s' },
        ]),
      ],
    });
    // total = 27900s, awake = 2700s -> efficiency = (1 - 2700/27900) * 100 ≈ 90
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
});
