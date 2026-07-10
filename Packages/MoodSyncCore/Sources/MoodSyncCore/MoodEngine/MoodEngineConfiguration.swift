import Foundation

public struct MetricWeight: Codable, Sendable, Equatable {
    public let metric: MetricKey
    public let weight: Double
    public let curve: ScoreCurve

    public init(metric: MetricKey, weight: Double, curve: ScoreCurve) {
        self.weight = weight
        self.metric = metric
        self.curve = curve
    }
}

public struct MoodWeightProfile: Codable, Sendable, Equatable {
    public let mood: MoodLabel
    public let metricWeights: [MetricWeight]

    public init(mood: MoodLabel, metricWeights: [MetricWeight]) {
        self.mood = mood
        self.metricWeights = metricWeights
    }
}

/// The full set of tunable weights driving mood inference. Ship a sensible
/// default (`.default`) but load a user- or server-provided override at
/// runtime (e.g. fetched from Supabase and cached) so the model can improve
/// without an app release.
public struct MoodEngineConfiguration: Codable, Sendable, Equatable {
    public let version: String
    public let profiles: [MoodWeightProfile]
    /// Softmax temperature: lower = more decisive (peakier) confidence,
    /// higher = more evenly spread across candidate moods.
    public let confidenceTemperature: Double

    public init(version: String, profiles: [MoodWeightProfile], confidenceTemperature: Double = 0.35) {
        self.version = version
        self.profiles = profiles
        self.confidenceTemperature = confidenceTemperature
    }

    public func profile(for mood: MoodLabel) -> MoodWeightProfile? {
        profiles.first { $0.mood == mood }
    }

    public static func load(from url: URL) throws -> MoodEngineConfiguration {
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(MoodEngineConfiguration.self, from: data)
    }
}
