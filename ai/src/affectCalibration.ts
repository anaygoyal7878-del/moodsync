import type { MoodState } from './stateEngine.js';
import { predictAffect, type AffectModel } from './affectModel.js';

/**
 * Uses a person's learned affect model to calibrate confidence in the
 * rule-based state engine's answer.
 *
 * ## Why calibration, and not a state source
 *
 * The obvious wiring — feed the model's prediction into
 * `StateEngineInput.userDeclaredState` — is wrong twice over, and worth
 * naming so nobody tries it again. That field short-circuits inference
 * and returns **confidence 1.0** with the supporting signal "You told
 * MoodSync what you're doing." A model prediction is not a declaration:
 * routing one through that field would claim the user said something
 * they never said, at a confidence no inference in this codebase is
 * allowed to reach, bypassing every guard in `assessState`.
 *
 * The second problem rules out adding it as an ordinary signal too:
 * **the affect model's features are the same biometrics the rules
 * already use.** `affectFeatures.ts` builds its vector from heart rate,
 * HRV, sleep, activity — exactly what `assessState` reasons over. A
 * prediction added as "another signal" would count the same
 * measurement twice and inflate confidence for free.
 *
 * So this module does the one thing the model knows that the rules
 * cannot: **whether this person's biometrics actually track their
 * self-reported mood, and in which direction.** The rules assert
 * "elevated heart rate plus depressed HRV means stress" for everybody.
 * The learned model is the only thing in this codebase that can say
 * whether that's true of *this* person. That belongs on the confidence,
 * not on the claim.
 *
 * ## The asymmetry is deliberate
 *
 * Agreement raises confidence a little; disagreement lowers it a lot.
 * That looks lopsided and is the point. Because both sides read the
 * same biometrics, a certain amount of agreement is structurally
 * guaranteed and therefore weak evidence. Disagreement, given shared
 * inputs, means the person-specific fit genuinely diverges from the
 * generic rule — which is a real, informative finding about this user.
 *
 * ## Failing safe
 *
 * Every path that isn't "a usable model that clearly agrees or clearly
 * disagrees" returns a multiplier of exactly 1.0 — no change at all.
 * For most accounts most of the time there is no usable model (see
 * `affectModel.ts`'s floors), so the overwhelmingly common outcome of
 * this module is that it does nothing and says so.
 */

/**
 * Where each state sits on the circumplex, as `[valence, arousal]` on
 * the same -2..+2 scale a `MoodCheckIn` uses.
 *
 * **MoodSync's own mapping, not a research finding.** The circumplex
 * itself is standard; placing these particular product states on it is
 * a judgment call, and the coordinates are approximate by nature — they
 * exist to answer "is the model roughly pointing the same way as the
 * rules", never to be read back to a user as a number.
 */
const STATE_CIRCUMPLEX: Record<Exclude<MoodState, 'unknown'>, { valence: number; arousal: number }> = {
  focused: { valence: 0.5, arousal: 0.5 },
  stressed: { valence: -1.5, arousal: 1.5 },
  relaxed: { valence: 1.5, arousal: -1 },
  tired: { valence: -0.5, arousal: -1 },
  sleepy: { valence: 0, arousal: -1.5 },
  recovering: { valence: 1, arousal: -0.5 },
  energized: { valence: 1.5, arousal: 1.5 },
  overstimulated: { valence: -1, arousal: 2 },
  active: { valence: 0.5, arousal: 1.5 },
  preparing_for_sleep: { valence: 0.5, arousal: -1.5 },
};

/** Mean absolute deviation (per axis, on the -2..+2 scale) below which
 * the model and the rules are treated as pointing the same way. */
export const AGREEMENT_THRESHOLD = 0.75;

/** Deviation above which they're treated as genuinely disagreeing.
 * The gap between the two thresholds is an explicit "neither" band —
 * a middling deviation is not evidence in either direction and must
 * not be forced into one. */
export const DISAGREEMENT_THRESHOLD = 1.75;

/** Modest, because agreement between two things reading the same
 * biometrics is partly structural rather than independent evidence. */
export const AGREEMENT_MULTIPLIER = 1.1;

