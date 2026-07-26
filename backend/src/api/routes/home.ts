import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { homeSnapshotRepository, pendingDeviceCommandRepository } from '@moodsync/database';

const HOME_ACCESSORY_CATEGORIES = [
  'LOCK',
  'GARAGE_DOOR',
  'ALARM_SYSTEM',
  'SMOKE_DETECTOR',
  'LEAK_SENSOR',
  'WINDOW_COVERING',
  'DOORBELL',
  'OUTLET_OR_SWITCH',
  'LIGHT',
  'THERMOSTAT_OR_SENSOR',
  'OTHER',
] as const;

const roomSchema = z.object({
  roomId: z.string(),
  name: z.string(),
  temperatureC: z.number().nullable().optional(),
  humidityPct: z.number().nullable().optional(),
  airQuality: z.string().nullable().optional(),
});

const zoneSchema = z.object({
  zoneId: z.string(),
  name: z.string(),
  roomIds: z.array(z.string()),
});

const accessorySchema = z.object({
  accessoryId: z.string(),
  name: z.string(),
  roomId: z.string().nullable().optional(),
  category: z.enum(HOME_ACCESSORY_CATEGORIES),
  manufacturer: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  firmwareVersion: z.string().nullable().optional(),
  reachable: z.boolean(),
  batteryLevelPct: z.number().int().nullable().optional(),
  statusValue: z.string().nullable().optional(),
  isSecurityAccessory: z.boolean(),
});

const sceneSchema = z.object({
  sceneId: z.string(),
  name: z.string(),
  accessoryIds: z.array(z.string()),
});

const snapshotSchema = z.object({
  homeId: z.string(),
  homeName: z.string(),
  isMatterHome: z.boolean(),
  rooms: z.array(roomSchema),
  zones: z.array(zoneSchema),
  accessories: z.array(accessorySchema),
  scenes: z.array(sceneSchema),
});

/** Serves the cached Apple Home Scenes surface — Home Dashboard, Scene
 * Manager, Room View, Device Management, Home Safety all read from
 * `GET /home`. The backend can never query HomeKit directly (no cloud
 * API), so `POST /home/snapshot` is how the iOS companion's
 * `HomeKitController.fetchHomeSnapshot()` keeps this cache current —
 * same "device pushes, backend caches" shape as Apple Health ingest.
 * See docs/HOME_SCENES_ARCHITECTURE.md. */
export default async function homeRoutes(app: FastifyInstance) {
  app.post('/home/snapshot', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = snapshotSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    await homeSnapshotRepository.upsertSnapshot(request.userId!, parsed.data);
    return reply.code(204).send();
  });

  app.get('/home', { preHandler: app.authenticate }, async (request, reply) => {
    const snapshot = await homeSnapshotRepository.getForUser(request.userId!);
    return reply.send({ snapshot });
  });

  app.post<{ Params: { id: string } }>(
    '/home/scenes/:id/run',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const scene = await homeSnapshotRepository.findScene(request.userId!, request.params.id);
      if (!scene) return reply.code(404).send({ error: 'Scene not found' });

      // Same queue plumbing a rule-triggered `homekit.run_scene` action
      // uses (ai/src/actionExecutors.ts) — a manual "Run Scene" button
      // press is just a one-off, ruleId-less version of the same
      // dispatch. runCount/lastRunAt are bumped optimistically here;
      // real confirmation still only comes from the existing
      // /devices/pending-commands/:id/complete callback.
      await pendingDeviceCommandRepository.create({
        userId: request.userId!,
        provider: 'HOMEKIT',
        action: { type: 'homekit.run_scene', provider: 'homekit', params: { sceneId: scene.sceneId, sceneName: scene.name } },
      });
      const updated = await homeSnapshotRepository.recordSceneRun(request.userId!, request.params.id);
      return reply.send({ scene: updated });
    },
  );

  app.patch<{ Params: { id: string }; Body: { isFavorite?: boolean } }>(
    '/home/scenes/:id/favorite',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const parsed = z.object({ isFavorite: z.boolean() }).safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

      const updated = await homeSnapshotRepository.setSceneFavorite(request.userId!, request.params.id, parsed.data.isFavorite);
      if (!updated) return reply.code(404).send({ error: 'Scene not found' });
      return reply.send({ scene: updated });
    },
  );
}
