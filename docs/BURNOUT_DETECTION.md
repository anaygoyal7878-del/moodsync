# Burnout Detection

Proactive notification that fires when multiple independent wellness
signals agree on burnout risk — deliberately conservative, since any
single "bad" score (a rough night, one busy day) is normal.

## Logic

`ai/src/proactiveNotifications.ts`'s `checkBurnoutRisk` requires:

1. Poor sleep (`sleepScore < 50`) **and**
2. Low recovery (`recoveryScore < 40`) **and**
3. At least one of:
   - Elevated resting heart rate vs. the user's own recent baseline
     (z-score ≥ 1, same own-baseline z-scoring technique as
     `computeStressScore`)
   - A heavily-booked calendar today (≥ 6 events)

All three conditions must include the sleep+recovery pair — a single
elevated-HR day or a busy calendar alone never fires this on their own.

## Two delivery paths

- **Periodic** (`workers/src/proactiveNotificationsWorker.ts`, Check 4):
  runs alongside the other three Smart Notification checks. Calendar
  signal is **not available here** — reading it needs a live OAuth token
  refresh (`backend/src/services/calendarService.ts`), which this
  background worker doesn't have wired up. This check still fires
  correctly off the heart-rate signal alone; a future improvement could
  extend the worker to read calendars too.
- **On-demand** (`GET /api/burnout-check`, dashboard-only): the same
  check, but *does* read today's calendar event count live when the user
  has Google Calendar connected — gives a more complete picture than the
  periodic worker, at the cost of only running when the dashboard is
  loaded rather than proactively in the background.

## Frontend

`BurnoutWarningBanner.tsx` fetches `/api/burnout-check` once per dashboard
load (not polled — these signals don't meaningfully change minute to
minute) and shows a dismissible banner recommending a 20-minute walk,
stretch, hydration, or ending work early — the same recommendation copy
from the original spec.

## Not built this round

- No burnout *trend* view (e.g. "you've shown burnout signs 3 days this
  week") — only a same-day check.
- The periodic worker's calendar gap (above) — deliberately left as a
  known limitation rather than duplicating OAuth-refresh logic into the
  workers package for this round.
