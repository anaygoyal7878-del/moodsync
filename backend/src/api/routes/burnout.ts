import type { FastifyInstance } from 'fastify';
import { biometricReadingRepository, calendarConnectionRepository } from '@moodsync/database';
import { computeWellnessScores, checkBurnoutRisk } from '@moodsync/ai';
import { calendarService } from '../../services/calendarService.js';

const HISTORY_DAYS = 30;

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function restingHeartRateZ(latest: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const m = mean(history);
  const sd = stdev(history, m);
  if (sd === 0) return 0;
  return (latest - m) / sd;
}

/** On-demand version of the same check the proactive-notifications
 * worker runs periodically (workers/src/proactiveNotificationsWorker.ts)
 * — this route additionally reads today's calendar event count when the
 * user has Google Calendar connected, which the background worker can't
 * do yet (see that worker's comment). Live, not cached — every call
 * refreshes the calendar access token transparently if needed. */
export default async function burnoutRoutes(app: FastifyInstance) {
  app.get('/burnout-check', { preHandler: app.authenticate }, async (request, reply) => {
    const latest = await biometricReadingRepository.findLatestNormalized(request.userId!);
    if (!latest) return reply.send({ risk: null });

    const history = await biometricReadingRepository.listRecentNormalized(request.userId!, HISTORY_DAYS);
    const scores = computeWellnessScores(latest.reading, history.filter((r) => r.timestamp !== latest.reading.timestamp));

    const rhrHistory = history.map((r) => r.restingHeartRate).filter((v): v is number => typeof v === 'number');
    const hrZ = latest.reading.restingHeartRate !== undefined ? restingHeartRateZ(latest.reading.restingHeartRate, rhrHistory) : null;

    let calendarEventCountToday: number | null = null;
    const connection = await calendarConnectionRepository.findByUser(request.userId!);
    if (connection?.status === 'ACTIVE') {
      try {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
        const events = await calendarService.listUpcomingEvents(request.userId!, startOfDay, endOfDay);
        calendarEventCountToday = events.filter((e) => !e.isAllDay).length;
      } catch (error) {
        request.log.warn({ err: error }, 'burnout-check: calendar read failed, continuing without it');
      }
    }

    const risk = checkBurnoutRisk({
      sleepScore: scores.sleep.value,
      recoveryScore: scores.recovery.value,
      restingHeartRateZ: hrZ,
      calendarEventCountToday,
    });

    return reply.send({ risk });
  });
}
