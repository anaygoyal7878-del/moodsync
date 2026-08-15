import {
  environmentRepository,
  stateObservationRepository,
  biometricReadingRepository,
  homeSnapshotRepository,
  smartHomeConnectionRepository,
  userPreferencesRepository,
  userTimezoneRepository,
  focusSessionRepository,
  locationEventRepository,
  type EnvironmentSettings,
} from '@moodsync/database';
import {
  assessState,
  composeEnvironment,
  canAutomate,
  canSuggest,
  executableChanges,
  computeAcceptance,
  computeEnvironmentEffects,
  describeEffect,
  shouldProposeForState,
  computeStateHeldMinutes,
  isInMeetingNow,
  executeAction,
  computeWellnessScores,
  listHueLightsForUser,
  STATE_LABELS,
  type AutomationLevel,
  type AvailableLight,
  type EnvironmentProposal,
  type GuardInput,
  type MoodState,
  type ProposedChange,
  type StateAssessment,
} from '@moodsync/ai';
import type { AutomationAction } from '@moodsync/shared';

/**
 * The Adaptive Environment orchestrator — the one place the whole
 * UNDERSTAND → RECOMMEND → ACT → MEASURE → LEARN loop is assembled.
 *
 * Everything it reasons with lives in `@moodsync/ai` as pure,
 * separately-tested functions. This file's only jobs are gathering
 * real context, enforcing the guards' verdict, and dispatching through
 * the *existing* executor registry (`executeAction` in
 * ai/src/actionExecutors.ts) rather than a parallel one.
 *
 * See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
 */

/** Trailing window for personal baselines. Long enough to establish
 * what's normal for someone, short enough that a baseline from three
 * months ago doesn't describe a person who's since changed. */
const BASELINE_WINDOW_DAYS = 30;
/** How long after a proposal to measure the biometric response. */
const OUTCOME_WINDOW_MINUTES = 25;
/** Learning window. */
const LEARNING_WINDOW_DAYS = 90;

export interface EnvironmentSnapshot {
  assessment: StateAssessment;
  proposal: EnvironmentProposal | null;
  /** Which changes MoodSync would execute itself at the current level,
   * versus which need a tap. Drives the card's primary button copy. */
  autoExecutable: ProposedChange[];
  settings: EnvironmentSettings;
  /** Null when a proposal is live and actionable. Otherwise explains
   * why there isn't one — never silently empty. */
  blockedReason: string | null;
  /** The existing unanswered proposal's id, when one is live. */
  activeSessionId: string | null;
  /** What MoodSync has learned, when there's enough data to say
   * anything. Empty array is honest and common. */
  findings: string[];
  currentEnvironment: {
    lights: Array<{ name: string; brightnessPct: number | null }>;
    roomTemperatureC: number | null;
    roomName: string | null;
    homeConnected: boolean;
    musicConnected: boolean;
  };
}

function toLocalHour(now: Date, timezone: string): number {
  const formatted = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', hour12: false }).format(now);
  const hour = Number(formatted);
  return Number.isFinite(hour) ? hour % 24 : now.getUTCHours();
}

function parseHourString(value: string | null): number | null {
  if (!value) return null;
  const hour = Number(value.split(':')[0]);
  return Number.isFinite(hour) ? hour : null;
}

/**
 * Gathers everything the engines need. Every external read is
 * best-effort: a Hue bridge being unreachable must degrade the
 * proposal (fewer devices available), never fail the whole assessment.
 */
