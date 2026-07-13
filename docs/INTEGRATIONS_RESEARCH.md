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
| **Apple Health** | No server-side API exists at all — architecturally different from every other row here | **Built as a separate native iOS companion app** (`ios/MoodSyncCompanion`), not a backend OAuth integration — see below |

---

### Apple Health — no OAuth flow exists, by design

- **Confirmed directly against Apple's own HealthKit developer docs**:
  there is no public server-side/REST API for a third party to pull a
  user's Apple Health data. Health data lives only on-device; the only
  way to access it is a native app the user installs, which requests
  HealthKit read authorization (`HKHealthStore.requestAuthorization`)
  and reads samples locally (`HKSampleQuery`, `HKStatisticsQuery`,
  category queries for sleep). This is a deliberate Apple privacy design
  choice, not a gap in available documentation.
- **What this means architecturally**: every other integration in this
  document is "web backend performs OAuth against a third-party API."
  Apple Health can't be that — it has to be "a native app the user
  installs reads the data and pushes it to our backend," a different
  component entirely, not a variant of the existing OAuth pattern.
- **Built as `ios/MoodSyncCompanion`** (a SwiftPM package: HealthKit
  reading, a client for this product's own `/api/auth/login` and a new
  `/api/integrations/apple-health/ingest` endpoint, and a one-screen
  SwiftUI view). Authenticates as a normal MoodSync user — logging into
  the same email/password account used on the web — rather than a
  separate device-pairing flow, since there's no OAuth provider to
  delegate identity to.
