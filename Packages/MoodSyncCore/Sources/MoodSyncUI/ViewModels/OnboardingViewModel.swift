import Foundation
import MoodSyncSupabase

@MainActor
public final class OnboardingViewModel: ObservableObject {
    @Published public private(set) var isRequestingAccess = false
    @Published public private(set) var didGrantAccess = false
    @Published public private(set) var errorMessage: String?

    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    /// HealthKit's authorization API never reveals which specific types
    /// were granted vs. denied (Apple does this deliberately for privacy),
    /// so "success" here means the request completed, not that every type
    /// was allowed — the mood engine already treats absent metrics as
    /// neutral, so partial grants degrade gracefully.
    public func requestHealthAccess() async {
        guard container.healthKitAuthorizing.isHealthDataAvailable() else {
            errorMessage = "Health data isn't available on this device."
            return
        }
        isRequestingAccess = true
        errorMessage = nil
        defer { isRequestingAccess = false }

        do {
            try await container.healthKitAuthorizing.requestAuthorization()
            try await container.profileRepository.setHealthSyncConsent(true)
            didGrantAccess = true
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func declineHealthSync() async {
        try? await container.profileRepository.setHealthSyncConsent(false)
    }
}
