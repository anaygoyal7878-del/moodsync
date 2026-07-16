import type { AutomationRuleDefinition, NormalizedBiometricReading, RuleCondition, TimeWindow } from '@moodsync/shared';

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

/**
 * A condition whose field is absent on this reading never matches — a
 * rule referencing `recoveryScore` simply won't fire for a provider that
 * doesn't expose recovery, rather than throwing or silently treating a
 * missing value as 0. This is the enforcement point for the "decision
 * engine must handle partial data" rule described in shared/wearables.ts.
 */
function conditionMatches(condition: RuleCondition, reading: NormalizedBiometricReading): boolean {
  const value = reading[condition.field];
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

/**
 * True when `now` falls within a rule's optional daily local-time window.
 * A window where `start > end` (e.g. 22:00-06:00) wraps past midnight —
 * see `TimeWindow`'s doc comment in shared/src/automation.ts. `now`
 * should already be in the user's local time (the caller — the scheduled
 * dispatch tick — is responsible for the timezone conversion, this
 * function just compares minute-of-day numbers).
 */
export function withinTimeWindow(window: TimeWindow, now: Date): boolean {
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
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
export function evaluateRule(rule: AutomationRuleDefinition, reading: NormalizedBiometricReading, now: Date = new Date()): boolean {
  if (!rule.enabled) return false;
  if (rule.conditions.length === 0 && !rule.timeWindow) return false;
  if (rule.timeWindow && !withinTimeWindow(rule.timeWindow, now)) return false;
  return rule.conditions.every((condition) => conditionMatches(condition, reading));
}

/** Returns every rule (from the given set) that matches this reading —
 * cooldown enforcement happens one layer up, where execution history is
 * available (see docs/MILESTONES.md for where that lands). */
export function evaluateRules(
  rules: AutomationRuleDefinition[],
  reading: NormalizedBiometricReading,
  now: Date = new Date(),
): AutomationRuleDefinition[] {
  return rules.filter((rule) => evaluateRule(rule, reading, now));
}
