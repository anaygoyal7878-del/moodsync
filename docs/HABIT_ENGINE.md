# Habit Engine — Architecture

## 1. Scope decision

The product spec named eight habits: hydration, morning sunlight,
meditation, reading, walking, stretching, screen time, bedtime
consistency. Per explicit product decision, this round builds only the
**two with a real, already-existing signal**:

- **Walking** — from `BiometricReading.steps` (already synced from
  Google Health/WHOOP).
- **Meditation** — from the existing `MeditationSession` model (already
  built, client-logged on guided-timer completion).

The other six all need either a sensor this app has no source for
(sunlight exposure, screen time) or a manual "mark done today" logging
UI that doesn't exist yet (hydration, reading, stretching, bedtime
consistency). None are faked with placeholder data — they're simply not
present in the Habit Engine UI at all this round.

## 2. How a "day" counts as met

`ai/src/habits.ts`:
- **Walking**: a day is met if the **max** steps value seen that day
  (UTC-day-bucketed) is ≥ 8,000 — deliberately the *max*, not a sum,
  since a provider's daily steps rollup is cumulative and gets re-synced
  with a growing value throughout the day; summing would massively
  over-count.
- **Meditation**: a day is met if at least one `MeditationSession`
  completed that day — no minimum duration required.

## 3. Streak and consistency

`computeFromMetDays` (shared by both habits) computes:
- **Current streak** — consecutive met days walking backward from
  today (or yesterday, if today has no data yet — a real ongoing streak
  shouldn't show as broken just because today's sync hasn't landed).
- **Consistency %** — % of the last 30 days met. `null` (not 0%) when
  there's no data in the window at all.

## 4. Where this surfaces

- `GET /api/habits` — `backend/src/api/routes/habits.ts`.
- Insights page's "Habits" section (`LuxuryInsights.tsx`).
- Weekly AI Report's "Best Habit" headline (`workers/src/weeklyReportWorker.ts`) —
  whichever of the two has higher 30-day consistency.

## 5. Verification

`npm test -w ai` — 8 tests covering zero-data behavior, streak counting
(including the max-not-sum same-day dedup and the "today has no data
yet" tolerance), and consistency-percentage math for both habits.
