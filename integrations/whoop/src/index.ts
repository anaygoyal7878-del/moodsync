import type { IntegrationStatus } from '@moodsync/shared';

/**
 * WHOOP is the only wearable provider with a fully open, self-serve
 * developer program (see docs/INTEGRATIONS_RESEARCH.md) — the first real
 * OAuth client and data-sync implementation lands here in the milestone
 * that follows platform foundation, against the verified endpoints:
 * authorize `https://api.prod.whoop.com/oauth/oauth2/auth`, token
 * `https://api.prod.whoop.com/oauth/oauth2/token`.
 */
export const whoopIntegrationStatus: IntegrationStatus = {
  id: 'whoop',
  displayName: 'WHOOP',
  availability: 'available',
};
