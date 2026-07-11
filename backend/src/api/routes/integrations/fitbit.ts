import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { fitbitService, FitbitNotConfiguredError } from '../../../services/fitbitService.js';
import { wearableConnectionRepository } from '@moodsync/database';

const authorizeQuerySchema = z.object({ returnTo: z.string().url() });
const callbackQuerySchema = z.object({ code: z.string(), state: z.string() });

// Route segment is `google-health` (not `fitbit`) to match the technical
// backing and the already-registered redirect URI — see
// GOOGLE_HEALTH_REDIRECT_URI in .env.example. The package/service/UI layer
// still say "Fitbit", since that's the wearable brand users recognize.
export default async function fitbitRoutes(app: FastifyInstance) {
  app.get('/integrations/google-health/authorize', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = authorizeQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const authorizationUrl = await fitbitService.buildAuthorizationRedirect(request.userId!, parsed.data.returnTo);
      return reply.send({ authorizationUrl });
    } catch (error) {
      if (error instanceof FitbitNotConfiguredError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  app.get('/integrations/google-health/callback', async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { returnTo } = await fitbitService.handleCallback(parsed.data);
    return reply.redirect(returnTo);
  });

  app.post('/integrations/google-health/sync', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await wearableConnectionRepository.findByUserAndProvider(request.userId!, 'GOOGLE_HEALTH');
    if (!connection) return reply.code(404).send({ error: 'No Fitbit (Google Health) connection for this user' });

    const inserted = await fitbitService.syncConnection(connection.id, request.userId!);
    return reply.send({ readingsInserted: inserted });
  });

  app.delete('/integrations/google-health', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await wearableConnectionRepository.findByUserAndProvider(request.userId!, 'GOOGLE_HEALTH');
    if (!connection) return reply.code(404).send({ error: 'No Fitbit (Google Health) connection for this user' });

    await wearableConnectionRepository.disconnect(connection.id, request.userId!);
    return reply.code(204).send();
  });
}
