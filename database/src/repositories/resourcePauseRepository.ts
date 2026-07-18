import { prisma } from '../prismaClient.js';

/** Per-provider manual override, alongside `userPreferencesRepository`'s
 * global `automationsPausedUntil` — see `ResourcePause` in schema.prisma
 * and `ai/src/dispatch.ts`'s per-action pause check. */
export const resourcePauseRepository = {
  /** Every active (not-yet-expired) pause for a user, keyed by
   * resourceKey — fetched once per dispatch pass rather than per-action,
   * since a rule can have multiple actions. */
  async listActiveForUser(userId: string, now: Date = new Date()): Promise<Map<string, Date>> {
    const rows = await prisma.resourcePause.findMany({
      where: { userId, pausedUntil: { gt: now } },
      select: { resourceKey: true, pausedUntil: true },
    });
    return new Map(rows.map((r) => [r.resourceKey, r.pausedUntil]));
  },

  async set(userId: string, resourceKey: string, pausedUntil: Date): Promise<void> {
    await prisma.resourcePause.upsert({
      where: { userId_resourceKey: { userId, resourceKey } },
      create: { userId, resourceKey, pausedUntil },
      update: { pausedUntil },
    });
  },

  async clear(userId: string, resourceKey: string): Promise<void> {
    await prisma.resourcePause.deleteMany({ where: { userId, resourceKey } });
  },
};
