import type { AutomationRuleDefinition } from '@moodsync/shared';
import type { TrendResult } from './insights.js';

/**
 * Wires up the `Recommendation` Prisma model (`suggestedActions: Json`,
 * `status: PENDING|ACCEPTED|DISMISSED|EXPIRED`), which existed in the
 * schema and was read/written by zero code before this — see
 * docs/DECISION_ENGINE_ROADMAP.md's "Recommendations" entry.
 *
 * Deliberately references a `templateId` (matching
 * `frontend/src/components/dashboard/RuleForm.tsx`'s `TEMPLATES` catalog)
 * rather than a raw `AutomationAction[]` blueprint. Hue actions need a
 * concrete `deviceId` this heuristic has no way to know — MoodSync
 * doesn't ask the user which light to control before suggesting a rule.
 * Pointing at the existing, already-verified template (which the rule
 * builder already prompts a device selection for) is the honest version
 * of "AI suggests a rule": a real, actionable pointer, not a
 * half-built rule that would fail with a missing-device error the
 * moment it ran.
 */
export interface RecommendationCandidate {
  templateId: string;
  title: string;
  description: string;
}

function hasMatchingRule(rules: AutomationRuleDefinition[], fields: string[]): boolean {
  return rules.some((rule) => rule.enabled && rule.conditions.some((c) => fields.includes(c.field)));
}

/** Thresholds are MoodSync's own engineering heuristic, not a clinical
 * cutoff — same "estimate, not measurement" framing as wellness.ts's
 * scores this reads from. Only suggests a rule the user doesn't already
 * have something like, so this never nags about a template they've
 * already adopted (under any condition targeting the same fields, not
 * just an exact match on this heuristic's own suggested condition). */
export function generateRecommendations(params: {
  wellnessTrends: TrendResult[];
  existingRules: AutomationRuleDefinition[];
}): RecommendationCandidate[] {
  const { wellnessTrends, existingRules } = params;
  const candidates: RecommendationCandidate[] = [];

  const stress = wellnessTrends.find((t) => t.metric === 'stress');
  if (stress && stress.direction === 'up' && stress.current >= 65 && !hasMatchingRule(existingRules, ['heartRate', 'wellness.stress'])) {
    candidates.push({
      templateId: 'elevated-stress',
      title: 'Try the "Elevated Stress" automation',
      description: `Your computed Stress score has trended up recently (${stress.previous} → ${stress.current}). The "Elevated Stress" template dims your Hue lights and shifts to a warmer color temperature when your heart rate spikes — you don't have a rule reacting to this yet.`,
    });
  }

  const recovery = wellnessTrends.find((t) => t.metric === 'recovery');
  if (
    recovery &&
    recovery.direction === 'down' &&
    recovery.current <= 40 &&
    !hasMatchingRule(existingRules, ['activityLevel', 'wellness.recovery'])
  ) {
    candidates.push({
      templateId: 'recovery',
      title: 'Try the "Recovery" automation',
      description: `Your computed Recovery score has trended down recently (${recovery.previous} → ${recovery.current}). The "Recovery" template lowers your Hue lights' intensity after a period of high activity — you don't have a rule reacting to this yet.`,
    });
  }

  return candidates;
}
