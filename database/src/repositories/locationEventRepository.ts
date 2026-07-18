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
};
