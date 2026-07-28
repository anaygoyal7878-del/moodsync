import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { focusSessionRepository, biometricReadingRepository } from '@moodsync/database';
import { computeFocusSessionScore } from '@moodsync/ai';

/** Same client-reported trust model as meditation-sessions — the client
 * only calls this once its own countdown reaches zero. `durationMinutes`
 * is capped at 180 as a sanity bound (focus sessions run longer than
 * meditation's 120-minute cap). */
const createSchema = z.object({
  durationMinutes: z.number().int().min(1).max(180),
  startedAt: z.string().datetime(),
});

export default async function focusSessionRoutes(app: FastifyInstance) {
  app.post('/focus-sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const startedAt = new Date(parsed.data.startedAt);
    const completedAt = new Date();
    const heartRateSamples = await biometricReadingRepository.listHeartRateInWindow(
      request.userId!,
      startedAt,
      completedAt,
    );
    const focusScore = computeFocusSessionScore(heartRateSamples);

    const session = await focusSessionRepository.create({
      userId: request.userId!,
      durationMinutes: parsed.data.durationMinutes,
      startedAt,
      focusScore,
    });

    return reply.code(201).send({ session });
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/focus-sessions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit) || 10, 50);
      const sessions = await focusSessionRepository.listForUser(request.userId!, limit);
      return reply.send({ sessions });
    },
  );
}
