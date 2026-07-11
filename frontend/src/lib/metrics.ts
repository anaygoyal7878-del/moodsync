/** Shared biometric field display metadata — used by BiometricsSection
 * (current readings) and InsightsSection (trends) so the two never drift
 * on what a metric is called. */
export const METRIC_LABELS: Record<string, string> = {
  recoveryScore: "Recovery",
  sleepScore: "Sleep",
  heartRate: "Heart rate",
  restingHeartRate: "Resting HR",
  stressLevel: "Stress",
  activityLevel: "Activity",
  steps: "Steps",
  calories: "Calories",
};

export const METRIC_UNITS: Record<string, string> = {
  heartRate: "bpm",
  restingHeartRate: "bpm",
  calories: "kcal",
};

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}
