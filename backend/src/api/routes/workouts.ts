import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { workoutService } from '../../services/workoutService.js';

/**
 * Planned workouts. Everything is userId-scoped at the repository layer
 * with `updateMany`/`deleteMany`, so an id from another account
 * resolves to zero rows rather than to someone else's session.
 */

const createSchema = z.object({
  /** Local calendar date, YYYY-MM-DD. A date rather than a timestamp
   * because people plan "legs on Thursday" — see the schema comment. */
  scheduledFor: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  kind: z.enum(['STRENGTH', 'CARDIO', 'MOBILITY', 'SPORT', 'REST']),
  title: z.string().trim().min(1).max(120),
  plannedMinutes: z.number().int().min(1).max(600).nullable().optional(),
  /** Local minutes past midnight. Bounded server-side so a client can't
   * store an hour that doesn't exist and then never fire a reminder. */
  plannedAtMinutes: z.number().int().min(0).max(1439).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});

const completeSchema = z.object({
  actualMinutes: z.number().int().min(1).max(600).nullable().optional(),
  /** 1-5 perceived effort — the one outcome signal no wearable reports,
   * so it is collected by hand or not at all. */
  perceivedEffort: z.number().int().min(1).max(5).nullable().optional(),
});

export default async function workoutRoutes(app: FastifyInstance) {
  app.get('/workouts', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send(await workoutService.list(request.userId!));
  });

  app.post('/workouts', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const created = await workoutService.create(request.userId!, parsed.data);
    if (!created) return reply.code(400).send({ error: 'Invalid date' });
    return reply.code(201).send({ id: created.id });
  });

  app.post<{ Params: { id: string } }>('/workouts/:id/complete', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = completeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const ok = await workoutService.complete(
      request.userId!,
      request.params.id,
      parsed.data.actualMinutes ?? null,
      parsed.data.perceivedEffort ?? null,
    );
    if (!ok) return reply.code(404).send({ error: 'No such workout' });
    return reply.send({ completed: true });
  });

  app.delete<{ Params: { id: string } }>('/workouts/:id', { preHandler: app.authenticate }, async (request, reply) => {
    const ok = await workoutService.remove(request.userId!, request.params.id);
    if (!ok) return reply.code(404).send({ error: 'No such workout' });
    return reply.code(204).send();
  });
}
