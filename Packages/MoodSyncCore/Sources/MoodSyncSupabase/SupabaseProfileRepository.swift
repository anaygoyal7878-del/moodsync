import Foundation
import Supabase

public struct UserProfile: Sendable, Equatable {
    public let id: String
    public let displayName: String?
    public let timezone: String
    public let healthSyncConsent: Bool
}

private struct ProfileRowDTO: Codable {
    let id: String
    let displayName: String?
    let timezone: String
    let healthSyncConsent: Bool

    enum CodingKeys: String, CodingKey {
        case id, timezone
        case displayName = "display_name"
        case healthSyncConsent = "health_sync_consent"
    }

    func toDomain() -> UserProfile {
        UserProfile(id: id, displayName: displayName, timezone: timezone, healthSyncConsent: healthSyncConsent)
    }
}

private struct ConsentUpdateDTO: Encodable {
    let healthSyncConsent: Bool
    let healthSyncConsentUpdatedAt: String

    enum CodingKeys: String, CodingKey {
        case healthSyncConsent = "health_sync_consent"
        case healthSyncConsentUpdatedAt = "health_sync_consent_updated_at"
    }
}

public protocol ProfileRepository: Sendable {
    func fetchProfile() async throws -> UserProfile
    /// Every consent change is explicit and timestamped — HealthKit
    /// aggregates are only ever uploaded while this is `true`.
    func setHealthSyncConsent(_ consent: Bool) async throws
}

public final class SupabaseProfileRepository: ProfileRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchProfile() async throws -> UserProfile {
        let row: ProfileRowDTO = try await container.client
            .from("profiles")
            .select()
            .single()
            .execute()
            .value
        return row.toDomain()
    }

    public func setHealthSyncConsent(_ consent: Bool) async throws {
        let userId = try await container.client.auth.session.user.id.uuidString
        try await container.client
            .from("profiles")
            .update(ConsentUpdateDTO(
                healthSyncConsent: consent,
                healthSyncConsentUpdatedAt: ISO8601DateFormatter().string(from: Date())
            ))
            .eq("id", value: userId)
            .execute()
    }
}
