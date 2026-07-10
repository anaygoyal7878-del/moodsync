import Foundation

/// A point-in-time bundle of aggregated HealthKit-derived values. Built by
/// the app's HealthKit repository layer (not part of this package, which
/// stays HealthKit-framework-free so the scoring logic is unit-testable on
/// any platform SwiftPM supports).
public struct MoodMetricSnapshot: Sendable, Equatable {
    public var values: [MetricKey: Double]
    public let capturedAt: Date

    public init(values: [MetricKey: Double], capturedAt: Date = Date()) {
        self.values = values
        self.capturedAt = capturedAt
    }

    public func value(for key: MetricKey) -> Double? {
        values[key]
    }
}
