import { prisma } from '../prismaClient.js';

/**
 * Per-user cap on remembered facts. Without one, a long-running
 * account would slowly stuff every future prompt with years of trivia
 * — cost that grows forever and relevance that doesn't. When a new
 * fact pushes a user over the cap, the oldest fact is dropped, not the
 * newest: what the model just decided was worth remembering wins over
 * whatever it thought was worth remembering longest ago.
 */
export const MAX_FACTS_PER_USER = 30;

export const messagingMemoryRepository = {
  /** Records a new fact and prunes back down to the cap if needed. */
  async add(userId: string, fact: string): Promise<void> {
    await prisma.messagingMemoryFact.create({ data: { userId, fact } });

    const count = await prisma.messagingMemoryFact.count({ where: { userId } });
    if (count <= MAX_FACTS_PER_USER) return;

    const overflow = await prisma.messagingMemoryFact.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: count - MAX_FACTS_PER_USER,
      select: { id: true },
    });
    await prisma.messagingMemoryFact.deleteMany({ where: { id: { in: overflow.map((f) => f.id) } } });
  },

  /** Most recent facts first — the ones a model call to `remember_fact`
   * chose most recently are the ones most likely to still be relevant. */
  async listForUser(userId: string, limit = 20) {
    return prisma.messagingMemoryFact.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },
};
