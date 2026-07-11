import type { NormalizedBiometricReading } from '@moodsync/shared';
import { GoogleHealthClient } from './client.js';
import { normalizeGoogleHealthData } from './normalize.js';

/**
 * The one place that knows how to turn a Google Health access token into
 * normalized readings — mirrors `@moodsync/integration-whoop`'s
 * `fetchAndNormalizeWhoopData` so the backend's manual "sync now" endpoint
 * and the standalone sync worker share this rather than each
 * re-implementing the fetch-and-merge sequence.
 */
export async function fetchAndNormalizeGoogleHealthData(params: {
  accessToken: string;
  userId: string;
  sinceDays?: number;
}): Promise<NormalizedBiometricReading[]> {
  const client = new GoogleHealthClient(params.accessToken);
  const since = new Date(Date.now() - (params.sinceDays ?? 7) * 86_400_000);
  const until = new Date();

  const [stepsRollups, heartRateRollups, caloriesRollups, restingHeartRates, sleeps] = await Promise.all([
    client.dailyRollUp('steps', since, until),
    client.dailyRollUp('heart-rate', since, until),
    client.dailyRollUp('total-calories', since, until),
    client.listDailyRestingHeartRate(since),
    client.listSleep(since),
  ]);

  return normalizeGoogleHealthData({
    userId: params.userId,
    stepsRollups,
    heartRateRollups,
    caloriesRollups,
    restingHeartRates,
    sleeps,
  });
}
