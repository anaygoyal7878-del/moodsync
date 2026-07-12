import type { NormalizedBiometricReading } from '@moodsync/shared';
import type {
  RollupDataPoint,
  DailyRestingHeartRatePoint,
  SleepDataPoint,
  HeartRateSamplePoint,
} from './client.js';

function dayKey(c: { year: number; month: number; day: number }): string {
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

/** Google Health's Sleep `summary` exposes `minutesAsleep` and
 * `minutesInSleepPeriod` directly — sleep efficiency, a standard published
 * sleep-medicine metric (time asleep ÷ time in bed), is just their ratio.
 * (An earlier pass computed this by hand-summing `stagesSummary`, but that
 * required guessing at field names that turned out to be wrong; these two
 * summary fields are confirmed and simpler.) */
function sleepEfficiencyScore(summary: SleepDataPoint['data']['sleep']['summary']): number | undefined {
  if (!summary?.minutesAsleep || !summary?.minutesInSleepPeriod) return undefined;

  const minutesAsleep = Number(summary.minutesAsleep);
  const minutesInSleepPeriod = Number(summary.minutesInSleepPeriod);
  if (!Number.isFinite(minutesAsleep) || !minutesInSleepPeriod) return undefined;

  return Math.round(Math.min(100, Math.max(0, (minutesAsleep / minutesInSleepPeriod) * 100)));
}

/** 10,000 steps/day is the commonly cited fitness-industry activity
 * benchmark — used here purely as MoodSync's own 0-100 normalization
 * scale (matching how `activityLevel` is derived from WHOOP's strain
 * scale), not a value the API itself provides. */
const STEPS_FOR_FULL_ACTIVITY = 10_000;

/**
 * Merges Google Health's separately-fetched rollups (steps, heart rate,
 * calories — all day-keyed) with daily resting heart rate (also day-keyed)
 * into one `NormalizedBiometricReading` per day. The single most recent
 * sleep session's efficiency score is attached to the latest day only —
 * see `sleepEfficiencyScore`'s doc comment for why sleep isn't bucketed
 * per-day like the other metrics. `recoveryScore` and `stressLevel` are
 * left unset: Google Health has no equivalent to either.
 *
 * `heartRateSamples`, unlike the other inputs, is NOT folded into the
 * per-day buckets — each sample becomes its own reading at its own real
 * timestamp. That's what makes "current heart rate" (the most recent
 * reading across all providers) actually reflect a recent point-in-time
 * value instead of a stale daily average, when the sync worker runs on a
 * short interval.
 */
export function normalizeGoogleHealthData(params: {
  userId: string;
  stepsRollups: RollupDataPoint[];
  heartRateRollups: RollupDataPoint[];
  caloriesRollups: RollupDataPoint[];
  restingHeartRates: DailyRestingHeartRatePoint[];
  sleeps: SleepDataPoint[];
  heartRateSamples?: HeartRateSamplePoint[];
}): NormalizedBiometricReading[] {
  const { userId, stepsRollups, heartRateRollups, caloriesRollups, restingHeartRates, sleeps, heartRateSamples } =
    params;

  const byDay = new Map<string, NormalizedBiometricReading>();

  function getOrCreate(civilStartTime: RollupDataPoint['civilStartTime']): NormalizedBiometricReading {
    const key = dayKey(civilStartTime);
    const existing = byDay.get(key);
    if (existing) return existing;

    const timestamp = new Date(
      Date.UTC(civilStartTime.year, civilStartTime.month - 1, civilStartTime.day),
    ).toISOString();
    const reading: NormalizedBiometricReading = { provider: 'google_health', userId, timestamp };
    byDay.set(key, reading);
    return reading;
  }

  for (const point of stepsRollups) {
    if (point.steps) getOrCreate(point.civilStartTime).steps = point.steps.countSum;
  }
  for (const point of heartRateRollups) {
    if (point.heartRate) getOrCreate(point.civilStartTime).heartRate = point.heartRate.beatsPerMinuteAvg;
  }
  for (const point of caloriesRollups) {
    if (point.totalCalories) getOrCreate(point.civilStartTime).calories = point.totalCalories.kcalSum;
  }
  for (const point of restingHeartRates) {
    const d = point.data.dailyRestingHeartRate;
    getOrCreate(d.date).restingHeartRate = d.beatsPerMinute;
  }

  for (const reading of byDay.values()) {
    if (reading.steps !== undefined) {
      reading.activityLevel = Math.min(100, (reading.steps / STEPS_FOR_FULL_ACTIVITY) * 100);
    }
  }

  const mostRecentSleep = sleeps[0];
  const mostRecentDay = [...byDay.keys()].sort().at(-1);
  if (mostRecentSleep && mostRecentDay) {
    const score = sleepEfficiencyScore(mostRecentSleep.data.sleep.summary);
    if (score !== undefined) byDay.get(mostRecentDay)!.sleepScore = score;
  }

  const sampleReadings: NormalizedBiometricReading[] = [];
  for (const point of heartRateSamples ?? []) {
    const physicalTime = point.data.heartRate.sampleTime.physicalTime;
    const bpm = Number(point.data.heartRate.beatsPerMinute);
    if (!physicalTime || !Number.isFinite(bpm)) continue;
    sampleReadings.push({ provider: 'google_health', userId, timestamp: physicalTime, heartRate: bpm });
  }

  return [...byDay.values(), ...sampleReadings];
}
