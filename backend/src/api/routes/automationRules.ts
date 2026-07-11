import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { automationRuleRepository, automationExecutionLogRepository } from '@moodsync/database';

const biometricFieldSchema = z.enum([
  'heartRate',
  'restingHeartRate',
  'sleepScore',
  'recoveryScore',
  'stressLevel',
  'activityLevel',
  'steps',
  'calories',
]);

const conditionSchema = z.object({
  field: biometricFieldSchema,
  operator: z.enum(['lt', 'lte', 'gt', 'gte', 'eq']),
  value: z.number(),
});

const actionSchema = z.object({
  type: z.enum([
    'hue.set_scene',
    'hue.set_brightness',
    'hue.set_color_temperature',
    'spotify.play_playlist',
    'notification.reduce_intensity',
  ]),
  provider: z.enum(['hue', 'spotify', 'ecobee', 'notification']),
  params: z.record(z.string(), z.unknown()),
});

const createRuleSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  conditions: z.array(conditionSchema).min(1, 'A rule needs at least one condition'),
  actions: z.array(actionSchema).min(1, 'A rule needs at least one action'),
  cooldownMinutes: z.number().int().min(0).max(1440).default(30),
});

const updateRuleSchema = createRuleSchema.partial();

export default async function automationRuleRoutes(app: FastifyInstance) {
  app.get('/automation-rules', { preHandler: app.authenticate }, async (request, reply) => {
    const rules = await automationRuleRepository.listForUser(request.userId!);
    return reply.send({ rules });
  });

  app.post('/automation-rules', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createRuleSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const rule = await automationRuleRepository.create({ userId: request.userId!, ...parsed.data });
    return reply.code(201).send({ rule });
  });

  app.patch<{ Params: { id: string } }>(
    '/automation-rules/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = updateRuleSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const rule = await automationRuleRepository.update(request.params.id, request.userId!, parsed.data);
      if (!rule) return reply.code(404).send({ error: 'Automation rule not found' });
      return reply.send({ rule });
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/automation-rules/:id',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const deleted = await automationRuleRepository.delete(request.params.id, request.userId!);
      if (!deleted) return reply.code(404).send({ error: 'Automation rule not found' });
      return reply.code(204).send();
    },
  );

  app.get('/automation-history', { preHandler: app.authenticate }, async (request, reply) => {
    const limitParam = (request.query as { limit?: string }).limit;
    const limit = limitParam ? Math.min(Number(limitParam) || 50, 200) : 50;
    const entries = await automationExecutionLogRepository.listForUser(request.userId!, limit);
    return reply.send({ entries });
  });
}
