/** Evidence strength, per RESEARCH.md's confidence scale — never invented per-oil. */
export type ConfidenceLevel = 'high' | 'moderate' | 'low' | 'insufficient';

/** The six wellness states the engine can infer. Kept as a closed union so
 * every consumer (UI, engine, scent library) is forced to handle all of them. */
export type WellnessStateId =
  | 'relax'
  | 'focus'
  | 'sleep'
  | 'energize'
  | 'recover'
  | 'meditate';

export type SleepStage = 'awake' | 'core' | 'deep' | 'rem' | 'inBed';

/**
 * One point-in-time reading from Apple Health. Field names and units
 * intentionally mirror HealthKit's own vocabulary (HKQuantityTypeIdentifier
 * heartRate/heartRateVariabilitySDNN/respiratoryRate/restingHeartRate,
 * HKCategoryTypeIdentifier.sleepAnalysis, HKCategoryTypeIdentifier.mindfulSession)
 * so that swapping the simulated source for a real HealthKit bridge later is
 * a data-source change, not a type change. See HEALTHKIT_MIGRATION.md.
 */
export interface BiometricSample {
  timestamp: number;
  /** bpm */
  heartRate: number;
  /** bpm, slow-moving daily baseline */
  restingHeartRate?: number;
  /** SDNN, ms — HealthKit's heartRateVariabilitySDNN */
  hrv?: number;
  /** breaths per minute */
  respiratoryRate?: number;
  sleepStage?: SleepStage;
  isMindfulSessionActive?: boolean;
  /** steps in the current rolling window, activity proxy */
  steps?: number;
}

export interface ScentEvidenceEntry {
  effect: string;
  confidence: ConfidenceLevel;
  summary: string;
  citation: string;
  /** Which wellness states this specific evidence entry actually supports —
   * explicit rather than inferred from the `effect` string, so the
   * recommender never has to guess which citation backs which claim. */
  relatedStates: WellnessStateId[];
}

export interface ScentProfile {
  id: string;
  name: string;
  latinName: string;
  family: string;
  description: string;
  primaryEffects: WellnessStateId[];
  evidence: ScentEvidenceEntry[];
  bestTimeOfDay: string[];
  compatibleBlends: string[];
  safetyNotes: string[];
}

export interface ContributingFactor {
  metric: string;
  description: string;
  /** relative weight this factor had in the final assessment, 0-1 */
  weight: number;
}

export interface WellnessAssessment {
  state: WellnessStateId;
  /** 0-1, calibrated by how much signal was actually available */
  confidence: number;
  contributingFactors: ContributingFactor[];
  timestamp: number;
  /** raw per-state scores, for the "why" explanation and debugging */
  componentScores: Record<WellnessStateId, number>;
}

export interface ScentRecommendation {
  scent: ScentProfile;
  wellnessState: WellnessStateId;
  confidence: ConfidenceLevel;
  explanation: string[];
  timestamp: number;
  /** True when no scent has direct evidence for this state and we fell
   * back to a related, calming option — surfaced honestly in the UI
   * rather than silently presenting it as a direct match. */
  isFallback?: boolean;
}

export interface TimelineEntry {
  timestamp: number;
  state: WellnessStateId;
  heartRate: number;
  confidence: number;
}
