import {
  biometricReadingRepository,
  caffeineLogRepository,
  smartHomeConnectionRepository,
  pendingCalendarWriteRepository,
  appleCalendarSnapshotRepository,
  messagingMemoryRepository,
  userTimezoneRepository,
} from '@moodsync/database';
import { computeWellnessScores, type WellnessScores } from './wellness.js';
import { computeLiveEnergyMeter } from './energyMeter.js';
import { computeReadiness } from './dailyBrief.js';
import { listHueLightsForUser, listHueScenesForUser } from './hueActionExecutor.js';
import { CAFFEINE_DRINK_PRESETS, buildCaffeineLogReply } from './messagingAgent.js';
import { recommendScent, OCCASION_LABELS } from './scentIntelligence.js';
import { inferCalendarOccasion, applicationTiming } from './calendarOccasion.js';
import { getOccasionEvents } from './calendarSignal.js';
import { assessState } from './stateEngine.js';
import { hourInZone } from '@moodsync/shared';

/**
 * Task-completing tools for the messaging channel — see
 * docs/MESSAGING_AGENTIC_ARCHITECTURE.md for the full design and why
 * this list is scoped the way it is (Hue only for device control today,
 * general rather than personalized nutrition guidance, no new food
 * domain invented for this).
 *
 * Each tool is declared for Gemini function-calling (`declaration`) and
 * paired with a handler. Read-only tools (`kind: 'read'`) execute and
 * return data immediately. Action tools (`kind: 'action'`) never touch
 * real state themselves — they only validate that the target exists
 * (so a confirmation is never sent for a light that doesn't exist) and
 * hand back a plain-language description; `agenticMessaging.ts` is what
 * turns that into a stored `MessagingPendingAction` and the actual
 * execution once the user confirms. Splitting it this way means the
 * model can never cause a real side effect in a single turn — only a
 * confirmed second message can.
 *
 * `kind: 'write'` is a third category, for changes that are real but
 * low-stakes and easily corrected — logging a drink, remembering a
 * fact about the person — where making the user type "YES" back would
 * just be friction, not safety. These execute immediately, same as a
 * read tool, and the model's next turn is expected to confirm what it
 * did in plain language rather than asking permission first.
 */

export type MessagingToolKind = 'read' | 'action' | 'write';

export interface MessagingToolResult {
  /** Always JSON-serializable — fed back to Gemini as a function
   * response, and for action tools also stored as the pending action's
   * args (re-validated at confirm time, not trusted from storage). */
  data: Record<string, unknown>;
  /** Present only for action tools — the sentence shown to the user to
   * confirm before anything actually happens. */
  confirmPrompt?: string;
  /**
   * A finished confirmation for a write that already happened, used
   * **verbatim** — the turn ends here and the model never gets to
   * paraphrase it.
   *
   * This exists because letting the model narrate a completed write
   * loses the specifics that make the confirmation worth sending.
   * Logging an espresso returned `{ mg: 63, energyAfter }` and the model
   * still replied "Logged your espresso." — technically true, and it
   * threw away both the estimate the user is being held to and its
   * effect on their energy. A confirmation is a receipt; a receipt with
   * the numbers filed off is not one.
   *
   * Same reasoning the action tools already use for `confirmPrompt`:
   * where a correct sentence can be composed deterministically, the
   * model is not the right thing to compose it. It also saves the
   * second round trip, since there is nothing left to ask.
   */
  replyText?: string;
}

export interface MessagingTool {
  kind: MessagingToolKind;
  declaration: { name: string; description: string; parameters: Record<string, unknown> };
  handler: (userId: string, args: Record<string, unknown>) => Promise<MessagingToolResult>;
}

function formatScore(score: WellnessScores[keyof WellnessScores]): string {
  return score.value === null ? 'no data yet' : `${score.value}/100 (${score.basis})`;
}

