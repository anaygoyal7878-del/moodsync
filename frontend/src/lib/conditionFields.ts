import type { BiometricField, WellnessField, ComparisonOperator } from "@moodsync/shared";

/** Display metadata for every condition field the rule engine actually
 * evaluates (shared/src/automation.ts's `BiometricField`/`WellnessField`
 * unions) — a human label, unit, and a plausible slider range, so the
 * automation builder never shows a bare number with no indication of
 * what it means. Ranges are display/UX bounds only (what a slider can
 * reach), not validation limits enforced anywhere else; a user can still
 * type a custom value outside the slider's range via the numeric input
 * next to it. */
export interface ConditionFieldMeta {
  label: string;
  unit: string;
  group: "Raw biometrics" | "MoodSync wellness scores";
  min: number;
  max: number;
  step: number;
  format: (value: number) => string;
}

export const CONDITION_FIELDS: Record<BiometricField | WellnessField, ConditionFieldMeta> = {
  heartRate: { label: "Heart Rate", unit: "BPM", group: "Raw biometrics", min: 40, max: 200, step: 1, format: (v) => `${v} BPM` },
  restingHeartRate: {
    label: "Resting Heart Rate",
    unit: "BPM",
    group: "Raw biometrics",
    min: 30,
    max: 120,
    step: 1,
    format: (v) => `${v} BPM`,
  },
  sleepScore: { label: "Sleep Score", unit: "score", group: "Raw biometrics", min: 0, max: 100, step: 1, format: (v) => `${v}/100` },
  recoveryScore: {
    label: "Recovery Score",
    unit: "score",
    group: "Raw biometrics",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  stressLevel: { label: "Stress Level", unit: "score", group: "Raw biometrics", min: 0, max: 100, step: 1, format: (v) => `${v}/100` },
  activityLevel: {
    label: "Activity Level",
    unit: "%",
    group: "Raw biometrics",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}%`,
  },
  steps: { label: "Steps", unit: "steps", group: "Raw biometrics", min: 0, max: 30_000, step: 100, format: (v) => `${v.toLocaleString()} steps` },
  calories: {
    label: "Calories Burned",
    unit: "kcal",
    group: "Raw biometrics",
    min: 0,
    max: 5_000,
    step: 50,
    format: (v) => `${v.toLocaleString()} kcal`,
  },
  "wellness.stress": {
    label: "Stress Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.recovery": {
    label: "Recovery Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.sleep": {
    label: "Sleep Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.energy": {
    label: "Energy Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.fatigue": {
    label: "Fatigue Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.focus": {
    label: "Focus Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.relaxation": {
    label: "Relaxation Score (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
  "wellness.overall": {
    label: "Overall Wellness (MoodSync)",
    unit: "score",
    group: "MoodSync wellness scores",
    min: 0,
    max: 100,
    step: 1,
    format: (v) => `${v}/100`,
  },
};

export const CONDITION_FIELD_ORDER: (BiometricField | WellnessField)[] = [
  "heartRate",
  "restingHeartRate",
  "sleepScore",
  "recoveryScore",
  "stressLevel",
  "activityLevel",
  "steps",
  "calories",
  "wellness.stress",
  "wellness.recovery",
  "wellness.sleep",
  "wellness.energy",
  "wellness.fatigue",
  "wellness.focus",
  "wellness.relaxation",
  "wellness.overall",
];

export const OPERATOR_LABELS: Record<ComparisonOperator, string> = {
  lt: "is below",
  lte: "is at or below",
  gt: "is above",
  gte: "is at or above",
  eq: "equals",
};

export const OPERATORS: ComparisonOperator[] = ["lt", "lte", "gt", "gte", "eq"];
