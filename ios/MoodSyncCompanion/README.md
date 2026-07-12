# MoodSyncCompanion

The iOS companion app for Apple Health. **Apple Health has no server-side
API or OAuth flow** (confirmed against Apple's own HealthKit developer
docs) — HealthKit data only ever leaves a device through a native app the
user installs, which reads it locally and pushes it to a backend itself.
This package is that app's logic: it exists specifically so MoodSync can
support Apple Health at all, not as an alternative to the OAuth-based
integrations (WHOOP, Fitbit, Hue, Spotify).

## Architecture

- `MoodSyncCompanion` (library target): HealthKit authorization/reading
  (`HealthKitReader`), the networking client (`MoodSyncAPIClient`), and
  the pure orchestration logic (`SyncCoordinator`) — all behind protocols
  (`HealthKitReading`, `MoodSyncAPIClientProtocol`) so the coordinator is
  unit-testable without HealthKit or the network.
- `MoodSyncCompanionUI` (library target): the one-screen SwiftUI view
  (login + sync). Deliberately minimal — this app's only job is getting
  HealthKit data into the backend, not a second product surface.
- `MoodSyncCompanionTests`: unit tests for the pure logic
  (`SleepEfficiencyCalculator`, `ActivityLevel`, `SyncCoordinator` against
  fakes of both dependencies).

Authentication reuses the same MoodSync account as the web app —
`POST /api/auth/login` with the user's existing email/password — rather
than a separate device pairing flow, since there's no OAuth provider to
delegate to. Data flows to `POST /api/integrations/apple-health/ingest`,
authenticated with the same Bearer JWT every other authenticated backend
route uses.

## What was verified in this environment, and what wasn't

This repo's sandbox has the Swift compiler (`swift build`/`swift run`)
but not full Xcode — confirmed via `xcodebuild -version` failing with
"requires Xcode, but active developer directory is a command line tools
instance." That draws a hard, honest line:

**Verified for real:**
- Every file in this package compiles, including real HealthKit API
  usage (`HKHealthStore`, `HKSampleQuery`, `HKStatisticsQuery`,
  `HKCategoryValueSleepAnalysis`) — targeting macOS 14 lets `swift build`
  link against HealthKit without an iOS SDK. (A sibling package already
  in this repo, `Packages/MoodSyncCore/Sources/MoodSyncHealthKit`, proved
  this pattern compiles first; this package's HealthKit code mirrors its
  verified query shapes rather than guessing at the API.)
- The pure logic is correct, not just compiling: `XCTest` itself isn't
  available here either (same "requires Xcode" limitation, confirmed by
  running the *pre-existing* `MoodSyncCoreTests` target and hitting the
  identical `no such module 'Testing'` error) — so before removing it,
  a throwaway executable target ran the same assertions as the real
  `Tests/MoodSyncCompanionTests/` files by hand and confirmed all of them
  pass, including that a `NormalizedReading` round-trips through JSON
  into exactly the field names/shape
  `backend/src/api/routes/integrations/appleHealth.ts`'s Zod schema
  expects.
- The backend endpoint this app talks to was verified separately, for
  real, against a live local Postgres — see `docs/MILESTONES.md`.

**Not verifiable without Xcode + a real Apple Developer account:**
- Compiling this into an actual `.app` bundle (SwiftPM library targets
  aren't an installable app on their own — that needs an Xcode project
  or `.iOSApplication` product wrapping these targets).
- Running on a simulator or device, or the real HealthKit permission
  dialog appearing.
- The HealthKit capability/entitlement, which must be added in Xcode's
  "Signing & Capabilities" and requires a paid Apple Developer account to
  provision for a real device.
- `Info.plist` usage-description strings (required by iOS at runtime,
  not by the Swift compiler) — see below for the exact keys needed when
  this is wrapped into a real Xcode project.

## Required when wrapping this into an Xcode project

- **Info.plist**: `NSHealthShareUsageDescription` (HealthKit refuses to
  even show the permission prompt without this key set to a real
  string).
- **Entitlements**: the `com.apple.developer.healthkit` capability,
  added via Xcode's Signing & Capabilities tab, which also requires an
  Apple Developer Program account for device provisioning.
- **Info.plist / config**: the backend's base URL (`MoodSyncAPIClient`'s
  `baseURL` parameter) — points at `http://localhost:3000` for local
  development against the same backend the web app's `.env.local` uses,
  a real deployed URL for TestFlight/production.
