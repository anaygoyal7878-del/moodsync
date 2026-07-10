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
  heartRate?: number;
  restingHeartRate?: number;
  /** 0-100, provider-normalized */
  sleepScore?: number;
  /** 0-100. WHOOP-native ("Recovery"); no Google Health equivalent today. */
  recoveryScore?: number;
  /** 0-100. No confirmed WHOOP or Google Health equivalent today — only
   * populated once a provider that exposes it (e.g. Garmin's native
   * stress score) is actually integrated. */
  stressLevel?: number;
  /** 0-100, normalized from steps/strain/whatever the source provider has. */
  activityLevel?: number;
  steps?: number;
  calories?: number;
}

export type WearableProviderId = 'whoop' | 'google_health' | 'garmin';

export type SmartHomeProviderId = 'hue' | 'spotify' | 'ecobee';

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
