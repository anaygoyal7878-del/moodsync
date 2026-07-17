import type { FastifyInstance } from 'fastify';
import { automationRuleRepository, biometricReadingRepository, recommendationRepository } from '@moodsync/database';
import { computeWellnessTrends, generateRecommendations } from '@moodsync/ai';

/** How far back to look for wellness trend data when deciding whether to
 * suggest a new rule — same window `/api/insights` defaults to. */
const TREND_WINDOW_DAYS = 14;

export default async function recommendationRoutes(app: FastifyInstance) {
  /**
   * Generates fresh candidates from the user's current wellness trends
   * and existing rules (ai/src/recommendations.ts), persists any that
   * aren't already pending (dedupe by title), then returns every
   * PENDING recommendation. Safe to call on every dashboard load — it's
   * not creating duplicate rows for a suggestion the user hasn't acted
   * on yet, and a suggestion that's already ACCEPTED/DISMISSED never
   * regenerates.
   */
  app.get('/recommendations', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [readings, rules] = await Promise.all([
      biometricReadingRepository.listRecentNormalized(userId, TREND_WINDOW_DAYS),
      automationRuleRepository.listForUser(userId),
    ]);
    const wellnessTrends = computeWellnessTrends([...readings].reverse());
    const candidates = generateRecommendations({ wellnessTrends, existingRules: rules });

    for (const candidate of candidates) {
      if (await recommendationRepository.hasBeenSuggested(userId, candidate.title)) continue;
      await recommendationRepository.create({
        userId,
        title: candidate.title,
        description: candidate.description,
        suggestedActions: { templateId: candidate.templateId },
      });
    }

    const recommendations = await recommendationRepository.listForUser(userId, 'PENDING');
    return reply.send({ recommendations });
  });

  app.post<{ Params: { id: string } }>(
    '/recommendations/:id/accept',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const updated = await recommendationRepository.updateStatus(request.params.id, request.userId!, 'ACCEPTED');
      if (!updated) return reply.code(404).send({ error: 'Recommendation not found or already responded to' });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/recommendations/:id/dismiss',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const updated = await recommendationRepository.updateStatus(request.params.id, request.userId!, 'DISMISSED');
      if (!updated) return reply.code(404).send({ error: 'Recommendation not found or already responded to' });
      return reply.code(204).send();
    },
  );
}
