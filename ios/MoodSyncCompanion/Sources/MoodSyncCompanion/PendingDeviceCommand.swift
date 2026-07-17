import Foundation

/// Mirrors the backend's `PendingDeviceCommand` shape
/// (`database/prisma/schema.prisma`, `GET /api/devices/pending-commands`)
/// — what this app polls for and executes locally via HomeKit, since
/// HomeKit has no cloud API for the backend to call directly. See
/// docs/HOMEKIT_ARCHITECTURE.md.
public struct PendingDeviceCommand: Decodable, Sendable, Equatable {
    public struct Action: Decodable, Sendable, Equatable {
        public let type: String
        public let provider: String
        public let params: [String: JSONValue]
    }

    public let id: String
    public let action: Action
}

/// Minimal `Decodable` box for `AutomationAction.params`'s
/// `Record<string, unknown>` shape (shared/src/automation.ts) — this app
/// only ever reads `params.sceneName` (a string) today, but decoding the
/// whole params object as untyped JSON keeps this resilient to future
/// param shapes rather than failing to decode entirely.
public enum JSONValue: Decodable, Sendable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            self = .string(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(Bool.self) {
            self = .bool(value)
        } else {
            self = .null
        }
    }

    public var stringValue: String? {
        if case .string(let value) = self { return value }
        return nil
    }
}
