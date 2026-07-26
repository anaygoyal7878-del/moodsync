# Apple Home Scenes — Intelligent Wellness Layer Architecture

## 0. Read this first

This is the expanded architecture built on top of the minimal HomeKit
integration described in `docs/HOMEKIT_ARCHITECTURE.md` (still the
canonical doc for the base "activate one scene" mechanics). This one
covers the full "MoodSync recommends/predicts/triggers Apple Home
Scenes" layer: Home/Room/Zone/Accessory/Scene enumeration, a cached
snapshot the backend can serve, a Scene Manager, Room View, Device
Management, Home Safety (with a disabled-by-default security-control
toggle), AI scene recommendations, and scene-usage analytics.

**Scope, locked in before this was built:**
- **No camera feature at all.** `HMCameraProfile`/`HMCameraStreamControl`
  let a third-party app embed a system-rendered live camera view, but
  never capture/store/screenshot the actual frames — a real constraint,
  but this build doesn't even attempt a status-only camera card. Camera
  category accessories are filtered out of the snapshot entirely at the
  source (`HomeKitController.fetchHomeSnapshot()`), not just hidden in
  the UI.
- **Security accessories (locks/garage/alarm) are read-only status by
  default, with the control code path built but gated behind a
  disabled-by-default toggle** (`UserPreferences.securityControlEnabled`).
  Nothing in this codebase can ever control a lock/garage/alarm unless a
  user explicitly flips that toggle on — see §5.
- **Apple Home owns device control. MoodSync owns intelligence.**
  MoodSync never hardcodes a raw device command (`hue.set_brightness`-
  style granularity for HomeKit does not exist here at all) — every
  HomeKit-side action is a named Scene, run via `homekit.run_scene`/
  `homekit.activate_scene`, same as the base architecture.

## 1. Why this can't run on the backend

Identical reasoning to `docs/HOMEKIT_ARCHITECTURE.md §1` — HomeKit has
no cloud API, only the native framework running on-device. Everything
here is an extension of the same "device pushes/pulls, backend
caches/queues" shape, applied to a much larger surface (full enumeration
instead of just scene names).

## 2. Sourcing/confidence per capability

| Capability | Confidence | Notes |
|---|---|---|
| `HMAccessory` metadata (name, room, reachability, firmware, manufacturer/model/serial via "Accessory Information" service) | **Confirmed** — live web search this session | Real, public, third-party-readable. Used for Device Management and battery/offline alerts. |
| Matter accessories are ordinary `HMAccessory` objects | **Confirmed** — live web search this session | No separate "Matter detection" API exists. `HomeSnapshot.isMatterHome` always reads `false` — an honest placeholder, not fabricated detection logic. |
| Scene activation (`HMActionSet`/`executeActionSet`) | **Confirmed** — pre-existing, see `docs/HOMEKIT_ARCHITECTURE.md` | Unchanged; `homekit.run_scene` reuses it. |
| `HMRoom`/`HMZone` enumeration | **High confidence, not independently re-verified this session** | Long-stable, widely-documented HomeKit API; same confidence tier as `HMHomeManager` itself. |
| Security-system/lock/garage-door characteristic reads (`HMCharacteristicTypeCurrentLockMechanismState`, `HMCharacteristicTypeCurrentDoorState`, `HMCharacteristicTypeCurrentSecuritySystemState`) | **Not independently confirmed this session** | Treated as "probably works like other characteristic reads," wrapped in individual try/catch so one unreadable characteristic doesn't fail the whole snapshot. If wrong, `statusValue` just stays `null` — a safe failure mode. |
| Security-accessory **control** (lock/unlock, arm/disarm, open/close) | **Not built at all** | `homekit.security_control` is defined end-to-end in the schema/dispatch/queue plumbing and gated behind `securityControlEnabled`, but the iOS companion's `DeviceCommandCoordinator` deliberately throws "not implemented" for it — no real HomeKit write code exists yet. See §5. |
| Camera APIs (`HMCameraProfile`) | **Out of scope, not researched further** | Explicit product decision — see §0. |
| `swift build` on this sandbox's macOS | **HomeKit does NOT exist on macOS** — confirmed this session | Unlike CoreBluetooth (which does exist on macOS and lets `HueBLEController.swift` be genuinely compile-verified), `import HomeKit` fails to resolve entirely on macOS. Every line inside `HomeKitController.swift`'s `#if canImport(HomeKit)` block — including all of `fetchHomeSnapshot()` — is **never compiled or type-checked in this sandbox**, only hand-written against the documented API. This is a stricter caveat than anything else in this codebase; it needs a real Xcode/iOS build to even confirm it compiles. |

## 3. System architecture

