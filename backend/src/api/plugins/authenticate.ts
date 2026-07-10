import fp from 'fastify-plugin';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../../auth/jwt.js';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
  }
}

/**
 * Registers `request.authenticate()`, a preHandler-able hook that verifies
 * the Bearer access token and attaches `request.userId`. Kept as an
 * explicit opt-in per-route hook (not a global hook) so public routes
 * (signup, login, health) are never accidentally gated by a stray
 * middleware ordering bug.
 */
export default fp(async function authenticatePlugin(app: FastifyInstance) {
  app.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Missing or malformed Authorization header' });
    }

    try {
      const { sub } = await verifyAccessToken(header.slice('Bearer '.length));
      request.userId = sub;
    } catch {
      return reply.code(401).send({ error: 'Invalid or expired access token' });
    }
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}
