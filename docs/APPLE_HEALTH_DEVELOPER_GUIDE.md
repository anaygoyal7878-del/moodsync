# Apple Health — Developer Preparation Guide

> **Superseded for setup steps** — this doc was written before
> `ios/MoodSyncCompanionApp/MoodSyncCompanionApp.xcodeproj` (a real Xcode
> App project wrapping the Swift package) existed; §2–§3 below describe
> *creating* that project, which is no longer necessary since it's
> already committed. For the current, complete, start-to-finish device
> setup (Apple Developer account → certificates → HomeKit/Location
> capabilities → the new first-launch onboarding flow → your iPhone),
> use **[docs/IOS_REAL_DEVICE_SETUP_GUIDE.md](./IOS_REAL_DEVICE_SETUP_GUIDE.md)**
> instead. This doc's HealthKit-specific background (§5 usage-description
> rationale, §9 App Store privacy requirements) is still accurate and
> referenced from there.

This is the step-by-step guide for everything **you** need to do before the
Apple Health integration can run on a real iPhone. It assumes you have
never configured HealthKit, an Apple Developer account, or an Xcode
project before. Everything on this list requires either an Apple
Developer account, a physical Apple device, or Xcode itself — none of it
can be done in this environment (see
[docs/APPLE_HEALTH_ARCHITECTURE.md](./APPLE_HEALTH_ARCHITECTURE.md) for
why, and `ios/MoodSyncCompanion/README.md` for exactly what was and
wasn't verifiable here).

The Swift *code* (`ios/MoodSyncCompanion`) is done — compiled, and its
logic verified. What's below is entirely account/tooling setup, not code
you need to write.

## 1. Apple Developer account

1. Go to [developer.apple.com](https://developer.apple.com) and sign in
   with (or create) an Apple ID.
2. Enroll in the **Apple Developer Program** — this is the paid tier
   ($99/year as of this writing; confirm current pricing on Apple's site),
   required for:
   - Installing the app on a **physical** iPhone (a free account can only
     run apps in the Simulator, and **HealthKit does not work in the
     Simulator** — there's no real Health data to read there, so a free
     account cannot meaningfully test this integration at all).
   - TestFlight distribution.
   - App Store submission.
3. Enrollment can take anywhere from a few hours to a couple of days for
   Apple to verify (longer for organization accounts, which require a
   D-U-N-S number).

**You need the paid Program specifically because of HealthKit + physical
device requirement — this is not optional for testing this integration.**

## 2. Create an App ID with the HealthKit capability

1. In [developer.apple.com/account](https://developer.apple.com/account) →
   **Certificates, Identifiers & Profiles** → **Identifiers** → **+**.
2. Choose **App IDs** → **App**.
3. Description: `MoodSync Companion` (or similar).
4. Bundle ID: **explicit**, not wildcard — e.g.
   `com.yourcompany.moodsync.companion`. HealthKit requires an explicit
   bundle ID; wildcard IDs can't enable it.
5. Under **Capabilities**, check **HealthKit**. Leave "Clinical Health
   Records" unchecked unless you specifically intend to request that
   separate, more restricted data category later — it's out of scope for
   this integration.
6. Save.

## 3. Xcode project setup (wrapping the existing Swift package)

`ios/MoodSyncCompanion` is a Swift Package — library targets, not a
directly-installable `.app`. You need a thin Xcode **App** project that
depends on it:

1. Install Xcode from the Mac App Store (full Xcode, not just Command
   Line Tools — CLT alone cannot build an installable `.app` or run
   HealthKit's permission UI, which is exactly the limitation this
   sandbox hit).
2. Xcode → **File → New → Project** → **iOS → App**. Name it
   `MoodSyncCompanion`, interface: **SwiftUI**, language: **Swift**.
3. Set the **Bundle Identifier** to match exactly what you registered in
   step 2 (`com.yourcompany.moodsync.companion`).
4. Add the local package: **File → Add Package Dependencies… → Add
   Local…**, select the `ios/MoodSyncCompanion` directory from this repo.
   Add both products (`MoodSyncCompanion` and `MoodSyncCompanionUI`) to
   the app target.
5. Replace the generated `ContentView`/app entry point with a call into
   `MoodSyncCompanionView(baseURL:)` from `MoodSyncCompanionUI` — see
   `ios/MoodSyncCompanion/Sources/MoodSyncCompanionUI/MoodSyncCompanionView.swift`
   for its signature. `baseURL` should point at your backend
   (`http://localhost:3000` for local dev against a Mac on the same
   network — see §7's note on `localhost` and physical devices; a real
   deployed HTTPS URL for anything beyond local dev).

## 4. Add the HealthKit capability in Xcode

1. Select the app target → **Signing & Capabilities** tab.
2. Under **Signing**, select your Apple Developer **Team** (this is what
   ties the build to your paid account and makes on-device installs
   possible).
3. Click **+ Capability** → search **HealthKit** → add it.
4. This both adds the entitlement to the build and (given your Team is
   selected) can auto-manage the matching provisioning profile.

## 5. Info.plist usage-description keys

HealthKit **refuses to show the permission dialog at all** without this
key present — confirmed Apple behavior, not a guess:

1. Select the app target → **Info** tab (or edit `Info.plist` directly).
2. Add key `NSHealthShareUsageDescription` (Privacy - Health Share Usage
   Description), value: something accurate, e.g. *"MoodSync reads your
   heart rate, sleep, and activity data to automatically adjust your
   smart home based on how you're feeling."*
3. MoodSync never writes to HealthKit, so `NSHealthUpdateUsageDescription`
   is not required — only add it if you later add write access, matching
   what you actually request in `HKHealthStore.requestAuthorization`.

## 6. Background Modes capability (for near-live sync)

Only needed if you want background delivery (§7 of the architecture doc)
rather than only foreground "Sync now":

1. **Signing & Capabilities** → **+ Capability** → **Background Modes**.
2. Check **Background fetch** (and **Background processing** if you
   extend this further).
3. Call `HealthKitReader.enableBackgroundDelivery(onUpdate:)` (already
   implemented) after a successful login/first sync.

## 7. Local testing on a physical iPhone

**The Simulator cannot test this integration — HealthKit has no real
data in the Simulator.** You need a physical iPhone.

1. Connect your iPhone via USB (or use wireless debugging once paired
   once via USB).
2. In Xcode, select your iPhone as the run destination (top toolbar).
3. First run: Xcode will prompt to enable **Developer Mode** on the
   iPhone (Settings → Privacy & Security → Developer Mode → toggle on →
   restart). This is a one-time step per device.
4. Build & run (⌘R). The app installs; the very first launch, on a fresh
   device/account, may prompt **"Untrusted Developer"** — go to Settings →
   General → VPN & Device Management → trust your developer certificate.
5. **Networking note**: if `baseURL` points at `http://localhost:3000`,
   that's `localhost` *on the iPhone*, which is not your Mac. For local
   dev, either run the backend on your Mac and point the app at your
   Mac's LAN IP (e.g. `http://192.168.1.23:3000`, with the iPhone on the
   same Wi-Fi network), or use a tunnel (e.g. `ngrok`) to get a reachable
   HTTPS URL. Also note **iOS blocks plain HTTP by default** (App
   Transport Security) — either add a narrow, dev-only ATS exception for
   your LAN IP in `Info.plist`, or use HTTPS via a tunnel, which is the
   cleaner option and closer to how production will actually work.
6. Log in with a real MoodSync account (create one via the web app
   first, or reuse an existing one), grant HealthKit permissions when
   prompted, tap **Sync now**.
7. Verify: check the MoodSync dashboard's Apple Health Connections card
   (see the updated card in
   `frontend/src/components/dashboard/ConnectionsSection.tsx`) — it
   should flip to "Connected," show your device name, and "Synced just
   now."

## 8. TestFlight (for testing beyond your own device, or beta users)

1. In Xcode: **Product → Archive**.
2. In the Organizer window that opens, **Distribute App → App Store
   Connect → Upload**.
3. In [App Store Connect](https://appstoreconnect.apple.com), create the
   app record (same Bundle ID as step 2) if you haven't already, under
   **My Apps → +**.
4. Once the build finishes processing (can take 10–60 minutes), add it
   under **TestFlight** tab, fill in the required "What to Test" notes,
   and add internal testers (your own team, up to 100, no review needed)
   or external testers (needs a lightweight **Beta App Review** — usually
   under 24–48 hours, distinct from full App Store review).
5. Testers install via the **TestFlight** app using an invite link/code.

## 9. App Store submission requirements (if you go beyond TestFlight)

- **Privacy Policy URL**: required in App Store Connect's app
  information — must actually describe your HealthKit data use, matching
  §5/§9 of the architecture doc (read-only, used only to drive the
  user's own automations, never sold or used for ads).
- **App Privacy details** (the "nutrition label"): declare Health & 
  Fitness data collection, linked to the user's identity, used for **App
  Functionality** only — not Analytics, not Advertising, not Third-Party
  data sharing, consistent with Apple's HealthKit-specific App Review
  Guideline restriction (see architecture doc §5).
- **Review notes**: explicitly state in the App Review notes what
  HealthKit data is used for and that it's never shared with third
  parties — reviewers manually check HealthKit apps for exactly this.
- **Demo account**: provide a real MoodSync test account (email/password)
  in the review notes, since the app's login screen needs real credentials
  to get past — Apple's reviewers cannot sign up for a new account through
  this app (there's deliberately no signup flow in the companion app; see
  `ios/MoodSyncCompanion/README.md`).
- Review turnaround is typically 24–48 hours, longer for HealthKit apps
  under closer scrutiny on the privacy declarations above.

## 10. Environment variables / secrets

There is genuinely nothing provider-specific to configure server-side —
this is the one integration in this product with **no client
ID/secret/redirect URI to set** (no OAuth exists at all; see architecture
doc §1/§3). The only "configuration" is:

- `baseURL` passed into `MoodSyncCompanionView` / `MoodSyncAPIClient` at
  the Xcode-project level (§3.5) — not a secret, just an endpoint.
- The backend's existing `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`
  (already configured for the web app — the companion app reuses the
  exact same auth system, no new secret needed).

## Checklist — what you must do before this can be tested on a device

- [ ] Enroll in the Apple Developer Program (paid).
- [ ] Register an explicit App ID with the HealthKit capability.
- [ ] Create an Xcode App project wrapping `ios/MoodSyncCompanion`.
- [ ] Add the HealthKit capability + your Team in Signing & Capabilities.
- [ ] Add `NSHealthShareUsageDescription` to Info.plist.
- [ ] (Optional, for background sync) Add Background Modes → Background fetch.
- [ ] Set `baseURL` to a real reachable backend URL (LAN IP or tunnel for local dev).
- [ ] Run on a physical iPhone with Developer Mode enabled — **not the Simulator**.
- [ ] Trust your developer certificate on first launch.
- [ ] Log in with a real MoodSync account and grant HealthKit permissions.

## What's a genuine blocker vs. what's already done

| | Status |
|---|---|
| Swift package logic (HealthKit reading, normalization, networking, sync orchestration) | ✅ Done, compile- and logic-verified in this environment |
| Backend ingest endpoint, schema, dashboard UI | ✅ Done, verified end-to-end with real simulated data (`scripts/demoAppleHealthSync.mjs`) |
| Wrapping the package into a real installable `.app` | ❌ Requires Xcode (full, not CLT) — not available in this sandbox |
| HealthKit permission dialog, real device data | ❌ Requires a physical iPhone + Apple Developer account — HealthKit does not work in the Simulator |
| Background delivery in practice | ❌ Requires a physical device; the OS's actual wake-timing behavior can only be observed on real hardware |
| TestFlight / App Store distribution | ❌ Requires App Store Connect access, tied to the Developer Program enrollment |
