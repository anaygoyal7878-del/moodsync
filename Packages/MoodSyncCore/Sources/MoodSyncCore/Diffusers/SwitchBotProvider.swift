import Foundation

/// SwitchBot has an official, documented REST API
/// (github.com/OpenWonderLabs/SwitchBotAPI). It has no dedicated
/// "diffuser" device type — its Smart Wi-Fi Ultrasonic Humidifier (which
/// includes an essential-oil tray) surfaces as a `Humidifier`-class device,
/// and its Plug/Plug Mini devices serve as the generic power-only fallback
/// for any other diffuser. Control goes through the backend gateway, which
/// holds the account token+secret needed for SwitchBot's HMAC request
/// signing.
public struct SwitchBotProvider: DiffuserProvider {
    public let kind: DiffuserProviderKind = .switchBot
    private let gateway: RemoteDispatchGateway

    public init(gateway: RemoteDispatchGateway) {
        self.gateway = gateway
    }

    public func discoverDevices() async throws -> [DiffuserDevice] {
        try await gateway.syncDevices(provider: .switchBot)
    }

    public func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws {
        let outcome = try await gateway.dispatch(deviceId: device.id, command: command)
        if outcome == .failed {
            throw DiffuserProviderError.transport("SwitchBot dispatch failed for device \(device.id)")
        }
    }

    public func stop(_ device: DiffuserDevice) async throws {
        try await gateway.stop(deviceId: device.id)
    }
}
