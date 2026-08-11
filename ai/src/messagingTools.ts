import {
  biometricReadingRepository,
  caffeineLogRepository,
  smartHomeConnectionRepository,
} from '@moodsync/database';
import { computeWellnessScores, type WellnessScores } from './wellness.js';
import { computeLiveEnergyMeter } from './energyMeter.js';
import { listHueLightsForUser, listHueScenesForUser } from './hueActionExecutor.js';

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
 */

export type MessagingToolKind = 'read' | 'action';

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

export const MESSAGING_TOOLS: Record<string, MessagingTool> = {
  get_wearable_snapshot: getWearableSnapshot,
  list_smart_home_devices: listSmartHomeDevices,
  control_hue_light: controlHueLight,
  activate_hue_scene: activateHueScene,
  get_nutrition_guidance: getNutritionGuidance,
};

export const MESSAGING_ACTION_TOOL_NAMES = new Set(
  Object.entries(MESSAGING_TOOLS)
    .filter(([, tool]) => tool.kind === 'action')
    .map(([name]) => name),
);

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
