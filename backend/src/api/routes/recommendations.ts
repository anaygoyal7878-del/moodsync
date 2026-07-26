import type { FastifyInstance } from 'fastify';
import {
  automationRuleRepository,
  biometricReadingRepository,
  homeSnapshotRepository,
  musicPlayLogRepository,
  pendingDeviceCommandRepository,
  recommendationRepository,
} from '@moodsync/database';
import { computeWellnessTrends, generateRecommendations, type PlaylistSkipStat } from '@moodsync/ai';

/** How far back to look for wellness trend data when deciding whether to
 * suggest a new rule — same window `/api/insights` defaults to. */
const TREND_WINDOW_DAYS = 14;

/** How many of a playlist's most recent checked plays the skip-rate
 * heuristic looks at — matches `MIN_SKIP_SAMPLE_SIZE` in
 * ai/src/recommendations.ts so the sample never falls short of what the
 * heuristic itself requires. */
const SKIP_STAT_SAMPLE_SIZE = 10;

/** Builds one PlaylistSkipStat per (rule, playlist) pair the user has
 * actually played via a spotify.play_playlist action — computed here
 * (impure, DB-touching) so ai/src/recommendations.ts stays pure/DB-free,
 * same split as computeWellnessTrends/computeAutomationEffectiveness. */
async function computePlaylistSkipStats(userId: string, rules: Awaited<ReturnType<typeof automationRuleRepository.listForUser>>): Promise<PlaylistSkipStat[]> {
  const playlistUris = await musicPlayLogRepository.listDistinctPlaylistsForUser(userId);
  const stats: PlaylistSkipStat[] = [];

  for (const playlistUri of playlistUris) {
    const recentPlays = await musicPlayLogRepository.listRecentCheckedForPlaylist(userId, playlistUri, SKIP_STAT_SAMPLE_SIZE);
    if (recentPlays.length === 0) continue;

    const rule = rules.find((r) => r.id === recentPlays[0]!.ruleId);
    if (!rule) continue; // rule was deleted since these plays happened

    const skippedCount = recentPlays.filter((p) => p.likedSignal === false).length;
    stats.push({
      ruleId: rule.id,
      ruleName: rule.name,
      playlistUri,
      skipRate: skippedCount / recentPlays.length,
      sampleSize: recentPlays.length,
    });
  }

  return stats;
}

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
    const [readings, rules, snapshot] = await Promise.all([
      biometricReadingRepository.listRecentNormalized(userId, TREND_WINDOW_DAYS),
      automationRuleRepository.listForUser(userId),
      homeSnapshotRepository.getForUser(userId),
    ]);
    const wellnessTrends = computeWellnessTrends([...readings].reverse());
    const playlistSkipStats = await computePlaylistSkipStats(userId, rules);
    const cachedScenes = snapshot?.scenes.map((s) => ({ sceneId: s.sceneId, name: s.name })) ?? [];
    const candidates = generateRecommendations({ wellnessTrends, existingRules: rules, playlistSkipStats, cachedScenes });

    for (const candidate of candidates) {
      if (await recommendationRepository.hasBeenSuggested(userId, candidate.title)) continue;
      await recommendationRepository.create({
        userId,
        title: candidate.title,
        description: candidate.description,
        suggestedActions:
          candidate.kind === 'edit-rule'
            ? { kind: 'edit-rule', ruleId: candidate.ruleId }
            : candidate.kind === 'run-scene'
              ? { kind: 'run-scene', sceneId: candidate.sceneId, sceneName: candidate.sceneName }
              : { kind: 'template', templateId: candidate.templateId },
      });
    }

    const recommendations = await recommendationRepository.listForUser(userId, 'PENDING');
    return reply.send({ recommendations });
  });

  app.post<{ Params: { id: string } }>(
    '/recommendations/:id/accept',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const userId = request.userId!;
      const recommendation = await recommendationRepository.findById(request.params.id, userId);
      const updated = await recommendationRepository.updateStatus(request.params.id, userId, 'ACCEPTED');
      if (!updated) return reply.code(404).send({ error: 'Recommendation not found or already responded to' });

      // A run-scene recommendation is a one-shot action, not a rule to
      // adopt/edit — accepting it queues the same homekit.run_scene
      // command a manual Scene Manager "Run" button press does (see
      // backend/src/api/routes/home.ts), clearly the user's own explicit
      // action (accepting an AI-generated suggestion), never automatic.
      const suggestedActions = recommendation?.suggestedActions as { kind?: string; sceneId?: string; sceneName?: string } | undefined;
      if (suggestedActions?.kind === 'run-scene' && suggestedActions.sceneId && suggestedActions.sceneName) {
        await pendingDeviceCommandRepository.create({
          userId,
          provider: 'HOMEKIT',
          action: { type: 'homekit.run_scene', provider: 'homekit', params: { sceneId: suggestedActions.sceneId, sceneName: suggestedActions.sceneName } },
        });
        await homeSnapshotRepository.recordSceneRun(userId, suggestedActions.sceneId);
      }

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