const getWearableSnapshot: MessagingTool = {
  kind: 'read',
  declaration: {
    name: 'get_wearable_snapshot',
    description:
      "Reads this user's latest smartwatch/wearable data and computed wellness scores (stress, recovery, sleep, energy). Use this for any question about how the user is doing physically right now, their sleep, heart rate, or recovery.",
    parameters: { type: 'object', properties: {} },
  },
  handler: async (userId) => {
    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    if (!latest) {
      return { data: { hasData: false, message: 'No wearable has synced data for this account yet.' } };
    }
    const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
    const scores = computeWellnessScores(
      latest.reading,
      history.filter((r) => r.timestamp !== latest.reading.timestamp),
    );
    const r = latest.reading;
    // Same recovery+sleep readiness figure the daily brief and the
    // (now-retired) deterministic "how am I doing" reply used — a text
    // asking "how am I doing" should get the same number the app would
    // show, not a model's independent read of the raw scores.
    const readiness = computeReadiness(scores);
    return {
      data: {
        hasData: true,
        provider: r.provider,
        timestamp: r.timestamp,
        heartRate: r.heartRate ?? null,
        restingHeartRate: r.restingHeartRate ?? null,
        sleepScoreRaw: r.sleepScore ?? null,
        steps: r.steps ?? null,
        calories: r.calories ?? null,
        readiness: formatScore(readiness),
        stress: formatScore(scores.stress),
        recovery: formatScore(scores.recovery),
        sleep: formatScore(scores.sleep),
        energy: formatScore(scores.energy),
        overall: formatScore(scores.overall),
      },
    };
  },
};

const listSmartHomeDevices: MessagingTool = {
  kind: 'read',
  declaration: {
    name: 'list_smart_home_devices',
    description:
      "Lists this user's controllable smart home devices and scenes. Only Philips Hue is controllable from this chat today — call this before control_hue_light or activate_hue_scene so you use real light/scene names, never invented ones.",
    parameters: { type: 'object', properties: {} },
  },
  handler: async (userId) => {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE');
    if (!connection || connection.status !== 'ACTIVE') {
      return { data: { hueConnected: false, message: 'No connected Hue bridge for this account.' } };
    }
    const [lights, scenes] = await Promise.all([listHueLightsForUser(userId), listHueScenesForUser(userId)]);
    return {
      data: {
        hueConnected: true,
        lights: lights.map((l) => ({ name: l.metadata.name, on: l.on.on, brightness: l.dimming?.brightness ?? null })),
        scenes: scenes.map((s) => s.metadata.name),
      },
    };
  },
};

const controlHueLight: MessagingTool = {
  kind: 'action',
  declaration: {
    name: 'control_hue_light',
    description:
      'Turns a named Hue light on or off, or sets its brightness. Requires the light name exactly as returned by list_smart_home_devices. This does NOT execute immediately — it asks the user to confirm first.',
    parameters: {
      type: 'object',
      properties: {
        lightName: { type: 'string', description: 'Exact light name from list_smart_home_devices' },
        on: { type: 'boolean', description: 'Turn the light on (true) or off (false). Omit if only setting brightness.' },
        brightness: { type: 'number', description: 'Brightness 0-100. Omit if only turning on/off.' },
      },
      required: ['lightName'],
    },
  },
  handler: async (userId, args) => {
    const lightName = String(args.lightName ?? '');
    if (!lightName) throw new Error('control_hue_light requires lightName');
    const lights = await listHueLightsForUser(userId);
    const match = lights.find((l) => l.metadata.name.toLowerCase() === lightName.toLowerCase());
    if (!match) {
      const available = lights.map((l) => l.metadata.name).join(', ') || 'none connected';
      throw new Error(`No light named "${lightName}". Available: ${available}`);
    }
    const on = typeof args.on === 'boolean' ? args.on : undefined;
    const brightness = typeof args.brightness === 'number' ? args.brightness : undefined;
    const pieces: string[] = [];
    if (on !== undefined) pieces.push(on ? 'turn on' : 'turn off');
    if (brightness !== undefined) pieces.push(`set brightness to ${brightness}%`);
    const action = pieces.length > 0 ? pieces.join(' and ') : 'update';
    return {
      data: { lightName: match.metadata.name, on, brightness },
      confirmPrompt: `${action.charAt(0).toUpperCase()}${action.slice(1)} "${match.metadata.name}"? Reply YES to confirm.`,
    };
  },
};

