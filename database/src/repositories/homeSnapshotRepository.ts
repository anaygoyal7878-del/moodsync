import { prisma } from '../prismaClient.js';
import type { HomeAccessoryCategory } from '@prisma/client';

export interface HomeSnapshotRoomInput {
  roomId: string;
  name: string;
  temperatureC?: number | null | undefined;
  humidityPct?: number | null | undefined;
  airQuality?: string | null | undefined;
}

export interface HomeSnapshotZoneInput {
  zoneId: string;
  name: string;
  roomIds: string[];
}

export interface HomeSnapshotAccessoryInput {
  accessoryId: string;
  name: string;
  roomId?: string | null | undefined;
  category: HomeAccessoryCategory;
  manufacturer?: string | null | undefined;
  model?: string | null | undefined;
  firmwareVersion?: string | null | undefined;
  reachable: boolean;
  batteryLevelPct?: number | null | undefined;
  statusValue?: string | null | undefined;
  isSecurityAccessory: boolean;
}

export interface HomeSnapshotSceneInput {
  sceneId: string;
  name: string;
  accessoryIds: string[];
}

export interface HomeSnapshotInput {
  homeId: string;
  homeName: string;
  isMatterHome: boolean;
  rooms: HomeSnapshotRoomInput[];
  zones: HomeSnapshotZoneInput[];
  accessories: HomeSnapshotAccessoryInput[];
  scenes: HomeSnapshotSceneInput[];
}

/** Pushed by the iOS companion (`HomeKitController.fetchHomeSnapshot()`)
 * on every sync — the backend can never query HomeKit directly, so this
 * is the "device pushes full state, backend caches the latest copy"
 * shape, same as Apple Health ingest. See
 * docs/HOME_SCENES_ARCHITECTURE.md. */
export const homeSnapshotRepository = {
  /** Replaces the user's snapshot wholesale — deletes and recreates
   * every child row in one transaction rather than diffing, since a
   * push always carries the complete current state. Existing
   * `isFavorite`/`lastRunAt`/`runCount` on scenes are carried forward by
   * matching on `sceneId` (HomeKit's own scene identifier, stable across
   * pushes) so favoriting/run-tracking survives a re-push. */
  async upsertSnapshot(userId: string, input: HomeSnapshotInput) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.homeSnapshot.findUnique({
        where: { userId },
        include: { scenes: { select: { sceneId: true, isFavorite: true, lastRunAt: true, runCount: true } } },
      });
      const priorSceneState = new Map(existing?.scenes.map((s) => [s.sceneId, s]) ?? []);

      const snapshot = await tx.homeSnapshot.upsert({
        where: { userId },
        create: { userId, homeId: input.homeId, homeName: input.homeName, isMatterHome: input.isMatterHome },
        update: { homeId: input.homeId, homeName: input.homeName, isMatterHome: input.isMatterHome, pushedAt: new Date() },
      });

      await tx.homeRoomSnapshot.deleteMany({ where: { homeSnapshotId: snapshot.id } });
      await tx.homeZoneSnapshot.deleteMany({ where: { homeSnapshotId: snapshot.id } });
      await tx.homeAccessorySnapshot.deleteMany({ where: { homeSnapshotId: snapshot.id } });
      await tx.homeSceneSnapshot.deleteMany({ where: { homeSnapshotId: snapshot.id } });

      if (input.rooms.length > 0) {
        await tx.homeRoomSnapshot.createMany({
          data: input.rooms.map((room) => ({
            homeSnapshotId: snapshot.id,
            roomId: room.roomId,
            name: room.name,
            temperatureC: room.temperatureC ?? null,
            humidityPct: room.humidityPct ?? null,
            airQuality: room.airQuality ?? null,
          })),
        });
      }
      if (input.zones.length > 0) {
        await tx.homeZoneSnapshot.createMany({
          data: input.zones.map((zone) => ({ homeSnapshotId: snapshot.id, ...zone })),
        });
      }
      if (input.accessories.length > 0) {
        await tx.homeAccessorySnapshot.createMany({
          data: input.accessories.map((accessory) => ({
            homeSnapshotId: snapshot.id,
            accessoryId: accessory.accessoryId,
            name: accessory.name,
            roomId: accessory.roomId ?? null,
            category: accessory.category,
            manufacturer: accessory.manufacturer ?? null,
            model: accessory.model ?? null,
            firmwareVersion: accessory.firmwareVersion ?? null,
            reachable: accessory.reachable,
            batteryLevelPct: accessory.batteryLevelPct ?? null,
            statusValue: accessory.statusValue ?? null,
            isSecurityAccessory: accessory.isSecurityAccessory,
          })),
        });
      }
      if (input.scenes.length > 0) {
        await tx.homeSceneSnapshot.createMany({
          data: input.scenes.map((scene) => {
            const prior = priorSceneState.get(scene.sceneId);
            return {
              homeSnapshotId: snapshot.id,
              ...scene,
              isFavorite: prior?.isFavorite ?? false,
              lastRunAt: prior?.lastRunAt ?? null,
              runCount: prior?.runCount ?? 0,
            };
          }),
        });
      }

      return snapshot;
    });
  },

  async getForUser(userId: string) {
    return prisma.homeSnapshot.findUnique({
      where: { userId },
      include: { rooms: true, zones: true, accessories: true, scenes: true },
    });
  },

  async findScene(userId: string, sceneId: string) {
    const snapshot = await prisma.homeSnapshot.findUnique({ where: { userId }, select: { id: true } });
    if (!snapshot) return null;
    return prisma.homeSceneSnapshot.findFirst({ where: { homeSnapshotId: snapshot.id, sceneId } });
  },

  /** Optimistic bump on a manual "Run Scene" button press — the actual
   * execution confirmation still only comes from the existing
   * `/devices/pending-commands/:id/complete` callback the iOS companion
   * hits after running the scene. See docs/HOME_SCENES_ARCHITECTURE.md. */
  async recordSceneRun(userId: string, sceneId: string) {
    const snapshot = await prisma.homeSnapshot.findUnique({ where: { userId }, select: { id: true } });
    if (!snapshot) return null;
    const scene = await prisma.homeSceneSnapshot.findFirst({ where: { homeSnapshotId: snapshot.id, sceneId } });
    if (!scene) return null;
    return prisma.homeSceneSnapshot.update({
      where: { id: scene.id },
      data: { lastRunAt: new Date(), runCount: { increment: 1 } },
    });
  },

  async setSceneFavorite(userId: string, sceneId: string, isFavorite: boolean) {
    const snapshot = await prisma.homeSnapshot.findUnique({ where: { userId }, select: { id: true } });
    if (!snapshot) return null;
    const scene = await prisma.homeSceneSnapshot.findFirst({ where: { homeSnapshotId: snapshot.id, sceneId } });
    if (!scene) return null;
    return prisma.homeSceneSnapshot.update({ where: { id: scene.id }, data: { isFavorite } });
  },
};
