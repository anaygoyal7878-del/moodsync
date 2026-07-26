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
  /** Real incremental cursor — pass the connection's last successful
   * sync timestamp here so a recurring sync only requests data since
   * then, instead of re-requesting a fixed trailing window every run.
   * When omitted (first-ever sync, no prior `lastSyncedAt`), falls back
   * to `sinceDays` below. Callers should subtract a small safety overlap
   * (a few minutes) from the raw `lastSyncedAt` before passing it here,
   * to tolerate clock skew between this process and Google's servers —
   * the `BiometricReading` unique constraint + `skipDuplicates` already
   * absorbs the resulting overlap-region duplicates for free. */
  since?: Date | undefined;
  /** Only used when `since` is omitted — a fixed trailing window for a
   * first-ever sync (no cursor exists yet) or a manual "sync now" click
   * that wants a real backfill. */
  sinceDays?: number;
  /** Lookback window for individual heart-rate samples, kept separate
   * from `since`/`sinceDays` on purpose: heart-rate samples are high
   * frequency and meant to be fetched on a short polling interval — reusing
   * a multi-day `since` there would re-insert a large backlog of samples
   * on every run. Defaults to 20 minutes: enough slack to cover one missed
   * sync cycle at a 5-minute cadence without ballooning into a full-day
   * refetch. */
  heartRateSinceMinutes?: number;
}): Promise<NormalizedBiometricReading[]> {
  const client = new GoogleHealthClient(params.accessToken);
  const since = params.since ?? new Date(Date.now() - (params.sinceDays ?? 7) * 86_400_000);
  const until = new Date();
  const heartRateSince = new Date(Date.now() - (params.heartRateSinceMinutes ?? 20) * 60_000);

  const [
    stepsRollups,
    heartRateRollups,
    caloriesRollups,
    restingHeartRates,
    sleeps,
    heartRateSamples,
    activeMinutes,
    heartRateZones,
  ] = await Promise.all([
    client.dailyRollUp('steps', since, until),
    client.dailyRollUp('heart-rate', since, until),
    client.dailyRollUp('total-calories', since, until),
    client.listDailyRestingHeartRate(since),
    client.listSleep(since),
    client.listHeartRate(heartRateSince),
    // Not independently confirmed against a live account (see
    // client.ts's doc comments) — caught individually so a wrong
    // endpoint/scope on these two newer data types can't take down the
    // whole sync (steps/heart-rate/sleep are the load-bearing metrics
    // this integration has relied on since it shipped).
    client.listActiveMinutes(since).catch(() => []),
    client.listHeartRateZoneMinutes(since).catch(() => []),
  ]);

  return normalizeGoogleHealthData({
    userId: params.userId,
    stepsRollups,
    heartRateRollups,
    caloriesRollups,
    restingHeartRates,
    sleeps,
    heartRateSamples,
    activeMinutes,
    heartRateZones,
  });
}
