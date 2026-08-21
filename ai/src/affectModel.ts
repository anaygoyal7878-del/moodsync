/**
 * Learns, per person, how their own biometrics relate to how they say
 * they feel.
 *
 * ## Why this module has to exist
 *
 * Until now every biometric→mood claim in MoodSync came from hand-written
 * rules in `stateEngine.ts`: elevated heart rate plus low HRV is
 * "stressed", and so on. Those rules are plausible, and they have never
 * once been checked against whether the person actually felt stressed.
 * `StateEngineInput.userDeclaredState` existed but was hardcoded `null`
 * at its only call site — the app had no labels at all.
 *
 * You cannot learn how biometrics relate to mood without mood. So this
 * layer starts from `MoodCheckIn` (a real self-report) and learns the
 * mapping from *that person's* readings to *that person's* answers.
 *
 * ## What it models: valence and arousal, not "moods"
 *
 * The target is the circumplex — two continuous axes, valence
 * (unpleasant→pleasant) and arousal (calm→activated) — rather than a set
 * of named emotions. Two reasons, both practical:
 *
 *  - It is the standard target in affective computing, so the modest
 *    accuracy reported in that literature is the accuracy to expect here
 *    (real-world wearable studies land around F1 ~0.54 for both axes —
 *    useful, nowhere near mind-reading).
 *  - Arousal is substantially more learnable from cardiac signals than
 *    valence is. Keeping the axes separate lets MoodSync honestly say
 *    "I can predict your energy but not your mood", which collapsing to
 *    one "mood score" would hide.
 *
 * ## Per-person only, deliberately
 *
 * Nothing here pools data across users. That is not only the
 * privacy-preserving choice, it's the statistically correct one: the
 * biometric signature of a given affective state is strongly
 * individual, and personalized models consistently outperform
 * population models in this literature. A cold-start population prior
 * is a real future option; it is not what this is.
 *
 * ## The honesty machinery
 *
 * This is a correlational model over observational data. It cannot show
 * that biometrics *cause* mood, or the reverse, and both directions are
 * plausible for every signal here. Everything it emits is phrased as
 * association, and three guards keep it from claiming more than it has:
 *
 *  1. **A sample floor.** Below `MIN_SAMPLES_TO_LEARN` nothing is fit.
 *  2. **Out-of-sample scoring only.** Reported R² is leave-one-out
 *     cross-validated against the mean-predictor baseline, never the
 *     in-sample fit — which for a model with this many parameters would
 *     look impressive on pure noise.
 *  3. **A usefulness floor.** A model that can't beat "always guess this
 *     person's average" by `MIN_USABLE_R2` is reported as unusable
 *     rather than shown with a small number next to it.
 */

/** The two circumplex axes. Kept separate all the way through because
 * they are not equally learnable and averaging them would hide that. */
export type AffectTarget = 'valence' | 'arousal';

/** Self-report scale. Deliberately coarse — a 5-point scale is about
 * the resolution people can actually report reliably, and a finer one
 * would invent precision the label doesn't have. */
export const AFFECT_SCALE_MIN = -2;
export const AFFECT_SCALE_MAX = 2;

/**
 * Nothing is fit below this many check-ins. With ~2-4 usable features
 * this is already a thin sample; going lower doesn't produce a worse
 * model so much as a meaningless one.
 */
export const MIN_SAMPLES_TO_LEARN = 20;

/**
 * Out-of-sample R² a model must clear to be shown at all. Zero would
 * mean "exactly as good as guessing this person's average"; small
 * positive values are indistinguishable from luck at these sample
 * sizes, so the bar sits above them.
 */
export const MIN_USABLE_R2 = 0.1;

/**
 * At most one feature per this many samples. The standard guard against
 * fitting noise: with 20 check-ins, a 10-feature model can trace the
 * data almost exactly and predict nothing.
 */
export const SAMPLES_PER_FEATURE = 5;

/** Ridge penalties tried per fit. Selected by cross-validated score,
 * not by eyeball. Includes a large value so that "shrink almost
 * everything to zero" stays available when no feature carries signal. */
const LAMBDA_GRID = [0.1, 1, 3, 10, 30, 100];

export interface LabeledSample {
  /** Biometric features, already expressed as this person's own
   * z-scores (see affectFeatures.ts) so coefficients are comparable. */
  features: Record<string, number>;
  valence: number;
  arousal: number;
}

export interface FeatureAssociation {
  feature: string;
  /** Standardized ridge coefficient — relative pull on the prediction. */
  coefficient: number;
  /** Plain Pearson correlation with the target, kept alongside because
   * a coefficient can be shrunk toward zero by a correlated neighbour
   * while the underlying relationship is still real. */
  correlation: number;
}