- **Environment-verified, not just written**: this sandbox has the Swift
  compiler but not full Xcode (`xcodebuild -version` fails with
  "requires Xcode, but active developer directory is a command line
  tools instance"). `swift build`/`swift run` still compile-verify real
  HealthKit API usage by targeting macOS 14 (HealthKit links there too),
  confirmed first against a pre-existing sibling package already in this
  repo (`Packages/MoodSyncCore/Sources/MoodSyncHealthKit`) before writing
  new code against the same proven query shapes. `XCTest` itself isn't
  available in this environment either (same limitation, confirmed
  against that same pre-existing package's test target) — the pure logic
  (sleep efficiency calculation, JSON payload shape) was verified via a
  throwaway executable running the same assertions by hand, then
  deleted; the real, permanent tests live in
  `ios/MoodSyncCompanion/Tests/MoodSyncCompanionTests` for a machine with
  Xcode to run. See `ios/MoodSyncCompanion/README.md` for the complete,
  itemized breakdown of what was and wasn't verifiable here (compiling
  an actual `.app` bundle, the HealthKit entitlement, the real
  permission dialog, and code signing all require Xcode + a paid Apple
  Developer account, none of which exist in this sandbox).
- **`sleepScore`**: HealthKit's `.sleepAnalysis` category has no single
  numeric score, only stage segments (`inBed`/`asleepCore`/`asleepDeep`/
  `asleepREM`/`awake`) — same situation as Google Health. Computed as
  sleep efficiency (asleep ÷ asleep+awake time), the same standard
  metric and the same reasoning as the Fitbit integration's `sleepScore`.

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
  { countSum }, heartRate?: { beatsPerMinuteMin, beatsPerMinuteMax,
  beatsPerMinuteAvg }, totalCalories?: { kcalSum } }] }`. Field casing
  (snake_case in the proto reference → lowerCamelCase in JSON) follows
  protobuf's standard JSON mapping, which is universal across all Google
  APIs, not something specific to this one.
- **Correction (2026-07-12, found via a real "why did Fitbit sync fail"
  investigation against a genuinely linked account, then re-verified
  against the doc's type definition before fixing)**: `CivilDateTime`
  was recorded here (and implemented) as a flat
  `{ year, month, day, hour, minute, second, nanos }` object — that was
  wrong, and broke **every** `dailyRollUp` call outright (steps,
  heart-rate, total-calories all 400'd with `INVALID_ARGUMENT`:
  `Unknown name "year" at 'range.start'`, reproduced live). The real
  shape nests a `google.type.Date` under `date` and an optional
  `google.type.TimeOfDay` under `time`, whose fields are plural
  (`hours`/`minutes`/`seconds`, plus `nanos`):
  `{ date: { year, month, day }, time?: { hours, minutes, seconds, nanos } }`.
  This applies to the response's `civilStartTime`/`civilEndTime` too —
  they nest the same way, not flat. Fixed in
  `integrations/fitbit/src/client.ts`; see its `CivilDateTime` doc
  comment.
- **Correction (2026-07-12, re-verified against a live doc fetch at the
  user's request)**: the `heartRate` rollup field names above were
  originally recorded here as `bpmMin/bpmMax/bpmAvg` — that was wrong.
  The real `HeartRateRollupValue` schema uses the full
  `beatsPerMinuteMin/Max/Avg` names shown above; the shorter names were
  never actually confirmed, just assumed by analogy to the sample type's
  `beatsPerMinute` field. This silently broke heart-rate normalization
  (always `undefined`) since Milestone 7a. `steps`/`total-calories`
  (`countSum`/`kcalSum`) were independently re-confirmed correct.
- **Daily granularity, no rollup needed** (`daily-resting-heart-rate`):
  `GET /v4/users/{user}/dataTypes/daily-resting-heart-rate/dataPoints` —
  each point's `data.dailyRestingHeartRate` is `{ date, beatsPerMinute }`.
- **Individual heart-rate samples** (`heart-rate`, `list` method, not
  `dailyRollUp`): `GET .../dataTypes/heart-rate/dataPoints` — each point's
  `data.heartRate` is `{ sampleTime: ObservationSampleTime, metadata,
  beatsPerMinute: string(int64) }`, where `ObservationSampleTime` is
  `{ physicalTime: Timestamp, utcOffset: Duration, civilTime:
  CivilDateTime }`. Added for Milestone "Fitbit near-live heart rate" so
  the dashboard's "current heart rate" reflects an actual recent sample
  rather than a once-a-day average — see `GoogleHealthClient.listHeartRate`.
- **Sleep** (`sleep`): `GET .../dataTypes/sleep/dataPoints` — each point's
  `data.sleep` is `{ interval: { startTime, endTime, startUtcOffset,
  endUtcOffset, civilStartTime, civilEndTime }, type:
  'CLASSIC'|'STAGES', stages: [{ startTime, endTime, type:
  'AWAKE'|'LIGHT'|'DEEP'|'REM'|'ASLEEP'|'RESTLESS' }], outOfBedSegments,
  metadata, summary: { stagesSummary: [{ type, minutes, count }],
  minutesInSleepPeriod, minutesAfterWakeUp, minutesToFallAsleep,
  minutesAsleep, minutesAwake }, createTime, updateTime }`.
  **Correction (2026-07-12)**: this section originally described the
  shape as `{ startTime, endTime, sleepSummary: { stageSummary: [{
  sleepStageType, totalDuration }] } }` — every one of those field names
  was wrong (`startTime`/`endTime` are nested under `interval`, not
  direct; `sleepSummary`/`stageSummary` don't exist, the real keys are
  `summary`/`stagesSummary`; `sleepStageType`/`totalDuration` are actually
  `type`/`minutes`, and `minutes` is a plain int64-as-string, not a
  protobuf Duration string like `"1800s"`). This silently broke
  `sleepScore` (always `undefined`) since Milestone 7a. **There is no
  single sleep score/efficiency field** in this API (unlike WHOOP's
  `sleep_performance_percentage`), but `summary.minutesAsleep` and
  `summary.minutesInSleepPeriod` are provided directly — `sleepScore` is
  now computed as their ratio (a standard published sleep-medicine
  metric, sleep efficiency) instead of hand-summing stage durations; see
  `integrations/fitbit/src/normalize.ts`.
- **Correction (2026-07-12)**: the `filter` query strings for `list` were
  previously only inferred by pattern (flagged as uncertain below) — a
  live-account spot check, prompted directly by a real sync failure,
  found two of the three were wrong:
  - `listSleep` used `sleep.start_time >= "..."` — Google rejected this
    with `INVALID_DATA_POINT_FILTER_DATA_TYPE_MEMBER`, "Member
    'sleep.start_time' is not supported for filtering." **`sleep` has no
    start-time filter at all** — only end time:
    `sleep.interval.end_time >= "..."` (or `interval.civil_end_time`).
    This is a real, permanent API constraint (confirmed against the
    docs' own filter-field list for this data type), not a syntax bug —
    "sleep sessions since N days ago" now means "sessions that *ended*
    after N days ago," a reasonable proxy but worth knowing about if
    exact semantics ever matter.
  - `listDailyRestingHeartRate` used `dailyRestingHeartRate.date >=
    "..."` (matching the JSON response's camelCase field name) — Google
    rejected this with `INVALID_DATA_POINT_FILTER_DATA_TYPE_RESTRICTION`,
    "Restriction member path segment 'dailyRestingHeartRate' does not
    match any data type." The filter's leading segment must be the data
    type in **snake_case** (`daily_resting_heart_rate`), not the
    response field's camelCase — this project's own docs already noted
    "in a filter parameter... the data type name must be in snake case"
    but this specific filter wasn't actually written that way.
  - `listHeartRate`'s `heart_rate.sample_time.physical_time >= "..."`
    was independently confirmed correct (matches a live doc excerpt
    verbatim) — the one of the three that was right.
  All three fixed in `integrations/fitbit/src/client.ts`. Net effect:
  the Fitbit/Google Health sync had never successfully completed against
  a real linked account before this fix — `dailyRollUp`'s malformed
  request body alone would have failed every sync since Milestone 7a.
- **No push/streaming API for heart rate**: `developers.google.com/health/webhooks`
  exists, but a webhook notification only carries a `dataType` and a time
  interval ("new data landed here") — the actual values still require a
  follow-up `list`/`dailyRollUp` call, and subscribing requires a publicly
  reachable HTTPS endpoint plus a Cloud project number. Not adopted here;
  "near-live" heart rate is achieved instead by polling `listHeartRate` on
  a short (5-minute) worker cadence, which Google's documented per-user
  quota (300 req/min) comfortably supports.
- **`providerUserId`**: not populated for this connection. Google Health
  exposes `users.getProfile`/`users.getIdentity`, but their response
  shapes weren't independently confirmed and the field is optional
  downstream — not worth guessing at for a value nothing depends on.

#### Device name + battery (verified for the production-polish pass)

Confirmed directly against `developers.google.com/health/reference/rest/v4/users.pairedDevices`:

- **Endpoint**: `GET /v4/users/{user}/pairedDevices` → `{ pairedDevices: PairedDevice[], nextPageToken? }`.
- **`PairedDevice` fields**: `deviceType` (`TRACKER`|`SCALE`), `batteryStatus`
  (`High`|`Medium`|`Low`|`Empty`), `batteryLevel` (integer), `deviceVersion`
  (the actual product name, e.g. "Charge 6" — **not** `name`, which is the
  resource path like `users/me/pairedDevices/xyz`), `lastSyncTime`,
  `macAddress`.
- **Required scope**: `googlehealth.settings.readonly` — confirmed via
  this method's own "Authorization scopes" section. This is **not** one
  of the three scopes already requested for biometric data (activity/
  health-metrics/sleep), so it was added as a fourth scope in
  `GOOGLE_HEALTH_SCOPES` rather than assumed to be covered.
- A user can have multiple paired devices (tracker + scale) —
  `pickPrimaryDevice` prefers the tracker, since that's the device that
  actually produces the biometric readings this integration syncs.

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
- **No battery/device endpoint** (verified for the production-polish
  pass, re-confirmed directly against `developer.whoop.com/api/`'s live
  reference): WHOOP's public API exposes exactly eight resource
  categories — Authentication, Activity ID Mapping, Partner, User, Cycle,
  Recovery, Sleep, Workout — none of which expose device battery level or
  status. This is a genuine capability gap in WHOOP's public API, not a
  gap in this integration's implementation; there is nothing to build
  here without an undocumented/partner-only endpoint.

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

### Amazfit (via Zepp) — available via a Zepp OS Mini Program, not a cloud API

**Correction (2026-07-13)**: this section originally concluded Amazfit
was blocked/interface-only, based on researching only one of Zepp
Health's two distinct developer surfaces. That conclusion was wrong —
there is a genuine, self-serve path. Corrected below; the original
(gated) API is still documented since it's real and may be worth
revisiting for its richer scopes if a partnership is ever pursued.

- **Two unrelated Zepp Health developer products exist — don't confuse
  them**:
  1. **The "Data Cooperation" REST API** (`dev.huami.com`,
     `zepp-health/rest-api`) — a real OAuth 2.0 cloud API
     (`https://user.huami.com/oauth/...` authorize,
     `https://auth.huami.com/oauth2/access_token` token exchange,
     scopes `profile`/`activity`/`sleep`/`heartrate`/`motion`/`sport`/
     `sportDetail`, 90-day access / 10-year refresh tokens) — but
     **hard-gated**: *"Data cooperation currently only supports
     corporate users, not individual users,"* with a 3-7 day partnership
     review. No self-serve path to a client ID, same blocked category as
     Garmin/Ecobee. Recorded here in case a partnership is ever pursued
     (richer scopes than WHOOP/Google Health — continuous heart rate,
     raw motion data).
  2. **Zepp OS** (`developer.zepp.com`, `docs.zepp.com`) — a completely
     different, genuinely self-serve platform for building **Mini
     Programs** (small apps that run on the watch itself, plus an
     optional phone-side component). Registration is a free consumer
     Zepp account (email, Google, Facebook, etc. — confirmed via the
     account-creation flow), not a business application. **This is the
     one Apple Health's architecture already anticipates**: no cloud API
     exists for pulling a user's data, so — exactly like HealthKit — the
     only way in is a device-side app the user installs, that reads
     sensors locally and pushes to MoodSync's own backend.
