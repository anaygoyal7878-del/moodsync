import SwiftUI
import MoodSyncCompanion
import MoodSyncCompanionUI

@main
struct MoodSyncCompanionApp: App {
    @AppStorage("moodsync.hasCompletedOnboarding") private var hasCompletedOnboarding = false

    var body: some Scene {
        WindowGroup {
            // First launch (or a fresh install) always goes through
            // OnboardingView, which walks through Health/Location/HomeKit
            // permissions in order before ever reaching the login screen.
            // The server URL is no longer something onboarding has to
            // collect before the app can work — `ServerConfiguration
            // .baseURL` resolves to the hosted backend unless the user
            // deliberately overrode it.
            if hasCompletedOnboarding {
                MoodSyncCompanionView(baseURL: ServerConfiguration.baseURL)
            } else {
                OnboardingView()
            }
        }
    }
}
