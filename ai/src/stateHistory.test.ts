import { describe, expect, it } from 'vitest';
import { computeStateHeldMinutes, MAX_OBSERVATION_GAP_MINUTES, type StateObservationRecord } from './stateHistory.js';

const NOW = new Date('2026-08-15T15:00:00Z');

function minutesAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60_000);
}

function obs(state: string, minutes: number): StateObservationRecord {
  return { state, observedAt: minutesAgo(minutes) };
}

describe('computeStateHeldMinutes', () => {
  it('returns 0 with no observations at all', () => {
    expect(computeStateHeldMinutes([], 'stressed', NOW)).toBe(0);
  });

  it('returns 0 when the most recent observation is a different state', () => {
    const observations = [obs('relaxed', 2), obs('stressed', 30), obs('stressed', 50)];
    expect(computeStateHeldMinutes(observations, 'stressed', NOW)).toBe(0);
  });

  it('measures a continuous run of the same state', () => {
    const observations = [obs('stressed', 5), obs('stressed', 35), obs('stressed', 65)];
    expect(computeStateHeldMinutes(observations, 'stressed', NOW)).toBe(65);
  });

  it('stops at the point the state changed', () => {
    const observations = [obs('stressed', 5), obs('stressed', 30), obs('relaxed', 45), obs('stressed', 90)];
    expect(computeStateHeldMinutes(observations, 'stressed', NOW)).toBe(30);
  });

  it('does not read a long silence as continuous holding', () => {
    // Same state either side, but half a day apart — that is two
    // observations, not twelve hours of stress.
    const observations = [obs('stressed', 10), obs('stressed', 12 * 60)];
    expect(computeStateHeldMinutes(observations, 'stressed', NOW)).toBe(10);
  });

  it('tolerates a normal worker-cadence gap without breaking the chain', () => {
    const observations = [obs('stressed', 5), obs('stressed', 5 + MAX_OBSERVATION_GAP_MINUTES - 5)];
    expect(computeStateHeldMinutes(observations, 'stressed', NOW)).toBeGreaterThan(60);
  });

  it('returns 0 when even the newest observation is stale', () => {
    // We have no idea what has happened in the last several hours.
    const observations = [obs('stressed', 6 * 60), obs('stressed', 7 * 60)];
    expect(computeStateHeldMinutes(observations, 'stressed', NOW)).toBe(0);
  });

  it('treats a single fresh observation as a short hold, not a long one', () => {
    expect(computeStateHeldMinutes([obs('stressed', 2)], 'stressed', NOW)).toBe(2);
  });

  it('never returns a negative duration for a clock-skewed future observation', () => {
    const future: StateObservationRecord = { state: 'stressed', observedAt: new Date(NOW.getTime() + 60_000) };
    expect(computeStateHeldMinutes([future], 'stressed', NOW)).toBeGreaterThanOrEqual(0);
  });
});
