import type { SmartHomeProviderId } from './wearables.js';

/** The biometric fields a rule's condition can reference. Kept as a union
 * (not `string`) so the rule builder UI and the engine can't drift apart
 * on what's actually evaluable. */
export type BiometricField =
  | 'heartRate'
  | 'restingHeartRate'
  | 'sleepScore'
  | 'recoveryScore'
  | 'stressLevel'
  | 'activityLevel'
  | 'steps'
  | 'calories';

export type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq';

export interface RuleCondition {
  field: BiometricField;
  operator: ComparisonOperator;
  value: number;
}

export type ActionType =
  | 'hue.set_scene'
  | 'hue.set_brightness'
  | 'hue.set_color_temperature'
  | 'spotify.play_playlist'
  | 'notification.reduce_intensity';

export interface AutomationAction {
  type: ActionType;
  provider: SmartHomeProviderId | 'notification';
  /** Action-specific payload, validated per-type in ai/src/actions.ts —
   * kept as unknown at this layer so new action types don't require a
   * shared-package release for every new field shape. */
  params: Record<string, unknown>;
}

/**
 * A user-configured rule: ALL conditions must hold (AND) for the actions
 * to fire. Cross-field OR logic is intentionally out of v1 scope — see
 * ai/README.md for why AND-only rules were chosen for the first version.
 */
export interface AutomationRuleDefinition {
  id: string;
  userId: string;
  name: string;
  enabled: boolean;
  conditions: RuleCondition[];
  actions: AutomationAction[];
  /** Minimum minutes between two firings of this same rule, to stop a
   * bouncing biometric value (e.g. HR crossing a threshold repeatedly)
   * from spamming automations. */
  cooldownMinutes: number;
}
