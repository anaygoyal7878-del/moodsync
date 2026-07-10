import type { IntegrationStatus } from '@moodsync/shared';

export const whoopIntegrationStatus: IntegrationStatus = {
  id: 'whoop',
  displayName: 'WHOOP',
  availability: 'available',
};

export {
  buildWhoopAuthorizationUrl,
  exchangeWhoopAuthorizationCode,
  refreshWhoopToken,
  WhoopOAuthError,
  WHOOP_SCOPES,
  type WhoopOAuthConfig,
  type WhoopTokenResponse,
} from './oauth.js';

export {
  WhoopClient,
  WhoopApiError,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
  type WhoopProfile,
  type DateRange,
} from './client.js';

export { normalizeWhoopData } from './normalize.js';
export { fetchAndNormalizeWhoopData } from './sync.js';
