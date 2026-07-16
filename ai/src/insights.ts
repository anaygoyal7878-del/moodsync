import type { NormalizedBiometricReading, BiometricField, AutomationRuleDefinition, ComparisonOperator } from '@moodsync/shared';
import { computeWellnessScores, type WellnessScores } from './wellness.js';

const METRIC_FIELDS: BiometricField[] = [
  'heartRate',
  'restingHeartRate',
  'sleepScore',
  'recoveryScore',
  'stressLevel',
  'activityLevel',
  'steps',
  'calories',
];

/** Deltas smaller than this are noise, not a real trend — avoids showing
 * a confident "up"/"down" arrow off a 0.1-point wobble. */
const FLAT_EPSILON = 0.5;

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface TrendResult {
  /** A `BiometricField` for raw-biometric trends, or a `WellnessScores`
   * key (e.g. "stress", "recovery") for computed-score trends — widened
   * to `string` so both series shapes share one result type rather than
   * needing two near-identical interfaces. */
  metric: string;
  /** Average over the newer half of the window. */
  current: number;
  /** Average over the older half of the window. */
  previous: number;
  delta: number;
  direction: 'up' | 'down' | 'flat';
}

/** Splits a series of (metric -> value-or-undefined) points in half by
 * count and compares each half's average — the shared core both
 * `computeTrends` (raw biometrics) and `computeWellnessTrends` (computed
 * scores) build on, so the half-split/flat-epsilon logic can't drift
 * between the two. */
function computeSeriesTrend(metric: string, olderValues: number[], newerValues: number[]): TrendResult | null {
  if (olderValues.length === 0 || newerValues.length === 0) return null;
  const previous = average(olderValues);
  const current = average(newerValues);
  const delta = current - previous;
  return {
    metric,
    current: round2(current),
    previous: round2(previous),
    delta: round2(delta),
    direction: Math.abs(delta) < FLAT_EPSILON ? 'flat' : delta > 0 ? 'up' : 'down',
  };
}

/**
 * Splits a window of readings in half by count (not by calendar time, so
 * it degrades gracefully with sparse or irregular sync history) and
 * compares the average of each half, per metric. Only emits a result for
 * a metric that has at least one value in both halves — a metric with no
 * data in one half isn't "trending," it's just missing.
 */
export function computeTrends(readingsOldestFirst: NormalizedBiometricReading[]): TrendResult[] {
  if (readingsOldestFirst.length < 2) return [];

  const mid = Math.floor(readingsOldestFirst.length / 2);
  const older = readingsOldestFirst.slice(0, mid);
  const newer = readingsOldestFirst.slice(mid);

  const results: TrendResult[] = [];
  for (const metric of METRIC_FIELDS) {
    const olderValues = older.map((r) => r[metric]).filter((v): v is number => v !== undefined);
    const newerValues = newer.map((r) => r[metric]).filter((v): v is number => v !== undefined);
    const trend = computeSeriesTrend(metric, olderValues, newerValues);
    if (trend) results.push(trend);
  }
  return results;
}

const WELLNESS_SCORE_KEYS = ['stress', 'recovery', 'sleep', 'energy', 'fatigue', 'focus', 'relaxation', 'overall'] as const;

/**
 * Same half-split trend comparison as `computeTrends`, but over
 * MoodSync's computed wellness scores (ai/src/wellness.ts) instead of raw
 * biometric fields — e.g. "is stress trending down this week." Each input
 * reading is scored independently using the *same* trailing-history
 * window passed in (a reading only sees readings before it as its own
 * baseline would be circular — see wellness.ts's baseline-history note),
 * so this is O(n) score computations, not O(n^2); callers should pass a
 * reasonably-sized window (the dashboard uses 14 days).
 */
export function computeWellnessTrends(readingsOldestFirst: NormalizedBiometricReading[]): TrendResult[] {
  if (readingsOldestFirst.length < 2) return [];

  const scored: WellnessScores[] = readingsOldestFirst.map((reading, i) =>
    computeWellnessScores(reading, readingsOldestFirst.slice(0, i)),
  );

  const mid = Math.floor(scored.length / 2);
  const older = scored.slice(0, mid);
  const newer = scored.slice(mid);

  const results: TrendResult[] = [];
  for (const key of WELLNESS_SCORE_KEYS) {
    const olderValues = older.map((s) => s[key].value).filter((v): v is number => v !== null);
    const newerValues = newer.map((s) => s[key].value).filter((v): v is number => v !== null);
    const trend = computeSeriesTrend(key, olderValues, newerValues);
    if (trend) results.push(trend);
  }
  return results;
}

