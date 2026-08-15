import type { MoodState } from './stateEngine.js';

/**
 * Learning Engine — what actually works for *this* user.
 *
 * Two independent signals, deliberately kept separate because they mean
 * different things:
 *
 *  - **Acceptance**: did the user want this? A repeatedly declined
 *    recommendation is wrong for them regardless of what it does to
 *    their heart rate.
 *  - **Biometric response**: did it help? Measured before/after, using
 *    the same `measured` / `insufficient` vocabulary
 *    `ai/src/musicFeedback.ts` already established.
 *
 * Both are gated on sample size and both are phrased as association,
 * never causation. "Has consistently been associated with" is the
 * strongest claim this module will make.
 */

/** Below this, a pattern is a coincidence. Same bar wellnessMemory.ts
 * uses — deliberately identical so "enough data to say something"
 * means one thing across MoodSync. */
export const MIN_SESSIONS_FOR_FINDING = 3;

/** At or below this acceptance rate (over enough samples), MoodSync
 * stops proposing this environment for this state. Not a soft
 * demotion — actually suppressed. Continuing to suggest something
 * someone has declined four times out of five is the behaviour that
 * makes assistants feel like nagging. */
export const SUPPRESSION_ACCEPTANCE_RATE = 0.25;

export interface SessionRecord {
  state: string;
  status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'DISMISSED' | 'AUTO_APPLIED';
  outcomeHeartRateDelta: number | null;
  outcomeConfidence: string | null;
  createdAt: Date;
}

export interface StateAcceptance {
  state: string;
  accepted: number;
  rejected: number;
  dismissed: number;
  /** Accepted / (accepted + rejected). Dismissals are excluded from
   * the denominator on purpose: not answering is not the same as
   * saying no, and treating silence as rejection would suppress
   * recommendations the user simply never saw. */
  acceptanceRate: number | null;
  /** True when there's enough evidence to act on this. */
  hasEnoughData: boolean;
  /** True when MoodSync should stop proposing for this state. */
  shouldSuppress: boolean;
}

/**
 * Acceptance per state. Only counts sessions the user actually
 * responded to — a `PROPOSED` row still awaiting an answer tells us
 * nothing yet.
 */
export function computeAcceptance(sessions: SessionRecord[]): StateAcceptance[] {
  const byState = new Map<string, { accepted: number; rejected: number; dismissed: number }>();

  for (const session of sessions) {
    const bucket = byState.get(session.state) ?? { accepted: 0, rejected: 0, dismissed: 0 };
    // AUTO_APPLIED is not consent — the user never chose it, so it
    // can't count as acceptance. It's excluded from both sides.
    if (session.status === 'ACCEPTED') bucket.accepted++;
    else if (session.status === 'REJECTED') bucket.rejected++;
    else if (session.status === 'DISMISSED') bucket.dismissed++;
    byState.set(session.state, bucket);
  }

  return [...byState.entries()].map(([state, counts]) => {
    const responded = counts.accepted + counts.rejected;
    const acceptanceRate = responded > 0 ? counts.accepted / responded : null;
    const hasEnoughData = responded >= MIN_SESSIONS_FOR_FINDING;
    return {
      state,
      ...counts,
      acceptanceRate,
      hasEnoughData,
      shouldSuppress: hasEnoughData && acceptanceRate !== null && acceptanceRate <= SUPPRESSION_ACCEPTANCE_RATE,
    };
  });
}

export interface EnvironmentEffect {
  state: string;
  /** Mean heart-rate change across sessions with a measured outcome.
   * Negative means heart rate came down. */
  meanHeartRateDelta: number;
  /** Sessions that actually had a measured outcome — not sessions
   * proposed, not sessions accepted. Always surfaced. */
  sampleSize: number;
}

/**
 * Measured biometric effect per state, over sessions where an outcome
 * was genuinely measurable. Sessions whose outcome was `insufficient`
 * are excluded rather than counted as zero — a missing measurement is
 * not a measurement of no change.
 */
export function computeEnvironmentEffects(sessions: SessionRecord[]): EnvironmentEffect[] {
  const byState = new Map<string, number[]>();

  for (const session of sessions) {
    if (session.outcomeConfidence !== 'measured') continue;
    if (session.outcomeHeartRateDelta === null) continue;
    const deltas = byState.get(session.state) ?? [];
    deltas.push(session.outcomeHeartRateDelta);
    byState.set(session.state, deltas);
  }

  return [...byState.entries()]
    .filter(([, deltas]) => deltas.length >= MIN_SESSIONS_FOR_FINDING)
    .map(([state, deltas]) => ({
      state,
      meanHeartRateDelta: deltas.reduce((sum, d) => sum + d, 0) / deltas.length,
      sampleSize: deltas.length,
    }));
}

/** Below this mean change, the effect isn't worth claiming. A 0.4 BPM
 * average difference is noise dressed as a finding. */
const NOTABLE_BPM_DELTA = 3;

/**
 * Plain-language finding for the analytics surface, or null when
 * there's nothing honest to say.
 *
 * Language is deliberately associative. MoodSync ran an environment
 * and observed a change in the same window; it did not run a
 * controlled trial, and the copy must not imply it did.
 */
export function describeEffect(effect: EnvironmentEffect, stateLabel: string): string | null {
  if (Math.abs(effect.meanHeartRateDelta) < NOTABLE_BPM_DELTA) return null;
  // Only a downward move is surfaced. "Your Reset environment has been
  // associated with a *higher* heart rate" is a discouraging claim
  // built on a small, uncontrolled sample — not something to tell
  // someone about their own body.
  if (effect.meanHeartRateDelta > 0) return null;

  const magnitude = Math.abs(effect.meanHeartRateDelta).toFixed(1);
  return `Your ${stateLabel} environment has consistently been associated with a lower heart rate — about ${magnitude} BPM on average, across ${effect.sampleSize} sessions.`;
}

/**
 * Whether to propose at all for this state, given what's been learned.
 * Defaults to `true` for any state with no history: a new user must
 * get recommendations in order to generate the data that personalizes
 * them.
 */
export function shouldProposeForState(state: MoodState, acceptance: StateAcceptance[]): boolean {
  const record = acceptance.find((a) => a.state === state);
  if (!record) return true;
  return !record.shouldSuppress;
}

/**
 * The user's preferred hours for a given state's environment, from
 * when they've actually accepted it. Feeds "you usually do this around
 * now" timing rather than proposing a wind-down at noon.
 *
 * Returns null below the sample-size floor — a preference inferred
 * from two acceptances isn't a preference.
 */
export function preferredHoursForState(sessions: SessionRecord[], state: string, timezoneOffsetHours = 0): number[] | null {
  const hours = sessions
    .filter((s) => s.state === state && s.status === 'ACCEPTED')
    .map((s) => (s.createdAt.getUTCHours() + timezoneOffsetHours + 24) % 24);
  if (hours.length < MIN_SESSIONS_FOR_FINDING) return null;
  return [...new Set(hours)].sort((a, b) => a - b);
}
