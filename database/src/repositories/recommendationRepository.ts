import { prisma } from '../prismaClient.js';

export interface CreateRecommendationInput {
  userId: string;
  title: string;
  description: string;
  /** `{ templateId: string }` — see ai/src/recommendations.ts's doc
   * comment for why this points at a rule template rather than storing
   * a raw action blueprint. Typed `unknown` here (Json at rest) so this
   * repository doesn't need to import ai/src's types. */
  suggestedActions: unknown;
}

export const recommendationRepository = {
  /** Bulk insert for the batch the recommendation heuristic produces in
   * one pass. `skipDuplicates` is not set because there's no unique
   * constraint on (userId, title) to skip on — the caller filters
   * against `listSuggestedTitles` first, and two concurrent requests
   * racing to insert the same title was already possible with the
   * per-candidate `create` this replaced. */
  async createMany(inputs: CreateRecommendationInput[]) {
    return prisma.recommendation.createMany({
      data: inputs.map((input) => ({
        userId: input.userId,
        title: input.title,
        description: input.description,
        suggestedActions: input.suggestedActions as object,
      })),
    });
  },

  async listForUser(userId: string, status?: 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'EXPIRED', limit = 50) {
    return prisma.recommendation.findMany({
      where: { userId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /** True if a recommendation with this exact title already exists for
   * this user, in ANY status — not just PENDING. The dedupe check `GET
   * /api/recommendations` uses before persisting a freshly-generated
   * candidate. Checking only PENDING would let a suggestion the user
   * just dismissed or accepted come right back on the next page load
   * (the underlying wellness trend that triggered it hasn't gone away
   * yet), defeating the entire accept/dismiss lifecycle — an
   * ACCEPTED/DISMISSED row means this exact suggestion has already been
   * surfaced and responded to, so it should never resurface. `EXPIRED`
   * is the one status meant to eventually allow a fresh resurfacing,
   * once something sets it (nothing does yet — see
   * docs/DECISION_ENGINE_ROADMAP.md). */
  /** Every title already suggested to this user, in one query.
   *
   * Exists because the caller checks a whole batch of candidates at
   * once. This replaced a per-title `hasBeenSuggested` existence check,
   * which meant one round trip per candidate on an endpoint every
   * dashboard load hits. All three non-terminal statuses count as
   * "seen", not just PENDING: a suggestion the user already accepted or
   * dismissed must not come back. */
  async listSuggestedTitles(userId: string): Promise<Set<string>> {
    const rows = await prisma.recommendation.findMany({
      where: { userId, status: { in: ['PENDING', 'ACCEPTED', 'DISMISSED'] } },
      select: { title: true },
    });
    return new Set(rows.map((r) => r.title));
  },

  async findById(id: string, userId: string) {
    return prisma.recommendation.findFirst({ where: { id, userId } });
  },

  /** `updateMany` (not `update`) so the userId ownership check is
   * enforced by the database query itself — same pattern as
   * notificationRepository.markRead. */
  async updateStatus(id: string, userId: string, status: 'ACCEPTED' | 'DISMISSED'): Promise<boolean> {
    const result = await prisma.recommendation.updateMany({
      where: { id, userId, status: 'PENDING' },
      data: { status, respondedAt: new Date() },
    });
    return result.count > 0;
  },
};
