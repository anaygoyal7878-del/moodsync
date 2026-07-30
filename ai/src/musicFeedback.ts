/**
 * Music + Biometrics feedback loop — what actually happened to the
 * user's body during a listening session.
 *
 * # What is and isn't measurable here
 *
 * This module is bounded by what MoodSync genuinely ingests. Getting
 * that boundary right is the whole difference between a feedback loop
 * and a horoscope:
 *
 * - **Heart rate** — dense enough to compare a before-window against a
 *   during-window. This is the primary real signal, and the only one
 *   most sessions will have.
 * - **Stress / recovery** — computed scores, but coarse: stress needs
 *   HRV (Apple Health only) plus 5+ days of history, and recovery is
 *   roughly daily. Neither moves meaningfully inside a 30-minute
 *   session, so they're compared across the *night after* rather than
 *   within the session.
 * - **Sleep onset time** — NOT measurable. No provider integration in
 *   this app ingests sleep-session start timestamps (see
 *   docs/SLEEP_COACH.md). So "sleep music helped you fall asleep
 *   faster" is a sentence MoodSync cannot honestly produce, and this
 *   module does not produce it. Sleep-mode sessions are judged on the
 *   heart-rate decline during the session and, separately, on the next
 *   morning's sleep score.
 * - **Interruption frequency** — no signal exists. Not modelled.
 *
 * # Correlation, never causation
 *
 * Every sentence generated here describes a change that *accompanied*
 * a session. None of them claim the music caused it, and none of them
 * are medical statements. `MusicOutcomeConfidence` travels with the
 * sentence so the UI can label it.
 */

export type MusicMode = 'FOCUS' | 'RELAX' | 'SLEEP' | 'RECOVERY' | 'MORNING' | 'WORKOUT';

/**
 * How much weight a sentence deserves.
 *
 * - `measured` — a real before/after comparison over enough samples.
 * - `interpretation` — MoodSync joined the dots (e.g. tying a session
 *   to the following night's sleep score); directionally meaningful,
 *   not a direct measurement of the session itself.
 * - `insufficient` — not enough data. The UI says so rather than
 *   showing an empty card, and no conclusion is drawn.
 */
export type MusicOutcomeConfidence = 'measured' | 'interpretation' | 'insufficient';

export interface HeartRateSample {
  at: Date;
  bpm: number;
}

export interface MusicSessionWindow {
  mode: MusicMode;
  startedAt: Date;
  endedAt: Date;
  /** Display name of the playlist/track/album/station. */
  itemName: string;
}

export interface MusicOutcome {
  confidence: MusicOutcomeConfidence;
  /** The headline sentence. Always safe to show. */
  summary: string;
  /** Signed change in bpm from the before-window to the during-window.
   * Negative means heart rate came down. Null when not measurable. */
  heartRateDelta: number | null;
  /** Everything needed for the explainability panel — what was played,
   * what was compared, over which windows. */
  explanation: MusicExplanation;
}

export interface MusicExplanation {
  itemName: string;
  mode: MusicMode;
  /** e.g. "Average heart rate" — the metric actually compared, or null
   * when nothing could be compared. */
  metric: string | null;
  /** Human-readable window description, e.g. "15 min before vs. during
   * the session". */
  comparedWindows: string | null;
  confidence: MusicOutcomeConfidence;
  /** Plain-language note attached to every outcome, so the constraint
   * against causal claims is enforced in the data rather than left to
   * each UI surface to remember. */
  caveat: string;
}

/** How far back before the session start to take the baseline. Long
 * enough to average out a single noisy reading, short enough to still
 * describe "just before you pressed play". */
const BASELINE_WINDOW_MINUTES = 15;
/** Minimum samples in each of the two windows before a comparison is
 * honest. Two points either side is a coincidence, not a measurement. */
const MIN_SAMPLES_PER_WINDOW = 3;
/** Sessions shorter than this are too brief for a heart-rate response
 * to mean anything. */
const MIN_SESSION_MINUTES = 5;
/** Below this many bpm, a difference is within normal minute-to-minute
 * variation and isn't reported as a change. */
const NOTABLE_BPM_DELTA = 3;

const CAVEAT_MEASURED =
  'A change measured alongside this session. MoodSync reports what moved together, not what caused what.';
const CAVEAT_INTERPRETATION =
  'MoodSync connected this session to a later reading. Directional, not a direct measurement of the session itself.';
const CAVEAT_INSUFFICIENT = 'Not enough readings in this window to compare anything yet.';

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function samplesBetween(samples: HeartRateSample[], from: Date, to: Date): number[] {
  return samples.filter((s) => s.at >= from && s.at <= to).map((s) => s.bpm);
}

/** Whether a mode's outcome model treats a *falling* heart rate as the
 * good direction. Workout and Morning are the two where a rise is the
 * point, so "your heart rate went up" is reported as working, not as a
 * problem — the single most important thing to get right if the
 * feedback is going to feel intelligent rather than mechanical. */
export function modeWantsLowerHeartRate(mode: MusicMode): boolean {
  return mode === 'RELAX' || mode === 'SLEEP' || mode === 'RECOVERY' || mode === 'FOCUS';
}

