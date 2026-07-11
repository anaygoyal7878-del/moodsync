import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { whoopService, WhoopNotConfiguredError } from '../../../services/whoopService.js';
import { wearableConnectionRepository } from '@moodsync/database';

const authorizeQuerySchema = z.object({ returnTo: z.string().url() });
const callbackQuerySchema = z.object({ code: z.string(), state: z.string() });

export default async function whoopRoutes(app: FastifyInstance) {
  // Returns the authorization URL rather than issuing a redirect directly:
  // this is a Bearer-token API, and a browser's top-level navigation to
  // start the OAuth flow can't carry a custom Authorization header, so the
  // frontend fetches this JSON (with its access token) and then navigates
  // the browser to the URL itself.
  app.get('/integrations/whoop/authorize', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = authorizeQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const authorizationUrl = await whoopService.buildAuthorizationRedirect(request.userId!, parsed.data.returnTo);
      return reply.send({ authorizationUrl });
    } catch (error) {
      if (error instanceof WhoopNotConfiguredError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  // Public: WHOOP redirects the user's browser here directly, with no
  // Authorization header available. Trust comes from the signed state
  // token (see lib/oauthState.ts), not a Bearer token.
  app.get('/integrations/whoop/callback', async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { returnTo } = await whoopService.handleCallback(parsed.data);
    return reply.redirect(returnTo);
  });

  app.post('/integrations/whoop/sync', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await wearableConnectionRepository.findByUserAndProvider(request.userId!, 'WHOOP');
    if (!connection) return reply.code(404).send({ error: 'No WHOOP connection for this user' });

    const inserted = await whoopService.syncConnection(connection.id, request.userId!);
    return reply.send({ readingsInserted: inserted });
  });

  app.delete('/integrations/whoop', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await wearableConnectionRepository.findByUserAndProvider(request.userId!, 'WHOOP');
    if (!connection) return reply.code(404).send({ error: 'No WHOOP connection for this user' });

    await wearableConnectionRepository.disconnect(connection.id, request.userId!);
    return reply.code(204).send();
  });
}