export interface AutomationEffectivenessResult {
  ruleId: string;
  ruleName: string;
  /** The rule's first condition's field — what "improvement" is measured
   * against. Rules AND multiple conditions together (see
   * shared/src/automation.ts), so the first is used as the primary
   * trigger metric rather than trying to score a multi-field composite. */
  metric: BiometricField;
  executedCount: number;
  /** Executions where both a trigger reading and a subsequent reading for
   * the same metric existed to compare — always <= executedCount. */
  comparableCount: number;
  improvedCount: number;
  /** Percentage 0-100, or null when there's not enough data to compute
   * a rate — distinct from a real 0% so the UI doesn't show a false
   * "never works" for a rule that just hasn't fired enough yet. */
  effectivenessRate: number | null;
}

interface ExecutionLogLike {
  ruleId: string;
  triggerReadingId: string | null;
  outcome:
    | 'EXECUTED'
    | 'SKIPPED_COOLDOWN'
    | 'SKIPPED_DISABLED'
    | 'SKIPPED_CONFLICT'
    | 'SKIPPED_MANUAL_PAUSE'
    | 'SKIPPED_SAFETY_RATE_LIMIT'
    | 'FAILED';
}

function isImprovement(operator: ComparisonOperator, before: number, after: number): boolean {
  switch (operator) {
    // Rule fired because the value was too low — improvement means it went up.
    case 'lt':
    case 'lte':
      return after > before;
    // Rule fired because the value was too high — improvement means it went down.
    case 'gt':
    case 'gte':
      return after < before;
    // No inherent "better" direction for an equality condition.
    case 'eq':
      return false;
  }
}

/**
 * "Did a triggered automation correlate with an improved subsequent
 * reading?" — for each rule's `EXECUTED` log entries, compares the
 * trigger reading's value for the rule's primary metric against the next
 * reading taken afterward, classifying it as an improvement based on the
 * condition's own operator (a `lt` rule wanted the value to go up, a `gt`
 * rule wanted it to go down). This is a correlation, not a controlled
 * experiment — a rule could show high "effectiveness" for reasons
 * unrelated to the automation itself (e.g. the metric naturally
 * regresses to a baseline). Presented as directional signal, not proof.
 */
export function computeAutomationEffectiveness(params: {
  rules: AutomationRuleDefinition[];
  logs: ExecutionLogLike[];
  /** Oldest first — from `biometricReadingRepository.listRecentNormalizedWithId`. */
  readings: Array<{ id: string; reading: NormalizedBiometricReading }>;
}): AutomationEffectivenessResult[] {
  const { rules, logs, readings } = params;
  const ruleById = new Map(rules.map((r) => [r.id, r]));
  const readingById = new Map(readings.map((r) => [r.id, r.reading]));

  const executionsByRule = new Map<string, ExecutionLogLike[]>();
  for (const log of logs) {
    if (log.outcome !== 'EXECUTED') continue;
    const list = executionsByRule.get(log.ruleId) ?? [];
    list.push(log);
    executionsByRule.set(log.ruleId, list);
  }

  const results: AutomationEffectivenessResult[] = [];
  for (const [ruleId, executions] of executionsByRule) {
    const rule = ruleById.get(ruleId);
    const condition = rule?.conditions[0];
    if (!rule || !condition) continue;

    let comparableCount = 0;
    let improvedCount = 0;

    for (const log of executions) {
      if (!log.triggerReadingId) continue;
      const triggerReading = readingById.get(log.triggerReadingId);
      const triggerValue = triggerReading?.[condition.field];
      if (!triggerReading || triggerValue === undefined) continue;

      const triggerTime = new Date(triggerReading.timestamp).getTime();
      const next = readings.find((r) => new Date(r.reading.timestamp).getTime() > triggerTime);
      const nextValue = next?.reading[condition.field];
      if (nextValue === undefined) continue;

      comparableCount++;
      if (isImprovement(condition.operator, triggerValue, nextValue)) improvedCount++;
    }

    results.push({
      ruleId,
      ruleName: rule.name,
      metric: condition.field,
      executedCount: executions.length,
      comparableCount,
      improvedCount,
      effectivenessRate: comparableCount > 0 ? round2((improvedCount / comparableCount) * 100) : null,
    });
  }

  return results;
}
