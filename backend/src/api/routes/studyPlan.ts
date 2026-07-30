import type { FastifyInstance } from 'fastify';
import { biometricReadingRepository, calendarConnectionRepository } from '@moodsync/database';
import { computeWellnessScores, computeLiveEnergyMeter, computeFreeBlocks, computeStudyWindowSuggestion } from '@moodsync/ai';
import { calendarService } from '../../services/calendarService.js';

const HISTORY_DAYS = 30;
/** The planner only ever suggests within a reasonable working day —
 * 8am to 9pm — not literal midnight-to-midnight free time. */
const PLANNING_DAY_START_HOUR = 8;
const PLANNING_DAY_END_HOUR = 21;

export default async function studyPlanRoutes(app: FastifyInstance) {
  app.get('/study-plan', { preHandler: app.authenticate }, async (request, reply) => {
    const connection = await calendarConnectionRepository.findByUser(request.userId!);
    if (!connection || connection.status !== 'ACTIVE') {
      return reply.send({ suggestion: null, calendarConnected: false });
    }

    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setHours(PLANNING_DAY_START_HOUR, 0, 0, 0);
    const dayEnd = new Date(now);
    dayEnd.setHours(PLANNING_DAY_END_HOUR, 0, 0, 0);
    // Never suggest a window that's already in the past.
    const windowStart = now > dayStart ? now : dayStart;

    const events = await calendarService.listUpcomingEvents(request.userId!, windowStart, dayEnd);
    const busy = events.filter((e) => !e.isAllDay).map((e) => ({ start: e.start, end: e.end }));
    const freeBlocks = computeFreeBlocks(busy, windowStart, dayEnd);

    const latest = await biometricReadingRepository.findLatestNormalized(request.userId!);
    let energyValue: number | null = null;
    if (latest) {
      const history = await biometricReadingRepository.listRecentNormalized(request.userId!, HISTORY_DAYS);
      const scores = computeWellnessScores(latest.reading, history.filter((r) => r.timestamp !== latest.reading.timestamp));
      energyValue = computeLiveEnergyMeter(scores, []).value;
    }

    const suggestion = computeStudyWindowSuggestion(freeBlocks, energyValue);
    return reply.send({ suggestion, calendarConnected: true });
  });
}
