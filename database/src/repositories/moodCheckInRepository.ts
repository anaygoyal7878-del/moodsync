import { prisma } from '../prismaClient.js';

/** How many check-ins the model trainer reads. Wide enough that a
 * long-running account keeps learning from a full season of data,
 * bounded so one query can't grow without limit. */
export const MAX_CHECK_INS_FOR_TRAINING = 400;

export const moodCheckInRepository = {
  async create(params: { userId: string; valence: number; arousal: number; note?: string | null }) {
    return prisma.moodCheckIn.create({
      data: {
        userId: params.userId,
        valence: params.valence,
        arousal: params.arousal,
        note: params.note ?? null,
      },
    });
  },

  /** Oldest-first, which is the order the feature extractor wants: each
   * check-in's baseline is built only from readings before it. */
  async listForUser(userId: string, limit = MAX_CHECK_INS_FOR_TRAINING) {
    const rows = await prisma.moodCheckIn.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.reverse();
  },

  async countForUser(userId: string): Promise<number> {
    return prisma.moodCheckIn.count({ where: { userId } });
  },

  async remove(userId: string, id: string): Promise<number> {
    const { count } = await prisma.moodCheckIn.deleteMany({ where: { id, userId } });
    return count;
  },
};
