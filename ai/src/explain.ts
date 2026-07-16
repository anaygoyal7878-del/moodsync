import type { AutomationRuleDefinition, NormalizedBiometricReading, RuleCondition } from '@moodsync/shared';

const FIELD_LABELS: Record<RuleCondition['field'], string> = {
  heartRate: 'heart rate',
  restingHeartRate: 'resting heart rate',
  sleepScore: 'sleep score',
  recoveryScore: 'recovery score',
  stressLevel: 'stress level',
  activityLevel: 'activity level',
  steps: 'steps',
  calories: 'calories',
};

const OPERATOR_PHRASES: Record<RuleCondition['operator'], string> = {
  lt: 'was below',
  lte: 'was at or below',
  gt: 'exceeded',
  gte: 'was at or above',
  eq: 'equaled',
};

function describeCondition(condition: RuleCondition, reading: NormalizedBiometricReading): string {
  const actual = reading[condition.field];
  const label = FIELD_LABELS[condition.field];
  const phrase = OPERATOR_PHRASES[condition.operator];
  const actualPart = actual !== undefined ? `${actual} ` : '';
  return `${actualPart}${label} ${phrase} your threshold of ${condition.value}`;
}

/**
 * Turns a matched rule's conditions plus the actual reading values into a
 * human-readable reason — the explainability layer described in
 * docs/DECISION_ENGINE_ARCHITECTURE.md. This is what's stored on
 * `AutomationExecutionLog.reason` and reused verbatim as a notification's
 * body text, so a user always sees *why* an automation fired, not just
 * that it did.
 */
export function explainTrigger(rule: AutomationRuleDefinition, reading: NormalizedBiometricReading): string {
  if (rule.conditions.length === 0) {
    return rule.timeWindow
      ? `Triggered because it's within "${rule.name}"'s scheduled time window (${rule.timeWindow.start}-${rule.timeWindow.end}).`
      : `Triggered by "${rule.name}".`;
  }

  const parts = rule.conditions.map((c) => describeCondition(c, reading));
  const conditionsText = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
  const timeText = rule.timeWindow ? ` (within your scheduled ${rule.timeWindow.start}-${rule.timeWindow.end} window)` : '';
  return `Triggered because ${conditionsText}${timeText}.`;
}

/** Explains why a rule that matched was skipped in favor of a
 * higher-priority rule targeting the same resource — see
 * `resourceKeyFor`/conflict resolution in ai/src/dispatch.ts. */
export function explainConflict(losingRule: AutomationRuleDefinition, winningRule: AutomationRuleDefinition, resourceKey: string): string {
  return `"${winningRule.name}" (priority ${winningRule.priority}) took precedence over "${losingRule.name}" (priority ${losingRule.priority}) for ${resourceKey}.`;
}

export function explainManualPause(untilIso: string): string {
  return `Automations are paused until ${new Date(untilIso).toLocaleString()} — a manual override you set from the dashboard.`;
}

export function explainRateLimit(rule: AutomationRuleDefinition, limit: number): string {
  return `"${rule.name}" was skipped because you've reached the safety limit of ${limit} automation${limit === 1 ? '' : 's'} per hour.`;
}