async function gatherContext(userId: string, now: Date) {
  // userPreferencesRepository exposes purpose-specific getters rather
  // than a single row read, so the three fields this engine needs are
  // fetched individually.
  const [
    timezone,
    latestRow,
    pausedUntil,
    automationsEnabled,
    notificationPrefs,
    sleepTempRange,
    settings,
    snapshot,
    focusSessions,
  ] = await Promise.all([
    userTimezoneRepository.getTimezone(userId),
    biometricReadingRepository.findLatestNormalized(userId),
    userPreferencesRepository.getAutomationsPausedUntil(userId),
    userPreferencesRepository.getAutomationsEnabled(userId),
    userPreferencesRepository.getNotificationPreferences(userId),
    userPreferencesRepository.getSleepTempRangeC(userId),
    environmentRepository.getSettings(userId),
    homeSnapshotRepository.getForUser(userId).catch(() => null),
    focusSessionRepository.listForUser(userId, 1).catch(() => []),
  ]);

  // Both are best-effort: a calendar outage must not stop MoodSync
  // assessing state, and no observation history simply means the
  // held-duration guard blocks rather than permits (see stateHistory.ts).
  const [observations, inMeeting] = await Promise.all([
    stateObservationRepository.listRecent(userId, now).catch(() => []),
    isInMeetingNow(userId, now).catch(() => false),
  ]);

  const history = latestRow
    ? (await biometricReadingRepository.listRecentNormalized(userId, BASELINE_WINDOW_DAYS)).filter(
        (r) => r.timestamp !== latestRow.reading.timestamp,
      )
    : [];

  // Hue lights are the only per-light-controllable surface. A failure
  // here means "no lights available", not "no recommendation".
  let lights: AvailableLight[] = [];
  try {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE');
    if (connection?.status === 'ACTIVE') {
      const hueLights = await listHueLightsForUser(userId);
      lights = hueLights.map((light) => ({
        id: light.id,
        name: light.metadata.name,
        provider: 'hue' as const,
        brightnessPct: light.dimming?.brightness ?? null,
        supportsColorTemperature: true,
      }));
    }
  } catch {
    lights = [];
  }

  const spotify = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'SPOTIFY').catch(() => null);

  // "Away" comes from the existing geofence events, not a guess. No
  // events at all means unknown, which must read as "not away" —
  // otherwise a user without the iOS companion would never get a
  // recommendation.
  const lastLocation = await locationEventRepository.findLatestForUser(userId).catch(() => null);
  const userAway = lastLocation?.type === 'DEPARTED';

  // A Focus Session with no recorded completion in the last two hours
  // is treated as running. The schema logs sessions on completion
  // (see FocusSession's trust-model comment), so this is a proxy, and
  // is documented as one.
  const recentFocus = focusSessions[0];
  const inFocusSession =
    recentFocus !== undefined && now.getTime() - recentFocus.completedAt.getTime() < 5 * 60_000;

  const bedroom =
    snapshot?.rooms.find((r: { name: string; temperatureC: number | null }) =>
      r.name.toLowerCase().includes('bedroom') && r.temperatureC !== null,
    ) ?? null;

  return {
    timezone,
    localHour: toLocalHour(now, timezone),
    latest: latestRow?.reading ?? null,
    history,
    pausedUntil,
    automationsEnabled,
    quietHoursStart: notificationPrefs.quietHoursStart,
    quietHoursEnd: notificationPrefs.quietHoursEnd,
    sleepTempRange,
    settings,
    snapshot,
    lights,
    musicAvailable: spotify?.status === 'ACTIVE',
    userAway,
    inFocusSession,
    inMeeting,
    observations,
    bedroom,
  };
}

