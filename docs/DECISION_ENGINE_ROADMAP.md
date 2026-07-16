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

- **Apple Home, Google Home** — no integration exists. Both would need
  their own OAuth/API research phase (matching the process every existing
  integration in this repo went through — see `docs/INTEGRATIONS_RESEARCH.md`)
  before any code is written.
- **Smart thermostats, blinds, air purifiers, other Matter-compatible
  devices** — same: research-first, no invented capabilities. Ecobee
  exists in the schema as `not_yet_available` (see
  `integrations/ecobee`) — closed registration at the time it was
  researched; worth re-checking before any thermostat automation is built.
- **Pluggable action-executor registry** — dispatch's provider routing is
  still a hardcoded if/else (`ai/src/dispatch.ts`). A real registry/interface
  pattern (`ActionExecutor` type, a lookup map) would make adding new
  providers not require editing dispatch's core loop — worth doing before
  a third or fourth action-taking integration is added, not urgent at two.

## Personalization

- **Per-resource manual overrides** — this round shipped one global
  "pause everything for N minutes." A per-resource override (e.g. "don't
  touch my Hue lights for the next hour, but automations targeting
  Spotify are fine") needs a new data model (a resource-keyed override
  table) and UI, not just a flag.
- **Quiet hours, notification frequency controls, automation
  sensitivity** — `UserPreferences` already has `quietHoursStart/End` and
  `notificationsEnabled` fields in the schema, unused by any code before
  this round and still unused after it (only `automationsPausedUntil`
  was wired up). Wiring quiet hours into the notification engine (suppress
  or batch notifications during quiet hours) is a natural next step using
  an already-modeled field.

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

## Wiring wellness scores into the rule engine

Currently `RuleCondition.field` only references raw `BiometricField`
values (`heartRate`, `sleepScore`, etc.) — a user cannot write a rule
condition against a *computed* wellness score (e.g. "when Stress > 70").
Wiring `computeWellnessScores()`'s output into the condition-matching
path (extending `BiometricField` or adding a parallel `WellnessField`
union) would let automations react to MoodSync's own scores directly,
not just raw provider fields — a natural next step once the scoring
methodology itself has more real-world usage to validate against.
