import { prisma } from '../prismaClient.js';

export interface CreateFocusSessionInput {
  userId: string;
  durationMinutes: number;
  startedAt: Date;
  focusScore: number | null;
}

/** Completed Focus Sessions — see FocusSession's schema comment for the
 * trust model (client-reported timer, logged only on natural
 * completion, same as MeditationSession). */
export const focusSessionRepository = {
  async create(input: CreateFocusSessionInput) {
    return prisma.focusSession.create({
      data: {
        userId: input.userId,
        durationMinutes: input.durationMinutes,
        startedAt: input.startedAt,
        focusScore: input.focusScore,
      },
    });
  },

  async listForUser(userId: string, limit: number) {
    return prisma.focusSession.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
  },
};
