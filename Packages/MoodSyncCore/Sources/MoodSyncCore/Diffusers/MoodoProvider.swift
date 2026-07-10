import Foundation

/// Moodo has a genuine account-level cloud API (verified against Moodo's
/// own Homebridge plugin source), so discovery and control both go through
/// the backend (`devices-sync` / `diffuser-dispatch`), which holds the
/// user's Moodo token.
public struct MoodoProvider: DiffuserProvider {
    public let kind: DiffuserProviderKind = .moodo
    private let gateway: RemoteDispatchGateway

    public init(gateway: RemoteDispatchGateway) {
        self.gateway = gateway
    }

    public func discoverDevices() async throws -> [DiffuserDevice] {
        try await gateway.syncDevices(provider: .moodo)
    }

    public func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws {
        let outcome = try await gateway.dispatch(deviceId: device.id, command: command)
        if outcome == .failed {
            throw DiffuserProviderError.transport("Moodo dispatch failed for device \(device.id)")
        }
    }

    public func stop(_ device: DiffuserDevice) async throws {
        try await gateway.stop(deviceId: device.id)
    }
}
