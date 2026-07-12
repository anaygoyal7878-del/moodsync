import Foundation

public enum HealthKitError: Error, Sendable {
    case notAvailableOnThisDevice
    case authorizationFailed(String)
}

/// Thin, testable seam over HealthKit — mirrors the pattern already
/// proven to compile in this repo's other Swift package
/// (`Packages/MoodSyncCore/Sources/MoodSyncHealthKit/HealthKitAuthorizationManager.swift`):
/// a plain protocol the app layer depends on, with the real `HKHealthStore`-backed
/// implementation behind `#if canImport(HealthKit)` so this file still
/// compiles (with the guarded implementation simply absent) anywhere
/// HealthKit isn't available.
public protocol HealthKitReading: Sendable {
    func isHealthDataAvailable() -> Bool
    func requestAuthorization() async throws
    /// One `NormalizedReading` for "right now" — heart rate and resting
    /// heart rate are most-recent-sample reads, steps/calories are
    /// cumulative-today sums, sleepScore is efficiency over the last 24h.
    /// Matches the single-reading-per-sync-call shape every other
    /// provider in this product uses (see `ai/src/dispatch.ts`'s
    /// "only the latest reading" rationale).
    func readCurrentSnapshot() async throws -> NormalizedReading
}

#if canImport(HealthKit)
import HealthKit

public final class HealthKitReader: HealthKitReading, @unchecked Sendable {
    private let store = HKHealthStore()

    public init() {}

    /// Every type this reader ever queries — the authorization request
    /// list and the query methods below must never drift apart, so both
    /// are derived from this one set.
    private static var readTypes: Set<HKObjectType> {
        [
            HKObjectType.quantityType(forIdentifier: .heartRate),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
        ].compactMap { $0 }.reduce(into: Set<HKObjectType>()) { $0.insert($1) }
    }

    public func isHealthDataAvailable() -> Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    public func requestAuthorization() async throws {
        guard isHealthDataAvailable() else { throw HealthKitError.notAvailableOnThisDevice }
        do {
            // Read-only, same privacy stance as every provider in this
            // product — MoodSync never writes health data anywhere.
            try await store.requestAuthorization(toShare: [], read: Self.readTypes)
        } catch {
            throw HealthKitError.authorizationFailed(error.localizedDescription)
        }
    }

    public func readCurrentSnapshot() async throws -> NormalizedReading {
        async let heartRate = mostRecentQuantityValue(.heartRate, unit: .count().unitDivided(by: .minute()))
        async let restingHeartRate = mostRecentQuantityValue(.restingHeartRate, unit: .count().unitDivided(by: .minute()))
        async let steps = cumulativeQuantityToday(.stepCount, unit: .count())
        async let calories = cumulativeQuantityToday(.activeEnergyBurned, unit: .kilocalorie())
        async let sleepScore = sleepEfficiencyLast24h()

        let resolvedSteps = try await steps
        var reading = NormalizedReading(
            timestamp: Date(),
            heartRate: try await heartRate,
            restingHeartRate: try await restingHeartRate,
            sleepScore: try await sleepScore,
            steps: resolvedSteps,
            calories: try await calories
        )
        if let resolvedSteps { reading.activityLevel = ActivityLevel.from(steps: resolvedSteps) }
        return reading
    }

    // MARK: - Quantity samples (verified query shape — see
    // Packages/MoodSyncCore/Sources/MoodSyncHealthKit/HealthMetricSnapshotBuilder.swift,
    // which this mirrors)

    private func mostRecentQuantityValue(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                guard let sample = samples?.first as? HKQuantitySample else {
                    continuation.resume(returning: nil)
                    return
                }
                continuation.resume(returning: sample.quantity.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private func cumulativeQuantityToday(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: statistics?.sumQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    // MARK: - Sleep

    private func sleepEfficiencyLast24h() async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let start = Date().addingTimeInterval(-24 * 60 * 60)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)

        let categorySamples: [HKCategorySample] = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKCategorySample]) ?? [])
            }
            store.execute(query)
        }

        let stageSamples = categorySamples.compactMap { sample -> SleepStageSample? in
            guard let stage = Self.stage(for: sample.value) else { return nil }
            return SleepStageSample(stage: stage, start: sample.startDate, end: sample.endDate)
        }
        return SleepEfficiencyCalculator.efficiency(from: stageSamples)
    }

    private static func stage(for categoryValue: Int) -> SleepStageSample.Stage? {
        switch categoryValue {
        case HKCategoryValueSleepAnalysis.inBed.rawValue:
            return .inBed
        case HKCategoryValueSleepAnalysis.awake.rawValue:
            return .awake
        case HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
             HKCategoryValueSleepAnalysis.asleepCore.rawValue,
             HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
             HKCategoryValueSleepAnalysis.asleepREM.rawValue:
            return .asleep
        default:
            return nil
        }
    }
}
#endif
