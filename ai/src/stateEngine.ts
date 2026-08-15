import type { NormalizedBiometricReading } from '@moodsync/shared';
import { computePersonalBaselines, describeBaseline, type PersonalBaselines } from './personalBaselines.js';

/**
 * MoodSync State Engine — turns biometrics plus context into one
 * normalized, explainable state.
 *
 * Three rules govern everything here:
 *
 *  1. **No state comes from a single value.** Every state needs at
 *     least two independent signals to reach meaningful confidence.
 *     A single elevated heart rate reading is a heart rate reading,
 *     not "stress".
 *  2. **Personal baselines only** (see personalBaselines.ts). There is
 *     no `heartRate > 100` anywhere in this file.
 *  3. **These are wellness/context estimates, never medical
 *     assessments.** No state in this union names a condition, and
 *     `MEDICAL_DISCLAIMER` ships inside the result so no UI surface
 *     can forget it.
 *
 * See docs/ADAPTIVE_ENVIRONMENT_ARCHITECTURE.md.
 */

export type MoodState =
  | 'focused'
  | 'stressed'
  | 'relaxed'
  | 'tired'
  | 'sleepy'
  | 'recovering'
  | 'energized'
  | 'overstimulated'
  | 'active'
  | 'preparing_for_sleep'
  | 'unknown';

export const STATE_LABELS: Record<MoodState, string> = {
  focused: 'Focused',
  stressed: 'Elevated Stress',
  relaxed: 'Relaxed',
  tired: 'Tired',
  sleepy: 'Sleepy',
  recovering: 'Recovering',
  energized: 'Energized',
  overstimulated: 'Overstimulated',
  active: 'Active',
  preparing_for_sleep: 'Preparing for Sleep',
  unknown: 'Still Learning',
};

export const MEDICAL_DISCLAIMER =
  'A wellness estimate from your own recent patterns — not a medical assessment, diagnosis, or advice.';

/** One piece of evidence behind a state. `measured` means it came from
 * a real reading compared to this user's own baseline; `contextual`
 * means it came from time of day, calendar, or an in-app session. The
 * distinction is shown to the user — an inference from the clock is
 * not the same class of fact as a heart rate measurement. */
export interface SupportingSignal {
  kind: 'measured' | 'contextual';
  description: string;
}

export interface StateAssessment {
  currentState: MoodState;
  label: string;
  /** 0-1. Damped hard when baselines are thin — see
   * `confidenceFrom`. Never reaches 1.0: this engine is an estimate. */
  confidence: number;
  supportingSignals: SupportingSignal[];
  timestamp: Date;
  /** True when there isn't enough personal history yet for the engine
   * to be trusted. Callers must surface this rather than presenting a
   * cold-start guess as an assessment. */
  stillLearning: boolean;
  disclaimer: string;
}

export interface StateEngineInput {
  latest: NormalizedBiometricReading | null;
  /** Trailing readings, excluding `latest`. */
  history: NormalizedBiometricReading[];
  /** Local hour 0-23 in the user's timezone. */
  localHour: number;
  /** Hours of timed calendar events today. `null` when no calendar is
   * connected — distinct from 0 (connected, free day). */
  bookedHoursToday: number | null;
  /** Whether an in-app Focus Session is running right now. */
  inFocusSession: boolean;
  /** Minutes since the user's last logged workout, or null when
   * unknown/none recent. */
  minutesSinceWorkout: number | null;
  /** The user's own declared activity, when they've picked one. Always
   * wins over inference — see `assessState`. */
  userDeclaredState: MoodState | null;
}

/** Above this, a metric counts as meaningfully above the user's own
 * normal. Below its negation, meaningfully below. MoodSync's own
 * threshold, matching the z-scale the rest of the app already uses. */
const NOTABLE_Z = 0.8;
const STRONG_Z = 1.5;

/** Local hours where "preparing for sleep" is even plausible. Outside
 * this window the state is never inferred from biometrics alone — a low
 * heart rate at 2pm is rest, not bedtime. */
const WIND_DOWN_START_HOUR = 20;
const WIND_DOWN_END_HOUR = 3;

