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
  title: string;
  description: string;
  /** 'template' (default): points at an existing RuleForm.tsx template
   * the user doesn't have a rule for yet. 'edit-rule': points at
   * changing something about a rule the user already has — the
   * skip-rate heuristic below suggests swapping a specific playlist,
   * not adopting a new template, so it needs its own action shape
   * rather than stretching `templateId` to mean something it doesn't. */
  kind: 'template' | 'edit-rule';
  templateId?: string;
  ruleId?: string;
}

export interface PlaylistSkipStat {
  ruleId: string;
  ruleName: string;
  playlistUri: string;
  /** 0-1. Computed by the caller from MusicPlayLog rows (see
   * musicPlayLogRepository.listRecentCheckedForPlaylist) — this module
   * stays DB-free, same convention as the wellness-trend heuristics
   * above. */
  skipRate: number;
  sampleSize: number;
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
/** A skip-rate this high is MoodSync's own engineering cutoff for "worth
 * flagging," not a validated behavioral threshold — same "estimate, not
 * measurement" framing as every other heuristic here. Requires a real
 * minimum sample size first so 1-of-1 "skipped" doesn't trigger a
 * suggestion off a single data point. */
const SKIP_RATE_THRESHOLD = 0.6;
const MIN_SKIP_SAMPLE_SIZE = 5;

export function generateRecommendations(params: {
  wellnessTrends: TrendResult[];
  existingRules: AutomationRuleDefinition[];
  playlistSkipStats?: PlaylistSkipStat[];
}): RecommendationCandidate[] {
  const { wellnessTrends, existingRules, playlistSkipStats = [] } = params;
  const candidates: RecommendationCandidate[] = [];

  const stress = wellnessTrends.find((t) => t.metric === 'stress');
  if (stress && stress.direction === 'up' && stress.current >= 65 && !hasMatchingRule(existingRules, ['heartRate', 'wellness.stress'])) {
    candidates.push({
      kind: 'template',
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
      kind: 'template',
      templateId: 'recovery',
      title: 'Try the "Recovery" automation',
      description: `Your computed Recovery score has trended down recently (${recovery.previous} → ${recovery.current}). The "Recovery" template lowers your Hue lights' intensity after a period of high activity — you don't have a rule reacting to this yet.`,
    });
  }

  for (const stat of playlistSkipStats) {
    if (stat.sampleSize < MIN_SKIP_SAMPLE_SIZE || stat.skipRate < SKIP_RATE_THRESHOLD) continue;
    const skipPercent = Math.round(stat.skipRate * 100);
    candidates.push({
      kind: 'edit-rule',
      ruleId: stat.ruleId,
      title: `"${stat.ruleName}" keeps getting skipped`,
      description: `The playlist "${stat.ruleName}" queues gets changed or stopped ${skipPercent}% of the time it plays (${stat.sampleSize} recent plays checked) — likely not the right fit for this automation. Consider picking a different playlist for this rule.`,
    });
  }

  return candidates;
}
