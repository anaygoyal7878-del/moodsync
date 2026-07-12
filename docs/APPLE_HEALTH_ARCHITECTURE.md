# Apple Health Integration — Architecture

This document is the full design for MoodSync's Apple Health integration.
Everything under "Confirmed against Apple's documentation" below was
verified against `developer.apple.com` during this design pass (not
carried over from memory or an earlier session) — see the inline citations.
Anything not independently confirmable through available tooling is
labeled "uncertain" rather than asserted.

## 1. Why this integration looks different from every other provider

Every other MoodSync wearable integration (WHOOP, Google Health/Fitbit) is
OAuth 2.0 against a REST API MoodSync's backend calls directly. **Apple
Health has no such API.** HealthKit is an on-device framework — data never
leaves the device except through an app the user has installed, which
reads it locally via `HKHealthStore` and chooses to send it somewhere.
There is no "Apple Health API key," no server-to-server call MoodSync's
backend can make, and no OAuth authorization URL to redirect to. This is
confirmed by the complete absence of any server-side/REST surface in
Apple's HealthKit documentation — the entire framework is described in
terms of on-device `HKHealthStore` queries, not network calls.

Consequence: **the only way MoodSync supports Apple Health at all is a
native companion app** (`ios/MoodSyncCompanion`) that the user installs,
which reads HealthKit locally and pushes normalized readings to
MoodSync's existing backend over HTTPS, authenticated the same way the
web app is.

## 2. System architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                              iPhone / Apple Watch                     │
│                                                                         │
│  ┌───────────────┐      ┌──────────────────┐      ┌────────────────┐ │
│  │  Health app /  │─────▶│   HKHealthStore    │◀────│ MoodSyncCompanion│ │
│  │  other health  │      │  (system-owned,    │      │  (this app)     │ │
│  │  data sources  │      │   on-device store)  │      │                 │ │
│  │ (Watch sensors,│      └──────────────────┘      │ ┌─────────────┐ │ │
│  │  connected     │              ▲                    │ │HealthKitReader│ │
│  │  devices)      │              │ read-only          │ └──────┬──────┘ │
│  └───────────────┘              │ (authorized         │        │        │
│                                   │  per data type)     │ ┌──────▼──────┐ │
│                                   └─────────────────────┼─│SyncCoordinator│ │
│                                                          │ └──────┬──────┘ │
│                                                          │        │        │
│                                                          │ ┌──────▼──────┐ │
│                                                          │ │MoodSyncAPI  │ │
│                                                          │ │Client       │ │
│                                                          │ └──────┬──────┘ │
│                                                          └────────┼────────┘
└───────────────────────────────────────────────────────────────────┼─────────┘
                                                                      │ HTTPS
                                                                      │ (Bearer JWT,
                                                                      │  same session
                                                                      │  as web app)
                                                                      ▼
                                          ┌───────────────────────────────────┐
                                          │         MoodSync backend            │
                                          │                                      │
                                          │  POST /api/auth/login               │
                                          │  POST /api/integrations/            │
                                          │       apple-health/ingest           │
                                          │  DELETE /api/integrations/          │
                                          │       apple-health                  │
                                          │                                      │
                                          │  → wearableConnectionRepository      │
                                          │    (tokenless connection record)     │
                                          │  → biometricReadingRepository        │
                                          │    (same table every provider uses)  │
                                          │  → dispatchForReading()              │
                                          │    (same automation engine every     │
                                          │     provider triggers)               │
                                          └───────────────────────────────────┘
                                                          │
                                                          ▼
                                          ┌───────────────────────────────────┐
                                          │   PostgreSQL (biometric_readings,   │
                                          │   wearable_connections — shared     │
                                          │   tables, provider = APPLE_HEALTH)  │
                                          └───────────────────────────────────┘