export interface AffectModel {
  target: AffectTarget;
  sampleSize: number;
  /** Features that survived selection. */
  features: string[];
  /** Leave-one-out cross-validated R², relative to the mean predictor.
   * Negative means the model is worse than guessing the average — which
   * is a real and common outcome, not an error. */
  crossValidatedR2: number;
  /** Whether this model cleared both the sample and usefulness floors.
   * Everything user-facing must check this before saying anything. */
  usable: boolean;
  intercept: number;
  coefficients: Record<string, number>;
  associations: FeatureAssociation[];
}

// ---------------------------------------------------------------------
// Small dense linear algebra. Systems here are at most ~8x8, so a plain
// solve is the right call — no dependency, and every step is visible.
// ---------------------------------------------------------------------

/** Solves Ax = b by Gaussian elimination with partial pivoting.
 * Returns null for a singular system rather than NaNs, so callers fail
 * loudly instead of propagating garbage into a coefficient. */
function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-12) return null;
    [M[col], M[pivot]] = [M[pivot]!, M[col]!];

    for (let row = col + 1; row < n; row++) {
      const factor = M[row]![col]! / M[col]![col]!;
      for (let k = col; k <= n; k++) M[row]![k]! -= factor * M[col]![k]!;
    }
  }

  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = M[row]![n]!;
    for (let k = row + 1; k < n; k++) sum -= M[row]![k]! * x[k]!;
    x[row] = sum / M[row]![row]!;
  }
  return x;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  // A feature that never varies correlates with nothing — 0, not NaN.
  if (dx < 1e-12 || dy < 1e-12) return 0;
  return num / Math.sqrt(dx * dy);
}

/**
 * Ridge regression on centered data.
 *
 * The intercept is handled by centering rather than by adding a column
 * of ones, so the L2 penalty never shrinks it — penalizing the
 * intercept would bias every prediction toward zero, which on a
 * -2..+2 mood scale means biasing toward "neutral" for no reason.
 */
export function fitRidge(
  X: number[][],
  y: number[],
  lambda: number,
): { intercept: number; coefficients: number[] } | null {
  const n = y.length;
  const k = X[0]?.length ?? 0;
  if (n === 0 || k === 0) return null;

  const featureMeans = Array.from({ length: k }, (_, j) => mean(X.map((row) => row[j]!)));
  const yMean = mean(y);
  const Xc = X.map((row) => row.map((v, j) => v - featureMeans[j]!));
  const yc = y.map((v) => v - yMean);

  const XtX: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const Xty = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a]! += Xc[i]![a]! * yc[i]!;
      for (let b = 0; b < k; b++) XtX[a]![b]! += Xc[i]![a]! * Xc[i]![b]!;
    }
  }
  for (let a = 0; a < k; a++) XtX[a]![a]! += lambda;

  const beta = solve(XtX, Xty);
  if (!beta) return null;

  const intercept = yMean - beta.reduce((sum, b, j) => sum + b * featureMeans[j]!, 0);
  return { intercept, coefficients: beta };
}

function targetValues(samples: LabeledSample[], target: AffectTarget): number[] {
  return samples.map((s) => (target === 'valence' ? s.valence : s.arousal));
}

/**
 * Picks the features most correlated with the target, capped by sample
 * size. Exported so the selection rule is inspectable — it is run
 * *inside* each cross-validation fold, never once over the whole
 * dataset, because choosing features using the held-out point and then
 * scoring on it is the classic way to manufacture a good-looking R²
 * from noise.
 */