- **Confirmed Zepp OS architecture for this**:
  - **Device App**: the on-watch JavaScript code. Confirmed real sensor
    APIs exist for `HeartRate`, `Sleep`, and `Step` (`hmSensor`/newAPI
    sensor modules, each with its own live doc page) — available from
    API_LEVEL 2.0 for HeartRate/Sleep, no special review needed beyond
    a normal account.
  - **Side Service**: a companion process that runs inside the Zepp
    phone app (no UI) — confirmed via `docs.zepp.com`'s own
    architecture docs. Exposes a `Fetch API`
    (`docs.zepp.com/docs/reference/side-service-api/fetch/`) that can
    issue `fetch({ url, method, headers, body })` requests to an
    **arbitrary external URL** — the documented example POSTs JSON to
    `https://xxx.com/api/xxx`, and no domain allowlist, CORS
    restriction, or URL pre-registration is mentioned anywhere in the
    reference. This is the piece that actually reaches MoodSync's
    backend, mirroring `MoodSyncAPIClient` in the iOS companion app.
  - **Device App ↔ Side Service**: a `Messaging API`
    (`docs.zepp.com/docs/reference/side-service-api/messaging/`) —
    device sends via `messageBuilder.request()`, Side Service receives
    via `.on('call')` (and the reverse for phone-to-watch pushes) — this
    is how a sensor reading collected on the watch gets to the Side
    Service, which then relays it onward via Fetch.
  - **Distribution without app-store review**: `zeus preview` (Zeus
    CLI) generates a QR code installable directly onto a device via the
    Zepp App's "Developer Mode" — confirmed from the CLI's own docs, the
    same category of direct-to-device install Xcode offers for iOS,
    letting a Mini Program be used for real without Zepp's review.
