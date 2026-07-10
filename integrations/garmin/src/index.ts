import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Garmin's Connect Developer Program (a business-partnership application,
 * not self-serve) has been showing "Under Construction" on its
 * application page for 2+ months as of this research, corroborated by a
 * Garmin employee on Garmin's own developer forum — see
 * docs/INTEGRATIONS_RESEARCH.md. Not an official freeze announcement, but
 * unusable for a new applicant today. This package intentionally has no
 * live client: it exists so the rest of the product (dashboard, wearable
 * picker) can honestly model "Garmin isn't connectable yet" via
 * `garminIntegrationStatus.availability` rather than a silent failure —
 * and becomes a real implementation the moment the program reopens.
 */
export const garminIntegrationStatus: IntegrationStatus = {
  id: 'garmin',
  displayName: 'Garmin',
  availability: 'not_yet_available',
  unavailableReason:
    "Garmin's developer partnership program application is currently unavailable (page has shown \"Under Construction\" for an extended period). We'll enable this the moment applications reopen.",
};
