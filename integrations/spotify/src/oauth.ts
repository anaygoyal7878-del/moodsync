/**
 * Spotify Web API OAuth 2.0 — Authorization Code Flow (confidential
 * client), verified against developer.spotify.com's "Authorization Code
 * Flow" and "Refreshing tokens" tutorials — see
 * docs/INTEGRATIONS_RESEARCH.md's "REST implementation details" section.
 *
 * Deliberately NOT using PKCE here, unlike every other provider in this
 * codebase (see backend/src/lib/pkce.ts's "always generate PKCE" rule).
 * Spotify documents two distinct, non-overlapping flows: the standard
 * Authorization Code Flow (confidential client, client_secret sent via
 * HTTP Basic Auth on token exchange — what this module implements) and a
 * separate "Authorization Code with PKCE" flow for clients that can't
 * hold a secret (mobile/SPA), which authenticates with `client_id` in the
 * body instead of Basic Auth. Nothing in Spotify's docs confirms the two
 * can be combined (code_challenge on /authorize, then Basic Auth on token
 * exchange), so rather than guess at undocumented behavior, this follows
 * the standard flow exactly as documented for a server-side app.
 */
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';

/** `user-read-currently-playing` added for the skip-detection worker
 * (workers/src/spotifyPlaybackCheckWorker.ts) — confirmed against
 * developer.spotify.com's scopes reference that `/me/player/currently-playing`
 * needs this scope specifically, NOT `user-read-playback-state` (which
 * only covers the broader `/me/player` endpoint, already requested for
 * a different reason and left in place). A user connected before this
 * scope was added won't have granted it — their existing token can still
 * play music (unaffected) but `getCurrentlyPlaying` calls will 403 until
 * they reconnect and re-consent; the skip-detection worker treats that
 * as "can't determine, leave likedSignal null" rather than throwing. */
export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'playlist-read-private',
  'user-read-currently-playing',
] as const;

export interface SpotifyOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildSpotifyAuthorizationUrl(config: SpotifyOAuthConfig, params: { state: string }): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', SPOTIFY_SCOPES.join(' '));
  url.searchParams.set('state', params.state);
  return url.toString();
}

export interface SpotifyTokenResponse {
  access_token: string;
  /** Not guaranteed on every refresh response — see refreshSpotifyToken. */
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export class SpotifyOAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

function basicAuthHeader(config: SpotifyOAuthConfig): string {
  return `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;
}

async function postForm(config: SpotifyOAuthConfig, body: Record<string, string>): Promise<SpotifyTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(config),
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    throw new SpotifyOAuthError(`Spotify token request failed: ${res.status} ${await res.text()}`, res.status);
  }
  return res.json() as Promise<SpotifyTokenResponse>;
}

export async function exchangeSpotifyAuthorizationCode(
  config: SpotifyOAuthConfig,
  params: { code: string },
): Promise<SpotifyTokenResponse> {
  return postForm(config, {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: config.redirectUri,
  });
}

/**
 * Spotify's docs are explicit: "a refresh token might not be included in
 * each response. When a refresh token is not returned, continue using the
 * existing token" — callers must fall back to the previously stored
 * refresh token when `refresh_token` is absent here, same as every other
 * provider's refresh handling in this codebase.
 */
export async function refreshSpotifyToken(config: SpotifyOAuthConfig, refreshToken: string): Promise<SpotifyTokenResponse> {
  return postForm(config, {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}