```

Everything below the "HTTPS" line is **identical** to every other
provider — same tables, same repository, same automation dispatch. The
only thing genuinely unique to Apple Health is everything above that
line: an entire native app, because there's no alternative.

## 3. Authentication flow

Apple Health has no OAuth authorization server to redirect to, so there's
nothing to "connect" in the OAuth sense. Instead:

1. User opens the MoodSyncCompanion iOS app for the first time.
2. App shows a login screen — the **same email/password** the user
   already uses on the MoodSync web app (`POST /api/auth/login`, the
   identical endpoint and credential set, not a separate device-pairing
   flow or a new account).
3. Backend returns the same access/refresh JWT pair the web app gets.
4. App requests HealthKit authorization (`HKHealthStore.requestAuthorization`)
   for a fixed, read-only set of data types (see §6).
5. App calls `HealthKitReader.readCurrentSnapshot()`, builds a
   `NormalizedReading`, and `POST`s it to
   `/api/integrations/apple-health/ingest` with `Authorization: Bearer
   <accessToken>` — the same header shape every other authenticated
   backend route expects.
6. Backend's `upsertTokenlessConnection(userId, 'APPLE_HEALTH')` creates
   (or re-activates) a `WearableConnection` row with `oauthTokenId: null`
   — there's no OAuth token to store, so the column that holds it for
   every other provider is simply left null. This is why
   `WearableConnection.oauthTokenId` is nullable specifically.

There is no refresh-token flow for HealthKit access itself (the OS
authorization persists until the user revokes it in Settings — see §9),
but the app's own JWT session still needs the standard refresh-token
rotation every MoodSync client uses; the companion app stores both
tokens and refreshes the access token the same way the web app's
Route Handlers do.

## 4. Data flow

Two distinct triggers push data from HealthKit to MoodSync:

**A. Foreground, user-initiated sync** (implemented today): user taps
"Sync now" in the companion app. `SyncCoordinator.sync()` requests
HealthKit authorization (a no-op if already granted), reads one snapshot
across every authorized data type, and posts it. This always works and
requires no special entitlement beyond HealthKit itself.

**B. Background sync** (architecture defined here, requires a real
Xcode project + provisioning to build — see §7 and the Developer Guide):
`HKObserverQuery` + `HKHealthStore.enableBackgroundDelivery(for:frequency:)`
registers the app to be woken by the system when HealthKit records new
data for a watched type. Per Apple's documentation this is **not a push
notification and not guaranteed-immediate** — the system decides when to
launch the app based on battery, network, and how "important" it judges
the update frequency requested (`.immediate` / `.hourly` / `.daily`).
When woken, the observer's completion handler runs a sync identical to
path A, then calls `HKObserverQuery`'s completion handler (required, or
the system stops delivering updates to that observer). This needs the
**Background Modes → Background fetch / Background processing**
capability in addition to HealthKit itself.

There is **no true real-time streaming API** in HealthKit for historical
health data — the closest thing, `HKLiveWorkoutBuilder`, only streams
data *during an active workout session the app itself starts*, which is
a different feature (live workout tracking) from background sync of
data recorded by other apps/the Watch. MoodSync doesn't need
in-workout live tracking, so this isn't part of the design — "near-live"
here means observer-query-triggered background sync, at whatever
cadence the system grants, same honest framing already used for
Fitbit's 5-minute-poll "near-live" heart rate.

## 5. Security model

- **Read-only, always.** `requestAuthorization(toShare: [], read: ...)`
  — MoodSync never writes to HealthKit, for any type, matching the
  read-only stance of every other provider in this product.
- **No credentials stored on-device beyond the standard JWT pair** the
  companion app already needs to talk to the backend — there's no
  separate "HealthKit API key" because none exists.
- **Transport**: HTTPS to the same backend origin the web app uses; in
  production this is the same TLS-terminated origin, no separate
  infrastructure.
- **Server-side**: the ingest endpoint is `preHandler: app.authenticate`
  — the exact same JWT-verification middleware guarding every other
  authenticated route. `userId` is derived from the verified JWT, never
  trusted from the request body — the client cannot assert a different
  user's identity, same invariant as every other sync path in this
  codebase.
- **App Review / data-use restriction** (confirmed against Apple's App
  Store Review Guidelines): data obtained via HealthKit "may not be used
  for advertising or other use-based data mining purposes other than
  improving health management, or for the purpose of health research,"
  and may not be shared with third parties for marketing/advertising.
  MoodSync's use (driving the user's own home-automation rules) is
  squarely "improving health management" for the user themselves — no
  data is sold, shared with ad networks, or used for anything but the
  automation this same user configured. Worth stating explicitly in the
  App Review notes when submitting.

## 6. Data types read, and what's actually available

Every identifier below is a real, currently-documented HealthKit type —
confirmed against `developer.apple.com/documentation/healthkit` pages
for each identifier, not assumed from an earlier project's code.

| Metric | HealthKit identifier | Kind | Status |
|---|---|---|---|
| Heart rate | `HKQuantityTypeIdentifier.heartRate` | Quantity (sample) | ✅ Implemented |
| Resting heart rate | `.restingHeartRate` | Quantity (sample) | ✅ Implemented |
| Heart rate variability (SDNN) | `.heartRateVariabilitySDNN` | Quantity (sample) | ✅ Implemented this round |
| Respiratory rate | `.respiratoryRate` | Quantity (sample) | ✅ Implemented this round |
| Blood oxygen (SpO2) | `.oxygenSaturation` | Quantity (sample) | ⚠️ Implemented this round, with a real caveat — see below |
| Steps | `.stepCount` | Quantity (cumulative) | ✅ Implemented |
| Active energy burned | `.activeEnergyBurned` | Quantity (cumulative) | ✅ Implemented |
| Sleep analysis (stages) | `HKCategoryTypeIdentifier.sleepAnalysis`, values `.asleepCore/.asleepDeep/.asleepREM/.awake/.inBed` (iOS 16+ stage granularity) | Category (interval samples) | ✅ Implemented |
| Workouts | `HKWorkoutType`, `HKWorkoutActivityType` | Sample (session) | ⚠️ Authorization requested this round; **not yet synced as data** — see §11 |
| Device info (name/model) | `HKDevice` (on each sample's `.device`) | Metadata on samples | ✅ Implemented this round (name/model only) |
| **Battery level/status** | — | — | ❌ **Does not exist.** Confirmed: `HKDevice`'s full property list is `name`, `manufacturer`, `model`, `hardwareVersion`, `firmwareVersion`, `softwareVersion`, `localIdentifier`, `udiDeviceIdentifier` — no battery field anywhere. This is a genuine, permanent platform gap, not a bug: HealthKit has no battery API for paired devices at all. (Contrast with Google Health's `pairedDevices`, which does expose battery — see `docs/INTEGRATIONS_RESEARCH.md`.) The Connections card must not claim to show Apple Health battery. |

### The blood oxygen caveat (a real, currently-relevant platform limitation)

`oxygenSaturation` is a real, documented HealthKit quantity type. But as
of this design pass, its *availability on US Apple Watch hardware* has
had an unusual recent history: Apple disabled the Blood Oxygen sensor on
US-sold Apple Watch Series 9/Ultra 2/10 in January 2024 following an ITC
import ban tied to Masimo patent litigation, then restored a modified
version in August 2025 that processes the sensor data on a paired
**iPhone** rather than the Watch. Litigation over this feature is
ongoing (a further jury verdict against Apple landed in November 2025).
**Whether third-party apps (via HealthKit) can read the resulting
`oxygenSaturation` samples on affected US devices, versus that data
being kept Health-app-exclusive, was not confirmable from available
documentation during this pass** — this is flagged as genuinely
uncertain rather than guessed at. Practically: MoodSync's code requests
the type and handles an absent/empty result gracefully (same as any
user who simply doesn't own a blood-oxygen-capable device or has never
granted the permission) — no special-casing needed, but don't promise
users blood oxygen will always be there.

## 7. Background sync strategy

- **Capability required**: Background Modes → "Background fetch" (for
  `enableBackgroundDelivery`/`HKObserverQuery` to wake the app) — added
  in Xcode's Signing & Capabilities, alongside the HealthKit capability.
- **Registration**: on successful login/first sync, register an
  `HKObserverQuery` per watched sample type, then call
  `enableBackgroundDelivery(for:frequency: .immediate, ...)` for the
  types where near-live matters most (heart rate), and `.hourly` for
  lower-urgency types (steps, sleep) to be a better background-battery
  citizen.
- **Not guaranteed-immediate** — the OS throttles background wake-ups
  based on battery/usage patterns. This is documented Apple behavior,
  not a MoodSync limitation; the honest framing in the UI is "near-live,"
  same language already used for Fitbit's 5-minute-poll heart rate.
  Realistic expectation: seconds to low minutes when the phone is
  actively in use / on charge / on a strong network; can lag longer
  under aggressive Low Power Mode.
  the app is force-quit (as opposed to merely backgrounded) most iOS
  background delivery is suspended until next relaunch — this is a
  system-wide iOS constraint, not specific to HealthKit.
- **watchOS**: `enableBackgroundDelivery` behaves similarly on watchOS,
  but a standalone watchOS companion target is out of scope for this
  round — the iPhone app is the source of truth, and syncs whatever
  HealthKit has already aggregated from the Watch (Watch data flows into
  the shared HealthKit store automatically when the two devices are
  paired; MoodSync doesn't need its own watch app to see Watch-recorded
  heart rate, since HealthKit unifies Watch + iPhone + third-party
  sources into one store).

## 8. Error handling

- **HealthKit unavailable** (`HKHealthStore.isHealthDataAvailable()`
  false — e.g. iPad without a paired Watch/health context in some
  configurations): surfaced to the user as a clear, non-technical
  message; the app does not crash or retry indefinitely.
- **Authorization denied**: HealthKit deliberately never tells an app
  which specific read permissions a user denied (confirmed Apple
  privacy-by-design behavior) — a denied type simply returns empty
  results forever, indistinguishable from "user has no data of this
  type." The app cannot detect this and must not claim it can; the UI
  instead shows, per data type, whether a *value was returned this sync*
  (see §12's "permission status" design, which is honest about this
  limitation rather than pretending to know true grant/deny state).
- **Network/API errors**: `MoodSyncAPIError` distinguishes
  `notAuthenticated` (401 → force re-login) from `requestFailed` (any
  other status, surfaced with the status code) — already implemented in
  `MoodSyncAPIClient`.
- **Partial data**: a sync with some metrics present and others `nil` is
  a success, not a failure — every field on `NormalizedReading` is
  optional and the backend's Zod schema accepts partial readings, same
  pattern as every other provider.
- **Backend-side**: the ingest endpoint validates with Zod and returns
  `400` with the flattened validation errors on malformed input, `401`
  via the shared auth middleware on a missing/expired JWT — no
  Apple-Health-specific error handling needed server-side beyond what
  every other authenticated route already has.

## 9. Privacy considerations

- **Read-only** (§5) — reinforced here because it's the single most
  important privacy commitment for a HealthKit integration specifically.
- **Revocation is entirely user-controlled outside the app**: iOS lets a
  user revoke HealthKit permissions per-type at any time via Settings →
  Privacy & Security → Health → MoodSyncCompanion, with zero involvement
  from MoodSync's code. The next sync simply returns less data — nothing
  to build for this, but it's worth documenting so "disconnect" in the
  MoodSync dashboard is understood as *only* affecting the
  `WearableConnection` record server-side, not the underlying HealthKit
  grant (a user who wants to fully revoke HealthKit access must also do
  it in iOS Settings — this asymmetry should be stated in the
  Connections card's disconnect confirmation, a UI gap noted in §12).
- **No HealthKit data is ever written**, so there's no risk of MoodSync
  corrupting or duplicating entries in the user's actual Health record.
- **App Review data-use restriction** — see §5.
- **Required disclosure**: `NSHealthShareUsageDescription` in
  `Info.plist` is not just a formality — HealthKit refuses to even show
  the permission dialog without it, so the string must accurately
  describe MoodSync's actual use ("used to trigger your home automation
  rules based on your heart rate, sleep, and activity").

## 10. On-device vs. server-side split

| Responsibility | Runs on |
|---|---|
| Reading raw HealthKit samples | Device only (HealthKit is not queryable remotely) |
| Requesting/holding HealthKit authorization | Device only |
| Normalizing raw samples → `NormalizedReading` (unit conversion, sleep-efficiency calculation, activity-level scaling) | Device (mirrors what `integrations/fitbit/src/normalize.ts` does server-side for Google Health — Apple Health's equivalent normalization has to happen client-side since the server never sees raw samples) |
| Authenticating the MoodSync session (login, token storage/refresh) | Device (companion app) issues the request; backend issues/verifies |
| Storing readings, automation dispatch, insights, trend computation | Server (identical code path to every other provider — `biometricReadingRepository`, `dispatchForReading`, `ai/src/insights.ts`) |
| Connection status, last-synced timestamp | Server (`WearableConnection` row) |
| Background wake scheduling | Device (`HKObserverQuery`/`enableBackgroundDelivery`), but the *decision of when* is the OS's, not the app's |

## 11. Explicit scope decisions / deferred work

- **Workouts**: authorization is requested (so a future round doesn't
  need a new permission prompt), but individual `HKWorkout` sessions are
  not yet synced as their own records. Reason: every other metric in
  this product maps onto one row-per-timestamp in `biometric_readings`;
  a workout is a *session* (start, end, type, duration, energy) that
  doesn't fit that shape without a new table, which is a larger schema
  decision than this round's scope. Flagged here rather than silently
  dropped.
- **watchOS-native companion target**: not built. Not needed for data
  access (§7), but would be needed for on-wrist UI (e.g. "sync now" from
  the wrist) — explicitly out of scope.
- **Blood oxygen on affected US hardware**: see §6's caveat — handled
  gracefully (absent data, not an error) but not specially messaged.

## 12. UI/dashboard implications (implemented this round)

The Connections card's Apple Health entry needs to show more than
"Connected / Not connected," because "connected" here means something
different than for OAuth providers (see §3) — there's no ongoing token
to expire, so the interesting states are about *data freshness* and
*what the last sync actually captured*, not authorization status in the
OAuth sense. See §14 and the implementation in
`frontend/src/components/dashboard/ConnectionsSection.tsx` for exactly
what's shown; the design principle is: never claim to know HealthKit
grant/deny state (§8 explains why that's impossible), only report what
the last real sync actually returned.

## 13. Summary: what's genuinely new here vs. every other integration

| | OAuth providers (WHOOP, Google Health) | Apple Health |
|---|---|---|
| Where auth happens | Provider's web login, redirected back | MoodSync's own login, reused |
| What's stored server-side | Encrypted OAuth token | Nothing beyond a connection record (no token exists) |
| Who initiates sync | MoodSync's `workers` (scheduled, server-side) | The device itself (companion app, foreground or background) |
| Data normalization | Server-side (`integrations/*/normalize.ts`) | **Device-side** (Swift, mirroring the same logic) |
| "Disconnect" semantics | Revoke token, stop polling | Mark connection revoked server-side; HealthKit grant itself only revocable in iOS Settings |
