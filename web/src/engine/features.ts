import type { BiometricSample } from '../types/domain';

export type MetricKey =
  | 'heartRate'
  | 'hrv'
  | 'respiratoryRate'
  | 'restingHeartRate'
  | 'sleepDepth'
  | 'mindfulActive'
  | 'stepRate'
  | 'timeOfDayHour';

const sleepStageDepth: Record<NonNullable<BiometricSample['sleepStage']>, number> = {
  awake: 0,
  inBed: 0.3,
  rem: 0.7,
  core: 0.6,
  deep: 1.0,
};

/**
 * Converts one HealthKit-shaped sample into the numeric feature map the
 * scoring curves operate on. This is the only place sleep-stage/boolean
 * fields get turned into numbers — everything downstream just sees floats.
 */
export function deriveFeatures(sample: BiometricSample): Partial<Record<MetricKey, number>> {
  const features: Partial<Record<MetricKey, number>> = {
    heartRate: sample.heartRate,
    timeOfDayHour: new Date(sample.timestamp).getHours() + new Date(sample.timestamp).getMinutes() / 60,
  };

  if (sample.hrv !== undefined) features.hrv = sample.hrv;
  if (sample.respiratoryRate !== undefined) features.respiratoryRate = sample.respiratoryRate;
  if (sample.restingHeartRate !== undefined) features.restingHeartRate = sample.restingHeartRate;
  if (sample.sleepStage !== undefined) features.sleepDepth = sleepStageDepth[sample.sleepStage];
  if (sample.isMindfulSessionActive !== undefined) features.mindfulActive = sample.isMindfulSessionActive ? 1 : 0;
  if (sample.steps !== undefined) features.stepRate = sample.steps;

  return features;
}

export const metricLabels: Record<MetricKey, string> = {
  heartRate: 'Heart rate',
  hrv: 'Heart rate variability',
  respiratoryRate: 'Respiratory rate',
  restingHeartRate: 'Resting heart rate',
  sleepDepth: 'Sleep stage',
  mindfulActive: 'Mindfulness session',
  stepRate: 'Recent activity',
  timeOfDayHour: 'Time of day',
};

export function describeMetric(metric: MetricKey, value: number, sample: BiometricSample): string {
  switch (metric) {
    case 'heartRate':
      return `Heart rate at ${Math.round(value)} bpm`;
    case 'hrv':
      return `Heart rate variability at ${Math.round(value)} ms`;
    case 'respiratoryRate':
      return `Breathing rate at ${value.toFixed(1)} breaths/min`;
    case 'restingHeartRate':
      return `Resting heart rate baseline of ${Math.round(value)} bpm`;
    case 'sleepDepth':
      return `Sleep stage: ${sample.sleepStage ?? 'unknown'}`;
    case 'mindfulActive':
      return value > 0 ? 'A mindfulness session is active' : 'No active mindfulness session';
    case 'stepRate':
      return `${Math.round(value)} steps in the recent activity window`;
    case 'timeOfDayHour': {
      const hour = Math.floor(value);
      const period = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 21 ? 'evening' : 'night';
      return `It's currently the ${period}`;
    }
  }
}
