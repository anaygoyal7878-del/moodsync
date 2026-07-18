import type {
  AutomationRuleDefinition,
  BiometricField,
  LocationEventType,
  NormalizedBiometricReading,
  RuleCondition,
  WellnessField,
} from '@moodsync/shared';
import type { WellnessScores } from './wellness.js';

const BIOMETRIC_FIELD_LABELS: Record<BiometricField, string> = {
  heartRate: 'heart rate',
  restingHeartRate: 'resting heart rate',
  sleepScore: 'sleep score',
  recoveryScore: 'recovery score',
  stressLevel: 'stress level',
  activityLevel: 'activity level',
  steps: 'steps',
  calories: 'calories',
};

/** Labeled distinctly from the raw-biometric fields above ("Stress
 * score" vs. "stress level") so a notification never leaves it ambiguous
 * whether it's citing a provider-reported value or MoodSync's own
 * computed score — see docs/WELLNESS_SCORING.md. */
const WELLNESS_FIELD_LABELS: Record<WellnessField, string> = {
  'wellness.stress': 'Stress score',
  'wellness.recovery': 'Recovery score',
  'wellness.sleep': 'Sleep score',
  'wellness.energy': 'Energy score',
  'wellness.fatigue': 'Fatigue score',
  'wellness.focus': 'Focus score',
  'wellness.relaxation': 'Relaxation score',
  'wellness.overall': 'Overall wellness score',
};

const OPERATOR_PHRASES: Record<RuleCondition['operator'], string> = {
  lt: 'was below',
  lte: 'was at or below',
  gt: 'exceeded',
  gte: 'was at or above',
  eq: 'equaled',
};

function isWellnessField(field: RuleCondition['field']): field is WellnessField {
  return field.startsWith('wellness.');
}

function describeCondition(condition: RuleCondition, reading: NormalizedBiometricReading, wellnessScores: WellnessScores | undefined): string {
  const phrase = OPERATOR_PHRASES[condition.operator];

  if (isWellnessField(condition.field)) {
    const key = condition.field.slice('wellness.'.length) as keyof WellnessScores;
    const actual = wellnessScores?.[key].value;
    const label = WELLNESS_FIELD_LABELS[condition.field];
    const actualPart = actual !== undefined && actual !== null ? `${actual} ` : '';
    return `${actualPart}${label} ${phrase} your threshold of ${condition.value}`;
  }

  const actual = reading[condition.field];
  const label = BIOMETRIC_FIELD_LABELS[condition.field];
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
export function explainTrigger(rule: AutomationRuleDefinition, reading: NormalizedBiometricReading, wellnessScores?: WellnessScores): string {
  if (rule.conditions.length === 0) {
    return rule.timeWindow
      ? `Triggered because it's within "${rule.name}"'s scheduled time window (${rule.timeWindow.start}-${rule.timeWindow.end}).`
      : `Triggered by "${rule.name}".`;
  }

  const parts = rule.conditions.map((c) => describeCondition(c, reading, wellnessScores));
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

/** The trigger explanation for a location-triggered rule
 * (`AutomationRuleDefinition.locationTrigger`) — parallel to
 * `explainTrigger`'s biometric-condition text, since there's no reading
 * value to cite for a geofence event. Takes just the event type, not
 * the rule, since the location event itself is the only thing being
 * described here (a rule that also combines biometric conditions still
 * only cites the location trigger in this text — see
 * ai/src/ruleEngine.ts's `evaluateLocationRule` for how those
 * conditions gate matching without being echoed back in the reason). */
export function explainLocationTrigger(type: LocationEventType): string {
  const event = type === 'ARRIVED' ? 'you arrived home' : 'you left home';
  return `Triggered because ${event}.`;
}

export function explainManualPause(untilIso: string): string {
  return `Automations are paused until ${new Date(untilIso).toLocaleString()} — a manual override you set from the dashboard.`;
}

/** Same shape as `explainManualPause`, scoped to one provider — see
 * `ResourcePause` in schema.prisma and `ai/src/dispatch.ts`'s per-action
 * pause check. */
export function explainResourcePause(provider: string, untilIso: string): string {
  return `${provider} automations are paused until ${new Date(untilIso).toLocaleString()} — a manual override you set from the dashboard.`;
}

export function explainRateLimit(rule: AutomationRuleDefinition, limit: number): string {
  return `"${rule.name}" was skipped because you've reached the safety limit of ${limit} automation${limit === 1 ? '' : 's'} per hour.`;
}
