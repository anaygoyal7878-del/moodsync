import Foundation

/// Mirrors `backend/src/api/routes/integrations/appleHealth.ts`'s
/// `readingSchema` field-for-field — keep the two in sync manually (no
/// shared codegen between Swift and the Zod schema), including which
/// fields are optional. `provider`/`userId` are not included here: the
/// backend infers `provider` from the endpoint itself and `userId` from
/// the session JWT, the same way every other sync path in this codebase
/// never lets a client assert its own identity.
public struct NormalizedReading: Codable, Equatable, Sendable {
    public let timestamp: Date
    public var heartRate: Double?
    public var restingHeartRate: Double?
    /// 0-100 sleep efficiency (time asleep / time asleep+awake) — HealthKit
    /// has no single "sleep score" field, same reasoning as this product's
    /// Google Health integration (see docs/INTEGRATIONS_RESEARCH.md).
    public var sleepScore: Double?
    public var steps: Double?
    public var calories: Double?
    /// 0-100, steps normalized against a 10,000-step benchmark — the same
    /// heuristic `integrations/fitbit/src/normalize.ts` uses, kept
    /// identical across providers so the dashboard's "Activity" metric
    /// means the same thing regardless of source.
    public var activityLevel: Double?

    public init(
        timestamp: Date,
        heartRate: Double? = nil,
        restingHeartRate: Double? = nil,
        sleepScore: Double? = nil,
        steps: Double? = nil,
        calories: Double? = nil,
        activityLevel: Double? = nil
    ) {
        self.timestamp = timestamp
        self.heartRate = heartRate
        self.restingHeartRate = restingHeartRate
        self.sleepScore = sleepScore
        self.steps = steps
        self.calories = calories
        self.activityLevel = activityLevel
    }
}

public enum ActivityLevel {
    /// Matches `integrations/fitbit/src/normalize.ts`'s `STEPS_FOR_FULL_ACTIVITY`.
    public static let stepsForFullActivity: Double = 10_000

    public static func from(steps: Double) -> Double {
        min(100, (steps / stepsForFullActivity) * 100)
    }
}
