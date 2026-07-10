import Foundation
import MoodSyncCore
import MoodSyncSupabase

@MainActor
public final class DevicesViewModel: ObservableObject {
    @Published public private(set) var devices: [DiffuserDevice] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var errorMessage: String?

    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    public func loadDevices() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            devices = try await container.deviceRepository.fetchDevices(provider: nil)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// Triggers discovery for one provider (e.g. after the user connects a
    /// Moodo/Govee/SwitchBot account, or opens the HomeKit accessory
    /// picker) and reloads the merged device list.
    public func connect(provider kind: DiffuserProviderKind) async {
        errorMessage = nil
        do {
            guard let provider = container.providerRegistry.provider(for: kind) else {
                errorMessage = "\(kind.rawValue) isn't registered on this build."
                return
            }
            _ = try await provider.discoverDevices()
            await loadDevices()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func sendTestPulse(to device: DiffuserDevice) async {
        errorMessage = nil
        do {
            try await container.providerRegistry.send(
                DiffuserCommand(intensity: 0.4, runtimeMinutes: 2),
                to: device
            )
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
