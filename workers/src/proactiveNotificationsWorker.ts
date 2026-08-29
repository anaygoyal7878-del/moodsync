/**
 * Smart (proactive) Notifications — the periodic tick that evaluates
 * ai/src/proactiveNotifications.ts's checkers per user (recovery, room
 * temperature, a cross-domain recovery/environment/calendar
 * conjunction, burnout risk, scene time-of-day pattern, social battery,
 * habit streak milestones) and delivers whichever fire, deduped by title
 * within a rolling window so a persistent condition (e.g. an
 * always-warm bedroom) doesn't spam a notification every single run —
 * plus a second, separate pass at the bottom of this file sending plain
 * time-interval nudges (ai/src/recurringNudge.ts, deliberately NOT
 * deduped the same way — see that pass's own comment) to anyone who
 * opted into those. Run this on a periodic cron cadence via
 * `npm run start:proactive-notifications -w workers`. Same "periodic
 * tick, only touch users with real data" shape as
 * `workers/src/weeklyReportWorker.ts`. See docs/SMART_NOTIFICATIONS.md.
 *
 * Cadence: every 5 minutes (`workers/railway.proactive-notifications.json`),
 * matching `sync-all`'s own cadence — not an arbitrary round number.
 * The principle (the same one a competing proactive-messaging product,
 * Poke, uses for its inbox monitor: poll near the rate the underlying
 * signal actually refreshes, not slower) applies directly here: biometric
 * readings land at most 5 minutes stale, so a tick that runs any less
 * often is adding pure latency on top of data that was already there.
 * This matters most for `checkRecentStressSpike`, whose own 45-minute
 * staleness window (see that function) meant a stale 30-minute cadence
 * could still leave a real spike unacknowledged for up to half an hour —
 * technically inside the window, nowhere near felt-immediate. The other
 * checks here (recovery, burnout, streaks) are daily-level signals with
 * no benefit from a faster tick, but the 20h dedupe window
 * (DEDUPE_WINDOW_HOURS) makes running them 6x more often free of spam
 * risk either way, so one shared cadence stays simpler than splitting
 * this into a fast worker and a slow one for no real gain.
 */
