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
  /** Lookback window for individual heart-rate samples, kept separate
   * from `sinceDays` on purpose: the daily rollups are cheap to re-fetch
   * over a multi-day window, but heart-rate samples are meant to be
   * fetched on a short polling interval (e.g. every 5 minutes) — reusing
   * `sinceDays` there would re-insert the same backlog of samples on
   * every run. Defaults to 20 minutes: enough slack to cover one missed
   * sync cycle at a 5-minute cadence without ballooning into a full-day
   * refetch. */
  heartRateSinceMinutes?: number;
}): Promise<NormalizedBiometricReading[]> {
  const client = new GoogleHealthClient(params.accessToken);
  const since = new Date(Date.now() - (params.sinceDays ?? 7) * 86_400_000);
  const until = new Date();
  const heartRateSince = new Date(Date.now() - (params.heartRateSinceMinutes ?? 20) * 60_000);

  const [stepsRollups, heartRateRollups, caloriesRollups, restingHeartRates, sleeps, heartRateSamples] =
    await Promise.all([
      client.dailyRollUp('steps', since, until),
      client.dailyRollUp('heart-rate', since, until),
      client.dailyRollUp('total-calories', since, until),
      client.listDailyRestingHeartRate(since),
      client.listSleep(since),
      client.listHeartRate(heartRateSince),
    ]);

  return normalizeGoogleHealthData({
    userId: params.userId,
    stepsRollups,
    heartRateRollups,
    caloriesRollups,
    restingHeartRates,
    sleeps,
    heartRateSamples,
  });
}
