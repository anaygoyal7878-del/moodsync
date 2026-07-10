// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MoodSyncCore",
    platforms: [
        .iOS(.v17),
        .macOS(.v14),
    ],
    products: [
        .library(name: "MoodSyncCore", targets: ["MoodSyncCore"]),
        .library(name: "MoodSyncHealthKit", targets: ["MoodSyncHealthKit"]),
        .library(name: "MoodSyncSupabase", targets: ["MoodSyncSupabase"]),
        .library(name: "MoodSyncUI", targets: ["MoodSyncUI"]),
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.20.0"),
    ],
    targets: [
        .target(name: "MoodSyncCore"),
        .testTarget(name: "MoodSyncCoreTests", dependencies: ["MoodSyncCore"]),

        .target(name: "MoodSyncHealthKit", dependencies: ["MoodSyncCore"]),

        .target(
            name: "MoodSyncSupabase",
            dependencies: [
                "MoodSyncCore",
                .product(name: "Supabase", package: "supabase-swift"),
            ]
        ),

        .target(
            name: "MoodSyncUI",
            dependencies: ["MoodSyncCore", "MoodSyncHealthKit", "MoodSyncSupabase"]
        ),
    ]
)
