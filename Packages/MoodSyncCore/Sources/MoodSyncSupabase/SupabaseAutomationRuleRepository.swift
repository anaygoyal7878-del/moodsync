import Foundation
import MoodSyncCore
import Supabase

private struct AutomationRuleRowDTO: Codable {
    let mood: String
    let fragranceProfileId: String?
    let intensity: Double
    let runtimeMinutes: Int
    let cooldownMinutes: Int
    let enabled: Bool

    enum CodingKeys: String, CodingKey {
        case mood, intensity, enabled
        case fragranceProfileId = "fragrance_profile_id"
        case runtimeMinutes = "runtime_minutes"
        case cooldownMinutes = "cooldown_minutes"
    }

    func toDomain() -> AutomationRule? {
        guard let moodLabel = MoodLabel(rawValue: mood) else { return nil }
        return AutomationRule(
            mood: moodLabel,
            fragranceProfileId: fragranceProfileId,
            intensity: intensity,
            runtimeMinutes: runtimeMinutes,
            cooldownMinutes: cooldownMinutes,
            enabled: enabled
        )
    }
}

private struct AutomationRuleUpsertDTO: Encodable {
    let userId: String
    let mood: String
    let fragranceProfileId: String?
    let intensity: Double
    let runtimeMinutes: Int
    let cooldownMinutes: Int
    let enabled: Bool

    enum CodingKeys: String, CodingKey {
        case mood, intensity, enabled
        case userId = "user_id"
        case fragranceProfileId = "fragrance_profile_id"
        case runtimeMinutes = "runtime_minutes"
        case cooldownMinutes = "cooldown_minutes"
    }
}

public protocol AutomationRuleRepository: Sendable {
    func fetchRules() async throws -> [AutomationRule]
    func upsert(_ rule: AutomationRule) async throws
}

public final class SupabaseAutomationRuleRepository: AutomationRuleRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchRules() async throws -> [AutomationRule] {
        let rows: [AutomationRuleRowDTO] = try await container.client
            .from("automation_rules")
            .select()
            .execute()
            .value
        return rows.compactMap { $0.toDomain() }
    }

    public func upsert(_ rule: AutomationRule) async throws {
        let userId = try await container.client.auth.session.user.id.uuidString
        try await container.client
            .from("automation_rules")
            .upsert(
                AutomationRuleUpsertDTO(
                    userId: userId,
                    mood: rule.mood.rawValue,
                    fragranceProfileId: rule.fragranceProfileId,
                    intensity: rule.intensity,
                    runtimeMinutes: rule.runtimeMinutes,
                    cooldownMinutes: rule.cooldownMinutes,
                    enabled: rule.enabled
                ),
                onConflict: "user_id,mood"
            )
            .execute()
    }
}
