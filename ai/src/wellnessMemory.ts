/**
 * Wellness Memory — what actually works for *this* user.
 *
 * Everything here is a before/after comparison over the user's own real
 * history: an action that happened at a known time, and a wellness
 * metric measured before and after it. Nothing is a population norm and
 * nothing is a model prediction — if a user has meditated three times,
 * this reports on three sessions and says so.
 *
 * The same shape as `computeAutomationEffectiveness` in insights.ts,
 * generalized past automation rules to every kind of thing a person
 * does in this app (meditation, focus sessions, scenes, music).
 */

export interface TimedOccurrence {
  /** When the thing happened. */
  at: Date;
  /** What it was — a scene name, a playlist, "Meditation". Grouping
   * key: occurrences sharing a label are aggregated together. */
  label: string;
}

export interface MetricPoint {
  at: Date;
  value: number;
}

export interface MemoryFinding {
  label: string;
  /** Mean change in the metric from the window before each occurrence to
   * the window after it. Positive means the metric went up. */
  meanDelta: number;
  /** How many occurrences had usable before-and-after measurements —
   * not how many times the thing happened overall. Always surfaced, so
   * "helps you" over 3 sessions never reads like a law. */
  sampleSize: number;
}

/** How far either side of an occurrence to look for measurements. Wide
 * enough to catch a sync that lands a while after the action, narrow
 * enough that an unrelated evening doesn't get attributed to a morning
 * meditation. */
/** How many days of history a correlation search covers. Exported so
 * every caller uses the same window: Clara reasoning over 30 days while
 * the Recovery page showed 60 would mean the assistant and the screen
 * beside it citing different numbers for the same question. */
export const MEMORY_WINDOW_DAYS = 60;

const WINDOW_MINUTES = 90;
/** Below this, a "finding" is one or two coincidences. This app doesn't
 * tell people what works for them off two data points. */
const MIN_SAMPLE_SIZE = 3;

function meanOf(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function windowMean(points: MetricPoint[], from: Date, to: Date): number | null {
  const inWindow = points.filter((p) => p.at >= from && p.at <= to).map((p) => p.value);
  return inWindow.length > 0 ? meanOf(inWindow) : null;
}

/**
 * For each distinct label, the mean before→after change in the metric.
 * Labels with fewer than `MIN_SAMPLE_SIZE` usable occurrences are
 * dropped entirely rather than reported with a caveat — a caveat under
 * a confident-looking number still reads as a finding.
 *
 * `higherIsBetter` doesn't change the math, only which direction the
 * caller should treat as a win (recovery up is good, stress up is not).
 */
export function correlateOccurrences(
  occurrences: TimedOccurrence[],
  metricPoints: MetricPoint[],
): MemoryFinding[] {
  const byLabel = new Map<string, TimedOccurrence[]>();
  for (const occurrence of occurrences) {
    const existing = byLabel.get(occurrence.label) ?? [];
    existing.push(occurrence);
    byLabel.set(occurrence.label, existing);
  }

  const findings: MemoryFinding[] = [];
  for (const [label, group] of byLabel) {
    const deltas: number[] = [];
    for (const occurrence of group) {
      const before = windowMean(metricPoints, new Date(occurrence.at.getTime() - WINDOW_MINUTES * 60_000), occurrence.at);
      const after = windowMean(metricPoints, occurrence.at, new Date(occurrence.at.getTime() + WINDOW_MINUTES * 60_000));
      if (before === null || after === null) continue;
      deltas.push(after - before);
    }
    if (deltas.length < MIN_SAMPLE_SIZE) continue;
    findings.push({ label, meanDelta: Number(meanOf(deltas).toFixed(1)), sampleSize: deltas.length });
  }

  return findings.sort((a, b) => Math.abs(b.meanDelta) - Math.abs(a.meanDelta));
}

export interface HourlyPerformance {
  hourOfDay: number;
  meanScore: number;
  sampleSize: number;
}

export interface ScoredSession {
  /** Hour of day in the user's own timezone — the caller converts, same
   * convention as proactiveNotifications.ts's `SceneRunEvent`. */
  hourOfDay: number;
  score: number;
}

/** Below this many sessions in an hour bucket, that hour isn't a
 * pattern. */
const MIN_SESSIONS_PER_HOUR = 2;

/**
 * Which hours of the day this user actually focuses best in, from their
 * own completed Focus Sessions' scores. Buckets with too few sessions
 * are dropped — an hour with one great session isn't "your best hour."
 */
export function computeBestFocusHours(sessions: ScoredSession[]): HourlyPerformance[] {
  const byHour = new Map<number, number[]>();
  for (const session of sessions) {
    const existing = byHour.get(session.hourOfDay) ?? [];
    existing.push(session.score);
    byHour.set(session.hourOfDay, existing);
  }

  return [...byHour.entries()]
    .filter(([, scores]) => scores.length >= MIN_SESSIONS_PER_HOUR)
    .map(([hourOfDay, scores]) => ({
      hourOfDay,
      meanScore: Math.round(meanOf(scores)),
      sampleSize: scores.length,
    }))
    .sort((a, b) => b.meanScore - a.meanScore);
}

/** Turns a finding into the sentence the UI shows. Phrasing stays
 * hedged ("tends to") and always carries the sample size, because a
 * mean of three before/after pairs is exactly that. */
export function describeFinding(finding: MemoryFinding, metricName: string, higherIsBetter: boolean): string {
  const improved = higherIsBetter ? finding.meanDelta > 0 : finding.meanDelta < 0;
  const direction = improved ? 'better' : 'worse';
  const magnitude = Math.abs(finding.meanDelta).toFixed(1);
  return `${finding.label} tends to leave your ${metricName} ${magnitude} points ${direction} (${finding.sampleSize} times).`;
}
