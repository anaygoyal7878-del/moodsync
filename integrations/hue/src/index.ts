import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Philips Hue is the only smart home provider with a fully open,
 * self-serve developer program (see docs/INTEGRATIONS_RESEARCH.md). The
 * real OAuth client and light/scene control implementation targets the
 * Hue Remote API (`api.meethue.com`), not the local bridge API — the
 * Remote API is the one reachable from a cloud SaaS with users on
 * different home networks.
 */
export const hueIntegrationStatus: IntegrationStatus = {
  id: 'hue',
  displayName: 'Philips Hue',
  availability: 'available',
};
