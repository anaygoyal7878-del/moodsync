# Google Calendar Integration

Read-only Google Calendar OAuth connection. This is MoodSync's only calendar
integration, and the first feature round to depend on calendar data:
Adaptive Study Planner, Stress Timeline, Burnout Detection, and Social
Battery all read event times/titles from it.

## Scope decisions

- **Google Calendar, not Apple Calendar/EventKit.** EventKit is an
  on-device-only iOS API with no server-side visibility — it would require
  the iOS companion app to read events and push them to the backend, adding
  a whole sync path for a domain (calendar) that has no existing iOS
  companion involvement. Every downstream feature (Study Planner, Stress
  Timeline, Burnout Detection, Social Battery) needs calendar data
  server-side, alongside biometric data, so a standard server-side OAuth
  integration matches the rest of this codebase's provider pattern (WHOOP,
  Fitbit, Hue, Spotify) far better than a new on-device-only path would.
- **Read-only.** Scope requested is
  `https://www.googleapis.com/auth/calendar.events.readonly` — the
  dedicated read-only events scope, not the broader `calendar.readonly`
  (which also exposes calendar list/settings management MoodSync has no
  use for). MoodSync never creates, edits, or deletes calendar events.
- **No stored event history.** Unlike biometric readings, calendar events
  are fetched live on every read (`calendarService.listUpcomingEvents`)
  rather than mirrored into a Postgres table. Every consuming feature wants
  a bounded, current window (e.g. "what's on today," "was there a meeting
  during this stress spike") — there's no feature that needs calendar
  history across days, so there's no staleness to manage and no storage
  growth to account for. `CalendarConnection.lastSyncedAt` is only updated
  as a "last successful read" timestamp for the Connections UI, not a
  cursor into stored data.

## OAuth flow

Standard OAuth 2.0 authorization-code + PKCE, identical shape to the
Google Health (Fitbit) integration's flow — same Google authorize/token
endpoints (`accounts.google.com/o/oauth2/v2/auth`,
`oauth2.googleapis.com/token`), same `access_type=offline&prompt=consent`
pattern to force refresh-token issuance on every consent.

1. `GET /api/integrations/google-calendar/authorize?returnTo=...` (backend,
   authenticated) — builds the Google consent URL.
2. Google redirects to `GET /api/integrations/google-calendar/callback` —
   exchanges the code, stores tokens in the shared `OAuthToken` table via
   `CalendarConnection.oauthTokenId`, redirects back to `returnTo`.
3. `GET /api/integrations/google-calendar/events?windowStart=...&windowEnd=...`
   (authenticated) — fetches a live window of events, refreshing the
   access token transparently if it's within 5 minutes of expiry.
4. `DELETE /api/integrations/google-calendar` (authenticated) — revokes the
   local connection (does not call Google's token-revocation endpoint,
   same as every other provider in this codebase).

Frontend: `/api/integrations/google-calendar/connect` (generic
`[provider]/connect` proxy) starts the flow;
`/api/integrations/google-calendar/disconnect` (generic
`[provider]/disconnect` proxy) tears it down. Both required adding
`"google-calendar"` to the existing provider allowlists in
`frontend/src/app/api/integrations/[provider]/connect/route.ts` and
`.../disconnect/route.ts` — no new proxy routes needed for connect/
disconnect, since those are already generic across providers. `GET
/api/integrations/google-calendar/events` is a dedicated proxy (event
fetching isn't generic across providers the way connect/disconnect are).

## Data model

`CalendarConnection` (`database/prisma/schema.prisma`) — one row per user
(`@@unique([userId])`, no `provider` column), same shape as
`AppleMusicConnection` in that regard, but unlike AppleMusicConnection it
does use the shared `OAuthToken` table via `oauthTokenId`, since Google
Calendar is a standard OAuth 2.0 + refresh-token provider (AppleMusicConnection
isn't — see its own schema doc comment).

## Event shape

`GoogleCalendarClient.listEvents(timeMin, timeMax)` calls `events.list` with
`singleEvents=true&orderBy=startTime` (expands recurring events into real
instances; `orderBy=startTime` requires `singleEvents=true` per Google's
docs). Each event is normalized to `{ id, title, start, end, isAllDay }`,
handling both timed events (`start.dateTime`) and all-day events
(`start.date`, treated as UTC midnight). Events missing a parseable
start/end are dropped rather than throwing — a single malformed event
shouldn't fail the whole read.

## Not built this round

- No write access (create/update/delete events) — never requested, never
  planned.
- No calendar selection — always reads the user's `primary` calendar. A
  user with events split across multiple Google calendars won't see the
  non-primary ones reflected in Study Planner/Stress Timeline/etc.
- No webhook/push notifications for calendar changes (Google Calendar push
  channels) — every read is a live pull, so there's no change-notification
  path to build.
