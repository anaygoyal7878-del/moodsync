import type { PersonalBaselines, BaselineComparison } from './personalBaselines.js';
import type { TrainingLoadSummary } from './trainingLoad.js';

/**
 * Recovery Intelligence — a multi-signal, baseline-relative reading of
 * how much recovery someone may benefit from today.
 *
 * ## Why this exists alongside the recovery score
 *
 * `wellness.ts` already computes a 0–100 recovery score, and that stays:
 * it is documented, baseline-relative, and labelled with its basis. But
 * a single number invites a precision nobody can back. "Recovery 62"
 * reads as a measurement of the body; it is a heuristic composite of two
 * z-scores. This module answers the question the number was being asked
 * to answer — *what should I do today* — with a small set of states, an
 * explicit confidence, and the signals that produced it.
 *
 * ## The rules it holds itself to
 *
 * **No single signal decides.** "HRV below X means poor recovery" is the
 * exact failure mode this replaces. A state is only raised when signals
 * agree, and a lone signal caps confidence rather than driving a
 * conclusion.
 *
 * **Personal baselines, never population cut-offs.** Absolute HRV varies
 * several-fold between healthy adults and between devices; comparing
 * someone to a published number would be noise dressed as insight.
 * Everything here is relative to that person's own recent range.
 *
 * **Uncertainty is visible.** Confidence falls with thin history, few
 * signals, and signals that disagree. `insufficient-data` is a real
 * outcome, not a failure — a new account should be told MoodSync is
 * still learning rather than given a confident answer built on four
 * readings.
 *
 * **Not clinical.** Nothing here diagnoses, and nothing claims a
 * recommendation will improve health or performance. The wearable data
 * underneath is PPG, not ECG (see `evidenceSources.ts`), and the
 * language stays at "may benefit from" throughout.
 *
 * ## What is deliberately absent
 *
 * **Sleep consistency.** It is one of the strongest findings in sleep
 * research and MoodSync cannot compute it: the schema stores sleep
 * scores and stage minutes but no bedtime or wake timestamps
 * (`AppleCalendarSnapshot` aside, nothing records clock times of sleep).
 * A worse proxy labelled as regularity would be a fabrication, so the
 * engine reports sleep *duration and quality* only and says so.
 */

export type RecoveryState =
  | 'recovering-well'
  | 'normal'
  | 'higher-need'
  | 'priority'
  | 'insufficient-data';

export type Confidence = 'high' | 'moderate' | 'low';

export type SignalDirection = 'above' | 'below' | 'typical' | 'unknown';

export interface RecoverySignal {
  id: 'hrv' | 'resting-heart-rate' | 'sleep' | 'activity' | 'training-load';
  label: string;
  /** The reading itself, formatted for display. Null when unavailable. */
  value: string | null;
  direction: SignalDirection;
  /** Plain-language comparison against the user's own range. */
  comparison: string;
  /** Whether this signal points toward needing more recovery. Null when
   * the signal is unavailable or genuinely neutral. */
  suggestsRecovery: boolean | null;
  /** Readings behind this signal's baseline, surfaced so a comparison
   * off six days never reads like one off six months. */
  sampleSize: number;
}

export interface RecoveryContext {
  state: RecoveryState;
  /** Headline, written to be shown verbatim. Always hedged. */
  headline: string;
  /** What to consider doing. Behavioural only. */
  guidance: string;
  confidence: Confidence;
  /** Why the confidence is what it is. */
  confidenceReason: string;
  signals: RecoverySignal[];
  /** Evidence-register ids backing this reading, for the UI's sources
   * section. */
  sourceIds: string[];
  /** Always false. Present as a value a reviewer can see rather than a
   * comment a reviewer must trust. */
  isDiagnostic: false;
}

/**
 * How far from personal baseline counts as meaningful, in standard
 * deviations.
 *
 * A convention rather than a citation: the literature describes
 * "a drop from your normal" qualitatively, and operationalising that
 * against an individual's own spread requires picking a number. One SD
 * is the conservative reading — roughly the outer sixth of this
 * person's own recent days, so it fires on a real change without firing
 * weekly.
 */
const NOTABLE_Z = 1.0;

/** Resting heart rate is stated in bpm by the athlete-monitoring
 * literature rather than in standard deviations, and its within-person
 * spread is narrow enough that a z-score would trip on noise. */
const RHR_ELEVATED_BPM = 5;