/** Substantial, because disagreement despite shared inputs is a real
 * finding about this specific person. */
export const DISAGREEMENT_MULTIPLIER = 0.7;

export type AffectAgreement = 'agrees' | 'disagrees' | 'inconclusive';

export interface AffectCalibration {
  /** Multiply the rule-based confidence by this. Exactly 1.0 whenever
   * there's nothing credible to say. */
  confidenceMultiplier: number;
  agreement: AffectAgreement;
  /** Which axes actually contributed — only models that cleared their
   * usability floor. Empty means the model had nothing to offer. */
  axesUsed: Array<'valence' | 'arousal'>;
  /** One sentence for the assessment's supporting signals, or null
   * when this module changed nothing. Phrased as calibration, never as
   * a mood claim in its own right. */
  explanation: string | null;
}

const NO_CHANGE: AffectCalibration = {
  confidenceMultiplier: 1,
  agreement: 'inconclusive',
  axesUsed: [],
  explanation: null,
};

/**
 * Compares the learned model's prediction against where the
 * rule-based state sits on the circumplex.
 *
 * Pure. `features` must be the same personal-z-score vector
 * `affectFeatures.extractFeatures` produces, for the reading the state
 * assessment itself was based on — comparing a prediction from one
 * moment against a state inferred from another would be measuring
 * nothing.
 */
export function calibrateStateConfidence(
  state: MoodState,
  models: { valence: AffectModel; arousal: AffectModel },
  features: Record<string, number>,
): AffectCalibration {
  if (state === 'unknown') return NO_CHANGE;

  const expected = STATE_CIRCUMPLEX[state];
  const deviations: number[] = [];
  const axesUsed: Array<'valence' | 'arousal'> = [];

  // Per-axis, because the two axes are not equally learnable —
  // arousal usually is, valence often isn't. An unusable axis is
  // skipped entirely rather than contributing a guess, which is what
  // keeps "I can read your energy but not your mood" intact here
  // instead of being averaged away.
  const predictedValence = predictAffect(models.valence, features);
  if (predictedValence !== null) {
    deviations.push(Math.abs(predictedValence - expected.valence));
    axesUsed.push('valence');
  }
  const predictedArousal = predictAffect(models.arousal, features);
  if (predictedArousal !== null) {
    deviations.push(Math.abs(predictedArousal - expected.arousal));
    axesUsed.push('arousal');
  }

  if (deviations.length === 0) return NO_CHANGE;

  const meanDeviation = deviations.reduce((a, b) => a + b, 0) / deviations.length;
  const axisLabel = axesUsed.length === 2 ? 'mood and energy' : axesUsed[0] === 'valence' ? 'mood' : 'energy';

  if (meanDeviation <= AGREEMENT_THRESHOLD) {
    return {
      confidenceMultiplier: AGREEMENT_MULTIPLIER,
      agreement: 'agrees',
      axesUsed,
      explanation: `What MoodSync has learned about your own ${axisLabel} agrees with this reading`,
    };
  }

  if (meanDeviation >= DISAGREEMENT_THRESHOLD) {
    return {
      confidenceMultiplier: DISAGREEMENT_MULTIPLIER,
      agreement: 'disagrees',
      axesUsed,
      explanation: `What MoodSync has learned about your own ${axisLabel} points somewhere else, so this is held loosely`,
    };
  }

  // Between the thresholds: a middling deviation is not evidence
  // either way, and forcing it into one would manufacture a finding.
  return { ...NO_CHANGE, axesUsed };
}

/** The engine's own ceiling — calibration must never push a state past
 * what `assessState` itself is allowed to claim. Kept in sync with
 * `confidenceFrom`'s cap in stateEngine.ts by this constant, not by
 * two separate literals drifting apart. */
export const MAX_CALIBRATED_CONFIDENCE = 0.95;

/** Applies a calibration to a confidence, clamped to the engine's own
 * bounds. Separate from `calibrateStateConfidence` so the decision and
 * the arithmetic are testable apart. */
export function applyCalibration(confidence: number, calibration: AffectCalibration): number {
  return Math.max(0, Math.min(MAX_CALIBRATED_CONFIDENCE, confidence * calibration.confidenceMultiplier));
}
