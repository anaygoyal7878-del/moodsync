# MoodSyncCompanionApp

The Xcode App wrapper around the `ios/MoodSyncCompanion` Swift package —
the package itself is library targets only (HealthKit + HomeKit logic,
networking, pure coordinators), not an installable `.app` on its own.
This is the thin shell that turns it into one, generated from
`project.yml` via [XcodeGen](https://github.com/yonaskolb/XcodeGen)
rather than hand-maintained `.xcodeproj` XML.

Real, compile- and (where the sandbox allows) test-verified this session:
`swift build`/`swift test` pass for the underlying package (17 tests,
including real `XCTest` runs — this repo's sandbox previously only had
Xcode Command Line Tools, which can't run `XCTest` at all; real Xcode is
now installed), and this wrapper project itself builds and code-signs
successfully for the iOS Simulator (`xcodebuild ... build`), including
the HealthKit, HomeKit, and (added for geofencing —
`LocationController.swift`) location entitlements/usage-description
keys.

**A real CLI-invocation gotcha, not a project problem**: `xcodebuild
-project MoodSyncCompanionApp.xcodeproj -target MoodSyncCompanionApp
build` alone fails with "no such module 'MoodSyncCompanionUI'" — the
local `MoodSyncCompanion` package (a separate pseudo-"project" in
xcodebuild's eyes) builds its products into its own directory, and
without a shared build output location the app target's search paths
never see them. This is a CLI-only issue: opening
`MoodSyncCompanionApp.xcodeproj` in the actual Xcode app and building
normally does not hit this, since Xcode's own derived-data handling
shares build products across local package dependencies automatically.
To reproduce the successful CLI build used for this verification, pass
an explicit shared `SYMROOT`:
`xcodebuild -project MoodSyncCompanionApp.xcodeproj -target
MoodSyncCompanionApp -sdk iphonesimulator -destination 'platform=iOS
Simulator,name=iPhone 17' ARCHS=arm64 ONLY_ACTIVE_ARCH=YES
SYMROOT="$(pwd)/SharedBuild" build`.

## Regenerating the project

If you edit `project.yml` (new source files, new entitlements, a new
Info.plist key), regenerate the `.xcodeproj`:

```
xcodegen generate
```

(Install via `brew install xcodegen`, or download a release from
[XcodeGen's GitHub releases](https://github.com/yonaskolb/XcodeGen/releases)
if you don't have Homebrew.) The generated `.xcodeproj` is committed
alongside `project.yml` so the project can be opened directly in Xcode
without requiring XcodeGen to be installed first — just don't hand-edit
files inside `.xcodeproj` directly, since `xcodegen generate` overwrites
them from `project.yml`.

## What's real vs. placeholder

- `PRODUCT_BUNDLE_IDENTIFIER` (`com.moodsync.companion`) and `appId`-style
  values are placeholders — see `docs/APPLE_HEALTH_DEVELOPER_GUIDE.md`
  and `docs/HOMEKIT_ARCHITECTURE.md` for what a real Apple Developer
  Program registration replaces them with.
- `DEVELOPMENT_TEAM` is empty — fine for Simulator builds (`CODE_SIGN_STYLE:
  Automatic` handles ad-hoc local signing), required for a real device.
- HealthKit and HomeKit entitlements are both declared for real in
  `MoodSyncCompanionApp.entitlements` — not placeholders, these are the
  actual capabilities this app needs.
