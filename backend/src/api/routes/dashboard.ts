import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  wearableConnectionRepository,
  smartHomeConnectionRepository,
  biometricReadingRepository,
  automationRuleRepository,
  automationExecutionLogRepository,
  insightRepository,
} from '@moodsync/database';
import { computeTrends, computeWellnessTrends, computeAutomationEffectiveness, computeWellnessScores } from '@moodsync/ai';

const historyQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(30).default(7) });
const insightsQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(30).default(14) });
const insightsHistoryQuerySchema = z.object({
  period: z.enum(['DAILY', 'WEEKLY']).default('WEEKLY'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export default async function dashboardRoutes(app: FastifyInstance) {
  app.get('/connections', { preHandler: app.authenticate }, async (request, reply) => {
    const [wearables, smartHome] = await Promise.all([
      wearableConnectionRepository.listForUser(request.userId!),
      smartHomeConnectionRepository.listForUser(request.userId!),
    ]);

    return reply.send({
      wearables: wearables.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt,
        deviceName: c.deviceName,
        batteryLevel: c.batteryLevel,
        batteryStatus: c.batteryStatus,
      })),
      smartHome: smartHome.map((c) => ({
        id: c.id,
        provider: c.provider,
        status: c.status,
        lastSyncedAt: c.lastSyncedAt,
        devices: c.connectedDevices.map((d) => ({
          id: d.id,
          externalDeviceId: d.externalDeviceId,
          name: d.name,
          deviceType: d.deviceType,
          room: d.room,
          isOnline: d.isOnline,
        })),
      })),
    });
  });

  app.get('/biometrics/latest', { preHandler: app.authenticate }, async (request, reply) => {
    const latest = await biometricReadingRepository.findLatestNormalized(request.userId!);
    return reply.send({ reading: latest?.reading ?? null });
  });

  app.get('/biometrics/history', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = historyQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const readings = await biometricReadingRepository.listRecentNormalized(request.userId!, parsed.data.days);
    return reply.send({ readings });
  });

  app.get('/insights', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = insightsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const userId = request.userId!;
    const [readingsWithId, rules, logs] = await Promise.all([
      biometricReadingRepository.listRecentNormalizedWithId(userId, parsed.data.days),
      automationRuleRepository.listForUser(userId),
      automationExecutionLogRepository.listForUser(userId, 200),
    ]);

    const readings = readingsWithId.map((r) => r.reading);
    const trends = computeTrends(readings);
    const wellnessTrends = computeWellnessTrends(readings);
    const automationEffectiveness = computeAutomationEffectiveness({
      rules,
      logs: logs.map((l) => ({ ruleId: l.ruleId, triggerReadingId: l.triggerReadingId, outcome: l.outcome })),
      readings: readingsWithId,
    });

    return reply.send({ trends, wellnessTrends, automationEffectiveness });
  });

  /** Persisted history — distinct from `/insights` above, which computes
   * trends on-the-fly from raw readings every request. These rows come
   * from `workers/src/weeklyReportWorker.ts`'s periodic run (see
   * docs/DECISION_ENGINE_ROADMAP.md's "Weekly reports, persisted
   * insights" entry) and only exist once that worker has run for a
   * given user at least once — an empty array here means "no report has
   * run yet," not an error. */
  app.get('/insights/history', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = insightsHistoryQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const insights = await insightRepository.listForUser(request.userId!, parsed.data.period, parsed.data.limit);
    return reply.send({ insights });
  });

  /** Current wellness scores (ai/src/wellness.ts) for the dashboard's
   * WellnessScoreCard — computed from the latest reading plus a 30-day
   * trailing baseline window for the scores that need one (stress,
   * heuristic recovery). Returns every score as `null` (not an error)
   * when there's no reading yet, same "absence, not failure" convention
   * as every other dashboard section. */
  app.get('/wellness', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    if (!latest) return reply.send({ scores: null });

    const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
    const scores = computeWellnessScores(
      latest.reading,
      history.filter((r) => r.timestamp !== latest.reading.timestamp),
    );
    return reply.send({ scores });
  });
}
