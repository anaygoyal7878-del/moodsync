import type { NormalizedBiometricReading } from '@moodsync/shared';
import type { WhoopRecovery, WhoopSleep, WhoopWorkout } from './client.js';

const WHOOP_MAX_STRAIN = 21; // WHOOP's strain scale is documented as 0-21

function sameCalendarDay(a: string, b: string): boolean {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/**
 * WHOOP's endpoints don't expose a single "current heart rate" reading —
 * only resting heart rate (via recovery) and per-workout average/max
 * heart rate (exertion during a specific activity, not a live figure).
 * `heartRate` is deliberately left unset here rather than approximated
 * from workout data, which would misrepresent what the number means.
 * Similarly, WHOOP has no step count or calorie field in the endpoints
 * this integration uses — see docs/INTEGRATIONS_RESEARCH.md.
 */
export function normalizeWhoopData(params: {
  userId: string;
  recoveries: WhoopRecovery[];
  sleeps: WhoopSleep[];
  workouts: WhoopWorkout[];
}): NormalizedBiometricReading[] {
  const { userId, recoveries, sleeps, workouts } = params;

  return recoveries
    .filter((recovery) => recovery.score_state === 'SCORED' && recovery.score)
    .map((recovery) => {
      const sleep = sleeps.find((s) => s.id === recovery.sleep_id);
      const matchingWorkout = workouts
        .filter((w) => sameCalendarDay(w.end, recovery.updated_at) && w.score_state === 'SCORED' && w.score)
        .sort((a, b) => new Date(b.end).getTime() - new Date(a.end).getTime())[0];

      const reading: NormalizedBiometricReading = {
        provider: 'whoop',
        userId,
        timestamp: recovery.updated_at,
        restingHeartRate: recovery.score?.resting_heart_rate,
        recoveryScore: recovery.score?.recovery_score,
        sleepScore: sleep?.score?.sleep_performance_percentage,
      };

      if (matchingWorkout?.score) {
        reading.activityLevel = Math.min(100, (matchingWorkout.score.strain / WHOOP_MAX_STRAIN) * 100);
      }

      return reading;
    });
}
