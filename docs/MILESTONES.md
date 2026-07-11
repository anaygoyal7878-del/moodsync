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

## Milestone 5 — Frontend foundation ✅

- Next.js 16 (App Router, Turbopack, React 19) app in `frontend/`,
  workspace `@moodsync/frontend`, dev server on port 3001
- Design system foundation: CSS-first Tailwind v4 config (`@theme inline`
  in `globals.css`, no `tailwind.config.js`), dark-mode-first token set
  (`--canvas`, `--surface*`, `--ink*`, `--brand*`), Inter via
  `next/font/google` — built once, reused by the dashboard in Milestone 6
- Marketing site shell (`/`) + auth pages (`/login`, `/signup`) wired to
  the Milestone 1 backend API — signup/login/logout all round-trip
  through the real Fastify server, not mocked
- Session handling: httpOnly cookies (access + refresh token), not
  localStorage — Next.js Route Handlers (`/api/auth/{signup,login,logout}`)
  proxy to the backend so the browser never talks to the backend origin
  or sees raw JWTs in JS-accessible storage
- `dashboard/page.tsx` is a Server Component that reads the session
  cookie, calls the backend's `/api/me`, and redirects to `/login` when
  unauthenticated — proves the auth chain end-to-end ahead of Milestone 6
- No `middleware.ts`/`proxy.ts`: Next 16 deprecated the middleware
  convention in favor of `proxy.ts`, and Next's own guidance is to avoid
  it unless there's no other option — the real auth check already lives
  in the dashboard Server Component, so a separate edge gate would be
  redundant
- Verified in-browser end-to-end against the real backend (no live
  Postgres in this environment, so signup/login correctly surface a
  500 from the backend through the proxy route and `AuthForm`'s
  error-handling path, rather than a fake happy path)
- This is deliberately after Milestones 2-4, not before: a beautiful
  frontend with nothing real to display isn't a demo, it's a mockup, and
  the brief explicitly asked to avoid that

## Milestone 6 — Dashboard ✅

