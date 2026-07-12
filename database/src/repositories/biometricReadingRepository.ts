import { prisma } from '../prismaClient.js';
import type { WearableProvider } from '@prisma/client';
import type { NormalizedBiometricReading, WearableProviderId } from '@moodsync/shared';

function toProviderEnum(provider: WearableProviderId): WearableProvider {
  switch (provider) {
    case 'whoop':
      return 'WHOOP';
    case 'google_health':
      return 'GOOGLE_HEALTH';
    case 'garmin':
      return 'GARMIN';
    case 'apple_health':
      return 'APPLE_HEALTH';
  }
}

function toProviderId(provider: WearableProvider): WearableProviderId {
  switch (provider) {
    case 'WHOOP':
      return 'whoop';
    case 'GOOGLE_HEALTH':
      return 'google_health';
    case 'GARMIN':
      return 'garmin';
    case 'APPLE_HEALTH':
      return 'apple_health';
  }
}

async function findLatest(userId: string) {
  return prisma.biometricReading.findFirst({ where: { userId }, orderBy: { timestamp: 'desc' } });
}

type BiometricReadingRow = NonNullable<Awaited<ReturnType<typeof findLatest>>>;

function toNormalized(row: BiometricReadingRow): NormalizedBiometricReading {
  return {
    provider: toProviderId(row.provider),
    userId: row.userId,
    timestamp: row.timestamp.toISOString(),
    heartRate: row.heartRate ?? undefined,
    restingHeartRate: row.restingHeartRate ?? undefined,
    sleepScore: row.sleepScore ?? undefined,
    recoveryScore: row.recoveryScore ?? undefined,
    stressLevel: row.stressLevel ?? undefined,
    activityLevel: row.activityLevel ?? undefined,
    steps: row.steps ?? undefined,
    calories: row.calories ?? undefined,
  };
}

export const biometricReadingRepository = {
  /** Bulk insert for a sync run. `skipDuplicates` relies on there being no
   * unique constraint on (userId, provider, timestamp) today — duplicate
   * readings across overlapping sync windows are an accepted tradeoff for
   * v1 (see ai/README.md), not a correctness bug, since the decision
   * engine only ever reads the latest reading. */
  async bulkInsert(readings: NormalizedBiometricReading[]): Promise<number> {
    if (readings.length === 0) return 0;
    const result = await prisma.biometricReading.createMany({
      data: readings.map((r) => ({
        userId: r.userId,
        provider: toProviderEnum(r.provider),
        timestamp: new Date(r.timestamp),
        heartRate: r.heartRate ?? null,
        restingHeartRate: r.restingHeartRate ?? null,
        sleepScore: r.sleepScore ?? null,
        recoveryScore: r.recoveryScore ?? null,
        stressLevel: r.stressLevel ?? null,
        activityLevel: r.activityLevel ?? null,
        steps: r.steps ?? null,
        calories: r.calories ?? null,
      })),
    });
    return result.count;
  },

  findLatest,

  /** Same as `findLatest` but converted back to the domain shape — what
   * the decision engine (`@moodsync/ai`) consumes after a sync run, so it
   * never has to know about Prisma's enum/null representation. */
  async findLatestNormalized(userId: string): Promise<{ id: string; reading: NormalizedBiometricReading } | null> {
    const row = await findLatest(userId);
    if (!row) return null;
    return { id: row.id, reading: toNormalized(row) };
  },

  /** Recent readings for the dashboard's trend view — newest first, capped
   * to a window in days rather than a row count, since sync frequency
   * (and therefore reading density) varies by provider. */
  async listRecentNormalized(userId: string, sinceDays: number): Promise<NormalizedBiometricReading[]> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await prisma.biometricReading.findMany({
      where: { userId, timestamp: { gte: since } },
      orderBy: { timestamp: 'desc' },
    });
    return rows.map(toNormalized);
  },

  /** Same window as `listRecentNormalized`, but keeps each row's id and
   * returns oldest-first — what automation-effectiveness scoring needs to
   * look up a rule execution's trigger reading and find the next reading
   * chronologically after it (see `ai/src/insights.ts`). */
  async listRecentNormalizedWithId(
    userId: string,
    sinceDays: number,
  ): Promise<Array<{ id: string; reading: NormalizedBiometricReading }>> {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    const rows = await prisma.biometricReading.findMany({
      where: { userId, timestamp: { gte: since } },
      orderBy: { timestamp: 'asc' },
    });
    return rows.map((row) => ({ id: row.id, reading: toNormalized(row) }));
  },
};
