import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { spotifyService, SpotifyNotConfiguredError } from '../../../services/spotifyService.js';
import { smartHomeConnectionRepository } from '@moodsync/database';

const authorizeQuerySchema = z.object({ returnTo: z.string().url() });
const callbackQuerySchema = z.object({ code: z.string(), state: z.string() });

export default async function spotifyRoutes(app: FastifyInstance) {
  app.get('/integrations/spotify/authorize', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = authorizeQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const authorizationUrl = await spotifyService.buildAuthorizationRedirect(request.userId!, parsed.data.returnTo);
      return reply.send({ authorizationUrl });
    } catch (error) {
      if (error instanceof SpotifyNotConfiguredError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  // Public: Spotify redirects the user's browser here directly, with no
  // Authorization header available — same as every other provider's
  // callback in this codebase.
  app.get('/integrations/spotify/callback', async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { returnTo } = await spotifyService.handleCallback(parsed.data);
    return reply.redirect(returnTo);
  });

  app.delete('/integrations/spotify', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(request.userId!, 'SPOTIFY');
    if (!connection) return reply.code(404).send({ error: 'No Spotify connection for this user' });

    await smartHomeConnectionRepository.disconnect(connection.id, request.userId!);
    return reply.code(204).send();
  });
}
