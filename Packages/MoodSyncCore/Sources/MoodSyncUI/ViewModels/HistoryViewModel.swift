import Foundation
import MoodSyncSupabase

@MainActor
public final class HistoryViewModel: ObservableObject {
    @Published public private(set) var moodHistory: [MoodHistoryEntry] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var errorMessage: String?

    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    public func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            moodHistory = try await container.moodHistoryRepository.fetchRecent(limit: 100)
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