- **What wasn't independently confirmed**: the exact `app.json` keys for
  declaring a Side Service (the fetched doc excerpt didn't include this
  — the Mini Program's manifest was written from the `zeus create`
  project-scaffold structure and the `AppSideService` constructor
  pattern shown in the Side Service intro doc, not a fully-quoted
  manifest schema), and whether `zeus preview`'s Developer Mode install
  has a device-count or time limit (undocumented in what was fetched).
  Both should be spot-checked once real Zeus CLI tooling is run — see
  `docs/AMAZFIT_DEVELOPER_GUIDE.md`.
- **What we do about it**: `integrations/amazfit` now exports
  `amazfitIntegrationStatus` with `availability: 'available'` (matching
  Apple Health's category — connectable without third-party OAuth
  credentials), plus the actual Mini Program in `zepp/MoodSyncCompanion`
  — see `docs/AMAZFIT_ARCHITECTURE.md`. Unlike the Swift/HealthKit case,
  this sandbox has no way to run the real Zepp OS runtime or Simulator
  (a GUI app, and even the Zeus CLI itself failed to run standalone here
  due to a broken peer-dependency in its own package) — same category of
  environment limitation as Xcode's, documented with the same honesty
  about what was and wasn't verifiable.

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
- **Battery**: CLIP v2 does report battery level (0-100%) for
  battery-powered Hue *accessories* — motion sensors, dimmer switches,
  buttons. It does not apply to the `light` resource this integration
  actually syncs (bulbs are mains-powered by definition). Not a gap in
  this integration; there's no battery to display for what it connects.

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
