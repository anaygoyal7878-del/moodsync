import { prisma } from '../prismaClient.js';

/** `UserPreferences` is a 1:1-with-`User` row created lazily on first
 * write (upsert) rather than at signup — most users never touch it, so
 * there's no reason to force a row into existence for everyone. Reads
 * treat a missing row the same as one with every field at its schema
 * default. */
export const userPreferencesRepository = {
  async getAutomationsPausedUntil(userId: string): Promise<Date | null> {
    const row = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { automationsPausedUntil: true },
    });
    return row?.automationsPausedUntil ?? null;
  },

  async setAutomationsPausedUntil(userId: string, pausedUntil: Date | null): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: { userId, automationsPausedUntil: pausedUntil },
      update: { automationsPausedUntil: pausedUntil },
    });
  },

  /** The notification-engine's quiet-hours/on-off check
   * (ai/src/notificationExecutor.ts) — a missing row means every field
   * is at its schema default (notificationsEnabled: true, no quiet
   * hours), same "absence, not failure" convention as everywhere else. */
  async getNotificationPreferences(userId: string): Promise<{
    notificationsEnabled: boolean;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    notificationDigestMode: 'IMMEDIATE' | 'HOURLY';
  }> {
    const row = await prisma.userPreferences.findUnique({
      where: { userId },
      select: { notificationsEnabled: true, quietHoursStart: true, quietHoursEnd: true, notificationDigestMode: true },
    });
    return {
      notificationsEnabled: row?.notificationsEnabled ?? true,
      quietHoursStart: row?.quietHoursStart ?? null,
      quietHoursEnd: row?.quietHoursEnd ?? null,
      notificationDigestMode: row?.notificationDigestMode ?? 'IMMEDIATE',
    };
  },

  async setNotificationPreferences(
    userId: string,
    input: {
      notificationsEnabled?: boolean | undefined;
      quietHoursStart?: string | null | undefined;
      quietHoursEnd?: string | null | undefined;
      notificationDigestMode?: 'IMMEDIATE' | 'HOURLY' | undefined;
    },
  ): Promise<void> {
    await prisma.userPreferences.upsert({
      where: { userId },
      create: {
        userId,
        notificationsEnabled: input.notificationsEnabled ?? true,
        quietHoursStart: input.quietHoursStart ?? null,
        quietHoursEnd: input.quietHoursEnd ?? null,
        notificationDigestMode: input.notificationDigestMode ?? 'IMMEDIATE',
      },
      update: {
        ...(input.notificationsEnabled !== undefined ? { notificationsEnabled: input.notificationsEnabled } : {}),
        ...(input.quietHoursStart !== undefined ? { quietHoursStart: input.quietHoursStart } : {}),
        ...(input.quietHoursEnd !== undefined ? { quietHoursEnd: input.quietHoursEnd } : {}),
        ...(input.notificationDigestMode !== undefined ? { notificationDigestMode: input.notificationDigestMode } : {}),
      },
    });
  },

  /** Read-only, single-field fetch — used by
   * ai/src/notificationExecutor.ts's `deliverNotification` on the hot
   * path of every dispatch outcome, so it doesn't pull quiet-hours
   * fields it doesn't need there. */
  async getNotificationDigestMode(userId: string): Promise<'IMMEDIATE' | 'HOURLY'> {
    const row = await prisma.userPreferences.findUnique({ where: { userId }, select: { notificationDigestMode: true } });
    return row?.notificationDigestMode ?? 'IMMEDIATE';
  },
};
