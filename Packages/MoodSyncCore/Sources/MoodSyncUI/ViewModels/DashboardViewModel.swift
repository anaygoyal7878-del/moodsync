import Foundation
import MoodSyncCore
import MoodSyncSupabase

@MainActor
public final class DashboardViewModel: ObservableObject {
    @Published public private(set) var latestInference: MoodInference?
    @Published public private(set) var lastDispatchOutcome: RemoteDispatchOutcome?
    @Published public private(set) var isRefreshing = false
    @Published public private(set) var errorMessage: String?

    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    /// The end-to-end pipeline: read HealthKit -> infer mood -> post to
    /// `mood-ingest` (which itself runs cooldown/rule evaluation and
    /// dispatches to the right diffuser provider server-side).
    public func refresh() async {
        isRefreshing = true
        errorMessage = nil
        defer { isRefreshing = false }

        do {
            let snapshot = try await container.healthSnapshotProvider.currentSnapshot()
            let inference = container.moodEngine.infer(from: snapshot)
            latestInference = inference

            let result = try await container.moodIngestClient.ingest(inference)
            lastDispatchOutcome = result.dispatchOutcome
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func startBackgroundMonitoring() {
        try? container.healthKitBackgroundMonitor.startMonitoring { [weak self] in
            await self?.refresh()
        }
    }
}
