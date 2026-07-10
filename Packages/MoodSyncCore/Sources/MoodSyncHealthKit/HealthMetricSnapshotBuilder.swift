import Foundation
import MoodSyncCore

public protocol HealthMetricSnapshotProviding: Sendable {
    func currentSnapshot() async throws -> MoodMetricSnapshot
}

#if canImport(HealthKit)
import HealthKit

/// Builds a `MoodMetricSnapshot` by querying HealthKit directly. Every
/// query here reads only what `MoodEngine` actually consumes — this
/// package never requests, stores, or forwards raw samples beyond what's
/// needed to compute the aggregates in `MetricKey`.
public final class HealthMetricSnapshotBuilder: HealthMetricSnapshotProviding, @unchecked Sendable {
    private let store = HKHealthStore()

    public init() {}

    public func currentSnapshot() async throws -> MoodMetricSnapshot {
        async let heartRate = mostRecentQuantityValue(.heartRate, unit: .count().unitDivided(by: .minute()))
        async let restingHeartRate = mostRecentQuantityValue(.restingHeartRate, unit: .count().unitDivided(by: .minute()))
        async let hrvSDNN = mostRecentQuantityValue(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli))
        async let respiratoryRate = mostRecentQuantityValue(.respiratoryRate, unit: .count().unitDivided(by: .minute()))
        async let walkingHeartRateAverage = mostRecentQuantityValue(.walkingHeartRateAverage, unit: .count().unitDivided(by: .minute()))
        async let stepsToday = cumulativeQuantityToday(.stepCount, unit: .count())
        async let sleepMinutes = sleepMinutesLast24h()
        async let mindfulMinutes = mindfulMinutesToday()
        async let workoutRecency = workoutRecencyMinutes()

        var values: [MetricKey: Double] = [:]
        if let v = try await heartRate { values[.heartRate] = v }
        if let v = try await restingHeartRate { values[.restingHeartRate] = v }
        if let v = try await hrvSDNN { values[.hrvSDNN] = v }
        if let v = try await respiratoryRate { values[.respiratoryRate] = v }
        if let v = try await walkingHeartRateAverage { values[.walkingHeartRateAverage] = v }
        if let v = try await stepsToday { values[.activityStepsToday] = v }
        if let v = try await sleepMinutes { values[.sleepMinutesLast24h] = v }
        if let v = try await mindfulMinutes { values[.mindfulMinutesToday] = v }
        if let v = try await workoutRecency { values[.workoutRecencyMinutes] = v }
        values[.timeOfDayHour] = Double(Calendar.current.component(.hour, from: Date()))

        return MoodMetricSnapshot(values: values)
    }

    // MARK: - Quantity samples

    private func mostRecentQuantityValue(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async throws -> Double? {
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

    private func cumulativeQuantityToday(
        _ identifier: HKQuantityTypeIdentifier,
        unit: HKUnit
    ) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { return nil }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)

        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                let sum = statistics?.sumQuantity()?.doubleValue(for: unit)
                continuation.resume(returning: sum)
            }
            store.execute(query)
        }
    }

    // MARK: - Category samples

    private static let asleepValues: Set<Int> = [
        HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
        HKCategoryValueSleepAnalysis.asleepCore.rawValue,
        HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
        HKCategoryValueSleepAnalysis.asleepREM.rawValue,
    ]

    private func sleepMinutesLast24h() async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { return nil }
        let start = Date().addingTimeInterval(-24 * 60 * 60)
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date(), options: .strictStartDate)

        let samples = try await categorySamples(type: type, predicate: predicate)
        let asleepMinutes = samples
            .filter { Self.asleepValues.contains($0.value) }
            .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 }
        return asleepMinutes
    }

    private func mindfulMinutesToday() async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .mindfulSession) else { return nil }
        let startOfDay = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: startOfDay, end: Date(), options: .strictStartDate)

        let samples = try await categorySamples(type: type, predicate: predicate)
        return samples.reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) / 60 }
    }

    private func categorySamples(type: HKCategoryType, predicate: NSPredicate) async throws -> [HKCategorySample] {
        try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: (samples as? [HKCategorySample]) ?? [])
            }
            store.execute(query)
        }
    }

    // MARK: - Workouts

    private func workoutRecencyMinutes() async throws -> Double? {
        let sortDescriptor = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)

        let mostRecentWorkout: HKWorkout? = try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(sampleType: HKObjectType.workoutType(), predicate: nil, limit: 1, sortDescriptors: [sortDescriptor]) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }
                continuation.resume(returning: samples?.first as? HKWorkout)
            }
            store.execute(query)
        }

        guard let workout = mostRecentWorkout else { return nil }
        return Date().timeIntervalSince(workout.endDate) / 60
    }
}
#endif
