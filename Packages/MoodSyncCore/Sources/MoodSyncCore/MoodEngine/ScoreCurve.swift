import Foundation

/// A piecewise-linear function mapping a raw metric value to a 0...1
/// desirability score for a given mood. Expressing scoring as data (control
/// points) rather than branching code is what makes the engine
/// configurable/tunable without touching Swift logic.
public struct ScorePoint: Codable, Sendable, Equatable {
    public let x: Double
    public let y: Double

    public init(x: Double, y: Double) {
        self.x = x
        self.y = y
    }
}

public struct ScoreCurve: Codable, Sendable, Equatable {
    /// Must be sorted ascending by `x`.
    public let points: [ScorePoint]

    public init(points: [ScorePoint]) {
        precondition(points.count >= 2, "A ScoreCurve needs at least two points")
        self.points = points.sorted { $0.x < $1.x }
    }

    /// Linear interpolation between the two nearest control points; clamps
    /// to the curve's first/last y value outside its domain.
    public func score(for rawValue: Double) -> Double {
        guard let first = points.first, let last = points.last else { return 0.5 }
        if rawValue <= first.x { return first.y }
        if rawValue >= last.x { return last.y }

        for (lower, upper) in zip(points, points.dropFirst()) {
            if rawValue >= lower.x && rawValue <= upper.x {
                let span = upper.x - lower.x
                guard span > 0 else { return lower.y }
                let t = (rawValue - lower.x) / span
                return lower.y + t * (upper.y - lower.y)
            }
        }
        return last.y
    }
}
