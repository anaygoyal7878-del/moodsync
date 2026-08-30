import { describe, it, expect } from 'vitest';
import { detectHealthScenarios } from './healthScenarios.js';
import type { PersonalBaselines } from './personalBaselines.js';

function baselines(overrides: Partial<PersonalBaselines> = {}): PersonalBaselines {
  return {
    heartRate: null,
    restingHeartRate: null,
    heartRateVariability: null,
    sleepScore: null,
    activityLevel: null,
    hasAnyBaseline: true,
    maxSampleSize: 30,
    ...overrides,
  };
}

const cmp = (value: number, baseline: number, z: number, sampleSize = 30) => ({ value, baseline, z, sampleSize });

describe('detectHealthScenarios', () => {
  it('says nothing when everything sits at baseline', () => {
    // The normal case. Silence has to be a real outcome, or the feature
    // becomes noise someone learns to ignore.
    const result = detectHealthScenarios(
      baselines({ restingHeartRate: cmp(52, 52, 0), heartRateVariability: cmp(60, 60, 0), sleepScore: cmp(80, 80, 0) }),
    );
    expect(result).toEqual([]);
  });

  it('never fires on metrics with no baseline yet', () => {
    // Every field null is a brand-new account. Guessing here would mean
    // inventing a "normal" the user has never demonstrated.
    expect(detectHealthScenarios(baselines({ hasAnyBaseline: false, maxSampleSize: 0 }))).toEqual([]);
  });

  it('raises the combined strain/illness scenario when HRV is suppressed and RHR elevated together', () => {
    const result = detectHealthScenarios(
      baselines({ restingHeartRate: cmp(59, 52, 1.8), heartRateVariability: cmp(41, 61, -1.6) }),
    );
    expect(result[0]!.id).toBe('strain-or-illness-warning');
    expect(result[0]!.severity).toBe('caution');
    // Both real numbers appear, so the claim is checkable rather than assertive.
    expect(result[0]!.finding).toContain('41');
    expect(result[0]!.finding).toContain('59');
  });

  it('suppresses the single-signal scenarios when the combined one fires', () => {
    // Otherwise the user reads three overlapping findings describing one
    // situation, which reads as three problems.
    const result = detectHealthScenarios(
      baselines({ restingHeartRate: cmp(59, 52, 1.8), heartRateVariability: cmp(41, 61, -1.6) }),
    );
    const ids = result.map((s) => s.id);
    expect(ids).toContain('strain-or-illness-warning');
    expect(ids).not.toContain('incomplete-recovery');
    expect(ids).not.toContain('suppressed-hrv');
  });

  it('uses the research threshold of 5bpm for elevated resting heart rate, not a z-score', () => {
    // 4bpm over baseline is under the threshold even with a large z,
    // because the literature states this one in bpm.
    const under = detectHealthScenarios(baselines({ restingHeartRate: cmp(56, 52, 3.0) }));
    expect(under.map((s) => s.id)).not.toContain('incomplete-recovery');

    const over = detectHealthScenarios(baselines({ restingHeartRate: cmp(57, 52, 3.0) }));
    expect(over.map((s) => s.id)).toContain('incomplete-recovery');
  });

  it('flags suppressed HRV on its own when resting heart rate is normal', () => {
    const result = detectHealthScenarios(baselines({ heartRateVariability: cmp(41, 61, -1.6), restingHeartRate: cmp(52, 52, 0) }));
    expect(result.map((s) => s.id)).toEqual(['suppressed-hrv']);
  });

  it('orders caution above notice so the most serious finding reads first', () => {
    const result = detectHealthScenarios(
      baselines({ restingHeartRate: cmp(59, 52, 1.8), heartRateVariability: cmp(41, 61, -1.6), sleepScore: cmp(55, 80, -1.9) }),
    );
    expect(result[0]!.severity).toBe('caution');
    expect(result.at(-1)!.severity).toBe('notice');
  });

  it('never claims to be diagnostic, and never tells someone they are ill', () => {
    // The guardrail that matters most in this file. The illness scenario
    // is a statistical signal, and its wording must stay behavioural —
    // rest, train easier — with no clinical instruction anywhere.
    const result = detectHealthScenarios(
      baselines({ restingHeartRate: cmp(59, 52, 1.8), heartRateVariability: cmp(41, 61, -1.6), sleepScore: cmp(55, 80, -1.9) }),
    );
    expect(result.length).toBeGreaterThan(0);
    for (const scenario of result) {
      expect(scenario.isDiagnostic).toBe(false);
      expect(scenario.guidance).not.toMatch(/\b(doctor|diagnos|prescri|medication|treatment)\b/i);
      expect(scenario.finding).not.toMatch(/you are (sick|ill)\b/i);
    }
  });

  it('carries a stated basis and a sample size on every scenario', () => {
    // A scenario the user can't check the provenance of is one they have
    // to take on faith, which is what this module exists to avoid.
    const result = detectHealthScenarios(
      baselines({ restingHeartRate: cmp(59, 52, 1.8), heartRateVariability: cmp(41, 61, -1.6, 9) }),
    );
    for (const scenario of result) {
      expect(scenario.basis.length).toBeGreaterThan(30);
      expect(scenario.sampleSize).toBeGreaterThan(0);
    }
    // Reports the *smallest* contributing sample, not the flattering one.
    expect(result[0]!.sampleSize).toBe(9);
  });

  it('is explicit that sleep quality is not schedule regularity', () => {
    // Guards the honesty boundary: the strongest finding in the sleep
    // literature is regularity, which MoodSync cannot compute without
    // bedtime timestamps. This must not quietly imply otherwise.
    const result = detectHealthScenarios(baselines({ sleepScore: cmp(55, 80, -1.9) }));
    expect(result[0]!.basis).toMatch(/regularity/i);
  });
});
