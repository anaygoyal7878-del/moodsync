import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appleCalendarSnapshotRepository } from '@moodsync/database';

/**
 * Apple Calendar via EventKit. Apple publishes no server-side calendar
 * API — same architecture as Apple Health (see
 * docs/APPLE_CALENDAR_ARCHITECTURE.md) — so this is "device pushes,
 * backend caches", identical shape to `POST /home/snapshot`. The iOS
 * companion's `EventKitReader` pushes today's event windows; the
 * connected-account's Google Calendar OAuth path (`calendar.ts`'s
 * sibling routes, unaffected by this file) is a completely separate
 * source `ai/src/calendarSignal.ts` also knows how to read.
 */

const eventSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isAllDay: z.boolean(),
});

const snapshotSchema = z.object({
  events: z.array(eventSchema).max(300),
});

export default async function calendarRoutes(app: FastifyInstance) {
  app.post('/calendar/apple/snapshot', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = snapshotSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await appleCalendarSnapshotRepository.upsert(request.userId!, parsed.data.events);
    return reply.code(204).send();
  });
}
