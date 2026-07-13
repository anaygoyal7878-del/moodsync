import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { wearableConnectionRepository, biometricReadingRepository } from '@moodsync/database';
import { dispatchForReading } from '@moodsync/ai';
import type { NormalizedBiometricReading } from '@moodsync/shared';

/**
 * Amazfit has no self-serve cloud OAuth API (Zepp Health's "Data
 * Cooperation" API is gated to corporate partnerships — see
 * docs/INTEGRATIONS_RESEARCH.md). Instead, a Zepp OS Mini Program
 * (zepp/MoodSyncCompanion) reads sensors on-watch and its Side Service
 * pushes here, authenticated with the same session JWT the web app uses
 * (the Mini Program logs into the same MoodSync account via
 * POST /api/auth/login) — identical shape to the Apple Health ingest
 * route, see docs/AMAZFIT_ARCHITECTURE.md.
 */
const readingSchema = z.object({
  timestamp: z.string().datetime(),
  heartRate: z.number().optional(),
  /** Sleep score 0-100, computed on-device from the Sleep sensor's
   * `getInfo()` result — Zepp OS's Sleep sensor already returns a
   * `score` field directly, unlike Apple Health/Google Health which
   * require on-device computation from raw samples. */
  sleepScore: z.number().min(0).max(100).optional(),
  steps: z.number().optional(),
});

const ingestSchema = z.object({
  readings: z.array(readingSchema).min(1).max(500),
  /** No confirmed device-name sensor API was found for Zepp OS (unlike
   * Google Health's `pairedDevices` or Apple Health's `HKDevice`) — left
   * optional and unpopulated by the Mini Program rather than guessed at,
   * see docs/AMAZFIT_ARCHITECTURE.md §6. */
  deviceName: z.string().optional(),
});

export default async function amazfitRoutes(app: FastifyInstance) {
  app.post('/integrations/amazfit/ingest', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = ingestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.userId!;
    const readings: NormalizedBiometricReading[] = parsed.data.readings.map((r) => ({
      provider: 'amazfit',
      userId,
      timestamp: r.timestamp,
      heartRate: r.heartRate,
      sleepScore: r.sleepScore,
      steps: r.steps,
    }));

    const connection = await wearableConnectionRepository.upsertTokenlessConnection(userId, 'AMAZFIT');
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

  app.delete('/integrations/amazfit', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await wearableConnectionRepository.findByUserAndProvider(request.userId!, 'AMAZFIT');
    if (!connection) return reply.code(404).send({ error: 'No Amazfit connection for this user' });

    await wearableConnectionRepository.disconnect(connection.id, request.userId!);
    return reply.code(204).send();
  });
}
