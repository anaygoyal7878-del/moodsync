import Foundation

/// Combines multiple HealthKit-derived signals into a single inferred mood
/// using a weighted scoring model per candidate mood, then a softmax over
/// those scores to produce a calibrated confidence distribution. There is
/// deliberately no branching if/else mood logic — every mood's sensitivity
/// to every metric is expressed as configurable weight/curve data in
/// `MoodEngineConfiguration`, so improving the model means tuning numbers,
/// not editing control flow.
public final class MoodEngine: Sendable {
    private let configuration: MoodEngineConfiguration

    public init(configuration: MoodEngineConfiguration = .default) {
        self.configuration = configuration
    }

    public func infer(from snapshot: MoodMetricSnapshot) -> MoodInference {
        var rawScores: [MoodLabel: Double] = [:]

        for profile in configuration.profiles {
            rawScores[profile.mood] = weightedScore(for: profile, snapshot: snapshot)
        }

        let probabilities = softmax(rawScores, temperature: configuration.confidenceTemperature)
        let winner = probabilities.max { $0.value < $1.value } ?? (.relaxed, 0)

        let winningProfile = configuration.profile(for: winner.key)
        let contributingFactors = (winningProfile?.metricWeights ?? [])
            .filter { $0.weight >= 0.15 && snapshot.value(for: $0.metric) != nil }
            .map(\.metric)

        return MoodInference(
            mood: winner.key,
            confidence: winner.value,
            componentScores: rawScores,
            contributingFactors: contributingFactors,
            engineVersion: configuration.version,
            inferredAt: snapshot.capturedAt
        )
    }

    /// Weighted average of each present metric's curve score, renormalized
    /// over only the weights of metrics actually available in the snapshot
    /// so missing HealthKit data doesn't silently drag a mood's score down.
    private func weightedScore(for profile: MoodWeightProfile, snapshot: MoodMetricSnapshot) -> Double {
        var weightedSum = 0.0
        var weightTotal = 0.0

        for metricWeight in profile.metricWeights {
            guard let rawValue = snapshot.value(for: metricWeight.metric) else { continue }
            let score = metricWeight.curve.score(for: rawValue)
            weightedSum += metricWeight.weight * score
            weightTotal += metricWeight.weight
        }

        guard weightTotal > 0 else { return 0.5 } // neutral prior with zero signal
        return weightedSum / weightTotal
    }

    private func softmax(_ scores: [MoodLabel: Double], temperature: Double) -> [MoodLabel: Double] {
        guard !scores.isEmpty else { return [:] }
        let t = max(temperature, 0.01)
        let exponentiated = scores.mapValues { exp($0 / t) }
        let sum = exponentiated.values.reduce(0, +)
        guard sum > 0 else {
            let uniform = 1.0 / Double(scores.count)
            return scores.mapValues { _ in uniform }
        }
        return exponentiated.mapValues { $0 / sum }
    }
}
