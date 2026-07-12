import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { wearableConnectionRepository, biometricReadingRepository } from '@moodsync/database';
import { dispatchForReading } from '@moodsync/ai';
import type { NormalizedBiometricReading } from '@moodsync/shared';

/**
 * Apple Health has no server-side API or OAuth flow at all (see
 * docs/INTEGRATIONS_RESEARCH.md) — HealthKit data only ever leaves the
 * device through a native app the user installs, which reads it locally
 * and pushes it here. This endpoint is that push target: authenticated
 * with the same session JWT the web app uses (the iOS companion logs
 * into the same MoodSync account via POST /api/auth/login), not a
 * separate OAuth handshake.
 */
const readingSchema = z.object({
  timestamp: z.string().datetime(),
  heartRate: z.number().optional(),
  restingHeartRate: z.number().optional(),
  /** Milliseconds (SDNN) — see docs/APPLE_HEALTH_ARCHITECTURE.md §6. */
  heartRateVariability: z.number().optional(),
  /** Breaths per minute. */
  respiratoryRate: z.number().optional(),
  /** 0-100 percentage (SpO2) — see docs/APPLE_HEALTH_ARCHITECTURE.md §6
   * for a real caveat about this metric's availability on some US Apple
   * Watch hardware. */
  bloodOxygen: z.number().min(0).max(100).optional(),
  /** Sleep efficiency (time asleep / time in bed), computed on-device from
   * raw HKCategoryValueSleepAnalysis samples — HealthKit has no single
   * "sleep score" field, same reasoning as Google Health's sleepScore. */
  sleepScore: z.number().min(0).max(100).optional(),
  steps: z.number().optional(),
  calories: z.number().optional(),
  activityLevel: z.number().min(0).max(100).optional(),
});

const ingestSchema = z.object({
  readings: z.array(readingSchema).min(1).max(500),
  /** Read off the most recent heart-rate sample's `HKDevice` — e.g.
   * "Apple Watch". No battery field exists: HealthKit's `HKDevice` has no
   * battery property at all (confirmed, see
   * docs/APPLE_HEALTH_ARCHITECTURE.md §6) — unlike Google Health's
   * `pairedDevices`, there is nothing to populate `batteryLevel`/
   * `batteryStatus` from for this provider. */
  deviceName: z.string().optional(),
});

export default async function appleHealthRoutes(app: FastifyInstance) {
  app.post('/integrations/apple-health/ingest', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = ingestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.userId!;
    const readings: NormalizedBiometricReading[] = parsed.data.readings.map((r) => ({
      provider: 'apple_health',
      userId,
      timestamp: r.timestamp,
      heartRate: r.heartRate,
      restingHeartRate: r.restingHeartRate,
      heartRateVariability: r.heartRateVariability,
      respiratoryRate: r.respiratoryRate,
      bloodOxygen: r.bloodOxygen,
      sleepScore: r.sleepScore,
      steps: r.steps,
      calories: r.calories,
      activityLevel: r.activityLevel,
    }));

    const connection = await wearableConnectionRepository.upsertTokenlessConnection(userId, 'APPLE_HEALTH');
    const inserted = await biometricReadingRepository.bulkInsert(readings);
    await wearableConnectionRepository.markSynced(connection.id);
    if (parsed.data.deviceName) {
      await wearableConnectionRepository.updateDeviceInfo(connection.id, { deviceName: parsed.data.deviceName });
    }

    if (inserted > 0) {
      const latest = await biometricReadingRepository.findLatestNormalized(userId);
      if (latest) await dispatchForReading(latest.reading, latest.id);
    }

    return reply.send({ readingsInserted: inserted });
  });

  app.delete('/integrations/apple-health', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await wearableConnectionRepository.findByUserAndProvider(request.userId!, 'APPLE_HEALTH');
    if (!connection) return reply.code(404).send({ error: 'No Apple Health connection for this user' });

    await wearableConnectionRepository.disconnect(connection.id, request.userId!);
    return reply.code(204).send();
  });
}
