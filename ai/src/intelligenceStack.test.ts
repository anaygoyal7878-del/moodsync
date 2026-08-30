import { describe, it, expect } from 'vitest';
import { buildIntelligenceStack, describeStackForPrompt, type IntelligenceStackInput } from './intelligenceStack.js';
import { MIN_SAMPLES_FOR_BASELINE, type PersonalBaselines } from './personalBaselines.js';

function baselines(sampleSize = 30): PersonalBaselines {
  const c = (value: number, base: number) => ({ value, baseline: base, z: 0, sampleSize });
  return {
    heartRate: c(68, 68),
    restingHeartRate: c(52, 52),
    heartRateVariability: c(61, 61),
    sleepScore: c(80, 80),
    activityLevel: null,
    hasAnyBaseline: true,
    maxSampleSize: sampleSize,
  };
}

const empty: IntelligenceStackInput = {
  readingCount: 0,
  baselines: null,
  scenarios: [],
  findings: [],
  musicEffects: [],
};

describe('buildIntelligenceStack', () => {
  it('reports nothing known on a brand-new account, without inventing a depth', () => {
    const stack = buildIntelligenceStack(empty);
    expect(stack.depth).toBeNull();
    expect(stack.layers.every((l) => !l.unlocked)).toBe(true);
  });

  it('unlocks upward as data accrues — the whole point of the stack', () => {
    const observationOnly = buildIntelligenceStack({ ...empty, readingCount: 2 });
    expect(observationOnly.depth).toBe('observation');

    const withBaseline = buildIntelligenceStack({ ...empty, readingCount: 30, baselines: baselines() });
    // Baseline unlocks scenario too, because a scenario is a comparison
    // and the baseline is what it compares against.
    expect(withBaseline.depth).toBe('scenario');

    const withCorrelation = buildIntelligenceStack({
      ...empty,
      readingCount: 30,
      baselines: baselines(),
      findings: [{ label: 'Meditation', meanDelta: 4.2, sampleSize: 7 }],
    });
    expect(withCorrelation.depth).toBe('correlation');
  });

  it('does not count an upper layer as depth when the chain beneath it is broken', () => {
    // Music effects can exist before any biometric baseline does. That
    // does not mean MoodSync knows this person five layers deep — the
    // chain has a hole in it, and depth must reflect the hole.
    const stack = buildIntelligenceStack({
      ...empty,
      readingCount: 0,
      musicEffects: [{ label: 'Calm', mode: 'relax', sessions: 9, meanHeartRateDelta: -5, helped: true, earlyStopRate: 0 } as never],
    });
    expect(stack.depth).toBeNull();
    expect(stack.layers.find((l) => l.id === 'preference')!.unlocked).toBe(true);
  });

  it('tells a locked layer what would unlock it, with a number', () => {
    // "I don't have enough data" is useless. "About 3 more days" is
    // something the user can act on.
    const stack = buildIntelligenceStack({ ...empty, readingCount: 2, baselines: null });
    const baseline = stack.layers.find((l) => l.id === 'baseline')!;
    expect(baseline.unlocked).toBe(false);
    expect(baseline.needs).toMatch(/\d/);
  });

  it('ignores findings too thin to be anything but coincidence', () => {
    const stack = buildIntelligenceStack({
      ...empty,
      readingCount: 30,
      baselines: baselines(),
      findings: [{ label: 'Meditation', meanDelta: 9, sampleSize: 2 }],
    });
    expect(stack.layers.find((l) => l.id === 'correlation')!.unlocked).toBe(false);
  });

  it('treats "no scenario applies" as knowledge, not as a locked layer', () => {
    // Someone whose numbers are all normal has learned something real.
    const stack = buildIntelligenceStack({ ...empty, readingCount: 30, baselines: baselines(), scenarios: [] });
    const scenario = stack.layers.find((l) => l.id === 'scenario')!;
    expect(scenario.unlocked).toBe(true);
    expect(scenario.knows[0]).toMatch(/normal, healthy case/i);
  });

  it('lists permanent limits even when every layer is unlocked', () => {
    // Diagnosis and nutrition never become answerable no matter how much
    // wearable history accumulates, so they must not look like something
    // that will unlock later.
    const stack = buildIntelligenceStack({
      readingCount: 200,
      baselines: baselines(200),
      scenarios: [],
      findings: [{ label: 'Meditation', meanDelta: 4, sampleSize: 20 }],
      musicEffects: [{ label: 'Calm', mode: 'relax', sessions: 20, meanHeartRateDelta: -6, helped: true, earlyStopRate: 0 } as never],
    });
    expect(stack.depth).toBe('preference');
    expect(stack.cannotAnswer.join(' ')).toMatch(/diagnostic/i);
    expect(stack.cannotAnswer.join(' ')).toMatch(/clinician/i);
  });

  it('keeps the baseline threshold in step with personalBaselines', () => {
    // The constant is duplicated locally to keep this module's imports
    // to types only; this assertion is what stops the two drifting.
    const stack = buildIntelligenceStack({ ...empty, readingCount: 1 });
    expect(stack.layers.find((l) => l.id === 'baseline')!.requiredSamples).toBe(MIN_SAMPLES_FOR_BASELINE);
  });

  it('never puts a question in both the can and cannot lists', () => {
    const stack = buildIntelligenceStack({ ...empty, readingCount: 30, baselines: baselines() });
    for (const can of stack.canAnswer) {
      expect(stack.cannotAnswer.some((c) => c.startsWith(can))).toBe(false);
    }
  });
});

describe('describeStackForPrompt', () => {
  it('renders both what is known and what is not, since the second half is the point', () => {
    const text = describeStackForPrompt(buildIntelligenceStack({ ...empty, readingCount: 3 }));
    expect(text).toContain('UNLOCKED');
    expect(text).toContain('LOCKED');
    expect(text).toContain('You CAN answer');
    expect(text).toContain('You CANNOT answer');
    expect(text).toContain('Needs:');
  });
});
