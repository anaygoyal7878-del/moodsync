/**
 * Every wearable integration produces this shape, regardless of provider.
 * Fields are optional wherever a real platform doesn't expose that metric
 * — see docs/INTEGRATIONS_RESEARCH.md for exactly which providers support
 * which fields. The decision engine (ai/) must never assume a field is
 * present.
 */
export interface NormalizedBiometricReading {
  provider: WearableProviderId;
  userId: string;
  /** ISO 8601 */
  timestamp: string;
  heartRate?: number | undefined;
  restingHeartRate?: number | undefined;
  /** Milliseconds (SDNN). Apple Health-only today — no confirmed WHOOP or
   * Google Health field maps to this cleanly (WHOOP's recovery HRV is a
   * different metric/units, not independently confirmed to be SDNN). */
  heartRateVariability?: number | undefined;
  /** Breaths per minute. Apple Health-only today. */
  respiratoryRate?: number | undefined;
  /** 0-100 percentage (SpO2). Apple Health-only today — see
   * docs/APPLE_HEALTH_ARCHITECTURE.md §6 for a real caveat about this
   * metric's availability on some US Apple Watch hardware. */
  bloodOxygen?: number | undefined;
  /** 0-100, provider-normalized */
  sleepScore?: number | undefined;
  /** Minutes of deep/slow-wave sleep in the most recent sleep session.
   * WHOOP (`stage_summary.total_slow_wave_sleep_time_milli`) and Google
   * Health/Fitbit (`stagesSummary[type=DEEP].minutes`) both expose this in
   * their raw API responses — see integrations/whoop/src/normalize.ts and
   * integrations/fitbit/src/normalize.ts. Feeds the stage-weighted sleep
   * score in ai/src/wellness.ts (docs/WELLNESS_SCORING.md); absent for
   * providers that don't report stage-level detail. */
  deepSleepMinutes?: number | undefined;
  /** Minutes of REM sleep in the most recent sleep session. Same
   * WHOOP/Google Health provenance as `deepSleepMinutes`. */
  remSleepMinutes?: number | undefined;
  /** Minutes of light sleep in the most recent sleep session. Same
   * WHOOP/Google Health provenance as `deepSleepMinutes`. */
  lightSleepMinutes?: number | undefined;
  /** 0-100. WHOOP-native ("Recovery"); no Google Health equivalent today. */
  recoveryScore?: number | undefined;
  /** 0-100. No confirmed WHOOP or Google Health equivalent today — only
   * populated once a provider that exposes it (e.g. Garmin's native
   * stress score) is actually integrated. */
  stressLevel?: number | undefined;
  /** 0-100, normalized from steps/strain/whatever the source provider has. */
  activityLevel?: number | undefined;
  steps?: number | undefined;
  calories?: number | undefined;
}

export type WearableProviderId = 'whoop' | 'google_health' | 'garmin' | 'apple_health' | 'amazfit';

export type SmartHomeProviderId = 'hue' | 'spotify' | 'ecobee' | 'alexa' | 'homekit';

export type IntegrationAvailability = 'available' | 'not_yet_available';

/**
 * Every integration package exports metadata describing its current real
 * status, so the API/dashboard can honestly tell a user "Garmin isn't
 * connectable yet" instead of silently failing a connect attempt. This is
 * intentionally data, not a comment — see integrations/garmin and
 * integrations/ecobee for the two `not_yet_available` cases and why.
 */
export interface IntegrationStatus {
  id: WearableProviderId | SmartHomeProviderId;
  displayName: string;
  availability: IntegrationAvailability;
  /** Required when availability is 'not_yet_available'. */
  unavailableReason?: string;
}
