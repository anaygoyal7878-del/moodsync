import { hourInZone } from '@moodsync/shared';
import type { FastifyInstance } from 'fastify';
import {
  biometricReadingRepository,
  focusSessionRepository,
  meditationSessionRepository,
  homeSnapshotRepository,
  userPreferencesRepository,
  pendingDeviceCommandRepository,
} from '@moodsync/database';
import {
  composeDailyBrief,
  computeOvernightChanges,
  computeReadiness,
  greetingFor,
  timeOfDayFor,
  computeSocialBattery,
  socialBatteryGuidance,
  computeStressTimeline,
  computeBedtimeTarget,
  buildWindDownRoutine,
  summarizeSleepQuality,
  correlateOccurrences,
  computeBestFocusHours,
  describeFinding,
  checkBurnoutRisk,
  computeFreeBlocks,
  computeStudyWindowSuggestion,
  computeWellnessScores,
  rankRecoveryActions,
  detectHealthScenarios,
  computePersonalBaselines,
  MEMORY_WINDOW_DAYS,
} from '@moodsync/ai';
import { userRepository } from '../../repositories/userRepository.js';
import {
  loadCompanionContext,
  loadFirstCommitmentTomorrow,
  bookedHoursFrom,
  computeWellnessBaseline,
  baselineZ,
  WELLNESS_HISTORY_DAYS,
} from '../../services/companionContext.js';


/** Planning day bounds, shared with the study-plan route's convention. */
const PLANNING_DAY_END_HOUR = 21;

/** First name only — "Good morning, Anay" reads like a person; the full
 * display name often doesn't. Falls back to null (no name in the
 * greeting) rather than to the email local-part, which reads worse than
 * no name at all. */
function firstNameOf(displayName: string | null): string | null {
  if (!displayName) return null;
  const first = displayName.trim().split(/\s+/)[0];
  return first && first.length > 0 ? first : null;
}

