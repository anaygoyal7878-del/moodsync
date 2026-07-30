import type { FastifyInstance } from 'fastify';
import { biometricReadingRepository, meditationSessionRepository, focusSessionRepository } from '@moodsync/database';
import { computeWalkingStreak, computeMeditationStreak, computeFocusStreak } from '@moodsync/ai';

/** Habit Engine — scoped to the habits with a real, already-existing
 * device/app signal: steps (walking), MeditationSession, and — since
 * Focus Sessions started being logged — focus. Hydration, sunlight,
 * reading, stretching and screen time all need manual logging that
 * doesn't exist; bedtime consistency needs sleep-session start times no
 * provider in this app gives us. Deliberately not built rather than
 * approximated — see docs/HABIT_ENGINE.md. */
export default async function habitRoutes(app: FastifyInstance) {
  app.get('/habits', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [readings, meditations, focusSessions] = await Promise.all([
      biometricReadingRepository.listRecentNormalized(userId, 30),
      meditationSessionRepository.listForUser(userId, 200),
      focusSessionRepository.listForUser(userId, 200),
    ]);

    const walking = computeWalkingStreak(readings);
    const meditation = computeMeditationStreak(meditations.map((s) => ({ completedAt: s.completedAt })));
    const focus = computeFocusStreak(focusSessions.map((s) => ({ completedAt: s.completedAt })));

    return reply.send({ habits: [walking, meditation, focus] });
  });
}