const activateHueScene: MessagingTool = {
  kind: 'action',
  declaration: {
    name: 'activate_hue_scene',
    description:
      'Activates a named Hue scene (e.g. "Relax", "Bright"). Requires the exact scene name from list_smart_home_devices. Does NOT execute immediately — asks the user to confirm first.',
    parameters: {
      type: 'object',
      properties: { sceneName: { type: 'string', description: 'Exact scene name from list_smart_home_devices' } },
      required: ['sceneName'],
    },
  },
  handler: async (userId, args) => {
    const sceneName = String(args.sceneName ?? '');
    if (!sceneName) throw new Error('activate_hue_scene requires sceneName');
    const scenes = await listHueScenesForUser(userId);
    const match = scenes.find((s) => s.metadata.name.toLowerCase() === sceneName.toLowerCase());
    if (!match) {
      const available = scenes.map((s) => s.metadata.name).join(', ') || 'none configured';
      throw new Error(`No scene named "${sceneName}". Available: ${available}`);
    }
    return {
      data: { sceneName: match.metadata.name },
      confirmPrompt: `Activate the "${match.metadata.name}" scene? Reply YES to confirm.`,
    };
  },
};

/** Bounds mirrored from `pendingCalendarWriteRepository.create` so a
 * bad request is rejected here, in the confirmation prompt, rather than
 * only failing later when the device actually tries to queue it —
 * catching it earlier means the model gets a chance to ask a better
 * question instead of proposing something confirmed then thrown away. */
const MAX_EVENT_DAYS_OUT = 90;
const MAX_EVENT_DURATION_HOURS = 24;

const createCalendarEvent: MessagingTool = {
  kind: 'action',
  declaration: {
    name: 'create_calendar_event',
    description:
      "Creates a new event on the user's Apple Calendar. This does NOT execute immediately — it asks the user to confirm the exact title and time first, and even once confirmed it only runs the next time their phone opens the MoodSync app (EventKit has no server-side write path — see docs/APPLE_CALENDAR_ARCHITECTURE.md). Never call this to move or edit an existing event — MoodSync doesn't store enough about existing events to identify one; only ever propose a brand-new event.",
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: "The event's title, as the user described it" },
        startsAt: { type: 'string', description: 'ISO 8601 start time' },
        endsAt: { type: 'string', description: 'ISO 8601 end time, after startsAt' },
      },
      required: ['title', 'startsAt', 'endsAt'],
    },
  },
  handler: async (userId, args) => {
    const title = String(args.title ?? '').trim();
    const startsAt = new Date(String(args.startsAt ?? ''));
    const endsAt = new Date(String(args.endsAt ?? ''));
    if (!title) throw new Error('create_calendar_event requires a title');
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new Error('create_calendar_event requires valid startsAt/endsAt timestamps');
    }
    if (endsAt <= startsAt) throw new Error('endsAt must be after startsAt');
    const daysOut = (startsAt.getTime() - Date.now()) / (24 * 60 * 60_000);
    if (daysOut > MAX_EVENT_DAYS_OUT || daysOut < -1) {
      throw new Error(`Can only schedule up to ${MAX_EVENT_DAYS_OUT} days out`);
    }
    if ((endsAt.getTime() - startsAt.getTime()) / (60 * 60_000) > MAX_EVENT_DURATION_HOURS) {
      throw new Error(`Events can't run longer than ${MAX_EVENT_DURATION_HOURS} hours`);
    }

    // Shown in the user's own timezone — a confirmation prompt that
    // silently means UTC would let someone confirm a time that isn't
    // the one they actually asked for.
    const timeZone = await userTimezoneRepository.getTimezone(userId).catch(() => 'UTC');
    const timeLabel = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone,
    }).format(startsAt);
    return {
      data: { title, startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() },
      confirmPrompt: `Add "${title}" to your calendar for ${timeLabel}? It'll be created next time your phone opens MoodSync. Reply YES to confirm.`,
    };
  },
};

