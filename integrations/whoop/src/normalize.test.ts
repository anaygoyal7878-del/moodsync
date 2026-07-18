import { describe, expect, it } from 'vitest';
import { normalizeWhoopData } from './normalize.js';
import type { WhoopRecovery, WhoopSleep, WhoopWorkout } from './client.js';

function makeRecovery(overrides: Partial<WhoopRecovery> = {}): WhoopRecovery {
  return {
    cycle_id: 1,
    sleep_id: 'sleep-1',
    user_id: 42,
    created_at: '2026-07-10T06:00:00Z',
    updated_at: '2026-07-10T06:00:00Z',
    score_state: 'SCORED',
    score: { recovery_score: 65, resting_heart_rate: 52, hrv_rmssd_milli: 48 },
    ...overrides,
  };
}

function makeSleep(overrides: Partial<WhoopSleep> = {}): WhoopSleep {
  return {
    id: 'sleep-1',
    user_id: 42,
    start: '2026-07-09T23:00:00Z',
    end: '2026-07-10T06:00:00Z',
    score_state: 'SCORED',
    score: {
      sleep_performance_percentage: 82,
      stage_summary: {
        total_in_bed_time_milli: 25200000,
        total_awake_time_milli: 600000,
        total_light_sleep_time_milli: 9000000,
        total_slow_wave_sleep_time_milli: 5400000,
        total_rem_sleep_time_milli: 6000000,
        sleep_cycle_count: 4,
        disturbance_count: 2,
      },
    },
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WhoopWorkout> = {}): WhoopWorkout {
  return {
    id: 'workout-1',
    user_id: 42,
    start: '2026-07-10T07:00:00Z',
    end: '2026-07-10T08:00:00Z',
    sport_name: 'running',
    score_state: 'SCORED',
    score: { strain: 10.5, average_heart_rate: 140, max_heart_rate: 168 },
    ...overrides,
  };
}

describe('normalizeWhoopData', () => {
  it('merges a recovery record with its matching sleep record', () => {
    const result = normalizeWhoopData({
      userId: 'user-1',
      recoveries: [makeRecovery()],
      sleeps: [makeSleep()],
      workouts: [],
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      provider: 'whoop',
      userId: 'user-1',
      recoveryScore: 65,
      restingHeartRate: 52,
      sleepScore: 82,
      // 5,400,000ms / 60,000 = 90; 6,000,000ms / 60,000 = 100; 9,000,000ms / 60,000 = 150
      deepSleepMinutes: 90,
      remSleepMinutes: 100,
      lightSleepMinutes: 150,
    });
    expect(result[0]?.heartRate).toBeUndefined();
    expect(result[0]?.steps).toBeUndefined();
  });

  it('leaves sleep-stage minutes unset when no matching sleep record exists', () => {
    const result = normalizeWhoopData({
      userId: 'user-1',
      recoveries: [makeRecovery({ sleep_id: 'missing-sleep' })],
      sleeps: [makeSleep()],
      workouts: [],
    });
    expect(result[0]?.deepSleepMinutes).toBeUndefined();
    expect(result[0]?.remSleepMinutes).toBeUndefined();
    expect(result[0]?.lightSleepMinutes).toBeUndefined();
  });

  it('skips recovery records that are not yet scored', () => {
    const result = normalizeWhoopData({
      userId: 'user-1',
      recoveries: [makeRecovery({ score_state: 'PENDING_SCORE', score: undefined })],
      sleeps: [],
      workouts: [],
    });
    expect(result).toHaveLength(0);
  });

  it('leaves sleepScore unset when no matching sleep record exists', () => {
    const result = normalizeWhoopData({
      userId: 'user-1',
      recoveries: [makeRecovery({ sleep_id: 'missing-sleep' })],
      sleeps: [makeSleep()],
      workouts: [],
    });
    expect(result[0]?.sleepScore).toBeUndefined();
  });

  it('derives activityLevel from a same-day scored workout, scaled to 0-100', () => {
    const result = normalizeWhoopData({
      userId: 'user-1',
      recoveries: [makeRecovery()],
      sleeps: [makeSleep()],
      workouts: [makeWorkout({ score: { strain: 10.5, average_heart_rate: 140, max_heart_rate: 168 } })],
    });
    // 10.5 / 21 * 100 = 50
    expect(result[0]?.activityLevel).toBeCloseTo(50, 5);
  });

  it('ignores workouts from a different calendar day', () => {
    const result = normalizeWhoopData({
      userId: 'user-1',
      recoveries: [makeRecovery()],
      sleeps: [makeSleep()],
      workouts: [makeWorkout({ end: '2026-06-01T08:00:00Z' })],
    });
    expect(result[0]?.activityLevel).toBeUndefined();
  });
});
