import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { calendarService, CalendarNotConfiguredError } from '../../../services/calendarService.js';
import { calendarConnectionRepository } from '@moodsync/database';

const authorizeQuerySchema = z.object({ returnTo: z.string().url() });
const callbackQuerySchema = z.object({ code: z.string(), state: z.string() });
const eventsQuerySchema = z.object({
  windowStart: z.string().datetime(),
  windowEnd: z.string().datetime(),
});

export default async function googleCalendarRoutes(app: FastifyInstance) {
  app.get('/integrations/google-calendar/authorize', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = authorizeQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const authorizationUrl = await calendarService.buildAuthorizationRedirect(request.userId!, parsed.data.returnTo);
      return reply.send({ authorizationUrl });
    } catch (error) {
      if (error instanceof CalendarNotConfiguredError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  app.get('/integrations/google-calendar/callback', async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { returnTo } = await calendarService.handleCallback(parsed.data);
    return reply.redirect(returnTo);
  });

  app.get('/integrations/google-calendar/events', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = eventsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const events = await calendarService.listUpcomingEvents(
        request.userId!,
        new Date(parsed.data.windowStart),
        new Date(parsed.data.windowEnd),
      );
      return reply.send({ events });
    } catch (error) {
      if (error instanceof CalendarNotConfiguredError) return reply.code(503).send({ error: error.message });
      if (error instanceof Error && error.message === 'No Google Calendar connection for this user') {
        return reply.code(404).send({ error: error.message });
      }
      throw error;
    }
  });

  app.delete('/integrations/google-calendar', { preHandler: app.authenticate }, async (request, reply) => {
    const disconnected = await calendarConnectionRepository.disconnect(request.userId!);
    if (!disconnected) return reply.code(404).send({ error: 'No Google Calendar connection for this user' });
    return reply.code(204).send();
  });
}
