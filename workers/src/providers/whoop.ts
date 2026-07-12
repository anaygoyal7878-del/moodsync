import { oauthTokenRepository, biometricReadingRepository, type WearableConnection } from '@moodsync/database';
import { fetchAndNormalizeWhoopData, refreshWhoopToken, type WhoopOAuthConfig } from '@moodsync/integration-whoop';
import type { ProviderSyncRunner } from '../lib/runProviderSync.js';

function requireWhoopConfig(): WhoopOAuthConfig {
  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  const redirectUri = process.env.WHOOP_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, and WHOOP_REDIRECT_URI must be set for the sync worker');
  }
  return { clientId, clientSecret, redirectUri };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same rationale and logic as backend/src/services/whoopService.ts's
 * equivalent — duplicated rather than imported because workers is a
 * separate deployable that can't reach into the backend app's internals
 * (see README.md on why integrations/workers are top-level packages). */
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

export function createWhoopSyncRunner(): ProviderSyncRunner {
  const config = requireWhoopConfig();

  return {
    provider: 'WHOOP',
    logPrefix: 'whoop-sync',
    async syncConnection(connection: WearableConnection): Promise<number> {
      const accessToken = await getFreshAccessToken(connection.oauthTokenId!, config);
      const readings = await fetchAndNormalizeWhoopData({
        accessToken,
        userId: connection.userId,
        sinceDays: 1, // scheduled runs only need to catch up since the last run
      });
      return biometricReadingRepository.bulkInsert(readings);
    },
  };
}
