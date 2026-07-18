# iOS Companion App — Real Device Setup Guide

The complete, start-to-finish path from "I've never shipped an iOS app"
to "MoodSync Companion is running on my own iPhone." Written for someone
with **zero prior iOS deployment experience** — every Apple-side term is
explained the first time it's used.

This assumes you're picking up from a clean clone of this repo, on a Mac,
with an iPhone available. It supersedes the setup portions of
[docs/APPLE_HEALTH_DEVELOPER_GUIDE.md](./APPLE_HEALTH_DEVELOPER_GUIDE.md)
(that doc's HealthKit-specific privacy/App-Store background is still
accurate and linked from here where relevant) and covers everything
`docs/APPLE_HEALTH_DEVELOPER_GUIDE.md` didn't: HomeKit, geofencing
(Location), and the first-launch onboarding flow.

**What the app actually is**, in one sentence: a SwiftUI iOS app
(`ios/MoodSyncCompanionApp`) that wraps a Swift package
(`ios/MoodSyncCompanion`) reading HealthKit data, optionally activating
HomeKit scenes, and optionally detecting arrival/departure via
CoreLocation — pushing all of it to the same MoodSync backend the web
app talks to, authenticated with the same email/password login.

---

## Part 0 — What's already done vs. what's genuinely yours to do

| | Status |
|---|---|
| Swift code (HealthKit/HomeKit/CoreLocation reading, networking, sync orchestration, onboarding UI) | ✅ Done — compiled, unit-tested (23 `XCTest` cases), and the Xcode project itself builds a real `.app` for the iOS Simulator |
| Xcode project (`MoodSyncCompanionApp.xcodeproj`) | ✅ Already exists and is committed — you do **not** need to create one from scratch |
| Entitlements/Info.plist keys (HealthKit, HomeKit, Location, background modes) | ✅ Already configured, verified against live Apple documentation — see Part 5 |
| Backend endpoints this app talks to | ✅ Already live and verified against a real database |
| An Apple Developer Program account | ❌ **You** must enroll — this is a real $99/year paid account, not optional, specifically because HealthKit doesn't work in the Simulator (see Part 1) |
| Code signing (your Team ID, provisioning) | ❌ **You** must configure this in Xcode — `DEVELOPMENT_TEAM` is deliberately left blank in this repo |
| Running it on your physical iPhone | ❌ Requires your Mac + your iPhone + your Apple ID — cannot be done in any automated environment |
| Geofencing actually firing on a real boundary crossing | ❌ Only observable on real hardware — the Simulator can fake a location but not a genuine region-crossing delivery |

---

## Part 1 — Apple Developer Account

