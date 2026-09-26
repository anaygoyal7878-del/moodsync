import { prisma } from '../prismaClient.js';

/**
 * Health profile and weight history. Every read and write is scoped by
 * userId; there is no method that takes a profile id alone, so one
 * account can never reach another's measurements.
 */
export const healthProfileRepository = {
  async get(userId: string) {
    return prisma.healthProfile.findUnique({ where: { userId } });
  },

  /**
   * Upserts the profile. `undefined` leaves a field untouched and `null`
   * clears it — the distinction is what lets someone remove their birth
   * date without also having to re-send their height.
   */
  async upsert(userId: string, input: { birthDate?: Date | null; heightCm?: number | null }) {
    const data: { birthDate?: Date | null; heightCm?: number | null } = {};
    if (input.birthDate !== undefined) data.birthDate = input.birthDate;
    if (input.heightCm !== undefined) data.heightCm = input.heightCm;
    return prisma.healthProfile.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  },

  async addWeight(userId: string, weightKg: number, recordedAt: Date = new Date()) {
    return prisma.weightEntry.create({ data: { userId, weightKg, recordedAt } });
  },

  /** Most recent first, bounded — a weight log is small, but an unbounded
   * read is still an unbounded read. */
  async listWeights(userId: string, limit = 120) {
    return prisma.weightEntry.findMany({ where: { userId }, orderBy: { recordedAt: 'desc' }, take: limit });
  },

  async removeWeight(userId: string, id: string): Promise<boolean> {
    const result = await prisma.weightEntry.deleteMany({ where: { id, userId } });
    return result.count > 0;
  },

  /**
   * Deletes everything this model holds for a user — the profile and the
   * whole weight log. Health data should be removable on its own, without
   * deleting the account, which is the reason it lives in its own tables.
   */
  async deleteAll(userId: string) {
    await prisma.$transaction([
      prisma.weightEntry.deleteMany({ where: { userId } }),
      prisma.healthProfile.deleteMany({ where: { userId } }),
    ]);
  },
};
