# Decision Engine — Roadmap (deferred from Milestone 10)

The user's original Decision Engine spec (12 sections) describes a full
product-layer system. Milestone 10 ("Decision Engine core," see
`docs/DECISION_ENGINE_ARCHITECTURE.md` and `docs/MILESTONES.md`) shipped
a real, fully-verified subset. This document lists everything else,
each tagged with exactly what real research or integration work it needs
first — none of it is presented as already supported.

## Automations requiring integrations that don't exist yet

- **Sleep Detection's lock/security check** ("confirm smart locks report
  as locked, confirm security system is armed") — **correction (this
  entry originally proposed a new direct lock-vendor integration; that's
  now the wrong shape, per direction to route this through the existing
  Alexa integration instead of adding a separate one)**. Verified against
  real Amazon developer documentation before writing this: Alexa's
  `Alexa.LockController`/`Alexa.SecurityPanelController` interfaces (see
  [developer.amazon.com/.../alexa-lockcontroller.html](https://developer.amazon.com/en-US/docs/alexa/device-apis/alexa-lockcontroller.html))
  let the skill that *owns* a lock/security device (e.g. August's own
  Smart Home Skill) report its state to Alexa — but there is **no
  cross-skill query API**. A third-party Custom Skill like MoodSync's
  cannot ask Alexa "what's the state of the user's August lock," because
  that lock's state is only ever reported to Alexa by August's own skill,
  never exposed to other skills. This is a real, confirmed Alexa
  platform constraint, not a MoodSync gap — so "MoodSync silently checks
  your locks via Alexa" isn't buildable without MoodSync itself becoming
  a certified Smart Home Skill partner for each lock/security vendor,
  which is exactly the separate per-vendor integration work this
  direction says to avoid.

  **The real, buildable architecture that stays inside the existing
  Alexa integration** (`integrations/alexa`,
  `backend/src/api/routes/integrations/alexa.ts`, see
  `docs/ALEXA_ARCHITECTURE.md`): a voice-driven confirmation loop, not
  device polling — matching this project's explicit rule ("Do not claim
  to control or arm devices unless a supported integration exists"):
  1. A **Sleep Detected** rule template (biometric-triggered — e.g.
     `sleepScore` newly present after a period of activity — buildable
     today with zero new integration, since it only needs the real
     notification engine already shipped in Milestone 10) generates a
     dashboard notification asking the user to check their own locks —
     no device state is queried or claimed.
  2. A new Alexa intent, `CheckSecurityIntent` (sample utterance: "Alexa,
     ask MoodSync if I locked up" / "...if my house is secure"), added to
     the existing skill's interaction model
     (`integrations/alexa/src/interactionModel.template.json`) and intent
     handlers (`integrations/alexa/src/intents.ts`) — lets the user
     *ask* MoodSync this instead of MoodSync ever polling anything.
     MoodSync's honest response today: it has no lock/security
     integration, so it says exactly that rather than guessing ("I don't
     have any smart locks connected — check them yourself before bed.").
     If MoodSync ever does become a certified partner for a specific
     lock/security vendor's Smart Home Skill in the future, this same
     intent's response is where that real state would surface — the
     intent is the extension point, designed now, not implemented until
     a real integration backs it.
  This keeps the "lock stuff" entirely inside the one Alexa
  integration MoodSync already has, as instructed, rather than adding a
  second, separate smart-lock package — at the cost of never being able
  to *automatically* confirm lock state, which Amazon's platform doesn't
  allow for a third-party skill regardless of integration count.
- **Travel/away-mode** — needs a real location integration (geofencing via
  a mobile companion app, or a location API). None exists. The iOS
  companion app (`ios/MoodSyncCompanion`) has no location code today;
  adding it would need explicit new HealthKit-adjacent-but-separate
  CoreLocation permission research, an Info.plist usage string, and a new
  ingest endpoint.

## Smart-home integrations

**Correction: all future device integration goes through Alexa and Apple
HomeKit specifically — not new per-vendor packages (Google Home, direct
lock/thermostat vendor APIs, etc.), per direction.** Both were verified
against real platform documentation before writing this, and they have
meaningfully different — and more limited — real capabilities than "just
another OAuth integration" would suggest:

- **Alexa stays voice-only, as already built.** MoodSync's Alexa
  integration is a **Custom Skill** (`integrations/alexa`) — it can run
  voice commands that trigger MoodSync's *own* already-configured
  automation rules (Hue/Spotify actions it already owns), and now answer
  `CheckSecurityIntent` honestly. It has **no path to controlling new
  device categories** (locks, thermostats, etc.) — that would require
  becoming a fundamentally different skill type (a **Smart Home Skill**,
  which owns and reports its own devices to Alexa) and real per-vendor
  device-cloud infrastructure, which is exactly the separate-integration
  work this direction says to avoid. So "integrate through Alexa" means
  *voice control of what MoodSync already has*, not a new device gateway
  — documented here so this isn't silently overpromised later.
- **Apple HomeKit is the real, buildable path to everything else** (locks,
  thermostats, blinds, air purifiers, other Matter-certified accessories
  — HomeKit is vendor-agnostic within a user's own Home, unlike Alexa's
  skill-siloed model). Verified against real Apple developer
  documentation and forum threads before writing this:
  - Third-party HomeKit apps can only trigger **pre-configured Scenes**
    (e.g. a user-created "MoodSync Relax" or "MoodSync Bedtime" scene
    that bundles lights + a lock + a thermostat) — **not** arbitrary
    per-accessory control the way Apple's own Home app can. This is a
    real Apple platform restriction, not a MoodSync gap.
  - Controlling HomeKit accessories **in the background, without the app
    open, requires a special entitlement Apple grants case-by-case**
    (via Developer Technical Support request) — not a standard
    capability available by default. Without it, HomeKit control only
    works while the companion app is actively open/foregrounded.
  - Net effect: this is architecturally the same shape as Apple Health
    (`ios/MoodSyncCompanion`) — device-side, user-initiated, not a
    server-side push. See `docs/HOMEKIT_ARCHITECTURE.md` (once built)
    for the full design: the backend records a *pending* automation
    action, the companion app polls for and executes it via HomeKit's
    `HMHome`/`HMActionSet` when opened, and reports the outcome back —
    reusing the polling shape already proven by
    `workers/src/scheduledDispatch.ts`, just inverted (device polls
    server, not server polls device).
  - This also gives Sleep Detection's lock/security check a real,
    non-voice path: if the user includes their HomeKit-compatible lock
    in a "MoodSync Bedtime" scene, activating that scene *does* lock it
    — MoodSync still can't independently *query* arbitrary lock state
    (no such HomeKit API for that either, outside scene activation), but
    it can take the real action the scene defines.
- **Google Home** — explicitly out of scope now that devices route
  through Alexa/HomeKit only; not researched further.
- **Pluggable action-executor registry** — shipped: `ai/src/actionExecutors.ts`
  replaces dispatch's hardcoded if/else with a `Partial<Record<SmartHomeProviderId,
  ActionExecutor>>` registry (`hue`/`spotify` execute synchronously,
  `homekit` writes a `PendingDeviceCommand` and reports `queued: true`).
  `dispatch.ts`'s action loop is now a single `executeAction(userId,
  action, rule.id)` call per action; an unregistered provider still
  throws the same "not yet implemented" error it did before (no silent
  no-op). Adding a fourth action-taking provider is one registry entry,
  not another branch. Live-verified against the running backend
  post-refactor: a Hue rule still produces `FAILED` with "No Hue
  connection for this user" and a HomeKit rule still produces
  `QUEUED_FOR_DEVICE` with a real `PendingDeviceCommand` row — same
  observable behavior as before the refactor, confirming it didn't
  regress either path.

## Personalization

- **Per-resource manual overrides** — this round shipped one global
  "pause everything for N minutes." A per-resource override (e.g. "don't
  touch my Hue lights for the next hour, but automations targeting
  Spotify are fine") needs a new data model (a resource-keyed override
  table) and UI, not just a flag.
- **Quiet hours / notifications on-off** — shipped: `GET`/`PATCH
  /api/preferences/notifications` plus `ai/src/notificationExecutor.ts`'s
  `shouldNotify(userId, now)` (checked in `dispatch.ts`'s
  `recordAndNotify` before creating a `Notification` row — the
  `AutomationExecutionLog` audit trail is always written regardless).
  Live-verified: disabling notifications suppresses new rows while
  history keeps recording outcomes; a quiet-hours window spanning the
  current time (including an overnight wrap, e.g. 22:33–00:33)
  correctly suppresses; re-enabling immediately resumes.
  **Timezone bug found during that verification, and fixed in the same
  round**: `withinTimeWindow` originally compared against
  `now.getHours()`/`getMinutes()` — the Node process's local time — not
  the user's stored `User.timezone`. Fixed: `withinTimeWindow` now takes
  an IANA timezone argument and computes wall-clock minutes-of-day via
  `Intl.DateTimeFormat` with `timeZone` set, falling back to UTC on an
  invalid zone. `dispatch.ts` and `notificationExecutor.ts`'s
  `shouldNotify` both fetch the user's timezone (via the new
  `userTimezoneRepository`, `database/src/repositories/userTimezoneRepository.ts`)
  only when some rule/quiet-hours check actually needs it. `PATCH /api/me`
  now accepts `timezone`, validated against the runtime's real IANA
  database (`Intl.supportedValuesOf('timeZone')`); the dashboard's new
  `TimezoneSync` client component auto-detects the browser's zone
  (`Intl.DateTimeFormat().resolvedOptions().timeZone`) and PATCHes it on
  mismatch, so a real signup ends up with a real timezone instead of the
  schema's permanent "UTC" default. Live-verified: a test account set to
  `Asia/Tokyo` correctly suppressed a notification inside a Tokyo-local
  quiet-hours window and correctly allowed one outside it, while the
  server process itself ran in `America/Chicago` — and a `timeWindow`
  rule (the Focus Mode/Sleep Preparation shape) matched using the same
  Tokyo-local evaluation.
- **Notification frequency controls, automation sensitivity** — no
  batching/digest mode exists (every outcome is its own notification);
  no per-rule notification opt-out (only the account-wide toggle).

## AI insights

- **Weekly reports, persisted insights** — the `Insight` Prisma model
  (`period: DAILY|WEEKLY`, `metric`, `value`, `trend`, `summary`) exists
  in the schema and remains unwritten-to after this round; insights are
  still computed on-the-fly per request (`computeTrends`/`computeWellnessTrends`),
  not pre-aggregated. A real weekly-report feature would start by writing
  to this table on a schedule (reusing the `workers/src/scheduledDispatch.ts`
  cron pattern) rather than computing it in the request path.
- **Recommendations** — the `Recommendation` Prisma model (`suggestedActions:
  Json`, `status: PENDING|ACCEPTED|DISMISSED|EXPIRED`) exists in the
  schema and is read/written by zero code, before and after this round.
  A real "AI suggests a rule, user accepts or dismisses it" feature would
  start here.
- **Observations vs. recommendations, distinguished in the UI** — the
  current `InsightsSection`/wellness trends are observations only
  (what happened), not recommendations (what to do about it). Building
  real recommendations needs the `Recommendation` model wired up first.

## Music intelligence

- **"Learn user preferences over time"** — no learning/ML component
  exists. The current Spotify integration is playlist-URI-based
  (`spotify.play_playlist` with a fixed `playlistUri` a user configures
  per rule); there's no play-history tracking, no preference model, and
  no recommendation logic. A real version of this needs, at minimum, a
  play-history table and a defined signal for "did the user like this"
  (skip rate? manual thumbs up/down?) before any learning algorithm is
  worth building.
- **Apple Music** — only Spotify is integrated. Apple Music has a
  fundamentally different auth model (MusicKit, not OAuth) — needs its
  own research phase.

## Sleep-stage-level data

- Adding `deepSleepMinutes`/`remSleepMinutes`/`lightSleepMinutes` (or
  similar) to `NormalizedBiometricReading` and `BiometricReading` would
  unlock a real, cited stage-weighted sleep score (see
  `docs/WELLNESS_SCORING.md`'s Sleep section for the formula that becomes
  usable once this data exists) — confirm which providers' APIs actually
  expose stage-level breakdowns (Apple Health's `HKCategoryValueSleepAnalysis`
  does distinguish stages; confirm Google Health/Fitbit's equivalent)
  before adding the fields.

## Wellness scores wired into the rule engine — done

**Shipped**: `RuleCondition.field` now accepts a `WellnessField`
(`wellness.stress`, `wellness.recovery`, etc. — see
`shared/src/automation.ts`) alongside raw `BiometricField` values, so a
rule can react to MoodSync's own computed scores directly (e.g. "when
Stress > 70"), not just raw provider fields. `ai/src/dispatch.ts`
computes wellness scores (30-day trailing history, same window the
dashboard's `/api/wellness` uses) only when some enabled rule actually
references one, and passes them through `evaluateRules` →
`ruleEngine.ts`'s `conditionMatches` → `explain.ts`'s `explainTrigger`,
so the notification/history text correctly cites the computed score
value, not `undefined`.

**Verified live**: built a real HRV baseline (6 readings with genuine
variance) for a disposable test account, pushed a real low-HRV trigger
reading, confirmed the computed Stress score (100 — correctly clamped)
matched a `wellness.stress > 60` rule and produced the exact reason
`"Triggered because 100 Stress score exceeded your threshold of 60."` —
against the live backend, not a unit-test fake.

**Deliberately out of scope this round**: `computeAutomationEffectiveness`
(`ai/src/insights.ts`) skips wellness-field conditions entirely rather
than guessing — scoring "did this rule's outcome improve" against a
computed score would need to recompute wellness scores for both the
trigger and a subsequent reading, which needs the same history-fetching
this module deliberately doesn't do (kept DB-free/pure). A real version
of this would pass pre-computed score series in, mirroring how
`computeWellnessTrends` already works.
