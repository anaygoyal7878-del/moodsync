import { prisma } from '../prismaClient.js';
import type { WearableProvider } from '@prisma/client';
import type { NormalizedBiometricReading } from '@moodsync/shared';

function toProviderEnum(provider: NormalizedBiometricReading['provider']): WearableProvider {
  switch (provider) {
    case 'whoop':
      return 'WHOOP';
    case 'google_health':
      return 'GOOGLE_HEALTH';
    case 'garmin':
      return 'GARMIN';
  }
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

  async findLatest(userId: string) {
    return prisma.biometricReading.findFirst({ where: { userId }, orderBy: { timestamp: 'desc' } });
  },
};
