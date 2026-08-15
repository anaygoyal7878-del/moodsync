import type { MoodState } from './stateEngine.js';

/**
 * How long has the current state actually been held?
 *
 * This backs `MIN_STATE_DURATION_MINUTES` in environmentGuards.ts —
 * the guard that stops MoodSync acting on a state that flickered for
 * thirty seconds. Until this module existed, the service approximated
 * held-duration from confidence, which is a different quantity
 * entirely; a single very confident reading would satisfy a guard
 * meant to require persistence.
 *
 * The hard part is that observations are irregular. Rows are written
 * whenever an assessment happens (a dashboard load, a worker tick), so
 * the series has gaps — and a gap must not be mistaken for continuity.
 */

export interface StateObservationRecord {
  state: string;
  observedAt: Date;
}

/**
 * Longest gap between consecutive observations that still counts as
 * the same continuous stretch.
 *
 * Set slightly above the proactive worker's 30-60 minute cadence so a
 * normal tick interval doesn't break every chain, but low enough that
 * overnight silence can't be read as an eight-hour stretch of anything.
 * Two "stressed" readings a day apart are two observations, not a day
 * of stress.
 */
export const MAX_OBSERVATION_GAP_MINUTES = 75;

/**
 * Minutes the current state has been continuously observed, walking
 * backward from now through same-state observations until either the
 * state changes or a gap exceeds `MAX_OBSERVATION_GAP_MINUTES`.
 *
 * Returns 0 when:
 *  - there are no observations at all (nothing has been observed, so
 *    nothing has been held),
 *  - the most recent observation is itself stale (older than the gap
 *    limit — we don't know what's happened since), or
 *  - the most recent observation is a different state.
 *
 * Returning 0 is the safe direction: it *blocks* automation rather
 * than permitting it, so an unknown history never becomes a licence
 * to act.
 *
 * @param observations Newest-first. Only this user's, only recent.
 */
export function computeStateHeldMinutes(
  observations: StateObservationRecord[],
  currentState: MoodState,
  now: Date = new Date(),
): number {
  if (observations.length === 0) return 0;

  const first = observations[0]!;
  if (first.state !== currentState) return 0;

  // A stale newest observation means we have no idea what happened
  // since — treat the state as freshly seen.
  const minutesSinceNewest = (now.getTime() - first.observedAt.getTime()) / 60_000;
  if (minutesSinceNewest > MAX_OBSERVATION_GAP_MINUTES) return 0;

  let earliest = first.observedAt;
  for (let i = 1; i < observations.length; i++) {
    const observation = observations[i]!;
    if (observation.state !== currentState) break;
    const gapMinutes = (earliest.getTime() - observation.observedAt.getTime()) / 60_000;
    if (gapMinutes > MAX_OBSERVATION_GAP_MINUTES) break;
    earliest = observation.observedAt;
  }

  return Math.max(0, (now.getTime() - earliest.getTime()) / 60_000);
}
