import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { affectService } from '../../services/affectService.js';
import { AFFECT_SCALE_MIN, AFFECT_SCALE_MAX } from '@moodsync/ai';

/**
 * Mood check-ins and the model learned from them.
 * See docs/AFFECT_MODEL_ARCHITECTURE.md.
 */

const checkInSchema = z.object({
  valence: z.number().int().min(AFFECT_SCALE_MIN).max(AFFECT_SCALE_MAX),
  arousal: z.number().int().min(AFFECT_SCALE_MIN).max(AFFECT_SCALE_MAX),
  note: z.string().max(280).nullable().optional(),
});

export default async function affectRoutes(app: FastifyInstance) {
  app.post('/affect/check-ins', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = checkInSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const checkIn = await affectService.recordCheckIn(
      request.userId!,
      parsed.data.valence,
      parsed.data.arousal,
      parsed.data.note ?? null,
    );
    return reply.code(201).send({ checkIn });
  });

  app.get('/affect/check-ins', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send({ checkIns: await affectService.listCheckIns(request.userId!) });
  });

  app.delete('/affect/check-ins/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const removed = await affectService.removeCheckIn(request.userId!, id);
    if (removed === 0) return reply.code(404).send({ error: 'No such check-in' });
    return reply.code(204).send();
  });

  /** What MoodSync has actually learned — including, often, nothing. */
  app.get('/affect/model', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send(await affectService.getLearning(request.userId!));
  });
}
