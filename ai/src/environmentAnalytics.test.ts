import { describe, expect, it } from 'vitest';
import {
  computeStateFrequency,
  computeAcceptanceOverTime,
  computeOutcomeByState,
  computeEnvironmentAnalytics,
} from './environmentAnalytics.js';
import type { SessionRecord } from './environmentLearning.js';

const NOW = new Date('2026-08-20T12:00:00Z');

function daysAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 24 * 60 * 60_000);
}

function session(o: Partial<SessionRecord> = {}): SessionRecord {
  return {
    state: 'stressed',
    status: 'ACCEPTED',
    outcomeHeartRateDelta: null,
    outcomeConfidence: null,
    createdAt: NOW,
    ...o,
  };
}

describe('computeStateFrequency', () => {
  it('returns an empty list rather than throwing on no data', () => {
    expect(computeStateFrequency([])).toEqual([]);
  });

  it('counts and ranks states by frequency', () => {
    const result = computeStateFrequency([
      session({ state: 'stressed' }),
      session({ state: 'stressed' }),
      session({ state: 'tired' }),
    ]);
    expect(result[0]).toMatchObject({ state: 'stressed', count: 2 });
    expect(result[0]!.share).toBeCloseTo(2 / 3);
  });
});

describe('computeAcceptanceOverTime', () => {
  it('reports a day with no proposals as null, not 0% — those are opposite facts', () => {
    // A day where nothing was offered must not render as "you rejected
    // everything", which is what a 0 would say.
    const points = computeAcceptanceOverTime([], 3, NOW);
    expect(points).toHaveLength(3);
    for (const point of points) expect(point.rate).toBeNull();
  });

  it('reports a genuinely all-rejected day as 0, distinct from no data', () => {
    const points = computeAcceptanceOverTime([session({ status: 'REJECTED', createdAt: NOW })], 1, NOW);
    expect(points[0]!.rate).toBe(0);
  });

  it('computes a real rate when both happened', () => {
    const points = computeAcceptanceOverTime(
      [
        session({ status: 'ACCEPTED', createdAt: NOW }),
        session({ status: 'ACCEPTED', createdAt: NOW }),
        session({ status: 'REJECTED', createdAt: NOW }),
      ],
      1,
      NOW,
    );
    expect(points[0]!.rate).toBeCloseTo(2 / 3);
  });

  it('seeds every day in the window so the series has no implicit gaps', () => {
    const points = computeAcceptanceOverTime([session({ createdAt: daysAgo(3) })], 7, NOW);
    expect(points).toHaveLength(7);
  });

  it('ignores sessions older than the window rather than distorting the first bucket', () => {
    const points = computeAcceptanceOverTime([session({ status: 'ACCEPTED', createdAt: daysAgo(30) })], 3, NOW);
    for (const point of points) expect(point.accepted).toBe(0);
  });

  it('excludes dismissals from the rate — silence is not a rejection', () => {
    const points = computeAcceptanceOverTime([session({ status: 'DISMISSED', createdAt: NOW })], 1, NOW);
    expect(points[0]!.rate).toBeNull();
  });
});

describe('computeOutcomeByState', () => {
  it('only counts sessions with a genuinely measured outcome', () => {
    const result = computeOutcomeByState([
      session({ state: 'stressed', outcomeConfidence: 'insufficient', outcomeHeartRateDelta: null }),
    ]);
    expect(result).toHaveLength(0);
  });

  it('keeps thin evidence visible but marks it unreliable', () => {
    // The learning engine suppresses this; an analytics view should
    // show it and label it, so "we tried this twice" is legible.
    const result = computeOutcomeByState([
      session({ state: 'tired', outcomeConfidence: 'measured', outcomeHeartRateDelta: -4 }),
    ]);
    expect(result[0]).toMatchObject({ state: 'tired', sampleSize: 1, reliable: false });
  });

  it('marks a well-sampled state reliable', () => {
    const result = computeOutcomeByState([
      session({ outcomeConfidence: 'measured', outcomeHeartRateDelta: -5 }),
      session({ outcomeConfidence: 'measured', outcomeHeartRateDelta: -7 }),
      session({ outcomeConfidence: 'measured', outcomeHeartRateDelta: -6 }),
    ]);
    expect(result[0]!.reliable).toBe(true);
    expect(result[0]!.meanDelta).toBeCloseTo(-6);
  });

  it('sorts most-improved first', () => {
    const result = computeOutcomeByState([
      session({ state: 'a', outcomeConfidence: 'measured', outcomeHeartRateDelta: 3 }),
      session({ state: 'b', outcomeConfidence: 'measured', outcomeHeartRateDelta: -8 }),
    ]);
    expect(result[0]!.state).toBe('b');
  });
});

describe('computeEnvironmentAnalytics', () => {
  it('is safe and honest on a brand-new account', () => {
    const result = computeEnvironmentAnalytics([], 7, NOW);
    expect(result.totalSessions).toBe(0);
    expect(result.overallAcceptanceRate).toBeNull();
    expect(result.stateFrequency).toEqual([]);
  });

  it('surfaces the measured-vs-applied ratio, which explains an empty outcome chart', () => {
    const result = computeEnvironmentAnalytics(
      [
        session({ status: 'ACCEPTED', outcomeConfidence: 'measured', outcomeHeartRateDelta: -5 }),
        session({ status: 'ACCEPTED', outcomeConfidence: 'insufficient' }),
        session({ status: 'ACCEPTED' }),
      ],
      7,
      NOW,
    );
    expect(result.appliedSessions).toBe(3);
    expect(result.measuredOutcomes).toBe(1);
  });

  it('excludes AUTO_APPLIED from the acceptance rate — it was never consent', () => {
    const result = computeEnvironmentAnalytics(
      [session({ status: 'AUTO_APPLIED' }), session({ status: 'AUTO_APPLIED' })],
      7,
      NOW,
    );
    expect(result.overallAcceptanceRate).toBeNull();
  });
});
