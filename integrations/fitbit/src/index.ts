import type { IntegrationStatus } from '@moodsync/shared';

/**
 * The legacy Fitbit Web API sunsets September 2026 — this package targets
 * its official successor, the Google Health API, instead (standard Google
 * OAuth 2.0, restricted-scope, see docs/INTEGRATIONS_RESEARCH.md). It's
 * kept named "fitbit" because that's the wearable brand users recognize
 * and connect; the client underneath talks to Google's endpoints.
 *
 * Development against Google Health API can start self-serve today, but
 * production traffic beyond 100 test users requires Google's OAuth
 * consent screen verification plus an annual CASA security assessment —
 * that approval process is tracked as its own line item in
 * docs/MILESTONES.md, separate from "integration code complete."
 */
export const fitbitIntegrationStatus: IntegrationStatus = {
  id: 'google_health',
  displayName: 'Fitbit (via Google Health)',
  availability: 'available',
};

export {
  GOOGLE_HEALTH_SCOPES,
  buildGoogleHealthAuthorizationUrl,
  exchangeGoogleHealthAuthorizationCode,
  refreshGoogleHealthToken,
  GoogleHealthOAuthError,
  type GoogleHealthOAuthConfig,
  type GoogleHealthTokenResponse,
} from './oauth.js';

export { GoogleHealthClient, GoogleHealthApiError, pickPrimaryDevice, type PairedDevice } from './client.js';

export { normalizeGoogleHealthData } from './normalize.js';

export { fetchAndNormalizeGoogleHealthData } from './sync.js';