1. Go to [developer.apple.com](https://developer.apple.com) and sign in
   with your Apple ID (the same one on your iPhone), or create one first.
2. Enroll in the **Apple Developer Program** — **Account → Enroll**.
   This costs **$99/year** (confirm current pricing on Apple's site) and
   is required specifically because:
   - **HealthKit does not work in the Simulator at all** — there's no
     real Health data there, so a free account (which can only run apps
     in the Simulator) cannot meaningfully test this app.
   - HomeKit and background Location similarly need a real device to
     observe real behavior.
3. Enrollment review can take anywhere from a few hours to a couple of
   days (longer for an organization/company account, which needs a
   D-U-N-S number — enroll as an **individual** unless you specifically
   need an organization account).

**This is the one step in this whole guide that costs money and that
nothing here can shortcut.**

---

## Part 2 — Xcode

1. Install **Xcode** from the Mac App Store — the full app, not just the
   Command Line Tools (Command Line Tools alone cannot build an
   installable `.app` or show HealthKit's permission dialog).
2. Open Xcode once after installing so it finishes its first-launch
   component download.
3. Open the project: **File → Open…** → navigate to
   `ios/MoodSyncCompanionApp/MoodSyncCompanionApp.xcodeproj` in this repo
   and open it. (You do not need to run `xcodegen` — the `.xcodeproj` is
   already committed. Only re-run `xcodegen generate`, per
   `ios/MoodSyncCompanionApp/README.md`, if you go on to edit
   `project.yml` yourself.)

---

## Part 3 — Certificates, App ID, and Signing

This is the part that trips up most first-time iOS developers — here's
exactly what each term means and what to click.

1. **Register an explicit App ID** (a unique identifier for this specific
   app, tied to which capabilities — HealthKit, HomeKit, etc. — it's
   allowed to use):
   - [developer.apple.com/account](https://developer.apple.com/account)
     → **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
   - Choose **App IDs** → **App** → Continue.
   - Description: `MoodSync Companion` (or anything memorable).
   - Bundle ID: **Explicit**, not wildcard. Pick something under a
     domain you control, e.g. `com.yourname.moodsync.companion` —
     this **replaces** the placeholder `com.moodsync.companion` already
     in `project.yml` (see Part 3, step 4 below for where to change it).
   - Under **Capabilities**, check: **HealthKit**, **HomeKit**. Leave
     "Clinical Health Records" unchecked (MoodSync doesn't use it — see
     `docs/APPLE_HEALTH_DEVELOPER_GUIDE.md`'s note on this). There is no
     separate capability checkbox for Core Location — location access is
     governed entirely by the `Info.plist` usage-description keys +
     entitlement-free `NSLocationAlwaysAndWhenInUseUsageDescription`,
     already present in this project.
   - Save.
2. **Certificates and provisioning profiles are the mechanism that
   proves "this build actually came from you" to your iPhone** — in
   practice, you almost never manage these by hand. Xcode's **Automatic
   signing** (already configured in this project — `CODE_SIGN_STYLE:
   Automatic` in `project.yml`) creates and renews your development
   certificate and provisioning profile for you the first time you build
   with a Team selected. You only need Part 3's manual App ID
   registration because HealthKit/HomeKit specifically require an
   *explicit* bundle ID with those capabilities checked — Automatic
   signing can't invent that combination on its own.
3. In Xcode, with the project open: select the **MoodSyncCompanionApp**
   project in the navigator → the **MoodSyncCompanionApp** target →
   **Signing & Capabilities** tab.
4. **Team**: select your name/account from the dropdown (this is what
   `DEVELOPMENT_TEAM` in `project.yml` is currently left blank for you
   to fill in here). **Bundle Identifier**: change it from
   `com.moodsync.companion` to the exact bundle ID you registered in
   step 1.
5. Confirm **HealthKit** and **HomeKit** already appear as capabilities
   in this tab (they should, from the committed entitlements file) — if
   Xcode shows a warning icon next to either, it usually means the
   bundle ID you just set doesn't match one registered with that
   capability in step 1; double check they're identical.

---

## Part 4 — Your iPhone

1. **Connect** your iPhone to your Mac via USB cable (wireless
   debugging can be set up afterward, but the very first connection
   needs a cable).
2. On the iPhone, if prompted, tap **Trust This Computer** and enter
   your passcode.
3. **Enable Developer Mode** (iOS 16+): Xcode will prompt for this on
   the first attempted install if it isn't already on. If it doesn't
   prompt automatically: iPhone **Settings → Privacy & Security →
   Developer Mode → toggle on → the phone will ask to restart → after
   restart, confirm "Turn On" in the security prompt that appears**.
   This is a one-time step per device.
4. In Xcode's toolbar (top, next to the Run/Stop buttons), select your
   iPhone as the run destination instead of a Simulator.
5. Press **⌘R** (Run/Build). Xcode compiles, installs, and launches the
   app on your phone.
6. **First launch only — "Untrusted Developer"**: iOS blocks apps signed
   with a personal/development certificate by default. If you see this,
   go to iPhone **Settings → General → VPN & Device Management** → tap
   your certificate (named after your Apple ID) → **Trust**. Re-launch
   the app from the Home Screen (not from Xcode) after trusting.

---

## Part 5 — What's already configured (and why it's correct)

Every entitlement/`Info.plist` key below is already committed in this
repo — you don't need to add any of them. This section explains what
each one does and confirms it against Apple's own documentation, so you
can verify it yourself in Xcode's Signing & Capabilities tab and
`ios/MoodSyncCompanionApp/MoodSyncCompanionApp/Info.plist`.

### Entitlements (`MoodSyncCompanionApp.entitlements`)

| Key | Value | Confirmed against |
|---|---|---|
| `com.apple.developer.healthkit` | `true` | [developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit) |
| `com.apple.developer.healthkit.background-delivery` | `true` | [developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.background-delivery](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.healthkit.background-delivery) — a Boolean indicating whether observer queries receive updates in the background, matching `HealthKitReader.enableBackgroundDelivery`'s real use. |
| `com.apple.developer.homekit` | `true` | Standard HomeKit capability entitlement, added via Xcode's Signing & Capabilities UI (equivalent raw key). |

**Deliberately not present**: `com.apple.developer.healthkit.access` with
the `health-records` value. That's a *separate*, additional entitlement
specifically for **Clinical Health Records** (data a user has imported
into Health from a hospital/clinic) — confirmed via
[developer.apple.com/documentation/healthkit/authorizing-access-to-health-data](https://developer.apple.com/documentation/healthkit/authorizing-access-to-health-data)
that it's required only for that separate category, has extra App
Review requirements (a privacy policy URL shown on the consent screen),
and MoodSync never requests clinical-record types — adding it would be
requesting a capability the app doesn't use.

### Info.plist keys

| Key | Why it's required |
|---|---|
| `NSHealthShareUsageDescription` | HealthKit refuses to show its permission dialog at all without this string present. |
| `NSHomeKitUsageDescription` | Same requirement for HomeKit's permission dialog. |
| `NSLocationWhenInUseUsageDescription` | Required before `requestWhenInUseAuthorization()` can show a prompt — the first of the two-step location escalation (see Part 6). |
| `NSLocationAlwaysAndWhenInUseUsageDescription` | Required before `requestAlwaysAuthorization()` can show a prompt — the **Always** tier that makes geofencing work while the app is closed. `NSLocationAlwaysUsageDescription` alone (the older, iOS-10-era key) is not sufficient on current iOS; this combined key is the one Apple's current docs describe for the two-step flow. |
| `UIBackgroundModes`: `fetch`, `location` | `fetch` supports periodic background HealthKit sync; `location` is required for the system to wake the app on a region-crossing event after it's been suspended or the device rebooted — confirmed via `docs/GEOFENCING_ARCHITECTURE.md`'s citations. |
| `NSAppTransportSecurity` → `NSAllowsLocalNetworking: true` | A narrow, dev-only exception (confirmed against [developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking)) that allows plain HTTP **only** to hosts on the device's local network — exactly "your Mac's dev server on the same Wi-Fi," nothing else. **Remove this before ever pointing the app at a real production HTTPS backend.** |

### Capabilities deliberately NOT added, and why

The original task list for this round asked about Push Notifications and
Bluetooth "if required later." Neither is added, on purpose, matching
this project's standing rule against declaring capabilities the code
doesn't actually use:

- **Push Notifications**: nothing in this app registers for remote or
  local notifications today (`UNUserNotificationCenter` is never
  called). The backend's `Notification` model is a web-dashboard concept
  (see `backend/src/api/routes/notifications.ts`), not a push mechanism
  to this iOS app. Requesting a permission a build doesn't act on is
  also flagged by Apple's own App Review guidelines. **When this
  actually needs building**: add the `aps-environment` entitlement, call
  `UNUserNotificationCenter.requestAuthorization`, and register a real
  push-notification service (APNs) server-side — none of that exists
  yet.
- **Bluetooth**: no code anywhere in this repo talks to a diffuser or
  any BLE peripheral — `docs/INTEGRATIONS_RESEARCH.md`'s scent/diffuser
  section is still unimplemented. **When a real diffuser integration is
  built**: add `NSBluetoothAlwaysUsageDescription` to `Info.plist` and
  the `bluetooth-central` (and/or `bluetooth-peripheral`) value to
  `UIBackgroundModes`, matching whatever the actual BLE communication
  pattern with real diffuser hardware turns out to need — that's a
  research-before-code task in its own right per this project's
  standing rule, not something to guess at now.
- **Motion & Fitness** (`NSMotionUsageDescription`): also not present,
  correctly — MoodSync reads step count via HealthKit's
  `HKQuantityTypeIdentifier.stepCount`, not Core Motion's
  `CMPedometer`/`CMMotionActivityManager` APIs directly. Motion & Fitness
  permission only gates the latter; HealthKit step data is covered
  entirely by `NSHealthShareUsageDescription`.

---

## Part 6 — The first-launch onboarding flow (what you'll actually see)

The app now walks through permissions in this order — see
`ios/MoodSyncCompanion/Sources/MoodSyncCompanionUI/OnboardingView.swift`
for the implementation:

1. **Welcome** — what the app does, in plain language.
2. **Server URL** — see Part 7. Nothing else works until this is set.
3. **Health Data** — explains what's read (read-only, never written
   back), then the real HealthKit system prompt appears.
4. **Location — While Using** — the first of two location prompts,
   required by iOS before "Always" can be requested at all.
5. **Location — Always** — explains this is what makes arrival/departure
   automations work with the app closed. You can tap "Skip for now" —
   geofencing just won't fire until you grant this (from this screen
   later, or Settings directly).
6. **HomeKit** — there's no separate "request" button here, because
   HomeKit doesn't have one the way HealthKit/Location do: the system
   prompt appears automatically the first time the app actually touches
   `HMHomeManager` (tapping "Continue" here triggers that first touch).
   If you haven't set up a Home in Apple's **Home** app at all, this
   screen tells you so — that's fine, HomeKit automations simply won't
   run until you do.
7. **Done** → the normal login screen (email/password — the same
   MoodSync account as the web app).

Each "Skip for now" is real — you can complete onboarding without
granting every permission, and come back to Settings later. The app
tells you, in the relevant screen or the sync status text, when
something didn't work because a permission is missing.

**A real HealthKit privacy nuance worth knowing**: once you grant (or
deny) Health access, the app has no way to programmatically tell which
individual data types you allowed — this is Apple's own privacy design
for *read* access, not a bug in this app. If sync succeeds but some
fields are always empty, check **Settings → Health → Data Access &
Devices → MoodSync** directly to see exactly what's granted.

---

## Part 7 — Server URL (the "why localhost is wrong" section)

The app doesn't have a live production backend to point at yet — you're
running MoodSync's own backend locally on your Mac (`npm run dev`, or
however you've started it in this repo) and pointing your iPhone at it
over the same Wi-Fi network.

**`http://localhost:3000` — what an earlier version of this app
hardcoded — is wrong on a physical device.** `localhost` on the iPhone
means *the iPhone itself*, not your Mac. The fix, now built into
onboarding: enter your Mac's actual LAN IP address instead.

**To find your Mac's LAN IP**: System Settings → Wi-Fi → (your connected
network) → Details… → look for "IP Address" (looks like
`192.168.x.x` or `10.x.x.x`). Enter `http://<that IP>:3000` in the
onboarding screen — e.g. `http://192.168.1.23:3000`.

**Requirements for this to actually work**:
- Your iPhone and Mac must be on the **same Wi-Fi network** (not one on
  Wi-Fi and one on cellular, and not two different networks/VLANs).
- The backend must actually be running on your Mac and listening on
  `0.0.0.0`/your LAN interface, not just `127.0.0.1` — check
  `backend/.env.local`/however your dev server binds.
- Your Mac's firewall must allow incoming connections on port 3000 (macOS
  will usually prompt the first time; allow it).
- Plain HTTP works here specifically because of the `NSAllowsLocalNetworking`
  exception described in Part 5 — this only works for local-network
  addresses, not the public internet.

You can change the Server URL later by deleting and reinstalling the
app (onboarding runs again), or by extending the settings UI yourself —
there's currently no in-app "change server URL" control once onboarding
is complete, since this is a dev-only concern that goes away once a real
backend is deployed.

---

## Part 8 — Verifying it actually works

1. Log in with a real MoodSync account (create one via the web app
   first, at `/signup`, or reuse an existing disposable test account).
2. Tap **Sync now**. Watch the status text — a successful sync reports
   how many readings were sent; a failure reports one of the specific
   messages described in Part 9 below.
3. Check the MoodSync dashboard's **Connections** page — Apple Health
   should show "Connected," your device name, and a recent sync time.
4. **To test geofencing**: from the main screen (after logging in), tap
   **Set home to current location** while physically at the location you
   want to use as "home." Then walk (or drive) far enough away to leave
   the ~100m region, wait roughly 20–30 seconds past the boundary (iOS's
   real debounce window — not instant, see
   `docs/GEOFENCING_ARCHITECTURE.md`), and check the MoodSync dashboard's
   automation history for a `DEPARTED` event. **This can only be
   verified on a real, physically-moving device** — there's no way to
   fake a genuine region-crossing delivery in the Simulator the way you
   can fake a static location.
5. **To test HomeKit**: create an automation rule with a
   `homekit.activate_scene` action pointing at a real scene name you've
   configured in Apple's Home app, trigger it (e.g. via a biometric
   condition or the dev-only Alexa demo endpoint), then tap **Sync now**
   in the companion app — it checks for and executes pending HomeKit
   commands right after every successful HealthKit sync (see
   `MoodSyncCompanionView.checkPendingDeviceCommands`).

---

## Part 9 — What happens when something's wrong (graceful failure modes)

The app is built to fail with a specific, actionable message rather than
a generic error, for every one of these:

| Situation | What you'll see |
|---|---|
| Health permission denied, or unavailable on this device | Sync reports "Health data isn't available on this device" (iPad, or no Health data at all) — for a denied *read* permission specifically, Apple's privacy design means the app can't detect denial directly; check Settings → Health → Data Access & Devices → MoodSync if fields come back empty. |
| No Home set up in Apple's Home app | HomeKit check reports "No Home is set up…" rather than failing sync entirely — HomeKit scenes just don't run until you add one. |
| HomeKit access restricted (Screen Time / parental controls) | Reported distinctly as "HomeKit access is restricted on this device" — different recovery action (change Screen Time settings) than "no Home configured." |
| Location Services off system-wide | "Set home" reports this specifically, distinct from a per-app denial — the fix is Settings → Privacy & Security → Location Services (the master toggle), not the per-app screen. |
| Only "While Using" location granted, not "Always" | Reported as needing the Always upgrade specifically, with the exact Settings path to fix it, since geofencing genuinely cannot work without Always. |
| Airplane mode / no Wi-Fi / no cellular | "No internet connection — check Wi-Fi/cellular and airplane mode, then try again." |
| Wrong Server URL, or your Mac's backend isn't running | "Couldn't reach MoodSync — check the Server URL in Settings and that your Mac's backend is running on the same network." — distinguished from the offline case above, since these need different fixes. |
| Session expired | "Your session expired — log in again." |
| HomeKit takes too long to respond | Times out after 5 seconds rather than hanging the UI indefinitely, reporting "Timed out waiting for HomeKit to respond." |

---

## Estimated time to get this running

- **If you already have an Apple Developer Program account**: ~30–60
  minutes (App ID registration, Xcode signing setup, first device
  install, onboarding).
- **If you're enrolling in the Developer Program for the first time**:
  add Apple's own review time on top — typically a few hours, occasionally
  1–2 days. Everything in Part 2–9 can be prepared while that's pending;
  only the actual on-device install (Part 4 onward) needs the enrollment
  to have cleared.
