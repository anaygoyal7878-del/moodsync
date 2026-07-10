import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Spotify's developer program is self-serve, but as of Spotify's February
 * 2026 policy change, a new app's Development Mode client is hard-capped
 * at 5 authorized users. Scaling beyond that requires requesting Extended
 * Quota Mode, which is now a discretionary review (not automatic
 * approval) reserved for apps with an "established, scalable, and
 * impactful use case" — see docs/INTEGRATIONS_RESEARCH.md. That approval
 * is tracked as its own milestone item; this package is buildable and
 * testable today against the 5-user cap regardless.
 *
 * Hard product constraint to carry through to onboarding UI: playback
 * control via `/me/player/play` requires the target user already has an
 * active Spotify Connect session AND holds Spotify Premium — free-tier
 * accounts cannot have playback started remotely by a third party.
 */
export const spotifyIntegrationStatus: IntegrationStatus = {
  id: 'spotify',
  displayName: 'Spotify',
  availability: 'available',
};
