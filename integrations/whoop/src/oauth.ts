/**
 * WHOOP OAuth 2.0 (authorization code + PKCE). Endpoints verified against
 * developer.whoop.com — see docs/INTEGRATIONS_RESEARCH.md.
 */
const AUTHORIZE_URL = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const TOKEN_URL = 'https://api.prod.whoop.com/oauth/oauth2/token';

/** Every scope this integration requests — kept explicit and named rather
 * than a catch-all "all scopes" flag, so a future scope reduction is a
 * one-line diff, not a re-audit of what we actually use. */
export const WHOOP_SCOPES = [
  'read:recovery',
  'read:sleep',
  'read:cycles',
  'read:workout',
  'read:profile',
  'read:body_measurement',
  'offline',
] as const;

export interface WhoopOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildWhoopAuthorizationUrl(
  config: WhoopOAuthConfig,
  params: { state: string; codeChallenge: string },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', WHOOP_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

export interface WhoopTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export class WhoopOAuthError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

async function postForm(body: Record<string, string>): Promise<WhoopTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new WhoopOAuthError(`WHOOP token request failed: ${res.status} ${await res.text()}`, res.status);
  }
  return res.json() as Promise<WhoopTokenResponse>;
}

export async function exchangeWhoopAuthorizationCode(
  config: WhoopOAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<WhoopTokenResponse> {
  return postForm({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: params.codeVerifier,
  });
}

export async function refreshWhoopToken(config: WhoopOAuthConfig, refreshToken: string): Promise<WhoopTokenResponse> {
  return postForm({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: WHOOP_SCOPES.join(' '),
  });
}
