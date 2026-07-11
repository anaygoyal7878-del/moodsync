import {
  buildGoogleHealthAuthorizationUrl,
  exchangeGoogleHealthAuthorizationCode,
  refreshGoogleHealthToken,
  fetchAndNormalizeGoogleHealthData,
  type GoogleHealthOAuthConfig,
} from '@moodsync/integration-fitbit';
import { env } from '../config/env.js';
import { generatePkcePair } from '../lib/pkce.js';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { wearableConnectionRepository, oauthTokenRepository, biometricReadingRepository } from '@moodsync/database';
import { dispatchForReading } from '@moodsync/ai';

export class FitbitNotConfiguredError extends Error {
  constructor() {
    super('Fitbit (Google Health) integration is not configured on this server (missing client credentials)');
  }
}

function requireGoogleHealthConfig(): GoogleHealthOAuthConfig {
  if (!env.GOOGLE_HEALTH_CLIENT_ID || !env.GOOGLE_HEALTH_CLIENT_SECRET || !env.GOOGLE_HEALTH_REDIRECT_URI) {
    throw new FitbitNotConfiguredError();
  }
  return {
    clientId: env.GOOGLE_HEALTH_CLIENT_ID,
    clientSecret: env.GOOGLE_HEALTH_CLIENT_SECRET,
    redirectUri: env.GOOGLE_HEALTH_REDIRECT_URI,
  };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same transparent-refresh rationale as whoopService.ts's equivalent. */
async function getFreshAccessToken(oauthTokenId: string, config: GoogleHealthOAuthConfig): Promise<string> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens) throw new Error('No stored credentials for this connection');

  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error('Google Health access token expired and no refresh token was issued for this connection');
  }

  const refreshed = await refreshGoogleHealthToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    // Google only returns a new refresh_token on rare re-consent flows —
    // keep the existing one otherwise, same pattern as WHOOP's refresh.
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

export const fitbitService = {
  async buildAuthorizationRedirect(userId: string, returnTo: string): Promise<string> {
    const config = requireGoogleHealthConfig();
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = await createOAuthState({ userId, provider: 'google_health', codeVerifier, returnTo });
    return buildGoogleHealthAuthorizationUrl(config, { state, codeChallenge });
  },

  async handleCallback(params: { code: string; state: string }): Promise<{ returnTo: string }> {
    const config = requireGoogleHealthConfig();
    const statePayload = await verifyOAuthState(params.state);

    const tokenResponse = await exchangeGoogleHealthAuthorizationCode(config, {
      code: params.code,
      codeVerifier: statePayload.codeVerifier,
    });

    // No providerUserId stored: Google Health's profile/identity endpoints
    // weren't independently confirmed and nothing downstream depends on
    // this value — see docs/INTEGRATIONS_RESEARCH.md.
    await wearableConnectionRepository.upsertConnection({
      userId: statePayload.userId,
      provider: 'GOOGLE_HEALTH',
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        scope: tokenResponse.scope,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
    });

    return { returnTo: statePayload.returnTo };
  },

  async syncConnection(connectionId: string, userId: string, days = 7): Promise<number> {
    const connection = await wearableConnectionRepository.findByUserAndProvider(userId, 'GOOGLE_HEALTH');
    if (!connection || connection.id !== connectionId || !connection.oauthTokenId) {
      throw new Error('Google Health connection not found for this user');
    }

    const accessToken = await getFreshAccessToken(connection.oauthTokenId, requireGoogleHealthConfig());
    const readings = await fetchAndNormalizeGoogleHealthData({ accessToken, userId, sinceDays: days });
    const inserted = await biometricReadingRepository.bulkInsert(readings);
    await wearableConnectionRepository.markSynced(connection.id);

    if (inserted > 0) {
      const latest = await biometricReadingRepository.findLatestNormalized(userId);
      if (latest) await dispatchForReading(latest.reading, latest.id);
    }

    return inserted;
  },
};
