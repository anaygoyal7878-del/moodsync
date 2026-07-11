import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { wearableConnectionRepository, smartHomeConnectionRepository, biometricReadingRepository } from '@moodsync/database';

const historyQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(30).default(7) });

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/connections', { preHandler: app.authenticate }, async (request, reply) => {
    const [wearables, smartHome] = await Promise.all([
      wearableConnectionRepository.listForUser(request.userId!),
      smartHomeConnectionRepository.listForUser(request.userId!),
    ]);

    return reply.send({
      wearables: wearables.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt,
      })),
      smartHome: smartHome.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt,
        devices: c.connectedDevices.map((d) => ({
          id: d.id,
          externalDeviceId: d.externalDeviceId,
          name: d.name,
          deviceType: d.deviceType,
          room: d.room,
          isOnline: d.isOnline,
        })),
      })),
    });
  });

  app.get('/biometrics/latest', { preHandler: app.authenticate }, async (request, reply) => {
    const latest = await biometricReadingRepository.findLatestNormalized(request.userId!);
    return reply.send({ reading: latest?.reading ?? null });
  });

  app.get('/biometrics/history', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const readings = await biometricReadingRepository.listRecentNormalized(request.userId!, parsed.data.days);
    return reply.send({ readings });
  });
}
