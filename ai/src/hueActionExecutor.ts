import { smartHomeConnectionRepository, oauthTokenRepository } from '@moodsync/database';
import { HueClient, refreshHueToken, type HueOAuthConfig } from '@moodsync/integration-hue';
import type { AutomationAction } from '@moodsync/shared';

function requireHueConfig(): HueOAuthConfig {
  const clientId = process.env.HUE_CLIENT_ID;
  const clientSecret = process.env.HUE_CLIENT_SECRET;
  const redirectUri = process.env.HUE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('HUE_CLIENT_ID, HUE_CLIENT_SECRET, and HUE_REDIRECT_URI must be set to dispatch Hue actions');
  }
  return { clientId, clientSecret, redirectUri };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same transparent-refresh rationale as backend/src/services/hueService.ts
 * — duplicated rather than shared because this package (like workers)
 * can't reach into the backend app's internals. See README.md. */
async function getFreshHueTokens(
  oauthTokenId: string,
  config: HueOAuthConfig,
): Promise<{ accessToken: string; applicationKey: string }> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens?.providerSecret) throw new Error('No stored Hue application key for this connection');

  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return { accessToken: tokens.accessToken, applicationKey: tokens.providerSecret };
  }
  if (!tokens.refreshToken) {
    throw new Error('Hue access token expired and no refresh token was issued for this connection');
  }

  const refreshed = await refreshHueToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    providerSecret: tokens.providerSecret,
    scope: '',
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return { accessToken: refreshed.access_token, applicationKey: tokens.providerSecret };
}

/** Executes one Hue action. Param shapes are validated here (not via a
 * shared schema) since they're intentionally per-action-type and
 * `AutomationAction.params` is typed `Record<string, unknown>` at rest —
 * see shared/src/automation.ts for why. */
export async function executeHueAction(userId: string, action: AutomationAction): Promise<void> {
  const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE');
  if (!connection?.oauthTokenId) throw new Error('No Hue connection for this user');

  const { accessToken, applicationKey } = await getFreshHueTokens(connection.oauthTokenId, requireHueConfig());
  const client = new HueClient(accessToken, applicationKey);

  switch (action.type) {
    case 'hue.set_scene': {
      const sceneId = action.params.sceneId;
      if (typeof sceneId !== 'string') throw new Error('hue.set_scene requires params.sceneId (string)');
      await client.activateScene(sceneId);
      return;
    }
    case 'hue.set_brightness': {
      const { deviceId, brightness } = action.params;
      if (typeof deviceId !== 'string' || typeof brightness !== 'number') {
        throw new Error('hue.set_brightness requires params.deviceId (string) and params.brightness (number)');
      }
      await client.setLightState(deviceId, { on: true, brightness });
      return;
    }
    case 'hue.set_color_temperature': {
      const { deviceId, mirek } = action.params;
      if (typeof deviceId !== 'string' || typeof mirek !== 'number') {
        throw new Error('hue.set_color_temperature requires params.deviceId (string) and params.mirek (number)');
      }
      await client.setLightState(deviceId, { on: true, colorTemperatureMirek: mirek });
      return;
    }
    default:
      throw new Error(`Action type "${action.type}" is not a Hue action`);
  }
}