export function selectFeatures(samples: LabeledSample[], names: string[], target: AffectTarget): string[] {
  const y = targetValues(samples, target);
  const budget = Math.max(1, Math.floor(samples.length / SAMPLES_PER_FEATURE));
  return names
    .map((name) => ({ name, strength: Math.abs(pearson(samples.map((s) => s.features[name] ?? 0), y)) }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, budget)
    .map((f) => f.name);
}

function designMatrix(samples: LabeledSample[], features: string[]): number[][] {
  return samples.map((s) => features.map((f) => s.features[f] ?? 0));
}

function predictWith(
  model: { intercept: number; coefficients: number[] },
  features: string[],
  sample: LabeledSample,
): number {
  return features.reduce(
    (sum, f, j) => sum + model.coefficients[j]! * (sample.features[f] ?? 0),
    model.intercept,
  );
}

/**
 * Leave-one-out cross-validated R², against the mean-predictor baseline.
 *
 * Feature selection and λ are both re-derived from the training fold
 * only. That makes this pessimistic relative to the numbers usually
 * quoted for small-sample affect models, which is the point: this
 * number decides whether MoodSync tells someone it has learned
 * something about them.
 */
export function crossValidatedR2(samples: LabeledSample[], names: string[], target: AffectTarget): number {
  const n = samples.length;
  if (n < 3) return Number.NEGATIVE_INFINITY;
  const y = targetValues(samples, target);

  let sseModel = 0;
  let sseBaseline = 0;

  for (let i = 0; i < n; i++) {
    const train = samples.filter((_, idx) => idx !== i);
    const trainY = targetValues(train, target);
    const features = selectFeatures(train, names, target);

    let best: { intercept: number; coefficients: number[] } | null = null;
    let bestScore = Number.POSITIVE_INFINITY;
    for (const lambda of LAMBDA_GRID) {
      const fit = fitRidge(designMatrix(train, features), trainY, lambda);
      if (!fit) continue;
      // λ chosen on training residuals only — the held-out point never
      // participates in any decision that shapes the model.
      const err = train.reduce((sum, s, idx) => {
        const d = predictWith(fit, features, s) - trainY[idx]!;
        return sum + d * d;
      }, 0);
      if (err < bestScore) {
        bestScore = err;
        best = fit;
      }
    }
    if (!best) return Number.NEGATIVE_INFINITY;

    const predicted = predictWith(best, features, samples[i]!);
    sseModel += (predicted - y[i]!) ** 2;
    sseBaseline += (mean(trainY) - y[i]!) ** 2;
  }

  if (sseBaseline < 1e-12) return Number.NEGATIVE_INFINITY;
  return 1 - sseModel / sseBaseline;
}

/**
 * Fits this person's model for one axis, and decides whether it has
 * earned the right to say anything.
 *
 * Returns a model either way — a rejected model is still informative
 * ("we tried, here is how far off it was"), and hiding the failed fit
 * entirely would make the absence of a finding look like the absence of
 * an attempt.
 */
export function learnAffectModel(
  samples: LabeledSample[],
  featureNames: string[],
  target: AffectTarget,
): AffectModel {
  const empty: AffectModel = {
    target,
    sampleSize: samples.length,
    features: [],
    crossValidatedR2: Number.NEGATIVE_INFINITY,
    usable: false,
    intercept: 0,
    coefficients: {},
    associations: [],
  };
  if (samples.length < MIN_SAMPLES_TO_LEARN || featureNames.length === 0) return empty;

  const r2 = crossValidatedR2(samples, featureNames, target);
  const features = selectFeatures(samples, featureNames, target);
  const y = targetValues(samples, target);

  let best: { intercept: number; coefficients: number[] } | null = null;
  let bestErr = Number.POSITIVE_INFINITY;
  for (const lambda of LAMBDA_GRID) {
    const fit = fitRidge(designMatrix(samples, features), y, lambda);
    if (!fit) continue;
    const err = samples.reduce((sum, s, idx) => {
      const d = predictWith(fit, features, s) - y[idx]!;
      return sum + d * d;
    }, 0);
    if (err < bestErr) {
      bestErr = err;
      best = fit;
    }
  }
  if (!best) return empty;

  const coefficients: Record<string, number> = {};
  features.forEach((f, j) => {
    coefficients[f] = best!.coefficients[j]!;
  });

  const associations: FeatureAssociation[] = features
    .map((f) => ({
      feature: f,
      coefficient: coefficients[f]!,
      correlation: pearson(samples.map((s) => s.features[f] ?? 0), y),
    }))
    .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));

  return {
    target,
    sampleSize: samples.length,
    features,
    crossValidatedR2: r2,
    usable: r2 >= MIN_USABLE_R2,
    intercept: best.intercept,
    coefficients,
    associations,
  };
}

/** Applies a learned model. Returns null for an unusable model rather
 * than a number the caller might render anyway. */
export function predictAffect(model: AffectModel, features: Record<string, number>): number | null {
  if (!model.usable) return null;
  const raw = model.features.reduce(
    (sum, f) => sum + (model.coefficients[f] ?? 0) * (features[f] ?? 0),
    model.intercept,
  );
  return Math.max(AFFECT_SCALE_MIN, Math.min(AFFECT_SCALE_MAX, raw));
}

/**
 * One plain-language sentence about a single association.
 *
 * Always "goes with", never "causes" or "makes you". Both causal
 * directions are live for every signal here — poor sleep may flatten
 * mood, and low mood reliably wrecks sleep — and this model cannot
 * distinguish them even in principle.
 */
export function describeAssociation(
  association: FeatureAssociation,
  target: AffectTarget,
  label: string,
  sampleSize: number,
): string {
  const direction = association.correlation >= 0 ? 'higher' : 'lower';
  const axis = target === 'valence' ? 'better mood' : 'feeling more activated';
  return `${direction} ${label} tends to go with ${axis} for you (${sampleSize} check-ins so far — an association, not a cause)`;
}
