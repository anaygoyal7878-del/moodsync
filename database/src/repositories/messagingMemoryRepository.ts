import { prisma } from '../prismaClient.js';

/**
 * Per-user cap on remembered facts. Without one, a long-running
 * account would slowly stuff every future prompt with years of trivia
 * — cost that grows forever and relevance that doesn't. When a new
 * fact pushes a user over the cap, the *least reinforced* fact is
 * dropped (oldest as the tiebreak), not simply the oldest: something
 * the model has independently re-concluded four times has earned its
 * place over something it noted once and never returned to.
 */
export const MAX_FACTS_PER_USER = 30;

/**
 * Collapses a fact to its comparable form so a re-save is recognized
 * as reinforcement rather than stored as a near-duplicate.
 *
 * Deliberately conservative — case and punctuation only, no stemming
 * or fuzzy matching. "Prefers evening workouts." and "prefers evening
 * workouts" are the same claim and should merge; deciding that
 * "prefers evening workouts" and "likes training after work" are the
 * same claim is a judgment this layer has no business making, and
 * getting it wrong silently destroys a real memory.
 *
 * Must stay in lockstep with the SQL backfill in
 * migrations/20260820160000_messaging_fact_reinforcement.
 */
export function normalizeFact(fact: string): string {
  return fact
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const messagingMemoryRepository = {
  /**
   * Records a fact, or reinforces it if this user already has it, then
   * prunes back to the cap if needed.
   */
  async add(userId: string, fact: string): Promise<void> {
    const normalized = normalizeFact(fact);
    if (!normalized) return;

    await prisma.messagingMemoryFact.upsert({
      where: { userId_normalized: { userId, normalized } },
      // Keeps the original wording rather than overwriting with the
      // rephrase — the first time something was worth saying is
      // usually the cleanest statement of it, and rewriting a stored
      // memory on every repeat makes the record less stable, not more.
      update: { reinforcedCount: { increment: 1 }, lastReinforcedAt: new Date() },
      create: { userId, fact, normalized },
    });

    const count = await prisma.messagingMemoryFact.count({ where: { userId } });
    if (count <= MAX_FACTS_PER_USER) return;

    const overflow = await prisma.messagingMemoryFact.findMany({
      where: { userId },
      orderBy: [{ reinforcedCount: 'asc' }, { lastReinforcedAt: 'asc' }],
      take: count - MAX_FACTS_PER_USER,
      select: { id: true },
    });
    await prisma.messagingMemoryFact.deleteMany({ where: { id: { in: overflow.map((f) => f.id) } } });
  },

  /**
   * Facts ranked the way they'll be spent: most-reinforced first, most
   * recent as the tiebreak. Ordering here rather than in the caller
   * means a `take` limit truncates the *least* valuable facts, not an
   * arbitrary slice.
   */
  async listForUser(userId: string, limit = 20) {
    return prisma.messagingMemoryFact.findMany({
      where: { userId },
      orderBy: [{ reinforcedCount: 'desc' }, { lastReinforcedAt: 'desc' }],
      take: limit,
    });
  },
};
