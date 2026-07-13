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

## Apple Health companion app + connections polish ✅

Prompted by "configure all connections of fitbit and whoop and apple
health and improve overall UI." Apple Health specifically required
research into whether it could even be a backend integration at all —
it can't (see docs/INTEGRATIONS_RESEARCH.md's "Apple Health" section) —
so this shipped as a genuinely new component, not a variant of the
existing OAuth pattern.

- **`ios/MoodSyncCompanion`**: new SwiftPM package — HealthKit reading
  (heart rate, resting heart rate, steps, active energy, sleep
  efficiency), a client for this product's real `/api/auth/login` and a
  new `POST /api/integrations/apple-health/ingest` endpoint, and a
  one-screen SwiftUI view. Compile-verified via `swift build` (real
  HealthKit API usage, not stubbed) and logic-verified via a throwaway
  executable running the same assertions as the committed `XCTest`
  files by hand (XCTest itself isn't runnable in this sandbox — see the
  package's README for the exact, itemized boundary of what was and
  wasn't verifiable without Xcode).
- **Backend**: `APPLE_HEALTH` added to the `WearableProvider` enum
  (migration included, applied to the real local Postgres set up in the
  prior round), `wearableConnectionRepository.upsertTokenlessConnection`
  (no OAuth token — HealthKit has none), and the ingest route itself —
  verified end-to-end against the real database via curl (real user,
  real insert, real connection row, confirmed through `/api/connections`
  and the live dashboard UI).
- **Frontend**: an Apple Health connections card with honest messaging —
  no "Connect" OAuth link, since none exists; status instead reflects
  whether the iOS app has ever successfully synced.
- **Real mobile layout bug found and fixed**: the new Apple Health card's
  longer status text wrapped awkwardly and pushed its Disconnect button
  out of alignment at 375px width — found via an actual mobile-viewport
  screenshot, not assumed. Fixed by switching every connection card's
  flex alignment from center-aligned-fixed-height to
  wrap-and-align-to-top (`items-start` + `flex-wrap` + `min-w-0 flex-1`
  on the text column), verified again after the fix at both mobile and
  desktop widths.
- **`docs/CONNECTING_REAL_ACCOUNTS.md`**: exact step-by-step for
  registering real WHOOP and Google Health API developer apps (redirect
  URIs, scopes, test-user setup) so a real OAuth connection can be
  completed locally — this requires the account holder's own developer
  registration and can't be done by an agent on their behalf.
- **Privacy note**: while verifying this round's changes, a real user
  account (the account holder's actual email) was found logged into the
  shared local dev database/browser session — confirmed with the user
  to be their own action (signing up themselves to test the earlier
  fix), not something this session did. Left untouched at their request.

## Scheduled sync ✅

The highest-impact gap flagged at the end of the previous round: syncing
was manual-trigger-only (the dashboard's "Sync now" button), with no
automated path — a real user would have to remember to click it.

- **Refactored, not just added to**: `whoopSync.ts` and `fitbitSync.ts`
  had near-identical per-connection loop orchestration (list active
  connections, isolate one user's failure from the rest, mark synced,
  fire automations off the latest reading, tally success/failure) —
  duplicated for a reason that no longer held once both lived in the
  same `workers` package (the cross-deployable-duplication rule that
  justifies the same pattern in `backend`/`ai`/`workers` doesn't apply
  *within* one package). Extracted into `workers/src/lib/runProviderSync.ts`;
  the two entrypoints are now ~10 lines each, and provider-specific logic
  (token refresh, the API client, Fitbit's extra device-info sync) moved
  into `workers/src/providers/{whoop,fitbit}.ts`.
- **`workers/src/syncAll.ts`**: runs every configured provider in one
  invocation — one cron entry instead of coordinating N schedules. A
  provider with no client credentials set is skipped, not fatal, so a
  deployment with only WHOOP configured doesn't fail its whole run
  because Fitbit isn't set up yet; one provider throwing doesn't stop
  the others.
- **Verified for real**: ran against the real local Postgres with no
  provider credentials set (both skipped, clean exit), then again with
  WHOOP "configured" (fake credentials, since no real WHOOP app exists
  in this environment) to confirm the real Prisma query runs, correctly
  finds zero active connections (there are none — no real OAuth
  connection has ever been completed here), and reports success rather
  than a false failure for the empty case.
- **Still requires external scheduling** — this was true before this
  round and remains true: `workers` are one-shot scripts by design (see
  Milestone 2's original rationale — an external scheduler is more
  robust than an in-process `setInterval` that dies with the process).
  Wire `npm run start:sync-all -w workers` into cron, a Kubernetes
  CronJob, or a platform's scheduled-jobs feature at whatever interval
  matches the provider's rate limits (WHOOP: 100 req/min, 10k/day per
  client — hourly is comfortable for any realistic user count). Example
  crontab entry for hourly:
  ```
  0 * * * * cd /path/to/moodsync/workers && npm run start:sync-all
  ```

## Fitbit near-live heart rate + Google Health schema verification

- **Verified the Google Health API implementation against Google's live
  REST reference** (`developers.google.com/health`), field by field, at
  the user's request. Found and fixed two confirmed bugs where the code's
  assumed JSON field names didn't match the real API — both would have
  silently produced `undefined` values forever, not errors:
  - `HeartRateRollupValue`'s fields are `beatsPerMinuteMin/Max/Avg`, not
    the `bpmMin/Max/Avg` the code guessed.
  - The `Sleep` schema nests differently than assumed:
    `interval.startTime/endTime` (not directly on `sleep`), and
    `summary.stagesSummary[].{type,minutes}` (not
    `sleepSummary.stageSummary[].{sleepStageType,totalDuration}`).
    `sleepEfficiencyScore` now uses `summary.minutesAsleep` /
    `summary.minutesInSleepPeriod` directly instead of hand-summing stage
    durations. `steps`/`total-calories` rollup field names
    (`countSum`/`kcalSum`) and every `pairedDevices` field were confirmed
    correct on the first pass — no changes there.
- **Added `GoogleHealthClient.listHeartRate`**: fetches individual
  timestamped heart-rate samples (the `heart-rate` dataType's `list`
  method) instead of only a once-a-day rollup average. Each sample becomes
  its own `NormalizedBiometricReading` at its real `physicalTime`, so the
  dashboard's "latest reading" reflects an actual recent measurement, not
  a stale daily average — this is what "current heart rate" is built on.
  There's no true push/streaming API (`developers.google.com/health/webhooks`
  exists but only notifies "new data landed in this time range," it still
  requires a follow-up `list`/`dailyRollUp` call to fetch values, and
  needs a publicly reachable HTTPS endpoint — not adopted here), so
  "near-live" means polling on a short interval.
- **Fitbit sync worker cadence dropped from hourly to every 5 minutes** to
  make that polling actually near-live. Confirmed safe against
  `developers.google.com/health/rate-limits`: 300 requests/minute per
  user — a 5-minute sync does roughly 6 requests per connected user, far
  under quota. WHOOP's own quota (100 req/min, 10k/day per client) is also
  comfortable at this cadence. Updated crontab example:
  ```
  */5 * * * * cd /path/to/moodsync/workers && npm run start:sync-all
  ```
- **Added a unique constraint** on `BiometricReading(userId, provider,
  timestamp)` and switched `bulkInsert` to `skipDuplicates: true` — a
  5-minute cadence with a 20-minute heart-rate lookback window
  (`heartRateSinceMinutes`, deliberately wider than the sync interval so
  one missed cycle doesn't drop a sample) intentionally re-requests
  overlapping data on every run; without the constraint this would
  otherwise insert repeat rows for the same sample.
- **Verified for real**: rebuilt and typechecked
  `@moodsync/integration-fitbit`, `@moodsync/database`,
  `@moodsync/workers`, and `backend` clean; ran the new/updated
  `normalize.test.ts` suite (8 passing, including new coverage for
  per-sample heart-rate readings and the fixed sleep-efficiency
  calculation); applied the new migration to the real local Postgres
  instance and confirmed no pre-existing duplicate rows blocked it;
  restarted the real backend and re-ran the real `syncAll` worker against
  the live database to confirm nothing regressed (no active connections
  exist in this environment yet, so the actual Google Health API response
  shapes are still unverified against live traffic — only against the
  documented schema).

## Apple Health production-readiness pass

- **Full architecture design** written up in
  `docs/APPLE_HEALTH_ARCHITECTURE.md`: system diagram, auth flow, data
  flow, security model, sync/background-sync strategy, error handling,
  privacy considerations, platform limitations, and an explicit
  on-device-vs-server-side split — grounded in a fresh round of
  `developer.apple.com` research (not carried over from the prior
  session), with every HealthKit identifier and schema claim in it
  independently confirmed against live doc fetches this round.
- **New confirmed findings from that research**:
  - `HKDevice` has no battery property at all — confirmed by listing its
    complete field set. This is a permanent HealthKit platform gap
    (unlike Google Health's `pairedDevices`, which does expose battery),
    not a bug or an oversight.
  - Blood oxygen (`oxygenSaturation`) is a real HealthKit type, but its
    availability on US Apple Watch hardware has an unusual recent history
    (disabled Jan 2024 by an ITC ruling tied to Masimo patent litigation,
    partially restored Aug 2025 via iPhone-side processing, litigation
    ongoing) — whether third-party HealthKit reads see the restored data
    on affected devices couldn't be confirmed from available docs and is
    flagged as genuinely uncertain rather than guessed at.
  - HealthKit has no true push/real-time API for historical data —
    `HKObserverQuery` + `enableBackgroundDelivery` is the closest thing,
    and it's an OS-scheduled, non-guaranteed-immediate wake, not a
    notification.
- **Expanded `HealthKitReader`**: added heart rate variability (SDNN),
  respiratory rate, blood oxygen, and device-name reading (off the most
  recent heart-rate sample's `HKDevice`); requested (but did not yet
  sync) workout authorization, so a future round doesn't need a new
  permission prompt. Added `enableBackgroundDelivery(onUpdate:)` —
  `HKObserverQuery` registration + `enableBackgroundDelivery` for every
  watched sample type, heart rate at `.immediate`, everything else at
  `.hourly`.
- **Extended the data model end-to-end** for the three new metrics:
  `NormalizedReading` (Swift) → `readingSchema` (Zod, backend ingest) →
  `NormalizedBiometricReading` (shared TS type) → `BiometricReading`
  (Prisma model + real migration applied to the local Postgres) →
  `biometricReadingRepository`. Device name now flows through
  `wearableConnectionRepository.updateDeviceInfo` the same way Fitbit's
  already does.
- **Built `scripts/demoAppleHealthSync.mjs`**: since Apple Health has no
  server-side API, there's no way to fake an OAuth connection and let a
  worker pull data (unlike WHOOP/Fitbit) — the only real producer of
  Apple Health data is a physical device. This script instead logs into
  a real MoodSync account and pushes a realistic simulated day of data
  through the REAL `/api/integrations/apple-health/ingest` endpoint,
  letting the entire server + dashboard half of the integration be
  verified without an iPhone or Apple Developer account.
- **Connections card overhaul** for Apple Health specifically (a
  dedicated `AppleHealthCard` component, not the shared OAuth-provider
  card): shows device name, relative last-sync time, a list of requested
  metrics with an explicit note that HealthKit never reveals true
  grant/deny state (so the framing says "requested," never "granted"),
  a no-battery note, and — when not connected — a 4-step onboarding
  panel explaining there's no web sign-in for this provider.
- **Wrote `docs/APPLE_HEALTH_DEVELOPER_GUIDE.md`**: the complete,
  assume-zero-prior-setup guide for everything that requires the user's
  own Apple Developer account and hardware — enrollment, App ID +
  HealthKit capability, wrapping the existing Swift package in an Xcode
  project, Info.plist keys, Background Modes, running on a physical
  iPhone (HealthKit does not work in the Simulator — this is a hard
  requirement, not a convenience choice), TestFlight, and App Store
  submission's HealthKit-specific privacy declarations.
- **Verified for real**: full monorepo build/typecheck/lint/test all
  clean; `swift build` clean on the expanded Swift package; the Swift
  package's pure logic (including the new fields' JSON round-trip
  against the exact key names the backend Zod schema expects) verified
  via the same temporary-executable-target technique as the prior
  Apple Health round (added, run, deleted before commit — XCTest itself
  still isn't runnable in this sandbox); ran
  `scripts/demoAppleHealthSync.mjs` twice against two disposable test
  accounts created and deleted specifically for this verification (never
  touched any pre-existing user data — see the standing privacy protocol
  from earlier in this project), confirming all new fields (HRV,
  respiratory rate, blood oxygen, device name) persist correctly through
  the real ingest pipeline once the backend was rebuilt with this
  round's changes; visually verified both the disconnected-onboarding
  and connected states of the new Apple Health Connections card in a
  real browser session against the live local backend. Also found and
  fixed one pre-existing, unrelated flaky test
  (`backend/src/lib/oauthState.test.ts`'s tamper-detection test) —
  base64url's final character can carry unused padding bits, so a fixed
  last-character swap could coincidentally decode to the same signature
  bytes and leave tampering undetected; fixed by flipping a character in
  the middle of the token instead, confirmed stable across 5 repeated
  runs.

## Amazon Alexa integration

- **Researched fresh against developer.amazon.com** (not assumed):
  confirmed a **Custom Skill** (not a Smart Home Skill) is the right fit
  — Smart Home Skills are documented as unsuitable for conversational
  queries like "how am I doing today," and every required command
  follows the `"Alexa, ask {invocation} to {utterance}"` pattern that
  defines a custom skill. Confirmed the exact request-signature
  verification algorithm (`SignatureCertChainUrl`/`Signature-256`
  headers, SHA-256, 150-second replay window), the exact account-linking
  redirect URIs for all three Amazon regions, and the account-linking
  manifest schema.
- **The key architectural finding**: unlike every other integration,
  Alexa account linking requires **MoodSync to be the OAuth 2.0
  authorization server**, not a client of a third party's OAuth — Amazon
  redirects users to MoodSync's own authorize endpoint. Documented in
  full in `docs/ALEXA_ARCHITECTURE.md`, including why this requires a
  frontend consent page (not a backend redirect) since MoodSync's
  session lives in the frontend's own httpOnly cookie.
- **New `integrations/alexa` package**: hand-typed request/response
  envelopes (no `ask-sdk-core` dependency, matching this project's
  existing hand-rolled-client pattern); `verifyRequest.ts` implementing
  Amazon's full signature-verification algorithm with Node's built-in
  `crypto`/`tls` (X.509 chain-of-trust walking, RSA-SHA256 verification)
  rather than an unvetted third-party "alexa-verifier" package, since
  this is a security-critical path with a fully-specified algorithm;
  `authCode.ts`/`skillToken.ts` mirroring the existing
  `oauthState.ts`/`jwt.ts`/`refreshToken.ts` patterns; the full voice
  interaction model and a skill manifest template.
- **Backend**: `alexaService.ts` implements the authorization-code mint,
  token exchange (both `authorization_code` and `refresh_token` grants,
  with a selector:verifier-split refresh token so encrypted tokens don't
  need a full-table decrypt-and-scan to look up), and all six voice
  intent handlers. Three new routes: `POST /integrations/alexa/authorize`
  (session-authenticated, called by the frontend consent page),
  `POST /integrations/alexa/token` (RFC 6749 token endpoint, HTTP Basic
  client auth — added `@fastify/formbody` since this is the one endpoint
  in the product that needs form-urlencoded parsing), and
  `POST /alexa/skill` (the real signature-verified voice webhook, with a
  scoped `addContentTypeParser` override to capture the exact raw bytes
  Amazon signed — Fastify's per-plugin encapsulation keeps this from
  affecting any other route file).
- **Voice commands reuse existing product logic, not new invented
  behavior**: `GetStatusIntent`/`GetSleepSummaryIntent` read the same
  `biometricReadingRepository` the dashboard uses;
  `SyncDevicesIntent` calls the exact same sync-now service functions as
  the dashboard's `SyncButton`; `StartRelaxationIntent`/
  `ImproveFocusIntent`/`ActivateEveningRoutineIntent` find the user's own
  enabled automation rule by name keyword and execute its actions
  directly via `executeHueAction`/`executeSpotifyAction` (newly exported
  from `@moodsync/ai` — `executeSpotifyAction` wasn't public before,
  only used internally by `dispatch.ts`), rather than hardcoding what
  "relaxing" means.
- **Dashboard**: a dedicated `AlexaCard` (mirroring the Apple Health
  card's pattern of a bespoke component for a structurally-different
  provider) showing connection status, an honest "linked to this MoodSync
  account" note (Alexa's own profile is never requested), skill status,
  relative last-voice-command time, the full list of voice commands, and
  a 3-step onboarding panel explaining linking always starts from the
  Alexa app, never the dashboard.
- **`scripts/demoAlexaVoiceCommand.mjs`**: since the real signature-verified
  webhook can't be exercised without a live, certified skill (no way to
  obtain a genuine Amazon certificate chain/signature in this sandbox),
  this script instead exercises the complete OAuth-as-authorization-server
  flow for real (authorize → code → token exchange → refresh) and every
  intent handler through a dev-only `demo-intent` route that calls the
  exact same `alexaService.handleIntentRequest` the real webhook uses,
  gated out entirely when `NODE_ENV=production`.
- **Verified for real**: ran the demo script twice against a disposable
  test account (created and deleted, never touching real user data) —
  once against an empty account (confirmed every intent's honest
  "no data yet" / "no matching rule" fallback speech) and once after
  seeding a real biometric reading and an automation rule named "Evening
  Relax Routine" (confirmed `GetStatusIntent` correctly reports the real
  reading, and both `StartRelaxationIntent` and
  `ActivateEveningRoutineIntent` correctly match and execute the same
  rule via its "relax"/"evening" keyword overlap — verified this was the
  intended keyword-matching behavior, not a bug). Confirmed exactly one
  `SmartHomeConnection` row exists after repeated linking (upsert, not
  duplicate) and `lastSyncedAt` updates on each voice interaction.
  Visually verified both the disconnected-onboarding and connected states
  of the new `AlexaCard` in a real browser session. Wrote 28 new unit
  tests for `integrations/alexa` (`verifyRequest.test.ts` includes a full
  positive-path pipeline test against a genuinely-generated synthetic
  X.509 certificate chain and a real RSA-SHA256 signature — not just
  error-path assertions — proving the hand-implemented crypto is
  actually correct, not merely that it throws on bad input). Full
  monorepo build/typecheck/lint/test all pass (81 tests total).

## Fitbit/Google Health: real-account sync bug fixes

- **A real user connected a real Fitbit account through the dashboard
  during this session** (via the ngrok tunnel set up for Alexa testing)
  and reported the sync failing. Diagnosed by decrypting that
  connection's real stored access token and calling Google's API
  directly, bypassing the app entirely, to see Google's actual error
  response — `GoogleHealthClient`'s error handling only captured HTTP
  status codes, not response bodies, so this was the only way to see
  what Google was actually rejecting. Found and fixed **three
  independent, real bugs**, none of which had ever been exercised
  against a live linked account before:
  1. `dailyRollUp`'s request body used a flat
     `{year,month,day,hour,minute,second}` `CivilDateTime` — Google
     rejected this outright (`Unknown name "year" at 'range.start'`).
     The real shape nests a `date` object and an optional `time` object
     with plural field names: `{date:{year,month,day}, time?:{hours,
     minutes,seconds,nanos}}`. This broke **every** dailyRollUp call
     (steps, heart-rate, total-calories) since Milestone 7a.
  2. `listSleep`'s filter used `sleep.start_time`, which Google's API
     doesn't support filtering by at all — sleep can only be filtered
     by *end* time (`sleep.interval.end_time`). Confirmed as a real,
     permanent API constraint via the docs' own filter-field list, not
     a naming bug.
  3. `listDailyRestingHeartRate`'s filter used `dailyRestingHeartRate.date`
     (the response's camelCase field name) instead of the required
     snake_case data-type segment, `daily_resting_heart_rate.date` —
     this project's own research doc already noted the snake_case rule
     but this specific filter wasn't written to follow it.
- Also fixed `GoogleHealthApiError` to capture the response body, not
  just the status code — the exact gap that made this investigation
  need a live out-of-band request in the first place.
- **Verified for real, repeatedly**, against the same real linked
  account, rebuilding and restarting the backend between each fix:
  first reproduced the original failure, then confirmed each fix in
  turn, then confirmed a full successful sync (7 readings inserted,
  including the user's real device — a Fitbit Sense 2 at 2%/Empty
  battery — and real calorie data). Directly confirmed via a raw API
  call that the still-null heart-rate/steps fields are genuinely empty
  on Google's side for this account (`{}` response), not a remaining
  bug. Corrected `docs/INTEGRATIONS_RESEARCH.md`'s prior (wrong)
  request-shape/filter documentation to match. Full monorepo
  build/typecheck/lint/test pass (87 tests).

## Amazfit (Zepp) research — blocked, interface-only

- Researched Zepp Health's real developer platform before writing any
  code, per this project's standing rule. Found a genuine, documented
  OAuth 2.0 API (Huami/Zepp's official `zepp-health/rest-api` GitHub
  wiki — distinct from **Zepp OS**, which is for building on-watch Mini
  Programs, not third-party server data access) with real
  authorization/token endpoints and seven scopes including continuous
  `heartrate` and raw `motion` data.
- **Hard-gated, not self-serve**: the docs explicitly state "Data
  cooperation currently only supports corporate users, not individual
  users," with registration at dev.huami.com requiring a 3-7 day
  business-partnership review — no path to a client ID without an
  approved partnership, a harder blocker than Garmin's (stalled
  program) or Ecobee's (closed registration).
- **Followed the exact existing precedent** for this situation
  (`integrations/garmin`, `integrations/ecobee`): added `amazfit` to
  `WearableProviderId` and the `WearableProvider` Prisma enum (migration
  applied to the real local Postgres), created
  `integrations/amazfit` exporting only `amazfitIntegrationStatus`
  (`not_yet_available`, with the real reason above) — no live client,
  since untested OAuth code for an API we have no way to get credentials
  for is more likely to ship with real bugs than not, which the Fitbit
  fixes above are direct proof of. Recorded the real, confirmed OAuth
  endpoints/scopes in both the package and
  `docs/INTEGRATIONS_RESEARCH.md` so a future partnership can start
  from verified facts, not new research. Wired into the dashboard's
  label map the same minimal way Garmin already is (recognized, no
  card, since there's nothing to connect). Full monorepo
  build/typecheck/lint/test pass.

## Amazfit (Zepp OS) — correction: self-serve via Mini Programs, now available ✅

- **Correction (2026-07-13)**: the research above concluded Amazfit was
  blocked, based on investigating only one of Zepp Health's two separate
  developer products — the corporate-gated "Data Cooperation" REST API.
  A second, unrelated product, **Zepp OS**, is genuinely self-serve (free
  consumer account, no business review) and supports building **Mini
  Programs**: small apps that run on the watch, with an optional
  phone-side **Side Service** that can call arbitrary HTTPS endpoints via
  a documented Fetch API. This is architecturally identical to Apple
  Health — no cloud API exists for a third party to pull a user's
  history, so the answer is a device-side companion, not OAuth.
- Confirmed real sensor APIs against live `docs.zepp.com` reference pages
  and a real official sample Mini Program
  (`zepp-health/zeppos-samples/application/2.0/post-health-data`, fetched
  verbatim): `HeartRate`/`Sleep`/`Step` classes from `@zos/sensor`, the
  `BaseApp`/`BasePage`/`BaseSideService` + plugin pattern from
  `@zeppos/zml`, the Settings API (`settingsStorage`), the Fetch API's
  request shape, and the `AppSettingsPage`/`Button`/`View`/`TextInput`
  Settings App components.
- Flipped `integrations/amazfit`'s `amazfitIntegrationStatus` from
  `not_yet_available` to `available` and built the real Mini Program at
  `zepp/MoodSyncCompanion` (Device App reading sensors, Side Service
  relaying to MoodSync's backend, Settings App for login) — see
  `docs/AMAZFIT_ARCHITECTURE.md` for the full design and
  `zepp/MoodSyncCompanion/README.md` for exactly what was verified
  against real docs/samples versus flagged as unconfirmed (notably: no
  password-masked `TextInput` variant found, and `app.json`'s `appId`/
  `deviceSource` values are placeholders a real registration replaces).
- Added the real backend counterpart,
  `POST /api/integrations/amazfit/ingest` (mirrors Apple Health's
  tokenless-connection ingest pattern exactly — same Zod validation, same
  `app.authenticate` JWT middleware, same repository calls) and the
  dashboard's Amazfit Connections card (mirrors the Apple Health card's
  "no web sign-in, connect from the device" framing).
- **Verified for real, not just compiled**: ran
  `scripts/demoAmazfitSync.mjs` against a live local backend + Postgres
  with a disposable signed-up test account — confirmed a simulated
  sensor snapshot round-trips through the real ingest endpoint, persists
  via `biometricReadingRepository`, and shows up correctly as an
  `ACTIVE` `AMAZFIT` connection from `GET /api/connections`. What's
  **not** verifiable in this sandbox: the Zepp OS runtime itself — the
  Zeus CLI installs but won't run past `--help` here (missing peer
  dependency, then a broken binary symlink after working around it), and
  even a working CLI still needs the proprietary Zepp Simulator (GUI-only)
  or a physical Amazfit device, neither available here. Documented
  honestly in `zepp/MoodSyncCompanion/README.md`, same framing as the
  Apple Health iOS package's Xcode limitation.
- Full monorepo build/typecheck/lint/test pass (78 tests, all packages).
