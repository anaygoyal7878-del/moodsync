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
  // Computed wellness-score keys (ai/src/wellness.ts) — distinct from the
  // raw biometric fields above, but share the same trend-card UI.
  stress: "Stress",
  recovery: "Recovery",
  sleep: "Sleep",
  energy: "Energy",
  fatigue: "Fatigue",
  focus: "Focus",
  relaxation: "Relaxation",
  overall: "Overall wellness",
};

export const METRIC_UNITS: Record<string, string> = {
  heartRate: "bpm",
  restingHeartRate: "bpm",
  calories: "kcal",
};

export function metricLabel(metric: string): string {
  return METRIC_LABELS[metric] ?? metric;
}