```
iOS: MoodSyncCompanionView.sync()
  → HealthKit push (existing)
  → checkPendingDeviceCommands() (existing: homekit.activate_scene, hue_ble.*)
  → pushHomeSnapshot()  ← NEW
      HomeKitController.fetchHomeSnapshot()
        → enumerates home.rooms / .zones / .accessories / .actionSets
        → filters out camera/video-doorbell accessories entirely
        → reads each accessory's "Accessory Information" service +
          battery + (best-effort) safety-category status characteristic
      → POST /api/home/snapshot

Backend: POST /home/snapshot (backend/src/api/routes/home.ts)
  → homeSnapshotRepository.upsertSnapshot()
      replaces HomeSnapshot + all child rows (rooms/zones/accessories/
      scenes) wholesale in one transaction, carrying forward each
      scene's isFavorite/lastRunAt/runCount by matching on sceneId

Frontend: GET /api/home → GET /home
  → LuxuryHome.tsx renders Home Dashboard, Scene Manager, Room View,
    Home Safety (+ security-control toggle), Device Management from
    this one cached snapshot

Scene run (manual button or accepted AI recommendation):
  POST /home/scenes/:id/run  or  POST /recommendations/:id/accept (kind: run-scene)
  → pendingDeviceCommandRepository.create({ type: 'homekit.run_scene', ... })
  → optimistic runCount/lastRunAt bump
  → iOS companion picks it up next `checkPendingDeviceCommands()` poll,
    routes to the same `homeKit.activateScene(named:)` call
    `homekit.activate_scene` uses

Security control (only if UserPreferences.securityControlEnabled = true):
  a homekit.security_control action reaches ai/src/actionExecutors.ts's
  homekit executor → checked against securityControlEnabled →
  refused (SKIPPED_SECURITY_CONTROL_DISABLED) unless the user has
  explicitly turned the toggle on. Even then, the iOS companion's
  DeviceCommandCoordinator has no real write implementation for this
  action type — it throws "not implemented" — so no path exists today
  by which this codebase could actually unlock/lock/arm/disarm anything,
  toggle or not. The toggle exists so enabling it later needs no further
  backend/schema work, not because control is live.
```

## 4. Data model

`HomeSnapshot` (1 per user, unique on `userId`) with four child tables
(`HomeRoomSnapshot`, `HomeZoneSnapshot`, `HomeAccessorySnapshot`,
`HomeSceneSnapshot`), all replaced wholesale on every push — see
`database/prisma/schema.prisma`. No incremental diffing: HomeKit gives
no cheap way to know "what changed since last sync" from a third-party
app, so every push is a full re-enumeration.

`HomeAccessoryCategory` deliberately maps HomeKit's real category types
to a small fixed enum (`LOCK`, `GARAGE_DOOR`, `ALARM_SYSTEM`,
`SMOKE_DETECTOR`, `LEAK_SENSOR`, `WINDOW_COVERING`, `DOORBELL`,
`OUTLET_OR_SWITCH`, `LIGHT`, `THERMOSTAT_OR_SENSOR`, `OTHER`) — video
doorbell/camera categories are never mapped at all (filtered out before
they'd need a category).

## 5. Security-control gating — the actual safety chain

Three independent layers, not just one flag:

1. **`UserPreferences.securityControlEnabled`** — schema default `false`.
   Nothing sets this to `true` except an explicit user action on the
   Home Safety toggle (`PATCH /api/preferences/security-control`).
2. **`ai/src/actionExecutors.ts`'s `homekit` executor** — checks this
   flag before ever writing a `PendingDeviceCommand` for a
   `homekit.security_control` action. If disabled, the action is
   refused outright (never queued), and `ai/src/dispatch.ts` records
   `SKIPPED_SECURITY_CONTROL_DISABLED` on the rule's execution log.
3. **iOS `DeviceCommandCoordinator`** — even if a `homekit.security_control`
   command somehow reached the queue (it can't, per #2, but this is
   belt-and-suspenders), the companion app throws
   `"Security-accessory control is not implemented on this device"`
   rather than attempting anything. There is no HomeKit write code for
   locks/garage/alarms anywhere in this codebase.

Flipping the toggle on today would not unlock any real control — it
would just stop layer #2 from refusing the (still-nonexistent) write in
layer #3. This is intentional: the plumbing exists so a future round can
add the real lock/garage/alarm write calls to `HomeKitController.swift`
without touching schema, dispatch, or the toggle itself.

## 6. Known real-world limitations

- **Snapshot staleness.** The cached Home/Room/Accessory/Scene data only
  reflects the state as of the last time the companion app was opened
  and synced — same staleness caveat as every other device-polled/pushed
  system in this app (HomeKit scenes, Bluetooth Hue, Apple Health).
- **Scene "icon"/"gradient"/"artwork" is MoodSync's own presentation, not
  real HomeKit data.** HomeKit doesn't expose scene icons or artwork to
  third-party apps — the Scene Manager's gradient is a deterministic
  hash of the scene name into a small fixed palette, documented as such
  in `LuxurySceneManager`'s (`LuxuryHome.tsx`) inline comments, not
  presented as if Apple Home provided it.
- **"Current scene per room" doesn't exist as a real HomeKit concept.**
  Not built — Room View shows temperature/humidity/air-quality/device
  count per room, not a fabricated "active scene" guess.
- **Scene creation is instructional, not remote.** MoodSync cannot create
  an `HMActionSet` remotely (no cloud API) — the guided "create a scene"
  UI referenced in the product spec would need to be an instructional
  walkthrough pointing the user at Apple's own Home app, not a real
  scene-creation API call. (Not built this round — flagged here as a
  known gap between the original request and what HomeKit's API
  actually allows a third party to do.)
- **Weather-triggered automations are not modeled anywhere in this
  codebase.** The Automation Engine's trigger fields (heart rate,
  stress, recovery, sleep, time, location) are all real, existing
  `RuleCondition`/`TimeWindow`/`locationTrigger` mechanisms this reuses.
  Weather has no integration at all — scoped out rather than fabricated,
  matching the Garmin/Ecobee "interface-only" precedent.
