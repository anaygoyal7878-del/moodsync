import { describe, expect, it } from 'vitest';
import {
  calibrateStateConfidence,
  applyCalibration,
  AGREEMENT_MULTIPLIER,
  DISAGREEMENT_MULTIPLIER,
  MAX_CALIBRATED_CONFIDENCE,
} from './affectCalibration.js';
import type { AffectModel, AffectTarget } from './affectModel.js';

/**
 * Builds a model that predicts a fixed value regardless of input —
 * `predictAffect` computes `intercept + Σ(coef * feature)`, so an
 * intercept-only usable model is a constant predictor. That keeps
 * these tests about the *calibration* rules rather than about
 * regression arithmetic, which affectModel.test.ts already covers.
 */
function constantModel(target: AffectTarget, prediction: number, usable = true): AffectModel {
  return {
    target,
    sampleSize: 40,
    features: [],
    crossValidatedR2: usable ? 0.4 : -0.2,
    usable,
    intercept: prediction,
    coefficients: {},
    associations: [],
  };
}

/** An unusable model — the common real-world case. */
function noModel(target: AffectTarget): AffectModel {
  return constantModel(target, 0, false);
}

describe('calibrateStateConfidence — failing safe', () => {
  it('changes nothing when neither axis has a usable model', () => {
    const result = calibrateStateConfidence('stressed', { valence: noModel('valence'), arousal: noModel('arousal') }, {});

    expect(result.confidenceMultiplier).toBe(1);
    expect(result.agreement).toBe('inconclusive');
    expect(result.axesUsed).toEqual([]);
    expect(result.explanation).toBeNull();
  });

  it('changes nothing for an unknown state, however good the models are', () => {
    // There is no circumplex position for "we don't know" — nothing to
    // agree or disagree with.
    const result = calibrateStateConfidence(
      'unknown',
      { valence: constantModel('valence', -1.5), arousal: constantModel('arousal', 1.5) },
      {},
    );

    expect(result.confidenceMultiplier).toBe(1);
    expect(result.explanation).toBeNull();
  });

  it('changes nothing in the inconclusive band between the thresholds', () => {
    // 'relaxed' sits at valence +1.5 / arousal -1. A prediction ~1.2
    // off on each axis is neither agreement nor disagreement, and
    // must not be forced into either.
    const result = calibrateStateConfidence(
      'relaxed',
      { valence: constantModel('valence', 0.3), arousal: constantModel('arousal', 0.2) },
      {},
    );

    expect(result.confidenceMultiplier).toBe(1);
    expect(result.agreement).toBe('inconclusive');
    expect(result.explanation).toBeNull();
    // But it still reports which axes it was able to look at.
    expect(result.axesUsed).toEqual(['valence', 'arousal']);
  });
});

describe('calibrateStateConfidence — agreement', () => {
  it('raises confidence when the model lands where the state sits', () => {
    // 'stressed' = valence -1.5, arousal +1.5.
    const result = calibrateStateConfidence(
      'stressed',
      { valence: constantModel('valence', -1.5), arousal: constantModel('arousal', 1.5) },
      {},
    );

    expect(result.agreement).toBe('agrees');
    expect(result.confidenceMultiplier).toBe(AGREEMENT_MULTIPLIER);
    expect(result.explanation).toContain('agrees');
  });

  it('raises confidence less than disagreement lowers it', () => {
    // The asymmetry is deliberate: both sides read the same
    // biometrics, so agreement is partly structural and therefore
    // weaker evidence than disagreement.
    const agreeDelta = AGREEMENT_MULTIPLIER - 1;
    const disagreeDelta = 1 - DISAGREEMENT_MULTIPLIER;
    expect(agreeDelta).toBeLessThan(disagreeDelta);
  });
});

describe('calibrateStateConfidence — disagreement', () => {
  it('lowers confidence when the model points somewhere else entirely', () => {
    // Rules say 'relaxed' (valence +1.5, arousal -1); the person's own
    // learned model says unpleasant and activated.
    const result = calibrateStateConfidence(
      'relaxed',
      { valence: constantModel('valence', -2), arousal: constantModel('arousal', 2) },
      {},
    );

    expect(result.agreement).toBe('disagrees');
    expect(result.confidenceMultiplier).toBe(DISAGREEMENT_MULTIPLIER);
    expect(result.explanation).toContain('held loosely');
  });
});

describe('calibrateStateConfidence — per-axis independence', () => {
  it('uses arousal alone when valence never became learnable', () => {
    // The common real shape: arousal is learnable from cardiac data,
    // valence often isn't. Skipping the unusable axis is what keeps
    // "I can read your energy but not your mood" intact.
    const result = calibrateStateConfidence(
      'sleepy', // arousal -1.5
      { valence: noModel('valence'), arousal: constantModel('arousal', -1.5) },
      {},
    );

    expect(result.axesUsed).toEqual(['arousal']);
    expect(result.agreement).toBe('agrees');
    expect(result.explanation).toContain('energy');
    expect(result.explanation).not.toContain('mood and energy');
  });

  it('uses valence alone when only that axis is learnable', () => {
    const result = calibrateStateConfidence(
      'energized', // valence +1.5
      { valence: constantModel('valence', 1.5), arousal: noModel('arousal') },
      {},
    );

    expect(result.axesUsed).toEqual(['valence']);
    expect(result.explanation).toContain('mood');
  });

  it('does not let a wildly wrong unusable axis drag a good one', () => {
    // If the unusable valence model were consulted, its 0 prediction
    // against 'sleepy''s valence 0 would be fine — but against a state
    // with extreme valence it would distort the mean. Assert the
    // unusable axis genuinely never participates.
    const withUnusable = calibrateStateConfidence(
      'stressed', // valence -1.5, arousal +1.5
      { valence: constantModel('valence', 0, false), arousal: constantModel('arousal', 1.5) },
      {},
    );

    expect(withUnusable.axesUsed).toEqual(['arousal']);
    expect(withUnusable.agreement).toBe('agrees');
  });
});

describe('applyCalibration', () => {
  it('scales confidence by the multiplier', () => {
    expect(applyCalibration(0.5, { confidenceMultiplier: 0.7, agreement: 'disagrees', axesUsed: [], explanation: null })).toBeCloseTo(0.35, 6);
  });

  it('never exceeds the engine’s own ceiling', () => {
    // Calibration must not let a state claim more than assessState is
    // itself allowed to claim.
    const boosted = applyCalibration(0.94, { confidenceMultiplier: 1.1, agreement: 'agrees', axesUsed: [], explanation: null });
    expect(boosted).toBeLessThanOrEqual(MAX_CALIBRATED_CONFIDENCE);
  });

  it('never goes negative', () => {
    expect(applyCalibration(0, { confidenceMultiplier: 0.7, agreement: 'disagrees', axesUsed: [], explanation: null })).toBe(0);
  });

  it('is exactly identity for a no-change calibration', () => {
    const untouched = applyCalibration(0.62, { confidenceMultiplier: 1, agreement: 'inconclusive', axesUsed: [], explanation: null });
    expect(untouched).toBe(0.62);
  });
});
