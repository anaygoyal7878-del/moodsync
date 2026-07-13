import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Amazfit devices sync through the Zepp app, operated by Zepp Health.
 * Zepp Health's cloud OAuth API ("Data Cooperation," dev.huami.com) is
 * gated to approved corporate partnerships with no self-serve path — see
 * docs/INTEGRATIONS_RESEARCH.md. But Zepp OS, a separate and genuinely
 * self-serve platform (free consumer account, no business application),
 * supports building Mini Programs that run on the watch with an optional
 * phone-side Side Service — confirmed to have real sensor APIs
 * (HeartRate, Sleep, Step) and a Fetch API with no documented domain
 * restriction, meaning a Mini Program can push a user's own data to
 * MoodSync's backend directly. Architecturally the same solution as
 * Apple Health: no cloud API exists, so the answer is a device-side
 * companion, not OAuth — see docs/AMAZFIT_ARCHITECTURE.md and the actual
 * Mini Program in zepp/MoodSyncCompanion.
 */
export const amazfitIntegrationStatus: IntegrationStatus = {
  id: 'amazfit',
  displayName: 'Amazfit',
  availability: 'available',
};
