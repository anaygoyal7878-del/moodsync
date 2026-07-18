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

/** MoodSync's own computed wellness scores (ai/src/wellness.ts), prefixed
 * `wellness.` so a condition can unambiguously target a computed score
 * instead of a raw provider field (e.g. `wellness.stress` vs. the
 * provider-reported `stressLevel`, which almost no provider actually
 * populates — see shared/src/wearables.ts). The suffix after the dot
 * matches a `WellnessScores` key exactly. */
export type WellnessField =
  | 'wellness.stress'
  | 'wellness.recovery'
  | 'wellness.sleep'
  | 'wellness.energy'
  | 'wellness.fatigue'
  | 'wellness.focus'
  | 'wellness.relaxation'
  | 'wellness.overall';

export type ComparisonOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq';

export interface RuleCondition {
  field: BiometricField | WellnessField;
  operator: ComparisonOperator;
  value: number;
}

export type ActionType =
  | 'hue.set_scene'
  | 'hue.set_brightness'
  | 'hue.set_color_temperature'
  | 'spotify.play_playlist'
  | 'notification.reduce_intensity'
  /** Activates a HomeKit Scene the user has pre-configured in Apple's
   * Home app — the only control surface a third-party app has over
   * HomeKit (no per-accessory control, no arbitrary state queries — see
   * docs/HOMEKIT_ARCHITECTURE.md). Unlike hue/spotify actions, this
   * can't be executed server-side at all: HomeKit has no cloud API,
   * only the native framework running on the user's own device, so
   * dispatch queues this as a `PendingDeviceCommand` for the iOS
   * companion app to pick up and execute the next time it's opened. */
  | 'homekit.activate_scene';

export interface AutomationAction {
  type: ActionType;
  provider: SmartHomeProviderId | 'notification';
  /** Action-specific payload, validated per-type in ai/src/actions.ts —
   * kept as unknown at this layer so new action types don't require a
   * shared-package release for every new field shape. */
  params: Record<string, unknown>;
}

/** A daily local-time window (e.g. "09:00"-"17:00") a rule can additionally
 * require, alongside its biometric conditions — see
 * docs/DECISION_ENGINE_ARCHITECTURE.md's scheduling-system section for why
 * this exists (schedule-triggered automations like Focus Mode/Sleep
 * Preparation have no biometric trigger at all). `start`/`end` are
 * "HH:mm" 24-hour strings, evaluated in the reading/tick's local
 * interpretation of `User.timezone`. A window that wraps past midnight
 * (e.g. 22:00-06:00) is supported: `start > end` means "wraps overnight." */
export interface TimeWindow {
  start: string;
  end: string;
}

/**
 * A user-configured rule: ALL conditions must hold (AND) for the actions
 * to fire, and if `timeWindow` is set, the current time must also fall
 * inside it. Cross-field OR logic is intentionally out of v1 scope — see
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
  /** 0-100, default 50. Used only to resolve conflicts when two enabled
   * rules match the same reading/tick and target the same resource (see
   * `resourceKeyFor` in ai/src/dispatch.ts) — higher wins. Rules that
   * never share a resource with another matched rule are unaffected by
   * priority entirely. */
  priority: number;
  /** Optional daily local-time window this rule additionally requires —
   * see `TimeWindow`. Rules with conditions.length === 0 are otherwise
   * never matched (ai/src/ruleEngine.ts), so a schedule-only rule (no
   * biometric condition at all) is the one case that's valid with an
   * empty `conditions` array, as long as `timeWindow` is set. */
  timeWindow?: TimeWindow;
  /** Per-rule notification opt-off — defaults to true (undefined is
   * treated as enabled everywhere this is read) so existing rules built
   * before this field existed keep notifying exactly as before. Distinct
   * from the account-wide `UserPreferences.notificationsEnabled` toggle:
   * this silences one specific rule's notifications while every other
   * rule (and the underlying AutomationExecutionLog audit trail) is
   * unaffected. */
  notificationsEnabled?: boolean;
}
