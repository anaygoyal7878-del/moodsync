import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pendingDeviceCommandRepository } from '@moodsync/database';

const completeSchema = z.object({
  status: z.enum(['EXECUTED', 'FAILED']),
  failureReason: z.string().optional(),
});

/** The HomeKit-polling counterpart to the notification/dispatch engine —
 * see docs/HOMEKIT_ARCHITECTURE.md. HomeKit has no cloud API, so instead
 * of a server-side action executor (like Hue/Spotify), the iOS companion
 * app polls this route on open, executes each pending command locally via
 * the HomeKit framework, and reports the outcome back. */
export default async function deviceRoutes(app: FastifyInstance) {
  app.get('/devices/pending-commands', { preHandler: app.authenticate }, async (request, reply) => {
    const commands = await pendingDeviceCommandRepository.listPendingForUser(request.userId!);
    return reply.send({ commands });
  });

  app.post<{ Params: { id: string } }>(
    '/devices/pending-commands/:id/complete',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = completeSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const marked = await pendingDeviceCommandRepository.markCompleted(request.params.id, request.userId!, parsed.data);
      if (!marked) return reply.code(404).send({ error: 'Pending command not found or already completed' });
      return reply.code(204).send();
    },
  );
}
