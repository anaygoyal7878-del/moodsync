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
  moodCheckInRepository,
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
  computeEnvironmentAnalytics,
  describeEffect,
  shouldProposeForState,
  computeStateHeldMinutes,
  isInMeetingNow,
  resolveMusicPlaylist,
  type ResolvedPlaylist,
  recommendScent,
  type Occasion,
  executeAction,
  computeWellnessScores,
  listHueLightsForUser,
  learnAffect,
  extractFeatures,
  calibrateStateConfidence,
  applyCalibration,
  MIN_SAMPLES_TO_LEARN,
  STATE_LABELS,
  type AutomationLevel,
  type AvailableLight,
  type EnvironmentProposal,
  type GuardInput,
  type MoodState,
  type ProposedChange,
  type StateAssessment,
  getOccasionEvents,
  inferCalendarOccasion,
  applicationTiming,
  type OccasionEvent,
  type CalendarOccasion,
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
  // The day's events, for occasion inference. Windowed from now to end
  // of local day: a fragrance suggestion is about what is still ahead,
  // and pulling yesterday would only add events already over.
  const dayEnd = new Date(now.getTime() + 18 * 60 * 60_000);
  const [observations, inMeeting, occasionEvents] = await Promise.all([
    stateObservationRepository.listRecent(userId, now).catch(() => []),
    isInMeetingNow(userId, now).catch(() => false),
    getOccasionEvents(userId, now, dayEnd, now).catch(() => null),
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
  const musicAvailable = spotify?.status === 'ACTIVE';

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
    userId,
    timezone,
    // Carried on the context so everything downstream reasons from the
    // same instant the context was gathered at, rather than each caller
    // taking a fresh clock reading a few milliseconds later.
    now,
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
    musicAvailable,
    userAway,
    inFocusSession,
    inMeeting,
    occasionEvents,
    observations,
    bedroom,
  };
}

/**
 * Adjusts confidence in the rule-based assessment using this person's
 * own learned affect model — see ai/src/affectCalibration.ts for why
 * this is a calibration rather than a state source, and why it isn't
 * routed through `userDeclaredState`.
 *
 * Entirely best-effort. Any failure, any missing data, and any
 * not-yet-usable model returns the original assessment byte-for-byte.
 * For most accounts most of the time there is no usable model, so the
 * overwhelmingly common outcome of this function is that it changes
 * nothing.
 */
async function calibrateWithAffectModel(
  userId: string,
  assessment: StateAssessment,
  ctx: Awaited<ReturnType<typeof gatherContext>>,
  now: Date,
): Promise<StateAssessment> {
  if (assessment.currentState === 'unknown' || !ctx.latest) return assessment;

  try {
    const checkIns = await moodCheckInRepository.listForUser(userId);
    // Cheap pre-check: below the model's own sample floor there is
    // nothing to fit, so skip the work entirely rather than running a
    // regression that is guaranteed to come back unusable.
    if (checkIns.length < MIN_SAMPLES_TO_LEARN) return assessment;

    const learning = learnAffect(
      checkIns.map((c) => ({ valence: c.valence, arousal: c.arousal, createdAt: c.createdAt })),
      ctx.history,
    );
    if (!learning.valence.usable && !learning.arousal.usable) return assessment;

    // Features must come from the same reading the assessment itself
    // was based on — comparing a prediction from one moment against a
    // state inferred from another would be measuring nothing. `history`
    // excludes `latest`, which is exactly the "baseline must not
    // include the value being scored" contract extractFeatures wants.
    const features = extractFeatures(ctx.latest, ctx.history);
    const calibration = calibrateStateConfidence(assessment.currentState, learning, features);
    if (calibration.explanation === null) return assessment;

    return {
      ...assessment,
      confidence: applyCalibration(assessment.confidence, calibration),
      supportingSignals: [
        ...assessment.supportingSignals,
        // 'measured' because it rests on real check-ins compared to
        // real readings, not on the clock or a calendar.
        { kind: 'measured' as const, description: calibration.explanation },
      ],
    };
  } catch {
    // A calibration failure must never take down the environment card.
    return assessment;
  }
}

