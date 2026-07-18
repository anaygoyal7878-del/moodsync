import type {
  AutomationRuleDefinition,
  BiometricField,
  LocationEventType,
  NormalizedBiometricReading,
  RuleCondition,
  TimeWindow,
  WellnessField,
} from '@moodsync/shared';
import type { WellnessScores } from './wellness.js';

function compare(actual: number, operator: RuleCondition['operator'], expected: number): boolean {
  switch (operator) {
    case 'lt':
      return actual < expected;
    case 'lte':
      return actual <= expected;
    case 'gt':
      return actual > expected;
    case 'gte':
      return actual >= expected;
    case 'eq':
      return actual === expected;
  }
}

function isWellnessField(field: RuleCondition['field']): field is WellnessField {
  return field.startsWith('wellness.');
}

/** Strips the `wellness.` prefix to get the `WellnessScores` key — the
 * suffix is defined to match exactly, see `WellnessField`'s doc comment
 * in shared/src/automation.ts. */
function wellnessScoreKey(field: WellnessField): keyof WellnessScores {
  return field.slice('wellness.'.length) as keyof WellnessScores;
}

/**
 * A condition whose field is absent never matches — a rule referencing
 * `recoveryScore` simply won't fire for a provider that doesn't expose
 * recovery, and a rule referencing `wellness.stress` won't fire when
 * that score couldn't be computed (missing HRV history, etc. — see
 * ai/src/wellness.ts), rather than throwing or silently treating a
 * missing value as 0. This is the enforcement point for the "decision
 * engine must handle partial data" rule described in shared/wearables.ts.
 *
 * `wellnessScores` is optional and computed by the caller (dispatch.ts),
 * not here — this module stays pure/DB-free, and score computation needs
 * a trailing-reading history this function doesn't have access to. A
 * rule with a `wellness.*` condition simply never matches when no scores
 * were passed in (e.g. a caller that hasn't been updated to compute them
 * yet), same "absent field never matches" behavior.
 */
function conditionMatches(condition: RuleCondition, reading: NormalizedBiometricReading, wellnessScores?: WellnessScores): boolean {
  if (isWellnessField(condition.field)) {
    if (!wellnessScores) return false;
    const value = wellnessScores[wellnessScoreKey(condition.field)].value;
    if (value === null) return false;
    return compare(value, condition.operator, condition.value);
  }
  const value = reading[condition.field as BiometricField];
  if (value === undefined) return false;
  return compare(value, condition.operator, condition.value);
}

/** "HH:mm" -> minutes since midnight, for simple numeric comparison. */
function minutesOfDay(hhmm: string): number {
  const parts = hhmm.split(':');
  const h = Number(parts[0] ?? 0);
  const m = Number(parts[1] ?? 0);
  return h * 60 + m;
}

/** Minutes-since-midnight for `now` as observed in the given IANA
 * timezone (e.g. "America/Chicago") — not the Node process's local
 * timezone, which is what `now.getHours()` would give. */
