# Smart Notifications — Architecture

## 1. What's new here vs. the existing notification system

Every notification before this round was **rule-fired** — a byproduct
of `ai/src/dispatch.ts` matching (or skipping) an automation rule, with
copy authored by `ai/src/explain.ts`. This round adds **proactive**
notifications: content generated on a periodic tick, independent of any
rule firing, from real signals.

The underlying persistence (`Notification` model,
`ai/src/notificationExecutor.ts`'s `deliverNotification` — quiet
hours/digest-mode aware) is unchanged and fully reused; only the
*producer* of title/body is new.

## 2. The three real checkers — `ai/src/proactiveNotifications.ts`

- **Recovery unusually high today** — own-baseline z-score (same
  technique as `ai/src/wellness.ts`'s `baselineZScore`, re-implemented
  here since that one isn't exported), fires when today's Recovery is
  ≥1.5 standard deviations above the recent 30-day mean, needs ≥5
  historical points.
- **Bedroom temperature outside your sleep range** — compares
  `HomeRoomSnapshot.temperatureC` for whichever room's name contains
  "bedroom" against a user-set `UserPreferences.sleepTempMinC/MaxC`
  range (new Profile-page setting, `null` until the user sets it — the
  check never fires on a fabricated default range).
- **"Your scene usually helps at this time of day"** — derived from
  `PendingDeviceCommand`'s existing completion history (no new log
  table): counts a scene's past `EXECUTED` runs by hour-of-day, fires
  when a majority (>50%) of a scene's ≥3 runs cluster within 1 hour of
  the current time.

## 3. What was explicitly NOT built

The spec's fourth example — **"you've been sitting for two hours"** — is
a real, honest gap. This codebase has no continuous motion/activity
signal anywhere; `steps` is a daily cumulative rollup, not a per-minute
or per-hour reading, so there's no way to detect "two hours of no
movement" without fabricating a data source that doesn't exist. Not
built, not faked.

## 4. Delivery and dedupe

`workers/src/proactiveNotificationsWorker.ts` — a periodic worker
(cadence: every 5 minutes, matching `sync-all`'s own cadence — see
`workers/railway.proactive-notifications.json` and that file's own doc
comment for why this isn't an arbitrary number) that runs all checkers
per user with recent data, delivering through the existing
`deliverNotification` pipeline. A `notificationRepository.hasRecentTitle`
dedupes by exact title within a 20-hour window, so a persistent
condition (an always-warm bedroom) doesn't re-fire every single tick —
same title-based dedupe shape `recommendationRepository.hasBeenSuggested`
already uses for a similar problem, and what makes the tighter cadence
safe: running a daily-level check 6x more often costs nothing when
`hasRecentTitle` already blocks the repeat.

Every candidate that fires goes through `deliverIfNotRecentlySent`,
which is deliberately layered rather than either/or: it **always**
creates the in-app `Notification` row first — that's the one guaranteed
delivery path, works with zero external configuration — and only then
*best-effort* also texts the same insight via `sendProactiveInsight` if
a messaging provider is configured. A texting failure (no
`MESSAGING_SEND_URL`/`MESSAGING_API_KEY` set, or the bridge itself down)
is caught and logged, and never un-sends or blocks the in-app
notification that already landed. Concretely: the "Poke, but
health-focused" behavior degrades gracefully to "the app itself tells
you" on any setup that hasn't wired up a phone bridge, rather than
degrading to nothing.

## 5. Verification

`npm test -w ai` — 10 tests covering each checker's fire/no-fire
boundary conditions (insufficient history, in-range temperature, no
majority time-of-day cluster, etc). The worker itself and the
`notificationRepository`/`pendingDeviceCommandRepository` additions
were build-verified (`npm run build`) but not exercised against a real
Postgres instance — no local database in this sandbox, same
verification tier as every other worker in this codebase.
