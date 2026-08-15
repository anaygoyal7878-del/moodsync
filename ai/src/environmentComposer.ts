import type { MoodState } from './stateEngine.js';

/**
 * Environment Composer — turns a MoodSync state into a concrete,
 * reviewable set of environment changes, using only devices the user
 * actually has and only changes MoodSync can actually make.
 *
 * ## The actuation honesty rule
 *
 * This is the most important constraint in this file. MoodSync's
 * ability to change a device varies enormously by provider, and the
 * composer must never propose something it cannot do:
 *
 * | Surface            | What's actually possible                        |
 * |--------------------|-------------------------------------------------|
 * | Hue (Bridge)       | Per-light brightness + colour temp, server-side  |
 * | Hue BLE            | Power + brightness, queued to the phone          |
 * | Apple Home         | **Run a pre-existing scene only.** HomeKit has no cloud API and third parties get no per-accessory write access — see docs/HOMEKIT_ARCHITECTURE.md |
 * | Spotify            | Start a playlist, server-side                    |
 * | Thermostat         | **Read-only.** No write path exists anywhere in this codebase — HomeKit exposes room temperature through the cached snapshot, and no provider integration implements a setpoint write |
 *
 * So a temperature proposal is always `manual_only`: a real, explained
 * recommendation the user carries out themselves (or via their own
 * Home-app scene). Presenting it as something MoodSync will do would
 * be a lie the product could never make good on.
 */

export type ActuationMode =
  /** MoodSync can perform this itself, server-side, right now. */
  | 'automatic'
  /** Queued for the iOS companion to run when it next opens — real,
   * but not instant, and dependent on the phone. */
  | 'queued_to_device'
  /** MoodSync cannot perform this. It's a recommendation the user
   * carries out. Shown as advice, never as a pending action. */
  | 'manual_only';

export type EnvironmentChannel = 'lighting' | 'music' | 'temperature' | 'scene';

export interface ProposedChange {
  channel: EnvironmentChannel;
  /** One-line summary for the card. */
  summary: string;
  /** Why this, in the user's terms — never omitted. Section 19 of the
   * product spec: every recommendation needs a reason. */
  reason: string;
  actuation: ActuationMode;
  /** Present only when `actuation !== 'manual_only'` — the concrete
   * action for dispatch to execute. Shape matches
   * `AutomationAction` in shared/src/automation.ts so this reuses the
   * existing executor registry rather than a parallel one. */
  action?: { type: string; provider: string; params: Record<string, unknown> };
  /** Present when this change moves a numeric value, so the UI can
   * show "72°F → 71°F" and the clamps stay auditable. */
  from?: number;
  to?: number;
}

export interface EnvironmentProposal {
  state: MoodState;
  /** Short user-facing name, e.g. "Wind Down Environment". */
  name: string;
  /** The lead sentence on the card. */
  headline: string;
  changes: ProposedChange[];
  /** Minutes this environment is intended to last, when it's a
   * bounded session (a reset, a wind-down). Null for open-ended. */
  durationMinutes: number | null;
  /** True when MoodSync found nothing it could helpfully change —
   * distinct from an empty proposal due to missing devices. */
  noChangesNeeded: boolean;
}

// ---------------------------------------------------------------------
// Device capability model
// ---------------------------------------------------------------------

export interface AvailableLight {
  /** Provider-native id, for the dispatch action. */
  id: string;
  name: string;
  provider: 'hue' | 'hue_ble';
  /** Current brightness 0-100, when known. */
  brightnessPct: number | null;
  supportsColorTemperature: boolean;
}

export interface AvailableScene {
  /** HomeKit scene id from the cached snapshot. */
  sceneId: string;
  name: string;
}

export interface EnvironmentCapabilities {
  lights: AvailableLight[];
  /** Pre-existing Apple Home scenes. MoodSync can run these but cannot
   * create or edit them — Apple provides no such API. */
  homeScenes: AvailableScene[];
  /** True when a music provider is connected and controllable. */
  musicAvailable: boolean;
  /** Current room temperature in Celsius from the HomeKit snapshot,
   * when a sensor reports one. Read-only — see the file header. */
  roomTemperatureC: number | null;
  roomName: string | null;
}

export interface ComposerPreferences {
  /** User's preferred sleep temperature range, in Celsius. Null when
   * unset — no fabricated default range. */
  sleepTempMinC: number | null;
  sleepTempMaxC: number | null;
  /** Hard ceiling on a single lighting change, in percentage points.
   * Section 4 of the spec: no aggressive jumps. */
  maxLightingDeltaPct: number;
  /** Hard ceiling on a single temperature recommendation, in Celsius. */
  maxTemperatureDeltaC: number;
  /** Per-channel enablement — a user can want lighting help but not
   * music, and the composer must respect that at proposal time, not
   * just at execution. */
  lightingEnabled: boolean;
  musicEnabled: boolean;
  temperatureEnabled: boolean;
  sceneEnabled: boolean;
  /** True when the user is already playing something. The composer
   * will not propose taking over playback — spec section 4's "BAD:
   * stop music the user is currently listening to". */
  musicAlreadyPlaying: boolean;
}

