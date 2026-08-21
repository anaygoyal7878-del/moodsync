import { describe, expect, it } from 'vitest';
import {
  fitRidge,
  pearson,
  selectFeatures,
  crossValidatedR2,
  learnAffectModel,
  predictAffect,
  describeAssociation,
  MIN_SAMPLES_TO_LEARN,
  MIN_USABLE_R2,
  SAMPLES_PER_FEATURE,
  type LabeledSample,
} from './affectModel.js';

/**
 * A deterministic PRNG, so "noise" tests are reproducible. A flaky
 * statistical test is worse than none — it trains you to rerun until
 * green, which is exactly the habit this module exists to prevent.
 */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

/** Standard normal via Box-Muller, off the seeded uniform. */
function normal(rand: () => number): number {
  const u = Math.max(rand(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

function pureNoise(n: number, featureCount: number, seed = 7): LabeledSample[] {
  const rand = rng(seed);
  return Array.from({ length: n }, () => {
    const features: Record<string, number> = {};
    for (let f = 0; f < featureCount; f++) features[`f${f}`] = normal(rand);
    return { features, valence: normal(rand), arousal: normal(rand) };
  });
}

/** Arousal really does track `hr`; valence is unrelated noise. This is
 * the realistic shape — one axis learnable, the other not. */
function realSignal(n: number, seed = 11): LabeledSample[] {
  const rand = rng(seed);
  return Array.from({ length: n }, () => {
    const hr = normal(rand);
    const noiseFeature = normal(rand);
    return {
      features: { hr, noiseFeature },
      arousal: 1.2 * hr + 0.35 * normal(rand),
      valence: normal(rand),
    };
  });
}

describe('pearson', () => {
  it('finds a perfect positive relationship', () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 6);
  });

  it('finds a perfect negative relationship', () => {
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 6);
  });

  it('returns 0 rather than NaN for a constant column', () => {
    // A metric that never moves correlates with nothing. NaN here would
    // propagate silently into feature ranking.
    expect(pearson([5, 5, 5, 5], [1, 2, 3, 4])).toBe(0);
  });
});

describe('fitRidge', () => {
  it('recovers a known linear relationship when the penalty is small', () => {
    const X = [[0], [1], [2], [3], [4]];
    const y = [1, 3, 5, 7, 9]; // y = 1 + 2x
    const fit = fitRidge(X, y, 0.0001)!;

    expect(fit.coefficients[0]).toBeCloseTo(2, 2);
    expect(fit.intercept).toBeCloseTo(1, 2);
  });

  it('shrinks coefficients toward zero as the penalty grows', () => {
    const X = [[0], [1], [2], [3], [4]];
    const y = [1, 3, 5, 7, 9];

    const light = fitRidge(X, y, 0.01)!;
    const heavy = fitRidge(X, y, 1000)!;

    expect(Math.abs(heavy.coefficients[0]!)).toBeLessThan(Math.abs(light.coefficients[0]!));
  });

  it('never shrinks the intercept — a penalised intercept would bias every prediction toward neutral', () => {
    const X = [[0], [1], [2], [3]];
    const y = [10, 10, 10, 10];
    const fit = fitRidge(X, y, 1000)!;

    // Slope crushed to ~0, but the level is still 10, not pulled to 0.
    expect(fit.intercept).toBeCloseTo(10, 6);
  });

  it('returns null instead of NaNs for a degenerate system', () => {
    expect(fitRidge([], [], 1)).toBeNull();
    expect(fitRidge([[]], [1], 1)).toBeNull();
  });
});

describe('selectFeatures', () => {
  it('ranks the genuinely related feature first', () => {
    const selected = selectFeatures(realSignal(40), ['hr', 'noiseFeature'], 'arousal');
    expect(selected[0]).toBe('hr');
  });

  it('caps the feature count by sample size', () => {
    const names = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const samples = pureNoise(20, 20);

    // 20 samples / 5 per feature = at most 4.
    expect(selectFeatures(samples, names, 'valence')).toHaveLength(20 / SAMPLES_PER_FEATURE);
  });

  it('always keeps at least one feature', () => {
    expect(selectFeatures(pureNoise(3, 5), ['f0', 'f1'], 'valence').length).toBeGreaterThanOrEqual(1);
  });
});

