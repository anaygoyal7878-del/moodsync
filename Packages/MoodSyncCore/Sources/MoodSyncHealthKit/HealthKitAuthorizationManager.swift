import Foundation

public enum HealthKitAuthorizationError: Error, Sendable {
    case notAvailableOnThisDevice
    case requestFailed(String)
}

/// Thin, testable seam over HealthKit's authorization API. The app layer
/// depends on this protocol rather than `HKHealthStore` directly so
/// permission-gated UI flows (onboarding) can be previewed/tested without
/// a real device.
public protocol HealthKitAuthorizing: Sendable {
    func isHealthDataAvailable() -> Bool
    /// Requests read access for every HealthKit type the mood engine can
    /// use. Per Apple's privacy model this only ever asks for **read**
    /// access — MoodSync never writes to HealthKit.
    func requestAuthorization() async throws
}

#if canImport(HealthKit)
import HealthKit

public final class HealthKitAuthorizationManager: HealthKitAuthorizing, @unchecked Sendable {
    private let store = HKHealthStore()

    public init() {}

    public func isHealthDataAvailable() -> Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    public func requestAuthorization() async throws {
        guard isHealthDataAvailable() else {
            throw HealthKitAuthorizationError.notAvailableOnThisDevice
        }
        try await store.requestAuthorization(toShare: [], read: HealthKitTypeMapping.readTypes)
    }
}
#endif
