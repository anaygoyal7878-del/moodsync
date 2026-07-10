# Replacing simulated data with real Apple HealthKit

This document is the concrete answer to "what changes when this stops being
a prototype." The short version: **one file changes** at the architecture
level — everything downstream of `HealthDataSource` is untouched, because
the interface was designed around HealthKit's actual data model from the
start (see `src/types/domain.ts`).

## The seam

```ts
// src/health/HealthDataSource.ts
export interface HealthDataSource {
  connect(): Promise<void>;
  disconnect(): void;
  getStatus(): ConnectionStatus;
  subscribe(listener: (sample: BiometricSample) => void): () => void;
}
```

`SimulatedHealthDataSource` is the only class that implements this today.
Nothing else in the app — the engine, the store, every component — imports
`SimulatedHealthDataSource` directly; they only ever see `HealthDataSource`
and `BiometricSample`. Swapping the implementation is a one-line change in
`src/store/useAppStore.ts`:

```diff
- const healthDataSource = new SimulatedHealthDataSource();
+ const healthDataSource = new HealthKitBridgeDataSource();
```

## Why a web app can't call HealthKit directly

HealthKit is an on-device iOS/watchOS framework with no web API — a browser
tab fundamentally cannot request `HKHealthStore` authorization or read
samples. There are two real ways this migration actually happens, and this
prototype's architecture supports either without further changes:

1. **Native app is the real product.** This is the actual plan per the
   existing `MoodSyncCore` Swift package (see `Packages/MoodSyncCore`),
   which already has a working `HealthMetricSnapshotBuilder` using real
   `HKHealthStore` queries. The web prototype's `BiometricSample` type was
   deliberately shaped to match what that Swift code already produces, so
   porting the wellness engine and scent library from
   `web/src/engine` + `web/src/data` into the native app (or generating one
   from the other) is a translation exercise, not a redesign.
2. **A native companion app relays data to this web app.** If a browser-based
   version needs to stay in the loop, a small iOS app would read HealthKit,
   summarize it (never raw samples — see the privacy note below), and post
   `BiometricSample`-shaped JSON to a backend the web app polls or
   subscribes to over WebSocket. `HealthKitBridgeDataSource` in that case
   would be a thin WebSocket/polling client implementing the same
   `HealthDataSource` interface, sourced from that backend instead of a
   local timer.

Either path, `assessWellness`, `recommendScent`, the Zustand store, and
every React component are unaffected.

## Field-by-field mapping

`BiometricSample`'s fields were named to mirror HealthKit's own vocabulary
so this mapping is close to 1:1:

| `BiometricSample` field | HealthKit source |
|---|---|
| `heartRate` | `HKQuantityTypeIdentifier.heartRate` (most recent sample) |
| `restingHeartRate` | `HKQuantityTypeIdentifier.restingHeartRate` |
| `hrv` | `HKQuantityTypeIdentifier.heartRateVariabilitySDNN` |
| `respiratoryRate` | `HKQuantityTypeIdentifier.respiratoryRate` |
| `sleepStage` | `HKCategoryTypeIdentifier.sleepAnalysis` (mapped from `HKCategoryValueSleepAnalysis`) |
| `isMindfulSessionActive` | `HKCategoryTypeIdentifier.mindfulSession` (an active/recent sample) |
| `steps` | `HKQuantityTypeIdentifier.stepCount`, summed over a rolling window |

This is exactly the set of types `HealthKitTypeMapping.swift` in
`Packages/MoodSyncCore/Sources/MoodSyncHealthKit` already requests
authorization for.

## What a real `HealthKitBridgeDataSource` needs to do differently

- **Request authorization once**, not simulate a delay — `connect()` calls
  `HKHealthStore.requestAuthorization` (or, for the relay pattern above, the
  native app does this and the web client just waits for the backend to
  report a connected state).
- **Respect partial authorization.** HealthKit never tells an app which
  specific types a user denied. `deriveFeatures()` in
  `engine/features.ts` already treats any missing field as absent rather
  than assuming a default — this matters more with real HealthKit data,
  where gaps are the norm, not the exception.
- **Never forward raw samples off-device** if this becomes a networked
  product. The native `MoodSyncCore` backend design (`supabase/migrations`)
  stores only consented daily aggregates (`health_summaries`), never raw
  HealthKit rows — the same privacy posture should hold for any web-facing
  version of this product.
- **Background delivery** (`HKObserverQuery` + `enableBackgroundDelivery`)
  is a native-only concept; a web client can't do this itself and would
  rely on the native companion app's background delivery to keep the relay
  backend's data fresh.

## What does *not* need to change

- `engine/config.ts` (the wellness state weights) — same inputs, same model.
- `data/scentLibrary.ts` (the evidence-based scent data) — this is
  fully platform-independent.
- Every component in `components/dashboard`, `components/library`,
  `components/onboarding` — they render off the store, not off the data
  source.
- The Zustand store's shape — only the constructor call for
  `healthDataSource` changes.
