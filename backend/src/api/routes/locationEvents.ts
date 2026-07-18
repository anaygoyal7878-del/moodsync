import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { locationEventRepository } from '@moodsync/database';
import { dispatchForLocationEvent } from '@moodsync/ai';

/**
 * Pushed by the iOS companion's LocationController.swift on a
 * CLCircularRegion enter/exit callback — see
 * docs/GEOFENCING_ARCHITECTURE.md. Same "device pushes, backend doesn't
 * poll" shape as the Apple Health ingest route, authenticated with the
 * same session JWT rather than a separate OAuth handshake (there is no
 * cloud location API to hold a token for).
 */
const locationEventSchema = z.object({
  type: z.enum(['ARRIVED', 'DEPARTED']),
  occurredAt: z.string().datetime().optional(),
});

export default async function locationEventRoutes(app: FastifyInstance) {
  app.post('/location-events', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = locationEventSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.userId!;
    const now = new Date();
    const occurredAt = parsed.data.occurredAt ? new Date(parsed.data.occurredAt) : now;

    await locationEventRepository.create(userId, parsed.data.type, occurredAt);
    const results = await dispatchForLocationEvent(userId, parsed.data.type, now);

    return reply.send({ dispatched: results });
  });
}
