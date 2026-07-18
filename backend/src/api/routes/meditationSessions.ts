import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { meditationSessionRepository } from '@moodsync/database';

/** Logs a completed guided-timer meditation session — the client (see
 * frontend's LuxuryMeditation.tsx) only calls this once its own
 * countdown reaches zero, same client-reported trust model as other
 * wellness actions in this app (no server-side timer enforcement).
 * `durationMinutes` is capped at 120 purely as a sanity bound, not a
 * real product limit. */
const createSchema = z.object({
  durationMinutes: z.number().int().min(1).max(120),
  ambience: z.enum(['rain', 'forest', 'ocean', 'noise']).nullable().optional(),
  startedAt: z.string().datetime(),
});

export default async function meditationSessionRoutes(app: FastifyInstance) {
  app.post('/meditation-sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const session = await meditationSessionRepository.create({
      userId: request.userId!,
      durationMinutes: parsed.data.durationMinutes,
      ambience: parsed.data.ambience ?? null,
      startedAt: new Date(parsed.data.startedAt),
    });

    return reply.code(201).send({ session });
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/meditation-sessions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit) || 10, 50);
      const sessions = await meditationSessionRepository.listForUser(request.userId!, limit);
      return reply.send({ sessions });
    },
  );
}
