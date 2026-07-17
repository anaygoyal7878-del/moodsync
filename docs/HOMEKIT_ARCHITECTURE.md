# Apple HomeKit — Architecture

Real constraints below were verified via live web search against Apple's
own developer documentation and developer-forum threads before writing
this — see the citations inline. Where a detail couldn't be independently
re-confirmed from a live source this round, it's flagged rather than
asserted.

## 1. Why this looks like Apple Health, not Hue/Spotify

HomeKit has **no cloud/REST API at all** — unlike Hue or Spotify, there is
no OAuth flow, no server MoodSync's backend can call directly. The only
way to read or control HomeKit accessories is Apple's native `HomeKit`
framework, running inside an app on the user's own device. This is
architecturally identical to Apple Health: a device-side companion, not a
server-side integration.

Two further real constraints (not assumptions) shape this design:

- **Third-party apps can only trigger pre-configured Scenes** (`HMActionSet`)
  — never control individual accessories directly the way Apple's own
  Home app can, and never query arbitrary accessory state either.
- **Background control (without the app open) requires a special
  entitlement Apple grants case-by-case** via Developer Technical Support
  request — not available by default the way HealthKit's background
  delivery is. Without it, HomeKit control only works while the
  companion app is open/foregrounded.

Net effect: MoodSync's backend can *decide* an automation should activate
a HomeKit scene, but it can't *execute* that decision itself — it has to
queue the decision and wait for the companion app to pick it up.

## 2. System architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         MoodSync backend                          │
│                                                                     │
│  ai/src/dispatch.ts: a matched rule has a homekit.activate_scene   │
│  action → can't execute server-side → writes a PendingDeviceCommand│
│  (status: PENDING) instead of calling an action executor           │
└──────────────────────────────┬──────────────────────────────────┘
                                  │ GET /api/devices/pending-commands
                                  │ (polled on app open/foreground)
┌──────────────────────────────▼──────────────────────────────────┐
│                    iOS companion app (when opened)                 │
│                                                                     │
│  DeviceCommandCoordinator.run() → for each pending command:        │
│    HomeKitController.activateScene(named: params.sceneName)        │
│      → HMHomeManager → HMHome.executeActionSet(_:completionHandler:)│
│    → reports outcome back                                          │
└──────────────────────────────┬──────────────────────────────────┘
                                  │ POST /api/devices/pending-commands/:id/complete
                                  ▼
                    ┌──────────────────────────────┐
                    │      MoodSync backend          │
                    │  pendingDeviceCommandRepository │
                    │    .markCompleted(EXECUTED|FAILED)│
                    └──────────────────────────────┘
```

This is the exact inverse of Apple Health's data flow: there, the device
*pushes* sensor data up (`POST /api/integrations/apple-health/ingest`);
here, the device *pulls* pending commands down. Both exist because
neither HealthKit nor HomeKit has a cloud API — the device is
unavoidably the only place either can run.

## 3. Data model

`PendingDeviceCommand` (`database/prisma/schema.prisma`): `id, userId,
provider, action (Json — an AutomationAction), ruleId?, status
(PENDING|EXECUTED|FAILED), failureReason?, createdAt, completedAt?`.

`AutomationExecutionLog.outcome` gained `QUEUED_FOR_DEVICE` — distinct
from `EXECUTED` because dispatch genuinely doesn't know whether the
scene activation succeeded yet at the moment it queues it; that's only
known once the app reports back.

## 4. The one action type: `homekit.activate_scene`

`shared/src/automation.ts`'s `ActionType` gained `homekit.activate_scene`,
with `params: { sceneName: string }` — the scene name must exactly match
one the user has already created in Apple's Home app (MoodSync cannot
create scenes on the user's behalf; only activate existing ones, per §1's
constraint). `RuleForm`'s action picker and `docs/DECISION_ENGINE_ARCHITECTURE.md`'s
template list should be extended to surface this once a UI for
listing/selecting the user's real scene names is built (today, a user
configuring a `homekit.activate_scene` rule must type the scene name
manually) — see `docs/DECISION_ENGINE_ROADMAP.md`.

## 5. iOS companion app (`ios/MoodSyncCompanion`)

New files, compiled and unit-tested (real `swift build`/`swift test` this
session, not hand-verified — see §7):

- `HomeKitController.swift` — `HomeKitControlling` protocol (same
  protocol-seam pattern as `HealthKitReading`) + a real
  `HMHomeManager`-backed implementation behind `#if canImport(HomeKit)`.
  `listSceneNames()` returns the primary home's `HMActionSet` names;
  `activateScene(named:)` finds the matching action set and calls
  `HMHome.executeActionSet(_:completionHandler:)`.
