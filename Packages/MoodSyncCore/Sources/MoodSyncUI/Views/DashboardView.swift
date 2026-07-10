import SwiftUI
import MoodSyncCore

public struct DashboardView: View {
    @StateObject private var viewModel: DashboardViewModel

    public init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: DashboardViewModel(container: container))
    }

    public var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    currentMoodCard
                    dispatchStatusCard
                }
                .padding()
            }
            .navigationTitle("MoodSync")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await viewModel.refresh() }
                    } label: {
                        if viewModel.isRefreshing {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(viewModel.isRefreshing)
                }
            }
            .task {
                await viewModel.refresh()
                viewModel.startBackgroundMonitoring()
            }
        }
    }

    @ViewBuilder
    private var currentMoodCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Current Mood")
                .font(.headline)
                .foregroundStyle(.secondary)

            if let inference = viewModel.latestInference {
                MoodBadge(mood: inference.mood, confidence: inference.confidence)
                if !inference.contributingFactors.isEmpty {
                    Text("Based on " + inference.contributingFactors.map(\.rawValue).joined(separator: ", "))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("No reading yet")
                    .foregroundStyle(.secondary)
            }

            if let errorMessage = viewModel.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    @ViewBuilder
    private var dispatchStatusCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Automation")
                .font(.headline)
                .foregroundStyle(.secondary)

            if let outcome = viewModel.lastDispatchOutcome {
                Label(dispatchDescription(for: outcome), systemImage: dispatchSymbol(for: outcome))
                    .font(.subheadline)
            } else {
                Text("Waiting for the next reading")
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func dispatchDescription(for outcome: RemoteDispatchOutcome) -> String {
        switch outcome {
        case .dispatched: return "Diffuser updated"
        case .skippedCooldown: return "Skipped — still in cooldown"
        case .skippedUserOverride: return "Skipped — rule disabled or overridden"
        case .failed: return "Diffuser command failed"
        }
    }

    private func dispatchSymbol(for outcome: RemoteDispatchOutcome) -> String {
        switch outcome {
        case .dispatched: return "checkmark.circle.fill"
        case .skippedCooldown: return "clock.fill"
        case .skippedUserOverride: return "hand.raised.fill"
        case .failed: return "xmark.circle.fill"
        }
    }
}
