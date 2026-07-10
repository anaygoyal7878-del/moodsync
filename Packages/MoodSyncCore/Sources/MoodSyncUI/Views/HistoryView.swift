import SwiftUI

public struct HistoryView: View {
    @StateObject private var viewModel: HistoryViewModel

    public init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: HistoryViewModel(container: container))
    }

    private static let timeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    public var body: some View {
        NavigationStack {
            List(viewModel.moodHistory) { entry in
                HStack {
                    MoodBadge(mood: entry.mood, confidence: entry.confidence)
                    Spacer()
                    Text(Self.timeFormatter.string(from: entry.inferredAt))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .overlay {
                if viewModel.moodHistory.isEmpty && !viewModel.isLoading {
                    ContentUnavailableView("No mood history yet", systemImage: "clock")
                }
            }
            .navigationTitle("History")
            .refreshable { await viewModel.load() }
            .task { await viewModel.load() }
        }
    }
}
