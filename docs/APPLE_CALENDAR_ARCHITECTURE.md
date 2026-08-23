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

- **Backend + ai + database**: unit-tested. 614 `ai` package tests
  total, including 16 in `calendarSignal.test.ts` (precedence,
  staleness, malformed-timestamp resilience, the shared pure
  aggregation) and 10 more in `messagingTools.test.ts` for
  `create_calendar_event` and its capability gating. Full monorepo
  build, lint, and test suite green.
- **iOS**: `swift build` and `swift test` both pass (42 tests, +6 from
  the write side — `CalendarWriteCoordinatorTests` covers a successful
  create, a save failure surfaced with its real reason, one failure not
  stopping the rest of a batch, and a fetch failure).
  `CalendarSyncCoordinatorTests` (the read side) covers the push, the
  declined-vs-failed distinction, and that a genuinely free day still
  reports success with zero events rather than being confused for "not
  authorized".
- **Not verified**: no Postgres, so none of the new routes —
  `POST /api/calendar/apple/snapshot`,
  `POST/GET /api/calendar/apple/pending-writes`,
  `POST .../pending-writes/:id/complete` — have ever actually been
  called by a real device; no Xcode/simulator run, so `EventKitReader`'s
  real `EKEventStore` code path (the part behind
  `#if canImport(EventKit)`, both read and write) has never executed
  against a real calendar — only the protocol-seamed logic around it
  (`CalendarSyncCoordinator`, `CalendarWriteCoordinator`) is exercised,
  against fakes.

## Writing back — creating an event, never moving one

Requested to bring over Poke's "reschedule a meeting from the text
thread" behavior. Built the create half only, and scoped that
narrowing deliberately rather than silently.

**Why move/reschedule isn't built:** `AppleCalendarSnapshot` stores no
event identifiers or titles at all (see above — a real privacy
decision, not an oversight). Without something server-side to point at,
"move the 3pm thing" has no referent MoodSync can act on. Building a
fake version of that (guessing which event by time, say) would be worse
than not having the feature — a wrong guess moves the wrong meeting.

**Creating a new event doesn't have that problem** — the content is
supplied fresh, by the person, in the conversation. Same "device
pushes/queues, backend caches" shape as reading, in reverse:

```
create_calendar_event (messaging tool, kind: 'action')
      │ confirm-then-queue, same shape as control_hue_light —
      │ see docs/MESSAGING_AGENTIC_ARCHITECTURE.md
      ▼
POST /api/calendar/apple/pending-writes         [validated + bounded again
      │                                           server-side — a text
      │                                           confirmation is not a
      │                                           trust boundary]
      ▼
PendingCalendarWrite (queued, PENDING)
      │
      ▼
GET /api/calendar/apple/pending-writes           [companion app polls]
      │
      ▼
CalendarWriteCoordinator.run()                   [EventKitReader.createEvent,
      │                                            testable against a fake]
      ▼
POST .../pending-writes/:id/complete             [EXECUTED or FAILED,
                                                    with a reason]
```

Bounded independently in two places — the messaging tool's handler
*and* `pendingCalendarWriteRepository.create` — because a client-side
confirmation is not a trust boundary: at most 90 days out, at most a
24-hour duration. Both numbers are judgment calls, not derived, same as
every other bound like this in the codebase.

The confirmation prompt is honest about the delay: *"It'll be created
next time your phone opens MoodSync"* — never implying it happens the
moment someone replies YES, since it structurally can't (EventKit has
no server-side write path, so there is no "the moment" until a device
polls).

**Capability-gated, same mechanism as Hue.** `create_calendar_event` is
only declared to the model when `resolveMessagingCapabilities` finds an
`AppleCalendarSnapshot` has ever been pushed — proposing a calendar
write to someone who's never connected a companion app would queue
something that sits forever, unpicked-up. Each capability now fails
closed *independently*: a Hue lookup error no longer hides a working
calendar capability, and vice versa (`Promise.allSettled`, not a single
`Promise.all` that would let one rejection erase both).

Full access (read + write) is requested from EventKit up front, not
staged behind a second later prompt — because the messaging agent's
proposal can arrive at any point in a conversation, and stalling a
just-given text confirmation on a fresh permission dialog would be a
worse experience than asking once, early.

## Known gaps

- ~~Not wired into the app's UI or lifecycle~~ — wired. `OnboardingView`
  gained an explicit Calendar step (step 6, after HomeKit) that requests
  EventKit authorization up front, same "explain before the system
  prompt" pattern as its Health step — chosen over HomeKit's *implicit*
  prompt because `EKEventStore.requestFullAccessToEvents()` has a real
  completion to react to, unlike `HMHomeManager`'s. `MoodSyncCompanionView.sync()`
  now calls `pushCalendarSnapshot` and `checkPendingCalendarWrites`
  right after the existing HomeKit snapshot/command calls, same
  best-effort shape: a failure only appends to the status string, it
  never fails the overall sync. `swift build`/`swift test` both still
  pass (42 tests, count unchanged — UI call sites aren't unit-tested
  here, matching how the HomeKit call sites never were either).
  **Still not run on a real device or simulator** — the wiring is code-
  reviewed and compiles, not observed working.
- **Move/reschedule is not built, on purpose** — see "Writing back"
  above for why (no stored identifier for an existing event to
  reference). If this becomes a real need, the honest path is storing
  *more* per-event state than the privacy-minimizing design here
  currently allows, which is a real tradeoff to make deliberately, not
  a small addition.
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
