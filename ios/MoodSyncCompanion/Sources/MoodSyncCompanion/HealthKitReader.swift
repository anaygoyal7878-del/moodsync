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
    /// Registers for background delivery (`HKObserverQuery` +
    /// `enableBackgroundDelivery`) so `onUpdate` is invoked when HealthKit
    /// reports new data for a watched type. Per Apple's documented
    /// behavior this is not immediate or guaranteed — see
    /// docs/APPLE_HEALTH_ARCHITECTURE.md §7. Callers still need the
    /// Background Modes capability for the system to actually wake the
    /// app; registering the query is necessary but not sufficient.
    func enableBackgroundDelivery(onUpdate: @escaping @Sendable () -> Void) async throws
}

#if canImport(HealthKit)
import HealthKit

public final class HealthKitReader: HealthKitReading, @unchecked Sendable {
    private let store = HKHealthStore()

    public init() {}

    /// Every type this reader ever queries — the authorization request
    /// list and the query methods below must never drift apart, so both
    /// are derived from this one set. Every identifier here was confirmed
    /// against a live `developer.apple.com/documentation/healthkit` fetch
    /// during this round's design pass — see
    /// docs/APPLE_HEALTH_ARCHITECTURE.md §6 for the full table (including
    /// what's read-but-not-yet-synced, like workouts, and what's flagged
    /// as unavailable, like device battery).
    private static var readTypes: Set<HKObjectType> {
        [
            HKObjectType.quantityType(forIdentifier: .heartRate),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
            HKObjectType.quantityType(forIdentifier: .respiratoryRate),
            HKObjectType.quantityType(forIdentifier: .oxygenSaturation),
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.quantityType(forIdentifier: .activeEnergyBurned),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
            // Authorization requested now so a future round that actually
            // syncs workout sessions doesn't need a new permission prompt
            // — see docs/APPLE_HEALTH_ARCHITECTURE.md §11 for why workout
            // *data* isn't synced yet even though it's authorized.
            HKObjectType.workoutType(),
        ].compactMap { $0 }.reduce(into: Set<HKObjectType>()) { $0.insert($1) }
    }

    /// The subset of `readTypes` that are `HKSampleType` — the type
    /// `HKObserverQuery`/`enableBackgroundDelivery` require. (Every type
    /// currently in `readTypes` happens to be a sample type, but this is
    /// computed rather than assumed in case a future characteristic-type
    /// addition — e.g. blood type, which isn't observable — changes that.)
    private static var observableSampleTypes: [HKSampleType] {
        readTypes.compactMap { $0 as? HKSampleType }
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
        // SDNN is stored in HealthKit as seconds (HKUnit.secondUnit); the
        // conventional display unit for HRV is milliseconds.
        async let heartRateVariability = mostRecentQuantityValue(
            .heartRateVariabilitySDNN,
            unit: .secondUnit(with: .milli),
        )
        async let respiratoryRate = mostRecentQuantityValue(.respiratoryRate, unit: .count().unitDivided(by: .minute()))
        async let bloodOxygen = mostRecentQuantityValue(.oxygenSaturation, unit: .percent())
        async let steps = cumulativeQuantityToday(.stepCount, unit: .count())
        async let calories = cumulativeQuantityToday(.activeEnergyBurned, unit: .kilocalorie())
        async let sleepScore = sleepEfficiencyLast24h()
        async let deviceName = mostRecentDeviceName()

        let resolvedSteps = try await steps
        // .oxygenSaturation is stored as a 0-1 fraction; MoodSync's
        // convention (matching every other 0-100 field) is a percentage.
        let resolvedBloodOxygen = try await bloodOxygen.map { $0 * 100 }
        var reading = NormalizedReading(
            timestamp: Date(),
            heartRate: try await heartRate,
            restingHeartRate: try await restingHeartRate,
            heartRateVariability: try await heartRateVariability,
            respiratoryRate: try await respiratoryRate,
            bloodOxygen: resolvedBloodOxygen,
            sleepScore: try await sleepScore,
            steps: resolvedSteps,
            calories: try await calories,
            deviceName: try await deviceName
        )
        if let resolvedSteps { reading.activityLevel = ActivityLevel.from(steps: resolvedSteps) }
        return reading
    }

    public func enableBackgroundDelivery(onUpdate: @escaping @Sendable () -> Void) async throws {
        guard isHealthDataAvailable() else { throw HealthKitError.notAvailableOnThisDevice }

        for sampleType in Self.observableSampleTypes {
            let query = HKObserverQuery(sampleType: sampleType, predicate: nil) { _, completionHandler, _ in
                // The completion handler must always be called, even on
                // error, or HealthKit stops delivering updates for this
                // observer — see docs/APPLE_HEALTH_ARCHITECTURE.md §7.
                defer { completionHandler() }
                onUpdate()
            }
            store.execute(query)

            // Heart rate gets the most aggressive frequency since it's
            // what "near-live" is built on; everything else is a lower
            // background-battery cost at `.hourly`.
            let frequency: HKUpdateFrequency = sampleType == HKObjectType.quantityType(forIdentifier: .heartRate)
                ? .immediate
                : .hourly
            try await requestBackgroundDelivery(for: sampleType, frequency: frequency)
        }
    }

    private func requestBackgroundDelivery(for sampleType: HKSampleType, frequency: HKUpdateFrequency) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            store.enableBackgroundDelivery(for: sampleType, frequency: frequency) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else if success {
                    continuation.resume()
                } else {
                    continuation.resume(throwing: HealthKitError.authorizationFailed("enableBackgroundDelivery returned false"))
                }
            }
        }
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

    /// `HKDevice` (confirmed fields: `name`, `manufacturer`, `model`,
    /// `hardwareVersion`, `firmwareVersion`, `softwareVersion`,
    /// `localIdentifier`, `udiDeviceIdentifier` — no battery property
    /// anywhere, see docs/APPLE_HEALTH_ARCHITECTURE.md §6) is metadata on
    /// a sample, not a standalone query — read it off the most recent
    /// heart-rate sample, since that's the metric most likely to have
    /// been recorded by the Watch itself rather than a manual/other-app
    /// entry.
    private func mostRecentDeviceName() async throws -> String? {
        guard let type = HKObjectType.quantityType(forIdentifier: .heartRate) else { return nil }
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let device = samples?.first?.device
                continuation.resume(returning: device?.name ?? device?.model)
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
