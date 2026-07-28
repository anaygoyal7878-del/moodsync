import { prisma } from '../prismaClient.js';

export const notificationRepository = {
  async create(entry: { userId: string; title: string; body: string; ruleId?: string | undefined }) {
    return prisma.notification.create({
      data: {
        userId: entry.userId,
        title: entry.title,
        body: entry.body,
        ruleId: entry.ruleId ?? null,
      },
    });
  },

  async listForUser(userId: string, limit = 50) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /** Suppresses a repeat proactive/smart notification (e.g. "Recovery is
   * unusually high today") from firing again within `sinceHours` if the
   * exact same title already went out — a simple, real dedupe without a
   * dedicated notification-type/log table, matching the title-based
   * dedupe `recommendationRepository.hasBeenSuggested` already uses for
   * a similar problem. */
  async hasRecentTitle(userId: string, title: string, sinceHours: number): Promise<boolean> {
    const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
    const existing = await prisma.notification.findFirst({
      where: { userId, title, createdAt: { gte: since } },
      select: { id: true },
    });
    return existing !== null;
  },

  /** `updateMany` (not `update`) so the userId ownership check is
   * enforced by the database query itself — same pattern as
   * automationRuleRepository.update. */
  async markRead(id: string, userId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id, userId },
      data: { readAt: new Date() },
    });
    return result.count > 0;
  },
};
