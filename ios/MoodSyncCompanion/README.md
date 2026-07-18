# MoodSyncCompanion

The iOS companion app for Apple Health. **Apple Health has no server-side
API or OAuth flow** (confirmed against Apple's own HealthKit developer
docs) — HealthKit data only ever leaves a device through a native app the
user installs, which reads it locally and pushes it to a backend itself.
This package is that app's logic: it exists specifically so MoodSync can
support Apple Health at all, not as an alternative to the OAuth-based
integrations (WHOOP, Fitbit, Hue, Spotify).

See [docs/APPLE_HEALTH_ARCHITECTURE.md](../../docs/APPLE_HEALTH_ARCHITECTURE.md)
for the full system design (auth flow, data flow, security model, sync
strategy, privacy, and exactly which HealthKit metrics are/aren't
available — verified against live `developer.apple.com` documentation),
[docs/GEOFENCING_ARCHITECTURE.md](../../docs/GEOFENCING_ARCHITECTURE.md)
for the CoreLocation-based arrival/departure design, and
[docs/IOS_REAL_DEVICE_SETUP_GUIDE.md](../../docs/IOS_REAL_DEVICE_SETUP_GUIDE.md)
for the step-by-step Apple Developer account/Xcode/device setup required
to actually run this on a physical iPhone from a completely cold start.

## Metrics read

Heart rate, resting heart rate, heart rate variability (SDNN), respiratory
rate, blood oxygen (SpO2), steps, active calories, sleep stages, and the
recording device's name (via `HKDevice`). Workout authorization is
requested but workout *data* isn't synced yet — see the architecture
doc's §11 for why. There is no device battery field: HealthKit's
`HKDevice` has no battery property at all, confirmed against Apple's own
reference — this is a permanent platform gap, not a bug.

## Architecture

- `MoodSyncCompanion` (library target): HealthKit authorization/reading
  (`HealthKitReader`, including background delivery via `HKObserverQuery`
  + `enableBackgroundDelivery`), HomeKit scene activation
  (`HomeKitController`), CoreLocation geofencing (`LocationController`),
  the networking client (`MoodSyncAPIClient`), persisted server
  configuration (`ServerConfiguration`), and the pure orchestration logic
  (`SyncCoordinator`, `DeviceCommandCoordinator`) — all behind protocols
  (`HealthKitReading`, `HomeKitControlling`, `LocationControlling`,
  `MoodSyncAPIClientProtocol`) so the coordinators are unit-testable
  without HealthKit, HomeKit, CoreLocation, or the network.
- `MoodSyncCompanionUI` (library target): `OnboardingView` (first-launch
  Server URL entry + Health/Location/HomeKit permission requests, each
  explained before the system prompt appears) and `MoodSyncCompanionView`
  (login + sync + "set home" for geofencing). Deliberately minimal beyond
  that — this app's only job is getting HealthKit data into the backend
  and pushing location/HomeKit events, not a second product surface.
- `MoodSyncCompanionTests`: unit tests for the pure logic
  (`SleepEfficiencyCalculator`, `ActivityLevel`, `ServerConfiguration`,
  `SyncCoordinator`/`DeviceCommandCoordinator` against fakes of their
  dependencies).

Authentication reuses the same MoodSync account as the web app —
`POST /api/auth/login` with the user's existing email/password — rather
than a separate device pairing flow, since there's no OAuth provider to
delegate to. Data flows to `POST /api/integrations/apple-health/ingest`,
authenticated with the same Bearer JWT every other authenticated backend
route uses.

## What was verified in this environment, and what wasn't

Real Xcode (not just the Command Line Tools) is installed in this
environment as of the real-device-readiness round — see
`ios/MoodSyncCompanionApp/README.md` for the CLI-invocation gotcha
encountered getting `xcodebuild` to succeed, and
`docs/IOS_REAL_DEVICE_SETUP_GUIDE.md` for everything that still requires
hardware/an Apple Developer account this environment doesn't have.

**Verified for real:**
- `swift build`/`swift test` pass for the whole package, including real
  HealthKit/HomeKit/CoreLocation API usage — 23 `XCTest` cases, all
  genuinely executed (not stubbed).
- The `MoodSyncCompanionApp.xcodeproj` wrapper (see
  `ios/MoodSyncCompanionApp/`) builds a real, code-signed `.app` bundle
  for the iOS Simulator via `xcodebuild`, with the HealthKit, HomeKit,
  and location entitlements/`Info.plist` keys all processing correctly.
- Every HealthKit/HomeKit entitlement key and the `NSAllowsLocalNetworking`
  ATS exception were independently re-confirmed against live
  `developer.apple.com` documentation during the real-device-readiness
  round (not carried over from an earlier session) — see
  `docs/IOS_REAL_DEVICE_SETUP_GUIDE.md`'s citations.
- The backend endpoints this app talks to were verified separately, for
  real, against a live local Postgres — see `docs/MILESTONES.md`.

**Not verifiable without a physical iPhone + a paid Apple Developer
Program account** (this environment has neither):
- The app actually launching, requesting permissions, and having a
  human tap through the real system prompts.
- Geofencing actually firing on a real region crossing — the Simulator
  can simulate a location but not a genuine boundary-crossing event with
  the ~20s debounce/~10s wake window `docs/GEOFENCING_ARCHITECTURE.md`
  describes; only a physical device exercises that.
- Background HealthKit delivery / geofence delivery after the app has
  been backgrounded or the device rebooted — again, real hardware and
  time, not something the Simulator reproduces faithfully.
- Code signing with a real Team ID/provisioning profile — `DEVELOPMENT_TEAM`
  is empty in `project.yml`, which only works for Simulator builds.

See `docs/IOS_REAL_DEVICE_SETUP_GUIDE.md` for exactly what to do about
all of the above on your own Mac/iPhone.
