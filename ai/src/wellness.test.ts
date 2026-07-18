import { describe, expect, it } from 'vitest';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { computeStressScore, computeRecoveryScore, computeSleepScore, computeEnergyScore, computeWellnessScores } from './wellness.js';

function reading(overrides: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return {
    provider: 'apple_health',
    userId: 'user-1',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function historyOf(field: keyof NormalizedBiometricReading, values: number[]): NormalizedBiometricReading[] {
  return values.map((v) => reading({ [field]: v }));
}

describe('computeStressScore', () => {
  it('returns null without heartRateVariability', () => {
    expect(computeStressScore(reading({ heartRate: 70 }), []).value).toBeNull();
  });

  it('returns null with fewer than 5 historical HRV points', () => {
    const history = historyOf('heartRateVariability', [40, 42]);
    expect(computeStressScore(reading({ heartRateVariability: 30 }), history).value).toBeNull();
  });

  it('scores near 50 when HRV matches its own baseline', () => {
    const history = historyOf('heartRateVariability', [40, 41, 39, 40, 41, 40]);
    const result = computeStressScore(reading({ heartRateVariability: 40 }), history);
    expect(result.value).not.toBeNull();
    expect(result.value!).toBeGreaterThan(40);
    expect(result.value!).toBeLessThan(60);
    expect(result.basis).toBe('evidence-informed-heuristic');
  });

  it('scores higher (more stressed) when HRV drops well below baseline', () => {
    const history = historyOf('heartRateVariability', [40, 41, 39, 40, 41, 40]);
    const low = computeStressScore(reading({ heartRateVariability: 20 }), history);
    const normal = computeStressScore(reading({ heartRateVariability: 40 }), history);
    expect(low.value!).toBeGreaterThan(normal.value!);
  });
});

describe('computeRecoveryScore', () => {
  it('passes through a provider-native recoveryScore untouched', () => {
    const result = computeRecoveryScore(reading({ recoveryScore: 82 }), []);
    expect(result).toEqual({ value: 82, basis: 'provider-native' });
  });

  it('returns null without recoveryScore or heartRateVariability', () => {
    expect(computeRecoveryScore(reading({ heartRate: 70 }), []).value).toBeNull();
  });

  it('computes a heuristic composite from HRV baseline when no native score exists', () => {
    const history = historyOf('heartRateVariability', [40, 41, 39, 40, 41, 40]);
    const result = computeRecoveryScore(reading({ heartRateVariability: 55 }), history);
    expect(result.value).not.toBeNull();
    expect(result.basis).toBe('evidence-informed-heuristic');
  });
});

describe('computeSleepScore / computeEnergyScore', () => {
  it('sleep passes through provider sleepScore', () => {
    expect(computeSleepScore(reading({ sleepScore: 88 }))).toEqual({ value: 88, basis: 'provider-native' });
  });

  it('sleep is null without a provider sleepScore', () => {
    expect(computeSleepScore(reading()).value).toBeNull();
  });

  it('uses the stage-weighted formula when deep/REM/light minutes are all present', () => {
    // 480 total minutes (= RECOMMENDED_SLEEP_MINUTES, so total-time component = 100),
    // 96 deep minutes = 20% of total (>= the 10% floor, so deep component = 100),
    // sleepScore (efficiency) = 90.
    const result = computeSleepScore(
      reading({ deepSleepMinutes: 96, remSleepMinutes: 144, lightSleepMinutes: 240, sleepScore: 90 }),
    );
    // 100*0.4 + 100*0.4 + 90*0.2 = 98
    expect(result).toEqual({ value: 98, basis: 'evidence-informed-heuristic' });
  });

  it('scores deep sleep proportionally below the 10%-of-total floor', () => {
    // 480 total minutes, only 24 deep minutes = 5% of total -> deep component = 50.
    const result = computeSleepScore(
      reading({ deepSleepMinutes: 24, remSleepMinutes: 156, lightSleepMinutes: 300, sleepScore: 90 }),
    );
    // 100*0.4 + 50*0.4 + 90*0.2 = 78
    expect(result).toEqual({ value: 78, basis: 'evidence-informed-heuristic' });
  });

  it('falls back to total-sleep-time for the efficiency component when sleepScore is absent', () => {
    const result = computeSleepScore(reading({ deepSleepMinutes: 96, remSleepMinutes: 144, lightSleepMinutes: 240 }));
    // total-time component = 100, deep component = 100, efficiency falls back to total-time (100) -> 100
    expect(result).toEqual({ value: 100, basis: 'evidence-informed-heuristic' });
  });

  it('falls back to plain passthrough when stage minutes are only partially present', () => {
    const result = computeSleepScore(reading({ deepSleepMinutes: 90, sleepScore: 82 }));
    expect(result).toEqual({ value: 82, basis: 'provider-native' });
  });

  it('energy passes through activityLevel', () => {
    expect(computeEnergyScore(reading({ activityLevel: 63 }))).toEqual({ value: 63, basis: 'provider-native' });
  });
});

describe('computeWellnessScores', () => {
  it('returns null overall when nothing is available', () => {
    expect(computeWellnessScores(reading(), []).overall.value).toBeNull();
  });

  it('computes an overall score from whatever subset of scores is available', () => {
    const scores = computeWellnessScores(reading({ sleepScore: 80, activityLevel: 60 }), []);
    expect(scores.sleep.value).toBe(80);
    expect(scores.energy.value).toBe(60);
    expect(scores.stress.value).toBeNull();
    expect(scores.overall.value).not.toBeNull();
  });

  it('fatigue/focus/relaxation are heuristic and null when their inputs are missing', () => {
    const scores = computeWellnessScores(reading(), []);
    expect(scores.fatigue.value).toBeNull();
    expect(scores.focus.value).toBeNull();
    expect(scores.relaxation.value).toBeNull();
    expect(scores.fatigue.basis).toBe('heuristic');
  });

  it('focus is computable from energy alone (defaults the missing stress component to neutral)', () => {
    const scores = computeWellnessScores(reading({ activityLevel: 70 }), []);
    expect(scores.focus.value).not.toBeNull();
  });
});
