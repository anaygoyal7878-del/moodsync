import XCTest
@testable import MoodSyncCompanion

private final class FakeHomeKitController: HomeKitControlling, @unchecked Sendable {
    var availableScenes: [String] = ["MoodSync Relax"]
    var activationError: HomeKitError?
    private(set) var activatedScenes: [String] = []

    func isHomeKitAvailable() -> Bool { true }

    func listSceneNames() async throws -> [String] { availableScenes }

    func activateScene(named sceneName: String) async throws {
        if let activationError { throw activationError }
        activatedScenes.append(sceneName)
    }

    func isRestricted() -> Bool { false }
}

private final class FakeDeviceCommandAPIClient: MoodSyncAPIClientProtocol, @unchecked Sendable {
    var pendingCommands: [PendingDeviceCommand] = []
    var fetchError: MoodSyncAPIError?
    private(set) var completions: [(id: String, outcome: PendingDeviceCommandOutcome)] = []

    func login(email: String, password: String) async throws -> MoodSyncTokens {
        MoodSyncTokens(accessToken: "fake-token", refreshToken: "fake-refresh")
    }

    func ingest(readings: [NormalizedReading], deviceName: String?, accessToken: String) async throws -> Int { 0 }

    func fetchPendingDeviceCommands(accessToken: String) async throws -> [PendingDeviceCommand] {
        if let fetchError { throw fetchError }
        return pendingCommands
    }

    func completePendingDeviceCommand(id: String, status: PendingDeviceCommandOutcome, accessToken: String) async throws {
        completions.append((id, status))
    }

    func postLocationEvent(type: LocationEventType, occurredAt: Date, accessToken: String) async throws {}
}

private func makeCommand(id: String = "cmd-1", sceneName: String = "MoodSync Relax") -> PendingDeviceCommand {
    PendingDeviceCommand(
        id: id,
        action: PendingDeviceCommand.Action(
            type: "homekit.activate_scene",
            provider: "homekit",
            params: ["sceneName": .string(sceneName)]
        )
    )
}

final class DeviceCommandCoordinatorTests: XCTestCase {
    func testNoCommandsPendingWhenQueueIsEmpty() async {
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), apiClient: FakeDeviceCommandAPIClient())
        let result = await coordinator.run(accessToken: "token")
        XCTAssertEqual(result, .noCommandsPending)
    }

    func testExecutesAPendingSceneActivationAndReportsSuccess() async {
        let homeKit = FakeHomeKitController()
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeCommand(sceneName: "MoodSync Relax")]
        let coordinator = DeviceCommandCoordinator(homeKit: homeKit, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 1, failed: 0))
        XCTAssertEqual(homeKit.activatedScenes, ["MoodSync Relax"])
        XCTAssertEqual(api.completions.count, 1)
        XCTAssertEqual(api.completions.first?.outcome, .executed)
    }

    func testSceneNotFoundIsReportedAsFailedWithAReadableReason() async {
        let homeKit = FakeHomeKitController()
        homeKit.activationError = .sceneNotFound("Missing Scene")
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeCommand(sceneName: "Missing Scene")]
        let coordinator = DeviceCommandCoordinator(homeKit: homeKit, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 0, failed: 1))
        guard case .failed(let reason) = api.completions.first?.outcome else {
            return XCTFail("expected a failed outcome")
        }
        XCTAssertTrue(reason.contains("Missing Scene"))
    }

    func testMultipleCommandsAreEachExecutedIndependently() async {
        let homeKit = FakeHomeKitController()
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeCommand(id: "cmd-1", sceneName: "MoodSync Relax"), makeCommand(id: "cmd-2", sceneName: "MoodSync Focus")]
        let coordinator = DeviceCommandCoordinator(homeKit: homeKit, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 2, failed: 0))
        XCTAssertEqual(homeKit.activatedScenes, ["MoodSync Relax", "MoodSync Focus"])
    }

    func testFetchFailureIsSurfacedAsFailure() async {
        let api = FakeDeviceCommandAPIClient()
        api.fetchError = .notAuthenticated
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), apiClient: api)

        let result = await coordinator.run(accessToken: "expired-token")

        guard case .failure(let message) = result else { return XCTFail("expected failure, got \(result)") }
        XCTAssertTrue(message.lowercased().contains("expired"))
    }
}
