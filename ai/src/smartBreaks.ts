export type BreakKind = 'walk' | 'stretch' | 'water' | 'breathing';

export interface BreakSuggestion {
  kind: BreakKind;
  label: string;
  reason: string;
}

export interface SmartBreakInput {
  /** How long the current focus session has been running. */
  elapsedMinutes: number;
  /** Mean heart rate over the first third of the session vs. the most
   * recent third — the caller computes both from real samples. Null
   * when there aren't enough samples to compare, which is common and
   * fine: elapsed time alone still produces a suggestion. */
  earlyHeartRate: number | null;
  recentHeartRate: number | null;
  /** Minutes since this session's last suggested break was shown, so a
   * long session paces its prompts instead of re-suggesting every tick.
   * Null when nothing has been suggested yet. */
  minutesSinceLastSuggestion: number | null;
}

/** No fixed Pomodoro-style timer — the product requirement was
 * explicitly "no fixed timers, adaptive." These are the earliest point a
 * break is *considered*, and the minimum spacing between prompts, not a
 * schedule: whether one actually fires depends on elapsed time crossing
 * the threshold, and the specific suggestion depends on what the heart
 * rate signal says. */
const EARLIEST_BREAK_MINUTES = 40;
const MIN_MINUTES_BETWEEN_SUGGESTIONS = 25;
const LONG_STRETCH_MINUTES = 75;

/** How much the recent-third heart rate has to sit above the early-third
 * average to read as "climbing" (or below, to read as "settling") — a
 * percentage of the early baseline, so it scales with the individual
 * rather than assuming a population bpm. */
const HR_DRIFT_PCT = 0.06;

/**
 * Smart Breaks — decides whether a focus session should be interrupted
 * *now*, and with what. Adaptive rather than scheduled: elapsed time
 * opens the door, then the heart-rate trend within the session picks
 * which break actually fits.
 *
 * - Heart rate climbing through a session → walk or breathing (the body
 *   is winding up).
 * - Heart rate settling well below where it started, on a long session →
 *   stretch/water (long stillness).
 * - No usable heart rate signal → a plain movement break on elapsed
 *   time, honestly reasoned as such.
 *
 * Returns `null` most of the time — that's the point. A break prompt
 * that fires constantly is a timer, not a suggestion.
 */
export function suggestSmartBreak(input: SmartBreakInput): BreakSuggestion | null {
  if (input.elapsedMinutes < EARLIEST_BREAK_MINUTES) return null;
  if (input.minutesSinceLastSuggestion !== null && input.minutesSinceLastSuggestion < MIN_MINUTES_BETWEEN_SUGGESTIONS) {
    return null;
  }

  const elapsed = Math.round(input.elapsedMinutes);

  if (input.earlyHeartRate !== null && input.recentHeartRate !== null && input.earlyHeartRate > 0) {
    const drift = (input.recentHeartRate - input.earlyHeartRate) / input.earlyHeartRate;

    if (drift >= HR_DRIFT_PCT) {
      return {
        kind: 'breathing',
        label: 'Two minutes of slow breathing',
        reason: `You're ${elapsed} minutes in and your heart rate has drifted up since you started.`,
      };
    }

    if (drift <= -HR_DRIFT_PCT && input.elapsedMinutes >= LONG_STRETCH_MINUTES) {
      return {
        kind: 'stretch',
        label: 'Stand up and stretch',
        reason: `You've been still and settled for ${elapsed} minutes — a good moment to move.`,
      };
    }
  }

  if (input.elapsedMinutes >= LONG_STRETCH_MINUTES) {
    return {
      kind: 'walk',
      label: 'Take a short walk',
      reason: `You've been focused for ${elapsed} minutes straight.`,
    };
  }

  return {
    kind: 'water',
    label: 'Grab some water',
    reason: `You're ${elapsed} minutes into this session.`,
  };
}
