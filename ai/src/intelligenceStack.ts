import type { PersonalBaselines } from './personalBaselines.js';
import type { HealthScenario } from './healthScenarios.js';
import type { MemoryFinding } from './wellnessMemory.js';
import type { MusicEffectiveness } from './musicMemory.js';

/**
 * The intelligence stack — what MoodSync actually knows about one
 * person, arranged in tiers, plus an explicit account of what it does
 * not know yet and why.
 *
 * ## The problem this solves
 *
 * By the time this module was written, `ai/` had accumulated a dozen
 * modules that each learn something real from history — personal
 * baselines, researched scenarios, wellness-memory correlations, music
 * effectiveness, environment acceptance, habit streaks. Every one of
 * them worked. None of them knew about each other, and Clara was handed
 * two of them. The result was an assistant that could recite a resting
 * heart rate but could not say "walking helps *you* specifically, I've
 * seen it eleven times" — not because the data was missing, but because
 * nothing composed it.
 *
 * ## Why tiers, rather than one bag of facts
 *
 * Each layer here is only computable once the layer beneath it has
 * enough data. You cannot detect a researched scenario without a
 * personal baseline to measure against, and you cannot have a baseline
 * without readings. That is a genuine dependency, not a presentation
 * choice, so it is modelled as one:
 *
 *   observation -> baseline -> scenario -> correlation -> preference
 *
 * This is what "stacking" means concretely. A new user starts with
 * layer 0 and unlocks upward as data accrues, and the stack can say
 * exactly where they are and what the next unlock requires. Learning
 * becomes something the app can *show* rather than something it claims.
 *
 * ## Why the locked layers matter as much as the unlocked ones
 *
 * The most valuable field here is `cannotAnswer`. An assistant that
 * quietly guesses when it lacks data is worse than one that says it
 * lacks data, because the guess is indistinguishable from the knowledge.
 * Every locked layer names what it would take to unlock, so "I can't
 * answer that yet" can carry a reason and a number instead of being a
 * shrug — the difference between "I don't know" and "I need about four
 * more nights of sleep data before I can tell you that".
 *
 * Pure and DB-free, like the modules it composes: callers query, this
 * arranges.
 */

export type LayerId = 'observation' | 'baseline' | 'scenario' | 'correlation' | 'preference';

export interface IntelligenceLayer {
  id: LayerId;
  /** Human-readable name, safe to show. */
  name: string;
  /** True when this layer has enough data to say something real. */
  unlocked: boolean;
  /** Evidence actually backing this layer right now. */
  sampleSize: number;
  /** What `sampleSize` has to reach for this layer to unlock. */
  requiredSamples: number;
  /** Concrete things this layer currently knows. Empty when locked. */
  knows: string[];
  /** When locked, what would unlock it — phrased for a person, with a
   * number in it. Null when unlocked. */
  needs: string | null;
}

export interface IntelligenceStackResult {
  layers: IntelligenceLayer[];
  /** Deepest unlocked layer — the honest headline for "how well does
   * MoodSync know this person yet". Null on a brand-new account. */
  depth: LayerId | null;
  /** Kinds of question that can be answered from real data right now. */
  canAnswer: string[];
  /** Kinds of question that cannot, each paired with why not. This is
   * what lets a refusal be specific instead of generic. */
  cannotAnswer: string[];
}

/** Readings needed before a personal baseline means anything. Mirrors
 * `MIN_SAMPLES_FOR_BASELINE` in personalBaselines.ts — duplicated as a
 * local constant only to keep this module's dependency surface to
 * types, and asserted equal in the tests so the two cannot drift. */
const BASELINE_MIN = 5;
/** Occurrences needed before a correlation is a finding rather than a
 * coincidence. Mirrors `MIN_SAMPLE_SIZE` in wellnessMemory.ts. */
const CORRELATION_MIN = 3;
/** Completed sessions needed before a preference is real. Mirrors the
 * minimum musicMemory.ts applies before reporting effectiveness. */
