import type { FastifyInstance } from 'fastify';
import { userRepository } from '../../repositories/userRepository.js';

export default async function meRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: app.authenticate }, async (request, reply) => {
    const user = await userRepository.findById(request.userId!);
    if (!user) return reply.code(404).send({ error: 'User not found' });

    return reply.send({
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      timezone: user.timezone,
      createdAt: user.createdAt,
    });
  });
}
