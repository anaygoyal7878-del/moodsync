import Foundation
import MoodSyncCore

#if canImport(HealthKit)
import HealthKit

/// Maps every `MetricKey` the mood engine consumes to the exact HealthKit
/// type it's sourced from. Centralizing this mapping means the
/// authorization request list and the query logic can never drift apart —
/// both read from here.
enum HealthKitTypeMapping {
    static var readTypes: Set<HKObjectType> {
        var types: Set<HKObjectType> = [
            HKObjectType.quantityType(forIdentifier: .heartRate)!,
            HKObjectType.quantityType(forIdentifier: .restingHeartRate)!,
            HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!,
            HKObjectType.quantityType(forIdentifier: .respiratoryRate)!,
            HKObjectType.quantityType(forIdentifier: .walkingHeartRateAverage)!,
            HKObjectType.quantityType(forIdentifier: .stepCount)!,
            HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!,
            HKObjectType.categoryType(forIdentifier: .mindfulSession)!,
            HKObjectType.workoutType(),
        ]
        types.insert(HKObjectType.workoutType())
        return types
    }

    static func quantityType(for metric: MetricKey) -> HKQuantityType? {
        switch metric {
        case .heartRate: return HKObjectType.quantityType(forIdentifier: .heartRate)
        case .restingHeartRate: return HKObjectType.quantityType(forIdentifier: .restingHeartRate)
        case .hrvSDNN: return HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)
        case .respiratoryRate: return HKObjectType.quantityType(forIdentifier: .respiratoryRate)
        case .walkingHeartRateAverage: return HKObjectType.quantityType(forIdentifier: .walkingHeartRateAverage)
        case .activityStepsToday: return HKObjectType.quantityType(forIdentifier: .stepCount)
        case .sleepMinutesLast24h, .mindfulMinutesToday, .workoutRecencyMinutes, .timeOfDayHour:
            return nil
        }
    }
}
#endif