- **AI scene recommendations are a keyword heuristic, not semantic
  understanding.** `ai/src/recommendations.ts`'s scene-suggestion
  heuristic matches cached scene *names* against a small keyword list
  (relax/wind down/calm/unwind) — MoodSync has no way to know what a
  scene actually *does* to the accessories in it.

## 7. What was verified vs. not, this session

**Confirmed:**
- `HMAccessory` metadata access, Matter-as-ordinary-accessory, and the
  camera-embed-only constraint — all via live web search this session.
- Backend (`home.ts`, `homeSnapshotRepository`, `preferences.ts`
  security-control routes, `dispatch.ts`/`actionExecutors.ts` gating,
  `recommendations.ts`/`insights.ts` extensions) — fully build- and
  test-verified (`npm run build`, `npm test`) across
  `database`/`shared`/`ai`/`backend`/`frontend`, including new unit
  tests for the security-control gate and the run-scene recommendation
  heuristic.
- Frontend `/dashboard/home` page — verified live against the running
  app (logged in with the seeded demo account, real Railway-backed
  session): the sidebar link renders and the page correctly falls back
  to its "No Apple Home connected yet" empty state rather than crashing.

**Not verified — cannot be, here:**
- **Everything inside `HomeKitController.swift`'s `#if canImport(HomeKit)`
  block is not compile-verified in this sandbox at all** — HomeKit
  doesn't exist on macOS, so `swift build` here silently skips that
  entire code path (unlike the CoreBluetooth code in
  `HueBLEController.swift`, which macOS does support). This is a
  stricter caveat than usual: it needs a real Xcode project targeting
  iOS to confirm `fetchHomeSnapshot()` even compiles.
- The full `/dashboard/home` page has never been exercised against real
  HomeKit data — no physical iPhone/Home setup exists in this sandbox.
  The "no home connected" empty state is the only path actually
  observed live.
- Security/safety characteristic reads (`statusValue` for locks/garage/
  alarm) — not independently confirmed as readable by a third-party app;
  wrapped in try/catch specifically because of this uncertainty.

## 8. Files

- `database/prisma/schema.prisma` — `HomeSnapshot`/`HomeRoomSnapshot`/
  `HomeZoneSnapshot`/`HomeAccessorySnapshot`/`HomeSceneSnapshot`,
  `HomeAccessoryCategory`, `UserPreferences.securityControlEnabled`,
  `ExecutionOutcome.SKIPPED_SECURITY_CONTROL_DISABLED`.
- `database/prisma/migrations/20260726120000_add_home_scenes_snapshot/`
- `shared/src/automation.ts` — `homekit.run_scene`, `homekit.security_control`.
- `database/src/repositories/homeSnapshotRepository.ts`,
  `userPreferencesRepository.ts` (security-control get/set),
  `recommendationRepository.ts` (`findById`).
- `ai/src/actionExecutors.ts` (security-control gate), `dispatch.ts`
  (`SKIPPED_SECURITY_CONTROL_DISABLED` outcome), `recommendations.ts`
  (`run-scene` kind), `insights.ts` (`computeSceneUsageFrequency`).
- `backend/src/api/routes/home.ts`, `preferences.ts` (security-control
  routes), `recommendations.ts` (run-scene accept), `dashboard.ts`
  (`sceneUsage` in `/insights`).
- `ios/MoodSyncCompanion/Sources/MoodSyncCompanion/HomeKitController.swift`
  (`fetchHomeSnapshot()`, `HomeSnapshotDTO`), `MoodSyncAPIClient.swift`
  (`pushHomeSnapshot`), `DeviceCommandCoordinator.swift`
  (`homekit.run_scene` routing, `homekit.security_control` refusal).
- `ios/MoodSyncCompanion/Sources/MoodSyncCompanionUI/MoodSyncCompanionView.swift`
  (`pushHomeSnapshot` wired into `sync()`).
- `frontend/src/app/dashboard/home/page.tsx`,
  `frontend/src/components/luxury/LuxuryHome.tsx`,
  `frontend/src/app/api/home/**`,
  `frontend/src/app/api/preferences/security-control/route.ts`.
- `docs/HOMEKIT_ARCHITECTURE.md` — corrected the overstated "never...
  query arbitrary accessory state" claim.
