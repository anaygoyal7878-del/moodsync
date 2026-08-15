import { prisma } from '../prismaClient.js';
import type { LocationEventType } from '@moodsync/shared';

/** ARRIVED/DEPARTED events pushed by the iOS companion's
 * LocationController.swift — see docs/GEOFENCING_ARCHITECTURE.md. The
 * backend route persists a row here before calling
 * ai/src/dispatch.ts's dispatchForLocationEvent. */
export const locationEventRepository = {
  async create(userId: string, type: LocationEventType, occurredAt: Date): Promise<void> {
    await prisma.locationEvent.create({ data: { userId, type, occurredAt } });
  },

  /** Most recent transition, for "is the user home right now" — the
   * Adaptive Environment engine refuses to adjust an empty house (see
   * ai/src/environmentGuards.ts). Returns null when the user has never
   * pushed a geofence event, which must be read as "unknown", not as
   * "away": a user without the iOS companion would otherwise never get
   * a recommendation. */
  async findLatestForUser(userId: string) {
    return prisma.locationEvent.findFirst({
      where: { userId },
      orderBy: { occurredAt: 'desc' },
    });
  },
};
