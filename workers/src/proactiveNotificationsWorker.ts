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
  checkBurnoutRisk,
  deliverNotification,
  sendProactiveInsight,
} from '@moodsync/ai';

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stdev(values: number[], m: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Same own-baseline z-score technique wellness.ts uses internally
 * (not exported from there — this worker needs its own small copy, same
 * as proactiveNotifications.ts's own mean/stdev duplication). Needs at
 * least 5 historical points. */
function restingHeartRateZ(latest: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const m = mean(history);
  const sd = stdev(history, m);
  if (sd === 0) return 0;
  return (latest - m) / sd;
}

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

/**
 * Delivers in-app, then best-effort also texts the same insight — this
 * is the whole "Poke, but health-focused" behavior: a real insight this
 * worker already generates now also reaches iMessage/SMS unprompted,
 * for any account with a verified, non-opted-out MessagingConnection.
 * See docs/HEALTH_INSIGHTS_TEXTING_ARCHITECTURE.md. A texting failure
 * (no provider configured, BlueBubbles down) must never block or
 * un-send the in-app notification, which is why it's a separate
 * try/catch after the notification has already been created.
 */
async function deliverIfNotRecentlySent(userId: string, candidate: { title: string; body: string } | null): Promise<boolean> {
  if (!candidate) return false;
  if (await notificationRepository.hasRecentTitle(userId, candidate.title, DEDUPE_WINDOW_HOURS)) return false;
  await deliverNotification({ userId, title: candidate.title, body: candidate.body });
  try {
    await sendProactiveInsight(userId, candidate.title, candidate.body);
  } catch (error) {
    console.error(`[proactive-notifications] texting insight failed for user=${userId}:`, error instanceof Error ? error.message : error);
  }
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
    let scores: ReturnType<typeof computeWellnessScores> | null = null;
    let history: Awaited<ReturnType<typeof biometricReadingRepository.listRecentNormalized>> = [];
    if (latest) {
      history = await biometricReadingRepository.listRecentNormalized(userId, RECOVERY_HISTORY_DAYS);
      scores = computeWellnessScores(latest.reading, history.filter((r) => r.timestamp !== latest.reading.timestamp));
      if (scores.recovery.value !== null) {
        const recoveryHistoryValues = history
          .map((r) => computeWellnessScores(r, []).recovery.value)
          .filter((v): v is number => v !== null);
        if (await deliverIfNotRecentlySent(userId, checkRecoveryUnusuallyHigh(scores.recovery.value, recoveryHistoryValues))) {
          totalSent++;
        }
      }
    }

    // Check 4: Burnout risk (poor sleep + low recovery + at least one of
    // elevated heart rate or an overloaded calendar). Calendar signal is
    // not wired into this worker yet — reading it requires a live OAuth
    // token refresh (see backend/src/services/calendarService.ts), which
    // this background worker doesn't have access to today, so it's
    // always passed as null here (this check still fires correctly off
    // the heart rate signal alone; a future improvement could add
    // calendar reads to this worker).
    if (latest && scores && scores.sleep.value !== null && scores.recovery.value !== null) {
      const rhrHistory = history
        .map((r) => r.restingHeartRate)
        .filter((v): v is number => typeof v === 'number');
      const hrZ =
        latest.reading.restingHeartRate !== undefined
          ? restingHeartRateZ(latest.reading.restingHeartRate, rhrHistory)
          : null;
      const burnoutCandidate = checkBurnoutRisk({
        sleepScore: scores.sleep.value,
        recoveryScore: scores.recovery.value,
        restingHeartRateZ: hrZ,
        calendarEventCountToday: null,
      });
      if (await deliverIfNotRecentlySent(userId, burnoutCandidate)) totalSent++;
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