function inWindDownWindow(hour: number): boolean {
  return hour >= WIND_DOWN_START_HOUR || hour < WIND_DOWN_END_HOUR;
}

interface Candidate {
  state: MoodState;
  /** Summed evidence weight. Not a probability — normalized later. */
  score: number;
  signals: SupportingSignal[];
}

function add(candidates: Map<MoodState, Candidate>, state: MoodState, weight: number, signal: SupportingSignal): void {
  const existing = candidates.get(state) ?? { state, score: 0, signals: [] };
  existing.score += weight;
  existing.signals.push(signal);
  candidates.set(state, existing);
}

/**
 * Confidence from evidence strength, how many *independent* signals
 * agree, and how much personal history backs the baselines.
 *
 * The independent-signal requirement is the guard against rule 1: a
 * candidate supported by one signal is capped low no matter how strong
 * that signal is, because one measurement is one measurement.
 */
function confidenceFrom(candidate: Candidate, baselines: PersonalBaselines): number {
  const measuredCount = candidate.signals.filter((s) => s.kind === 'measured').length;
  const totalSignals = candidate.signals.length;

  // One signal alone can never be confident, however strong.
  if (totalSignals <= 1) return Math.min(0.35, candidate.score / 10);

  // Evidence strength, saturating — more agreeing signals help, with
  // diminishing returns rather than unbounded growth.
  const strength = 1 - Math.exp(-candidate.score / 3);

  // A conclusion drawn only from the clock and the calendar is weaker
  // than one with real measurements behind it.
  const measuredFactor = measuredCount === 0 ? 0.55 : measuredCount === 1 ? 0.8 : 1;

  // Thin personal history damps everything — this is the cold-start guard.
  const historyFactor = Math.min(1, baselines.maxSampleSize / 20);

  // Capped below 1.0 on purpose: this engine estimates, it never knows.
  return Math.min(0.95, strength * measuredFactor * (0.45 + 0.55 * historyFactor));
}

/**
 * The whole engine. Returns `unknown` — never a guess — when there is
 * no reading at all or no candidate clears the floor.
 *
 * A `userDeclaredState` short-circuits inference entirely: if someone
 * says they're winding down, MoodSync does not argue with them from a
 * heart rate sample. This is the same "user intent overrides" principle
 * the automation guards enforce for manual device changes.
 */
