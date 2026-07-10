/**
 * Philips Hue Remote API OAuth 2.0. The token endpoint path
 * (`/v2/oauth2/token` on api.meethue.com) is confirmed directly from
 * working production code (peter-murray/node-hue-api's RemoteApi client).
 * The authorize endpoint follows the same versioned path alongside it and
 * is consistent with Hue's own "Get Started" walkthrough, but — unlike
 * the token endpoint — was not independently confirmed against a second
 * source; spot-check against a live Hue developer app before shipping.
 */
const AUTHORIZE_URL = 'https://api.meethue.com/v2/oauth2/authorize';
const TOKEN_URL = 'https://api.meethue.com/v2/oauth2/token';

export interface HueOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildHueAuthorizationUrl(
  config: HueOAuthConfig,
  params: { state: string; codeChallenge: string },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // No `scope` param: Hue's Remote API docs don't document a scope
  // parameter the way WHOOP does — access is bridge/resource-level, not
  // scope-gated. Confirm this stays true when spot-checking the
  // authorize endpoint above.
  return url.toString();
}

export interface HueTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export class HueOAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function postForm(body: Record<string, string>): Promise<HueTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new HueOAuthError(`Hue token request failed: ${res.status} ${await res.text()}`, res.status);
  }
  return res.json() as Promise<HueTokenResponse>;
}

export async function exchangeHueAuthorizationCode(
  config: HueOAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<HueTokenResponse> {
  return postForm({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: params.codeVerifier,
  });
}

export async function refreshHueToken(config: HueOAuthConfig, refreshToken: string): Promise<HueTokenResponse> {
  return postForm({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}
