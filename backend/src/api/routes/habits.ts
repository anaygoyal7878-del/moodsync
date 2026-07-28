import type { FastifyInstance } from 'fastify';
import { biometricReadingRepository, meditationSessionRepository } from '@moodsync/database';
import { computeWalkingStreak, computeMeditationStreak } from '@moodsync/ai';

/** Habit Engine — scoped to the two habits with a real, already-existing
 * device/app signal (steps, MeditationSession). Hydration, sunlight,
 * reading, stretching, screen time, and bedtime consistency all need
 * manual logging that doesn't exist yet — deliberately not built this
 * round, see docs/HABIT_ENGINE.md. */
export default async function habitRoutes(app: FastifyInstance) {
  app.get('/habits', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [readings, sessions] = await Promise.all([
      biometricReadingRepository.listRecentNormalized(userId, 30),
      meditationSessionRepository.listForUser(userId, 200),
    ]);

    const walking = computeWalkingStreak(readings);
    const meditation = computeMeditationStreak(sessions.map((s) => ({ completedAt: s.completedAt })));

    return reply.send({ habits: [walking, meditation] });
  });
}
