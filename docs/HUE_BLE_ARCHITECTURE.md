# Bluetooth Hue (no Bridge) — Architecture

## 0. Read this first

**This is the only integration in MoodSync built against an
unofficial, reverse-engineered protocol.** Every other provider here
(WHOOP, Fitbit, cloud Hue, Spotify, Alexa, Apple Health, HomeKit, Apple
Music) talks to a vendor-published, vendor-supported API. This one does
not — Philips publishes no Bluetooth API for their bulbs, does not
support third-party direct-BLE control, and could break this with any
firmware update without notice or warning.

It exists because Bluetooth-only Hue bulbs (bought without a Hue Bridge)
have **zero** cloud API access — Philips explicitly disables account
login, remote access, and all third-party cloud integrations for
Bridge-less setups, including their own Alexa/Google/IFTTT support. The
already-built cloud Hue integration (`integrations/hue/`,
`docs/HUE_DEVELOPER_GUIDE.md`) is completely unreachable for these
bulbs. Direct BLE is the only path that exists at all.

Treat it as best-effort, and say so to users — the rule builder UI
(`RuleForm.tsx`) does exactly that, in the action's help text.

## 1. Why this can't run on the backend

Same shape as HomeKit's constraint (`docs/HOMEKIT_ARCHITECTURE.md`),
different cause:

- **HomeKit**: no cloud API exists at all; control only works through
  Apple's native framework on the user's device.
- **Bluetooth Hue**: Bluetooth requires *physical proximity*. MoodSync's
  backend runs on Railway's cloud servers. It could have perfect
  protocol knowledge and still never reach a bulb in the user's living
  room — there's no network path, by physics, not by policy.