- `PendingDeviceCommand.swift` — mirrors the backend's JSON shape,
  including a minimal `JSONValue` decoder for `params`' untyped
  `Record<string, unknown>` shape.
- `DeviceCommandCoordinator.swift` — orchestrates one poll cycle: fetch
  pending commands, execute each via `HomeKitController`, report the
  outcome. Mirrors `SyncCoordinator`'s structure and testability
  approach (fakes of both dependencies, no real HomeKit/network needed
  to test the orchestration logic).
- `MoodSyncAPIClient` gained `fetchPendingDeviceCommands` and
  `completePendingDeviceCommand`, plus a `get` helper (previously the
  client only had `post`).

**What's confirmed vs. flagged** (same honesty framing as
`ios/MoodSyncCompanion/README.md`'s Apple Health section):

- **Confirmed real, this session**: `HMHomeManager`/`HMHome`/`HMActionSet`
  exist as real HomeKit framework types (framework compiles and links on
  macOS 14 in this sandbox — `swift build`/`swift test` both passed, 17
  tests including 5 new HomeKit-coordinator tests, all real XCTest runs
  now that this session has actual Xcode installed, not just Command
  Line Tools). The scene-only / no-background-by-default constraints in
  §1 are confirmed via live web search against **developer.apple.com**
  and Apple developer-forum threads.
- **Flagged, not independently re-confirmed this round**: the exact
  signature of `HMHome.executeActionSet(_:completionHandler:)` — Apple's
  HomeKit reference pages are a JS-rendered SPA this session's fetch
  tool couldn't execute, returning only page titles. The signature used
  (`(HMActionSet, @escaping (Error?) -> Void) -> Void`) matches HomeKit's
  long-stable, well-established Objective-C-bridged completion-handler
  convention, but should be cross-checked against Xcode's own
  autocomplete/the real SDK headers before shipping to a real device.
- **Not verifiable in this sandbox at all**: running against a real
  HomeKit home with real accessories — the iOS Simulator has no HomeKit
  hub/accessories of its own, so `HMHomeManager.homes` would be empty
  even in a real Simulator run. The full Xcode app (with the new
  `com.apple.developer.homekit` entitlement) does build and code-sign
  successfully for the Simulator this session, confirming the code
  compiles and links correctly — but exercising real scene activation
  needs a physical device with Home app data.

## 6. Security & privacy

- **Read-only in spirit, activate-only in practice** — MoodSync's
  companion app never modifies HomeKit configuration (no creating/
  editing scenes or accessories), only activates scenes the user already
  built themselves.
- **No new credentials** — HomeKit access is governed by the device's own
  iCloud/Home membership and the app's entitlement, not a MoodSync-issued
  token. The polling endpoints (`GET/POST /api/devices/pending-commands*`)
  use the same Bearer-JWT auth as every other authenticated route.
  `pendingDeviceCommandRepository`'s `markCompleted` enforces `userId`
  ownership at the query level, same pattern as every other repository.
- **Revocation**: disabling the automation rule or deleting the
  `homekit.activate_scene` action stops new commands from being queued;
  revoking the HomeKit permission in iOS Settings stops the app from
  activating anything, independent of MoodSync's own state — same
  asymmetry already documented for Apple Health/Alexa.

## 7. What's deferred / explicitly out of scope this round

- **Scene-name picker UI** — today a user must type the exact scene name
  into a rule's `params.sceneName`; a real picker would call
  `listSceneNames()` and let them choose from a list. Deferred pending a
  device to actually enumerate real scenes against.
- **Background/silent activation** — requires Apple's special
  entitlement (request-based, not guaranteed); this round only supports
  activation while the app is open, which the notification engine
  should frame honestly in its copy ("queued — open the MoodSync app to
  activate this scene") once that UI copy is written.
- **Physical-device verification** — see §5; this round is
  compile-and-unit-test verified, not verified against a real HomeKit
  home.
