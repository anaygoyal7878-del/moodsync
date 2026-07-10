import Foundation
import MoodSyncCore

public protocol HealthKitBackgroundMonitoring: Sendable {
    /// Starts observing every HealthKit type the mood engine depends on and
    /// invokes `onUpdate` whenever new data arrives — including in the
    /// background, once `enableBackgroundDelivery` succeeds. `onUpdate`
    /// should re-run `HealthMetricSnapshotBuilder` + `MoodEngine` and post
    /// the result to `mood-ingest`.
    func startMonitoring(onUpdate: @escaping @Sendable () async -> Void) throws
    func stopMonitoring()
}

#if canImport(HealthKit)
import HealthKit

public final class HealthKitBackgroundMonitor: HealthKitBackgroundMonitoring, @unchecked Sendable {
    private let store = HKHealthStore()
    private var activeQueries: [HKObserverQuery] = []

    public init() {}

    public func startMonitoring(onUpdate: @escaping @Sendable () async -> Void) throws {
        stopMonitoring()

        // Every quantity/category type MoodEngine reads from, per
        // HealthKitTypeMapping — workouts included since a completed
        // workout is itself a meaningful mood-relevant event.
        let observableTypes: [HKSampleType] = [
            HKObjectType.quantityType(forIdentifier: .heartRate),
            HKObjectType.quantityType(forIdentifier: .restingHeartRate),
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN),
            HKObjectType.quantityType(forIdentifier: .respiratoryRate),
            HKObjectType.quantityType(forIdentifier: .walkingHeartRateAverage),
            HKObjectType.quantityType(forIdentifier: .stepCount),
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis),
            HKObjectType.categoryType(forIdentifier: .mindfulSession),
            HKObjectType.workoutType(),
        ].compactMap { $0 }

        for type in observableTypes {
            let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                defer { completionHandler() }
                guard error == nil else { return }
                Task { await onUpdate() }
                _ = self // retain self for the query's lifetime via activeQueries
            }
            store.execute(query)
            activeQueries.append(query)

            store.enableBackgroundDelivery(for: type, frequency: .immediate) { success, error in
                if !success, let error {
                    // Background delivery failures are non-fatal — the app
                    // still gets updates whenever it's in the foreground.
                    assertionFailure("enableBackgroundDelivery failed for \(type): \(error)")
                }
            }
        }
    }

    public func stopMonitoring() {
        for query in activeQueries {
            store.stop(query)
        }
        activeQueries.removeAll()
    }
}
#endif
