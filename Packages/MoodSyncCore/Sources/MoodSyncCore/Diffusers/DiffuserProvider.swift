import Foundation

/// Every supported diffuser integration implements this same interface so
/// the automation engine never needs to branch on brand — it just asks the
/// registry for the devices a user has and sends a `DiffuserCommand`.
public protocol DiffuserProvider: Sendable {
    var kind: DiffuserProviderKind { get }

    /// Finds devices this provider can currently see/control for the signed-in
    /// user (a Moodo account's boxes, a Home Assistant instance's exposed
    /// diffuser-capable entities, or paired HomeKit accessories).
    func discoverDevices() async throws -> [DiffuserDevice]

    func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws

    func stop(_ device: DiffuserDevice) async throws
}

/// Looks up the right provider for a device and routes discovery/dispatch
/// to it, so callers (the automation engine, the UI) depend on this
/// registry rather than on concrete provider types.
public final class DiffuserProviderRegistry: Sendable {
    private let providersByKind: [DiffuserProviderKind: any DiffuserProvider]

    public init(providers: [any DiffuserProvider]) {
        var map: [DiffuserProviderKind: any DiffuserProvider] = [:]
        for provider in providers {
            map[provider.kind] = provider
        }
        self.providersByKind = map
    }

    public func provider(for kind: DiffuserProviderKind) -> (any DiffuserProvider)? {
        providersByKind[kind]
    }

    public func discoverAllDevices() async throws -> [DiffuserDevice] {
        var all: [DiffuserDevice] = []
        for provider in providersByKind.values {
            all.append(contentsOf: try await provider.discoverDevices())
        }
        return all
    }

    public func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws {
        guard let provider = providersByKind[device.provider] else {
            throw DiffuserProviderError.transport("No provider registered for \(device.provider)")
        }
        try await provider.send(command, to: device)
    }
}
