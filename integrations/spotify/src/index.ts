import type { IntegrationStatus } from '@moodsync/shared';

/**
 * Spotify's developer program is self-serve, but as of Spotify's February
 * 2026 policy change, a new app's Development Mode client is hard-capped
 * at **5 authorized users**, and the app owner's account must hold
 * Spotify Premium. Scaling beyond that requires Extended Quota Mode —
 * re-verified for Milestone 8 (see docs/INTEGRATIONS_RESEARCH.md): as of
 * May 2025 this requires a **legally registered business entity**, an
 * active launched service, and **at least 250,000 monthly active users**,
 * reviewed via a 4-step dashboard questionnaire that can take up to six
 * weeks. This is a substantially higher bar than a discretionary content
 * review — MoodSync has no realistic path to Extended Quota Mode until
 * well past an initial beta. Tracked as its own milestone item (8b); this
 * package is buildable and testable today against the 5-user cap
 * regardless.
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

export {
  SPOTIFY_SCOPES,
  buildSpotifyAuthorizationUrl,
  exchangeSpotifyAuthorizationCode,
  refreshSpotifyToken,
  SpotifyOAuthError,
  type SpotifyOAuthConfig,
  type SpotifyTokenResponse,
} from './oauth.js';

export { SpotifyClient, SpotifyApiError, buildPlayRequestBody, type PlayPlaylistParams } from './client.js';
