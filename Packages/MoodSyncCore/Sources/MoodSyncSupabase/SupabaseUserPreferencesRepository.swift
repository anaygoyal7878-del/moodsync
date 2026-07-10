import Foundation
import MoodSyncCore
import Supabase

private struct UserPreferencesRowDTO: Codable {
    let scentAffinity: [String: Double]
    let intensityPreference: [String: Double]

    enum CodingKeys: String, CodingKey {
        case scentAffinity = "scent_affinity"
        case intensityPreference = "intensity_preference"
    }

    func toDomain() -> UserLearnedPreferences {
        let intensity = Dictionary(uniqueKeysWithValues: intensityPreference.compactMap { key, value -> (MoodLabel, Double)? in
            guard let mood = MoodLabel(rawValue: key) else { return nil }
            return (mood, value)
        })
        return UserLearnedPreferences(scentAffinity: scentAffinity, intensityPreference: intensity)
    }
}

private struct LearnSignalRequestBody: Encodable {
    let signal: String
    let mood: String
    let fragranceProfileId: String?
    let intensity: Double?
}

public enum LearningSignal: Sendable {
    case override(mood: MoodLabel, fragranceProfileId: String?, intensity: Double?)
    case success(mood: MoodLabel, fragranceProfileId: String?, intensity: Double?)
}

public protocol UserPreferencesRepository: Sendable {
    func fetchPreferences() async throws -> UserLearnedPreferences
    /// Reports an override or a successful (non-overridden) automation so
    /// `learn-preferences` can update the running EMA — this is the only
    /// way `UserLearnedPreferences` ever changes; nothing is hardcoded.
    func reportSignal(_ signal: LearningSignal) async throws
}

public final class SupabaseUserPreferencesRepository: UserPreferencesRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func fetchPreferences() async throws -> UserLearnedPreferences {
        let row: UserPreferencesRowDTO? = try await container.client
            .from("user_preferences")
            .select()
            .single()
            .execute()
            .value
        return row?.toDomain() ?? .empty
    }

    public func reportSignal(_ signal: LearningSignal) async throws {
        let body: LearnSignalRequestBody
        switch signal {
        case .override(let mood, let fragranceProfileId, let intensity):
            body = LearnSignalRequestBody(signal: "override", mood: mood.rawValue, fragranceProfileId: fragranceProfileId, intensity: intensity)
        case .success(let mood, let fragranceProfileId, let intensity):
            body = LearnSignalRequestBody(signal: "success", mood: mood.rawValue, fragranceProfileId: fragranceProfileId, intensity: intensity)
        }

        struct LearnSignalResponseDTO: Decodable {}
        let _: LearnSignalResponseDTO = try await container.client.functions.invoke(
            "learn-preferences",
            options: FunctionInvokeOptions(body: body)
        )
    }
}
