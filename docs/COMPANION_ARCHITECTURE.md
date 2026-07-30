# Companion Architecture

How MoodSync works as a daily companion rather than a wellness
dashboard: **understand me → predict what I need → help me do the right
thing.** Smart home is one output of that engine, not the product.

## The intelligence layer (`ai/src/`)

Every module here is pure and DB-free — it takes measurements in and
returns interpretations out, so it can be unit-tested against real
fixtures and reused by both the API and the background workers.

| Module | Answers | Returns null when |
|---|---|---|
| `dailyBrief.ts` | How ready am I, what changed overnight, what is today for | No recovery or sleep score exists |
| `energyMeter.ts` | How much energy do I have *right now* | No biometric basis (caffeine alone isn't enough) |
| `socialBattery.ts` | How much social/mental capacity today | Neither sleep nor recovery available |
| `stressTimeline.ts` | *When* did stress actually move today | Fewer than 4 usable 15-minute buckets |
| `sleepCoach.ts` | When should I go to bed, how do I wind down | No calendar → no bedtime target |
| `smartBreaks.ts` | Should this focus session be interrupted now | Almost always — that's the point |
| `focusScore.ts` | How steady was that session | Fewer than 3 heart rate samples |
| `wellnessMemory.ts` | What actually works *for me* | Fewer than 3 occurrences of a thing |
| `studyPlanner.ts` | When is my best window today | No calendar, or nothing ≥45 min free |
| `proactiveNotifications.ts` | Is something worth interrupting for | Signals disagree |

### Readiness vs. Energy

These are deliberately two numbers, not one:

- **Readiness** (`dailyBrief.computeReadiness`) is set by the night —
  recovery 60%, sleep 40%. It answers *how much load can I take today*
  and barely moves after you wake up.
- **Energy** (`energyMeter.computeLiveEnergyMeter`) is a live composite
  that includes a decaying caffeine boost. It answers *how much have I
  got right now*.

Collapsing them into one number would lose the distinction that makes
the brief useful ("high readiness, low energy" is a real and actionable
state — eat something, then do the hard thing).

## The rules every recommendation follows

1. **Never fabricate a signal.** A missing measurement produces `null`
   and an honest empty state, never a plausible-looking default. This is
   why nearly every function above documents its null case.
2. **Always show the reason.** Scores ship with the reasons that drove
   them (`SocialBatteryResult.reasons`, `BriefAction.reason`,
   `WindDownStep.reason`). The `Reasons` primitive exists so this is the
   path of least resistance.
3. **Label interpretations as interpretations.** Anything MoodSync
   inferred rather than measured carries an `AiEstimateNote`. Social
   Battery ships its disclaimer *inside the payload* so no UI surface
   can drop it.
4. **Suppress below a real sample size.** Wellness Memory needs 3
   occurrences, focus-hour patterns need 2 sessions per bucket, baseline
   z-scores need 5 days. Below that, the app says it's still learning.

## Information architecture

Grouped in `frontend/src/lib/dashboardSections.ts` as `NAV_GROUPS`:

- **Today** — Today (Daily Brief), Energy, Focus, Sleep, Recovery
- **Routines** — Habits, Meditate, Music, Atlas
- **Understand** — Insights, Weekly report, Wellness scores, Biometrics, Recommendations
- **Environment** — Scenes, Devices, Automations
- **Account** — Connections, Notifications, Settings

`DASHBOARD_SECTIONS` is a flat derivation of the same data, so search and
the mobile overflow list can never drift from the sidebar.

### Mobile and web are deliberately different shapes

- **Mobile** (`LuxuryBottomNav.BOTTOM_NAV_TABS`) is the companion: Today,
  Energy, Focus, Sleep, Atlas, More. Six one-handed daily-use
  destinations. Automations, Devices and Scenes are *not* here — they
  stay reachable through Settings' overflow list, but configuring a
  smart home isn't phone-at-7am work.
- **Web** (`Sidebar.tsx`) is the control center: every section, grouped,
  always on screen.

## The Daily Brief request

`GET /api/daily-brief` computes the whole home screen server-side in one
round trip — greeting, readiness, energy, overnight changes, burnout
check, focus window, and the focus/avoid/act guidance. The home screen of
a daily-use app should not be a waterfall of six client fetches.

`backend/src/services/companionContext.ts` is the shared read (latest
reading, trailing history, computed scores, today's calendar) that the
brief and the Energy/Sleep/Recovery/burnout/study-plan routes all use, so
those routes can't drift on how they derive the same things.

**`todayEvents` is `null` vs `[]` on purpose**: `null` means no calendar
is connected *or the read failed*; `[]` means a connected calendar with a
genuinely free day. Several callers treat an empty day as a positive
signal, so conflating the two would produce wrong advice.

## What is deliberately not built

- **Notification silencing / Focus mode control** — no public iOS API
  lets a third-party app enable Focus. See `docs/FOCUS_SESSIONS.md`.
- **Distraction detection** — no signal exists for it in this app.
- **Screen time** — iOS keeps usage data inside a report extension that
  can't hand numbers back to the host app.
- **Bedtime consistency** — providers report a sleep *score*, not the
  time you fell asleep. See `docs/SLEEP_COACH.md`.
- **Hydration / stretching habits** — no device signal and no manual log.
  The Habits page lists these and says why, rather than omitting them
  silently.
