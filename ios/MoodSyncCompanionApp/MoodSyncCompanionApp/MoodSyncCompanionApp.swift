import SwiftUI
import MoodSyncCompanionUI

@main
struct MoodSyncCompanionApp: App {
    var body: some Scene {
        WindowGroup {
            // Points at the backend reachable from this device — a real
            // deployed URL for anything beyond same-network local dev
            // (see ios/MoodSyncCompanion/README.md and
            // docs/APPLE_HEALTH_DEVELOPER_GUIDE.md §3 for why localhost
            // doesn't work here: this runs on a separate device/simulator
            // process, not the machine running the backend).
            MoodSyncCompanionView(baseURL: URL(string: "http://localhost:3000")!)
        }
    }
}
