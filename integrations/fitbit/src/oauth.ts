/**
 * Google Health API OAuth 2.0 (standard authorization-code + PKCE).
 * Endpoints/scopes verified against developers.google.com/health — see
 * docs/INTEGRATIONS_RESEARCH.md's "REST implementation details" section.
 * The authorize/token endpoints themselves are Google's universal OAuth
 * endpoints (not Health-API-specific), used identically by every Google
 * API — high confidence independent of the Health API's own docs.
 */
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Four scope bundles cover every metric this integration reads (steps
 * under activity_and_fitness, heart rate under health_metrics_and_measurements,
 * sleep under its own dedicated bundle, device battery/name under
 * settings — confirmed as `pairedDevices.list`'s specific required scope,
 * not bundled with any of the other three) — see
 * docs/INTEGRATIONS_RESEARCH.md for the full 15-scope list this was
 * narrowed down from. */
export const GOOGLE_HEALTH_SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
  'https://www.googleapis.com/auth/googlehealth.settings.readonly',
] as const;

export interface GoogleHealthOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildGoogleHealthAuthorizationUrl(
  config: GoogleHealthOAuthConfig,
  params: { state: string; codeChallenge: string },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', GOOGLE_HEALTH_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Restricted-scope Google APIs only issue a refresh token when both of
  // these are set — without them the connection would silently stop
  // working the first time the short-lived access token expires.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export interface GoogleHealthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export class GoogleHealthOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function postForm(body: Record<string, string>): Promise<GoogleHealthTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new GoogleHealthOAuthError(`Google Health token request failed: ${res.status} ${await res.text()}`, res.status);
  }
  return res.json() as Promise<GoogleHealthTokenResponse>;
}

export async function exchangeGoogleHealthAuthorizationCode(
  config: GoogleHealthOAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<GoogleHealthTokenResponse> {
  return postForm({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: params.codeVerifier,
  });
}

export async function refreshGoogleHealthToken(
  config: GoogleHealthOAuthConfig,
  refreshToken: string,
): Promise<GoogleHealthTokenResponse> {
  return postForm({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}
