import {
  buildHueAuthorizationUrl,
  exchangeHueAuthorizationCode,
  refreshHueToken,
  createHueApplicationKey,
  HueClient,
  type HueOAuthConfig,
  type HueLightState,
} from '@moodsync/integration-hue';
import { env } from '../config/env.js';
import { generatePkcePair } from '../lib/pkce.js';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { smartHomeConnectionRepository, oauthTokenRepository, type DecryptedTokenSet } from '@moodsync/database';

export class HueNotConfiguredError extends Error {
  constructor() {
    super('Hue integration is not configured on this server (missing client credentials)');
  }
}

function requireHueConfig(): HueOAuthConfig {
  if (!env.HUE_CLIENT_ID || !env.HUE_CLIENT_SECRET || !env.HUE_REDIRECT_URI) {
    throw new HueNotConfiguredError();
  }
  return { clientId: env.HUE_CLIENT_ID, clientSecret: env.HUE_CLIENT_SECRET, redirectUri: env.HUE_REDIRECT_URI };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same rationale as whoopService's equivalent: Hue access tokens expire
 * and must be refreshed transparently, or every connection stops working
 * after its first token lifetime. Returns both the fresh access token and
 * the application key, since every Hue call needs both. */
async function getFreshTokens(
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
  const updated: DecryptedTokenSet = {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token,
    providerSecret: tokens.providerSecret,
    scope: '',
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  };
  await oauthTokenRepository.update(oauthTokenId, updated);
  return { accessToken: refreshed.access_token, applicationKey: tokens.providerSecret };
}

export const hueService = {
  async buildAuthorizationRedirect(userId: string, returnTo: string): Promise<string> {
    const config = requireHueConfig();
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = await createOAuthState({ userId, provider: 'hue', codeVerifier, returnTo });
    return buildHueAuthorizationUrl(config, { state, codeChallenge });
  },

  async handleCallback(params: { code: string; state: string }): Promise<{ returnTo: string }> {
    const config = requireHueConfig();
    const statePayload = await verifyOAuthState(params.state);

    const tokenResponse = await exchangeHueAuthorizationCode(config, {
      code: params.code,
      codeVerifier: statePayload.codeVerifier,
    });

    // Minting the application key requires the access token from the
    // exchange we just completed — see integrations/hue's client.ts for
    // why this step is adapted from Hue's v1 pairing pattern rather than
    // independently confirmed for CLIP v2 remote.
    const applicationKey = await createHueApplicationKey(tokenResponse.access_token);

    await smartHomeConnectionRepository.upsertConnection({
      userId: statePayload.userId,
      provider: 'HUE',
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        providerSecret: applicationKey,
        scope: '',
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
    });

    return { returnTo: statePayload.returnTo };
  },

  async syncDevices(userId: string): Promise<number> {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE');
    if (!connection?.oauthTokenId) throw new Error('Hue connection not found for this user');

    const { accessToken, applicationKey } = await getFreshTokens(connection.oauthTokenId, requireHueConfig());
    const client = new HueClient(accessToken, applicationKey);
    const lights = await client.listLights();

    await smartHomeConnectionRepository.replaceDevices(
      connection.id,
      lights.map((light) => ({
        externalDeviceId: light.id,
        name: light.metadata.name,
        deviceType: 'light',
      })),
    );

    return lights.length;
  },

  async setLightState(userId: string, externalDeviceId: string, state: HueLightState): Promise<void> {
    const connection = await smartHomeConnectionRepository.findByUserAndProvider(userId, 'HUE');
    if (!connection?.oauthTokenId) throw new Error('Hue connection not found for this user');

    const { accessToken, applicationKey } = await getFreshTokens(connection.oauthTokenId, requireHueConfig());
    const client = new HueClient(accessToken, applicationKey);
    await client.setLightState(externalDeviceId, state);
  },
};
