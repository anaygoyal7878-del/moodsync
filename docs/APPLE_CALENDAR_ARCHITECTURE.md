# Apple Calendar — Architecture

Requested as an explicit exception to the integration freeze recorded in
`docs/INTEGRATIONS_RESEARCH.md` — see that doc's "Scope freeze" section
for the rest of what's frozen.

## Why this looks exactly like Apple Health, not like Google Calendar

Confirmed against Apple's own EventKit documentation during this pass:
**there is no server-side iCloud Calendar API.** EventKit is an
on-device framework. Apple doesn't publish a REST equivalent of Google
Calendar's API for a third-party backend to call directly — the
documented paths are either a native app using `EKEventStore` after user
consent, or CalDAV against the user's raw iCloud credentials (rejected
here for the same reason the Pura/Aera diffuser integration was —
asking for a reusable account password when this app has no other
password-based credential anywhere).

So this is the same shape as `docs/APPLE_HEALTH_ARCHITECTURE.md`: the
only path is the iOS companion app reading locally and pushing a cache.
`CalendarConnection` (Google, OAuth-based) is untouched and still works
— this is a second, independent source, not a replacement.

## What's stored, and what deliberately isn't

`AppleCalendarSnapshot` — one row per user, wholesale-replaced on every
push (a cache, not a log, same shape as `HomeSnapshot`):

```
{ startsAt, endsAt, isAllDay }[]
```

No title, no location, no attendees. `ai/src/calendarSignal.ts` has
never needed more than "how many hours are booked" and "is a non-all-day
event happening right now" — every caller of the pre-existing Google
path already worked off event *counts and durations*, never content.
A calendar title is often the most sensitive text a person has (a
medical appointment, a job interview, a therapy session); storing what
isn't needed would be a real privacy cost for zero product benefit.

## Data flow

```
EKEventStore (device)
      │ read-only, user-authorized
      ▼
EventKitReader.readUpcomingEvents()          [today + tomorrow, local]
      │
      ▼
CalendarSyncCoordinator.sync()                [pairs reader + API client,
      │                                         testable against fakes]
      ▼
POST /api/calendar/apple/snapshot            [backend/src/api/routes/calendar.ts]
      │
      ▼
AppleCalendarSnapshot (one row per user)
      │
      ▼
ai/src/calendarSignal.ts                      [tries Apple first, then
      │                                         Google, else null/false]
      ▼
getTodayCalendarLoad() / isInMeetingNow()      [unchanged public API —
                                                 both existing callers,
                                                 the proactive worker and
                                                 environmentService, work
                                                 unmodified]
```

### Source precedence and staleness

`calendarSignal.ts` tries the Apple snapshot first, and only falls back
to Google when there is none *or it's stale*. A snapshot older than
`APPLE_SNAPSHOT_STALE_AFTER_MS` (20 hours) is treated as absent, not
trusted — the same null-vs-stale honesty the rest of this codebase
applies to biometric data. A companion app nobody has opened in days
must not silently report a week-old snapshot as today's real schedule;
falling through to Google (or to "no calendar known") is the honest
answer instead.

The pure aggregation (`computeLoadFromWindows`, `isMeetingAt`) is shared
between both sources — one definition of "how booked is this window,"
whichever provider the events came from.

### `CalendarSyncCoordinator` — a separate coordinator on purpose

Not folded into the existing `SyncCoordinator` (which drives HealthKit).
Biometric sync must keep succeeding on a device where calendar access
was declined — a `.notAuthorized` calendar result is a distinct outcome
from `.failure`, exactly like an unconnected wearable is distinct from a
sync error, and it must never take down the health sync it happens to
run alongside.

## Verification

- **Backend + ai + database**: unit-tested. 582 `ai` package tests
  (16 in `calendarSignal.test.ts` alone, covering precedence, staleness,
  malformed-timestamp resilience, and the shared pure aggregation).
  Full monorepo build, lint, and test suite green.
- **iOS**: `swift build` and `swift test` both pass (36 tests, +5 new —
  `CalendarSyncCoordinatorTests` covers the push, the declined-vs-failed
  distinction, and that a genuinely free day still reports success with
  zero events rather than being confused for "not authorized").
- **Not verified**: no Postgres, so `POST /api/calendar/apple/snapshot`
  has never actually been called by a real device; no Xcode/simulator
  run, so `EventKitReader`'s real `EKEventStore` code path (the part
  behind `#if canImport(EventKit)`) has never executed against a real
  calendar — only the protocol-seamed logic around it (`CalendarSyncCoordinator`)
  is exercised, against a fake.

## Known gaps

- **Not wired into the app's UI or lifecycle.** `EventKitReader`,
  `MoodSyncAPIClient.pushCalendarSnapshot`, and `CalendarSyncCoordinator`
  all exist and are tested, but nothing in `MoodSyncCompanionView.swift`
  or `OnboardingView.swift` calls them yet — the same call-site pattern
  `HomeKitController.fetchHomeSnapshot()` uses there is the model to
  follow. Deliberately left undone this round rather than editing those
  large, unreviewed UI files blind.
- **No connect/disconnect surface in the web app.** Unlike Google
  Calendar (an OAuth connection card) or Apple Health (a companion-app
  pairing flow already has one), there's no dashboard UI showing
  whether an Apple Calendar snapshot exists or when it last pushed.
- **`APPLE_SNAPSHOT_STALE_AFTER_MS` (20h) is a judgment call**, not
  derived — long enough to survive a day the user doesn't open the
  app, short enough that a truly abandoned companion app falls back to
  Google rather than serving days-old data forever.
- **No merge between sources.** If someone somehow has both a live
  Apple snapshot and a connected Google Calendar, Apple wins outright
  rather than the two being reconciled — simpler, and avoids double-
  counting an event that exists on both, but means a Google-only event
  is invisible whenever a fresh Apple snapshot exists.

## The new algorithm this unlocks

`ai/src/proactiveNotifications.ts`'s `checkRecoveryEnvironmentConjunction`
is the first checker in this file to combine all three domains this
product has once Apple Calendar is connected: recovery (Apple
Health/WHOOP), home environment quality (HomeKit's
`computeOverallHomeWellnessScore`), and real calendar load. It fires
only when recovery is genuinely low *and* at least one of "your
environment isn't helping" or "your day is packed" is also true —
same conservative-conjunction shape as `checkBurnoutRisk`, and a
situation none of the existing single-domain checks would catch on
their own. Wired into `workers/src/proactiveNotificationsWorker.ts`
reusing data the worker already fetches per user (no new queries beyond
what Checks 2 and 4 already pull). 8 new tests in
`proactiveNotifications.test.ts`, including one asserting that a
missing HomeKit reading is never misread as a poor one.