const MODE_LABEL: Record<MusicMode, string> = {
  FOCUS: 'Focus',
  RELAX: 'Relax',
  SLEEP: 'Sleep prep',
  RECOVERY: 'Recovery',
  MORNING: 'Morning',
  WORKOUT: 'Workout',
};

export function musicModeLabel(mode: MusicMode): string {
  return MODE_LABEL[mode];
}

function insufficient(session: MusicSessionWindow, reason: string): MusicOutcome {
  return {
    confidence: 'insufficient',
    summary: reason,
    heartRateDelta: null,
    explanation: {
      itemName: session.itemName,
      mode: session.mode,
      metric: null,
      comparedWindows: null,
      confidence: 'insufficient',
      caveat: CAVEAT_INSUFFICIENT,
    },
  };
}

/**
 * Compares the heart rate in the 15 minutes before a session against
 * the heart rate during it, and phrases the result according to what
 * the mode was trying to do.
 *
 * Returns an `insufficient` outcome — never a fabricated one — when the
 * session was too short or either window is too thin to compare.
 */
export function computeMusicOutcome(session: MusicSessionWindow, heartRateSamples: HeartRateSample[]): MusicOutcome {
  const durationMinutes = (session.endedAt.getTime() - session.startedAt.getTime()) / 60_000;
  if (durationMinutes < MIN_SESSION_MINUTES) {
    return insufficient(session, 'This session was too short to measure anything.');
  }

  const baselineStart = new Date(session.startedAt.getTime() - BASELINE_WINDOW_MINUTES * 60_000);
  const before = samplesBetween(heartRateSamples, baselineStart, session.startedAt);
  const during = samplesBetween(heartRateSamples, session.startedAt, session.endedAt);

  if (before.length < MIN_SAMPLES_PER_WINDOW || during.length < MIN_SAMPLES_PER_WINDOW) {
    return insufficient(session, 'Not enough heart rate data yet to measure impact.');
  }

  const delta = Math.round(mean(during) - mean(before));
  const explanation: MusicExplanation = {
    itemName: session.itemName,
    mode: session.mode,
    metric: 'Average heart rate',
    comparedWindows: `${BASELINE_WINDOW_MINUTES} min before vs. the ${Math.round(durationMinutes)} min of the session`,
    confidence: 'measured',
    caveat: CAVEAT_MEASURED,
  };

  if (Math.abs(delta) < NOTABLE_BPM_DELTA) {
    return {
      confidence: 'measured',
      summary: `Your heart rate held steady through this ${MODE_LABEL[session.mode]} session.`,
      heartRateDelta: delta,
      explanation,
    };
  }

  const magnitude = Math.abs(delta);
  const wantsLower = modeWantsLowerHeartRate(session.mode);
  const wentDown = delta < 0;
  const helped = wantsLower === wentDown;

  const movement = wentDown ? `dropped ${magnitude} BPM` : `rose ${magnitude} BPM`;
  const summary = helped
    ? `Heart rate ${movement} during ${MODE_LABEL[session.mode]} mode.`
    : `Heart rate ${movement} during this ${MODE_LABEL[session.mode]} session — not the usual direction for this mode.`;

  return { confidence: 'measured', summary, heartRateDelta: delta, explanation };
}

export interface NextNightInput {
  mode: MusicMode;
  itemName: string;
  /** Sleep score for the night following the session. */
  sleepScoreAfter: number | null;
  /** The user's trailing average sleep score, for comparison. */
  sleepScoreBaseline: number | null;
}

/** Below this many points, the night was a normal night. */
const NOTABLE_SLEEP_DELTA = 6;

/**
 * The follow-up a Sleep-mode session gets the next morning.
 *
 * Explicitly an `interpretation`, not a measurement: MoodSync is
 * connecting an evening session to a whole night's score, which many
 * other things also touched. This is the honest substitute for the
 * sleep-onset-latency insight the product brief asked for — that one
 * needs sleep-session start times no provider here gives us.
 */
export function computeNextNightOutcome(input: NextNightInput): MusicOutcome | null {
  if (input.mode !== 'SLEEP' && input.mode !== 'RECOVERY') return null;
  if (input.sleepScoreAfter === null || input.sleepScoreBaseline === null) return null;

  const delta = Math.round(input.sleepScoreAfter - input.sleepScoreBaseline);
  if (Math.abs(delta) < NOTABLE_SLEEP_DELTA) return null;

  const explanation: MusicExplanation = {
    itemName: input.itemName,
    mode: input.mode,
    metric: 'Sleep score the following night',
    comparedWindows: 'The night after this session vs. your recent average',
    confidence: 'interpretation',
    caveat: CAVEAT_INTERPRETATION,
  };

  return {
    confidence: 'interpretation',
    summary:
      delta > 0
        ? `You slept ${delta} points better than usual after this session.`
        : `You slept ${Math.abs(delta)} points below your average after this session.`,
    heartRateDelta: null,
    explanation,
  };
}

/** Short label for the confidence badge. Kept beside the type so every
 * surface words it identically. */
export function confidenceLabel(confidence: MusicOutcomeConfidence): string {
  switch (confidence) {
    case 'measured':
      return 'Measured change';
    case 'interpretation':
      return 'AI interpretation';
    case 'insufficient':
      return 'Not enough data yet';
  }
}
