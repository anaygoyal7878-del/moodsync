import Foundation

/// A minimal, HealthKit-independent view of one `HKCategorySample` from
/// `.sleepAnalysis` — just enough to compute efficiency. Kept separate
/// from `HKCategorySample` itself so this calculation is unit-testable
/// without HealthKit or a real device/simulator.
public struct SleepStageSample: Equatable, Sendable {
    public enum Stage: Equatable, Sendable {
        case inBed
        case asleep
        case awake
    }

    public let stage: Stage
    public let start: Date
    public let end: Date

    public init(stage: Stage, start: Date, end: Date) {
        self.stage = stage
        self.start = start
        self.end = end
    }

    var durationSeconds: TimeInterval { end.timeIntervalSince(start) }
}

/// Sleep efficiency (time asleep ÷ time asleep+awake), the same standard
/// published sleep-medicine metric this product's Google Health
/// integration uses for the same reason: HealthKit's `.sleepAnalysis`
/// category has no single numeric "sleep score" field, only stage
/// segments (see Apple's `HKCategoryValueSleepAnalysis` — inBed,
/// asleepUnspecified/asleepCore/asleepDeep/asleepREM, awake). `.inBed`
/// segments are deliberately excluded from the denominator: on modern
/// Apple Watch data `.inBed` and the asleep/awake stages typically
/// overlap in time rather than being additive, so summing all three
/// would double-count — only asleep vs. awake (which are disjoint) are
/// used, matching this metric's standard definition.
public enum SleepEfficiencyCalculator {
    public static func efficiency(from samples: [SleepStageSample]) -> Double? {
        var asleepSeconds: TimeInterval = 0
        var awakeSeconds: TimeInterval = 0

        for sample in samples {
            switch sample.stage {
            case .asleep: asleepSeconds += sample.durationSeconds
            case .awake: awakeSeconds += sample.durationSeconds
            case .inBed: continue
            }
        }

        let total = asleepSeconds + awakeSeconds
        guard total > 0 else { return nil }
        return min(100, max(0, (asleepSeconds / total) * 100))
    }
}
