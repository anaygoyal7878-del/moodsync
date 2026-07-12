// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MoodSyncCompanion",
    platforms: [
        .iOS(.v17),
        // macOS included so `swift build`/`swift test` can compile- and
        // logic-verify this package without Xcode/an iOS simulator — see
        // README.md's "What was and wasn't verified" section. The real
        // deployment target is iOS only; this is a dev/CI convenience.
        .macOS(.v14),
    ],
    products: [
        .library(name: "MoodSyncCompanion", targets: ["MoodSyncCompanion"]),
        .library(name: "MoodSyncCompanionUI", targets: ["MoodSyncCompanionUI"]),
    ],
    targets: [
        .target(name: "MoodSyncCompanion"),
        .testTarget(name: "MoodSyncCompanionTests", dependencies: ["MoodSyncCompanion"]),

        .target(name: "MoodSyncCompanionUI", dependencies: ["MoodSyncCompanion"]),
    ]
)
