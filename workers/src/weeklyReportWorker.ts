/**
 * Persists weekly `Insight` rows — the schema modeled this since before
 * Milestone 10, but nothing ever wrote to it; `/api/insights` computed
 * trends on-the-fly per request instead (see
 * docs/DECISION_ENGINE_ROADMAP.md's "Weekly reports, persisted insights"
 * entry). Run this on a weekly cron cadence via
 * `npm run start:weekly-report -w workers` — same "periodic tick, only
 * touch users with real data" shape as
 * `workers/src/scheduledDispatch.ts`.
 */
import { biometricReadingRepository, insightRepository, meditationSessionRepository, pendingDeviceCommandRepository } from '@moodsync/database';
import { computeWeeklyInsights, computeWellnessTrends, computeBiggestImprovement, computeWalkingStreak, computeMeditationStreak } from '@moodsync/ai';

const REPORT_WINDOW_DAYS = 14; // 7 days "current" vs. 7 days "previous", same half-split insights.ts already uses.
const SESSION_WINDOW_DAYS = 7; // Focus Sessions / habit consistency are "this week," not the 14-day trend window.

const periodEnd = new Date();
const periodStart = new Date(periodEnd.getTime() - REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000);

const userIds = await biometricReadingRepository.listUserIdsWithRecentReadings(REPORT_WINDOW_DAYS);
console.log(`[weekly-report] Found ${userIds.length} user(s) with recent readings`);

let totalRows = 0;
let anyFailed = false;
for (const userId of userIds) {
  try {
    const readingsOldestFirst = [...(await biometricReadingRepository.listRecentNormalized(userId, REPORT_WINDOW_DAYS))].reverse();
    const rows = computeWeeklyInsights({ userId, periodStart, periodEnd, readingsOldestFirst });

    // "Biggest Improvement" — a single headline row on top of the
    // per-metric trends already computed above, same wellnessTrends
    // input, no separate pass over readings.
    const biggestImprovement = computeBiggestImprovement(computeWellnessTrends(readingsOldestFirst));
    if (biggestImprovement) {
      rows.push({
        userId,
        period: 'WEEKLY',
        metric: 'biggestImprovement',
        periodStart,
        periodEnd,
        value: biggestImprovement.magnitude,
        summary: `${biggestImprovement.label} improved the most this week.`,
      });
    }

    // "Focus Sessions" — count of completed HomeKit scene runs whose
    // scene name matches "focus" this week. A real, grounded proxy
    // (actual scene-run history), not a fabricated session-tracking
    // feature — see docs/WEEKLY_AI_REPORT.md.
    const sceneRuns = await pendingDeviceCommandRepository.listCompletedSceneRunsForUser(userId, SESSION_WINDOW_DAYS);
    const focusSessionCount = sceneRuns.filter((run) => {
      const name = typeof run.action.params.sceneName === 'string' ? run.action.params.sceneName.toLowerCase() : '';
      return name.includes('focus');
    }).length;
    if (focusSessionCount > 0) {
      rows.push({
        userId,
        period: 'WEEKLY',
        metric: 'focusSessionCount',
        periodStart,
        periodEnd,
        value: focusSessionCount,
        summary: `You ran a Focus scene ${focusSessionCount} time${focusSessionCount === 1 ? '' : 's'} this week.`,
      });
    }

    // "Best Habit" — whichever of the two Habit Engine habits (walking,
    // meditation — see docs/HABIT_ENGINE.md for why only these two) has
    // the higher 30-day consistency, only surfaced if it actually has
    // real data.
    const meditationSessions = await meditationSessionRepository.listForUser(userId, 200);
    const walking = computeWalkingStreak(readingsOldestFirst);
    const meditation = computeMeditationStreak(meditationSessions.map((s) => ({ completedAt: s.completedAt })));
    const bestHabit = [walking, meditation]
      .filter((h) => h.consistencyPct !== null)
      .sort((a, b) => b.consistencyPct! - a.consistencyPct!)[0];
    if (bestHabit) {
      const label = bestHabit.habit === 'walking' ? 'Morning Walks' : 'Meditation';
      rows.push({
        userId,
        period: 'WEEKLY',
        metric: 'bestHabit',
        periodStart,
        periodEnd,
        value: bestHabit.consistencyPct!,
        summary: `${label} — your most consistent habit (${bestHabit.consistencyPct}% of the last 30 days).`,
      });
    }

    const inserted = await insightRepository.createMany(rows);
    totalRows += inserted;
    if (inserted > 0) console.log(`[weekly-report] user=${userId} rows=${inserted}`);
  } catch (error) {
    anyFailed = true;
    console.error(`[weekly-report] user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[weekly-report] Done. ${totalRows} insight row(s) persisted across ${userIds.length} user(s).`);
process.exit(anyFailed ? 1 : 0);
