import Foundation

/// Govee has a genuine official public API (developer.govee.com) whose
/// device-type enum includes `devices.types.aroma_diffuser` and
/// `devices.types.humidifier`, so — like Moodo — this is a direct
/// integration. The account API key is held server-side and control goes
/// through the same `RemoteDispatchGateway` used by Moodo, never a
/// Govee-specific secret on-device.
public struct GoveeProvider: DiffuserProvider {
    public let kind: DiffuserProviderKind = .govee
    private let gateway: RemoteDispatchGateway

    public init(gateway: RemoteDispatchGateway) {
        self.gateway = gateway
    }

    public func discoverDevices() async throws -> [DiffuserDevice] {
        try await gateway.syncDevices(provider: .govee)
    }

    public func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws {
        let outcome = try await gateway.dispatch(deviceId: device.id, command: command)
        if outcome == .failed {
            throw DiffuserProviderError.transport("Govee dispatch failed for device \(device.id)")
        }
    }

    public func stop(_ device: DiffuserDevice) async throws {
        try await gateway.stop(deviceId: device.id)
    }
}
