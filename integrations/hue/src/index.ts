import type { IntegrationStatus } from '@moodsync/shared';

export const hueIntegrationStatus: IntegrationStatus = {
  id: 'hue',
  displayName: 'Philips Hue',
  availability: 'available',
};

export {
  buildHueAuthorizationUrl,
  exchangeHueAuthorizationCode,
  refreshHueToken,
  HueOAuthError,
  type HueOAuthConfig,
  type HueTokenResponse,
} from './oauth.js';

export {
  HueClient,
  HueApiError,
  createHueApplicationKey,
  buildLightStatePayload,
  type HueLight,
  type HueScene,
  type HueLightState,
} from './client.js';
