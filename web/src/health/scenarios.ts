/**
 * Scripted biometric scenarios for the simulator. Each defines a target
 * physiological profile the simulator smoothly interpolates toward, so the
 * dashboard has something worth watching change in a live demo instead of
 * flat noise. None of these numbers are patient data — they're plausible
 * ranges for a healthy adult at rest/under load, used only to exercise the
 * wellness engine end to end.
 */
export type ScenarioId =
  | 'baseline'
  | 'stress'
  | 'workout'
  | 'recovery'
  | 'windDown'
  | 'asleep'
  | 'mindful'
  | 'lowEnergy';

export interface ScenarioProfile {
  id: ScenarioId;
  label: string;
  description: string;
  heartRate: number;
  hrv: number;
  respiratoryRate: number;
  restingHeartRate: number;
  sleepStage?: 'awake' | 'core' | 'deep' | 'rem' | 'inBed';
  isMindfulSessionActive?: boolean;
  stepRate: number;
}

export const scenarioProfiles: Record<ScenarioId, ScenarioProfile> = {
  baseline: {
    id: 'baseline',
    label: 'Everyday baseline',
    description: 'A normal alert daytime moment — nothing notable in either direction.',
    heartRate: 72,
    hrv: 55,
    respiratoryRate: 15,
    restingHeartRate: 62,
    stepRate: 2,
  },
  stress: {
    id: 'stress',
    label: 'Stress spike',
    description: 'Elevated heart rate, suppressed HRV, faster breathing — a tense moment.',
    heartRate: 108,
    hrv: 22,
    respiratoryRate: 21,
    restingHeartRate: 64,
    stepRate: 0,
  },
  workout: {
    id: 'workout',
    label: 'Workout',
    description: 'Sustained high heart rate and breathing rate from physical exertion.',
    heartRate: 148,
    hrv: 30,
    respiratoryRate: 28,
    restingHeartRate: 63,
    stepRate: 40,
  },
  recovery: {
    id: 'recovery',
    label: 'Post-workout recovery',
    description: 'Heart rate coming down from exertion but not yet back to baseline.',
    heartRate: 95,
    hrv: 38,
    respiratoryRate: 19,
    restingHeartRate: 63,
    stepRate: 5,
  },
  windDown: {
    id: 'windDown',
    label: 'Winding down',
    description: 'Evening — heart rate and breathing slowing ahead of sleep.',
    heartRate: 64,
    hrv: 48,
    respiratoryRate: 13,
    restingHeartRate: 60,
    sleepStage: 'awake',
    stepRate: 0,
  },
  asleep: {
    id: 'asleep',
    label: 'Asleep',
    description: 'Deep sleep stage — low heart rate, slow breathing.',
    heartRate: 52,
    hrv: 62,
    respiratoryRate: 12,
    restingHeartRate: 58,
    sleepStage: 'deep',
    stepRate: 0,
  },
  mindful: {
    id: 'mindful',
    label: 'Mindfulness session',
    description: 'An active guided breathing or meditation session.',
    heartRate: 66,
    hrv: 58,
    respiratoryRate: 10,
    restingHeartRate: 61,
    isMindfulSessionActive: true,
    stepRate: 0,
  },
  lowEnergy: {
    id: 'lowEnergy',
    label: 'Low energy',
    description: 'Low activity and slightly depressed heart rate — a sluggish afternoon.',
    heartRate: 58,
    hrv: 40,
    respiratoryRate: 13,
    restingHeartRate: 61,
    stepRate: 0,
  },
};

export const demoScenarioLoop: ScenarioId[] = [
  'baseline',
  'stress',
  'recovery',
  'lowEnergy',
  'workout',
  'recovery',
  'mindful',
  'windDown',
  'asleep',
];
