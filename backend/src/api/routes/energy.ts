import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { biometricReadingRepository, caffeineLogRepository } from '@moodsync/database';
import { computeWellnessScores, computeLiveEnergyMeter } from '@moodsync/ai';

/** Same trailing window `computeWellnessScores` elsewhere in this app
 * uses for baseline z-scoring (see dashboard.ts's insights route). */
const WELLNESS_HISTORY_DAYS = 30;

const logCaffeineSchema = z.object({
  mg: z.number().int().min(1).max(1000),
  loggedAt: z.string().datetime().optional(),
});

export default async function energyRoutes(app: FastifyInstance) {
  app.get('/energy/live', { preHandler: app.authenticate }, async (request, reply) => {
    const [latest, history, caffeineLogs] = await Promise.all([
      biometricReadingRepository.findLatestNormalized(request.userId!),
      biometricReadingRepository.listRecentNormalized(request.userId!, WELLNESS_HISTORY_DAYS),
      caffeineLogRepository.listRecentForUser(request.userId!, 5),
    ]);

    if (!latest) return reply.send({ energy: { value: null, basis: 'heuristic', caffeineBoost: 0 } });

    const scores = computeWellnessScores(latest.reading, history);
    const energy = computeLiveEnergyMeter(
      scores,
      caffeineLogs.map((log) => ({ mg: log.mg, loggedAt: log.loggedAt })),
    );
    return reply.send({ energy });
  });

  app.post('/caffeine-logs', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = logCaffeineSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const log = await caffeineLogRepository.create({
      userId: request.userId!,
      mg: parsed.data.mg,
      loggedAt: parsed.data.loggedAt ? new Date(parsed.data.loggedAt) : new Date(),
    });
    return reply.code(201).send({ log });
  });

  app.get('/caffeine-logs', { preHandler: app.authenticate }, async (request, reply) => {
    const logs = await caffeineLogRepository.listRecentForUser(request.userId!, 24);
    return reply.send({ logs });
  });
}