export const DEFAULT_MAX_LIGHTING_DELTA_PCT = 25;
export const DEFAULT_MAX_TEMPERATURE_DELTA_C = 1.5;

/** Floor for any automated dimming. MoodSync never takes lights to 0 —
 * spec section 4's "BAD: turn all lights off". Dark rooms are a manual
 * decision. */
export const MIN_AUTOMATED_BRIGHTNESS_PCT = 15;

function clampDelta(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) return target;
  return current + Math.sign(delta) * maxDelta;
}

// ---------------------------------------------------------------------
// Per-state environment intent
// ---------------------------------------------------------------------

interface EnvironmentIntent {
  name: string;
  headline: string;
  /** Target brightness as a fraction of current, or an absolute
   * percentage. Null means "don't touch lighting for this state". */
  targetBrightnessPct: number | null;
  /** Mired colour temperature. Lower = cooler/bluer, higher = warmer.
   * Hue's CLIP v2 API takes mirek — see integrations/hue. */
  targetMirek: number | null;
  musicCategory: string | null;
  durationMinutes: number | null;
  /** Which pre-existing Home scene names to look for, in priority
   * order. Matched case-insensitively against the user's real scenes —
   * never invented. */
  sceneNameHints: string[];
}

/**
 * The intent table. Deliberately data, not branching logic — adding a
 * state means adding a row, and the whole mapping is reviewable at a
 * glance rather than spread across conditionals.
 *
 * Mirek values: 250 ≈ 4000K (neutral), 370 ≈ 2700K (warm), 450 ≈ 2200K
 * (very warm). Hue's supported range is roughly 153-500.
 */
const INTENTS: Partial<Record<MoodState, EnvironmentIntent>> = {
  stressed: {
    name: 'Reset Environment',
    headline: 'Your environment is ready for a reset.',
    targetBrightnessPct: 45,
    targetMirek: 370,
    musicCategory: 'calm',
    durationMinutes: 15,
    sceneNameHints: ['relax', 'calm', 'unwind', 'chill'],
  },
  overstimulated: {
    name: 'Quiet Environment',
    headline: 'Turning things down a notch.',
    targetBrightnessPct: 35,
    targetMirek: 400,
    musicCategory: 'calm',
    durationMinutes: 20,
    sceneNameHints: ['relax', 'calm', 'quiet', 'unwind'],
  },
  focused: {
    name: 'Deep Focus Environment',
    headline: 'Setting up for focused work.',
    targetBrightnessPct: 80,
    targetMirek: 250,
    musicCategory: 'focus',
    durationMinutes: null,
    sceneNameHints: ['focus', 'work', 'study', 'bright'],
  },
  tired: {
    name: 'Gentle Lift',
    headline: 'A little more light might help.',
    targetBrightnessPct: 75,
    targetMirek: 260,
    musicCategory: 'energizing',
    durationMinutes: null,
    sceneNameHints: ['bright', 'morning', 'energize'],
  },
  sleepy: {
    name: 'Wind Down Environment',
    headline: 'Easing toward sleep.',
    targetBrightnessPct: 30,
    targetMirek: 420,
    musicCategory: 'sleep',
    durationMinutes: 30,
    sceneNameHints: ['sleep', 'wind down', 'night', 'bedtime'],
  },
  preparing_for_sleep: {
    name: 'Wind Down Environment',
    headline: 'Getting the room ready for sleep.',
    targetBrightnessPct: 30,
    targetMirek: 430,
    musicCategory: 'sleep',
    durationMinutes: 30,
    sceneNameHints: ['sleep', 'wind down', 'night', 'bedtime'],
  },
  recovering: {
    name: 'Recovery Environment',
    headline: 'Low-stimulation settings while you recover.',
    targetBrightnessPct: 50,
    targetMirek: 370,
    musicCategory: 'recovery',
    durationMinutes: 20,
    sceneNameHints: ['relax', 'recover', 'calm'],
  },
  energized: {
    name: 'Morning Environment',
    headline: 'Matching your energy.',
    targetBrightnessPct: 85,
    targetMirek: 230,
    musicCategory: 'energizing',
    durationMinutes: null,
    sceneNameHints: ['morning', 'bright', 'energize'],
  },
};

// ---------------------------------------------------------------------
// Composer
// ---------------------------------------------------------------------

function celsiusToF(c: number): number {
  return c * 1.8 + 32;
}

/**
 * Composes a proposal. Returns `noChangesNeeded: true` rather than an
 * empty-but-confident card when there's nothing helpful to do — the
 * product should be able to say "you're fine, nothing to change".
 *
 * Every branch checks real availability first. A user with no lights
 * gets no lighting proposal; a user with no Home scenes gets no scene
 * proposal. Nothing is proposed against a device that doesn't exist.
 */
