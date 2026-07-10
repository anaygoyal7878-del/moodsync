import SwiftUI
import MoodSyncCore

public struct DevicesView: View {
    @StateObject private var viewModel: DevicesViewModel

    private static let connectableProviders: [DiffuserProviderKind] = [.moodo, .govee, .switchBot, .homeAssistant, .homeKit]

    public init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: DevicesViewModel(container: container))
    }

    public var body: some View {
        NavigationStack {
            List {
                Section("Your diffusers") {
                    if viewModel.devices.isEmpty {
                        Text(viewModel.isLoading ? "Loading…" : "No devices yet — connect a provider below.")
                            .foregroundStyle(.secondary)
                    }
                    ForEach(viewModel.devices) { device in
                        DeviceRow(device: device) {
                            Task { await viewModel.sendTestPulse(to: device) }
                        }
                    }
                }

                Section("Connect a provider") {
                    ForEach(Self.connectableProviders, id: \.self) { kind in
                        Button {
                            Task { await viewModel.connect(provider: kind) }
                        } label: {
                            Label(displayName(for: kind), systemImage: "wifi")
                        }
                    }
                }

                if let errorMessage = viewModel.errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Devices")
            .refreshable { await viewModel.loadDevices() }
            .task { await viewModel.loadDevices() }
        }
    }

    private func displayName(for kind: DiffuserProviderKind) -> String {
        switch kind {
        case .moodo: return "Moodo"
        case .pura: return "Pura (via Home Assistant)"
        case .homeAssistant: return "Home Assistant"
        case .homeKit: return "Apple Home"
        case .govee: return "Govee"
        case .switchBot: return "SwitchBot"
        }
    }
}

private struct DeviceRow: View {
    let device: DiffuserDevice
    let onTestPulse: () -> Void

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(device.name).font(.body)
                Text(device.room ?? device.provider.rawValue.capitalized)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Circle()
                .fill(device.isOnline ? Color.green : Color.gray)
                .frame(width: 8, height: 8)
            Button("Test", action: onTestPulse)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
    }
}
