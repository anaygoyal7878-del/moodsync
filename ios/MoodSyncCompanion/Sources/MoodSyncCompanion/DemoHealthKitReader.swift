import Foundation

/// A `HealthKitReading` stand-in that returns fixed, clearly-synthetic
/// values instead of touching HealthKit at all. Exists so the app's
/// full sign-in → sync → HomeKit-check flow can be exercised in the
/// Simulator (or on a device without real Health app data) without the
/// friction of manually seeding sample data in the Health app first —
/// this is a demo/QA convenience, not a data source: nothing it returns
/// is ever presented as real, and `deviceName` says so explicitly so a
/// screenshot or the dashboard's activity feed can't be mistaken for a
/// genuine reading. Selected via `MoodSyncCompanionView`'s "Use Demo
/// Health Data" toggle — the real `HealthKitReader` remains the
/// default.
public final class DemoHealthKitReader: HealthKitReading, @unchecked Sendable {
    public init() {}

    public func isHealthDataAvailable() -> Bool { true }

    public func requestAuthorization() async throws {
        // No-op: there is nothing to authorize since no real HealthKit
        // API is touched.
    }

    public func readCurrentSnapshot() async throws -> NormalizedReading {
        var reading = NormalizedReading(
            timestamp: Date(),
            heartRate: 68,
            restingHeartRate: 58,
            heartRateVariability: 42,
            respiratoryRate: 15,
            bloodOxygen: 98,
            sleepScore: 82,
            steps: 6_240,
            calories: 410,
            deviceName: "Demo Data (not a real device)"
        )
        reading.activityLevel = ActivityLevel.from(steps: reading.steps ?? 0)
        return reading
    }

    public func enableBackgroundDelivery(onUpdate: @escaping @Sendable () -> Void) async throws {
        // No real HealthKit observer to register — background delivery
        // is meaningless for static demo data, so this simply never
        // calls `onUpdate`.
    }
}
