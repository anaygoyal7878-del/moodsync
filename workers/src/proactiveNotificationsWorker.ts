/**
 * Smart (proactive) Notifications — the periodic tick that evaluates
 * ai/src/proactiveNotifications.ts's three checkers per user and
 * delivers whichever fire, deduped by title within a rolling window so
 * a persistent condition (e.g. an always-warm bedroom) doesn't spam a
 * notification every single run. Run this on a periodic cron cadence
 * (suggested: every 30-60 minutes — frequent enough that "unusually
 * high recovery today" and the time-of-day scene pattern stay timely,
 * infrequent enough not to waste API calls/DB reads) via
 * `npm run start:proactive-notifications -w workers`. Same "periodic
 * tick, only touch users with real data" shape as
 * `workers/src/weeklyReportWorker.ts`. See docs/SMART_NOTIFICATIONS.md.
 */
import {
  biometricReadingRepository,
  homeSnapshotRepository,
  notificationRepository,
  pendingDeviceCommandRepository,
  userPreferencesRepository,
  userTimezoneRepository,
} from '@moodsync/database';
import {
  computeWellnessScores,
  checkRecoveryUnusuallyHigh,
  checkRoomTemperatureOutsideSleepRange,
  checkSceneTimeOfDayPattern,
  deliverNotification,
} from '@moodsync/ai';

const RECOVERY_HISTORY_DAYS = 30;
const SCENE_HISTORY_DAYS = 30;
/** Suppresses a repeat of the exact same title within this window —
 * long enough that a persistent condition (bedroom stays warm all
 * night) doesn't re-notify every worker tick, short enough that a real
 * recurring condition (unusually high recovery on a different day) can
 * fire again. */
const DEDUPE_WINDOW_HOURS = 20;

function zonedHourOfDay(now: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
}

async function deliverIfNotRecentlySent(userId: string, candidate: { title: string; body: string } | null): Promise<boolean> {
  if (!candidate) return false;
  if (await notificationRepository.hasRecentTitle(userId, candidate.title, DEDUPE_WINDOW_HOURS)) return false;
  await deliverNotification({ userId, title: candidate.title, body: candidate.body });
  return true;
}

const userIds = await biometricReadingRepository.listUserIdsWithRecentReadings(RECOVERY_HISTORY_DAYS);
console.log(`[proactive-notifications] Found ${userIds.length} user(s) with recent readings`);

let totalSent = 0;
let anyFailed = false;

for (const userId of userIds) {
  try {
    const timezone = await userTimezoneRepository.getTimezone(userId);
    const currentHour = zonedHourOfDay(new Date(), timezone);

    // Check 1: Recovery unusually high today.
    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    if (latest) {
      const history = await biometricReadingRepository.listRecentNormalized(userId, RECOVERY_HISTORY_DAYS);
      const scores = computeWellnessScores(latest.reading, history.filter((r) => r.timestamp !== latest.reading.timestamp));
      if (scores.recovery.value !== null) {
        const recoveryHistoryValues = history
          .map((r) => computeWellnessScores(r, []).recovery.value)
          .filter((v): v is number => v !== null);
        if (await deliverIfNotRecentlySent(userId, checkRecoveryUnusuallyHigh(scores.recovery.value, recoveryHistoryValues))) {
          totalSent++;
        }
      }
    }

    // Check 2: Bedroom temperature vs. sleep preference.
    const sleepRange = await userPreferencesRepository.getSleepTempRangeC(userId);
    if (sleepRange) {
      const snapshot = await homeSnapshotRepository.getForUser(userId);
      const rooms = (snapshot?.rooms ?? [])
        .filter((r) => r.temperatureC !== null)
        .map((r) => ({ roomName: r.name, temperatureC: r.temperatureC! }));
      if (await deliverIfNotRecentlySent(userId, checkRoomTemperatureOutsideSleepRange(rooms, sleepRange))) {
        totalSent++;
      }
    }

    // Check 3: "Your scene usually helps at this time of day."
    const sceneRuns = await pendingDeviceCommandRepository.listCompletedSceneRunsForUser(userId, SCENE_HISTORY_DAYS);
    const events = sceneRuns
      .map((run) => {
        const sceneName = typeof run.action.params.sceneName === 'string' ? run.action.params.sceneName : null;
        if (!sceneName) return null;
        return { sceneName, hourOfDay: zonedHourOfDay(run.completedAt, timezone) };
      })
      .filter((e): e is { sceneName: string; hourOfDay: number } => e !== null);
    if (await deliverIfNotRecentlySent(userId, checkSceneTimeOfDayPattern(events, currentHour))) {
      totalSent++;
    }
  } catch (error) {
    anyFailed = true;
    console.error(`[proactive-notifications] user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(`[proactive-notifications] Done. ${totalSent} notification(s) sent across ${userIds.length} user(s).`);
process.exit(anyFailed ? 1 : 0);
