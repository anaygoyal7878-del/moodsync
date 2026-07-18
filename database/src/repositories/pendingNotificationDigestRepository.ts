import { prisma } from '../prismaClient.js';

export interface QueueDigestEntryInput {
  userId: string;
  title: string;
  body: string;
  ruleId?: string | undefined;
}

/** Backs a user's `notificationDigestMode: HOURLY` — entries queued here
 * by `ai/src/notificationExecutor.ts`'s `deliverNotification` instead of
 * writing a real `Notification` row immediately. Consumed and cleared by
 * `workers/src/notificationDigestWorker.ts`. */
export const pendingNotificationDigestRepository = {
  async create(input: QueueDigestEntryInput): Promise<void> {
    await prisma.pendingNotificationDigestEntry.create({
      data: { userId: input.userId, title: input.title, body: input.body, ruleId: input.ruleId ?? null },
    });
  },

  /** Every distinct user with at least one queued entry — what the
   * digest worker iterates, mirroring
   * `biometricReadingRepository.listUserIdsWithRecentReadings`'s
   * "only touch users with real data" shape. */
  async listUserIdsWithPendingEntries(): Promise<string[]> {
    const rows = await prisma.pendingNotificationDigestEntry.findMany({
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  },

  async listForUser(userId: string) {
    return prisma.pendingNotificationDigestEntry.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  },

  async deleteForUser(userId: string): Promise<number> {
    const result = await prisma.pendingNotificationDigestEntry.deleteMany({ where: { userId } });
    return result.count;
  },
};
