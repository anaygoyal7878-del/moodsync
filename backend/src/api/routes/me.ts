import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userTimezoneRepository } from '@moodsync/database';
import { userRepository } from '../../repositories/userRepository.js';

/** `Intl.supportedValuesOf('timeZone')` returns the runtime's real IANA
 * timezone database (Node 18+) — validating against it rather than a
 * regex means we reject typos/garbage but accept anything a real user's
 * browser (`Intl.DateTimeFormat().resolvedOptions().timeZone`) would
 * actually send. */
const updateMeSchema = z.object({
  timezone: z
    .string()
    .refine((tz) => Intl.supportedValuesOf('timeZone').includes(tz), { message: 'Not a recognized IANA timezone' })
    .optional(),
});

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

  app.patch('/me', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = updateMeSchema.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    if (parsed.data.timezone) {
      await userTimezoneRepository.setTimezone(request.userId!, parsed.data.timezone);
    }

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
