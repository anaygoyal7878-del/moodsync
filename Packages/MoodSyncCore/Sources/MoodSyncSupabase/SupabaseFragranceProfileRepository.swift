import Foundation
import MoodSyncCore
import Supabase

private struct FragranceProfileRowDTO: Codable {
    let id: String
    let name: String
    let notes: [String]
    let moodAffinity: [String: Double]

    enum CodingKeys: String, CodingKey {
        case id, name, notes
        case moodAffinity = "mood_affinity"
    }

    func toDomain() -> FragranceProfile {
        let affinity = Dictionary(uniqueKeysWithValues: moodAffinity.compactMap { key, value -> (MoodLabel, Double)? in
            guard let mood = MoodLabel(rawValue: key) else { return nil }
            return (mood, value)
        })
        return FragranceProfile(id: id, name: name, notes: notes, moodAffinity: affinity)
    }
}

public protocol FragranceProfileRepository: Sendable {
    /// Global catalog profiles (user_id is null) plus any the user authored.
    func fetchAvailableProfiles() async throws -> [FragranceProfile]
}

public final class SupabaseFragranceProfileRepository: FragranceProfileRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchAvailableProfiles() async throws -> [FragranceProfile] {
        let rows: [FragranceProfileRowDTO] = try await container.client
            .from("fragrance_profiles")
            .select()
            .execute()
            .value
        return rows.map { $0.toDomain() }
    }
}