export const environmentService = {
  /**
   * The read model behind the dashboard's environment card. Assesses
   * state, composes a proposal when the guards allow one, and reports
   * plainly when they don't.
   */
  async getSnapshot(userId: string, now: Date = new Date()): Promise<EnvironmentSnapshot> {
    const ctx = await gatherContext(userId, now);

    const assessment = assessState(
      {
        latest: ctx.latest,
        history: ctx.history,
        localHour: ctx.localHour,
        bookedHoursToday: null,
        inFocusSession: ctx.inFocusSession,
        minutesSinceWorkout: null,
        userDeclaredState: null,
      },
      now,
    );

    // Record every assessment so held-duration is measurable next time.
    // Best-effort: failing to write history must not fail the read, and
    // `unknown` is skipped — "we couldn't tell" isn't a state anyone
    // holds, and recording it would break otherwise-continuous runs.
    if (assessment.currentState !== 'unknown') {
      void stateObservationRepository
        .record(userId, assessment.currentState, assessment.confidence)
        .catch(() => undefined);
    }

    const currentEnvironment = {
      lights: ctx.lights.map((l) => ({ name: l.name, brightnessPct: l.brightnessPct })),
      roomTemperatureC: ctx.bedroom?.temperatureC ?? null,
      roomName: ctx.bedroom?.name ?? null,
      homeConnected: ctx.snapshot !== null,
      musicConnected: ctx.musicAvailable,
    };

    const sessions = await environmentRepository.listCompletedForLearning(userId, LEARNING_WINDOW_DAYS);
    const acceptance = computeAcceptance(sessions);
    const findings = computeEnvironmentEffects(sessions)
      .map((effect) => describeEffect(effect, STATE_LABELS[effect.state as MoodState] ?? effect.state))
      .filter((f): f is string => f !== null);

    const guardInput = buildGuardInput(ctx, assessment, now);
    const suggestDecision = canSuggest(guardInput);

    const existing = await environmentRepository.findActiveProposal(userId, now);

    if (!suggestDecision.allowed) {
      return {
        assessment,
        proposal: null,
        autoExecutable: [],
        settings: ctx.settings,
        blockedReason: suggestDecision.explanation ?? 'Not right now.',
        activeSessionId: existing?.id ?? null,
        findings,
        currentEnvironment,
      };
    }

    if (assessment.currentState === 'unknown') {
      return {
        assessment,
        proposal: null,
        autoExecutable: [],
        settings: ctx.settings,
        blockedReason: assessment.stillLearning
          ? 'MoodSync is still learning your patterns — connect a wearable and give it a few days.'
          : 'Nothing stands out right now.',
        activeSessionId: null,
        findings,
        currentEnvironment,
      };
    }

    // A state the user has repeatedly declined help with is not
    // proposed again — the learning loop closing on itself.
    if (!shouldProposeForState(assessment.currentState, acceptance)) {
      return {
        assessment,
        proposal: null,
        autoExecutable: [],
        settings: ctx.settings,
        blockedReason: 'MoodSync noticed you usually decline this, so it’s staying out of the way.',
        activeSessionId: null,
        findings,
        currentEnvironment,
      };
    }

    const proposal = composeProposal(ctx, assessment);
    const level = ctx.settings.level.toLowerCase() as AutomationLevel;
    const autoExecutable = canAutomate(guardInput).allowed ? executableChanges(proposal.changes, level) : [];

    return {
      assessment,
      proposal: proposal.noChangesNeeded ? null : proposal,
      autoExecutable,
      settings: ctx.settings,
      blockedReason: proposal.noChangesNeeded ? 'Your environment already looks right for this.' : null,
      activeSessionId: existing?.id ?? null,
      findings,
      currentEnvironment,
    };
  },

  /**
   * Persists a proposal so it can be accepted, measured, and learned
   * from. Records the baseline biometrics at this instant — the
   * before half of the before/after comparison.
   */
  async createProposal(userId: string, now: Date = new Date()) {
    const snapshot = await this.getSnapshot(userId, now);
    if (!snapshot.proposal) return null;

    const ctx = await gatherContext(userId, now);
    const scores = ctx.latest ? computeWellnessScores(ctx.latest, ctx.history) : null;

    return environmentRepository.createSession({
      userId,
      state: snapshot.assessment.currentState,
      confidence: snapshot.assessment.confidence,
      signalsJson: JSON.stringify(snapshot.assessment.supportingSignals),
      proposalJson: JSON.stringify(snapshot.proposal),
      status: 'PROPOSED',
      baselineHeartRate: ctx.latest?.heartRate ?? null,
      baselineStressScore: scores?.stress.value ?? null,
    });
  },

  /**
   * Applies an accepted proposal. Only ever executes changes whose
   * `actuation` says MoodSync can — a `manual_only` change (see
   * environmentComposer.ts) is never dispatched, because there is no
   * write path for it to use.
   *
   * A failed action is reported, not swallowed: telling someone their
   * environment changed when it didn't is worse than telling them it
   * failed.
   */
  async accept(userId: string, sessionId: string) {
    const session = await environmentRepository.respond(sessionId, userId, 'ACCEPTED');
    if (!session) return null;

    const proposal = JSON.parse(session.proposalJson) as EnvironmentProposal;
    const applied: string[] = [];
    const failed: string[] = [];

    for (const change of proposal.changes) {
      if (change.actuation === 'manual_only' || !change.action) continue;
      try {
        await executeAction(userId, change.action as unknown as AutomationAction, `env:${sessionId}`);
        applied.push(change.summary);
      } catch (error) {
        failed.push(`${change.summary} (${error instanceof Error ? error.message : 'failed'})`);
      }
    }

    await environmentRepository.markAutomationRun(userId);
    return { session, applied, failed };
  },

  /** A rejection is the strongest learning signal available, and also
   * counts as a manual override — MoodSync backs off afterward. */
  async reject(userId: string, sessionId: string) {
    const session = await environmentRepository.respond(sessionId, userId, 'REJECTED');
    if (!session) return null;
    await environmentRepository.markManualOverride(userId);
    return session;
  },

  /**
   * Measures what happened after an applied environment. Compares
   * heart rate now against the baseline captured at proposal time.
   *
   * Returns `insufficient` — never a fabricated zero — when there's no
   * comparable reading. The distinction matters downstream: the
   * learning engine excludes `insufficient` outcomes rather than
   * averaging them in as "no change".
   */
  async measureOutcome(userId: string, sessionId: string, now: Date = new Date()) {
    const sessions = await environmentRepository.listAwaitingOutcome(userId, OUTCOME_WINDOW_MINUTES);
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    const currentHr = latest?.reading.heartRate ?? null;

    if (session.baselineHeartRate === null || currentHr === null) {
      await environmentRepository.recordOutcome(sessionId, userId, {
        outcomeHeartRateDelta: null,
        outcomeStressDelta: null,
        outcomeConfidence: 'insufficient',
        outcomeSummary: 'Not enough heart rate data to compare before and after.',
      });
      return { confidence: 'insufficient' as const };
    }

    const delta = currentHr - session.baselineHeartRate;
    const direction = delta < 0 ? 'dropped' : 'rose';
    await environmentRepository.recordOutcome(sessionId, userId, {
      outcomeHeartRateDelta: delta,
      outcomeStressDelta: null,
      outcomeConfidence: 'measured',
      outcomeSummary: `Your heart rate ${direction} ${Math.abs(Math.round(delta))} BPM during this session.`,
    });
    void now;
    return { confidence: 'measured' as const, delta };
  },

  async getSettings(userId: string) {
    return environmentRepository.getSettings(userId);
  },

  async updateSettings(userId: string, patch: Parameters<typeof environmentRepository.updateSettings>[1]) {
    return environmentRepository.updateSettings(userId, patch);
  },
};

