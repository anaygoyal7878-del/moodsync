import type { InsightPeriod, CreateInsightInput } from '@moodsync/database';
import type { NormalizedBiometricReading } from '@moodsync/shared';
import { computeTrends, computeWellnessTrends, type TrendResult } from './insights.js';

/** Human-readable labels for the metrics `computeWeeklyInsights` can
 * produce — a raw `BiometricField` (from `computeTrends`) or a
 * `WellnessScores` key (from `computeWellnessTrends`, prefixed
 * "wellness." here to disambiguate it from the raw field of the same
 * root name, e.g. "sleepScore" vs. "wellness.sleep"). Falls back to the
 * raw key for anything unlisted rather than throwing, since this is
 * summary copy, not a validated enum. */
const METRIC_LABELS: Record<string, string> = {
  heartRate: 'Heart rate',
  restingHeartRate: 'Resting heart rate',
  sleepScore: 'Sleep score',
  recoveryScore: 'Recovery score',
  stressLevel: 'Stress level',
  activityLevel: 'Activity level',
  steps: 'Steps',
  calories: 'Calories',
  'wellness.stress': 'Stress',
  'wellness.recovery': 'Recovery',
  'wellness.sleep': 'Sleep',
  'wellness.energy': 'Energy',
  'wellness.fatigue': 'Fatigue',
  'wellness.focus': 'Focus',
  'wellness.relaxation': 'Relaxation',
  'wellness.overall': 'Overall wellness',
};

function summarize(metric: string, trend: TrendResult): string {
  const label = METRIC_LABELS[metric] ?? metric;
  if (trend.direction === 'flat') {
    return `${label} stayed roughly flat this week (${trend.previous} → ${trend.current}).`;
  }
  const verb = trend.direction === 'up' ? 'increased' : 'decreased';
  return `${label} ${verb} this week (${trend.previous} → ${trend.current}, ${trend.delta > 0 ? '+' : ''}${trend.delta}).`;
}

/**
 * Turns a window of readings into persistable `Insight` rows — the
 * bridge between `insights.ts`'s pure, on-the-fly trend functions
 * (already used by `/api/insights` for the live dashboard) and the
 * `Insight` Prisma model, which existed in the schema but was never
 * written to before this (see docs/DECISION_ENGINE_ROADMAP.md's "Weekly
 * reports, persisted insights" entry). Deliberately reuses
 * `computeTrends`/`computeWellnessTrends` rather than a separate
 * aggregation — one trend algorithm, two consumers (live dashboard,
 * persisted history).
 */
export function computeWeeklyInsights(params: {
  userId: string;
  periodStart: Date;
  periodEnd: Date;
  readingsOldestFirst: NormalizedBiometricReading[];
}): CreateInsightInput[] {
  const { userId, periodStart, periodEnd, readingsOldestFirst } = params;
  const period: InsightPeriod = 'WEEKLY';
  const results: CreateInsightInput[] = [];

  for (const trend of computeTrends(readingsOldestFirst)) {
    results.push({
      userId,
      period,
      metric: trend.metric,
      periodStart,
      periodEnd,
      value: trend.current,
      trend: trend.delta,
      summary: summarize(trend.metric, trend),
    });
  }

  for (const trend of computeWellnessTrends(readingsOldestFirst)) {
    const metric = `wellness.${trend.metric}`;
    results.push({
      userId,
      period,
      metric,
      periodStart,
      periodEnd,
      value: trend.current,
      trend: trend.delta,
      summary: summarize(metric, trend),
    });
  }

  return results;
}

/** Which direction counts as "improved" per wellness score — stress and
 * fatigue are the two where lower is better, everything else is higher-
 * is-better. Used only to pick a single "Biggest Improvement" headline
 * for the weekly report, not for scoring itself. */
const IMPROVEMENT_DIRECTION: Record<string, 'up' | 'down'> = {
  stress: 'down',
  fatigue: 'down',
  recovery: 'up',
  sleep: 'up',
  energy: 'up',
  focus: 'up',
  relaxation: 'up',
  overall: 'up',
};

export interface BiggestImprovementResult {
  metric: string;
  label: string;
  /** Always positive — the improvement's real magnitude (delta, or
   * -delta for a down-is-better metric). */
  magnitude: number;
}

/** Picks the single wellness trend that improved the most this week —
 * "Biggest Improvement" in the weekly report. Reuses the exact
 * `wellnessTrends` output `computeWeeklyInsights` already computes,
 * rather than a separate pass. Returns `null` if nothing improved (every
 * trend flat or worsening) — never picks a negative "improvement". */
export function computeBiggestImprovement(wellnessTrends: TrendResult[]): BiggestImprovementResult | null {
  let best: BiggestImprovementResult | null = null;
  for (const trend of wellnessTrends) {
    const direction = IMPROVEMENT_DIRECTION[trend.metric];
    if (!direction) continue;
    const magnitude = direction === 'up' ? trend.delta : -trend.delta;
    if (magnitude <= 0) continue;
    if (!best || magnitude > best.magnitude) {
      best = { metric: trend.metric, label: METRIC_LABELS[`wellness.${trend.metric}`] ?? trend.metric, magnitude };
    }
  }
  return best;
}
