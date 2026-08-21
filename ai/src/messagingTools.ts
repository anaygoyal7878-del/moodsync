import {
  biometricReadingRepository,
  caffeineLogRepository,
  smartHomeConnectionRepository,
  messagingMemoryRepository,
} from '@moodsync/database';
import { computeWellnessScores, type WellnessScores } from './wellness.js';
import { computeLiveEnergyMeter } from './energyMeter.js';
import { computeReadiness } from './dailyBrief.js';
import { listHueLightsForUser, listHueScenesForUser } from './hueActionExecutor.js';
import { CAFFEINE_DRINK_PRESETS } from './messagingAgent.js';

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

    return { data: { logged: true, mg, energyAfter } };
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

export const MESSAGING_TOOLS: Record<string, MessagingTool> = {
  get_wearable_snapshot: getWearableSnapshot,
  list_smart_home_devices: listSmartHomeDevices,
  control_hue_light: controlHueLight,
  activate_hue_scene: activateHueScene,
  get_nutrition_guidance: getNutritionGuidance,
  log_caffeine_intake: logCaffeineIntake,
  remember_fact: rememberFact,
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
}

/** Tools that only make sense against a live Hue bridge. */
const HUE_DEPENDENT_TOOLS = new Set(['list_smart_home_devices', 'control_hue_light', 'activate_hue_scene']);

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
    selected[name] = tool;
  }
  return selected;
}

/** Resolves what this account can do right now. Kept next to the tools
 * it gates so the two can't drift apart. */
export async function resolveMessagingCapabilities(userId: string): Promise<MessagingCapabilities> {
  try {
    const hue = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE');
    return { hueConnected: hue?.status === 'ACTIVE' };
  } catch {
    // A lookup failure must not silently grant capabilities — the safe
    // direction is the smaller tool surface, which degrades to "I
    // can't control anything right now", not a broken promise.
    return { hueConnected: false };
  }
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
    default:
      throw new Error(`"${toolName}" is not a confirmable action tool`);
  }
}
