/**
 * Supportive language for what the body is doing right now.
 *
 * The design brief's rule is "Deeply Settling", not "Relaxation
 * detected" — human and encouraging, never clinical. That rule lives
 * here rather than in the player component so every surface that
 * describes a live state uses the same vocabulary, and so the phrasing
 * is testable.
 *
 * These are descriptions of a *measured direction of travel*, not
 * diagnoses. "Deeply Settling" means stress fell meaningfully against
 * the session's own baseline. It does not mean the user is relaxed, and
 * nothing here is a medical statement.
 */

import type { MusicMode } from './musicFeedback.js';
import { modeWantsLowerHeartRate } from './musicFeedback.js';

export interface ActiveStateInput {
  mode: MusicMode;
  /** Stress at the moment the session started. */
  baselineStress: number | null;
  /** Stress now. */
  currentStress: number | null;
  /** Signed bpm change so far, negative = coming down. */
  heartRateDelta: number | null;
  /** Minutes elapsed — a session that just started hasn't gone
   * anywhere yet, and saying otherwise would be flattery. */
  elapsedMinutes: number;
}

export interface ActiveState {
  /** The two-word headline, e.g. "Deeply Settling". */
  label: string;
  /** One supporting line under it. */
  detail: string;
  /** 0-1, how far along the intended direction this session has moved.
   * Drives the circular progress ring. Null when there's nothing
   * measured to drive it — the ring renders as a quiet track rather
   * than a fake arc. */
  progress: number | null;
}

/** A session needs to run this long before MoodSync will characterize
 * it at all. Before then it's honestly just "settling in". */
const WARMUP_MINUTES = 3;
/** Stress-point drop that counts as a real shift rather than noise. */
const STRONG_SHIFT = 15;
const MILD_SHIFT = 6;
/** bpm movement that counts, mirroring musicFeedback's threshold. */
const NOTABLE_BPM = 3;

const SETTLING_IN: ActiveState = {
  label: 'Settling In',
  detail: 'Give it a few minutes — MoodSync is watching how you respond.',
  progress: null,
};

/**
 * Describes the current state from real movement against the session's
 * own baseline.
 *
 * Returns a deliberately non-committal state when there's nothing
 * measured yet. The interface is allowed to be quiet; it is not allowed
 * to make something up.
 */
export function describeActiveState(input: ActiveStateInput): ActiveState {
  if (input.elapsedMinutes < WARMUP_MINUTES) return SETTLING_IN;

  const stressDrop =
    input.baselineStress !== null && input.currentStress !== null ? input.baselineStress - input.currentStress : null;
  const wantsLower = modeWantsLowerHeartRate(input.mode);
  const hrMovedRightWay =
    input.heartRateDelta === null || Math.abs(input.heartRateDelta) < NOTABLE_BPM
      ? null
      : wantsLower
        ? input.heartRateDelta < 0
        : input.heartRateDelta > 0;

  // Activating modes get their own vocabulary — telling someone mid-run
  // that they're "deeply settling" would be nonsense.
  if (!wantsLower) {
    if (hrMovedRightWay === true) {
      return {
        label: 'Lifting',
        detail: 'Your heart rate is climbing with the music. This is doing what you asked it to.',
        progress: clamp01(Math.abs(input.heartRateDelta ?? 0) / 40),
      };
    }
    if (hrMovedRightWay === false) {
      return {
        label: 'Easing Off',
        detail: "You're winding down rather than winding up — worth noticing if that wasn't the plan.",
        progress: null,
      };
    }
    return {
      label: 'Holding Steady',
      detail: 'Nothing much has shifted yet.',
      progress: null,
    };
  }

  if (stressDrop !== null && stressDrop >= STRONG_SHIFT) {
    return {
      label: 'Deeply Settling',
      detail: 'Your body has let go noticeably since you pressed play.',
      progress: clamp01(stressDrop / 40),
    };
  }

  if (stressDrop !== null && stressDrop >= MILD_SHIFT) {
    return {
      label: 'Softening',
      detail: 'Things are easing, gently.',
      progress: clamp01(stressDrop / 40),
    };
  }

  if (hrMovedRightWay === true) {
    return {
      label: 'Coming Down',
      detail: 'Your heart rate is lower than when you started.',
      progress: clamp01(Math.abs(input.heartRateDelta ?? 0) / 15),
    };
  }

  if (stressDrop !== null && stressDrop <= -MILD_SHIFT) {
    return {
      label: 'Still Carrying It',
      detail: "This one hasn't landed yet. That's useful to know too — try something else whenever you like.",
      progress: null,
    };
  }

  return {
    label: 'Holding Steady',
    detail: 'Level with where you began.',
    progress: null,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Heading for the before/after panel. Phrased as a journey, per the
 * brief's "Baseline → Calmer State" example, and adapted so it never
 * claims an improvement that didn't happen. */
export function journeyLabel(state: ActiveState): string {
  switch (state.label) {
    case 'Deeply Settling':
    case 'Softening':
    case 'Coming Down':
      return 'Baseline → Calmer state';
    case 'Lifting':
      return 'Baseline → Energised';
    case 'Still Carrying It':
      return 'Baseline → Where you are now';
    default:
      return 'Baseline → Now';
  }
}
