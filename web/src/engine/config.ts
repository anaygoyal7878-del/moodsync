import type { WellnessStateId } from '../types/domain';
import { ScoreCurve } from './scoreCurve';
import type { MetricKey } from './features';

export interface MetricWeight {
  metric: MetricKey;
  weight: number;
  curve: ScoreCurve;
}

export interface WellnessStateProfile {
  state: WellnessStateId;
  metricWeights: MetricWeight[];
}

/**
 * The tunable "model": every wellness state's sensitivity to every metric,
 * expressed as data (weight + curve) rather than branching logic. This is a
 * reasonable first-cut starting point, not a clinical claim — it's meant to
 * be replaced by a data-driven, continuously-tuned configuration as real
 * usage feedback comes in, the same way MoodSync's native engine treats its
 * own default weights.
 */
export const wellnessEngineConfig: WellnessStateProfile[] = [
  {
    state: 'relax',
    metricWeights: [
      { metric: 'hrv', weight: 0.3, curve: new ScoreCurve([{ x: 20, y: 1.0 }, { x: 45, y: 0.5 }, { x: 65, y: 0.05 }]) },
      { metric: 'heartRate', weight: 0.25, curve: new ScoreCurve([{ x: 65, y: 0.1 }, { x: 90, y: 0.6 }, { x: 115, y: 1.0 }, { x: 150, y: 0.6 }]) },
      { metric: 'respiratoryRate', weight: 0.25, curve: new ScoreCurve([{ x: 12, y: 0.05 }, { x: 16, y: 0.4 }, { x: 22, y: 1.0 }]) },
      { metric: 'timeOfDayHour', weight: 0.15, curve: new ScoreCurve([{ x: 6, y: 0.3 }, { x: 12, y: 0.4 }, { x: 18, y: 0.6 }, { x: 21, y: 0.8 }, { x: 23, y: 0.5 }]) },
      { metric: 'mindfulActive', weight: 0.05, curve: new ScoreCurve([{ x: 0, y: 0.6 }, { x: 1, y: 0.2 }]) },
    ],
  },
  {
    state: 'focus',
    metricWeights: [
      { metric: 'timeOfDayHour', weight: 0.35, curve: new ScoreCurve([{ x: 6, y: 0.2 }, { x: 9, y: 0.9 }, { x: 14, y: 1.0 }, { x: 17, y: 0.6 }, { x: 20, y: 0.2 }, { x: 23, y: 0.05 }]) },
      { metric: 'heartRate', weight: 0.2, curve: new ScoreCurve([{ x: 60, y: 0.3 }, { x: 80, y: 0.8 }, { x: 100, y: 1.0 }, { x: 130, y: 0.4 }]) },
      { metric: 'stepRate', weight: 0.15, curve: new ScoreCurve([{ x: 0, y: 0.3 }, { x: 3, y: 0.8 }, { x: 10, y: 1.0 }, { x: 40, y: 0.4 }]) },
      { metric: 'hrv', weight: 0.15, curve: new ScoreCurve([{ x: 25, y: 0.3 }, { x: 45, y: 0.7 }, { x: 65, y: 0.9 }]) },
      { metric: 'respiratoryRate', weight: 0.15, curve: new ScoreCurve([{ x: 12, y: 0.6 }, { x: 15, y: 1.0 }, { x: 19, y: 0.5 }]) },
    ],
  },
  {
    state: 'sleep',
    metricWeights: [
      { metric: 'sleepDepth', weight: 0.35, curve: new ScoreCurve([{ x: 0, y: 0.1 }, { x: 0.3, y: 0.4 }, { x: 1, y: 1.0 }]) },
      { metric: 'heartRate', weight: 0.3, curve: new ScoreCurve([{ x: 45, y: 1.0 }, { x: 60, y: 0.6 }, { x: 80, y: 0.05 }]) },
      { metric: 'timeOfDayHour', weight: 0.2, curve: new ScoreCurve([{ x: 0, y: 1.0 }, { x: 5, y: 0.9 }, { x: 7, y: 0.3 }, { x: 10, y: 0.05 }, { x: 21, y: 0.3 }, { x: 23, y: 0.8 }]) },
      { metric: 'respiratoryRate', weight: 0.15, curve: new ScoreCurve([{ x: 10, y: 1.0 }, { x: 14, y: 0.6 }, { x: 18, y: 0.1 }]) },
    ],
  },
  {
    state: 'energize',
    metricWeights: [
      { metric: 'stepRate', weight: 0.3, curve: new ScoreCurve([{ x: 0, y: 1.0 }, { x: 5, y: 0.4 }, { x: 15, y: 0.05 }]) },
      { metric: 'timeOfDayHour', weight: 0.25, curve: new ScoreCurve([{ x: 6, y: 0.3 }, { x: 9, y: 0.2 }, { x: 13, y: 0.7 }, { x: 15, y: 1.0 }, { x: 18, y: 0.6 }, { x: 21, y: 0.2 }]) },
      { metric: 'heartRate', weight: 0.25, curve: new ScoreCurve([{ x: 48, y: 0.9 }, { x: 60, y: 1.0 }, { x: 75, y: 0.5 }, { x: 95, y: 0.1 }]) },
      { metric: 'hrv', weight: 0.2, curve: new ScoreCurve([{ x: 20, y: 0.3 }, { x: 40, y: 0.6 }, { x: 55, y: 0.4 }]) },
    ],
  },
  {
    state: 'recover',
    metricWeights: [
      { metric: 'heartRate', weight: 0.3, curve: new ScoreCurve([{ x: 65, y: 0.1 }, { x: 90, y: 0.6 }, { x: 105, y: 1.0 }, { x: 130, y: 0.6 }, { x: 150, y: 0.3 }]) },
      { metric: 'respiratoryRate', weight: 0.25, curve: new ScoreCurve([{ x: 14, y: 0.1 }, { x: 18, y: 0.5 }, { x: 23, y: 1.0 }, { x: 28, y: 0.6 }]) },
      { metric: 'hrv', weight: 0.2, curve: new ScoreCurve([{ x: 20, y: 0.2 }, { x: 35, y: 0.7 }, { x: 50, y: 1.0 }, { x: 65, y: 0.6 }]) },
      { metric: 'stepRate', weight: 0.15, curve: new ScoreCurve([{ x: 0, y: 0.2 }, { x: 5, y: 0.6 }, { x: 15, y: 1.0 }, { x: 35, y: 0.5 }]) },
      { metric: 'restingHeartRate', weight: 0.1, curve: new ScoreCurve([{ x: 55, y: 0.3 }, { x: 63, y: 0.6 }, { x: 70, y: 1.0 }]) },
    ],
  },
  {
    state: 'meditate',
    metricWeights: [
      { metric: 'mindfulActive', weight: 0.5, curve: new ScoreCurve([{ x: 0, y: 0.05 }, { x: 1, y: 1.0 }]) },
      { metric: 'respiratoryRate', weight: 0.2, curve: new ScoreCurve([{ x: 8, y: 1.0 }, { x: 12, y: 0.6 }, { x: 16, y: 0.1 }]) },
      { metric: 'heartRate', weight: 0.15, curve: new ScoreCurve([{ x: 55, y: 0.8 }, { x: 70, y: 0.6 }, { x: 90, y: 0.1 }]) },
      { metric: 'hrv', weight: 0.15, curve: new ScoreCurve([{ x: 30, y: 0.3 }, { x: 50, y: 0.7 }, { x: 65, y: 1.0 }]) },
    ],
  },
];

/** Confidence softmax temperature — lower = more decisive between states. */
export const CONFIDENCE_TEMPERATURE = 0.35;
/** Only surface a metric as a "contributing factor" if its weight clears this bar. */
export const CONTRIBUTING_FACTOR_THRESHOLD = 0.15;
