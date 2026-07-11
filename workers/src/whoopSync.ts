import { wearableConnectionRepository, oauthTokenRepository, biometricReadingRepository } from '@moodsync/database';
import { fetchAndNormalizeWhoopData, refreshWhoopToken, type WhoopOAuthConfig } from '@moodsync/integration-whoop';
import { dispatchForReading } from '@moodsync/ai';

/**
 * Standalone entrypoint (not a long-running poll loop): syncs every active
 * WHOOP connection once, then exits. Meant to be invoked on a schedule by
 * an external scheduler (cron, a Kubernetes CronJob, etc.) — see
 * docs/MILESTONES.md's note on why `workers` is a separate deployable from
 * the API server, not a `setInterval` inside it. Run via
 * `npm run start:whoop-sync -w workers`.
 */

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

async function main() {
  const config = requireWhoopConfig();
  const connections = await wearableConnectionRepository.listActive('WHOOP');
  console.log(`[whoop-sync] Found ${connections.length} active WHOOP connection(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      if (!connection.oauthTokenId) throw new Error('Connection has no linked OAuth token');

      const accessToken = await getFreshAccessToken(connection.oauthTokenId, config);
      const readings = await fetchAndNormalizeWhoopData({
        accessToken,
        userId: connection.userId,
        sinceDays: 1, // scheduled runs only need to catch up since the last run
      });

      const inserted = await biometricReadingRepository.bulkInsert(readings);
      await wearableConnectionRepository.markSynced(connection.id);

      if (inserted > 0) {
        const latest = await biometricReadingRepository.findLatestNormalized(connection.userId);
        if (latest) await dispatchForReading(latest.reading, latest.id);
      }

      console.log(`[whoop-sync] user=${connection.userId} inserted=${inserted}`);
      succeeded++;
    } catch (error) {
      failed++;
      console.error(`[whoop-sync] user=${connection.userId} failed:`, error instanceof Error ? error.message : error);
      // A single connection's refresh-token being revoked on WHOOP's side
      // shouldn't stop other users' syncs — mark this one connection as
      // errored (surfaced to the user to reconnect) and move on.
      await wearableConnectionRepository.markStatus(connection.id, 'ERROR');
    }
  }

  console.log(`[whoop-sync] Done. succeeded=${succeeded} failed=${failed}`);
  process.exit(failed > 0 && succeeded === 0 ? 1 : 0);
}

main();