/** How much heavier than a typical week the last seven days must be
 * before it counts as a recovery signal. 30% is a deliberately wide
 * margin: weekly training volume naturally varies, and a signal that
 * fired on an ordinary busier week would be noise. */
const HIGH_LOAD_RATIO = 1.3;

/** Below this many readings, a baseline is not yet a baseline. Mirrors
 * `MIN_SAMPLES_FOR_BASELINE`. */
const MIN_SAMPLES = 5;

export interface RecoveryContextInput {
  baselines: PersonalBaselines;
  /** Last night's sleep duration in minutes, when the provider reports
   * enough stage detail to total it. */
  sleepMinutes: number | null;
  /** The user's age, when known — only used to pick the right published
   * sleep band. Null is fine and common. */
  age: number | null;
  /** Load from logged workouts. Null when there are none — optional so
   * every existing caller keeps working unchanged. */
  trainingLoad?: TrainingLoadSummary | null;
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** The published nightly band for an age, from the evidence register.
 * Falls back to the adult band when age is unknown, and the caller is
 * told which applied. */
function sleepBandFor(age: number | null): { min: number; max: number; sourceId: string; label: string } {
  if (age !== null && age >= 13 && age <= 18) {
    return { min: 8, max: 10, sourceId: 'aasm-teen-sleep', label: '8–10 hours for your age group' };
  }
  return { min: 7, max: 9, sourceId: 'cdc-sleep', label: '7–9 hours for adults' };
}

function hrvSignal(hrv: BaselineComparison | null): RecoverySignal {
  if (hrv === null || hrv.sampleSize < MIN_SAMPLES) {
    return {
      id: 'hrv',
      label: 'HRV',
      value: hrv ? `${hrv.value.toFixed(0)}ms` : null,
      direction: 'unknown',
      comparison: 'Not enough history yet to know your normal range.',
      suggestsRecovery: null,
      sampleSize: hrv?.sampleSize ?? 0,
    };
  }
  const below = hrv.z <= -NOTABLE_Z;
  const above = hrv.z >= NOTABLE_Z;
  return {
    id: 'hrv',
    label: 'HRV',
    value: `${hrv.value.toFixed(0)}ms`,
    direction: below ? 'below' : above ? 'above' : 'typical',
    comparison: below
      ? `Below your recent average of ${hrv.baseline.toFixed(0)}ms`
      : above
        ? `Above your recent average of ${hrv.baseline.toFixed(0)}ms`
        : `In line with your recent average of ${hrv.baseline.toFixed(0)}ms`,
    suggestsRecovery: below ? true : above ? false : null,
    sampleSize: hrv.sampleSize,
  };
}

function rhrSignal(rhr: BaselineComparison | null): RecoverySignal {
  if (rhr === null || rhr.sampleSize < MIN_SAMPLES) {
    return {
      id: 'resting-heart-rate',
      label: 'Resting heart rate',
      value: rhr ? `${rhr.value.toFixed(0)} bpm` : null,
      direction: 'unknown',
      comparison: 'Not enough history yet to know your normal range.',
      suggestsRecovery: null,
      sampleSize: rhr?.sampleSize ?? 0,
    };
  }
  const delta = rhr.value - rhr.baseline;
  const elevated = delta >= RHR_ELEVATED_BPM;
  const lower = delta <= -RHR_ELEVATED_BPM;
  return {
    id: 'resting-heart-rate',
    label: 'Resting heart rate',
    value: `${rhr.value.toFixed(0)} bpm`,
    direction: elevated ? 'above' : lower ? 'below' : 'typical',
    comparison: elevated
      ? `About ${Math.round(delta)} bpm above your average of ${rhr.baseline.toFixed(0)}`
      : lower
        ? `About ${Math.abs(Math.round(delta))} bpm below your average of ${rhr.baseline.toFixed(0)}`
        : `Close to your average of ${rhr.baseline.toFixed(0)}`,
    suggestsRecovery: elevated ? true : lower ? false : null,
    sampleSize: rhr.sampleSize,
  };
}

function sleepSignal(
  sleepMinutes: number | null,
  sleepScore: BaselineComparison | null,
  age: number | null,
): RecoverySignal {
  const band = sleepBandFor(age);

  if (sleepMinutes !== null) {
    const hours = sleepMinutes / 60;
    const short = hours < band.min;
    return {
      id: 'sleep',
      label: 'Sleep',
      value: formatDuration(sleepMinutes),
      direction: short ? 'below' : hours > band.max ? 'above' : 'typical',
      comparison: short
        ? `Below the recommended ${band.label}`
        : `Within the recommended ${band.label}`,
      suggestsRecovery: short ? true : null,
      sampleSize: sleepScore?.sampleSize ?? 0,
    };
  }

  // No duration available — fall back to the provider's own quality
  // score against this person's range. Reported as quality, never as
  // duration, because they are different claims.
  if (sleepScore !== null && sleepScore.sampleSize >= MIN_SAMPLES) {
    const below = sleepScore.z <= -NOTABLE_Z;
    return {
      id: 'sleep',
      label: 'Sleep quality',
      value: String(Math.round(sleepScore.value)),
      direction: below ? 'below' : sleepScore.z >= NOTABLE_Z ? 'above' : 'typical',
      comparison: below
        ? `Below your recent average of ${sleepScore.baseline.toFixed(0)}`
        : `In line with your recent average of ${sleepScore.baseline.toFixed(0)}`,
      suggestsRecovery: below ? true : null,
      sampleSize: sleepScore.sampleSize,
    };
  }

  return {
    id: 'sleep',
    label: 'Sleep',
    value: null,
    direction: 'unknown',
    comparison: 'No sleep data has synced for last night.',
    suggestsRecovery: null,
    sampleSize: 0,
  };
}

function activitySignal(activity: BaselineComparison | null): RecoverySignal {
  if (activity === null || activity.sampleSize < MIN_SAMPLES) {
    return {
      id: 'activity',
      label: 'Activity',
      value: null,
      direction: 'unknown',
      comparison: 'Not enough history yet to know your normal range.',
      suggestsRecovery: null,
      sampleSize: activity?.sampleSize ?? 0,
    };
  }
  const high = activity.z >= NOTABLE_Z;
  return {
    id: 'activity',
    label: 'Activity',
    value: String(Math.round(activity.value)),
    direction: high ? 'above' : activity.z <= -NOTABLE_Z ? 'below' : 'typical',
    // Higher-than-usual load is context for needing recovery, not a
    // judgment that the activity was bad.
    comparison: high ? 'Higher than your recent average' : 'In line with your recent average',
    suggestsRecovery: high ? true : null,
    sampleSize: activity.sampleSize,
  };
}


function trainingLoadSignal(load: TrainingLoadSummary | null): RecoverySignal {
  if (load === null || load.ratio === null) {
    const unrated = load?.unratedSessionsThisWeek ?? 0;
    return {
      id: 'training-load',
      label: 'Training load',
      value: null,
      direction: 'unknown',
      // Says *why* it's unknown when the reason is actionable: sessions
      // were logged but not rated, so they carry no intensity.
      comparison:
        unrated > 0
          ? `${unrated} workout${unrated === 1 ? '' : 's'} this week had no effort rating, so load can't be measured yet.`
          : 'Log and rate a few weeks of workouts to compare against your usual.',
      suggestsRecovery: null,
      sampleSize: load?.ratedSessionsThisWeek ?? 0,
    };
  }
  const high = load.ratio >= HIGH_LOAD_RATIO;
  const pct = Math.round((load.ratio - 1) * 100);
  return {
    id: 'training-load',
    label: 'Training load',
    value: `${load.ratedSessionsThisWeek} session${load.ratedSessionsThisWeek === 1 ? '' : 's'}`,
    direction: high ? 'above' : load.ratio <= 0.7 ? 'below' : 'typical',
    comparison: high
      ? `About ${pct}% more than your usual week`
      : load.ratio <= 0.7
        ? 'Lighter than your usual week'
        : 'Close to your usual week',
    suggestsRecovery: high ? true : null,
    sampleSize: load.ratedSessionsThisWeek,
  };
}

/**
 * Reads the signals and returns a state, a confidence, and the evidence.
 *
 * The state ladder is deliberately conservative. Two agreeing signals
 * raise `higher-need`; three raise `priority`. One signal alone never
 * raises anything above `normal`, because a single low morning is
 * ordinary and treating it as a verdict is how people learn to ignore
 * an app.
 */
export function buildRecoveryContext(input: RecoveryContextInput): RecoveryContext {
  const { baselines, sleepMinutes, age, trainingLoad = null } = input;

  const signals: RecoverySignal[] = [
    hrvSignal(baselines.heartRateVariability),
    rhrSignal(baselines.restingHeartRate),
    sleepSignal(sleepMinutes, baselines.sleepScore, age),
    activitySignal(baselines.activityLevel),
    trainingLoadSignal(trainingLoad),
  ];

  const known = signals.filter((s) => s.direction !== 'unknown');
  const reassuring = signals.filter((s) => s.suggestsRecovery === false);

  // Wearable activity and logged training load frequently describe the
  // *same* hard week from two angles. Counting both would let one cause
  // escalate the state on its own — the single-cause verdict this ladder
  // exists to prevent. So for escalation they are one "load" dimension;
  // both rows still render, since each is independently informative.
  const LOAD_IDS = new Set<RecoverySignal['id']>(['activity', 'training-load']);
  const flaggingSignals = signals.filter((s) => s.suggestsRecovery === true);
  const loadFlagged = flaggingSignals.some((s) => LOAD_IDS.has(s.id));
  const flagging = [
    ...flaggingSignals.filter((s) => !LOAD_IDS.has(s.id)),
    ...(loadFlagged ? [flaggingSignals.find((s) => LOAD_IDS.has(s.id))!] : []),
  ];

  const band = sleepBandFor(age);
  const sourceIds = ['hrv-wearable-review', 'ppg-vs-ecg-meta', band.sourceId];

  // Nothing usable yet. A confident answer off two readings would be
  // invented, and saying so is more useful than guessing.
  if (known.length < 2) {
    return {
      state: 'insufficient-data',
      headline: 'MoodSync is still learning your normal ranges.',
      guidance:
        'Keep your wearable syncing for a few more days. Recovery readings compare you against your own history, so they need that history before they mean anything.',
      confidence: 'low',
      confidenceReason: `Only ${known.length} of ${signals.length} signals have enough history to compare against.`,
      signals,
      sourceIds,
      isDiagnostic: false,
    };
  }

  const state: RecoveryState =
    flagging.length >= 3
      ? 'priority'
      : flagging.length === 2
        ? 'higher-need'
        : reassuring.length >= 2 && flagging.length === 0
          ? 'recovering-well'
          : 'normal';

  // Confidence is about the evidence, not the conclusion: plenty of
  // agreeing signals off long history is high; a split verdict or thin
  // history is not.
  // Training load is excluded from the thinnest-history check. For every
  // other signal sampleSize counts readings behind a baseline; for load
  // it counts sessions *this week*, where three is a full week rather
  // than thin history. Including it marked a well-evidenced read as low
  // confidence. Its sufficiency is enforced upstream instead: it produces
  // no comparison at all until two prior weeks exist.
  const thinnest = Math.min(
    ...known.filter((s) => s.id !== 'training-load').map((s) => s.sampleSize).filter((n) => n > 0),
    Infinity,
  );
  const conflicted = flagging.length > 0 && reassuring.length > 0;
  const confidence: Confidence =
    conflicted || known.length < 3 || thinnest < 10
      ? known.length < 3 || thinnest < MIN_SAMPLES
        ? 'low'
        : 'moderate'
      : flagging.length >= 2 || reassuring.length >= 2
        ? 'high'
        : 'moderate';

  const confidenceReason = conflicted
    ? 'Your signals disagree today — some point toward more recovery, others away from it.'
    : known.length < 3
      ? `Only ${known.length} signals had enough history to compare against.`
      : thinnest < 10
        ? `Based on a short history — as few as ${thinnest} readings behind one of these comparisons.`
        : `${known.length} signals compared against your own history.`;

  const copy: Record<Exclude<RecoveryState, 'insufficient-data'>, { headline: string; guidance: string }> = {
    'recovering-well': {
      headline: 'Your signals look better than your usual.',
      guidance:
        'Nothing here suggests holding back. A normal or harder day fits what your numbers are showing, if that is what you had planned.',
    },
    normal: {
      headline: 'Your signals are close to your normal range.',
      guidance: 'Nothing stands out today. Carrying on with your usual routine is a reasonable read of this.',
    },
    'higher-need': {
      headline: 'Your body may benefit from a lighter day.',
      guidance:
        'Two of your signals are pointing the same way. Consider lighter activity today and prioritising sleep tonight — this is a suggestion from your own trends, not an instruction.',
    },
    priority: {
      headline: 'Several signals suggest recovery is worth prioritising.',
      guidance:
        'Three or more of your signals moved together. An easy day and an early night are what this pattern usually calls for. If you feel genuinely unwell, that is a question for a clinician rather than for MoodSync.',
    },
  };

  return {
    state,
    headline: copy[state].headline,
    guidance: copy[state].guidance,
    confidence,
    confidenceReason,
    signals,
    sourceIds,
    isDiagnostic: false,
  };
}
