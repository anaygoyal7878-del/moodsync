import type { NormalizedBiometricReading } from '@moodsync/shared';

/** Every score is 0-100, or `null` when its required inputs are absent —
 * never guessed, matching ruleEngine.ts's "missing field never matches"
 * convention. `basis` is shown in the UI so a user can tell scientific
 * measurement apart from MoodSync's own heuristics — see
 * docs/WELLNESS_SCORING.md for the full methodology and citations. */
export type ScoreBasis = 'provider-native' | 'evidence-informed-heuristic' | 'heuristic';

export interface WellnessScore {
  value: number | null;
  basis: ScoreBasis;
}

export interface WellnessScores {
  stress: WellnessScore;
  recovery: WellnessScore;
  sleep: WellnessScore;
  energy: WellnessScore;
  fatigue: WellnessScore;
  focus: WellnessScore;
  relaxation: WellnessScore;
  overall: WellnessScore;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** A user's own trailing mean/stdev for one metric — modern HRV research
 * (Rosenbach et al. 2025, *Stress and Health*; the Garmin stress-score
 * validation preprint, bioRxiv 2025.01.06.630177) emphasizes comparing a
 * user's own recent values to their own baseline via z-score rather than
 * population norms, since no single stress-score formula is
 * industry-accepted. Needs at least 5 historical points to be meaningful;
 * returns `null` otherwise rather than computing a z-score off noise. */
function baselineZScore(latest: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const m = mean(history);
  const sd = stdev(history, m);
  if (sd === 0) return 0;
  return (latest - m) / sd;
}

/** Trailing values for one field from a reading history, oldest-or-newest
 * order doesn't matter here since only mean/stdev are computed — the
 * *latest* reading (passed separately) is deliberately excluded from its
 * own baseline. */
function fieldHistory(readings: NormalizedBiometricReading[], field: keyof NormalizedBiometricReading): number[] {
  return readings.map((r) => r[field]).filter((v): v is number => typeof v === 'number');
}

/**
 * Stress (0-100, higher = more stressed) — **heuristic mapping**, informed
 * by evidence-based methodology (own-baseline z-scoring), not a
 * reproduction of any vendor's proprietary formula. Requires
 * `heartRateVariability` (Apple Health-only today) on both the latest
 * reading and >=5 historical points; returns `null` otherwise, consistent
 * with `stressLevel` never being guessed elsewhere in this codebase. Low
 * HRV relative to baseline is the dominant signal (weighted more heavily
 * than resting-heart-rate elevation), mirroring the relative emphasis
 * described in WHOOP's public Recovery methodology commentary.
 */
export function computeStressScore(
  reading: NormalizedBiometricReading,
  recentReadings: NormalizedBiometricReading[],
): WellnessScore {
  if (reading.heartRateVariability === undefined) return { value: null, basis: 'heuristic' };

  const hrvHistory = fieldHistory(recentReadings, 'heartRateVariability');
  const hrvZ = baselineZScore(reading.heartRateVariability, hrvHistory);
  if (hrvZ === null) return { value: null, basis: 'heuristic' };

  let z = -hrvZ; // lower HRV than baseline -> higher stress
  if (reading.restingHeartRate !== undefined) {
    const rhrHistory = fieldHistory(recentReadings, 'restingHeartRate');
    const rhrZ = baselineZScore(reading.restingHeartRate, rhrHistory);
    if (rhrZ !== null) z = z * 0.7 + rhrZ * 0.3; // RHR is a secondary, not primary, signal
  }

  // Heuristic curve: a z-score of +/-2 (own-baseline standard deviations)
  // maps to the 0/100 extremes; 0 maps to 50 (baseline-typical).
  const value = Math.round(clamp(50 + z * 25, 0, 100));
  return { value, basis: 'evidence-informed-heuristic' };
}

/**
 * Recovery (0-100, higher = more recovered) — passes through the
 * provider's own native `recoveryScore` when present (WHOOP, real and
 * provider-computed). For providers without one, a **heuristic** composite
 * informed by WHOOP's public commentary (HRV-dominant, RHR-secondary,
 * sleep a minor contribution) — explicitly not a reproduction of WHOOP's
 * proprietary algorithm, since that isn't published.
 */
export function computeRecoveryScore(
  reading: NormalizedBiometricReading,
  recentReadings: NormalizedBiometricReading[],
): WellnessScore {
  if (reading.recoveryScore !== undefined) {
    return { value: Math.round(clamp(reading.recoveryScore, 0, 100)), basis: 'provider-native' };
  }

  if (reading.heartRateVariability === undefined) return { value: null, basis: 'heuristic' };
  const hrvHistory = fieldHistory(recentReadings, 'heartRateVariability');
  const hrvZ = baselineZScore(reading.heartRateVariability, hrvHistory);
  if (hrvZ === null) return { value: null, basis: 'heuristic' };

  let composite = hrvZ * 0.7;
  if (reading.restingHeartRate !== undefined) {
    const rhrHistory = fieldHistory(recentReadings, 'restingHeartRate');
    const rhrZ = baselineZScore(reading.restingHeartRate, rhrHistory);
    if (rhrZ !== null) composite += -rhrZ * 0.2; // elevated RHR vs. baseline lowers recovery
  }
  if (reading.sleepScore !== undefined) {
    composite += ((reading.sleepScore - 70) / 30) * 0.1; // small, sleep-quality-relative nudge
  }

  const value = Math.round(clamp(50 + composite * 25, 0, 100));
  return { value, basis: 'evidence-informed-heuristic' };
}

/** 8 hours — the midpoint of the CDC/National Sleep Foundation's
 * recommended 7-9 hour range for adults (sleepfoundation.org/how-sleep-works/how-much-sleep-do-we-really-need),
 * used as the "100%" anchor for the total-sleep-time component below. */
const RECOMMENDED_SLEEP_MINUTES = 8 * 60;

/** Deep sleep is normally 10-20% of total sleep time for adults
 * (sleepfoundation.org/stages-of-sleep/deep-sleep) — the low end of that
 * range is the "fully scored" floor; nothing in that source suggests a
 * ceiling penalty for more than 20%, so this only ramps up to 100, never
 * back down. */
const NORMAL_DEEP_SLEEP_PCT_FLOOR = 10;

/**
 * Sleep (0-100). When stage-level data exists (WHOOP/Google Health
 * today — see `NormalizedBiometricReading.deepSleepMinutes` et al.),
 * uses a stage-weighted formula cited in docs/WELLNESS_SCORING.md: 40%
 * total sleep time (against the CDC/NSF-recommended 7-9hr range), 40%
 * deep sleep (against the Sleep Foundation's 10-20%-of-total normal
 * range), 20% the provider's own efficiency/quality score. Falls back to
 * a plain passthrough of the provider's native `sleepScore` when stage
 * data is absent (Apple Health/Amazfit readings, or a provider night
 * with no stage breakdown) — same behavior as before this formula
 * existed, so no regression for those providers.
 */
export function computeSleepScore(reading: NormalizedBiometricReading): WellnessScore {
  const { deepSleepMinutes, remSleepMinutes, lightSleepMinutes, sleepScore } = reading;

  if (deepSleepMinutes !== undefined && remSleepMinutes !== undefined && lightSleepMinutes !== undefined) {
    const totalSleepMinutes = deepSleepMinutes + remSleepMinutes + lightSleepMinutes;
    if (totalSleepMinutes > 0) {
      const totalTimeScore = clamp((totalSleepMinutes / RECOMMENDED_SLEEP_MINUTES) * 100, 0, 100);
      const deepPct = (deepSleepMinutes / totalSleepMinutes) * 100;
      const deepScore = clamp((deepPct / NORMAL_DEEP_SLEEP_PCT_FLOOR) * 100, 0, 100);
      const efficiencyScore = sleepScore !== undefined ? clamp(sleepScore, 0, 100) : totalTimeScore;
      const value = Math.round(totalTimeScore * 0.4 + deepScore * 0.4 + efficiencyScore * 0.2);
      return { value: clamp(value, 0, 100), basis: 'evidence-informed-heuristic' };
    }
  }

  if (sleepScore === undefined) return { value: null, basis: 'heuristic' };
  return { value: Math.round(clamp(sleepScore, 0, 100)), basis: 'provider-native' };
}

/**
 * Energy (0-100) — reuses the existing `activityLevel` field directly, an
 * already-real, already-normalized 0-100 composite (see
 * shared/src/wearables.ts). No new computation.
 */
export function computeEnergyScore(reading: NormalizedBiometricReading): WellnessScore {
  if (reading.activityLevel === undefined) return { value: null, basis: 'heuristic' };
  return { value: Math.round(clamp(reading.activityLevel, 0, 100)), basis: 'provider-native' };
}

/**
 * Fatigue, Focus, Relaxation (0-100) — **pure heuristics**. No accepted
 * clinical formula exists for deriving any of these three from wearable
 * biometrics alone; never presented as scientific. Each is a simple,
 * documented blend of the scores above, computed only when its inputs are
 * available.
 */
function computeFatigueScore(recovery: WellnessScore, sleep: WellnessScore): WellnessScore {
  if (recovery.value === null && sleep.value === null) return { value: null, basis: 'heuristic' };
  const parts = [recovery.value, sleep.value].filter((v): v is number => v !== null);
  const value = Math.round(100 - mean(parts));
  return { value: clamp(value, 0, 100), basis: 'heuristic' };
}

function computeRelaxationScore(stress: WellnessScore): WellnessScore {
  if (stress.value === null) return { value: null, basis: 'heuristic' };
  return { value: clamp(100 - stress.value, 0, 100), basis: 'heuristic' };
}

function computeFocusScore(stress: WellnessScore, energy: WellnessScore): WellnessScore {
  if (stress.value === null && energy.value === null) return { value: null, basis: 'heuristic' };
  // Heuristic: focus favors moderate-to-high energy with low-to-moderate
  // stress — very high stress or very low energy both reduce it.
  const stressComponent = stress.value === null ? 50 : 100 - stress.value;
  const energyComponent = energy.value === null ? 50 : energy.value;
  const value = Math.round(stressComponent * 0.6 + energyComponent * 0.4);
  return { value: clamp(value, 0, 100), basis: 'heuristic' };
}

/** Documented, configurable weighted average — heuristic, not scientific.
 * Weights: recovery 30%, sleep 25%, (inverse) stress 25%, energy 20% —
 * see docs/WELLNESS_SCORING.md for rationale. Only scores that are
 * actually available contribute; the remaining weight is redistributed
 * proportionally rather than treating a missing score as 0 or 50. */
function computeOverallScore(scores: {
  stress: WellnessScore;
  recovery: WellnessScore;
  sleep: WellnessScore;
  energy: WellnessScore;
}): WellnessScore {
  const weighted: Array<{ value: number; weight: number }> = [];
  if (scores.recovery.value !== null) weighted.push({ value: scores.recovery.value, weight: 0.3 });
  if (scores.sleep.value !== null) weighted.push({ value: scores.sleep.value, weight: 0.25 });
  if (scores.stress.value !== null) weighted.push({ value: 100 - scores.stress.value, weight: 0.25 });
  if (scores.energy.value !== null) weighted.push({ value: scores.energy.value, weight: 0.2 });
  if (weighted.length === 0) return { value: null, basis: 'heuristic' };

  const totalWeight = weighted.reduce((sum, w) => sum + w.weight, 0);
  const value = weighted.reduce((sum, w) => sum + w.value * w.weight, 0) / totalWeight;
  return { value: Math.round(clamp(value, 0, 100)), basis: 'heuristic' };
}

/** Computes every wellness score for one reading. `recentReadings` should
 * be a trailing window (e.g. 30 days) of the same user's prior readings,
 * oldest-or-newest order doesn't matter, and should NOT include `reading`
 * itself (baselines compare the latest point against history, not
 * against itself). */
export function computeWellnessScores(
  reading: NormalizedBiometricReading,
  recentReadings: NormalizedBiometricReading[] = [],
): WellnessScores {
  const stress = computeStressScore(reading, recentReadings);
  const recovery = computeRecoveryScore(reading, recentReadings);
  const sleep = computeSleepScore(reading);
  const energy = computeEnergyScore(reading);

  return {
    stress,
    recovery,
    sleep,
    energy,
    fatigue: computeFatigueScore(recovery, sleep),
    focus: computeFocusScore(stress, energy),
    relaxation: computeRelaxationScore(stress),
    overall: computeOverallScore({ stress, recovery, sleep, energy }),
  };
}