function buildGuardInput(
  ctx: Awaited<ReturnType<typeof gatherContext>>,
  assessment: StateAssessment,
  now: Date,
): GuardInput {
  return {
    level: ctx.settings.level.toLowerCase() as AutomationLevel,
    automationsEnabled: ctx.automationsEnabled,
    pausedUntil: ctx.pausedUntil,
    localHour: ctx.localHour,
    // Blocked hours are the Adaptive-Environment-specific window; they
    // fall back to the account-wide quiet hours when unset, so a user
    // who configured quiet hours once doesn't have to do it twice.
    quietHoursStart: ctx.settings.blockedHoursStart ?? parseHourString(ctx.quietHoursStart),
    quietHoursEnd: ctx.settings.blockedHoursEnd ?? parseHourString(ctx.quietHoursEnd),
    lastAutomationAt: ctx.settings.lastAutomationAt,
    // Measured, not inferred: how long this exact state has actually
    // been observed, with silences treated as breaks rather than
    // continuity (ai/src/stateHistory.ts).
    stateHeldMinutes: computeStateHeldMinutes(ctx.observations, assessment.currentState, now),
    confidence: assessment.confidence,
    lastManualOverrideAt: ctx.settings.lastManualOverrideAt,
    userAway: ctx.userAway,
    userAsleep: false,
    inFocusSession: ctx.inFocusSession,
    inMeeting: ctx.inMeeting,
    now,
  };
}

function composeProposal(ctx: Awaited<ReturnType<typeof gatherContext>>, assessment: StateAssessment): EnvironmentProposal {
  const reasonPrefix = assessment.supportingSignals[0]?.description
    ? `${assessment.supportingSignals[0].description}.`
    : `You seem ${assessment.label.toLowerCase()}.`;

  return composeEnvironment(
    assessment.currentState,
    {
      lights: ctx.lights,
      homeScenes: (ctx.snapshot?.scenes ?? []).map((s: { sceneId: string; name: string }) => ({
        sceneId: s.sceneId,
        name: s.name,
      })),
      musicAvailable: ctx.musicAvailable,
      roomTemperatureC: ctx.bedroom?.temperatureC ?? null,
      roomName: ctx.bedroom?.name ?? null,
    },
    {
      sleepTempMinC: ctx.sleepTempRange?.min ?? null,
      sleepTempMaxC: ctx.sleepTempRange?.max ?? null,
      maxLightingDeltaPct: ctx.settings.maxLightingDeltaPct,
      maxTemperatureDeltaC: ctx.settings.maxTemperatureDeltaC,
      lightingEnabled: ctx.settings.lightingEnabled,
      musicEnabled: ctx.settings.musicEnabled,
      temperatureEnabled: ctx.settings.temperatureEnabled,
      sceneEnabled: ctx.settings.sceneEnabled,
      musicAlreadyPlaying: false,
    },
    reasonPrefix,
  );
}
