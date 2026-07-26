import { pendingDeviceCommandRepository, userPreferencesRepository } from '@moodsync/database';
import type { AutomationAction, SmartHomeProviderId } from '@moodsync/shared';
import { executeHueAction } from './hueActionExecutor.js';
import { executeSpotifyAction } from './spotifyActionExecutor.js';

export interface ActionExecutionResult {
  /** true when the action was queued for a device to pick up and run
   * later, rather than executed synchronously here — HomeKit has no
   * cloud API (see docs/HOMEKIT_ARCHITECTURE.md), so its "execution" is
   * always a queue write, never an immediate side effect. */
  queued: boolean;
  /** Set when a `homekit.security_control` action was matched but
   * UserPreferences.securityControlEnabled is false — the action is
   * refused outright, never queued, distinct from `queued: false`
   * (which otherwise means "executed synchronously"). dispatch.ts
   * records this as SKIPPED_SECURITY_CONTROL_DISABLED for the action's
   * rule. See docs/HOME_SCENES_ARCHITECTURE.md. */
  skippedSecurityControlDisabled?: boolean;
}

export type ActionExecutor = (userId: string, action: AutomationAction, ruleId: string) => Promise<ActionExecutionResult>;

/**
 * dispatch.ts's action-execution step used to be a hardcoded if/else on
 * `action.provider`. HomeKit becoming a third action-taking provider
 * (after Hue, Spotify) was the trigger to replace that with a real
 * registry — see docs/DECISION_ENGINE_ROADMAP.md's "Pluggable
 * action-executor registry" entry. Adding a fourth provider (e.g. a
 * future certified smart-lock partner surfaced through HomeKit or
 * Alexa) means adding one entry here, not another branch in dispatch.ts.
 *
 * `'notification'` and `'ecobee'`/`'alexa'` (modeled in
 * `SmartHomeProviderId` but with no action executor) are deliberately
 * absent — every dispatch outcome already generates a notification via
 * `notificationExecutor.ts` regardless of a rule's actions, and Ecobee/
 * Alexa have no action-taking capability today (Alexa is voice-in only;
 * see `docs/ALEXA_ARCHITECTURE.md`). Looking either up in this registry
 * correctly falls through to `executeAction`'s "not yet implemented"
 * error rather than silently no-opping.
 */
const registry: Partial<Record<SmartHomeProviderId, ActionExecutor>> = {
  hue: async (userId, action) => {
    await executeHueAction(userId, action);
    return { queued: false };
  },
  spotify: async (userId, action, ruleId) => {
    await executeSpotifyAction(userId, action, ruleId);
    return { queued: false };
  },
  homekit: async (userId, action, ruleId) => {
    if (action.type === 'homekit.security_control') {
      const enabled = await userPreferencesRepository.getSecurityControlEnabled(userId);
      if (!enabled) {
        return { queued: false, skippedSecurityControlDisabled: true };
      }
    }
    await pendingDeviceCommandRepository.create({ userId, provider: 'HOMEKIT', action, ruleId });
    return { queued: true };
  },
  // Same "can't execute server-side" situation as homekit, different
  // reason: Bluetooth needs physical proximity, not a cloud API — see
  // docs/HUE_BLE_ARCHITECTURE.md.
  hue_ble: async (userId, action, ruleId) => {
    await pendingDeviceCommandRepository.create({ userId, provider: 'HUE_BLE', action, ruleId });
    return { queued: true };
  },
};

export async function executeAction(userId: string, action: AutomationAction, ruleId: string): Promise<ActionExecutionResult> {
  const executor = registry[action.provider as SmartHomeProviderId];
  if (!executor) {
    throw new Error(`Provider "${action.provider}" automation dispatch is not yet implemented`);
  }
  return executor(userId, action, ruleId);
}
