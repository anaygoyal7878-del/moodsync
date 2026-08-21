import type { NormalizedBiometricReading } from '@moodsync/shared';
import { compareToBaseline } from './personalBaselines.js';

/**
 * Turns raw readings around a mood check-in into the feature vector
 * `affectModel.ts` learns on.
 *
 * Three decisions here do most of the work:
 *
 * **1. Features are personal z-scores, not raw values.** A resting
 * heart rate of 72 means something different for two people; "11 bpm
 * above your own normal" means the same thing for both. This calls
 * `personalBaselines.ts`'s `compareToBaseline` primitive directly
 * rather than its `computePersonalBaselines` convenience wrapper — the
 * wrapper covers a fixed five metrics, and this needs a wider,
 * per-user set — so the whole app still shares one definition of "high
 * for you".
 *
 * **2. Activity is always included when available, even though nobody
 * would call it a mood signal.** Cardiac measures are heavily
 * confounded by physical exertion — an elevated heart rate from a run
 * looks a lot like an elevated heart rate from stress. Including
 * activity as a feature lets the regression hold it constant, so the
 * heart-rate coefficient means "elevated *beyond* what your activity
 * explains". Dropping it would let the model learn "exercise = bad
 * mood" from someone who checks in after workouts.
 *
 * **3. Only features this person actually has.** HRV is Apple
 * Health-only in this codebase; `recoveryScore` is WHOOP-only;
 * `stressLevel` has no provider at all today. A feature that is absent
 * or constant for a user is dropped rather than imputed — imputing a
 * missing signal to the mean invents agreement with the average and
 * quietly biases every coefficient that survives.
 */

/**
 * How far back from a check-in a reading may be and still count as
 * describing that moment.
 *
 * Wearable syncs are irregular, so requiring a reading at the exact
 * minute would discard most check-ins. Two hours is long enough to
 * survive real sync gaps and short enough that the reading still plausibly
 * describes the same stretch of the day.
 */
export const FEATURE_WINDOW_MINUTES = 120;

/** Every candidate feature, with the label used when explaining it.
 * Keyed by the `NormalizedBiometricReading` field it comes from, so a
 * schema rename can't silently orphan a feature. */
export const FEATURE_LABELS: Record<string, string> = {
  heartRate: 'heart rate',
  restingHeartRate: 'resting heart rate',
  heartRateVariability: 'heart rate variability',
  respiratoryRate: 'breathing rate',
  sleepScore: 'sleep quality',
  deepSleepMinutes: 'deep sleep',
  recoveryScore: 'recovery',
  activityLevel: 'activity level',
  steps: 'step count',
};

const FEATURE_FIELDS = Object.keys(FEATURE_LABELS) as Array<keyof NormalizedBiometricReading & string>;

/** A feature must vary across at least this share of a person's
 * check-ins to be worth offering the model. A column that is present
 * but nearly constant contributes no information and costs a slot in
 * the sample-size-limited feature budget. */
const MIN_PRESENT_RATIO = 0.6;

function numeric(reading: NormalizedBiometricReading, field: string): number | null {
  const value = (reading as unknown as Record<string, unknown>)[field];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * The reading that best describes a moment: the most recent one at or
 * before it, within the window.
 *
 * Strictly *before* on purpose. A reading taken after someone reports
 * feeling terrible may already reflect whatever they did about it, and
 * predicting the present from the future is the kind of leak that makes
 * an evaluation look excellent and a product feel broken.
 */
export function readingForMoment(
  readings: NormalizedBiometricReading[],
  moment: Date,
  windowMinutes: number = FEATURE_WINDOW_MINUTES,
): NormalizedBiometricReading | null {
  const cutoff = moment.getTime() - windowMinutes * 60_000;
  let best: NormalizedBiometricReading | null = null;
  let bestTime = -Infinity;

  for (const reading of readings) {
    const t = new Date(reading.timestamp).getTime();
    if (Number.isNaN(t) || t > moment.getTime() || t < cutoff) continue;
    if (t > bestTime) {
      bestTime = t;
      best = reading;
    }
  }
  return best;
}

/**
 * Builds one feature vector, as z-scores against the person's own
 * trailing history.
 *
 * `history` should be readings from *before* this moment; passing the
 * full dataset would let a check-in's baseline be shaped by readings
 * that hadn't happened yet.
 */
export function extractFeatures(
  reading: NormalizedBiometricReading,
  history: NormalizedBiometricReading[],
): Record<string, number> {
  const features: Record<string, number> = {};

  for (const field of FEATURE_FIELDS) {
    const value = numeric(reading, field);
    if (value === null) continue;

    const historyValues = history
      .map((r) => numeric(r, field))
      .filter((v): v is number => v !== null);

    // Returns null below MIN_SAMPLES_FOR_BASELINE — a metric with too
    // little history has no meaningful "normal" to deviate from yet, so
    // it's omitted rather than z-scored against noise.
    const comparison = compareToBaseline(value, historyValues);
    if (!comparison) continue;
    features[field] = comparison.z;
  }
  return features;
}

/**
 * Which features are worth offering the model for this person.
 *
 * Runs across their whole labelled set rather than per-sample, because
 * the model needs one consistent feature space — and a feature present
 * in three check-ins out of forty is noise wearing a column.
 */
export function usableFeatures(samples: Array<{ features: Record<string, number> }>): string[] {
  if (samples.length === 0) return [];

  return FEATURE_FIELDS.filter((field) => {
    const present = samples.filter((s) => typeof s.features[field] === 'number');
    if (present.length / samples.length < MIN_PRESENT_RATIO) return false;

    // Constant columns are unlearnable and would waste a feature slot.
    const values = present.map((s) => s.features[field]!);
    const min = Math.min(...values);
    const max = Math.max(...values);
    return max - min > 1e-6;
  });
}

/** Human label for a feature, falling back to the raw field name so an
 * unlabelled feature is visibly unlabelled rather than blank. */
export function featureLabel(field: string): string {
  return FEATURE_LABELS[field] ?? field;
}