import {
  biometricReadingRepository,
  homeSnapshotRepository,
  meditationSessionRepository,
  focusSessionRepository,
  notificationRepository,
  pendingDeviceCommandRepository,
  userPreferencesRepository,
  userTimezoneRepository,
  messagingSettingsRepository,
} from '@moodsync/database';
import {
  computeWellnessScores,
  computeWalkingStreak,
  computeMeditationStreak,
  computeFocusStreak,
  computeSocialBattery,
  computeStressTimeline,
  checkRecoveryUnusuallyHigh,
  checkRoomTemperatureOutsideSleepRange,
  checkSceneTimeOfDayPattern,
  checkBurnoutRisk,
  checkHabitStreakMilestone,
  checkSocialBatteryLow,
  checkRecentStressSpike,
  checkRecoveryEnvironmentConjunction,
  computeOverallHomeWellnessScore,
  getTodayCalendarLoad,
  deliverNotification,
  sendProactiveInsight,
  nextNudgeKind,
  isRecurringNudgeDue,
  NUDGE_CONTENT,
  type NudgeKind,
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
 * least 5 historical points. Used for both resting heart rate (burnout
 * check) and HRV (social battery check) — same math, different signal. */
function ownBaselineZ(latest: number, history: number[]): number | null {
  if (history.length < 5) return null;
  const m = mean(history);
  const sd = stdev(history, m);
  if (sd === 0) return 0;
  return (latest - m) / sd;
}

const RECOVERY_HISTORY_DAYS = 30;
const SCENE_HISTORY_DAYS = 30;
/** How far back to pull heart rate samples for the Stress Timeline
 * check. Not an exact "since local midnight" window — that needs
 * per-timezone date math this worker doesn't otherwise do — but wide
 * enough to reliably cover the current day's activity and short enough
 * that a spike bucket from yesterday can't still read as "recent." */
const STRESS_TIMELINE_LOOKBACK_HOURS = 16;
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

/** "2:45 PM"-style label in the user's own timezone, for the Stress
 * Timeline check's title. */
function zonedTimeLabel(at: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }).format(at);
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

    // Today's calendar load, for the burnout/social-battery checks
    // below. Approximates "since local midnight" as "now minus the
    // current local hour" rather than full per-timezone date-component
    // math — close enough for a load signal, not claimed to be exact
    // to the minute. `null` on any failure (no connection, expired
    // refresh token, API error) — same "distinguish no-calendar from
    // free-day" contract getTodayCalendarLoad documents, and a failure
    // here must never break the rest of this user's checks.
    const dayStart = new Date(Date.now() - currentHour * 60 * 60_000);
    let calendarLoad: Awaited<ReturnType<typeof getTodayCalendarLoad>> = null;
    try {
      calendarLoad = await getTodayCalendarLoad(userId, dayStart, new Date());
    } catch (error) {
      console.error(`[proactive-notifications] calendar read failed for user=${userId}:`, error instanceof Error ? error.message : error);
    }

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
    // elevated heart rate or an overloaded calendar). calendarLoad is
    // null whenever there's no connected calendar (or the read failed),
    // in which case this check still fires correctly off the heart rate
    // signal alone.
    if (latest && scores && scores.sleep.value !== null && scores.recovery.value !== null) {
      const rhrHistory = history
        .map((r) => r.restingHeartRate)
        .filter((v): v is number => typeof v === 'number');
      const hrZ =
        latest.reading.restingHeartRate !== undefined
          ? ownBaselineZ(latest.reading.restingHeartRate, rhrHistory)
          : null;
      const burnoutCandidate = checkBurnoutRisk({
        sleepScore: scores.sleep.value,
        recoveryScore: scores.recovery.value,
        restingHeartRateZ: hrZ,
        calendarEventCountToday: calendarLoad?.eventCount ?? null,
      });
      if (await deliverIfNotRecentlySent(userId, burnoutCandidate)) totalSent++;
    }

    // Check 5: Social Battery critically low. Same signals as the
    // burnout check above, reused rather than re-fetched — HRV history
    // is the one new own-baseline z-score this check needs.
    if (latest && scores) {
      const hrvHistory = history
        .map((r) => r.heartRateVariability)
        .filter((v): v is number => typeof v === 'number');
      const hrvZ =
        latest.reading.heartRateVariability !== undefined
          ? ownBaselineZ(latest.reading.heartRateVariability, hrvHistory)
          : null;
      const socialBattery = computeSocialBattery({
        sleepScore: scores.sleep.value,
        hrvZ,
        recoveryScore: scores.recovery.value,
        bookedHoursToday: calendarLoad?.bookedHours ?? null,
      });
      if (await deliverIfNotRecentlySent(userId, checkSocialBatteryLow(socialBattery))) totalSent++;
    }

    // Check 7: Recent Stress Timeline spike — the one same-day check in
    // this worker. Needs raw, timestamped heart rate samples rather
    // than the daily-rollup `history` used above, since
    // computeStressTimeline buckets by time of day, not by day.
    const now = new Date();
    const samples = await biometricReadingRepository.listHeartRateSamplesInWindow(
      userId,
      new Date(now.getTime() - STRESS_TIMELINE_LOOKBACK_HOURS * 60 * 60_000),
      now,
    );
    if (samples.length > 0) {
      const timeline = computeStressTimeline(samples.map((s) => ({ timestamp: s.timestamp, heartRate: s.heartRate })));
      const mostRecent = timeline[timeline.length - 1];
      const spikeCandidate = checkRecentStressSpike(timeline, now, mostRecent ? zonedTimeLabel(mostRecent.at, timezone) : '');
      if (await deliverIfNotRecentlySent(userId, spikeCandidate)) totalSent++;
    }

    // Check 6: Habit streak milestones (walking, meditation, focus) —
    // fires the exact day a streak lands on a milestone value, so no
    // separate dedupe window is needed beyond the title changing daily.
    const walkingStreak = computeWalkingStreak(history);
    if (await deliverIfNotRecentlySent(userId, checkHabitStreakMilestone('walking', walkingStreak.currentStreakDays))) {
      totalSent++;
    }
    const meditationSessions = await meditationSessionRepository.listForUser(userId, 400);
    const meditationStreak = computeMeditationStreak(meditationSessions.map((s) => ({ completedAt: s.completedAt })));
    if (await deliverIfNotRecentlySent(userId, checkHabitStreakMilestone('meditation', meditationStreak.currentStreakDays))) {
      totalSent++;
    }
    const focusSessions = await focusSessionRepository.listForUser(userId, 400);
    const focusStreak = computeFocusStreak(focusSessions.map((s) => ({ completedAt: s.completedAt })));
    if (await deliverIfNotRecentlySent(userId, checkHabitStreakMilestone('focus', focusStreak.currentStreakDays))) {
      totalSent++;
    }

    // Fetched once and reused by both home-environment checks below —
    // the sleep-range check needs individual room temperatures, the
    // recovery/environment conjunction needs the one overall score.
    const homeSnapshot = await homeSnapshotRepository.getForUser(userId);

    // Check 2: Bedroom temperature vs. sleep preference.
    const sleepRange = await userPreferencesRepository.getSleepTempRangeC(userId);
    if (sleepRange) {
      const rooms = (homeSnapshot?.rooms ?? [])
        .filter((r) => r.temperatureC !== null)
        .map((r) => ({ roomName: r.name, temperatureC: r.temperatureC! }));
      if (await deliverIfNotRecentlySent(userId, checkRoomTemperatureOutsideSleepRange(rooms, sleepRange))) {
        totalSent++;
      }
    }

    // Check 2b: recovery + home environment + calendar load, combined.
    // The first checker in this file to cross all three domains —
    // see checkRecoveryEnvironmentConjunction's doc comment for why
    // none of the single-domain checks above catch this situation.
    if (scores) {
      const homeEnvironmentScore = homeSnapshot ? computeOverallHomeWellnessScore(homeSnapshot.rooms).value : null;
      const conjunctionCandidate = checkRecoveryEnvironmentConjunction({
        recoveryScore: scores.recovery.value,
        homeEnvironmentScore,
        calendarBookedHoursToday: calendarLoad?.bookedHours ?? null,
      });
      if (await deliverIfNotRecentlySent(userId, conjunctionCandidate)) totalSent++;
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

// Recurring interval nudges — a separate loop over a separate user
// list on purpose. Every check above requires recent biometric data
// (see `listUserIdsWithRecentReadings`); a recurring nudge requires
// none at all, so gating it on that list would silently exclude anyone
// who wants "remind me to drink water" but hasn't synced a wearable.
// Bypasses `deliverIfNotRecentlySent`'s in-app-notification-plus-title-
// dedupe path deliberately: that dedupe exists to stop a *persistent
// condition* from spamming the same finding, which is the opposite of
// what a recurring nudge is for — it's supposed to repeat by design,
// on its own interval, which is frequently shorter than
// DEDUPE_WINDOW_HOURS (20h) and would otherwise be silently swallowed.
const nudgeUserIds = await messagingSettingsRepository.listUserIdsWithRecurringNudgesEnabled();
let nudgesSent = 0;

for (const userId of nudgeUserIds) {
  try {
    const settings = await messagingSettingsRepository.get(userId);
    if (!isRecurringNudgeDue(settings.recurringNudgeIntervalHours, settings.lastRecurringNudgeAt, new Date())) continue;

    const kind = nextNudgeKind(settings.lastRecurringNudgeKind as NudgeKind | null);
    const content = NUDGE_CONTENT[kind];
    // sendProactiveInsight is the same gate every other proactive text
    // goes through — proactiveEnabled, quiet hours, and the daily cap
    // all still apply, tagged the same `intent: 'proactive'`. There is
    // one policy for "may MoodSync text first," not a second one here.
    const result = await sendProactiveInsight(userId, content.title, content.body, new Date());
    if (result.sent > 0) {
      await messagingSettingsRepository.recordRecurringNudgeSent(userId, kind, new Date());
      nudgesSent++;
    }
  } catch (error) {
    anyFailed = true;
    console.error(`[proactive-notifications] recurring nudge for user=${userId} failed:`, error instanceof Error ? error.message : error);
  }
}

console.log(
  `[proactive-notifications] Done. ${totalSent} notification(s) sent across ${userIds.length} user(s), ` +
    `${nudgesSent} recurring nudge(s) sent across ${nudgeUserIds.length} subscriber(s).`,
);
process.exit(anyFailed ? 1 : 0);
