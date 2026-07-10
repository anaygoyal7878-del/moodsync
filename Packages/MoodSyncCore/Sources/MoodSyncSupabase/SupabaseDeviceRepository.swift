import Foundation
import MoodSyncCore
import Supabase

struct DeviceCapabilitiesDTO: Codable {
    let power: Bool
    let intensity: Bool
    let scentSelection: Bool

    enum CodingKeys: String, CodingKey {
        case power, intensity
        case scentSelection = "scent_selection"
    }
}

struct DeviceRowDTO: Codable {
    let id: String
    let provider: String
    let externalId: String
    let name: String
    let room: String?
    let capabilities: DeviceCapabilitiesDTO
    let isOnline: Bool

    enum CodingKeys: String, CodingKey {
        case id, provider, name, room, capabilities
        case externalId = "external_id"
        case isOnline = "is_online"
    }

    func toDomain() -> DiffuserDevice? {
        guard let providerKind = DiffuserProviderKind(rawValue: provider) else { return nil }
        return DiffuserDevice(
            id: id,
            provider: providerKind,
            externalId: externalId,
            name: name,
            room: room,
            capabilities: DiffuserCapabilities(
                power: capabilities.power,
                intensity: capabilities.intensity,
                scentSelection: capabilities.scentSelection
            ),
            isOnline: isOnline
        )
    }
}

public protocol DeviceRepository: Sendable {
    func fetchDevices(provider: DiffuserProviderKind?) async throws -> [DiffuserDevice]
}

public final class SupabaseDeviceRepository: DeviceRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchDevices(provider: DiffuserProviderKind? = nil) async throws -> [DiffuserDevice] {
        var query = container.client
            .from("devices")
            .select()

        if let provider {
            query = query.eq("provider", value: provider.rawValue)
        }

        let rows: [DeviceRowDTO] = try await query.execute().value
        return rows.compactMap { $0.toDomain() }
    }
}
