# MoodSync milestone plan

Per the project's own development process: one milestone at a time,
explained before it's built, tested and stabilized before the next one
starts. This file is the source of truth for what's done, what's next,
and why the order is what it is — the order follows directly from
`docs/INTEGRATIONS_RESEARCH.md`, not from the order platforms were listed
in the original brief.

## Status legend
✅ done · 🚧 in progress · ⏳ blocked on a third party · 📋 planned

---

## Milestone 1 — Platform foundation ✅

**What**: the monorepo, the database schema, and a working auth system —
nothing product-specific yet, because nothing product-specific can be
built safely until accounts and data storage exist.

- Monorepo scaffold (npm workspaces): `frontend`, `backend`, `shared`,
  `database`, `ai`, `workers`, `integrations/*`
- Prisma schema: users, OAuth token storage (encrypted), wearable/smart
  home connections, connected devices, biometric readings, automation
  rules + execution log, insights, recommendations, preferences
- Auth: signup/login/refresh/logout, argon2id password hashing (via
  `@node-rs/argon2`), short-lived JWT access tokens (`jose`), rotating
  opaque refresh tokens (hashed at rest, revocable)
- OAuth token encryption at rest: AES-256-GCM, application-layer, key
  never touches the database
- Fastify API server with structured logging (pino), Zod request
  validation, a working `/api/health` and an authenticated `/api/me`
- `ai/` decision engine v1: rule evaluation (AND-only conditions against
  a `NormalizedBiometricReading`), unit tested
- Integration package skeletons for all 6 providers, each exporting a
  real `IntegrationStatus` reflecting verified reality (available vs.
  blocked) rather than pretending every provider is equally ready

**Explicitly not in this milestone**: no third-party OAuth flows are
wired up yet, no frontend, no actual device control. This milestone is
the ground everything else stands on.

---

## Milestone 2 — WHOOP integration ✅

**Why first**: the only wearable with a fully open, self-serve developer
program and no discretionary approval gate (see
`docs/INTEGRATIONS_RESEARCH.md`). Fastest path to an end-to-end biometric
signal flowing through the system.

- `integrations/whoop`: OAuth 2.0 + PKCE client against the verified
  `api.prod.whoop.com` endpoints, typed client for the recovery/sleep/
  workout/profile v2 endpoints (cursor pagination, `WhoopApiError`)
- `normalizeWhoopData`: merges recovery + matching sleep + same-day
  workout into one `NormalizedBiometricReading` per day. Deliberately
  leaves `heartRate`/`steps`/`calories` unset — WHOOP's endpoints don't
  expose a generic current-heart-rate or step-count field; approximating
  them from workout data would misrepresent what the number means
- Backend: `/api/integrations/whoop/{authorize,callback,sync}`, transparent
  access-token refresh (5-minute-early buffer) so syncs keep working past
  the first token lifetime, not just at connection time
- `workers/src/whoopSync.ts`: standalone entrypoint (run via external
  scheduler, not an in-process poll loop) syncing every active connection,
  isolating one user's failure from the rest
- 14 unit tests (normalization edge cases, OAuth state round-trip, PKCE)

## Milestone 3 — Philips Hue integration ✅

**Why second**: the only smart home platform with a fully open, self-serve
program — pairs with WHOOP to prove a complete "biometric signal →
automated action" loop before investing in the more gated integrations.

- `integrations/hue`: OAuth v2 + PKCE client, typed CLIP v2 client for
  light/scene state (`api.meethue.com/route/clip/v2/resource/...`,
  confirmed against real production code — see
  `docs/INTEGRATIONS_RESEARCH.md`)
- `ConnectedDevice` sync via `POST /integrations/hue/sync-devices`; light
  control via `PUT /integrations/hue/devices/:deviceId/state`
- Action support: on/off, brightness, xy color, color temperature
- Same transparent token-refresh treatment as WHOOP
- One flagged, honestly-documented gap: `createHueApplicationKey` adapts
  Hue's well-documented v1 bridge-pairing pattern to the confirmed
  `/route/` remote prefix, but isn't independently confirmed for CLIP v2
  remote specifically — spot-check against a live Hue developer account
  before this integration's first real end-to-end test

## Milestone 4 — Decision engine v2: actions + automation history ✅

**This is the milestone where WHOOP recovery data can actually change a
Hue light automatically** — the core product loop, end to end.

- `ai/src/dispatch.ts`: `dispatchForReading` — evaluates a user's enabled
  rules against one biometric reading (`evaluateRules`, already unit
  tested from Milestone 1), skips any rule still in cooldown
  (`isWithinCooldown`, pure and unit tested), executes matching actions,
  and records every outcome (executed, skipped, *and* failed — not just
  successes) to `AutomationExecutionLog`
