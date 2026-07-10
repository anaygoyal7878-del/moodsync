import Foundation
import MoodSyncCore
import Supabase

private struct SyncDevicesRequestBody: Encodable {
    let provider: String
}

private struct SyncDevicesResponseDTO: Decodable {
    let synced: Int
}

private struct DispatchRequestBody: Encodable {
    let action: String
    let deviceId: String
    let fragranceProfileId: String?
    let intensity: Double?
    let runtimeMinutes: Int?
}

private struct DispatchResponseDTO: Decodable {
    let outcome: String
    let deviceId: String?
    let failureReason: String?
}

/// Implements `RemoteDispatchGateway` (declared in MoodSyncCore) against the
/// real `devices-sync` / `diffuser-dispatch` Edge Functions. This is the
/// only place in the app that talks to those functions — Moodo/Govee/
/// SwitchBot/Home Assistant providers all go through this same gateway.
public final class SupabaseRemoteDispatchGateway: RemoteDispatchGateway {
    private let container: SupabaseServiceContainer
    private let deviceRepository: DeviceRepository

    public init(container: SupabaseServiceContainer, deviceRepository: DeviceRepository) {
        self.container = container
        self.deviceRepository = deviceRepository
    }

    public func syncDevices(provider: DiffuserProviderKind) async throws -> [DiffuserDevice] {
        // homekit/pura discovery happens on-device (HomeKit accessory
        // browser / the user's own Home Assistant), not through this
        // Edge Function, so just read back whatever's already stored.
        if provider == .homeKit || provider == .pura || provider == .homeAssistant {
            return try await deviceRepository.fetchDevices(provider: provider)
        }

        let _: SyncDevicesResponseDTO = try await container.client.functions.invoke(
            "devices-sync",
            options: FunctionInvokeOptions(body: SyncDevicesRequestBody(provider: provider.rawValue))
        )
        return try await deviceRepository.fetchDevices(provider: provider)
    }

    public func dispatch(deviceId: String, command: DiffuserCommand) async throws -> RemoteDispatchOutcome {
        let response: DispatchResponseDTO = try await container.client.functions.invoke(
            "diffuser-dispatch",
            options: FunctionInvokeOptions(body: DispatchRequestBody(
                action: "dispatch",
                deviceId: deviceId,
                fragranceProfileId: command.fragranceProfileId,
                intensity: command.intensity,
                runtimeMinutes: command.runtimeMinutes
            ))
        )
        return RemoteDispatchOutcome(rawValue: response.outcome) ?? .failed
    }

    public func stop(deviceId: String) async throws {
        struct StopResponseDTO: Decodable { let outcome: String }
        let _: StopResponseDTO = try await container.client.functions.invoke(
            "diffuser-dispatch",
            options: FunctionInvokeOptions(body: DispatchRequestBody(
                action: "stop",
                deviceId: deviceId,
                fragranceProfileId: nil,
                intensity: nil,
                runtimeMinutes: nil
            ))
        )
    }
}
