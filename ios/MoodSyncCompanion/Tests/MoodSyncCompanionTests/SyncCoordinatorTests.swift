import XCTest
@testable import MoodSyncCompanion

private final class FakeHealthKitReader: HealthKitReading, @unchecked Sendable {
    var authorizationError: HealthKitError?
    var snapshot = NormalizedReading(timestamp: Date(), heartRate: 62, steps: 5000)

    func isHealthDataAvailable() -> Bool { true }

    func requestAuthorization() async throws {
        if let authorizationError { throw authorizationError }
    }

    func readCurrentSnapshot() async throws -> NormalizedReading { snapshot }

    func enableBackgroundDelivery(onUpdate: @escaping @Sendable () -> Void) async throws {}
}

private final class FakeAPIClient: MoodSyncAPIClientProtocol, @unchecked Sendable {
    var ingestError: MoodSyncAPIError?
    var insertedCount = 1
    private(set) var lastIngestedReadings: [NormalizedReading] = []
    private(set) var lastIngestedDeviceName: String?

    func login(email: String, password: String) async throws -> MoodSyncTokens {
        MoodSyncTokens(accessToken: "fake-token", refreshToken: "fake-refresh")
    }

    func ingest(readings: [NormalizedReading], deviceName: String?, accessToken: String) async throws -> Int {
        if let ingestError { throw ingestError }
        lastIngestedReadings = readings
        lastIngestedDeviceName = deviceName
        return insertedCount
    }

    var pendingCommands: [PendingDeviceCommand] = []
    var fetchPendingError: MoodSyncAPIError?
    private(set) var completedCommandIDs: [(id: String, outcome: PendingDeviceCommandOutcome)] = []

    func fetchPendingDeviceCommands(accessToken: String) async throws -> [PendingDeviceCommand] {
        if let fetchPendingError { throw fetchPendingError }
        return pendingCommands
    }

    func completePendingDeviceCommand(id: String, status: PendingDeviceCommandOutcome, accessToken: String) async throws {
        completedCommandIDs.append((id, status))
    }
}

final class SyncCoordinatorTests: XCTestCase {
    func testSuccessfulSyncReturnsInsertedCount() async {
        let healthKit = FakeHealthKitReader()
        let api = FakeAPIClient()
        api.insertedCount = 1
        let coordinator = SyncCoordinator(healthKit: healthKit, apiClient: api)

        let result = await coordinator.sync(accessToken: "token")

        XCTAssertEqual(result, .success(readingsInserted: 1))
        XCTAssertEqual(api.lastIngestedReadings, [healthKit.snapshot])
    }

    func testSyncPassesDeviceNameThroughToTheAPIClient() async {
        let healthKit = FakeHealthKitReader()
        healthKit.snapshot.deviceName = "Apple Watch"
        let api = FakeAPIClient()
        let coordinator = SyncCoordinator(healthKit: healthKit, apiClient: api)

        _ = await coordinator.sync(accessToken: "token")

        XCTAssertEqual(api.lastIngestedDeviceName, "Apple Watch")
    }

    func testHealthKitAuthorizationFailureIsSurfacedAsFailure() async {
        let healthKit = FakeHealthKitReader()
        healthKit.authorizationError = .notAvailableOnThisDevice
        let coordinator = SyncCoordinator(healthKit: healthKit, apiClient: FakeAPIClient())

        let result = await coordinator.sync(accessToken: "token")

        guard case .failure = result else { return XCTFail("expected failure, got \(result)") }
    }

    func testExpiredSessionIsSurfacedAsFailure() async {
        let api = FakeAPIClient()
        api.ingestError = .notAuthenticated
        let coordinator = SyncCoordinator(healthKit: FakeHealthKitReader(), apiClient: api)

        let result = await coordinator.sync(accessToken: "expired-token")

        guard case .failure(let message) = result else { return XCTFail("expected failure, got \(result)") }
        XCTAssertTrue(message.lowercased().contains("expired"))
    }
}
