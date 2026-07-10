import Foundation

/// Mirrors the `diffuser_provider_kind` Postgres enum.
public enum DiffuserProviderKind: String, Codable, Sendable, CaseIterable {
    case moodo
    case pura
    case homeAssistant = "home_assistant"
    case homeKit = "homekit"
    case govee
    case switchBot = "switchbot"
}

public struct DiffuserCapabilities: Codable, Sendable, Equatable {
    public let power: Bool
    public let intensity: Bool
    public let scentSelection: Bool

    public init(power: Bool, intensity: Bool, scentSelection: Bool) {
        self.power = power
        self.intensity = intensity
        self.scentSelection = scentSelection
    }
}

public struct DiffuserDevice: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let provider: DiffuserProviderKind
    public let externalId: String
    public let name: String
    public let room: String?
    public let capabilities: DiffuserCapabilities
    public let isOnline: Bool

    public init(
        id: String,
        provider: DiffuserProviderKind,
        externalId: String,
        name: String,
        room: String?,
        capabilities: DiffuserCapabilities,
        isOnline: Bool
    ) {
        self.id = id
        self.provider = provider
        self.externalId = externalId
        self.name = name
        self.room = room
        self.capabilities = capabilities
        self.isOnline = isOnline
    }
}

public struct DiffuserCommand: Sendable, Equatable {
    /// 0...1, translated by each provider into its own native scale
    /// (e.g. Moodo's 0-100 `fan_volume`).
    public let intensity: Double
    public let runtimeMinutes: Int
    public let fragranceProfileId: String?

    public init(intensity: Double, runtimeMinutes: Int, fragranceProfileId: String? = nil) {
        self.intensity = min(max(intensity, 0), 1)
        self.runtimeMinutes = runtimeMinutes
        self.fragranceProfileId = fragranceProfileId
    }
}

public enum DiffuserProviderError: Error, Sendable {
    case deviceUnreachable
    case unsupportedCapability(String)
    case transport(String)
}
