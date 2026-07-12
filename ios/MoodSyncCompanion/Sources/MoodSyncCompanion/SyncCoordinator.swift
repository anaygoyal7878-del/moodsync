import Foundation

public enum SyncResult: Sendable, Equatable {
    case success(readingsInserted: Int)
    case failure(String)
}

/// Orchestrates one sync cycle: read HealthKit, push to the backend.
/// Kept separate from `HealthKitReader`/`MoodSyncAPIClient` so it's
/// testable against fakes of both without touching HealthKit or the
/// network.
public final class SyncCoordinator {
    private let healthKit: HealthKitReading
    private let apiClient: MoodSyncAPIClientProtocol

    public init(healthKit: HealthKitReading, apiClient: MoodSyncAPIClientProtocol) {
        self.healthKit = healthKit
        self.apiClient = apiClient
    }

    public func sync(accessToken: String) async -> SyncResult {
        do {
            try await healthKit.requestAuthorization()
            let reading = try await healthKit.readCurrentSnapshot()
            let inserted = try await apiClient.ingest(readings: [reading], accessToken: accessToken)
            return .success(readingsInserted: inserted)
        } catch let error as HealthKitError {
            return .failure(describeHealthKitError(error))
        } catch let error as MoodSyncAPIError {
            return .failure(describeAPIError(error))
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    private func describeHealthKitError(_ error: HealthKitError) -> String {
        switch error {
        case .notAvailableOnThisDevice:
            return "Health data isn't available on this device."
        case .authorizationFailed(let message):
            return "Couldn't get permission to read Health data: \(message)"
        }
    }

    private func describeAPIError(_ error: MoodSyncAPIError) -> String {
        switch error {
        case .notAuthenticated:
            return "Your session expired — log in again."
        case .requestFailed(let status, _):
            return "Sync failed (server returned \(status))."
        }
    }
}