const getNutritionGuidance: MessagingTool = {
  kind: 'read',
  declaration: {
    name: 'get_nutrition_guidance',
    description:
      "Provides general nutrition guidance for a question (e.g. \"what should I eat before a workout\", \"is coffee bad for my sleep\"), grounded in this account's real recent caffeine intake and current energy/recovery data where relevant. MoodSync has no food-logging or calorie-tracking feature — this is general educational guidance, never a personalized meal plan or medical/dietary prescription.",
    parameters: {
      type: 'object',
      properties: { question: { type: 'string', description: "The user's nutrition-related question, verbatim" } },
      required: ['question'],
    },
  },
  handler: async (userId, args) => {
    const question = String(args.question ?? '');
    const [latest, recentCaffeine] = await Promise.all([
      biometricReadingRepository.findLatestNormalized(userId),
      caffeineLogRepository.listRecentForUser(userId, 5),
    ]);

    let energySection: Record<string, unknown> = { hasData: false };
    if (latest) {
      const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
      const scores = computeWellnessScores(
        latest.reading,
        history.filter((r) => r.timestamp !== latest.reading.timestamp),
      );
      const meter = computeLiveEnergyMeter(
        scores,
        recentCaffeine.map((log) => ({ mg: log.mg, loggedAt: log.loggedAt })),
      );
      energySection = {
        hasData: true,
        currentEnergy: formatScore(scores.energy),
        recovery: formatScore(scores.recovery),
        sleep: formatScore(scores.sleep),
        liveEnergyMeter: meter.value,
        caffeineBoostRemaining: meter.caffeineBoost,
      };
    }

    return {
      data: {
        question,
        recentCaffeineLogsMg: recentCaffeine.map((log) => ({ mg: log.mg, loggedAt: log.loggedAt })),
        energy: energySection,
        instructionsForModel:
          'Answer the question using general, well-established nutrition principles. Ground the answer in the real caffeine/energy data above ONLY where it is directly relevant (e.g. timing caffeine, hydration, pre/post-workout eating tied to their current recovery/energy) — do not force a connection that is not there. Never invent a calorie count, macro target, or medical claim. State plainly that this is general guidance, not a personalized diet plan, and suggest a registered dietitian or doctor for anything that sounds like a specific medical or clinical need.',
      },
    };
  },
};

const logCaffeineIntake: MessagingTool = {
  kind: 'write',
  declaration: {
    name: 'log_caffeine_intake',
    description:
      "Logs a caffeinated drink the user says they just had (e.g. \"just had a coffee\", \"drinking an espresso\"). Only call this when the message reports something already consumed — never for a hypothetical or a question like \"should I have a coffee?\". Pick the closest drinkType; use customMg only when the user states a specific amount themselves.",
    parameters: {
      type: 'object',
      properties: {
        drinkType: {
          type: 'string',
          enum: Object.keys(CAFFEINE_DRINK_PRESETS),
          description: 'The closest matching drink preset.',
        },
        customMg: {
          type: 'number',
          description: 'Only when the user stated an exact milligram amount themselves — otherwise omit and use drinkType.',
        },
      },
    },
  },
  handler: async (userId, args) => {
    const drinkType = typeof args.drinkType === 'string' ? args.drinkType : undefined;
    const customMg = typeof args.customMg === 'number' ? args.customMg : undefined;
    const mg = customMg ?? (drinkType ? CAFFEINE_DRINK_PRESETS[drinkType] : undefined);
    if (!mg || mg <= 0) throw new Error('log_caffeine_intake needs a known drinkType or a positive customMg');

    await caffeineLogRepository.create({ userId, mg, loggedAt: new Date() });

    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    let energyAfter: number | null = null;
    if (latest) {
      const history = await biometricReadingRepository.listRecentNormalized(userId, 30);
      const scores = computeWellnessScores(
        latest.reading,
        history.filter((r) => r.timestamp !== latest.reading.timestamp),
      );
      const recent = await caffeineLogRepository.listRecentForUser(userId, 5);
      energyAfter = computeLiveEnergyMeter(
        scores,
        recent.map((log) => ({ mg: log.mg, loggedAt: log.loggedAt })),
      ).value;
    }

    // Deterministic receipt rather than a model paraphrase: it names the
    // mg estimate the user is being held to (they said "espresso", not
    // "63mg") and what it did to their energy. See `replyText`.
    return { data: { logged: true, mg, energyAfter }, replyText: buildCaffeineLogReply(mg, energyAfter) };
  },
};

