import Foundation

/// Mirrors `user_preferences` — continuously updated by the
/// `learn-preferences` Edge Function from override/success signals, never
/// hardcoded per-user.
public struct UserLearnedPreferences: Codable, Sendable, Equatable {
    public let scentAffinity: [String: Double] // fragranceProfileId -> learned affinity 0...1
    public let intensityPreference: [MoodLabel: Double] // mood -> learned intensity 0...1

    public init(scentAffinity: [String: Double], intensityPreference: [MoodLabel: Double]) {
        self.scentAffinity = scentAffinity
        self.intensityPreference = intensityPreference
    }

    public static let empty = UserLearnedPreferences(scentAffinity: [:], intensityPreference: [:])
}