- Backend: `GET /api/connections` (wearable + smart-home connections,
  each smart-home connection's synced devices inline), `GET
  /api/biometrics/latest`, `GET /api/biometrics/history?days=`, `DELETE
  /api/integrations/{whoop,hue}` (disconnect — ownership-scoped
  `updateMany`, same pattern as automation rules). Reuses the
  automation-rules/automation-history endpoints built in Milestone 4
  rather than duplicating them
- Frontend dashboard (Server Component data fetching, small client
  islands for the interactive bits): connection status + connect/sync/
  disconnect, connected Hue devices with on/off control, latest +
  7-day biometric readings, automation rule list (enable/disable/
  delete) with a rule-creation form, automation execution history
- The rule-creation form only offers `hue.*` action types — `spotify.*`
  and `notification.*` are modeled in the schema (Milestone 4) but have
  no executor yet (see `ai/src/dispatch.ts`), so offering them would let
  a user create a rule that always fails. They're enabled once
  Milestones 8/9 wire up their executors
- "Recommendations" and "insights" from the original brief's dashboard
  spec are Milestone 9's job (`Insight`/`Recommendation` models exist
  but trend computation and automation-effectiveness scoring don't yet)
  — deliberately not faked here with sample data
- Every OAuth-provider action (connect, disconnect) and device/rule
  mutation goes through a Next.js Route Handler that translates the
  httpOnly session cookie into a Bearer token, same pattern as
  Milestone 5's auth routes — the browser never talks to the backend
  origin directly
- No live Postgres in this environment, so the authenticated dashboard
  render itself couldn't be exercised end-to-end (same constraint noted
  in Milestone 5). Verified instead via: clean build/typecheck/lint,
  confirmed `/dashboard` redirects to `/login` without a session and
  throws no server/console errors, and a throwaway preview route
  (deleted before commit) rendering every new component against mock
  connections/biometrics/rules/history data to check layout and
  interactive elements (dropdowns, action-type-dependent form fields)

## Milestone 7 — Google Health API integration (Fitbit) ✅ (7a) / ⏳ (7b)

**Why after WHOOP/Hue, not before**: buildable self-serve today, but
production traffic requires Google's OAuth consent screen verification
plus an **annual third-party CASA security assessment** — a real
compliance line item (cost + lead time) that should be kicked off in
parallel with engineering work, not discovered at launch. This milestone
has two tracked halves:

- 7a — Engineering ✅: `integrations/fitbit` (kept named for the brand;
  the client targets Google Health API endpoints — `oauth.ts`,
  `client.ts`, `normalize.ts`, `sync.ts`, mirroring the WHOOP package's
  shape), `backend/src/services/fitbitService.ts` + routes at
  `/api/integrations/google-health/*` (authorize/callback/sync/disconnect,
  same pattern as WHOOP/Hue), `workers/src/fitbitSync.ts`, and a Fitbit
  card in the dashboard's Connections section
- Every endpoint, scope, and schema field used was independently verified
  against `developers.google.com/health` and the live Discovery document
  (`https://health.googleapis.com/$discovery/rest?version=v4`) — not
  assumed from the Milestone 1 research pass, which only had the OAuth
  endpoints and scope names. Full details in
  docs/INTEGRATIONS_RESEARCH.md's "REST implementation details" section,
  including two things deliberately left unresolved rather than guessed:
  the exact `list` filter syntax for `daily-resting-heart-rate`/`sleep`
  (inferred from the one confirmed `exercise` filter example), and
  `Sleep.startTime`/`endTime`'s wire shape (a `ObservationSampleTime`
  message whose JSON representation wasn't found in the docs) — sleep
  data is normalized from `sleepSummary.stageSummary` only, which does
  have confirmed field names
- `sleepScore` for this provider is computed as sleep efficiency (time
  asleep ÷ time in bed) since Google Health has no single score field
  like WHOOP's `sleep_performance_percentage` — a standard published
  sleep-medicine metric, not an invented one. `recoveryScore` and
  `stressLevel` are left unset, same as WHOOP: no equivalent exists
- Google's own docs flag the API as "actively evolving" pre-GA — expect
  to revisit this integration as the schema stabilizes, particularly the
  two unresolved items above
- 7b — Compliance ⏳: initiate Google's restricted-scope verification +
  CASA assessment. **This has an external timeline MoodSync doesn't
  control and is a real-world business process, not an engineering task —
  do not commit to a production launch date until 7b's actual turnaround
  is known.** Until then this integration works for up to 100 sandbox
  users, which is sufficient for a beta.

## Milestone 8 — Spotify integration ✅ (8a) / ⏳ (8b)

Same two-track structure as Milestone 7:

- 8a — Engineering ✅: `integrations/spotify` (`oauth.ts` — standard
  Authorization Code Flow with HTTP Basic Auth token exchange, no PKCE,
  see docs/INTEGRATIONS_RESEARCH.md for why this deviates from every
  other provider; `client.ts` — `PUT /me/player/play`), wired into the
  dispatch engine via `ai/src/spotifyActionExecutor.ts` (mirrors
  `hueActionExecutor.ts`'s transparent-refresh pattern — `spotify.play_playlist`
  actions now actually execute instead of throwing "not yet
  implemented"), `backend/src/services/spotifyService.ts` + routes at
  `/api/integrations/spotify/*` (authorize/callback/disconnect — no
  sync/device endpoints, since Spotify has no readings to sync and no
  device state to push), and a Spotify card + rule-builder support in the
  dashboard. Onboarding UI (both the Connections card and the rule form)
  surfaces the Premium/active-session requirement — free-tier Spotify
  accounts cannot have playback started remotely, and nothing plays if no
  device already has an active session.
- Every endpoint, scope, and request/response shape was independently
  verified against developer.spotify.com — not assumed from the
  Milestone 1 research pass. Full details in
  docs/INTEGRATIONS_RESEARCH.md's "REST implementation details" section.
- 8b — Business ⏳: **re-verified for this milestone and found to be a
  materially bigger blocker than the Milestone 1 research pass
  documented.** Extended Quota Mode as of Spotify's May 2025 policy
  requires a legally registered business entity, an already-launched
  service, and **at least 250,000 monthly active users** — not a
  discretionary content review MoodSync could plausibly pass pre-launch.
  There is no realistic path to Extended Quota Mode until well past an
  initial WHOOP+Hue beta has real usage; Development Mode's 5-user cap is
  the practical ceiling for the foreseeable future, not a temporary
  formality.

## Milestone 9 — Insights & analytics ✅

- `GET /api/insights` (`backend/src/api/routes/dashboard.ts`): computed
  live from real `BiometricReading`/`AutomationRule`/`AutomationExecutionLog`
  data on each request — not a scheduled job writing into the `Insight`
  model. No cron/worker scheduler exists yet to populate that table on a
  cadence, and adding one just to cache a value that's cheap to compute
  live would be premature infrastructure; revisit if computing insights
  live ever becomes a real cost at scale.
- `ai/src/insights.ts` (pure, unit-tested — mirrors `ruleEngine.ts`'s
  shape): `computeTrends` splits a reading window in half by count and
  compares per-metric averages (skips a metric missing from either half
  rather than fabricating a trend from partial data). `computeAutomationEffectiveness`
  compares each `EXECUTED` rule firing's trigger reading against the next
  reading afterward for the rule's primary condition field, classifying
  "improvement" by the condition's own operator (a `lt` rule wanted the
  value to rise, a `gt` rule wanted it to fall). Explicitly presented as
  correlation, not a controlled experiment — the UI says so.
- `database`: `biometricReadingRepository.listRecentNormalizedWithId`
  (same window as the existing history query, but keeps row ids and
  returns oldest-first — what effectiveness scoring needs to look up a
  trigger reading and find the next one chronologically).
- Dashboard: new `InsightsSection` — trend cards with a direction arrow,
  and a per-rule effectiveness bar. Shows a real "not enough data yet"
  empty state rather than sample numbers when there's no history.

## Post-milestone polish pass ✅

Not a numbered milestone — a focused reliability/UX pass across what M1-9
had already built, prompted by a request to make the product feel
production-ready. Scoped down from a much larger ask (new unresearched
integrations, a fake-data "demo mode" mixed into the real dashboard) that
would have violated this project's own rules; see the scoping conversation
for what was deliberately left out and why.

- **Fixed a real bug**: OAuth connect failures redirected to
  `/dashboard?error={provider}_unavailable`, but nothing read that query
  param — the error was silently dropped. Added `ConnectErrorBanner`.
- **Connection status UX**: `ConnectionsSection` only ever distinguished
  ACTIVE vs. not before. Now shows EXPIRED/ERROR/REVOKED distinctly (via
  `ConnectionStatusBadge`) with a "Reconnect" CTA for EXPIRED/ERROR
  (same OAuth flow, different fix) vs. a plain "Connect" for REVOKED.
- **UI polish**: landing-page entrance animation (`prefers-reduced-motion`-
  aware, pure CSS), corrected stale copy (Garmin/Ecobee said "Coming
  soon" — now "Blocked upstream," matching how the rest of this doc
  describes them; integration/user counts updated to reflect Fitbit and
  Spotify actually shipping), a `dashboard/loading.tsx` skeleton for the
  page's parallel backend fetches, shared `metrics.ts` label/unit helpers
  (removes duplication between `BiometricsSection` and `InsightsSection`).
- **`/demo` route**: a self-contained, clearly-labeled-simulated public
  page (`components/demo/DemoExperience.tsx`) animating the one scenario
  this product actually supports today — a WHOOP recovery drop matching
  a rule, dimming Hue lights, switching a Spotify playlist, and logging
  the result — via plain CSS transitions and React state, no video/canvas
  library. Deliberately kept separate from the authenticated dashboard,
  which stays 100% real-data-only per this project's rule since
  Milestone 5 ("a beautiful frontend with nothing real to display isn't
  a demo, it's a mockup"). Auto-advances but respects
  `prefers-reduced-motion` and offers manual pause/back/next controls.
- **Explicitly out of scope for this pass** (flagged rather than
  attempted): Apple Health, Oura, and a live Garmin integration — none
  are research-verified against this codebase's standards, and Garmin's
  developer program is still documented as blocked.

## Real end-to-end verification + battery display ✅

A second focused pass, prompted by discovering that "create account" did
nothing in the hosted preview — because only the frontend was running,
with no backend and no database behind it. Two things came out of
investigating that properly instead of just explaining the limitation:

- **Local Postgres, for real, in this environment**: no Docker/Homebrew
  available here, so this used the `embedded-postgres` npm package (a
  real, standard Postgres 18.4 binary, not an emulation) to run an actual
  local database. `npx prisma migrate dev` against it created the
  project's first real migration (previously the schema had only ever
  been validated by `prisma generate`, never actually migrated onto a
  live database). The real backend was then booted against this database
  with generated secrets.
- **Genuinely verified, not simulated** (browser-driven against the real
  running stack, not mocked data): signup creates a real user row and
  returns real JWTs; login/logout/session-persistence-across-tabs all
  work; a wrong password returns a correct, non-leaky "Invalid email or
  password" instead of a stack trace; creating and deleting an automation
  rule round-trips through the real database; clicking "Connect WHOOP"
  with no `WHOOP_CLIENT_ID` set correctly 503s and the `ConnectErrorBanner`
  built in the prior pass renders the intended message end-to-end, not
  just against mock props.
- **What's still not verifiable without real credentials**: completing
  an actual third-party OAuth consent screen (WHOOP/Google/Hue/Spotify)
  requires a registered developer app with real client ID/secret for
  each platform — MoodSync's own code correctly initiates and handles
  the redirect/callback/error paths (verified above), but the provider
  side of the handshake needs real accounts this environment doesn't
  have. This is an external dependency, not a code gap.
- **Battery display for Fitbit — real, not the "not confirmed" punt from
  the prior pass**: re-researched rather than re-asserting the earlier
  answer. Google Health's `users.pairedDevices` resource genuinely
  exposes `batteryLevel`/`batteryStatus`/`deviceVersion` (confirmed
  against the live REST reference, including the specific
  `googlehealth.settings.readonly` scope it requires — not one of the
  three scopes already requested for biometric data). Implemented as a
  new `WearableConnection.deviceName`/`batteryLevel`/`batteryStatus`
  migration, populated by `fitbitService.syncConnection` and the
  standalone worker, surfaced in `ConnectionsSection` with a color-coded
  indicator. Verified against the real local database (a test row
  inserted directly via Prisma — not a real OAuth-synced device, since
  that still requires a real Fitbit account — round-tripped correctly
  through `/api/connections` into the real running UI, then cleaned up).
  **WHOOP's public API has no battery endpoint at all** (re-confirmed
  directly against their live reference — eight resource categories,
  none battery-related) — this is a real capability gap in WHOOP's API,
  not missing work. Hue's battery field applies to sensors/switches, not
  the light bulbs this integration syncs — not applicable here either.

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
