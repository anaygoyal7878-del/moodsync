import { calendarConnectionRepository, oauthTokenRepository, appleCalendarSnapshotRepository, type CalendarEventWindow } from '@moodsync/database';
import { GoogleCalendarClient, refreshGoogleCalendarToken, type GoogleCalendarOAuthConfig } from '@moodsync/integration-google-calendar';
import type { OccasionEvent } from './calendarOccasion.js';
import { mergeCalendarSources, type SourceEvent, type UnifiedEvent } from './unifiedCalendar.js';

/**
 * Live calendar-load reads for the proactive worker's burnout/social-
 * battery checks, and for the Adaptive Environment's `inMeeting` guard.
 *
 * Two independent sources, tried in order:
 *
 *  1. **Apple Calendar**, via the iOS companion app's EventKit reader —
 *     see docs/APPLE_CALENDAR_ARCHITECTURE.md. No OAuth, no token
 *     refresh; just a cached snapshot the device pushed. Preferred
 *     because it needs no third-party credential at all.
 *  2. **Google Calendar**, via OAuth — the original path, unchanged.
 *
 * Same "this package, like workers, can't reach into the backend app's
 * internals" boundary as `hueActionExecutor.ts`, so the Google
 * token-refresh logic is a small, deliberate duplicate of
 * `backend/src/services/calendarService.ts` rather than an import from
 * it. Config is read directly from `process.env` — same pattern
 * `claraChat.ts` already uses for `GEMINI_API_KEY` in this package,
 * since zod-validated env is a backend-app concern only. See
 * docs/HEALTH_INSIGHTS_TEXTING_ARCHITECTURE.md.
 */

/** How stale an Apple Calendar snapshot may be before it's treated as
 * absent rather than trusted. A companion app that syncs daily keeps a
 * push well under this; one nobody has opened in days should fall back
 * to Google (or to "no calendar known") rather than silently reporting
 * a week-old snapshot as today's real schedule — the same null-vs-stale
 * honesty the rest of this codebase applies to biometric data. */
const APPLE_SNAPSHOT_STALE_AFTER_MS = 20 * 60 * 60_000;

function isFresh(pushedAt: Date, now: Date): boolean {
  return now.getTime() - pushedAt.getTime() <= APPLE_SNAPSHOT_STALE_AFTER_MS;
}

interface EventWindow {
  start: Date;
  end: Date;
  isAllDay: boolean;
}

function parseSnapshotEvents(events: CalendarEventWindow[]): EventWindow[] {
  return events
    .map((e) => ({ start: new Date(e.startsAt), end: new Date(e.endsAt), isAllDay: e.isAllDay }))
    .filter((e) => !Number.isNaN(e.start.getTime()) && !Number.isNaN(e.end.getTime()));
}

/**
 * Pure aggregation shared by both sources — event count and total
 * booked hours within `[windowStart, windowEnd)`. All-day events are
 * excluded from `bookedHours` (they don't represent real scheduled
 * time the way a timed meeting does) but still count toward
 * `eventCount`. Exported so both the Apple and Google paths, and their
 * tests, use one definition of "how booked is this window."
 */
export function computeLoadFromWindows(events: EventWindow[], windowStart: Date, windowEnd: Date): TodayCalendarLoad {
  const inWindow = events.filter((e) => e.start < windowEnd && e.end > windowStart);
  const bookedHours = inWindow
    .filter((e) => !e.isAllDay)
    .reduce((total, e) => total + (e.end.getTime() - e.start.getTime()) / (60 * 60_000), 0);
  return { eventCount: inWindow.length, bookedHours };
}

/** Pure "is a timed event covering `now`" check — same sharing
 * rationale as `computeLoadFromWindows`. */
export function isMeetingAt(events: EventWindow[], now: Date): boolean {
  return events.some((e) => !e.isAllDay && e.start <= now && e.end > now);
}

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

/** Reads the Apple Calendar snapshot if one exists and is still fresh
 * — the shared entry point both public functions below try first. */
async function readAppleSnapshot(userId: string, now: Date): Promise<EventWindow[] | null> {
  const snapshot = await appleCalendarSnapshotRepository.getForUser(userId);
  if (!snapshot || !isFresh(snapshot.pushedAt, now)) return null;
  return parseSnapshotEvents(snapshot.events);
}

/**
 * Reads Google Calendar for a window, or null when it is not connected.
 *
 * Failures degrade to null rather than throwing. An expired Google token
 * must cost the Google half of the calendar, not the Apple half too —
 * which is exactly what happened when the two were either/or and one
 * throw aborted the whole read.
 */
