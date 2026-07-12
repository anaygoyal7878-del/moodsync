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
    /// Standard deviation of NN intervals, in milliseconds
    /// (`HKQuantityTypeIdentifier.heartRateVariabilitySDNN`) — confirmed
    /// real HealthKit identifier, see docs/APPLE_HEALTH_ARCHITECTURE.md §6.
    public var heartRateVariability: Double?
    /// Breaths per minute (`.respiratoryRate`).
    public var respiratoryRate: Double?
    /// 0-100 percentage (`.oxygenSaturation`) — see
    /// docs/APPLE_HEALTH_ARCHITECTURE.md §6 for a real caveat about this
    /// metric's availability on some US Apple Watch hardware.
    public var bloodOxygen: Double?
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
    /// The name of the device that recorded the most recent heart-rate
    /// sample (from `HKSample.device`) — e.g. "Apple Watch". HealthKit has
    /// no battery-level API for paired devices at all (confirmed:
    /// `HKDevice` has no battery property), so unlike Google Health there
    /// is no `batteryLevel`/`batteryStatus` here — see
    /// docs/APPLE_HEALTH_ARCHITECTURE.md §6.
    public var deviceName: String?

    public init(
        timestamp: Date,
        heartRate: Double? = nil,
        restingHeartRate: Double? = nil,
        heartRateVariability: Double? = nil,
        respiratoryRate: Double? = nil,
        bloodOxygen: Double? = nil,
        sleepScore: Double? = nil,
        steps: Double? = nil,
        calories: Double? = nil,
        activityLevel: Double? = nil,
        deviceName: String? = nil
    ) {
        self.timestamp = timestamp
        self.heartRate = heartRate
        self.restingHeartRate = restingHeartRate
        self.heartRateVariability = heartRateVariability
        self.respiratoryRate = respiratoryRate
        self.bloodOxygen = bloodOxygen
        self.sleepScore = sleepScore
        self.steps = steps
        self.calories = calories
        self.activityLevel = activityLevel
        self.deviceName = deviceName
    }
}

public enum ActivityLevel {
    /// Matches `integrations/fitbit/src/normalize.ts`'s `STEPS_FOR_FULL_ACTIVITY`.
    public static let stepsForFullActivity: Double = 10_000

    public static func from(steps: Double) -> Double {
        min(100, (steps / stepsForFullActivity) * 100)
    }
}
