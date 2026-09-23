import { CATEGORY_TEMPO, type MusicCategory } from './musicIntelligence.js';

/**
 * Biometric-driven playlist adaptation, built on the iso principle.
 *
 * ## What the iso principle is, and why it is the right shape here
 *
 * The naive version of "adaptive music" picks the target and plays it:
 * you are stressed, so here is calm music. Music-therapy practice has
 * known since Altshuler in the 1940s that this works badly — music far
 * from someone's current arousal tends to be rejected rather than
 * followed. The iso principle instead *matches* the current state
 * first, then moves the tempo gradually toward the target, letting
 * attention come along with it.
 *
 * That maps cleanly onto what MoodSync already measures. Heart rate is
 * a usable proxy for current arousal, so the opening tempo can be
 * anchored near it and walked toward the band the goal wants.
 *
 * ## Honest about the evidence
 *
 * The iso principle is standard clinical practice and has supportive
 * studies, but controlled trials are mixed — several with proper
 * control groups found limited advantage over simply playing preferred
 * music. So this module builds a *plan* and says what it is based on;
 * it does not promise an outcome. Nothing here claims music will lower
 * anyone's heart rate, and `musicSessionSample` exists precisely so the
 * app can report what actually happened instead of assuming.
 *
 * The tempo bands themselves come from `musicIntelligence.ts`, which
 * carries their own provenance (60-80 BPM associated with reduced
 * arousal, 120-140 with longer time to exhaustion).
 *
 * ## What this deliberately does not do
 *
 * It does not select tracks. MoodSync cannot read the tempo of a user's
 * own library — the Spotify integration pulls no audio features and
 * Apple Music is matched on playlist names. So this produces a tempo
 * *plan* and the keywords to search with, and the honest framing in the
 * UI is "aim for this", not "here is a 72 BPM track".
 */

/** Where a session is trying to get to. */
export type AdaptationGoal = 'calm' | 'focus' | 'energize';

/**
 * Resting-adjacent ceiling for the opening tempo of a calming session.
 *
 * Anchoring to heart rate is the iso principle's own logic, but an
 * elevated heart rate must not drag the opening tempo up with it
 * without limit — matching a 105bpm panic with 105bpm music is the
 * literal opposite of the intent. The anchor is clamped into the band
 * the goal allows, so "match where you are" never overrides "and then
 * go somewhere better".
 */
const CALM_OPENING_CEILING = 95;

export interface AdaptationInput {
  /** Current heart rate in bpm. Null when nothing has synced — the plan
   * then starts from the goal's own band rather than an invented
   * anchor. */
  heartRate: number | null;
  /** MoodSync's computed stress score, 0-100. Optional: it widens or
   * narrows how far the ramp travels, it does not set the target. */
  stress?: number | null;
  goal: AdaptationGoal;
  /** Planned session length. The ramp is spread across it. */
  minutes: number;
}

export interface TempoStep {
  /** Minutes from session start this step begins. */
  atMinute: number;
  /** Target tempo for this stretch, in BPM. */
  bpm: number;
  /** What this step is for, in the user's terms. */
  intent: string;
}

export interface AdaptationPlan {
  goal: AdaptationGoal;
  category: MusicCategory;
  /** Search keywords for the user's own library — the only selection
   * mechanism MoodSync actually has. */
  keywords: string[];
  /** Opening tempo, anchored near current arousal where known. */
  openingBpm: number;
  /** Where the ramp is trying to arrive. */
  targetBpm: number;
  steps: TempoStep[];
  /** Plain-language account of why this plan, shown to the user. */
  rationale: string;
  /** True when the opening was anchored to a real heart rate rather
   * than defaulted. Surfaced so the UI never implies personalisation
   * that did not happen. */
  anchoredToHeartRate: boolean;
}

const GOAL_CATEGORY: Record<AdaptationGoal, MusicCategory> = {
  calm: 'Relax',
  focus: 'Focus',
  energize: 'Workout',
};

/** Where each goal is trying to arrive, and how the ramp should move.
 * Focus has no researched tempo band (see `CATEGORY_TEMPO`), so it
 * holds steady near a resting cadence rather than pretending to a
 * target the literature does not support. */
const GOAL_TARGET: Record<AdaptationGoal, { bpm: number; direction: 'down' | 'up' | 'hold' }> = {
  calm: { bpm: 65, direction: 'down' },
  focus: { bpm: 85, direction: 'hold' },
  energize: { bpm: 130, direction: 'up' },
};

/** Steps in the ramp. Three is enough to read as a progression without
 * implying a precision the underlying evidence cannot support. Must
 * stay >= 2: the ramp interpolates across `RAMP_STEPS - 1`. */
const RAMP_STEPS = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Builds the tempo plan for a session.
 *
 * The opening is the interesting part. For a calming session it starts
 * near the user's current heart rate — the iso principle's "meet them
 * where they are" — clamped so an elevated reading cannot pull the
 * opening above `CALM_OPENING_CEILING`. For energising it starts below
 * the target and climbs, since the point is to be led up rather than
 * dropped into a sprint.
 */
export function buildAdaptationPlan(input: AdaptationInput): AdaptationPlan {
  const { heartRate, stress, goal, minutes } = input;
  const category = GOAL_CATEGORY[goal];
  const target = GOAL_TARGET[goal];
  const band = CATEGORY_TEMPO[category];
  const anchoredToHeartRate = heartRate !== null;

  const openingBpm = (() => {
    if (heartRate === null) {
      // No anchor: open at the band's own edge nearest the target.
      if (band) return target.direction === 'down' ? band.maxBpm : band.minBpm;
      return target.bpm;
    }
    if (goal === 'calm') return Math.round(clamp(heartRate, target.bpm, CALM_OPENING_CEILING));
    if (goal === 'energize') return Math.round(clamp(heartRate + 10, 80, target.bpm));
    return Math.round(clamp(heartRate, 70, 95));
  })();

  const targetBpm = band
    ? Math.round(clamp(target.bpm, band.minBpm, band.maxBpm))
    : target.bpm;

  const steps: TempoStep[] = [];
  for (let i = 0; i < RAMP_STEPS; i++) {
    const progress = i / (RAMP_STEPS - 1);
    const bpm = Math.round(openingBpm + (targetBpm - openingBpm) * progress);
    steps.push({
      atMinute: Math.round((minutes / RAMP_STEPS) * i),
      bpm,
      intent:
        i === 0
          ? anchoredToHeartRate
            ? 'Start near where you are now'
            : 'Start of the session'
          : i === RAMP_STEPS - 1
            ? goal === 'energize'
              ? 'Settle into working tempo'
              : 'Settle into the target range'
            : 'Move gradually toward the target',
    });
  }

  const stressNote =
    typeof stress === 'number' && stress >= 65
      ? ' Your stress score is elevated, so the opening leans toward meeting that rather than fighting it.'
      : '';

  const rationale = anchoredToHeartRate
    ? `Opens around ${openingBpm} BPM — close to your current heart rate of ${heartRate} — and moves toward ${targetBpm} BPM across ${minutes} minutes. Matching first and shifting gradually is the iso principle from music therapy; music far from your current state tends to get skipped rather than followed.${stressNote}`
    : `Opens around ${openingBpm} BPM and moves toward ${targetBpm} BPM across ${minutes} minutes. No recent heart rate has synced, so this starts from the range itself rather than from you.${stressNote}`;

  return {
    goal,
    category,
    keywords: band ? [category.toLowerCase()] : [category.toLowerCase()],
    openingBpm,
    targetBpm,
    steps,
    rationale,
    anchoredToHeartRate,
  };
}
