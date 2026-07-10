import Foundation
import MoodSyncCore
import Supabase

private struct AutomationHistoryRowDTO: Codable {
    let startedAt: Date
    let outcome: String
    let moodState: MoodStateRef?

    struct MoodStateRef: Codable {
        let mood: String
    }

    enum CodingKeys: String, CodingKey {
        case outcome
        case startedAt = "started_at"
        case moodState = "mood_states"
    }

    func toDomain() -> AutomationHistoryEntry? {
        guard let moodRaw = moodState?.mood,
              let mood = MoodLabel(rawValue: moodRaw),
              let outcomeValue = AutomationOutcome(rawValue: outcome) else { return nil }
        return AutomationHistoryEntry(mood: mood, startedAt: startedAt, outcome: outcomeValue)
    }
}

public protocol AutomationHistoryRepository: Sendable {
    /// Recent dispatch history, most recent first, used by `AutomationEngine`
    /// to enforce cooldowns on-device.
    func fetchRecentHistory(limit: Int) async throws -> [AutomationHistoryEntry]
}

public final class SupabaseAutomationHistoryRepository: AutomationHistoryRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchRecentHistory(limit: Int = 50) async throws -> [AutomationHistoryEntry] {
        let rows: [AutomationHistoryRowDTO] = try await container.client
            .from("automation_history")
            .select("started_at, outcome, mood_states(mood)")
            .order("started_at", ascending: false)
            .limit(limit)
            .execute()
            .value
        return rows.compactMap { $0.toDomain() }
    }
}