export function composeEnvironment(
  state: MoodState,
  capabilities: EnvironmentCapabilities,
  prefs: ComposerPreferences,
  reasonPrefix: string,
): EnvironmentProposal {
  const intent = INTENTS[state];
  if (!intent) {
    return {
      state,
      name: 'No changes',
      headline: 'Nothing to adjust right now.',
      changes: [],
      durationMinutes: null,
      noChangesNeeded: true,
    };
  }

  const changes: ProposedChange[] = [];

  // ---- Lighting ------------------------------------------------------
  if (prefs.lightingEnabled && intent.targetBrightnessPct !== null && capabilities.lights.length > 0) {
    for (const light of capabilities.lights) {
      const current = light.brightnessPct;
      // With no known current level, propose the target directly but
      // still respect the floor — we can't clamp a delta we can't measure.
      const rawTarget =
        current === null
          ? intent.targetBrightnessPct
          : clampDelta(current, intent.targetBrightnessPct, prefs.maxLightingDeltaPct);
      const target = Math.max(MIN_AUTOMATED_BRIGHTNESS_PCT, Math.round(rawTarget));

      // Skip no-ops — proposing "set 52% to 52%" is noise.
      if (current !== null && Math.abs(target - current) < 3) continue;

      const change: ProposedChange = {
        channel: 'lighting',
        summary: current === null ? `${light.name} → ${target}%` : `${light.name} ${current}% → ${target}%`,
        reason: `${reasonPrefix} ${target < (current ?? 100) ? 'Softer light supports winding down.' : 'A brighter room supports alertness.'}`,
        actuation: light.provider === 'hue' ? 'automatic' : 'queued_to_device',
        action: {
          type: light.provider === 'hue' ? 'hue.set_brightness' : 'hue_ble.set_brightness',
          provider: light.provider,
          params: { deviceId: light.id, brightness: target },
        },
        ...(current !== null ? { from: current } : {}),
        to: target,
      };
      changes.push(change);

      // Colour temperature is a separate change on purpose — spec
      // section 10: never merge intensity and colour into one control.
      if (intent.targetMirek !== null && light.supportsColorTemperature && light.provider === 'hue') {
        changes.push({
          channel: 'lighting',
          summary: `${light.name} → ${intent.targetMirek >= 370 ? 'warm' : 'neutral'} light`,
          reason: `${reasonPrefix} Warmer light in the evening is gentler on alertness than cool white.`,
          actuation: 'automatic',
          action: {
            type: 'hue.set_color_temperature',
            provider: 'hue',
            params: { deviceId: light.id, mirek: intent.targetMirek },
          },
        });
      }
    }
  }

  // ---- Music ---------------------------------------------------------
  // Never hijacks playback already in progress.
  if (prefs.musicEnabled && intent.musicCategory && capabilities.musicAvailable && !prefs.musicAlreadyPlaying) {
    changes.push({
      channel: 'music',
      summary: `Start ${intent.musicCategory} music`,
      reason: `${reasonPrefix} ${intent.musicCategory === 'calm' ? 'Calmer audio supports a reset.' : 'Matched to what you’re doing.'}`,
      actuation: 'automatic',
      action: { type: 'spotify.play_playlist', provider: 'spotify', params: { category: intent.musicCategory } },
    });
  }

  // ---- Apple Home scene ----------------------------------------------
  // Only ever an existing scene, matched by the user's own naming.
  if (prefs.sceneEnabled && capabilities.homeScenes.length > 0) {
    const match = capabilities.homeScenes.find((scene) =>
      intent.sceneNameHints.some((hint) => scene.name.toLowerCase().includes(hint)),
    );
    if (match) {
      changes.push({
        channel: 'scene',
        summary: `Run your “${match.name}” scene`,
        reason: `${reasonPrefix} This is a scene you already set up for moments like this.`,
        actuation: 'queued_to_device',
        action: { type: 'home.run_scene', provider: 'homekit', params: { sceneId: match.sceneId, sceneName: match.name } },
      });
    }
  }

  // ---- Temperature (recommendation only) -----------------------------
  // See the file header: no write path exists. This is advice, and it
  // is labelled as advice.
  if (
    prefs.temperatureEnabled &&
    capabilities.roomTemperatureC !== null &&
    (state === 'preparing_for_sleep' || state === 'sleepy') &&
    prefs.sleepTempMaxC !== null &&
    capabilities.roomTemperatureC > prefs.sleepTempMaxC
  ) {
    const current = capabilities.roomTemperatureC;
    const target = clampDelta(current, prefs.sleepTempMaxC, prefs.maxTemperatureDeltaC);
    changes.push({
      channel: 'temperature',
      summary: `${capabilities.roomName ?? 'Room'} ${Math.round(celsiusToF(current))}°F → ${Math.round(celsiusToF(target))}°F`,
      reason: `You're preparing for sleep and ${capabilities.roomName ?? 'the room'} is above the sleep range you set.`,
      actuation: 'manual_only',
      from: Math.round(celsiusToF(current)),
      to: Math.round(celsiusToF(target)),
    });
  }

  return {
    state,
    name: intent.name,
    headline: changes.length > 0 ? intent.headline : 'Nothing to adjust right now.',
    changes,
    durationMinutes: intent.durationMinutes,
    noChangesNeeded: changes.length === 0,
  };
}