function zonedMinutesOfDay(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/**
 * True when `now` falls within a rule's optional daily local-time window.
 * A window where `start > end` (e.g. 22:00-06:00) wraps past midnight —
 * see `TimeWindow`'s doc comment in shared/src/automation.ts. `timezone`
 * is the user's stored `User.timezone` (an IANA name, e.g.
 * "America/Chicago") — falls back to "UTC" if omitted or invalid, same
 * as the Prisma column's default. This function does the zoning itself
 * via `Intl.DateTimeFormat` rather than requiring the caller to have
 * pre-converted `now`, so every call site (dispatch, notifications,
 * scheduled ticks) evaluates the same way.
 */
export function withinTimeWindow(window: TimeWindow, now: Date, timezone: string = 'UTC'): boolean {
  let nowMinutes: number;
  try {
    nowMinutes = zonedMinutesOfDay(now, timezone);
  } catch {
    nowMinutes = zonedMinutesOfDay(now, 'UTC');
  }
  const start = minutesOfDay(window.start);
  const end = minutesOfDay(window.end);
  if (start <= end) return nowMinutes >= start && nowMinutes <= end;
  return nowMinutes >= start || nowMinutes <= end; // wraps past midnight
}

/**
 * v1 rules are AND-only across all biometric conditions — no per-condition
 * OR, no nested groups. This is a deliberate scope cut: OR/grouping adds
 * real UI complexity (a rule builder that supports boolean trees) for a
 * use case that's fully covered in v1 by letting a user create multiple
 * separate rules that each fire independently, which is operationally
 * equivalent to OR at the rule-set level.
 *
 * A rule with zero conditions is normally never matched (guards against an
 * accidentally-empty rule always firing) — the one exception is a
 * schedule-only rule that sets `timeWindow` with no biometric conditions
 * at all (e.g. Focus Mode, Sleep Preparation — see
 * docs/DECISION_ENGINE_ARCHITECTURE.md), which is valid by design.
 */
export function evaluateRule(
  rule: AutomationRuleDefinition,
  reading: NormalizedBiometricReading,
  now: Date = new Date(),
  wellnessScores?: WellnessScores,
  timezone: string = 'UTC',
): boolean {
  if (!rule.enabled) return false;
  if (rule.conditions.length === 0 && !rule.timeWindow) return false;
  if (rule.timeWindow && !withinTimeWindow(rule.timeWindow, now, timezone)) return false;
  return rule.conditions.every((condition) => conditionMatches(condition, reading, wellnessScores));
}

/** Returns every rule (from the given set) that matches this reading —
 * cooldown enforcement happens one layer up, where execution history is
 * available (see docs/MILESTONES.md for where that lands). */
export function evaluateRules(
  rules: AutomationRuleDefinition[],
  reading: NormalizedBiometricReading,
  now: Date = new Date(),
  wellnessScores?: WellnessScores,
  timezone: string = 'UTC',
): AutomationRuleDefinition[] {
  return rules.filter((rule) => evaluateRule(rule, reading, now, wellnessScores, timezone));
}

/**
 * A location-triggered rule (`AutomationRuleDefinition.locationTrigger`)
 * matches an ARRIVED/DEPARTED event of the same type, still respecting
 * `timeWindow` if set. Unlike a biometric-triggered rule, `conditions`
 * are optional here even when non-empty — a pure location rule
 * (`conditions: []`, no `timeWindow`) is valid by design (the location
 * event itself is the whole trigger), and a rule that also sets
 * biometric conditions requires a `latestReading` to check them against
 * (there's no reading tied to the location event itself — see
 * ai/src/dispatch.ts's `dispatchForLocationEvent`) — never matches
 * without one rather than guessing.
 */
export function evaluateLocationRule(
  rule: AutomationRuleDefinition,
  type: LocationEventType,
  now: Date = new Date(),
  latestReading?: NormalizedBiometricReading,
  wellnessScores?: WellnessScores,
  timezone: string = 'UTC',
): boolean {
  if (!rule.enabled) return false;
  if (rule.locationTrigger !== type) return false;
  if (rule.timeWindow && !withinTimeWindow(rule.timeWindow, now, timezone)) return false;
  if (rule.conditions.length === 0) return true;
  if (!latestReading) return false;
  return rule.conditions.every((condition) => conditionMatches(condition, latestReading, wellnessScores));
}

export function evaluateLocationRules(
  rules: AutomationRuleDefinition[],
  type: LocationEventType,
  now: Date = new Date(),
  latestReading?: NormalizedBiometricReading,
  wellnessScores?: WellnessScores,
  timezone: string = 'UTC',
): AutomationRuleDefinition[] {
  return rules.filter((rule) => evaluateLocationRule(rule, type, now, latestReading, wellnessScores, timezone));
}
