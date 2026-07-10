import Foundation

/// Covers every diffuser brand with no verified direct API of its own —
/// most notably **Pura**, which has no official developer API, and is only
/// reachable via the community `ha-pura` Home Assistant custom integration
/// (github.com/natekspencer/ha-pura), and **Rituals Perfume Genie**, which
/// has an official Home Assistant core integration
/// (home-assistant.io/integrations/rituals_perfume_genie). This provider
/// doesn't talk to Pura/Rituals directly; it talks to the user's own Home
/// Assistant instance, which they've already configured to expose those
/// entities. Device discovery here means "list entities HA exposes from
/// domains we can drive" (switch/light/humidifier), not a Pura-specific API
/// call.
public struct HomeAssistantProvider: DiffuserProvider {
    public let kind: DiffuserProviderKind = .homeAssistant
    private let gateway: RemoteDispatchGateway

    public init(gateway: RemoteDispatchGateway) {
        self.gateway = gateway
    }

    public func discoverDevices() async throws -> [DiffuserDevice] {
        try await gateway.syncDevices(provider: .homeAssistant)
    }

    public func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws {
        let outcome = try await gateway.dispatch(deviceId: device.id, command: command)
        if outcome == .failed {
            throw DiffuserProviderError.transport("Home Assistant dispatch failed for device \(device.id)")
        }
    }

    public func stop(_ device: DiffuserDevice) async throws {
        try await gateway.stop(deviceId: device.id)
    }
}
