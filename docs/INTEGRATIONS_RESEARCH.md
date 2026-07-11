# Integration research — verified state as of July 2026

This document is the gate every integration decision in this codebase must
pass through. Nothing in `integrations/` is built against an endpoint,
scope, or SDK that isn't confirmed here against live official documentation.
Where something is uncertain, it's marked uncertain rather than assumed.

## Bottom line for v1 scope

| Platform | Status | v1 plan |
|---|---|---|
| **WHOOP** | Open, self-serve, stable | **Build first** — only fully unblocked wearable |
| **Philips Hue** | Open, self-serve, stable | **Build first** — only fully unblocked smart home platform |
| **Google Health API** (Fitbit's successor) | Self-serve to start, but Restricted scopes require Google security review for production | Build against it now (sandbox/100 test users), but production launch is gated on a real compliance process — see below |
| **Spotify** | Self-serve, but Feb 2026 policy changes cap unapproved apps at 5 users | Build it, but real launch requires 250k+ MAU and a registered business — see below, re-verified for Milestone 8 |
| **Garmin** | Developer program applications are de facto stalled ("Under Construction" for 2+ months, unofficial) | **Blocked.** Define the integration interface, do not build a live client yet |
| **Ecobee** | Developer program explicitly closed to new registrations | **Blocked.** Define the integration interface, do not build a live client yet |
| **Amazon Alexa** | N/A — wrong integration point | **Dropped from the architecture entirely** (see below) |

---

## Wearables

### Fitbit — do not build against this

The legacy Fitbit Web API **sunsets in September 2026**. Building a new
integration against it now would be dead within weeks of shipping. All new
work targets its replacement, the Google Health API, instead.

### Google Health API — the real Fitbit successor

- **What it is**: Google's rebuilt successor to the Fitbit Web API,
  confirmed by Google's own docs and the Fitbit community announcement.
  Both APIs run in parallel until Fitbit's September 2026 sunset.
- **OAuth 2.0**, standard Google flow:
  - Authorization: `https://accounts.google.com/o/oauth2/v2/auth`
  - Token: `https://oauth2.googleapis.com/token`
- **Scopes** are bundle-level, not per-metric, prefixed
  `https://www.googleapis.com/auth/googlehealth.*`:
  - `activity_and_fitness` — heart rate, steps, calories
  - `health_metrics_and_measurements` — resting heart rate
  - `sleep` (`.sleep.readonly`) — sleep stages/score
- **Registration**: self-serve — a Google Cloud Console project with the
  Health API enabled. No upfront approval to start building.
- **Production gate (the important part)**: every scope this API exposes
  is classified **Restricted** by Google. That means before shipping to
  real users beyond a 100-user cap, the app needs (1) OAuth consent screen
  verification by Google Trust & Safety, and (2) an **annual third-party
  CASA security assessment** (Google's standard process for
  restricted-scope apps — same tier as, e.g., financial data access).
  This is a real compliance line item with cost and lead time, not a
  formality — budget for it explicitly rather than discovering it at
  launch.
- **Stability**: not labeled beta, but Google's own docs say the API "is
  actively evolving" with breaking changes possible — treat as pre-GA.
- **Rate limits**: ~1,000 QPS sustained per project, ~5 QPS per user;
  unverified (pre-CASA) apps capped at 100 users total.
- **SDK**: REST-only, no official Node/TS SDK — we write our own typed
  client in `integrations/fitbit` (kept named `fitbit` since that's the
  user-facing product it replaces, but the client targets Google Health
  API endpoints).

#### REST implementation details (verified for Milestone 7a)

Confirmed directly against `developers.google.com/health/*` (scopes,
data-types, and REST/RPC reference pages) and the live Discovery document
at `https://health.googleapis.com/$discovery/rest?version=v4`:

- **Base URL**: `https://health.googleapis.com`
- **Resource path**: `users/{user}/dataTypes/{dataType}/dataPoints`,
  `{dataType}` is kebab-case. Confirmed IDs used here: `heart-rate`,
  `daily-resting-heart-rate`, `sleep`, `steps`, `total-calories`.
- **Aggregation** (`steps`, `heart-rate`, `total-calories`): `POST
  /v4/users/{user}/dataTypes/{dataType}/dataPoints:dailyRollUp` with body
  `{ range: { start: CivilDateTime, end: CivilDateTime }, windowSizeDays }`.
  Response: `{ rollupDataPoints: [{ civilStartTime, civilEndTime, steps?:
  { countSum }, heartRate?: { bpmMin, bpmMax, bpmAvg }, totalCalories?:
  { kcalSum } }] }`. `CivilDateTime` is `{ year, month, day, hour, minute,
  second, nanos }`. Field casing (snake_case in the proto reference →
  lowerCamelCase in JSON) follows protobuf's standard JSON mapping, which
  is universal across all Google APIs, not something specific to this one.
- **Daily granularity, no rollup needed** (`daily-resting-heart-rate`):
  `GET /v4/users/{user}/dataTypes/daily-resting-heart-rate/dataPoints` —
  each point's `data.dailyRestingHeartRate` is `{ date, beatsPerMinute }`.
- **Sleep** (`sleep`): `GET .../dataTypes/sleep/dataPoints` — each point's
  `data.sleep` is `{ startTime, endTime, duration, sleepType,
  sleepStages[], sleepSummary: { stageSummary: [{ sleepStageType:
  'AWAKE'|'LIGHT'|'DEEP'|'REM', totalDuration }] }, ... }`. **There is no
  single sleep score/efficiency field** in this API (unlike WHOOP's
  `sleep_performance_percentage`) — `sleepScore` is computed here as
  sleep efficiency (`1 - awakeDuration/totalDuration`, ×100), a standard
  published sleep-medicine metric, not an invented one; see
  `integrations/fitbit/src/normalize.ts`.
- **Uncertain, flagged rather than assumed**: the exact `filter` query
  string field path for `list` requests on `daily-resting-heart-rate` and
  `sleep` (only one worked filter example was found in the docs, for
  `exercise`: `exercise.interval.civil_start_time >= "..."`). This
  integration follows that same `{dataType}.{field} {op} {value}` pattern
  by inference — worth a live-sandbox-account spot check before trusting
  non-default page sizes or tight date windows in production, same
  caveat style as WHOOP's pagination note above.
- **`providerUserId`**: not populated for this connection. Google Health
  exposes `users.getProfile`/`users.getIdentity`, but their response
  shapes weren't independently confirmed and the field is optional
  downstream — not worth guessing at for a value nothing depends on.

### WHOOP — build this first

- **Registration**: self-serve at developer.whoop.com, free. Requires the
  developer to hold an active WHOOP membership. No business approval gate
  found for basic developer platform access.
- **OAuth 2.0**:
  - Authorization: `https://api.prod.whoop.com/oauth/oauth2/auth`
  - Token: `https://api.prod.whoop.com/oauth/oauth2/token`
  - PKCE not documented as required.
- **Scopes**: `read:recovery` (recovery score, HRV, resting HR),
  `read:sleep` (stages, performance %), `read:cycles` (strain, avg HR),
  `read:workout`, `read:profile`, `read:body_measurement`.
- **Rate limits**: 100 requests/minute, 10,000/day per API client.
- **Data**: recovery score (WHOOP's flagship proprietary metric), sleep
  stages/performance, HRV, resting HR, strain (their activity/exertion
  analog). No traditional step count, no discrete "stress score."
- **SDK**: REST-only.
- **Open item**: no formally documented App Review/production-approval
  gate was found distinct from sandbox access — confirm current commercial
  ToS terms directly with WHOOP before scaling past a beta cohort.

### Garmin — blocked, interface-only for now

- **Correct product**: the **Garmin Connect Developer Program / Health
  API** (a business partnership program) — not the Garmin FIT SDK, which
  is an unrelated product for parsing local `.FIT` device files.
- **Current status**: applications are de facto stalled. The program's
  application page has displayed "Under Construction" for at least ~2
  months as of this research, confirmed by a Garmin employee on Garmin's
  own developer forum who said the team is "working on the website."
  Garmin has not issued an official freeze announcement — this is
  unofficial-but-corroborated, not a documented policy.
- **What we do about it**: `integrations/garmin` defines the
  `WearableProvider` interface (see `shared/src/wearables.ts`) and ships a
  `NotYetAvailableGarminClient` that throws a clear, typed error — so the
  rest of the codebase (decision engine, dashboard) can already model
  "user selected Garmin" without a live connection existing yet. When
  Garmin's program reopens, this becomes a real implementation, not a new
  integration point.
- **For reference when it reopens**: business-use only (not
  individual/hobbyist), targets Corporate Wellness / Population Health /
  Patient Monitoring verticals, some metrics behind additional licensing
  fees. Native metrics include Body Battery (their recovery-score analog)
  and a native stress score — richer than WHOOP/Google Health on paper,
  worth revisiting once the program is confirmed open again.

### Normalized wearable data model

Every provider (present or future) maps into one shape
(`shared/src/wearables.ts`):

```ts
interface NormalizedBiometricReading {
  provider: 'whoop' | 'google_health' | 'garmin';
  userId: string;
  timestamp: string; // ISO 8601
  heartRate?: number;
  restingHeartRate?: number;
  sleepScore?: number;      // 0-100, provider-normalized
  recoveryScore?: number;   // 0-100; WHOOP-native, no Google Health equivalent
  stressLevel?: number;     // 0-100; no WHOOP or Google Health equivalent today
  activityLevel?: number;   // 0-100, normalized from steps/strain/whatever the provider has
  steps?: number;
  calories?: number;
}
```

Every field beyond `provider`/`userId`/`timestamp` is optional by design —
no provider exposes all of them, and the decision engine (see
`ai/README.md`) is required to handle partial data rather than assume a
field exists.

---

## Smart home / media platforms

### Amazon Alexa — dropped from the architecture

Alexa Smart Home Skills let *your own* device cloud expose control to
Alexa for voice commands — they do not let a third-party SaaS reach into
a user's *existing* Alexa-linked Hue or Ecobee devices. There is no Alexa
API for "call this endpoint to change a user's already-linked light."
Building an Alexa Smart Home Skill would mean pretending to be a device
manufacturer, which doesn't fit MoodSync's actual job (orchestrating
platforms the user already owns). **We integrate directly with Hue and
Spotify instead; Alexa is not part of the v1 or v2 architecture.**

### Philips Hue — build this first

- **Correct API for a cloud SaaS**: the **Hue Remote API**
  (`api.meethue.com`) — not the local bridge API, which only works on the
  same LAN as the bridge and can't serve users across many different
  homes.
- **Registration**: self-serve at developers.meethue.com — register an
  app (client ID/secret + callback URL), no paid tier found.
- **OAuth**: v2 OAuth2 endpoints (the v1 OAuth2 endpoint was deprecated in
  2020). Standard authorization-code flow. PKCE requirement unconfirmed —
  verify at implementation time rather than assuming either way.
- **Rate limits**: 50,000 calls/24hr per app; client-side limits ~12
  calls/sec overall, `setLightState` 10/sec, group `setState` 1/sec.
- **Certification**: no formal certification gate found beyond app
  registration — lighter-weight than Alexa or Spotify. Not independently
  confirmed whether there's a review step before scaling past a handful of
  users; flag for direct confirmation with Signify/Hue developer support
  before a large launch.
- **Capabilities**: brightness, color, scenes, warm/cool color temperature
  — all confirmed available via the Remote API's light/group/scene
  resources.

### Spotify — build it, but real launch needs approval

- **Registration**: self-serve at developer.spotify.com/dashboard.
- **February 2026 policy change** (verified from Spotify's own blog,
  TechCrunch's coverage, and the current `quota-modes` reference page):
  new Development Mode apps are capped at **5 authorized users** (down
  from 25), require the app owner's account to hold Spotify Premium
  (enforced starting March 9, 2026), and unapproved users get a 403 on
  every request until allowlisted. This is a hard cap, not a soft
  warning.
- **Production gate, re-verified for Milestone 8 — corrected from the
  Milestone 1 research pass**: Extended Quota Mode is not merely a
  "discretionary content review." As of Spotify's May 2025 policy change,
  eligibility requires **all** of: a legally registered business entity
  (applications from individuals are no longer accepted), an active and
  already-launched service, **at least 250,000 monthly active users**,
  availability in key Spotify markets, and commercial viability. Review
  is a 4-step dashboard questionnaire and can take **up to six weeks**.
  **This is a materially higher bar than originally documented** — a
  quarter-million MAU requirement means MoodSync has no realistic path to
  Extended Quota Mode until well past an initial beta, not just "budget
  timeline risk." Development Mode's 5-user cap is the real ceiling for
  the foreseeable future.
- **Playback mechanism**: triggering playback from our backend uses the
  Web API's `/me/player/play` (Spotify Connect control), which requires
  (a) the target user already has an active Spotify session open
  somewhere, and (b) **Spotify Premium** — free-tier users cannot have
  playback started remotely by a third party. This is a hard product
  constraint to surface in onboarding, not an edge case.
- **Scopes**: `user-modify-playback-state`, `user-read-playback-state`,
  `playlist-read-private`.
- **Rate limits**: rolling 30-second window, 429 on excess; numeric
  ceiling isn't published and differs materially between Development Mode
  and Extended Quota Mode.

#### REST implementation details (verified for Milestone 8a)

Confirmed directly against developer.spotify.com's "Authorization Code
Flow," "Refreshing tokens," "Scopes," and "Start/Resume Playback"
reference pages:

- **OAuth endpoints**: authorize at `https://accounts.spotify.com/authorize`,
  token exchange/refresh at `https://accounts.spotify.com/api/token`.
- **Token exchange auth is a genuine deviation from every other provider
  in this codebase**: Spotify's documented Authorization Code Flow
  authenticates via an `Authorization: Basic base64(client_id:client_secret)`
  header on the token request, not `client_id`/`client_secret` as body
  form fields (which is what WHOOP/Hue/Google Health all use). PKCE is
  deliberately **not** used for this provider — Spotify documents PKCE as
  a separate flow for clients that can't hold a secret, authenticated via
  `client_id` in the body instead of Basic Auth, and nothing in Spotify's
  docs confirms the two can be combined. See
  `integrations/spotify/src/oauth.ts` for the full reasoning.
- **Refresh response**: a new `refresh_token` is not guaranteed on every
  refresh call — Spotify's own docs say to keep using the existing one
  when absent. Handled the same way as every other provider's refresh
  logic in this codebase.
- **Playback**: `PUT https://api.spotify.com/v1/me/player/play` with an
  optional `?device_id=` query param (targets the user's active device if
  omitted) and a JSON body `{ context_uri }` for playlist/album/artist
  playback. Confirmed response codes: 204 success, 401 unauthorized, 403
  forbidden (most often `PREMIUM_REQUIRED`), 429 rate limited. The exact
  error-body `reason` enum (e.g. `NO_ACTIVE_DEVICE`) wasn't independently
  confirmed, so errors are surfaced as-is rather than parsed into a typed
  reason.

### Ecobee — blocked, interface-only for now

Ecobee's developer registration page explicitly states: *"Sorry, we are
not currently accepting new developer registrations at this time."* This
is a hard, explicit block (unlike Garmin's unofficial stall) — confirmed
directly from ecobee.com/en-us/developers. There is no self-serve path to
a client ID today. `integrations/ecobee` mirrors the Garmin pattern: a
typed interface and a `NotYetAvailableEcobeeClient`, with a documented
path to request partner access directly from Ecobee business development
if/when that becomes a priority.

---

## What this means for the milestone plan

Milestone sequencing (`docs/MILESTONES.md`) follows directly from this
research: WHOOP and Hue are the only two integrations that can be built
and demoed end-to-end without waiting on a third party. Google Health API
and Spotify are worth building now (the code has real value even gated
behind a review process), but neither is "done" until its respective
compliance/approval step is separately tracked and completed — that's
called out explicitly as its own milestone item, not bundled silently
into "integration complete."
