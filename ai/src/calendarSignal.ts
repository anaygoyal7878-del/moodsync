import { calendarConnectionRepository, oauthTokenRepository } from '@moodsync/database';
import { GoogleCalendarClient, refreshGoogleCalendarToken, type GoogleCalendarOAuthConfig } from '@moodsync/integration-google-calendar';

/**
 * Live calendar-load reads for the proactive worker's burnout/social-
 * battery checks — the one signal both checks always passed as `null`
 * before, since `workers/src/proactiveNotificationsWorker.ts` has no
 * live OAuth token refresh of its own. Same "this package, like
 * workers, can't reach into the backend app's internals" boundary as
 * `hueActionExecutor.ts`, so the token-refresh logic is a small,
 * deliberate duplicate of `backend/src/services/calendarService.ts`
 * rather than an import from it. Config is read directly from
 * `process.env` — same pattern `atlasChat.ts` already uses for
 * `GEMINI_API_KEY` in this package, since zod-validated env is a
 * backend-app concern only. See docs/HEALTH_INSIGHTS_TEXTING_ARCHITECTURE.md.
 */

function requireGoogleCalendarConfig(): GoogleCalendarOAuthConfig {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, and GOOGLE_CALENDAR_REDIRECT_URI must be set');
  }
  return { clientId, clientSecret, redirectUri };
}

const TOKEN_REFRESH_BUFFER_MS = 5 * 60_000;

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

export interface TodayCalendarLoad {
  eventCount: number;
  bookedHours: number;
}

/**
 * Today's calendar load for `checkBurnoutRisk`/`checkSocialBatteryLow`
 * — event count and total booked hours within `[windowStart,
 * windowEnd)`. Returns `null` (never `{eventCount: 0, bookedHours: 0}`)
 * when there's no connection at all, so "no calendar connected" stays
 * distinguishable from "connected calendar, genuinely free day" all
 * the way through to the checkers, matching the `| null` contract both
 * already declare for this field. All-day events are excluded from
 * `bookedHours` (they don't represent real scheduled time the way a
 * timed meeting does) but still count toward `eventCount`.
 */
export async function getTodayCalendarLoad(userId: string, windowStart: Date, windowEnd: Date): Promise<TodayCalendarLoad | null> {
  const connection = await calendarConnectionRepository.findByUser(userId);
  if (!connection || !connection.oauthTokenId) return null;

  const config = requireGoogleCalendarConfig();
  const accessToken = await getFreshAccessToken(connection.oauthTokenId, config);
  const client = new GoogleCalendarClient(accessToken);
  const events = await client.listEvents(windowStart, windowEnd);
  await calendarConnectionRepository.markSynced(connection.id);

  const bookedHours = events
    .filter((e) => !e.isAllDay)
    .reduce((total, e) => total + (e.end.getTime() - e.start.getTime()) / (60 * 60_000), 0);

  return { eventCount: events.length, bookedHours };
}
