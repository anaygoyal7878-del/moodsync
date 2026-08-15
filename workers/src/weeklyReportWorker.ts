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
import {
  biometricReadingRepository,
  insightRepository,
  meditationSessionRepository,
  notificationRepository,
  pendingDeviceCommandRepository,
} from '@moodsync/database';
import {
  computeWeeklyInsights,
  computeWellnessTrends,
  computeBiggestImprovement,
  computeWalkingStreak,
  computeMeditationStreak,
  computeWellnessScores,
  correlateOccurrences,
  describeFinding,
  deliverNotification,
  sendProactiveInsight,
} from '@moodsync/ai';

/** Wide enough that this worker's own weekly cron cadence is the real
 * dedupe (a run a day or two off-schedule won't double-send), narrow
 * enough that a genuinely new week's headline always gets through. */
const WEEKLY_HEADLINE_DEDUPE_HOURS = 6 * 24;

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

    // "Wellness Memory" — what actually correlates with lower stress for
    // *this* user, from real before/after comparisons around meditation
    // sessions and scene runs (ai/src/wellnessMemory.ts). Stress is
    // scored per-reading the same way computeWellnessTrends does above
    // (each reading's own prior history as its baseline), not
    // recomputed from scratch. Surfaced only when correlateOccurrences
    // found at least MIN_SAMPLE_SIZE usable before/after pairs — no
    // finding from one or two coincidences.
    const stressPoints = readingsOldestFirst
      .map((reading, i) => ({
        at: new Date(reading.timestamp),
        value: computeWellnessScores(reading, readingsOldestFirst.slice(0, i)).stress.value,
      }))
      .filter((p): p is { at: Date; value: number } => p.value !== null);
    const occurrences = [
      ...meditationSessions.map((s) => ({ at: s.completedAt, label: 'Meditation' })),
      ...sceneRuns
        .map((run) => (typeof run.action.params.sceneName === 'string' ? { at: run.completedAt, label: run.action.params.sceneName } : null))
        .filter((o): o is { at: Date; label: string } => o !== null),
    ];
    const stressFindings = correlateOccurrences(occurrences, stressPoints)
      .filter((f) => f.meanDelta < 0) // only real stress *reductions* are worth surfacing here
      .sort((a, b) => a.meanDelta - b.meanDelta);
    const bestStressFinding = stressFindings[0];
    if (bestStressFinding) {
      rows.push({
        userId,
        period: 'WEEKLY',
        metric: 'wellnessMemoryFinding',
        periodStart,
        periodEnd,
        value: bestStressFinding.meanDelta,
        summary: describeFinding(bestStressFinding, 'stress', false),
      });
    }

    const inserted = await insightRepository.createMany(rows);
    totalRows += inserted;
    if (inserted > 0) console.log(`[weekly-report] user=${userId} rows=${inserted}`);

    // One combined weekly headline — biggest improvement + best habit,
    // if either has real data — delivered in-app and (best-effort)
    // texted, same "Poke, but health-focused" delivery pattern as
    // proactiveNotificationsWorker.ts. This worker itself only runs
    // weekly, so WEEKLY_HEADLINE_DEDUPE_HOURS exists as a safety net
    // against a duplicate send on an off-schedule run, not the primary
    // cadence control.
    const headlineParts: string[] = [];
    if (biggestImprovement) headlineParts.push(`${biggestImprovement.label} improved the most this week.`);
    if (bestHabit) {
      const label = bestHabit.habit === 'walking' ? 'Morning Walks' : 'Meditation';
      headlineParts.push(`${label} was your most consistent habit (${bestHabit.consistencyPct}% of the last 30 days).`);
    }
    if (bestStressFinding) headlineParts.push(describeFinding(bestStressFinding, 'stress', false));
    if (headlineParts.length > 0) {
      const title = 'Your Weekly Check-In';
      const body = headlineParts.join(' ');
      if (!(await notificationRepository.hasRecentTitle(userId, title, WEEKLY_HEADLINE_DEDUPE_HOURS))) {
        await deliverNotification({ userId, title, body });
        try {
          await sendProactiveInsight(userId, title, body);
        } catch (error) {
          console.error(`[weekly-report] texting headline failed for user=${userId}:`, error instanceof Error ? error.message : error);
        }
      }
    }
  } catch (error) {
    anyFailed = true;
    console.error(`[weekly-report] user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[weekly-report] Done. ${totalRows} insight row(s) persisted across ${userIds.length} user(s).`);
process.exit(anyFailed ? 1 : 0);
