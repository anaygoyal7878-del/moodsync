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
  kind: 'template' | 'edit-rule' | 'run-scene' | 'open';
  templateId?: string;
  /** Only for `kind === 'open'`: an in-app destination that acts on the
   * suggestion directly (the breathing session, the music hub). Needs no
   * device, so it is what a user with no smart home gets. */
  href?: string;
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

/** A skip-rate this high is MoodSync's own engineering cutoff for "worth
 * flagging," not a validated behavioral threshold — same "estimate, not
 * measurement" framing as every other heuristic here. Requires a real
 * minimum sample size first so 1-of-1 "skipped" doesn't trigger a
 * suggestion off a single data point. */
const SKIP_RATE_THRESHOLD = 0.6;

/** Acute thresholds are deliberately stricter than the trend ones
 * (65 / 40). A single reading is noisier than a week's average, so it has
 * to be clearly elevated on its own before it triggers anything. */
const ACUTE_STRESS_THRESHOLD = 75;
const ACUTE_LOW_RECOVERY_THRESHOLD = 25;
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
  /** Scores from the most recent reading. The trends above compare one
   * week's average with the previous week's, which dilutes an acute
   * stretch: two hard days inside a calm fortnight averaged to a stress
   * of ~60 while the latest reading was 100, so the engine stayed
   * silent exactly when a suggestion was most useful. Optional so
   * existing callers keep working. */
  currentScores?: { stress: number | null; recovery: number | null };
}): RecommendationCandidate[] {
  const {
    wellnessTrends,
    existingRules,
    playlistSkipStats = [],
    cachedScenes = [],
    currentScores,
  } = params;
  const candidates: RecommendationCandidate[] = [];

  const stress = wellnessTrends.find((t) => t.metric === 'stress');
  const stressTrending = !!stress && stress.direction === 'up' && stress.current >= 65;
  const stressNow = currentScores?.stress ?? null;
  const stressAcute = stressNow !== null && stressNow >= ACUTE_STRESS_THRESHOLD;
  if (stressTrending || stressAcute) {
    // Say which signal fired. A trend sentence quoting a weekly average
    // of 60 next to a live reading of 100 would read as contradictory.
    const why = stressTrending
      ? `Your computed Stress score has trended up recently (${stress!.previous} → ${stress!.current}).`
      : `Your latest Stress reading is ${stressNow}, well above your usual range.`;
    const relaxScene = findRelaxScene(cachedScenes);
    if (relaxScene) {
      candidates.push({
        kind: 'run-scene',
        sceneId: relaxScene.sceneId,
        sceneName: relaxScene.name,
        title: `Run your "${relaxScene.name}" scene?`,
        description: `${why} Want to run your "${relaxScene.name}" Apple Home scene now?`,
      });
    }
    // Previously this pointed at an "Elevated Stress" Hue template. Hue
    // and its templates were removed from the UI, so every stress
    // suggestion sent people to a template that no longer existed. The
    // breathing session works for everyone, with or without a smart home.
    candidates.push({
      kind: 'open',
      href: '/dashboard/meditation',
      title: 'Take five minutes to breathe',
      description: `${why} A few minutes of slow breathing, with a longer exhale than inhale, is a quick way to bring your heart rate down.`,
    });
  }

  const recovery = wellnessTrends.find((t) => t.metric === 'recovery');
  const recoveryTrending = !!recovery && recovery.direction === 'down' && recovery.current <= 40;
  const recoveryNow = currentScores?.recovery ?? null;
  const recoveryAcute = recoveryNow !== null && recoveryNow <= ACUTE_LOW_RECOVERY_THRESHOLD;
  if (recoveryTrending || recoveryAcute) {
    const why = recoveryTrending
      ? `Your computed Recovery score has trended down recently (${recovery!.previous} → ${recovery!.current}).`
      : `Your latest Recovery reading is ${recoveryNow}, well below your usual range.`;
    // Replaces a "Recovery" Hue template removed along with Hue — see the
    // stress suggestion above.
    candidates.push({
      kind: 'open',
      href: '/dashboard/music',
      title: 'Wind down with something calm',
      description: `${why} Slow, familiar music is an easy way to make room for recovery. MoodSync will suggest what to put on.`,
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
