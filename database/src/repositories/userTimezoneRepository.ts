import { prisma } from '../prismaClient.js';

/** Separate from backend's own userRepository.ts (auth-focused:
 * create/findByEmail/findById) because this needs to be callable from
 * the `ai` package too — dispatch.ts and notificationExecutor.ts
 * evaluate a user's `timeWindow` rules and quiet hours in their local
 * time, not the server process's local time. */
export const userTimezoneRepository = {
  async getTimezone(userId: string): Promise<string> {
    const row = await prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } });
    return row?.timezone ?? 'UTC';
  },

  async setTimezone(userId: string, timezone: string): Promise<void> {
    await prisma.user.update({ where: { id: userId }, data: { timezone } });
  },
};
