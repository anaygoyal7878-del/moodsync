import {
  buildGoogleCalendarAuthorizationUrl,
  exchangeGoogleCalendarAuthorizationCode,
  refreshGoogleCalendarToken,
  GoogleCalendarClient,
  type GoogleCalendarOAuthConfig,
  type NormalizedCalendarEvent,
} from '@moodsync/integration-google-calendar';
import { env } from '../config/env.js';
import { generatePkcePair } from '../lib/pkce.js';
import { createOAuthState, verifyOAuthState } from '../lib/oauthState.js';
import { calendarConnectionRepository, oauthTokenRepository } from '@moodsync/database';

export class CalendarNotConfiguredError extends Error {
  constructor() {
    super('Google Calendar integration is not configured on this server (missing client credentials)');
  }
}

function requireGoogleCalendarConfig(): GoogleCalendarOAuthConfig {
  if (!env.GOOGLE_CALENDAR_CLIENT_ID || !env.GOOGLE_CALENDAR_CLIENT_SECRET || !env.GOOGLE_CALENDAR_REDIRECT_URI) {
    throw new CalendarNotConfiguredError();
  }
  return {
    clientId: env.GOOGLE_CALENDAR_CLIENT_ID,
    clientSecret: env.GOOGLE_CALENDAR_CLIENT_SECRET,
    redirectUri: env.GOOGLE_CALENDAR_REDIRECT_URI,
  };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

/** Same transparent-refresh pattern as fitbitService.ts's equivalent. */
async function getFreshAccessToken(oauthTokenId: string, config: GoogleCalendarOAuthConfig): Promise<string> {
  const tokens = await oauthTokenRepository.getDecrypted(oauthTokenId);
  if (!tokens) throw new Error('No stored credentials for this connection');

  if (tokens.expiresAt.getTime() - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokens.accessToken;
  }
  if (!tokens.refreshToken) {
    throw new Error('Google Calendar access token expired and no refresh token was issued for this connection');
  }

  const refreshed = await refreshGoogleCalendarToken(config, tokens.refreshToken);
  await oauthTokenRepository.update(oauthTokenId, {
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
    scope: refreshed.scope,
    expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
  });
  return refreshed.access_token;
}

export const calendarService = {
  async buildAuthorizationRedirect(userId: string, returnTo: string): Promise<string> {
    const config = requireGoogleCalendarConfig();
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = await createOAuthState({ userId, provider: 'google_calendar', codeVerifier, returnTo });
    return buildGoogleCalendarAuthorizationUrl(config, { state, codeChallenge });
  },

  async handleCallback(params: { code: string; state: string }): Promise<{ returnTo: string }> {
    const config = requireGoogleCalendarConfig();
    const statePayload = await verifyOAuthState(params.state);

    const tokenResponse = await exchangeGoogleCalendarAuthorizationCode(config, {
      code: params.code,
      codeVerifier: statePayload.codeVerifier,
    });

    await calendarConnectionRepository.upsertConnection({
      userId: statePayload.userId,
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        scope: tokenResponse.scope,
        expiresAt: new Date(Date.now() + tokenResponse.expires_in * 1000),
      },
    });

    return { returnTo: statePayload.returnTo };
  },

  /** Read-only — this integration never syncs into a stored table.
   * Callers (Study Planner / Stress Timeline / Burnout Detection / Social
   * Battery) always want a live, bounded window, so events are fetched
   * on demand rather than mirrored into Postgres — no staleness to
   * manage, no `MusicPlayLog`-style storage growth for data no feature
   * reads historically. */
  async listUpcomingEvents(userId: string, windowStart: Date, windowEnd: Date): Promise<NormalizedCalendarEvent[]> {
    const connection = await calendarConnectionRepository.findByUser(userId);
    if (!connection || !connection.oauthTokenId) {
      throw new Error('No Google Calendar connection for this user');
    }

    const accessToken = await getFreshAccessToken(connection.oauthTokenId, requireGoogleCalendarConfig());
    const client = new GoogleCalendarClient(accessToken);
    const events = await client.listEvents(windowStart, windowEnd);
    await calendarConnectionRepository.markSynced(connection.id);
    return events;
  },
};
