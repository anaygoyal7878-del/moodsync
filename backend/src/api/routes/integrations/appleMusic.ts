import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { appleMusicService, AppleMusicNotConfiguredError } from '../../../services/appleMusicService.js';

const connectBodySchema = z.object({
  musicUserToken: z.string().min(1),
  storefront: z.string().optional(),
});

export default async function appleMusicRoutes(app: FastifyInstance) {
  /** MusicKit JS needs this to call `MusicKit.configure()` in the
   * browser before it can do anything at all — see
   * appleMusicService.issueDeveloperToken's doc comment. Authenticated
   * (a MoodSync session, not an Apple identity) purely to keep this off
   * the public internet; the token itself identifies MoodSync's app to
   * Apple, not the individual user. */
  app.get('/integrations/apple-music/developer-token', { preHandler: app.authenticate }, async (_request, reply) => {
    try {
      const { token, expiresInSeconds } = await appleMusicService.issueDeveloperToken();
      return reply.send({ developerToken: token, expiresInSeconds });
    } catch (error) {
      if (error instanceof AppleMusicNotConfiguredError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  /** Called after MusicKit JS's client-side `music.authorize()` succeeds
   * — there is no server-side authorize/callback redirect for Apple
   * Music (unlike every OAuth provider in this codebase), so this is the
   * only place the resulting Music User Token ever reaches the backend. */
  app.post('/integrations/apple-music/connect', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = connectBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await appleMusicService.connect(request.userId!, parsed.data.musicUserToken, parsed.data.storefront);
    return reply.code(204).send();
  });

  app.delete('/integrations/apple-music', { preHandler: app.authenticate }, async (request, reply) => {
    const disconnected = await appleMusicService.disconnect(request.userId!);
    if (!disconnected) return reply.code(404).send({ error: 'No Apple Music connection for this user' });
    return reply.code(204).send();
  });
}