So this reuses the existing `PendingDeviceCommand` queue verbatim: the
backend decides an automation should fire, writes a queued command, and
the iOS companion app executes it locally the next time it's opened
within Bluetooth range of the bulb. The queue, its repository, and both
its HTTP routes needed **zero changes** — they were already
provider-agnostic (the schema's own doc comment anticipated "a second
device-polled provider").

## 2. Protocol sourcing — what's corroborated, what isn't

The GATT UUIDs and byte formats in `HueBLEController.swift` come from
independent community reverse-engineering, not Philips. Confidence
varies per capability, and the implementation deliberately covers only
the high-confidence parts:

| Capability | UUID | Payload | Sources | Built? |
|---|---|---|---|---|
| Service | `932C32BD-0000-47A2-835A-A8D455B859DD` | — | Corroborated across multiple independent write-ups | ✅ |
| On/off | `...-0002-...` | `0x010101` on, `0x010100` off | **Two independent sources agree** on both UUID and byte format | ✅ Built |
| Brightness | `...-0003-...` | `0x02 0x01 <0x00-0xFF>` | **Two independent sources agree** on both UUID and byte format | ✅ Built |
| Color temperature | `...-0004-...` | unclear | One source; its byte-format description read as internally inconsistent | ❌ Not built |
| Color (XY) | `...-0005-...` | unclear | One source; same problem | ❌ Not built |

**Color and color-temperature are deliberately not implemented.** They'd
be guesses. Cloud Hue supports both (`hue.set_color_temperature` — a
real, Philips-documented action) but that path needs a Bridge; there's
no honest Bluetooth equivalent to offer yet without a real bulb to test
against.

**The CoreBluetooth side is not unofficial.** `CBCentralManager`,
`CBPeripheral`, the scan/connect/discover/write delegate callbacks — all
long-stable, documented Apple framework API, same confidence level as
`HomeKitController`'s `HMHomeManager` usage. It's specifically the
Hue-side UUIDs and bytes that are community-sourced.

## 3. System architecture

```
ai/src/dispatch.ts
  → executeAction() → registry['hue_ble']        (ai/src/actionExecutors.ts)
  → pendingDeviceCommandRepository.create({ provider: 'HUE_BLE', ... })
  → ExecutionOutcome.QUEUED_FOR_DEVICE

        … time passes; user opens the companion app in BLE range …

iOS: MoodSyncCompanionView.sync()
  → GET /api/devices/pending-commands
  → DeviceCommandCoordinator.execute()  ← routes on action.type
  → HueBLEController.setPower / .setBrightness
  → CBCentralManager scan → connect → discoverServices → discoverCharacteristics → writeValue
  → POST /api/devices/pending-commands/:id/complete
```

Identical to HomeKit's flow, with one real structural change:
`DeviceCommandCoordinator.execute(_:)` previously hardcoded a single
`homekit.activate_scene` check. It now has real routing on `action.type`
— this integration introduced that branching, it didn't inherit it.

## 4. Action types

Two, both `provider: 'hue_ble'`:

- **`hue_ble.set_power`** — `params: { peripheralName: string, on: boolean }`
- **`hue_ble.set_brightness`** — `params: { peripheralName: string, brightness: number }` (0-100 percent, matching cloud Hue's param shape; converted to the protocol's 0-255 range inside the controller)

`peripheralName` matches the bulb's **advertised Bluetooth name**. There
is no server-side device list for these bulbs — cloud Hue's
`syncDevices` produces one via the Bridge's REST API, which doesn't
exist here — so name-matching is the only handle available, exactly like
HomeKit's scene-name matching. The rule builder takes it as free text.

## 5. Known real-world failure modes

These are honest, expected outcomes, not bugs — all surface as a
`FAILED` command with a readable reason:

- **The bulb is out of range, or its radio is busy.** Hue bulbs stop advertising while the Hue app or a Bridge already holds a connection — so "the Hue app is open on your phone" can genuinely cause `peripheralNotFound`.
- **Bluetooth is off / permission denied.** `NSBluetoothAlwaysUsageDescription` is now in the app's Info.plist; iOS prompts on first use.
- **Wrong name.** Free-text entry means typos fail at execution time, not rule-creation time.
- **Firmware change.** If Philips changes the protocol, writes will start failing. There is no version negotiation to detect this gracefully.
- **Foreground only.** Same limitation as HomeKit — commands run when the app is opened, not in the background. Background BLE (`UIBackgroundModes: bluetooth-central`) was deliberately **not** added this round; it's a real capability but changes the app's background behavior and App Review story, and shouldn't be switched on speculatively.

## 6. What was verified, and what wasn't

**Confirmed this session:**
- Swift package compiles clean (`swift build`) with the new controller.
- 29 tests pass (`swift test`), up from 23 — 6 new tests specifically covering the new routing: power/brightness reaching the right controller, HomeKit and BLE commands routing independently in one poll cycle, missing-controller and missing-param failing loudly rather than crashing, and readable failure reasons.
- Backend/shared/ai/frontend all typecheck, build, and pass their existing tests with the new provider, action types, and enum value.
- Philips' Bridge-less limitation confirmed via Philips' own published support pages.

**Not verified — cannot be, here:**
- **Never tested against a real bulb.** No Bluetooth Hue hardware in this environment. Every byte format below the CoreBluetooth layer is community-sourced, not empirically confirmed by this session. This is the single biggest caveat: the code is *structurally* correct and compiles, but "does writing `0x010101` to that characteristic actually turn the light on" is unproven here.
- iOS Simulator has no real Bluetooth radio — even a simulator run couldn't validate this. It needs a physical iPhone plus a physical Bluetooth Hue bulb.
- The `.withResponse` vs `.withoutResponse` write-type choice adapts to whatever the characteristic advertises at runtime, but which one Hue bulbs actually expose is unconfirmed.

**Before trusting this in a demo**: test on a real device with a real
bulb. If it doesn't work, the most likely culprits in order are (1) the
peripheral name not matching what the bulb advertises, (2) the Hue app
holding the BLE connection, (3) the byte format differing on your bulb's
firmware revision.

## 7. Files

- `database/prisma/schema.prisma` — `SmartHomeProvider.HUE_BLE`
- `database/prisma/migrations/20260726065335_add_hue_ble_provider/`
- `shared/src/wearables.ts` — `SmartHomeProviderId` union
- `shared/src/automation.ts` — the two new `ActionType`s
- `ai/src/actionExecutors.ts` — registry entry (queues, never executes)
- `backend/src/api/routes/{automationRules,preferences}.ts` — Zod enum lists
- `frontend/src/lib/ruleTemplates.ts`, `frontend/src/components/dashboard/RuleForm.tsx` — rule builder UI + caveat copy
- `ios/MoodSyncCompanion/Sources/MoodSyncCompanion/HueBLEController.swift` — the BLE controller
- `ios/MoodSyncCompanion/Sources/MoodSyncCompanion/DeviceCommandCoordinator.swift` — now routes by action type
- `ios/MoodSyncCompanionApp/MoodSyncCompanionApp/Info.plist` — `NSBluetoothAlwaysUsageDescription`
