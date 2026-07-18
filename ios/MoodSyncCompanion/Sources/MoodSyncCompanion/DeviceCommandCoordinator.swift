import Foundation

public enum DeviceCommandRunResult: Sendable, Equatable {
    case noCommandsPending
    case completed(executed: Int, failed: Int)
    case failure(String)
}

/// Orchestrates one HomeKit-command poll cycle: fetch pending commands
/// from the backend, execute each via HomeKit locally, report the
/// outcome back. The inverse of `SyncCoordinator` (which pushes HealthKit
/// data up) — see docs/HOMEKIT_ARCHITECTURE.md. Kept separate from
/// `HomeKitController`/`MoodSyncAPIClient` so it's testable against
/// fakes of both without touching HomeKit or the network.
public final class DeviceCommandCoordinator {
    private let homeKit: HomeKitControlling
    private let apiClient: MoodSyncAPIClientProtocol

    public init(homeKit: HomeKitControlling, apiClient: MoodSyncAPIClientProtocol) {
        self.homeKit = homeKit
        self.apiClient = apiClient
    }

    public func run(accessToken: String) async -> DeviceCommandRunResult {
        do {
            let commands = try await apiClient.fetchPendingDeviceCommands(accessToken: accessToken)
            if commands.isEmpty { return .noCommandsPending }

            var executed = 0
            var failed = 0
            for command in commands {
                do {
                    try await execute(command)
                    try await apiClient.completePendingDeviceCommand(id: command.id, status: .executed, accessToken: accessToken)
                    executed += 1
                } catch {
                    let reason = (error as? HomeKitError).map(describe) ?? error.localizedDescription
                    try? await apiClient.completePendingDeviceCommand(id: command.id, status: .failed(reason: reason), accessToken: accessToken)
                    failed += 1
                }
            }
            return .completed(executed: executed, failed: failed)
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    /// Only `homekit.activate_scene` exists today — see
    /// shared/src/automation.ts's `ActionType`. Any other action type
    /// reaching this queue would be a real bug (dispatch.ts only ever
    /// queues homekit.* actions), so it fails loudly rather than
    /// silently skipping.
    private func execute(_ command: PendingDeviceCommand) async throws {
        guard command.action.type == "homekit.activate_scene" else {
            throw HomeKitError.activationFailed("Unrecognized action type: \(command.action.type)")
        }
        guard let sceneName = command.action.params["sceneName"]?.stringValue else {
            throw HomeKitError.activationFailed("Missing params.sceneName")
        }
        try await homeKit.activateScene(named: sceneName)
    }

    private func describe(_ error: HomeKitError) -> String {
        switch error {
        case .noHomeConfigured:
            return "No HomeKit home is configured on this device."
        case .sceneNotFound(let name):
            return "No HomeKit scene named \"\(name)\" was found — check the scene name in your automation rule."
        case .activationFailed(let message):
            return "Couldn't activate the scene: \(message)"
        case .restricted:
            return "HomeKit access is restricted on this device (check Screen Time / parental controls)."
        case .timedOut:
            return "Timed out waiting for HomeKit to respond — try again."
        }
    }
}