const rememberFact: MessagingTool = {
  kind: 'write',
  declaration: {
    name: 'remember_fact',
    description:
      "Saves one short, durable fact about this person for future conversations — a preference or recurring context that would be useful to recall days or weeks from now (e.g. \"trains best in the morning\", \"has a big presentation every Monday\", \"prefers metric units\"). Do NOT save anything transient (today's schedule, a single day's mood) or a medical/diagnostic claim. One plain sentence, third person.",
    parameters: {
      type: 'object',
      properties: {
        fact: { type: 'string', description: 'The fact, as one short plain sentence (e.g. "Prefers evening workouts.")' },
      },
      required: ['fact'],
    },
  },
  handler: async (userId, args) => {
    const fact = String(args.fact ?? '').trim();
    if (!fact) throw new Error('remember_fact requires a fact');
    if (fact.length > 200) throw new Error('That fact is too long to remember concisely — say it in one short sentence.');
    await messagingMemoryRepository.add(userId, fact);
    return { data: { saved: true, fact } };
  },
};

/**
 * Cologne recommendation over text.
 *
 * The engine (`scentIntelligence.ts`) and the calendar-driven occasion
 * inference (`calendarOccasion.ts`) both existed before this and were
 * reachable only from the in-app Adaptive Environment card. Someone
 * texting "what should I wear tonight" got a general answer from the
 * model's own knowledge rather than the Nature's Note catalog and their
 * own calendar — the two things that make the answer theirs.
 *
 * Read-only: a fragrance suggestion is advice a person carries out, so
 * there is nothing to confirm and nothing to execute. That matches the
 * `manual_only` actuation the environment composer already gives this
 * channel.
 *
 * Returns the note pyramid as `null` rather than omitting it when the
 * brand does not publish one, and says so in the payload, so the model
 * describes the fragrance instead of inventing a pyramid for it — the
 * same honesty boundary `scentLibrary.ts` holds.
 */
