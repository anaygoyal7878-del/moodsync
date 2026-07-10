import type { AutomationRuleDefinition, NormalizedBiometricReading, RuleCondition } from '@moodsync/shared';

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

/**
 * v1 rules are AND-only across all conditions — no per-condition OR, no
 * nested groups. This is a deliberate scope cut: OR/grouping adds real UI
 * complexity (a rule builder that supports boolean trees) for a use case
 * that's fully covered in v1 by letting a user create multiple separate
 * rules that each fire independently, which is operationally equivalent
 * to OR at the rule-set level.
 */
export function evaluateRule(rule: AutomationRuleDefinition, reading: NormalizedBiometricReading): boolean {
  if (!rule.enabled) return false;
  if (rule.conditions.length === 0) return false;
  return rule.conditions.every((condition) => conditionMatches(condition, reading));
}

/** Returns every rule (from the given set) that matches this reading —
 * cooldown enforcement happens one layer up, where execution history is
 * available (see docs/MILESTONES.md for where that lands). */
export function evaluateRules(
  rules: AutomationRuleDefinition[],
  reading: NormalizedBiometricReading,
): AutomationRuleDefinition[] {
  return rules.filter((rule) => evaluateRule(rule, reading));
}
