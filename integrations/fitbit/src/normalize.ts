import type { NormalizedBiometricReading } from '@moodsync/shared';
import type { RollupDataPoint, DailyRestingHeartRatePoint, SleepDataPoint, SleepStageSummary } from './client.js';

function dayKey(c: { year: number; month: number; day: number }): string {
  return `${c.year}-${String(c.month).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`;
}

/** Protobuf `Duration` JSON is a string like `"1800s"` or `"1800.5s"`. */
function durationSeconds(duration: string): number {
  return parseFloat(duration.replace(/s$/, '')) || 0;
}

/** Google Health's Sleep data type has no single score/efficiency field
 * (unlike WHOOP's `sleep_performance_percentage`) — this computes sleep
 * efficiency, a standard published sleep-medicine metric (time asleep ÷
 * time in bed), from the one part of the Sleep schema with confirmed
 * field names: `sleepSummary.stageSummary`. See
 * docs/INTEGRATIONS_RESEARCH.md for why the session's own start/end
 * timestamps aren't used here. */
function sleepEfficiencyScore(stageSummary: SleepStageSummary[] | undefined): number | undefined {
  if (!stageSummary || stageSummary.length === 0) return undefined;

  let totalSeconds = 0;
  let awakeSeconds = 0;
  for (const stage of stageSummary) {
    const seconds = durationSeconds(stage.totalDuration);
    totalSeconds += seconds;
    if (stage.sleepStageType === 'AWAKE') awakeSeconds += seconds;
  }
  if (totalSeconds === 0) return undefined;

  return Math.round(Math.min(100, Math.max(0, (1 - awakeSeconds / totalSeconds) * 100)));
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
 */
export function normalizeGoogleHealthData(params: {
  userId: string;
  stepsRollups: RollupDataPoint[];
  heartRateRollups: RollupDataPoint[];
  caloriesRollups: RollupDataPoint[];
  restingHeartRates: DailyRestingHeartRatePoint[];
  sleeps: SleepDataPoint[];
}): NormalizedBiometricReading[] {
  const { userId, stepsRollups, heartRateRollups, caloriesRollups, restingHeartRates, sleeps } = params;

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
    if (point.heartRate) getOrCreate(point.civilStartTime).heartRate = point.heartRate.bpmAvg;
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
    const score = sleepEfficiencyScore(mostRecentSleep.data.sleep.sleepSummary?.stageSummary);
    if (score !== undefined) byDay.get(mostRecentDay)!.sleepScore = score;
  }

  return [...byDay.values()];
}
