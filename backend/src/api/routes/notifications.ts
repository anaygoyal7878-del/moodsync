import type { FastifyInstance } from 'fastify';
import { notificationRepository } from '@moodsync/database';

export default async function notificationRoutes(app: FastifyInstance) {
  app.get('/notifications', { preHandler: app.authenticate }, async (request, reply) => {
    const limitParam = (request.query as { limit?: string }).limit;
    const limit = limitParam ? Math.min(Number(limitParam) || 50, 200) : 50;
    const notifications = await notificationRepository.listForUser(request.userId!, limit);
    return reply.send({ notifications });
  });

  app.post<{ Params: { id: string } }>(
    '/notifications/:id/read',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const marked = await notificationRepository.markRead(request.params.id, request.userId!);
      if (!marked) return reply.code(404).send({ error: 'Notification not found' });
      return reply.code(204).send();
    },
  );
}
