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

`workers/src/proactiveNotificationsWorker.ts` — a new periodic worker
(suggested cadence: every 30 minutes, see
`workers/railway.proactive-notifications.json`) that runs all three
checkers per user with recent data, delivering through the existing
`deliverNotification` pipeline. A new
`notificationRepository.hasRecentTitle` dedupes by exact title within a
20-hour window, so a persistent condition (an always-warm bedroom)
doesn't re-fire every single tick — same title-based dedupe shape
`recommendationRepository.hasBeenSuggested` already uses for a similar
problem.

## 5. Verification

`npm test -w ai` — 10 tests covering each checker's fire/no-fire
boundary conditions (insufficient history, in-range temperature, no
majority time-of-day cluster, etc). The worker itself and the
`notificationRepository`/`pendingDeviceCommandRepository` additions
were build-verified (`npm run build`) but not exercised against a real
Postgres instance — no local database in this sandbox, same
verification tier as every other worker in this codebase.
