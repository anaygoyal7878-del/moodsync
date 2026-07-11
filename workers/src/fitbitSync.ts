import { wearableConnectionRepository, oauthTokenRepository, biometricReadingRepository } from '@moodsync/database';
import {
  fetchAndNormalizeGoogleHealthData,
  refreshGoogleHealthToken,
  GoogleHealthClient,
  pickPrimaryDevice,
  type GoogleHealthOAuthConfig,
} from '@moodsync/integration-fitbit';
import { dispatchForReading } from '@moodsync/ai';

/**
 * Standalone entrypoint for Fitbit (Google Health) — same shape and
 * rationale as whoopSync.ts. Run via `npm run start:fitbit-sync -w workers`.
 */

function requireGoogleHealthConfig(): GoogleHealthOAuthConfig {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, and GOOGLE_HEALTH_REDIRECT_URI must be set for the sync worker',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same rationale and logic as backend/src/services/fitbitService.ts's
 * equivalent — duplicated rather than imported because workers is a
 * separate deployable that can't reach into the backend app's internals. */
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
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

/** Same rationale as backend/src/services/fitbitService.ts's equivalent —
 * best-effort, doesn't fail the sync run over a device-info hiccup. */
async function syncDeviceInfo(connectionId: string, accessToken: string): Promise<void> {
  try {
    const client = new GoogleHealthClient(accessToken);
    const devices = await client.listPairedDevices();
    const device = pickPrimaryDevice(devices);
    if (!device) return;

    await wearableConnectionRepository.updateDeviceInfo(connectionId, {
      deviceName: device.deviceVersion,
      batteryLevel: device.batteryLevel,
      batteryStatus: device.batteryStatus,
    });
  } catch (error) {
    console.error(`[fitbit-sync] Failed to sync device info for connection ${connectionId}:`, error);
  }
}

async function main() {
  const config = requireGoogleHealthConfig();
  const connections = await wearableConnectionRepository.listActive('GOOGLE_HEALTH');
  console.log(`[fitbit-sync] Found ${connections.length} active Fitbit (Google Health) connection(s)`);

  let succeeded = 0;
  let failed = 0;

  for (const connection of connections) {
    try {
      if (!connection.oauthTokenId) throw new Error('Connection has no linked OAuth token');

      const accessToken = await getFreshAccessToken(connection.oauthTokenId, config);
      const readings = await fetchAndNormalizeGoogleHealthData({
        accessToken,
        userId: connection.userId,
        sinceDays: 1, // scheduled runs only need to catch up since the last run
      });

      const inserted = await biometricReadingRepository.bulkInsert(readings);
      await wearableConnectionRepository.markSynced(connection.id);
      await syncDeviceInfo(connection.id, accessToken);

      if (inserted > 0) {
        const latest = await biometricReadingRepository.findLatestNormalized(connection.userId);
        if (latest) await dispatchForReading(latest.reading, latest.id);
      }

      console.log(`[fitbit-sync] user=${connection.userId} inserted=${inserted}`);
      succeeded++;
    } catch (error) {
      failed++;
      console.error(`[fitbit-sync] user=${connection.userId} failed:`, error instanceof Error ? error.message : error);
      await wearableConnectionRepository.markStatus(connection.id, 'ERROR');
    }
  }

  console.log(`[fitbit-sync] Done. succeeded=${succeeded} failed=${failed}`);
  process.exit(failed > 0 && succeeded === 0 ? 1 : 0);
}

main();
