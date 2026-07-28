import { prisma } from '../prismaClient.js';

export interface CreateCaffeineLogInput {
  userId: string;
  mg: number;
  loggedAt: Date;
}

/** First manual wellness-event log in this codebase — see CaffeineLog's
 * schema comment. Feeds the Live Energy Meter's temporary-boost
 * component (ai/src/energyMeter.ts). */
export const caffeineLogRepository = {
  async create(input: CreateCaffeineLogInput) {
    return prisma.caffeineLog.create({
      data: { userId: input.userId, mg: input.mg, loggedAt: input.loggedAt },
    });
  },

  /** Only what the energy meter's decay window actually needs — recent
   * entries within `sinceHours` of now, not the user's full history. */
  async listRecentForUser(userId: string, sinceHours: number) {
    return prisma.caffeineLog.findMany({
      where: { userId, loggedAt: { gte: new Date(Date.now() - sinceHours * 60 * 60_000) } },
      orderBy: { loggedAt: 'desc' },
    });
  },
};