const PREFERENCE_MIN = 3;

export interface IntelligenceStackInput {
  /** How many biometric readings exist for this user, in total. */
  readingCount: number;
  baselines: PersonalBaselines | null;
  scenarios: HealthScenario[];
  /** Correlation findings from wellness memory — what measurably moves
   * this user's numbers. */
  findings: MemoryFinding[];
  /** Per-playlist/genre effectiveness from completed music sessions. */
  musicEffects: MusicEffectiveness[];
}

export function buildIntelligenceStack(input: IntelligenceStackInput): IntelligenceStackResult {
  const { readingCount, baselines, scenarios, findings, musicEffects } = input;

  const observation: IntelligenceLayer = {
    id: 'observation',
    name: 'Current readings',
    unlocked: readingCount > 0,
    sampleSize: readingCount,
    requiredSamples: 1,
    knows: readingCount > 0 ? ['The latest values your wearable has synced'] : [],
    needs: readingCount > 0 ? null : 'Connect a wearable and sync once.',
  };

  const baselineSamples = baselines?.maxSampleSize ?? 0;
  const baselineUnlocked = baselines?.hasAnyBaseline === true;
  const baselineKnows: string[] = [];
  if (baselineUnlocked && baselines) {
    if (baselines.restingHeartRate) baselineKnows.push(`Your normal resting heart rate (~${baselines.restingHeartRate.baseline.toFixed(0)}bpm)`);
    if (baselines.heartRateVariability) baselineKnows.push(`Your normal HRV (~${baselines.heartRateVariability.baseline.toFixed(0)}ms)`);
    if (baselines.sleepScore) baselineKnows.push(`Your normal sleep score (~${baselines.sleepScore.baseline.toFixed(0)})`);
  }
  const baseline: IntelligenceLayer = {
    id: 'baseline',
    name: 'Your personal normal',
    unlocked: baselineUnlocked,
    sampleSize: baselineSamples,
    requiredSamples: BASELINE_MIN,
    knows: baselineKnows,
    needs: baselineUnlocked ? null : `About ${Math.max(1, BASELINE_MIN - baselineSamples)} more days of readings before your own normal ranges mean anything.`,
  };

  // Depends on baseline, not on readings: a scenario is a comparison,
  // and there is nothing to compare against until the layer below is up.
  const scenario: IntelligenceLayer = {
    id: 'scenario',
    name: 'Researched patterns',
    unlocked: baselineUnlocked,
    sampleSize: scenarios.length,
    requiredSamples: 0,
    knows: baselineUnlocked
      ? scenarios.length > 0
        ? scenarios.map((s) => s.title)
        : ['Nothing in the researched patterns currently applies to you — which is the normal, healthy case']
      : [],
    needs: baselineUnlocked ? null : 'Unlocks with your personal normal, since every pattern is measured against it.',
  };

  const strongFindings = findings.filter((f) => f.sampleSize >= CORRELATION_MIN);
  const correlationSamples = strongFindings.reduce((max, f) => Math.max(max, f.sampleSize), 0);
  const correlation: IntelligenceLayer = {
    id: 'correlation',
    name: 'What works for you',
    unlocked: strongFindings.length > 0,
    sampleSize: correlationSamples,
    requiredSamples: CORRELATION_MIN,
    knows: strongFindings.map(
      (f) => `${f.label}: your numbers move ${f.meanDelta >= 0 ? '+' : ''}${f.meanDelta.toFixed(1)} on average afterwards (${f.sampleSize} times measured)`,
    ),
    needs:
      strongFindings.length > 0
        ? null
        : `Log walks, meditation or focus sessions at least ${CORRELATION_MIN} times each — correlations need repeats before they are anything but coincidence.`,
  };

  const strongMusic = musicEffects.filter((m) => m.sessions >= PREFERENCE_MIN);
  const preferenceSamples = strongMusic.reduce((max, m) => Math.max(max, m.sessions), 0);
  const preference: IntelligenceLayer = {
    id: 'preference',
    name: 'What you respond to',
    unlocked: strongMusic.length > 0,
    sampleSize: preferenceSamples,
    requiredSamples: PREFERENCE_MIN,
    knows: strongMusic.map(
      (m) => `${m.label} (${m.mode}): heart rate moves ${m.meanHeartRateDelta >= 0 ? '+' : ''}${m.meanHeartRateDelta.toFixed(1)}bpm across ${m.sessions} sessions${m.helped ? ', which is the direction you want' : ''}`,
    ),
    needs:
      strongMusic.length > 0
        ? null
        : `Finish at least ${PREFERENCE_MIN} music sessions so their effect on your heart rate can be measured.`,
  };

  const layers = [observation, baseline, scenario, correlation, preference];

  // Depth is the deepest *contiguously* unlocked layer, not merely the
  // last unlocked one. A correlation that unlocked before a baseline
  // existed does not mean the stack is four deep — it means one upper
  // layer happens to have data while the chain beneath it is incomplete,
  // and reporting that as depth would overstate what is known.
  let depth: LayerId | null = null;
  for (const layer of layers) {
    if (!layer.unlocked) break;
    depth = layer.id;
  }

  const canAnswer: string[] = [];
  const cannotAnswer: string[] = [];

  const gate = (unlocked: boolean, question: string, reason: string) =>
    unlocked ? canAnswer.push(question) : cannotAnswer.push(`${question} — ${reason}`);

  gate(observation.unlocked, 'What your latest readings are', 'no wearable data has synced yet');
  gate(baseline.unlocked, 'Whether a number is high or low for you specifically', baseline.needs ?? '');
  gate(scenario.unlocked, 'Whether your body is showing a known stress or recovery pattern', scenario.needs ?? '');
  gate(correlation.unlocked, 'Which activities measurably help you', correlation.needs ?? '');
  gate(preference.unlocked, 'Which music actually works for you', preference.needs ?? '');

  // Permanently outside what this data can support, regardless of how
  // much of it accumulates. Listed explicitly rather than left implicit,
  // because these are exactly the questions a wellness assistant gets
  // asked and exactly the ones it must not improvise an answer to.
  cannotAnswer.push(
    'Anything diagnostic — whether you have a condition, what an symptom means, whether to take a medication — MoodSync has no clinical data and this needs a real clinician',
    'Your sleep schedule regularity — MoodSync stores sleep scores but no bedtime or wake timestamps',
    'Nutrition specifics like calorie or macro targets — MoodSync does not track intake',
    'Blood pressure, glucose, weight or body composition — no connected source provides them',
  );

  return { layers, depth, canAnswer, cannotAnswer };
}

/** Renders the stack for a model prompt. Kept next to the builder so the
 * wording and the structure change together — a prompt section that
 * drifts from the data it describes is how a model starts confidently
 * citing a layer that is switched off. */
export function describeStackForPrompt(stack: IntelligenceStackResult): string {
  const lines: string[] = [];
  lines.push(`Knowledge depth: ${stack.depth ?? 'nothing yet — no data has synced'}`);
  lines.push('');
  for (const layer of stack.layers) {
    lines.push(`[${layer.unlocked ? 'UNLOCKED' : 'LOCKED'}] ${layer.name} (${layer.sampleSize}/${layer.requiredSamples} samples)`);
    for (const item of layer.knows) lines.push(`    - ${item}`);
    if (layer.needs) lines.push(`    Needs: ${layer.needs}`);
  }
  lines.push('');
  lines.push('You CAN answer questions about:');
  for (const q of stack.canAnswer) lines.push(`  - ${q}`);
  lines.push('');
  lines.push('You CANNOT answer these, and must say so plainly:');
  for (const q of stack.cannotAnswer) lines.push(`  - ${q}`);
  return lines.join('\n');
}
