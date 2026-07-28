/**
 * Google Calendar OAuth 2.0 (standard authorization-code + PKCE) — same
 * universal Google OAuth endpoints already confirmed live for Google
 * Health earlier in this project (`integrations/fitbit/src/oauth.ts`),
 * reused here with a Calendar-specific scope. Read-only by design: this
 * integration never writes to a user's calendar, only reads event
 * times/titles to back Adaptive Study Planner / Stress Timeline /
 * Burnout Detection / Social Battery. See
 * docs/GOOGLE_CALENDAR_INTEGRATION.md.
 */
const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Confirmed live against developers.google.com/calendar/api/v3/reference/events/list
 * this session — the dedicated read-only events scope, not the broader
 * `calendar.readonly` (which also exposes calendar list/settings
 * management this integration has no use for). */
export const GOOGLE_CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events.readonly'] as const;

export interface GoogleCalendarOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildGoogleCalendarAuthorizationUrl(
  config: GoogleCalendarOAuthConfig,
  params: { state: string; codeChallenge: string },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', GOOGLE_CALENDAR_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  url.searchParams.set('code_challenge', params.codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Same rationale as the Google Health integration — restricted-scope
  // Google APIs only issue a refresh token when both are set.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  return url.toString();
}

export interface GoogleCalendarTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export class GoogleCalendarOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

async function postForm(body: Record<string, string>): Promise<GoogleCalendarTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new GoogleCalendarOAuthError(`Google Calendar token request failed: ${res.status} ${await res.text()}`, res.status);
  }
  return res.json() as Promise<GoogleCalendarTokenResponse>;
}

export async function exchangeGoogleCalendarAuthorizationCode(
  config: GoogleCalendarOAuthConfig,
  params: { code: string; codeVerifier: string },
): Promise<GoogleCalendarTokenResponse> {
  return postForm({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code_verifier: params.codeVerifier,
  });
}

export async function refreshGoogleCalendarToken(
  config: GoogleCalendarOAuthConfig,
  refreshToken: string,
): Promise<GoogleCalendarTokenResponse> {
  return postForm({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });
}
