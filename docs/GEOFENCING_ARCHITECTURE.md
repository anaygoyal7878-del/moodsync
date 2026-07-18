# Travel/Away-Mode (Geofencing) — Architecture

Real constraints below verified via live web search against Apple's own
CoreLocation documentation and developer-community sources before
writing any Swift or Info.plist — see citations inline. This is what
finally makes the `arrival-intelligence` demo scenario (`/demo`) a real,
buildable rule instead of a concept.

## 1. Why this looks like HealthKit/HomeKit, not Hue/Spotify

Same shape as `docs/HOMEKIT_ARCHITECTURE.md`/`docs/APPLE_HEALTH_ARCHITECTURE.md`:
there is no cloud/REST API for a user's real-time location — the only
way to detect "arrived home" / "left home" is Apple's native
`CoreLocation` framework running inside the iOS companion app
(`ios/MoodSyncCompanion`) on the user's own device. The backend can't
poll for this; the device has to tell the backend when it happens.

## 2. Real CoreLocation constraints (confirmed)

- **20-region limit**: Core Location caps the number of regions a single
  app can monitor simultaneously at 20
  ([developer.apple.com/.../monitoring-the-user-s-proximity-to-geographic-regions](https://developer.apple.com/documentation/corelocation/monitoring-the-user-s-proximity-to-geographic-regions)).
  Not a real constraint for v1 — MoodSync only needs one region ("home"),
  set once by the user in the companion app.
- **Radius**: must not exceed
  `CLLocationManager.maximumRegionMonitoringDistance`; Apple recommends
  a geofence radius around 100 meters for reliable detection (same
  source). MoodSync's "home" region uses a 100m `CLCircularRegion`
  radius as the default, not an invented smaller/larger number.
- **Two required `Info.plist` keys, not one**
  ([developer.apple.com/.../nslocationalwaysandwheninuseusagedescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationalwaysandwheninuseusagedescription),
  [.../nslocationwheninuseusagedescription](https://developer.apple.com/documentation/bundleresources/information-property-list/nslocationwheninuseusagedescription)):
  `NSLocationWhenInUseUsageDescription` alone only covers
  foreground/background-while-open use. Region monitoring needs to keep
  working when the app isn't open at all (arriving home with the app
  closed is the entire point), which requires the **Always**
  authorization tier — `NSLocationAlwaysAndWhenInUseUsageDescription`
  must also be present, and the app must call
  `requestAlwaysAuthorization()` (not just `requestWhenInUseAuthorization()`).
- **`UIBackgroundModes: location` is required**, not optional, for
  region-crossing events to actually relaunch/wake a terminated or
  suspended app — without it, the app may still get "launched" after a
  device reboot but boundary-crossing notifications won't reliably
  deliver until the user manually opens the app at least once
  (community-corroborated; see `docs/HOMEKIT_ARCHITECTURE.md`'s citation
  conventions for how this project treats non-Apple-official but
  developer-forum-corroborated findings — flagged as such here too,
  not asserted as official Apple documentation).
- **Real detection latency, not instant**: iOS debounces region
  transitions — the user's location must cross the boundary, move away
  by a minimum distance, and stay there for roughly 20 seconds before
  Apple reports the crossing, to avoid spurious triggers from GPS noise
  near the boundary. A "just arrived home" automation firing within
  ~20-30 seconds of actual arrival, not instantly, is the honest
  behavior to design and message around — not a bug to "fix."
  iOS also only wakes the app for about 10 seconds to handle the event,
  so the companion app's handler must be fast (queue-and-return, not a
  long-running network retry loop).

## 3. System architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    iOS companion (background)                     │
│                                                                     │
│  LocationController.swift: one CLCircularRegion ("home"), radius   │
│  100m, set once by the user in MoodSyncCompanionView.swift.        │
│  On CLLocationManagerDelegate's didEnterRegion/didExitRegion        │
│  (~10s wake window) → pushes a single event to the backend.         │
└───────────────────────────────┬────────────────────────────────────┘
                                 │ POST /api/location-events
                                 │ { type: ARRIVED | DEPARTED, occurredAt }
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                         MoodSync backend                          │
│  Persists a LocationEvent row, then calls                          │
│  ai/src/dispatch.ts's dispatchForLocationEvent(userId, event) —    │
│  a separate entry point from dispatchForReading, since a location   │
│  event isn't a biometric reading and shouldn't be shoehorned into   │
│  one. Matches rules by a new AutomationRuleDefinition.locationTrigger │
│  ('ARRIVED' | 'DEPARTED') field, executes actions through the same  │
│  existing action-executor registry (ai/src/actionExecutors.ts) —    │
│  no new action types needed, a location-triggered rule uses the     │
│  exact same hue/spotify/homekit actions a biometric-triggered rule  │
│  does.                                                              │
└──────────────────────────────────────────────────────────────────┘
```

**Push, not poll** — unlike `DeviceCommandCoordinator.swift`'s
poll-the-backend-for-pending-commands model (right for HomeKit, since
that's the backend deciding something needs to happen and waiting for
the device to notice), a geofence transition is an OS-delivered
callback on the device — the device knows *first*, so it pushes,
matching `SyncCoordinator.swift`'s existing push-up model for HealthKit
data.

## 4. What this does NOT do

- No continuous location tracking or trail history — only two boolean
  events per boundary crossing (arrived, departed), consistent with
  `PendingDeviceCommand`'s narrow, single-purpose shape elsewhere in
  this codebase. No `LocationEvent` row ever stores a raw coordinate.
- No multi-region support in v1 (only "home") — the 20-region ceiling
  means this could grow later (e.g. "work," a specific gym), but that's
  new UI (a region picker/map) and new plumbing, not implied by this
  round.
- No fallback for a user who denies "Always" location access — the rule
  simply never fires for that user, same "absence, not failure" pattern
  as every other optional capability in this product (e.g. a user who
  never connects a wearable just sees empty biometric sections, not an
  error).
