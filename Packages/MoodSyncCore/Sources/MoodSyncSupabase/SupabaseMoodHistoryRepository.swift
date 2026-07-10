import Foundation
import MoodSyncCore
import Supabase

public struct MoodHistoryEntry: Sendable, Equatable, Identifiable {
    public let id: String
    public let mood: MoodLabel
    public let confidence: Double
    public let inferredAt: Date
}

private struct MoodStateRowDTO: Codable {
    let id: String
    let mood: String
    let confidence: Double
    let inferredAt: Date

    enum CodingKeys: String, CodingKey {
        case id, mood, confidence
        case inferredAt = "inferred_at"
    }

    func toDomain() -> MoodHistoryEntry? {
        guard let moodLabel = MoodLabel(rawValue: mood) else { return nil }
        return MoodHistoryEntry(id: id, mood: moodLabel, confidence: confidence, inferredAt: inferredAt)
    }
}

public protocol MoodHistoryRepository: Sendable {
    func fetchRecent(limit: Int) async throws -> [MoodHistoryEntry]
}

public final class SupabaseMoodHistoryRepository: MoodHistoryRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchRecent(limit: Int = 50) async throws -> [MoodHistoryEntry] {
        let rows: [MoodStateRowDTO] = try await container.client
            .from("mood_states")
            .select("id, mood, confidence, inferred_at")
            .order("inferred_at", ascending: false)
            .limit(limit)
            .execute()
            .value
        return rows.compactMap { $0.toDomain() }
    }
}
