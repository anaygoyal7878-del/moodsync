import {
  buildWhoopAuthorizationUrl,
  exchangeWhoopAuthorizationCode,
  refreshWhoopToken,
  fetchAndNormalizeWhoopData,
  WhoopClient,
  type WhoopOAuthConfig,
} from '@moodsync/integration-whoop';
import { env } from '../config/env.js';
import { generatePkcePair } from '../lib/pkce.js';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { wearableConnectionRepository, oauthTokenRepository, biometricReadingRepository } from '@moodsync/database';
import { dispatchForReading } from '@moodsync/ai';

export class WhoopNotConfiguredError extends Error {
  constructor() {
    super('WHOOP integration is not configured on this server (missing client credentials)');
  }
}

function requireWhoopConfig(): WhoopOAuthConfig {
  if (!env.WHOOP_CLIENT_ID || !env.WHOOP_CLIENT_SECRET || !env.WHOOP_REDIRECT_URI) {
    throw new WhoopNotConfiguredError();
  }
  return { clientId: env.WHOOP_CLIENT_ID, clientSecret: env.WHOOP_CLIENT_SECRET, redirectUri: env.WHOOP_REDIRECT_URI };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000; // refresh 5 minutes before actual expiry

/**
 * Returns a usable access token, transparently refreshing and persisting a
 * new one if the stored token is at or near expiry. WHOOP access tokens
 * are short-lived (typical OAuth pattern), so without this every sync
 * beyond the first token lifetime would start failing — this isn't an
 * edge case, it's the normal path after the first hour.
 */
async function getFreshAccessToken(oauthTokenId: string, config: WhoopOAuthConfig): Promise<string> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens) throw new Error('No stored credentials for this connection');

  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error('WHOOP access token expired and no refresh token was issued for this connection');
  }

  const refreshed = await refreshWhoopToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

export const whoopService = {
  async buildAuthorizationRedirect(userId: string, returnTo: string): Promise<string> {
    const config = requireWhoopConfig();
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = await createOAuthState({ userId, provider: 'whoop', codeVerifier, returnTo });
    return buildWhoopAuthorizationUrl(config, { state, codeChallenge });
  },

  /** Completes the OAuth handshake and stores the connection. Returns the
   * `returnTo` URL the caller should redirect the browser to next. */
  async handleCallback(params: { code: string; state: string }): Promise<{ returnTo: string }> {
    const config = requireWhoopConfig();
    const statePayload = await verifyOAuthState(params.state);

    const tokenResponse = await exchangeWhoopAuthorizationCode(config, {
      code: params.code,
      codeVerifier: statePayload.codeVerifier,
    });

    const client = new WhoopClient(tokenResponse.access_token);
    const profile = await client.getProfile();

    await wearableConnectionRepository.upsertConnection({
      userId: statePayload.userId,
      provider: 'WHOOP',
      providerUserId: String(profile.user_id),
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        scope: tokenResponse.scope,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
    });

    return { returnTo: statePayload.returnTo };
  },

  /** Pulls the last `days` of recovery/sleep/workout data for one
   * connection and writes normalized readings. The actual fetch+normalize
   * logic lives in `@moodsync/integration-whoop` (`fetchAndNormalizeWhoopData`)
   * so this and the standalone sync worker (`workers/src/whoopSync.ts`)
   * call the same code rather than each re-implementing it. */
  async syncConnection(connectionId: string, userId: string, days = 7): Promise<number> {
    const connection = await wearableConnectionRepository.findByUserAndProvider(userId, 'WHOOP');
    if (!connection || connection.id !== connectionId || !connection.oauthTokenId) {
      throw new Error('WHOOP connection not found for this user');
    }

    const accessToken = await getFreshAccessToken(connection.oauthTokenId, requireWhoopConfig());
    const readings = await fetchAndNormalizeWhoopData({ accessToken, userId, sinceDays: days });
    const inserted = await biometricReadingRepository.bulkInsert(readings);
    await wearableConnectionRepository.markSynced(connection.id);

    // Automations react to the user's *current* state, not backfilled
    // history — dispatching once per historical reading in the sync
    // window would fire the same rule repeatedly for old data. Only the
    // latest reading after this sync triggers evaluation.
    if (inserted > 0) {
      const latest = await biometricReadingRepository.findLatestNormalized(userId);
      if (latest) await dispatchForReading(latest.reading, latest.id);
    }

    return inserted;
  },
};
