import Foundation

/// Health signals the mood engine can weigh. Each case maps to a HealthKit
/// quantity/category type the app requests permission for and aggregates
/// on-device — see `HealthKitMetricProviding` in the app layer for the
/// HKObjectType this is sourced from. No metric here is derived from a
/// HealthKit type that doesn't exist.
public enum MetricKey: String, Codable, CaseIterable, Sendable {
    /// Most recent instantaneous heart rate sample (bpm). HKQuantityTypeIdentifier.heartRate
    case heartRate
    /// Resting heart rate (bpm). HKQuantityTypeIdentifier.restingHeartRate
    case restingHeartRate
    /// Heart rate variability, SDNN (ms). HKQuantityTypeIdentifier.heartRateVariabilitySDNN
    case hrvSDNN
    /// Respiratory rate (breaths/min). HKQuantityTypeIdentifier.respiratoryRate
    case respiratoryRate
    /// Walking heart rate average (bpm). HKQuantityTypeIdentifier.walkingHeartRateAverage
    case walkingHeartRateAverage
    /// Minutes asleep in the last 24h. HKCategoryTypeIdentifier.sleepAnalysis
    case sleepMinutesLast24h
    /// Minutes of mindful sessions logged today. HKCategoryTypeIdentifier.mindfulSession
    case mindfulMinutesToday
    /// Minutes since the most recently ended HKWorkout (large = no recent workout).
    case workoutRecencyMinutes
    /// Step count / active energy proxy for general activity today (HKQuantityTypeIdentifier.stepCount).
    case activityStepsToday
    /// Hour of day, 0-23, local time. Not a HealthKit metric, but a first-class
    /// input since circadian timing materially changes what mood is likely.
    case timeOfDayHour
}