const recommendCologne: MessagingTool = {
  kind: 'read',
  declaration: {
    name: 'recommend_cologne',
    description:
      "Recommends which cologne from the user's Nature's Note collection to wear, and when to apply it. Uses their calendar to work out the occasion, plus the time of day and their current wellness signals. Use this for any question about what fragrance or cologne to wear, what to put on for an event, or when to apply it.",
    parameters: { type: 'object', properties: {} },
  },
  handler: async (userId) => {
    const now = new Date();
    const timezone = await userTimezoneRepository.getTimezone(userId);
    const localHour = hourInZone(now, timezone);

    const latest = await biometricReadingRepository.findLatestNormalized(userId);
    const history = latest ? await biometricReadingRepository.listRecentNormalized(userId, 30) : [];

    // Same state engine the in-app card uses, so a texted answer and the
    // dashboard cannot disagree about what the user's signals say.
    const assessment = assessState(
      {
        latest: latest?.reading ?? null,
        history: history.filter((r) => r.timestamp !== latest?.reading.timestamp),
        localHour,
        bookedHoursToday: null,
        inFocusSession: false,
        minutesSinceWorkout: null,
        userDeclaredState: null,
      },
      now,
    );

    // Looks ahead rather than at the whole day: what to wear is a
    // question about what is still coming.
    const events = await getOccasionEvents(userId, now, new Date(now.getTime() + 18 * 60 * 60_000), now).catch(() => null);
    const calendar = events ? inferCalendarOccasion(events, now, localHour) : null;
    const occasion = calendar && calendar.occasion !== 'unspecified' ? calendar.occasion : 'unspecified';

    const rec = recommendScent({
      localHour,
      occasion,
      state: assessment.currentState,
      // MoodSync has no record of which bottles the user owns, so this
      // recommends across the whole collection. Same limitation the
      // environment card carries.
      owned: [],
    });
    if (!rec) return { data: { hasRecommendation: false, message: 'No fragrance in the collection fit this moment.' } };

    const timing = calendar ? applicationTiming(calendar, now) : null;

    return {
      data: {
        hasRecommendation: true,
        scent: rec.scent.name,
        tagline: rec.scent.tagline,
        description: rec.scent.description,
        // Null for the two fragrances whose pyramids the brand does not
        // publish. Flagged explicitly so the model says "the brand
        // doesn't list its notes" rather than filling the gap.
        notes: rec.scent.notes,
        notesPublished: rec.scent.notes !== null,
        reasons: rec.reasons,
        occasion: OCCASION_LABELS[occasion],
        occasionSource: calendar?.basis ?? 'none',
        occasionReason: calendar?.reason ?? null,
        pulsePoints: rec.pulsePoints.map((p) => ({ where: p.label, note: p.note })),
        noteTiming: rec.timing,
        applicationTiming: timing ? `${timing.headline}. ${timing.detail}` : null,
        alternatives: rec.alternatives.map((a) => a.scent.name),
      },
    };
  },
};

export const MESSAGING_TOOLS: Record<string, MessagingTool> = {
  get_wearable_snapshot: getWearableSnapshot,
  list_smart_home_devices: listSmartHomeDevices,
  control_hue_light: controlHueLight,
  activate_hue_scene: activateHueScene,
  create_calendar_event: createCalendarEvent,
  get_nutrition_guidance: getNutritionGuidance,
  log_caffeine_intake: logCaffeineIntake,
  remember_fact: rememberFact,
  recommend_cologne: recommendCologne,
};

export const MESSAGING_ACTION_TOOL_NAMES = new Set(
  Object.entries(MESSAGING_TOOLS)
    .filter(([, tool]) => tool.kind === 'action')
    .map(([name]) => name),
);

/** What this specific account can actually do, resolved once per turn.
 * See `selectMessagingTools`. */
export interface MessagingCapabilities {
  hueConnected: boolean;
  /** Whether the iOS companion has ever pushed an Apple Calendar
   * snapshot — not the same as "recently" or "authorized to write":
   * this is the cheapest honest signal that the companion app and
   * EventKit access exist at all. A stricter freshness check belongs
   * to `calendarSignal.ts`'s reads, not to whether the *tool* is worth
   * declaring — a slightly stale snapshot still means someone can
   * plausibly open their phone and pick up a queued write. */
  appleCalendarConnected: boolean;
}

/** Tools that only make sense against a live Hue bridge. */
const HUE_DEPENDENT_TOOLS = new Set(['list_smart_home_devices', 'control_hue_light', 'activate_hue_scene']);

/** Proposing a calendar write when nobody has ever connected Apple
 * Calendar would queue a write that never gets picked up — an honest
 * "you haven't connected your calendar yet" beats a confirmation
 * prompt for something that silently sits forever. */
const APPLE_CALENDAR_DEPENDENT_TOOLS = new Set(['create_calendar_event']);

