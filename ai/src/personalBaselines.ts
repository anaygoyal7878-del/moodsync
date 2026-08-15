import type { NormalizedBiometricReading } from '@moodsync/shared';

/**
 * Personal baselines — "is this high *for you*", never "is this above
 * 100 BPM".
 *
 * MoodSync already computes own-baseline z-scores in three places
 * (wellness.ts's internal `baselineZScore`, proactiveNotifications.ts,
 * proactiveNotificationsWorker.ts). None is exported, and each carries
 * its own threshold semantics. This module is the shared, exported one
 * the Adaptive Environment engine reads — see
 * docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md. It deliberately does NOT
 * refactor the existing three: each is load-bearing for a shipped
 * feature with its own tuned thresholds, and unifying them is a
 * separate change with its own regression risk.
 */

/** Below this many historical points, a z-score is noise, not a
 * baseline. Same bar wellness.ts and proactiveNotifications.ts already
 * use — kept identical on purpose so "enough data" means one thing
 * across the app. */
export const MIN_SAMPLES_FOR_BASELINE = 5;

/** Where a metric sits relative to this user's own recent history. */
export interface BaselineComparison {
  /** The value being compared. */
  value: number;
  /** Mean of the user's own recent history for this metric. */
  baseline: number;
  /** Standard deviations from that mean. Positive = above baseline. */
  z: number;
  /** How many historical points backed this. Always surfaced so a
   * comparison off 6 points never reads like one off 300. */
  sampleSize: number;
}

/** What the engine knows about this user's own normal ranges right now.
 * Every field is null when there isn't enough history — never a
 * fabricated default, and never a population norm standing in for a
 * personal one. */
export interface PersonalBaselines {
  heartRate: BaselineComparison | null;
  restingHeartRate: BaselineComparison | null;
  heartRateVariability: BaselineComparison | null;
  sleepScore: BaselineComparison | null;
  activityLevel: BaselineComparison | null;
  /** True when at least one metric has a usable baseline. When false,
   * the whole engine is in "still learning" mode and callers must say
   * so rather than acting confidently on nothing. */
  hasAnyBaseline: boolean;
  /** Largest sample size across all metrics — the honest headline for
   * "how much does MoodSync actually know about you yet". */
  maxSampleSize: number;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

/**
 * Floor on the standard deviation used as the z-score denominator,
 * expressed as a fraction of the baseline's own magnitude.
 *
 * Two real problems this solves, both found by tests rather than
 * inspection:
 *
 *  1. A perfectly flat history (`sd === 0`) makes the denominator zero.
 *     Returning `z: 0` there is actively wrong — against a rock-steady
 *     baseline, *any* difference is a large deviation, not a typical
 *     value — and dividing anyway gives Infinity.
 *  2. Near-zero variance in real data (a wearable reporting the same
 *     resting heart rate for a week) produces absurd z-scores off
 *     one-BPM noise.
 *
 * Regularizing the denominator fixes both continuously: 2% of the
 * user's own baseline is the smallest spread MoodSync will treat as
 * meaningful. It is a floor, never a replacement — whenever real
 * variance exceeds it, real variance is what's used.
 */
const MIN_RELATIVE_SD = 0.02;

/**
 * One metric's comparison, or null when there isn't enough history.
 */
export function compareToBaseline(value: number | undefined, history: number[]): BaselineComparison | null {
  if (value === undefined) return null;
  if (history.length < MIN_SAMPLES_FOR_BASELINE) return null;
  const baseline = mean(history);
  const rawSd = stdev(history, baseline);
  const effectiveSd = Math.max(rawSd, Math.abs(baseline) * MIN_RELATIVE_SD);
  // Only possible when the baseline itself is 0 and every sample was 0 —
  // no information, and no meaningful scale to express deviation on.
  const z = effectiveSd === 0 ? 0 : (value - baseline) / effectiveSd;
  return { value, baseline, z, sampleSize: history.length };
}

function collect(readings: NormalizedBiometricReading[], pick: (r: NormalizedBiometricReading) => number | undefined): number[] {
  return readings.map(pick).filter((v): v is number => typeof v === 'number');
}

/**
 * Builds every baseline comparison available for `latest`, against the
 * user's own `history` (which must NOT include `latest` itself — a
 * value compared against a baseline it contributed to is biased toward
 * looking normal).
 */
export function computePersonalBaselines(
  latest: NormalizedBiometricReading,
  history: NormalizedBiometricReading[],
): PersonalBaselines {
  const heartRate = compareToBaseline(latest.heartRate, collect(history, (r) => r.heartRate));
  const restingHeartRate = compareToBaseline(latest.restingHeartRate, collect(history, (r) => r.restingHeartRate));
  const heartRateVariability = compareToBaseline(latest.heartRateVariability, collect(history, (r) => r.heartRateVariability));
  const sleepScore = compareToBaseline(latest.sleepScore, collect(history, (r) => r.sleepScore));
  const activityLevel = compareToBaseline(latest.activityLevel, collect(history, (r) => r.activityLevel));

  const all = [heartRate, restingHeartRate, heartRateVariability, sleepScore, activityLevel];
  const present = all.filter((c): c is BaselineComparison => c !== null);

  return {
    heartRate,
    restingHeartRate,
    heartRateVariability,
    sleepScore,
    activityLevel,
    hasAnyBaseline: present.length > 0,
    maxSampleSize: present.reduce((max, c) => Math.max(max, c.sampleSize), 0),
  };
}

/** Plain-language rendering of one comparison, for the "why" line under
 * a recommendation. Uses "for you" phrasing throughout — the whole
 * point of a personal baseline is that the user's normal is the
 * reference, not a population number. */
export function describeBaseline(label: string, comparison: BaselineComparison, higherIsNotable = true): string {
  const direction = comparison.z > 0 ? 'above' : 'below';
  const magnitude = Math.abs(comparison.z);
  const strength = magnitude >= 2 ? 'well ' : magnitude >= 1 ? '' : 'slightly ';
  void higherIsNotable;
  return `${label} is ${strength}${direction} your usual (${Math.round(comparison.value)} vs. your typical ${Math.round(comparison.baseline)}, from ${comparison.sampleSize} readings)`;
}