describe('crossValidatedR2 — the anti-self-deception test', () => {
  it('scores pure noise at or below zero, however many features it is given', () => {
    // This is the property the whole module rests on. An in-sample fit
    // with 8 features on 40 points would look excellent here; honest
    // out-of-sample scoring must not.
    const r2 = crossValidatedR2(pureNoise(40, 8), Array.from({ length: 8 }, (_, i) => `f${i}`), 'valence');
    expect(r2).toBeLessThan(MIN_USABLE_R2);
  });

  it('finds real signal when it exists', () => {
    const r2 = crossValidatedR2(realSignal(60), ['hr', 'noiseFeature'], 'arousal');
    expect(r2).toBeGreaterThan(0.5);
  });

  it('separates a learnable axis from an unlearnable one in the same dataset', () => {
    const samples = realSignal(60);
    const arousalR2 = crossValidatedR2(samples, ['hr', 'noiseFeature'], 'arousal');
    const valenceR2 = crossValidatedR2(samples, ['hr', 'noiseFeature'], 'valence');

    expect(arousalR2).toBeGreaterThan(MIN_USABLE_R2);
    expect(valenceR2).toBeLessThan(MIN_USABLE_R2);
  });

  it('refuses to score a sample too small to hold out from', () => {
    expect(crossValidatedR2(pureNoise(2, 2), ['f0', 'f1'], 'valence')).toBe(Number.NEGATIVE_INFINITY);
  });
});

describe('learnAffectModel', () => {
  it('refuses to fit below the sample floor', () => {
    const model = learnAffectModel(realSignal(MIN_SAMPLES_TO_LEARN - 1), ['hr'], 'arousal');

    expect(model.usable).toBe(false);
    expect(model.features).toEqual([]);
    expect(model.sampleSize).toBe(MIN_SAMPLES_TO_LEARN - 1);
  });

  it('refuses to fit with no features at all', () => {
    expect(learnAffectModel(realSignal(40), [], 'arousal').usable).toBe(false);
  });

  it('marks a noise-only model unusable but still reports what it found', () => {
    const model = learnAffectModel(pureNoise(40, 4), ['f0', 'f1', 'f2', 'f3'], 'valence');

    expect(model.usable).toBe(false);
    // Not hidden: the attempt and its score are still visible, so an
    // absent finding doesn't look like an absent attempt.
    expect(model.sampleSize).toBe(40);
    expect(model.crossValidatedR2).toBeLessThan(MIN_USABLE_R2);
  });

  it('learns a real relationship and ranks the true driver top', () => {
    const model = learnAffectModel(realSignal(60), ['hr', 'noiseFeature'], 'arousal');

    expect(model.usable).toBe(true);
    expect(model.associations[0]!.feature).toBe('hr');
    expect(model.associations[0]!.correlation).toBeGreaterThan(0.5);
  });

  it('reports both a coefficient and a raw correlation per feature', () => {
    const model = learnAffectModel(realSignal(60), ['hr', 'noiseFeature'], 'arousal');
    const top = model.associations[0]!;

    // Both are kept because ridge can shrink a coefficient toward zero
    // while the underlying correlation is still real.
    expect(typeof top.coefficient).toBe('number');
    expect(typeof top.correlation).toBe('number');
  });
});

describe('predictAffect', () => {
  it('returns null from an unusable model rather than a number to render', () => {
    const model = learnAffectModel(pureNoise(40, 3), ['f0', 'f1', 'f2'], 'valence');
    expect(predictAffect(model, { f0: 1, f1: 0, f2: 0 })).toBeNull();
  });

  it('predicts in the right direction from a usable model', () => {
    const model = learnAffectModel(realSignal(60), ['hr', 'noiseFeature'], 'arousal');
    const high = predictAffect(model, { hr: 1.5, noiseFeature: 0 })!;
    const low = predictAffect(model, { hr: -1.5, noiseFeature: 0 })!;

    expect(high).toBeGreaterThan(low);
  });

  it('clamps to the self-report scale so no output is off the answerable range', () => {
    const model = learnAffectModel(realSignal(60), ['hr', 'noiseFeature'], 'arousal');
    const extreme = predictAffect(model, { hr: 100, noiseFeature: 0 })!;

    expect(extreme).toBeLessThanOrEqual(2);
    expect(extreme).toBeGreaterThanOrEqual(-2);
  });

  it('treats a missing feature as at-baseline rather than throwing', () => {
    const model = learnAffectModel(realSignal(60), ['hr', 'noiseFeature'], 'arousal');
    expect(predictAffect(model, {})).not.toBeNull();
  });
});

describe('describeAssociation', () => {
  const association = { feature: 'heartRateVariability', coefficient: 0.4, correlation: 0.42 };

  it('never claims causation, in either direction', () => {
    const sentence = describeAssociation(association, 'valence', 'heart rate variability', 34);

    // "tends to go with", not "goes with" — the hedge is part of the
    // phrasing and the assertion has to match the real copy.
    expect(sentence).toContain('go with');
    expect(sentence).toContain('not a cause');
    expect(sentence).not.toMatch(/causes|makes you|because of|leads to/i);
  });

  it('always carries the sample size', () => {
    expect(describeAssociation(association, 'valence', 'HRV', 34)).toContain('34');
  });

  it('reads the direction off the sign of the correlation', () => {
    const negative = { ...association, correlation: -0.4 };
    expect(describeAssociation(negative, 'arousal', 'HRV', 30)).toContain('lower');
    expect(describeAssociation(association, 'arousal', 'HRV', 30)).toContain('higher');
  });
});