export const environmentService = {
  /**
   * The read model behind the dashboard's environment card. Assesses
   * state, composes a proposal when the guards allow one, and reports
   * plainly when they don't.
   */
  async getSnapshot(userId: string, now: Date = new Date()): Promise<EnvironmentSnapshot> {
    const ctx = await gatherContext(userId, now);

    const ruleAssessment = assessState(
      {
        latest: ctx.latest,
        history: ctx.history,
        localHour: ctx.localHour,
        bookedHoursToday: null,
        inFocusSession: ctx.inFocusSession,
        minutesSinceWorkout: null,
        // Stays null on purpose. This field means "the user said so"
        // and returns confidence 1.0 — a learned prediction is not a
        // declaration and must never be routed through it. The affect
        // model instead calibrates confidence below; see
        // ai/src/affectCalibration.ts for the full reasoning.
        userDeclaredState: null,
      },
      now,
    );

    const assessment = await calibrateWithAffectModel(userId, ruleAssessment, ctx, now);

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

    const proposal = await composeProposal(ctx, assessment);
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

  /**
   * The analytics read model. Deliberately a separate call from
   * `getSnapshot`: the dashboard card needs to be fast and current,
   * while this scans a 90-day window and is only wanted when someone
   * opens the analytics page.
   */
  async getAnalytics(userId: string, days = 30, now: Date = new Date()) {
    const sessions = await environmentRepository.listCompletedForLearning(userId, LEARNING_WINDOW_DAYS);
    return computeEnvironmentAnalytics(sessions, days, now);
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

/**
 * What the user is actually dressing for, read from their calendar.
 *
 * This used to be two lines — in a meeting meant `work`, everything
 * else meant `unspecified` — which left the scent engine's whole
 * occasion axis unreachable and decided on time of day alone.
 * `calendarOccasion.ts` now classifies the next event by title where
 * the calendar source provides one, and by shape where it does not.
 *
 * The live-meeting check stays ahead of it as a floor: if a call is
 * happening right now, that is the occasion regardless of what is
 * scheduled later. Falling through to `unspecified` remains correct
 * and common — no calendar, or nothing recognisable on it, and time of
 * day decides, which is more honest than inventing an occasion from a
 * heart rate.
 */
function inferOccasion(ctx: {
  inMeeting: boolean;
  localHour: number;
  occasionEvents: OccasionEvent[] | null;
  now: Date;
}): { occasion: Occasion; calendar: CalendarOccasion | null } {
  const calendar = ctx.occasionEvents
    ? inferCalendarOccasion(ctx.occasionEvents, ctx.now, ctx.localHour)
    : null;

  if (ctx.inMeeting) return { occasion: 'work', calendar };
  if (calendar && calendar.occasion !== 'unspecified') return { occasion: calendar.occasion, calendar };
  return { occasion: 'unspecified', calendar };
}

/** Which music category each state wants, mirroring the composer's own
 * INTENTS table. Kept here because the playlist has to be resolved
 * (a network call) *before* the pure composer runs — the composer
 * itself must stay synchronous and side-effect free. */
const STATE_MUSIC_CATEGORY: Partial<Record<MoodState, string>> = {
  stressed: 'calm',
  overstimulated: 'calm',
  focused: 'focus',
  tired: 'energizing',
  sleepy: 'sleep',
  preparing_for_sleep: 'sleep',
  recovering: 'recovery',
  energized: 'energizing',
};

async function composeProposal(
  ctx: Awaited<ReturnType<typeof gatherContext>>,
  assessment: StateAssessment,
): Promise<EnvironmentProposal> {
  const reasonPrefix = assessment.supportingSignals[0]?.description
    ? `${assessment.supportingSignals[0].description}.`
    : `You seem ${assessment.label.toLowerCase()}.`;

  // Resolved to a real, playable URI before composing — see
  // ai/src/musicResolver.ts for why a bare category was a live bug.
  let resolvedPlaylist: ResolvedPlaylist | null = null;
  const category = STATE_MUSIC_CATEGORY[assessment.currentState];
  if (ctx.musicAvailable && ctx.settings.musicEnabled && category) {
    resolvedPlaylist = await resolveMusicPlaylist(ctx.userId, category).catch(() => null);
  }

  // Cologne suggestion — permanently manual_only, so no capability
  // check is needed beyond the user's own toggle. The occasion now
  // comes from the calendar where one is reachable, with a live meeting
  // taking precedence and time of day as the fallback.
  const { occasion, calendar } = inferOccasion({
    inMeeting: ctx.inMeeting,
    localHour: ctx.localHour,
    occasionEvents: ctx.occasionEvents,
    now: ctx.now,
  });

  const scentRec = ctx.settings.scentEnabled
    ? recommendScent({
        localHour: ctx.localHour,
        occasion,
        state: assessment.currentState,
        // The catalog is a single brand's collection and MoodSync has
        // no record of what the user owns, so it recommends across the
        // whole collection. Modelling ownership is real future work.
        owned: [],
      })
    : null;

  // Application timing against the real event, not the clock: applying
  // as you leave means people meet top notes that are gone in half an
  // hour. Only present when an event was actually found.
  const eventTiming = calendar ? applicationTiming(calendar, ctx.now) : null;

  const scentSuggestion = scentRec
    ? {
        name: scentRec.scent.name,
        summary: `${scentRec.scent.name} — ${scentRec.scent.tagline}`,
        // The calendar reason leads when there is one: "for the dinner
        // you have at 7" is a better explanation than "it's evening".
        reason: [calendar?.basis !== 'none' ? calendar?.reason : null, ...scentRec.reasons]
          .filter((r): r is string => Boolean(r))
          .join(' '),
        pulsePoints: scentRec.pulsePoints.map((p) => p.label),
        timing: eventTiming ? `${eventTiming.headline}. ${eventTiming.detail}` : scentRec.timing,
        notes: scentRec.scent.notes,
        occasion,
        occasionBasis: calendar?.basis ?? 'none',
      }
    : null;

  return composeEnvironment(
    assessment.currentState,
    {
      lights: ctx.lights,
      homeScenes: (ctx.snapshot?.scenes ?? []).map((s: { sceneId: string; name: string }) => ({
        sceneId: s.sceneId,
        name: s.name,
      })),
      musicAvailable: ctx.musicAvailable,
      resolvedPlaylist,
      scentSuggestion,
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
      scentEnabled: ctx.settings.scentEnabled,
      musicAlreadyPlaying: false,
    },
    reasonPrefix,
  );
}