- `ai/src/hueActionExecutor.ts`: executes `hue.set_scene`,
  `hue.set_brightness`, `hue.set_color_temperature` with per-action-type
  param validation and the same transparent token-refresh treatment as
  the rest of the Hue integration. Spotify/notification actions fail
  loudly with "not yet implemented" rather than silently no-op'ing
- Only reacts to a connection's *latest* reading after a sync, not every
  historical reading in a backfill window — otherwise reconnecting a
  wearable would replay days of rule firings at once
- Wired into both the backend's manual "sync now" endpoint and the
  standalone `workers/src/whoopSync.ts`, so scheduled and on-demand syncs
  drive automation identically
- Automation rules CRUD (`/api/automation-rules`) and history
  (`/api/automation-history`) endpoints, backend-owned Zod validation for
  every condition field/operator and action type
- `database`: `automationRuleRepository` and
  `automationExecutionLogRepository`, ownership-safe updates/deletes
  (`updateMany`/`deleteMany` scoped to `{id, userId}`, not a
  check-then-trust pattern)

## Milestone 5 — Frontend foundation 📋

- Next.js app in `frontend/`: marketing site shell + auth pages
  (signup/login) wired to the Milestone 1 API
- Design system foundation (typography, spacing, dark mode, the
  Apple/Linear/Stripe-inspired visual language) — built once, reused by
  the dashboard in Milestone 6
- This is deliberately after Milestones 2-4, not before: a beautiful
  frontend with nothing real to display isn't a demo, it's a mockup, and
  the brief explicitly asked to avoid that

## Milestone 6 — Dashboard 📋

- Connected devices/wearables, today's biometrics, automation history,
  recommendations, insights — per the dashboard spec in the original
  brief, built against real Milestone 1-4 data, not sample data

## Milestone 7 — Google Health API integration (Fitbit) 📋

**Why after WHOOP/Hue, not before**: buildable self-serve today, but
production traffic requires Google's OAuth consent screen verification
plus an **annual third-party CASA security assessment** — a real
compliance line item (cost + lead time) that should be kicked off in
parallel with engineering work, not discovered at launch. This milestone
has two tracked halves:

- 7a — Engineering: OAuth client, data normalization, sync worker
  (buildable and testable now, against up to 100 sandbox users)
  Google's own docs also flag the API as "actively evolving" pre-GA —
  expect to revisit this integration as Google's schema stabilizes.
- 7b — Compliance: initiate Google's restricted-scope verification +
  CASA assessment. **This has an external timeline MoodSync doesn't
  control — do not commit to a production launch date until 7b's actual
  turnaround is known.**

## Milestone 8 — Spotify integration 📋

Same two-track structure as Milestone 7:
- 8a — Engineering: OAuth client, playback control via
  `/me/player/play`, buildable and testable today against the 5-user
  Development Mode cap. Onboarding UI must surface the Premium
  requirement — free-tier Spotify accounts cannot have playback started
  remotely.
- 8b — Business: request Extended Quota Mode. As of Spotify's April 2025
  policy, this is a discretionary review for "established, scalable,
  impactful" apps, not automatic — realistically this application is
  stronger once MoodSync has real usage to point to, so this may need to
  wait until after a WHOOP+Hue beta is live.

## Milestone 9 — Insights & analytics 📋

Daily/weekly insight generation (`Insight` model already exists from
Milestone 1) — trend computation over `BiometricReading` history,
automation-effectiveness scoring (did a triggered automation correlate
with an improved subsequent reading), surfaced in the dashboard.

## Blocked / revisit later ⏳

- **Garmin**: developer partnership application page has been "Under
  Construction" for 2+ months (forum-corroborated, not an official
  freeze). `integrations/garmin` exists as an interface stub. Revisit by
  checking developer.garmin.com/gc-developer-program/health-api directly
  — do not re-attempt integration work until the application path is
  confirmed live again.
- **Ecobee**: developer registration explicitly closed
  ("not currently accepting new developer registrations"). No workaround
  found other than direct outreach to Ecobee business development.
  `integrations/ecobee` exists as an interface stub.
- **Amazon Alexa**: not blocked, *architecturally wrong* — dropped
  entirely. Alexa Smart Home Skills let MoodSync's own devices be
  controlled by Alexa; they do not let MoodSync control a user's
  already-Alexa-linked Hue/Ecobee devices. There is no integration to
  build here; Hue and (eventually) Ecobee are the correct direct
  integration points the original brief's "connect Alexa" step was
  actually pointing at.
