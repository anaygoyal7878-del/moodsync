import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { focusSessionRepository, biometricReadingRepository } from '@moodsync/database';
import { computeFocusSessionScore, suggestSmartBreak } from '@moodsync/ai';

/** Same client-reported trust model as meditation-sessions — the client
 * only calls this once its own countdown reaches zero. `durationMinutes`
 * is capped at 180 as a sanity bound (focus sessions run longer than
 * meditation's 120-minute cap). */
const createSchema = z.object({
  durationMinutes: z.number().int().min(1).max(180),
  startedAt: z.string().datetime(),
});

const breakSuggestionSchema = z.object({
  startedAt: z.string().datetime(),
  minutesSinceLastSuggestion: z.coerce.number().min(0).optional(),
});

function meanOf(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export default async function focusSessionRoutes(app: FastifyInstance) {
  app.post('/focus-sessions', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const startedAt = new Date(parsed.data.startedAt);
    const completedAt = new Date();
    const heartRateSamples = await biometricReadingRepository.listHeartRateInWindow(
      request.userId!,
      startedAt,
      completedAt,
    );
    const focusScore = computeFocusSessionScore(heartRateSamples);

    const session = await focusSessionRepository.create({
      userId: request.userId!,
      durationMinutes: parsed.data.durationMinutes,
      startedAt,
      focusScore,
    });

    return reply.code(201).send({ session });
  });

  /**
   * Smart Breaks — asks "should this session be interrupted right now,
   * and with what." Computed server-side because the decision needs the
   * session's heart-rate trend, which lives in the biometric store.
   * Returns `{ suggestion: null }` most of the time, by design (see
   * ai/src/smartBreaks.ts) — a prompt that always fires is a timer.
   */
  app.get('/focus-sessions/break-suggestion', { preHandler: app.authenticate }, async (request, reply) => {
    const parsed = breakSuggestionSchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const startedAt = new Date(parsed.data.startedAt);
    const now = new Date();
    const elapsedMinutes = (now.getTime() - startedAt.getTime()) / 60_000;
    if (elapsedMinutes < 0) return reply.code(400).send({ error: 'startedAt is in the future' });

    // Compare the first third of the session against the most recent
    // third — enough separation that a real drift shows up, without
    // needing a dense sample stream.
    const thirdMs = ((now.getTime() - startedAt.getTime()) / 3) | 0;
    const [early, recent] = await Promise.all([
      biometricReadingRepository.listHeartRateInWindow(request.userId!, startedAt, new Date(startedAt.getTime() + thirdMs)),
      biometricReadingRepository.listHeartRateInWindow(request.userId!, new Date(now.getTime() - thirdMs), now),
    ]);

    const suggestion = suggestSmartBreak({
      elapsedMinutes,
      earlyHeartRate: meanOf(early),
      recentHeartRate: meanOf(recent),
      minutesSinceLastSuggestion: parsed.data.minutesSinceLastSuggestion ?? null,
    });

    return reply.send({ suggestion });
  });

  app.get<{ Querystring: { limit?: string } }>(
    '/focus-sessions',
    { preHandler: app.authenticate },
    async (request, reply) => {
      const limit = Math.min(Number(request.query.limit) || 10, 50);
      const sessions = await focusSessionRepository.listForUser(request.userId!, limit);
      return reply.send({ sessions });
    },
  );
}
