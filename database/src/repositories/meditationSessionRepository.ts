import { prisma } from '../prismaClient.js';

export interface CreateMeditationSessionInput {
  userId: string;
  durationMinutes: number;
  ambience: string | null;
  startedAt: Date;
}

/** Completed guided-timer sessions — see MeditationSession's schema
 * comment for the trust model (client-reported on timer completion,
 * same as every other client-side wellness action here). */
export const meditationSessionRepository = {
  async create(input: CreateMeditationSessionInput) {
    return prisma.meditationSession.create({
      data: {
        userId: input.userId,
        durationMinutes: input.durationMinutes,
        ambience: input.ambience,
        startedAt: input.startedAt,
      },
    });
  },

  async listForUser(userId: string, limit: number) {
    return prisma.meditationSession.findMany({
      where: { userId },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });
  },
};
