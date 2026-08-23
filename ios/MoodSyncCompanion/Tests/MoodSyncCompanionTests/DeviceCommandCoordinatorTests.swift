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

    func fetchHomeSnapshot() async throws -> HomeSnapshotDTO {
        HomeSnapshotDTO(homeId: "home-1", homeName: "Fake Home", rooms: [], zones: [], accessories: [], scenes: [])
    }
}

private final class FakeHueBLEController: HueBLEControlling, @unchecked Sendable {
    var error: HueBLEError?
    private(set) var powerCalls: [(name: String, on: Bool)] = []
    private(set) var brightnessCalls: [(name: String, brightness: Int)] = []

    func isBluetoothAvailable() -> Bool { true }

    func setPower(peripheralName: String, on: Bool) async throws {
        if let error { throw error }
        powerCalls.append((peripheralName, on))
    }

    func setBrightness(peripheralName: String, brightness: Int) async throws {
        if let error { throw error }
        brightnessCalls.append((peripheralName, brightness))
    }
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

    func pushHomeSnapshot(_ snapshot: HomeSnapshotDTO, accessToken: String) async throws {}

    func pushCalendarSnapshot(events: [CalendarEventWindow], accessToken: String) async throws {}
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

private func makeBLECommand(
    id: String = "cmd-ble",
    type: String,
    params: [String: JSONValue]
) -> PendingDeviceCommand {
    PendingDeviceCommand(
        id: id,
        action: PendingDeviceCommand.Action(type: type, provider: "hue_ble", params: params)
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

    // MARK: - Bluetooth Hue routing (see docs/HUE_BLE_ARCHITECTURE.md)

    func testRoutesSetPowerToTheBluetoothController() async {
        let hueBLE = FakeHueBLEController()
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeBLECommand(type: "hue_ble.set_power", params: ["peripheralName": .string("Hue lamp"), "on": .bool(true)])]
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), hueBLE: hueBLE, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 1, failed: 0))
        XCTAssertEqual(hueBLE.powerCalls.count, 1)
        XCTAssertEqual(hueBLE.powerCalls.first?.name, "Hue lamp")
        XCTAssertEqual(hueBLE.powerCalls.first?.on, true)
    }

    func testRoutesSetBrightnessToTheBluetoothController() async {
        let hueBLE = FakeHueBLEController()
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeBLECommand(type: "hue_ble.set_brightness", params: ["peripheralName": .string("Hue lamp"), "brightness": .number(40)])]
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), hueBLE: hueBLE, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 1, failed: 0))
        XCTAssertEqual(hueBLE.brightnessCalls.first?.name, "Hue lamp")
        XCTAssertEqual(hueBLE.brightnessCalls.first?.brightness, 40)
    }

    /// A HomeKit command and a Bluetooth command in the same queue must
    /// each reach their own controller — the whole point of introducing
    /// real routing rather than the single hardcoded action-type check
    /// this coordinator used to have.
    func testHomeKitAndBluetoothCommandsRouteIndependentlyInOneRun() async {
        let homeKit = FakeHomeKitController()
        let hueBLE = FakeHueBLEController()
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [
            makeCommand(id: "cmd-1", sceneName: "MoodSync Relax"),
            makeBLECommand(id: "cmd-2", type: "hue_ble.set_power", params: ["peripheralName": .string("Hue lamp"), "on": .bool(false)]),
        ]
        let coordinator = DeviceCommandCoordinator(homeKit: homeKit, hueBLE: hueBLE, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 2, failed: 0))
        XCTAssertEqual(homeKit.activatedScenes, ["MoodSync Relax"])
        XCTAssertEqual(hueBLE.powerCalls.first?.on, false)
    }

    func testBluetoothCommandFailsLoudlyWhenNoBLEControllerIsWired() async {
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeBLECommand(type: "hue_ble.set_power", params: ["peripheralName": .string("Hue lamp"), "on": .bool(true)])]
        // No `hueBLE:` argument — the default nil.
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 0, failed: 1))
        guard case .failed(let reason) = api.completions.first?.outcome else {
            return XCTFail("expected a failed outcome")
        }
        XCTAssertTrue(reason.lowercased().contains("bluetooth"))
    }

    func testPeripheralNotFoundIsReportedWithAReadableReason() async {
        let hueBLE = FakeHueBLEController()
        hueBLE.error = .peripheralNotFound("Hue lamp")
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [makeBLECommand(type: "hue_ble.set_power", params: ["peripheralName": .string("Hue lamp"), "on": .bool(true)])]
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), hueBLE: hueBLE, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 0, failed: 1))
        guard case .failed(let reason) = api.completions.first?.outcome else {
            return XCTFail("expected a failed outcome")
        }
        XCTAssertTrue(reason.contains("Hue lamp"))
    }

    func testMissingRequiredParamIsReportedAsFailedRatherThanCrashing() async {
        let hueBLE = FakeHueBLEController()
        let api = FakeDeviceCommandAPIClient()
        // No `on` param at all — a malformed command shouldn't take the
        // whole poll cycle down.
        api.pendingCommands = [makeBLECommand(type: "hue_ble.set_power", params: ["peripheralName": .string("Hue lamp")])]
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), hueBLE: hueBLE, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 0, failed: 1))
        XCTAssertTrue(hueBLE.powerCalls.isEmpty)
    }

    func testHomeKitRunSceneRoutesToActivateSceneLikeActivateScene() async {
        let homeKit = FakeHomeKitController()
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [
            PendingDeviceCommand(
                id: "cmd-run-scene",
                action: PendingDeviceCommand.Action(type: "homekit.run_scene", provider: "homekit", params: ["sceneName": .string("Wind Down")])
            ),
        ]
        let coordinator = DeviceCommandCoordinator(homeKit: homeKit, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 1, failed: 0))
        XCTAssertEqual(homeKit.activatedScenes, ["Wind Down"])
    }

    func testSecurityControlIsRefusedOnTheDeviceEvenIfSomehowQueued() async {
        let api = FakeDeviceCommandAPIClient()
        api.pendingCommands = [
            PendingDeviceCommand(
                id: "cmd-security",
                action: PendingDeviceCommand.Action(
                    type: "homekit.security_control",
                    provider: "homekit",
                    params: ["accessoryId": .string("acc-1"), "command": .string("unlock")]
                )
            ),
        ]
        let coordinator = DeviceCommandCoordinator(homeKit: FakeHomeKitController(), apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 0, failed: 1))
        guard case .failed(let reason) = api.completions.first?.outcome else {
            return XCTFail("expected a failed outcome")
        }
        XCTAssertTrue(reason.contains("not implemented"))
    }
}
