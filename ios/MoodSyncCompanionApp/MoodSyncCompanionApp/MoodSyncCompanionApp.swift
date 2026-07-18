import SwiftUI
import MoodSyncCompanion
import MoodSyncCompanionUI

@main
struct MoodSyncCompanionApp: App {
    @AppStorage("moodsync.hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some Scene {
        WindowGroup {
            // First launch (or a fresh install) always goes through
            // OnboardingView, which is what actually collects the
            // Server URL (see ServerConfiguration's doc comment for why
            // "localhost" is wrong on a physical device — it resolves to
            // the iPhone itself, not the Mac running the backend) and
            // walks through Health/Location/HomeKit permissions in order
            // before ever reaching the login screen.
            if hasCompletedOnboarding, let baseURL = ServerConfiguration.baseURL {
                MoodSyncCompanionView(baseURL: baseURL)
            } else {
                OnboardingView()
            }
        }
    }
}
