import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appleCalendarSnapshotRepository, pendingCalendarWriteRepository } from '@moodsync/database';

/**
 * Apple Calendar via EventKit. Apple publishes no server-side calendar
 * API — same architecture as Apple Health (see
 * docs/APPLE_CALENDAR_ARCHITECTURE.md) — so this is "device pushes,
 * backend caches", identical shape to `POST /home/snapshot`. The iOS
 * companion's `EventKitReader` pushes today's event windows; the
 * connected-account's Google Calendar OAuth path (`calendar.ts`'s
 * sibling routes, unaffected by this file) is a completely separate
 * source `ai/src/calendarSignal.ts` also knows how to read.
 *
 * Writing works the same way, in reverse: EventKit has no server-side
 * write path either, so a create-event request queues a
 * `PendingCalendarWrite` row rather than being executed here — the
 * companion app's `CalendarWriteCoordinator` polls, executes locally,
 * and reports back. Same "device polls, executes, completes" shape as
 * `devices.ts`'s HomeKit pending-commands routes.
 */

const eventSchema = z.object({
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  isAllDay: z.boolean(),
});

const snapshotSchema = z.object({
  events: z.array(eventSchema).max(300),
});

const createWriteSchema = z.object({
  title: z.string().min(1).max(200),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
});

const completeWriteSchema = z.object({
  status: z.enum(['EXECUTED', 'FAILED']),
  failureReason: z.string().optional(),
});

export default async function calendarRoutes(app: FastifyInstance) {
  app.post('/calendar/apple/snapshot', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = snapshotSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await appleCalendarSnapshotRepository.upsert(request.userId!, parsed.data.events);
    return reply.code(204).send();
  });

  /** Queues a new event for the device to create — never called
   * directly by a client with free-form data; the only caller is
   * `messagingTools.ts`'s `executeConfirmedAction`, after a person has
   * confirmed the exact title/time in a text thread. Still re-validated
   * here (bounds enforced in `pendingCalendarWriteRepository.create`)
   * because a confirmation upstream is not a trust boundary. */
  app.post('/calendar/apple/pending-writes', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createWriteSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const write = await pendingCalendarWriteRepository.create({
      userId: request.userId!,
      title: parsed.data.title,
      startsAt: new Date(parsed.data.startsAt),
      endsAt: new Date(parsed.data.endsAt),
    });
    return reply.code(201).send({ write });
  });

  app.get('/calendar/apple/pending-writes', { preHandler: app.authenticate }, async (request, reply) => {
    const writes = await pendingCalendarWriteRepository.listPendingForUser(request.userId!);
    return reply.send({ writes });
  });

  app.post<{ Params: { id: string } }>(
    '/calendar/apple/pending-writes/:id/complete',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = completeWriteSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const marked = await pendingCalendarWriteRepository.markCompleted(request.params.id, request.userId!, parsed.data);
      if (!marked) return reply.code(404).send({ error: 'Pending write not found or already completed' });
      return reply.code(204).send();
    },
  );
}
