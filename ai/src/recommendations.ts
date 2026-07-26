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
  kind: 'template' | 'edit-rule' | 'run-scene';
  templateId?: string;
  ruleId?: string;
  /** Only present when `kind === 'run-scene'` — points at a cached
   * `HomeSceneSnapshot.sceneId` (see docs/HOME_SCENES_ARCHITECTURE.md).
   * Distinct from `kind: 'template'`/`'edit-rule'` because "run this
   * Apple Home scene right now" is a one-shot action, not adopting or
   * editing an `AutomationRule` — there was no existing shape for that
   * until this. Accepting queues a `homekit.run_scene` command via the
   * same `POST /home/scenes/:id/run` a manual Scene Manager button
   * press uses; MoodSync never runs it automatically just by
   * recommending it. */
  sceneId?: string;
  sceneName?: string;
}

/** Best-effort keyword match against cached scene names — HomeKit gives
 * MoodSync no semantic understanding of what a scene *does*, only its
 * name, so this is a heuristic string match, not real comprehension.
 * Documented as such rather than implying MoodSync understands scene
 * content. */
const RELAX_SCENE_KEYWORDS = ['relax', 'wind down', 'wind-down', 'calm', 'unwind'];

function findRelaxScene(scenes: { sceneId: string; name: string }[]): { sceneId: string; name: string } | undefined {
  return scenes.find((s) => RELAX_SCENE_KEYWORDS.some((keyword) => s.name.toLowerCase().includes(keyword)));
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
  /** Cached Apple Home scenes (see docs/HOME_SCENES_ARCHITECTURE.md) —
   * lets this heuristic suggest running a real, existing scene instead
   * of only ever suggesting a new Hue-based rule template. Optional so
   * every existing caller (and test) that has no Home snapshot yet
   * keeps working unchanged. */
  cachedScenes?: { sceneId: string; name: string }[];
}): RecommendationCandidate[] {
  const { wellnessTrends, existingRules, playlistSkipStats = [], cachedScenes = [] } = params;
  const candidates: RecommendationCandidate[] = [];

  const stress = wellnessTrends.find((t) => t.metric === 'stress');
  if (stress && stress.direction === 'up' && stress.current >= 65) {
    const relaxScene = findRelaxScene(cachedScenes);
    if (relaxScene) {
      candidates.push({
        kind: 'run-scene',
        sceneId: relaxScene.sceneId,
        sceneName: relaxScene.name,
        title: `Run your "${relaxScene.name}" scene?`,
        description: `Your computed Stress score has trended up recently (${stress.previous} → ${stress.current}). You appear stressed — want to run your "${relaxScene.name}" Apple Home scene now?`,
      });
    }
    if (!hasMatchingRule(existingRules, ['heartRate', 'wellness.stress'])) {
      candidates.push({
        kind: 'template',
        templateId: 'elevated-stress',
        title: 'Try the "Elevated Stress" automation',
        description: `Your computed Stress score has trended up recently (${stress.previous} → ${stress.current}). The "Elevated Stress" template dims your Hue lights and shifts to a warmer color temperature when your heart rate spikes — you don't have a rule reacting to this yet.`,
      });
    }
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
