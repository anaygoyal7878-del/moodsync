import { describe, expect, it } from 'vitest';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { assessState, MEDICAL_DISCLAIMER, type MoodState, type StateEngineInput } from './stateEngine.js';

function reading(overrides: Partial<NormalizedBiometricReading> = {}): NormalizedBiometricReading {
  return {
    provider: 'whoop',
    timestamp: new Date('2026-08-15T14:00:00Z').toISOString(),
    ...overrides,
  } as NormalizedBiometricReading;
}

/** `count` readings holding each metric steady, so a deviation in the
 * latest reading is unambiguous rather than lost in noise. */
function steadyHistory(count: number, values: Partial<NormalizedBiometricReading>): NormalizedBiometricReading[] {
  return Array.from({ length: count }, (_, i) =>
    reading({ ...values, timestamp: new Date(Date.UTC(2026, 7, 1 + i)).toISOString() }),
  );
}

function baseInput(overrides: Partial<StateEngineInput> = {}): StateEngineInput {
  return {
    latest: null,
    history: [],
    localHour: 14,
    bookedHoursToday: null,
    inFocusSession: false,
    minutesSinceWorkout: null,
    userDeclaredState: null,
    ...overrides,
  };
}

describe('assessState — insufficient data', () => {
  it('returns unknown and flags stillLearning when there is no reading at all', () => {
    const result = assessState(baseInput());
    expect(result.currentState).toBe('unknown');
    expect(result.stillLearning).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it('never infers a state from a single reading with no history to compare against', () => {
    const result = assessState(baseInput({ latest: reading({ heartRate: 140 }), history: [] }));
    expect(result.currentState).toBe('unknown');
    expect(result.supportingSignals).toHaveLength(0);
  });

  it('flags stillLearning even when a state is inferable, until enough history exists', () => {
    const history = steadyHistory(6, { heartRate: 60, heartRateVariability: 60 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 95, heartRateVariability: 30 }), history }),
    );
    expect(result.currentState).toBe('stressed');
    expect(result.stillLearning).toBe(true);
  });
});

describe('assessState — multi-signal requirement', () => {
  it('gives a single-signal candidate low confidence rather than a confident state', () => {
    // Only activity deviates; nothing corroborates it.
    const history = steadyHistory(30, { activityLevel: 50 });
    const result = assessState(baseInput({ latest: reading({ activityLevel: 95 }), history }));
    expect(result.confidence).toBeLessThanOrEqual(0.35);
  });

  it('reaches real confidence when independent signals agree', () => {
    const history = steadyHistory(30, { heartRate: 62, heartRateVariability: 65, sleepScore: 80 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 92, heartRateVariability: 32, sleepScore: 78 }), history }),
    );
    expect(result.currentState).toBe('stressed');
    expect(result.confidence).toBeGreaterThan(0.6);
    expect(result.supportingSignals.length).toBeGreaterThanOrEqual(2);
  });

  it('never reports full certainty', () => {
    const history = steadyHistory(200, { heartRate: 60, heartRateVariability: 70, sleepScore: 85 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 130, heartRateVariability: 15, sleepScore: 20 }), history }),
    );
    expect(result.confidence).toBeLessThan(1);
  });
});

describe('assessState — personal baselines, not universal thresholds', () => {
  it('does not call a high absolute heart rate "stressed" when it is normal for this user', () => {
    const history = steadyHistory(30, { heartRate: 105, heartRateVariability: 55 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 106, heartRateVariability: 55 }), history }),
    );
    expect(result.currentState).not.toBe('stressed');
  });

  it('does call a modest absolute heart rate elevated when it is high for this user', () => {
    const history = steadyHistory(30, { heartRate: 48, heartRateVariability: 80 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 72, heartRateVariability: 45 }), history }),
    );
    expect(result.currentState).toBe('stressed');
  });
});

describe('assessState — context', () => {
  it('lets an explicit user declaration override inference entirely', () => {
    const history = steadyHistory(30, { heartRate: 60, heartRateVariability: 70 });
    const result = assessState(
      baseInput({
        latest: reading({ heartRate: 100, heartRateVariability: 25 }),
        history,
        userDeclaredState: 'focused' as MoodState,
      }),
    );
    expect(result.currentState).toBe('focused');
    expect(result.confidence).toBe(1);
  });

  it('does not infer preparing-for-sleep from a low heart rate in the afternoon', () => {
    const history = steadyHistory(30, { heartRate: 80, heartRateVariability: 50 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 58, heartRateVariability: 75 }), history, localHour: 14 }),
    );
    expect(result.currentState).not.toBe('preparing_for_sleep');
  });

  it('does infer preparing-for-sleep from the same biometrics late at night', () => {
    // HRV held at baseline so only the heart rate drop plus the hour
    // are in play — otherwise a raised HRV legitimately reads as
    // "recovering" and this stops testing the time-of-day claim.
    const history = steadyHistory(30, { heartRate: 80, heartRateVariability: 50 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 58, heartRateVariability: 50 }), history, localHour: 22 }),
    );
    expect(result.currentState).toBe('preparing_for_sleep');
  });

  it('recognises a running Focus Session', () => {
    const history = steadyHistory(30, { heartRate: 70, heartRateVariability: 55 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 71, heartRateVariability: 54 }), history, inFocusSession: true }),
    );
    expect(result.currentState).toBe('focused');
  });
});

describe('assessState — safety and honesty', () => {
  it('always ships the non-medical disclaimer', () => {
    const result = assessState(baseInput());
    expect(result.disclaimer).toBe(MEDICAL_DISCLAIMER);
    expect(result.disclaimer.toLowerCase()).toContain('not a medical');
  });

  it('never produces a state name that reads as a medical condition', () => {
    const history = steadyHistory(30, { heartRate: 60, heartRateVariability: 70, sleepScore: 85 });
    const forbidden = ['anxiety', 'anxious', 'depress', 'illness', 'sick', 'disorder', 'diagnos'];
    for (const hour of [3, 9, 14, 22]) {
      const result = assessState(
        baseInput({ latest: reading({ heartRate: 120, heartRateVariability: 12, sleepScore: 15 }), history, localHour: hour }),
      );
      for (const word of forbidden) {
        expect(result.label.toLowerCase()).not.toContain(word);
      }
    }
  });

  it('labels each signal as measured or contextual so inference is distinguishable from measurement', () => {
    const history = steadyHistory(30, { heartRate: 62, heartRateVariability: 65 });
    const result = assessState(
      baseInput({ latest: reading({ heartRate: 95, heartRateVariability: 30 }), history, inFocusSession: false }),
    );
    for (const signal of result.supportingSignals) {
      expect(['measured', 'contextual']).toContain(signal.kind);
    }
  });

  it('does not repeat the same signal twice when it supports a state through several rules', () => {
    const history = steadyHistory(30, { heartRate: 62, heartRateVariability: 65 });
    const result = assessState(baseInput({ latest: reading({ heartRate: 110, heartRateVariability: 25 }), history }));
    const descriptions = result.supportingSignals.map((s) => s.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});
