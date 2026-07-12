import { oauthTokenRepository, biometricReadingRepository, wearableConnectionRepository, type WearableConnection } from '@moodsync/database';
import {
  fetchAndNormalizeGoogleHealthData,
  refreshGoogleHealthToken,
  GoogleHealthClient,
  pickPrimaryDevice,
  type GoogleHealthOAuthConfig,
} from '@moodsync/integration-fitbit';
import type { ProviderSyncRunner } from '../lib/runProviderSync.js';

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

export function createFitbitSyncRunner(): ProviderSyncRunner {
  const config = requireGoogleHealthConfig();

  return {
    provider: 'GOOGLE_HEALTH',
    logPrefix: 'fitbit-sync',
    async syncConnection(connection: WearableConnection): Promise<number> {
      const accessToken = await getFreshAccessToken(connection.oauthTokenId!, config);
      const readings = await fetchAndNormalizeGoogleHealthData({
        accessToken,
        userId: connection.userId,
        sinceDays: 1,
      });
      const inserted = await biometricReadingRepository.bulkInsert(readings);
      await syncDeviceInfo(connection.id, accessToken);
      return inserted;
    },
  };
}
