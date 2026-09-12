import type { FastifyInstance } from 'fastify';
import { scentService } from '../../services/scentService.js';

/**
 * Fragrance. One read-only route — a cologne suggestion is advice a
 * person carries out, so there is nothing here to accept, execute or
 * undo. The scent channel is `manual_only` everywhere else in the app
 * for the same reason.
 */
export default async function scentRoutes(app: FastifyInstance) {
  app.get('/scent', { preHandler: app.authenticate }, async (request, reply) => {
    return reply.send(await scentService.getBriefing(request.userId!));
  });
}
