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
};