/**
 * Builds the tool surface for one conversation.
 *
 * This is where two users' agents stop being the same program. A
 * person with no Hue bridge is not handed light-control tools that
 * would fail — the functions are never declared to the model at all,
 * so "turn off the bedroom light" gets an honest "you haven't
 * connected a bridge yet" instead of a confident confirmation prompt
 * for a light that does not exist.
 *
 * Two things at once, which is why it's worth doing structurally
 * rather than in prompt text:
 *
 *  - **Credibility.** A capability the model cannot see is a
 *    capability it cannot promise. Prompt instructions telling a model
 *    not to use a tool are advisory; not declaring the tool is not.
 *  - **Efficiency.** Three unused function declarations are three
 *    function declarations in every request of every turn, forever.
 *
 * `get_wearable_snapshot` is deliberately *not* gated on having a
 * wearable connected: with no data it returns an explicit
 * `hasData: false`, which is a real and useful answer ("nothing has
 * synced yet"). Removing it would leave the model with no grounded way
 * to find that out, which is exactly when models guess.
 */
export function selectMessagingTools(capabilities: MessagingCapabilities): Record<string, MessagingTool> {
  const selected: Record<string, MessagingTool> = {};
  for (const [name, tool] of Object.entries(MESSAGING_TOOLS)) {
    if (HUE_DEPENDENT_TOOLS.has(name) && !capabilities.hueConnected) continue;
    if (APPLE_CALENDAR_DEPENDENT_TOOLS.has(name) && !capabilities.appleCalendarConnected) continue;
    selected[name] = tool;
  }
  return selected;
}

/** Resolves what this account can do right now. Kept next to the tools
 * it gates so the two can't drift apart. */
export async function resolveMessagingCapabilities(userId: string): Promise<MessagingCapabilities> {
  const [hueResult, calendarResult] = await Promise.allSettled([
    smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE'),
    appleCalendarSnapshotRepository.getForUser(userId),
  ]);
  // Each capability fails closed independently — a Hue lookup failure
  // must not also hide the calendar capability, and vice versa. The
  // safe direction for either is the smaller tool surface, degrading to
  // "I can't do that right now" rather than a broken promise.
  return {
    hueConnected: hueResult.status === 'fulfilled' && hueResult.value?.status === 'ACTIVE',
    appleCalendarConnected: calendarResult.status === 'fulfilled' && calendarResult.value !== null,
  };
}

/** Actually performs a previously-confirmed action tool. Re-resolves
 * the target by name again rather than trusting the stored args blindly
 * — a light could have been renamed or disconnected in the few minutes
 * between the confirmation prompt and the "YES" reply. */
export async function executeConfirmedAction(userId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
  switch (toolName) {
    case 'control_hue_light': {
      const { setHueLightByName } = await import('./hueActionExecutor.js');
      const lightName = String(args.lightName ?? '');
      const state: { on?: boolean; brightness?: number } = {};
      if (typeof args.on === 'boolean') state.on = args.on;
      if (typeof args.brightness === 'number') state.brightness = args.brightness;
      await setHueLightByName(userId, lightName, state);
      return `Done — "${lightName}" updated.`;
    }
    case 'activate_hue_scene': {
      const { activateHueSceneByName } = await import('./hueActionExecutor.js');
      const sceneName = String(args.sceneName ?? '');
      await activateHueSceneByName(userId, sceneName);
      return `Done — "${sceneName}" activated.`;
    }
    case 'create_calendar_event': {
      // Queues, never executes directly — EventKit has no server-side
      // write path (see docs/APPLE_CALENDAR_ARCHITECTURE.md), so
      // "confirmed" means "queued for the device," not "done."
      const title = String(args.title ?? '');
      const startsAt = new Date(String(args.startsAt ?? ''));
      const endsAt = new Date(String(args.endsAt ?? ''));
      await pendingCalendarWriteRepository.create({ userId, title, startsAt, endsAt });
      return `Got it — "${title}" will be added to your calendar next time your phone opens MoodSync.`;
    }
    default:
      throw new Error(`"${toolName}" is not a confirmable action tool`);
  }
}