async function readGoogleWindow(userId: string, windowStart: Date, windowEnd: Date): Promise<SourceEvent[] | null> {
  const connection = await calendarConnectionRepository.findByUser(userId);
  if (!connection || !connection.oauthTokenId) return null;

  // Outside the try on purpose. A missing client id or secret is a
  // deployment bug, not a runtime failure, and swallowing it would turn
  // a misconfigured server into "this user silently never sees their
  // Google events" — with nothing but a log line to find it by. Runtime
  // failures below (expired token, API outage) degrade to null; a broken
  // configuration stays loud.
  const config = requireGoogleCalendarConfig();

  try {
    const accessToken = await getFreshAccessToken(connection.oauthTokenId, config);
    const client = new GoogleCalendarClient(accessToken);
    const events = await client.listEvents(windowStart, windowEnd);
    await calendarConnectionRepository.markSynced(connection.id);
    return events.map((e) => ({ start: e.start, end: e.end, isAllDay: e.isAllDay, title: e.title }));
  } catch (error) {
    // Logged without event content: calendar titles are sensitive and a
    // server log is not the place for them.
    console.error('calendarSignal: Google Calendar read failed', {
      userId,
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return null;
  }
}

/**
 * Both calendars, merged and deduplicated — see `unifiedCalendar.ts`.
 *
 * This replaces three either/or readers that returned the moment a
 * fresh Apple snapshot existed and never consulted Google. Anyone with
 * events in both lost every Google event silently.
 */
async function readUnifiedWindow(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
  now: Date,
): Promise<UnifiedEvent[] | null> {
  const [apple, google] = await Promise.all([
    readAppleSnapshot(userId, now).catch(() => null),
    readGoogleWindow(userId, windowStart, windowEnd),
  ]);
  const appleInWindow = apple ? apple.filter((e) => e.start < windowEnd && e.end > windowStart) : null;
  return mergeCalendarSources(appleInWindow, google);
}

/**
 * Today's calendar load for `checkBurnoutRisk`/`checkSocialBatteryLow`.
 * Returns `null` (never `{eventCount: 0, bookedHours: 0}`) when neither
 * source has anything, so "no calendar connected" stays distinguishable
 * from "connected calendar, genuinely free day" all the way through to
 * the checkers, matching the `| null` contract both already declare
 * for this field.
 */
export async function getTodayCalendarLoad(userId: string, windowStart: Date, windowEnd: Date, now: Date = new Date()): Promise<TodayCalendarLoad | null> {
  const events = await readUnifiedWindow(userId, windowStart, windowEnd, now);
  return events === null ? null : computeLoadFromWindows(events, windowStart, windowEnd);
}

/**
 * Is a timed calendar event happening right now?
 *
 * Backs the Adaptive Environment's `inMeeting` guard — MoodSync must
 * not dim someone's lights mid-call. All-day events are excluded
 * deliberately: "Company Holiday" spans the whole day but is not a
 * meeting, and treating it as one would silence MoodSync for 24 hours.
 * Returns `false` (not null) when neither source has a usable calendar
 * — no calendar means no known meeting, and the other guards still
 * apply.
 *
 * Now reads both sources. Under the either/or version, a meeting that
 * existed only in Google Calendar was invisible whenever an Apple
 * snapshot was fresh — so MoodSync could dim the lights in the middle of
 * exactly the call this guard exists to protect.
 */
export async function isInMeetingNow(userId: string, now: Date = new Date()): Promise<boolean> {
  // A narrow window around now — enough to catch an event in progress
  // without pulling the whole day again.
  const events = await readUnifiedWindow(userId, new Date(now.getTime() - 4 * 60 * 60_000), new Date(now.getTime() + 60_000), now);
  return events === null ? false : isMeetingAt(events, now);
}

/**
 * The day's events, shaped for occasion inference — which means titles
 * where a source has them.
 *
 * Apple's snapshot has no titles by design (see the
 * `AppleCalendarSnapshot` schema comment), so Apple-only events come
 * back with `title` absent and `calendarOccasion.ts` classifies them on
 * shape. An event present in both keeps the Google title.
 *
 * Returns `null` rather than `[]` when no calendar is reachable, so "no
 * calendar connected" stays distinguishable from "connected, and
 * genuinely nothing on today".
 */
export async function getOccasionEvents(
  userId: string,
  windowStart: Date,
  windowEnd: Date,
  now: Date = new Date(),
): Promise<OccasionEvent[] | null> {
  const events = await readUnifiedWindow(userId, windowStart, windowEnd, now);
  if (events === null) return null;
  return events.map((e) => ({ start: e.start, end: e.end, isAllDay: e.isAllDay, title: e.title }));
}
