import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { hueService, HueNotConfiguredError } from '../../../services/hueService.js';

const authorizeQuerySchema = z.object({ returnTo: z.string().url() });
const callbackQuerySchema = z.object({ code: z.string(), state: z.string() });
const lightStateSchema = z.object({
  on: z.boolean().optional(),
  brightness: z.number().min(0).max(100).optional(),
  colorXy: z.object({ x: z.number(), y: z.number() }).optional(),
  colorTemperatureMirek: z.number().optional(),
});

export default async function hueRoutes(app: FastifyInstance) {
  app.get('/integrations/hue/authorize', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = authorizeQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    try {
      const authorizationUrl = await hueService.buildAuthorizationRedirect(request.userId!, parsed.data.returnTo);
      return reply.send({ authorizationUrl });
    } catch (error) {
      if (error instanceof HueNotConfiguredError) return reply.code(503).send({ error: error.message });
      throw error;
    }
  });

  app.get('/integrations/hue/callback', async (request, reply) => {
    const parsed = callbackQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const { returnTo } = await hueService.handleCallback(parsed.data);
    return reply.redirect(returnTo);
  });

  app.post('/integrations/hue/sync-devices', { preHandler: app.authenticate }, async (request, reply) => {
    const deviceCount = await hueService.syncDevices(request.userId!);
    return reply.send({ deviceCount });
  });

  app.put<{ Params: { deviceId: string } }>(
    '/integrations/hue/devices/:deviceId/state',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = lightStateSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      await hueService.setLightState(request.userId!, request.params.deviceId, parsed.data);
      return reply.code(204).send();
    },
  );
}
