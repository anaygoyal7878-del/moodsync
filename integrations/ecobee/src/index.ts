import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Ecobee's developer registration page explicitly states: "Sorry, we are
 * not currently accepting new developer registrations at this time" — a
 * hard, explicit block confirmed directly from ecobee.com/en-us/developers
 * (see docs/INTEGRATIONS_RESEARCH.md). No self-serve path to a client ID
 * exists today. This package has no live client for the same reason as
 * integrations/garmin — it exists so the product can honestly say
 * "Ecobee isn't connectable yet" instead of failing silently.
 */
export const ecobeeIntegrationStatus: IntegrationStatus = {
  id: 'ecobee',
  displayName: 'Ecobee',
  availability: 'not_yet_available',
  unavailableReason:
    "Ecobee's developer program is closed to new registrations. We'll enable this if/when Ecobee reopens applications or grants direct partner access.",
};
