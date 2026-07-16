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