export default async function companionRoutes(app: FastifyInstance) {
  /**
   * The Daily Brief — everything the home screen shows, computed
   * server-side in one round trip so the home page isn't a waterfall of
   * six client fetches.
   */
  app.get('/daily-brief', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [context, user] = await Promise.all([loadCompanionContext(userId), userRepository.findById(userId)]);

    const now = new Date();
    const timeOfDay = timeOfDayFor(hourInZone(now, context.timezone));
    const greeting = greetingFor(timeOfDay, firstNameOf(user?.displayName ?? null));

    if (!context.scores) {
      return reply.send({
        greeting,
        timeOfDay,
        hasData: false,
        readiness: { value: null, basis: 'heuristic' },
        energy: null,
        overnightChanges: [],
        brief: null,
      });
    }

    const readiness = computeReadiness(context.scores);
    const baseline = computeWellnessBaseline(context.history);
    const overnightChanges = computeOvernightChanges(
      { sleep: context.scores.sleep.value, recovery: context.scores.recovery.value },
      baseline,
    );

    const restingHeartRateZ =
      context.latest?.restingHeartRate !== undefined
        ? baselineZ(
            context.latest.restingHeartRate,
            context.history.map((r) => r.restingHeartRate).filter((v): v is number => typeof v === 'number'),
          )
        : null;
    const bookedHoursToday = bookedHoursFrom(context.todayEvents);
    const burnout = checkBurnoutRisk({
      sleepScore: context.scores.sleep.value,
      recoveryScore: context.scores.recovery.value,
      restingHeartRateZ,
      calendarEventCountToday: context.todayEvents?.length ?? null,
    });

    // Free-window suggestion reuses the study planner, bounded to the
    // rest of today rather than the whole day.
    let focusWindow: { start: Date; end: Date } | null = null;
    if (context.todayEvents !== null) {
      const dayEnd = new Date(now);
      dayEnd.setHours(PLANNING_DAY_END_HOUR, 0, 0, 0);
      if (dayEnd > now) {
        const free = computeFreeBlocks(
          context.todayEvents.map((e) => ({ start: e.start, end: e.end })),
          now,
          dayEnd,
        );
        const suggestion = computeStudyWindowSuggestion(free, context.energy);
        focusWindow = suggestion ? { start: suggestion.start, end: suggestion.end } : null;
      }
    }

    const brief = composeDailyBrief({
      timeOfDay,
      readiness: readiness.value,
      energy: context.energy,
      burnoutRisk: burnout !== null,
      focusWindow,
      bookedHoursToday,
    });

    return reply.send({
      greeting,
      timeOfDay,
      hasData: true,
      readiness,
      energy: context.energy,
      scores: context.scores,
      overnightChanges,
      burnout,
      bookedHoursToday,
      eventCountToday: context.todayEvents?.length ?? null,
      brief,
    });
  });

  /** Social Battery / cognitive load — always shipped with its own
   * reasons and its AI-estimate disclaimer (see ai/src/socialBattery.ts). */
  app.get('/social-battery', { preHandler: app.authenticate }, async (request, reply) => {
    const context = await loadCompanionContext(request.userId!);
    if (!context.scores) return reply.send({ battery: null, guidance: null });

    const hrvZ =
      context.latest?.heartRateVariability !== undefined
        ? baselineZ(
            context.latest.heartRateVariability,
            context.history.map((r) => r.heartRateVariability).filter((v): v is number => typeof v === 'number'),
          )
        : null;

    const battery = computeSocialBattery({
      sleepScore: context.scores.sleep.value,
      hrvZ,
      recoveryScore: context.scores.recovery.value,
      bookedHoursToday: bookedHoursFrom(context.todayEvents),
    });

    return reply.send({ battery, guidance: battery ? socialBatteryGuidance(battery.level) : null });
  });

  /**
   * Stress Timeline — the moments today when heart rate moved against
   * its own daily baseline, with the calendar event overlapping each
   * one where there is one.
   */
  app.get('/stress-timeline', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [readings, context] = await Promise.all([
      biometricReadingRepository.listRecentNormalized(userId, 1),
      loadCompanionContext(userId),
    ]);

    const samples = readings
      .filter((r) => r.heartRate !== undefined && new Date(r.timestamp) >= startOfDay)
      .map((r) => ({ timestamp: new Date(r.timestamp), heartRate: r.heartRate! }));

    const contextEvents = (context.todayEvents ?? []).map((e) => ({ label: e.title, start: e.start, end: e.end }));
    return reply.send({ timeline: computeStressTimeline(samples, contextEvents), calendarConnected: context.todayEvents !== null });
  });

  /** Sleep Coach — bedtime target, wind-down routine, quality summary. */
  app.get('/sleep-coach', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [context, firstCommitment, sleepRange, snapshot] = await Promise.all([
      loadCompanionContext(userId),
      loadFirstCommitmentTomorrow(userId),
      userPreferencesRepository.getSleepTempRangeC(userId),
      homeSnapshotRepository.getForUser(userId),
    ]);

    const bedroom = (snapshot?.rooms ?? []).find((r) => r.name.toLowerCase().includes('bedroom') && r.temperatureC !== null);
    // Only a scene the user genuinely has — matched by name against
    // their real HomeKit scene list, never invented.
    const sleepScene = (snapshot?.scenes ?? []).find((s) => /sleep|night|bed/i.test(s.name));

    const windDown = buildWindDownRoutine({
      bedroomTemperatureC: bedroom?.temperatureC ?? null,
      sleepRangeC: sleepRange,
      stressScore: context.scores?.stress.value ?? null,
      sleepSceneName: sleepScene?.name ?? null,
    });

    const nights = [context.latest, ...context.history].filter((r): r is NonNullable<typeof r> => r !== null).map((r) => ({
      sleepScore: r.sleepScore ?? null,
      deepSleepMinutes: r.deepSleepMinutes ?? null,
      remSleepMinutes: r.remSleepMinutes ?? null,
      lightSleepMinutes: r.lightSleepMinutes ?? null,
    }));

    return reply.send({
      bedtimeTarget: computeBedtimeTarget(firstCommitment),
      windDown,
      quality: summarizeSleepQuality(nights),
      bedroomTemperatureC: bedroom?.temperatureC ?? null,
    });
  });

  /**
   * Wellness Memory — what actually works for this user, from their own
   * before/after history. Correlates the things they do in this app
   * (meditation, focus sessions, scene runs) against recovery.
   */
  app.get('/wellness-memory', { preHandler: app.authenticate }, async (request, reply) => {
    const userId = request.userId!;
    const [readings, meditations, focusSessions, sceneRuns, timezoneContext] = await Promise.all([
      biometricReadingRepository.listRecentNormalized(userId, MEMORY_WINDOW_DAYS),
      meditationSessionRepository.listForUser(userId, 200),
      focusSessionRepository.listForUser(userId, 200),
      pendingDeviceCommandRepository.listCompletedSceneRunsForUser(userId, MEMORY_WINDOW_DAYS),
      loadCompanionContext(userId),
    ]);

    const recoveryPoints = readings
      .map((reading) => {
        const value = computeWellnessScores(reading, []).recovery.value;
        return value === null ? null : { at: new Date(reading.timestamp), value };
      })
      .filter((p): p is { at: Date; value: number } => p !== null);

    const occurrences = [
      ...meditations.map((m) => ({ at: m.completedAt, label: 'Meditation' })),
      ...focusSessions.map((f) => ({ at: f.completedAt, label: 'Focus session' })),
      ...sceneRuns
        .map((run) => {
          const sceneName = typeof run.action.params.sceneName === 'string' ? run.action.params.sceneName : null;
          return sceneName ? { at: run.completedAt, label: `"${sceneName}" scene` } : null;
        })
        .filter((o): o is { at: Date; label: string } => o !== null),
    ];

    const findings = correlateOccurrences(occurrences, recoveryPoints);
    const bestHours = computeBestFocusHours(
      focusSessions
        .filter((s) => s.focusScore !== null)
        .map((s) => ({ hourOfDay: hourInZone(s.startedAt, timezoneContext.timezone), score: s.focusScore! })),
    );

    // Recovery actions are ranked here rather than on the client
    // because the ranking is real decision logic with its own tests
    // (ai/src/recoveryActions.ts) — and because it needs the resting
    // heart rate baseline, which is a server-side derivation the
    // frontend has no reason to reproduce.
    const restingRates = readings
      .map((r) => r.restingHeartRate)
      .filter((v): v is number => v !== undefined && v !== null);
    const latestResting = timezoneContext.latest?.restingHeartRate ?? null;
    // Baseline excludes today's own reading, so a single elevated
    // morning isn't compared against a mean it just moved.
    const priorResting = restingRates.slice(1);
    const restingBaseline =
      priorResting.length > 0 ? priorResting.reduce((sum, v) => sum + v, 0) / priorResting.length : null;

    const recoveryActions = rankRecoveryActions({
      recoveryScore: timezoneContext.scores?.recovery.value ?? null,
      stressScore: timezoneContext.scores?.stress.value ?? null,
      sleepScore: timezoneContext.scores?.sleep.value ?? null,
      restingHeartRateDelta:
        latestResting !== null && restingBaseline !== null ? latestResting - restingBaseline : null,
      stepsToday: timezoneContext.latest?.steps ?? null,
      hourOfDay: hourInZone(new Date(), timezoneContext.timezone),
      memory: findings,
    });

    // Researched scenarios ride alongside the ranked actions rather
    // than replacing them: the actions answer "what should I do", these
    // answer "what is your body actually showing" — with a stated basis
    // the user can argue with. Computed against readings that exclude
    // the latest one, so today's value is never compared to a mean it
    // just contributed to (see computePersonalBaselines' own note).
    const healthScenarios = timezoneContext.latest
      ? detectHealthScenarios(computePersonalBaselines(timezoneContext.latest, readings.slice(1)))
      : [];

    return reply.send({
      findings: findings.map((f) => ({ ...f, sentence: describeFinding(f, 'recovery', true) })),
      bestFocusHours: bestHours,
      recoveryActions,
      healthScenarios,
      windowDays: MEMORY_WINDOW_DAYS,
      historyDays: WELLNESS_HISTORY_DAYS,
    });
  });
}
