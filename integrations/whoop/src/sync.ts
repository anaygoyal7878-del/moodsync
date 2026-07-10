import type { NormalizedBiometricReading } from '@moodsync/shared';
import { WhoopClient } from './client.js';
import { normalizeWhoopData } from './normalize.js';

async function collect<T>(iterable: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of iterable) items.push(item);
  return items;
}

/**
 * The one place that knows how to turn a WHOOP access token into
 * normalized readings — both the backend's manual "sync now" endpoint and
 * the standalone sync worker call this rather than each re-implementing
 * the recovery/sleep/workout fetch-and-merge sequence.
 */
export async function fetchAndNormalizeWhoopData(params: {
  accessToken: string;
  userId: string;
  sinceDays?: number;
}): Promise<NormalizedBiometricReading[]> {
  const client = new WhoopClient(params.accessToken);
  const range = { start: new Date(Date.now() - (params.sinceDays ?? 7) * 86_400_000).toISOString() };

  const [recoveries, sleeps, workouts] = await Promise.all([
    collect(client.listRecovery(range)),
    collect(client.listSleep(range)),
    collect(client.listWorkouts(range)),
  ]);

  return normalizeWhoopData({ userId: params.userId, recoveries, sleeps, workouts });
}
