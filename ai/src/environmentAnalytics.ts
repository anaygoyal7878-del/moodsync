import type { SessionRecord } from './environmentLearning.js';
import { MIN_SESSIONS_FOR_FINDING } from './environmentLearning.js';

/**
 * Environment analytics — the aggregations behind the charts.
 *
 * Every `EnvironmentSession` row already stores the state, confidence,
 * the user's response, and the measured outcome. Until now that data
 * only ever surfaced as one or two sentences from
 * `environmentLearning.ts`. This module turns the same rows into
 * something you can look at over time.
 *
 * The design constraint throughout: **a chart is a stronger claim than
 * a sentence.** A line implies a trend even when it's three points of
 * noise, so every series here reports its own sample size, and the
 * ones that would mislead below a threshold return null instead of a
 * thin line the UI would render confidently.
 */

export interface StateFrequency {
  state: string;
  count: number;
  /** Share of all assessed sessions, 0-1. */
  share: number;
}

/**
 * How often MoodSync has seen each state. This is the "what does my
 * week actually look like" chart, and it's the one aggregation here
 * that's honest at any sample size — counting is counting.
 */
export function computeStateFrequency(sessions: SessionRecord[]): StateFrequency[] {
  if (sessions.length === 0) return [];
  const counts = new Map<string, number>();
  for (const session of sessions) {
    counts.set(session.state, (counts.get(session.state) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([state, count]) => ({ state, count, share: count / sessions.length }))
    .sort((a, b) => b.count - a.count);
}

export interface AcceptancePoint {
  /** ISO date (YYYY-MM-DD) of the bucket. */
  date: string;
  accepted: number;
  rejected: number;
  /** Null when nothing was responded to that day — a gap in the line
   * rather than a fabricated 0%, which would read as "you rejected
   * everything" instead of "nothing was offered". */
  rate: number | null;
}

/**
 * Daily acceptance rate. The null-vs-zero distinction matters more here
 * than anywhere else in this file: a day with no proposals and a day
 * where every proposal was declined are opposite facts, and plotting
 * both as 0% would actively mislead.
 */
export function computeAcceptanceOverTime(sessions: SessionRecord[], days: number, now: Date = new Date()): AcceptancePoint[] {
  const buckets = new Map<string, { accepted: number; rejected: number }>();

  // Seed every day in the window so the series has no implicit gaps —
  // a missing key and a zero-activity day should look the same to the
  // caller, and both should render as a break.
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 60 * 60_000);
    buckets.set(d.toISOString().slice(0, 10), { accepted: 0, rejected: 0 });
  }

  for (const session of sessions) {
    const key = session.createdAt.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue; // outside the window
    if (session.status === 'ACCEPTED') bucket.accepted++;
    else if (session.status === 'REJECTED') bucket.rejected++;
  }

  return [...buckets.entries()].map(([date, b]) => {
    const responded = b.accepted + b.rejected;
    return {
      date,
      accepted: b.accepted,
      rejected: b.rejected,
      rate: responded > 0 ? b.accepted / responded : null,
    };
  });
}

export interface StateOutcome {
  state: string;
  /** Mean heart-rate change across measured sessions. Negative = came
   * down. */
  meanDelta: number;
  sampleSize: number;
  /** True when this cleared the sample-size floor. Below it the entry
   * is still returned — the UI shows the count and greys it — rather
   * than silently dropped, so "we tried this twice" is visible. */
  reliable: boolean;
}

/**
 * Biometric response grouped by state, for the diverging-bar chart.
 *
 * Unlike `environmentLearning.computeEnvironmentEffects`, this returns
 * sub-threshold entries too. The learning engine's job is deciding what
 * to *say*, so it suppresses thin evidence; an analytics view's job is
 * showing what exists, so it shows the thin evidence and labels it.
 */
export function computeOutcomeByState(sessions: SessionRecord[]): StateOutcome[] {
  const byState = new Map<string, number[]>();
  for (const session of sessions) {
    if (session.outcomeConfidence !== 'measured' || session.outcomeHeartRateDelta === null) continue;
    const deltas = byState.get(session.state) ?? [];
    deltas.push(session.outcomeHeartRateDelta);
    byState.set(session.state, deltas);
  }

  return [...byState.entries()]
    .map(([state, deltas]) => ({
      state,
      meanDelta: deltas.reduce((sum, d) => sum + d, 0) / deltas.length,
      sampleSize: deltas.length,
      reliable: deltas.length >= MIN_SESSIONS_FOR_FINDING,
    }))
    .sort((a, b) => a.meanDelta - b.meanDelta);
}

export interface EnvironmentAnalytics {
  /** Total sessions in the window — the headline that contextualizes
   * every other number here. */
  totalSessions: number;
  stateFrequency: StateFrequency[];
  acceptanceOverTime: AcceptancePoint[];
  outcomeByState: StateOutcome[];
  /** Overall acceptance across the window, or null when nothing has
   * been responded to yet. */
  overallAcceptanceRate: number | null;
  /** How many sessions have a measured outcome, versus how many were
   * applied at all. Surfaced because a low ratio is the honest
   * explanation for why the outcome chart looks empty. */
  measuredOutcomes: number;
  appliedSessions: number;
}

export function computeEnvironmentAnalytics(
  sessions: SessionRecord[],
  days: number,
  now: Date = new Date(),
): EnvironmentAnalytics {
  const accepted = sessions.filter((s) => s.status === 'ACCEPTED').length;
  const rejected = sessions.filter((s) => s.status === 'REJECTED').length;
  const responded = accepted + rejected;

  return {
    totalSessions: sessions.length,
    stateFrequency: computeStateFrequency(sessions),
    acceptanceOverTime: computeAcceptanceOverTime(sessions, days, now),
    outcomeByState: computeOutcomeByState(sessions),
    overallAcceptanceRate: responded > 0 ? accepted / responded : null,
    measuredOutcomes: sessions.filter((s) => s.outcomeConfidence === 'measured').length,
    appliedSessions: sessions.filter((s) => s.status === 'ACCEPTED' || s.status === 'AUTO_APPLIED').length,
  };
}
