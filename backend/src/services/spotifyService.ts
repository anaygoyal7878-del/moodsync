import { buildSpotifyAuthorizationUrl, exchangeSpotifyAuthorizationCode, type SpotifyOAuthConfig } from '@moodsync/integration-spotify';
import { env } from '../config/env.js';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { smartHomeConnectionRepository } from '@moodsync/database';

export class SpotifyNotConfiguredError extends Error {
  constructor() {
    super('Spotify integration is not configured on this server (missing client credentials)');
  }
}

function requireSpotifyConfig(): SpotifyOAuthConfig {
  if (!env.SPOTIFY_CLIENT_ID || !env.SPOTIFY_CLIENT_SECRET || !env.SPOTIFY_REDIRECT_URI) {
    throw new SpotifyNotConfiguredError();
  }
  return {
    clientId: env.SPOTIFY_CLIENT_ID,
    clientSecret: env.SPOTIFY_CLIENT_SECRET,
    redirectUri: env.SPOTIFY_REDIRECT_URI,
  };
}

/** Unlike WHOOP/Hue, this service has no manual "sync" or "set state"
 * method — Spotify has no readings to sync and no device state to push,
 * only on-demand playback triggered by the dispatch engine (see
 * ai/src/spotifyActionExecutor.ts, which duplicates its own token-refresh
 * logic for the same cross-deployable reason as every other executor). */
export const spotifyService = {
  /** No PKCE here — see integrations/spotify/src/oauth.ts's doc comment
   * for why this provider deliberately deviates from every other OAuth
   * flow in this codebase (Spotify's confidential-client flow and its
   * PKCE flow are documented as separate, non-overlapping options). The
   * signed state token is still used for CSRF protection and to carry
   * `returnTo`, same as every provider — its `codeVerifier` field is
   * simply unused for this one. */
  async buildAuthorizationRedirect(userId: string, returnTo: string): Promise<string> {
    const config = requireSpotifyConfig();
    const state = await createOAuthState({ userId, provider: 'spotify', codeVerifier: 'unused', returnTo });
    return buildSpotifyAuthorizationUrl(config, { state });
  },

  async handleCallback(params: { code: string; state: string }): Promise<{ returnTo: string }> {
    const config = requireSpotifyConfig();
    const statePayload = await verifyOAuthState(params.state);

    const tokenResponse = await exchangeSpotifyAuthorizationCode(config, { code: params.code });

    await smartHomeConnectionRepository.upsertConnection({
      userId: statePayload.userId,
      provider: 'SPOTIFY',
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        scope: tokenResponse.scope,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
    });

    return { returnTo: statePayload.returnTo };
  },
};