export function assessState(input: StateEngineInput, now: Date = new Date()): StateAssessment {
  if (input.userDeclaredState && input.userDeclaredState !== 'unknown') {
    return {
      currentState: input.userDeclaredState,
      label: STATE_LABELS[input.userDeclaredState],
      confidence: 1,
      supportingSignals: [{ kind: 'contextual', description: 'You told MoodSync what you’re doing' }],
      timestamp: now,
      stillLearning: false,
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  if (!input.latest) {
    return {
      currentState: 'unknown',
      label: STATE_LABELS.unknown,
      confidence: 0,
      supportingSignals: [],
      timestamp: now,
      stillLearning: true,
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  const baselines = computePersonalBaselines(input.latest, input.history);
  const candidates = new Map<MoodState, Candidate>();

  // ---- Measured signals ----------------------------------------------

  const hr = baselines.heartRate;
  if (hr) {
    if (hr.z >= STRONG_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Heart rate', hr) };
      add(candidates, 'stressed', 2, signal);
      add(candidates, 'active', 1.5, signal);
      add(candidates, 'overstimulated', 1, signal);
    } else if (hr.z >= NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Heart rate', hr) };
      add(candidates, 'stressed', 1.2, signal);
      add(candidates, 'active', 1, signal);
    } else if (hr.z <= -NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Heart rate', hr) };
      add(candidates, 'relaxed', 1.5, signal);
      add(candidates, 'recovering', 1, signal);
      if (inWindDownWindow(input.localHour)) add(candidates, 'preparing_for_sleep', 1.2, signal);
    }
  }

  const hrv = baselines.heartRateVariability;
  if (hrv) {
    if (hrv.z <= -NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('HRV', hrv) };
      add(candidates, 'stressed', 2, signal);
      add(candidates, 'tired', 1.2, signal);
    } else if (hrv.z >= NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('HRV', hrv) };
      add(candidates, 'recovering', 1.8, signal);
      add(candidates, 'relaxed', 1.2, signal);
      add(candidates, 'energized', 1, signal);
    }
  }

  const sleep = baselines.sleepScore;
  if (sleep) {
    if (sleep.z <= -NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Last night’s sleep', sleep) };
      add(candidates, 'tired', 2, signal);
      add(candidates, 'recovering', 1, signal);
    } else if (sleep.z >= NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Last night’s sleep', sleep) };
      add(candidates, 'energized', 1.5, signal);
      add(candidates, 'recovering', 1, signal);
    }
  }

  const activity = baselines.activityLevel;
  if (activity) {
    if (activity.z >= NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Activity', activity) };
      add(candidates, 'active', 2, signal);
      add(candidates, 'energized', 1, signal);
    } else if (activity.z <= -NOTABLE_Z) {
      const signal: SupportingSignal = { kind: 'measured', description: describeBaseline('Activity', activity) };
      add(candidates, 'relaxed', 0.8, signal);
      add(candidates, 'tired', 0.8, signal);
    }
  }

  // ---- Contextual signals --------------------------------------------

  if (input.inFocusSession) {
    add(candidates, 'focused', 2.5, { kind: 'contextual', description: 'A Focus Session is running' });
  }

  if (input.minutesSinceWorkout !== null && input.minutesSinceWorkout <= 90) {
    add(candidates, 'recovering', 1.8, {
      kind: 'contextual',
      description: `Workout finished about ${Math.round(input.minutesSinceWorkout)} minutes ago`,
    });
  }

  if (inWindDownWindow(input.localHour)) {
    add(candidates, 'preparing_for_sleep', 1.5, { kind: 'contextual', description: 'It’s within your evening wind-down hours' });
    add(candidates, 'sleepy', 1, { kind: 'contextual', description: 'It’s late in the evening' });
  }

  if (input.bookedHoursToday !== null && input.bookedHoursToday >= 5) {
    add(candidates, 'stressed', 1, {
      kind: 'contextual',
      description: `${Math.round(input.bookedHoursToday)} hours booked on your calendar today`,
    });
    add(candidates, 'overstimulated', 1.2, { kind: 'contextual', description: 'A heavily booked day' });
  }

  // ---- Resolution -----------------------------------------------------

  const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0];

  // Nothing cleared the floor, or the only candidate rests on a single
  // signal with no corroboration — say "unknown" rather than guess.
  if (!top || top.score < 1.5) {
    return {
      currentState: 'unknown',
      label: STATE_LABELS.unknown,
      confidence: 0,
      supportingSignals: [],
      timestamp: now,
      stillLearning: !baselines.hasAnyBaseline,
      disclaimer: MEDICAL_DISCLAIMER,
    };
  }

  const confidence = confidenceFrom(top, baselines);

  return {
    currentState: top.state,
    label: STATE_LABELS[top.state],
    confidence: Number(confidence.toFixed(2)),
    // De-duplicated: one physiological reading can support a state
    // through more than one rule above, but the user should see it once.
    supportingSignals: dedupeSignals(top.signals),
    timestamp: now,
    stillLearning: !baselines.hasAnyBaseline || baselines.maxSampleSize < MIN_SAMPLES_FOR_CONFIDENT_STATE,
    disclaimer: MEDICAL_DISCLAIMER,
  };
}

/** Below this much personal history, every assessment is flagged
 * `stillLearning` even when a state is inferable — the engine can name
 * a state off 6 readings, but it shouldn't present it as settled. */
export const MIN_SAMPLES_FOR_CONFIDENT_STATE = 14;

function dedupeSignals(signals: SupportingSignal[]): SupportingSignal[] {
  const seen = new Set<string>();
  return signals.filter((s) => {
    if (seen.has(s.description)) return false;
    seen.add(s.description);
    return true;
  });
}
