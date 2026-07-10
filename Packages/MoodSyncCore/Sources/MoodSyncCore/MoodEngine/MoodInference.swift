import Foundation

public struct MoodInference: Sendable, Equatable {
    public let mood: MoodLabel
    /// Softmax-normalized confidence across all candidate moods, 0...1.
    public let confidence: Double
    /// Raw weighted score (before softmax) for every mood, useful for
    /// debugging/tuning and for the `component_scores` column sent to
    /// `mood-ingest`.
    public let componentScores: [MoodLabel: Double]
    /// Which metrics were both present in the snapshot and materially
    /// weighted (>= 0.15) in the winning mood's profile.
    public let contributingFactors: [MetricKey]
    public let engineVersion: String
    public let inferredAt: Date
}
