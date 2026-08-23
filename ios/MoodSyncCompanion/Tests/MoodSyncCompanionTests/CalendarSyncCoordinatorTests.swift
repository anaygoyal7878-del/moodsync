import XCTest
@testable import MoodSyncCompanion

private final class FakeCalendarReader: CalendarReading, @unchecked Sendable {
    var authorizationGranted = true
    var authorizationError: EventKitReaderError?
    var events: [CalendarEventWindow] = []

    func requestAuthorization() async throws -> Bool {
        if let authorizationError { throw authorizationError }
        return authorizationGranted
    }

    func readUpcomingEvents(now: Date) -> [CalendarEventWindow] { events }
}

private final class FakeAPIClient: MoodSyncAPIClientProtocol, @unchecked Sendable {
    func login(email: String, password: String) async throws -> MoodSyncTokens {
        MoodSyncTokens(accessToken: "fake-token", refreshToken: "fake-refresh")
    }

    func ingest(readings: [NormalizedReading], deviceName: String?, accessToken: String) async throws -> Int { 0 }
    func fetchPendingDeviceCommands(accessToken: String) async throws -> [PendingDeviceCommand] { [] }
    func completePendingDeviceCommand(id: String, status: PendingDeviceCommandOutcome, accessToken: String) async throws {}
    func postLocationEvent(type: LocationEventType, occurredAt: Date, accessToken: String) async throws {}
    func pushHomeSnapshot(_ snapshot: HomeSnapshotDTO, accessToken: String) async throws {}

    var pushError: MoodSyncAPIError?
    private(set) var lastPushedEvents: [CalendarEventWindow] = []
    private(set) var pushCallCount = 0

    func pushCalendarSnapshot(events: [CalendarEventWindow], accessToken: String) async throws {
        pushCallCount += 1
        if let pushError { throw pushError }
        lastPushedEvents = events
    }
}

final class CalendarSyncCoordinatorTests: XCTestCase {
    func testPushesWhatEventKitReturned() async {
        let reader = FakeCalendarReader()
        reader.events = [CalendarEventWindow(startsAt: Date(), endsAt: Date().addingTimeInterval(1800), isAllDay: false)]
        let api = FakeAPIClient()
        let coordinator = CalendarSyncCoordinator(calendar: reader, apiClient: api)

        let result = await coordinator.sync(accessToken: "token")

        XCTAssertEqual(result, .success(eventsPushed: 1))
        XCTAssertEqual(api.lastPushedEvents, reader.events)
    }

    func testDeclinedAuthorizationIsNotAuthorizedNotFailure() async {
        let reader = FakeCalendarReader()
        reader.authorizationGranted = false
        let api = FakeAPIClient()
        let coordinator = CalendarSyncCoordinator(calendar: reader, apiClient: api)

        let result = await coordinator.sync(accessToken: "token")

        XCTAssertEqual(result, .notAuthorized)
        // A declined calendar must never still push — that would send
        // whatever the reader returns for zero-events as if it were a
        // real "nothing scheduled" answer, when the real answer is
        // "unknown, permission was never granted".
        XCTAssertEqual(api.pushCallCount, 0)
    }

    func testAuthorizationFailureIsSurfacedAsFailure() async {
        let reader = FakeCalendarReader()
        reader.authorizationError = .authorizationFailed("denied")
        let coordinator = CalendarSyncCoordinator(calendar: reader, apiClient: FakeAPIClient())

        let result = await coordinator.sync(accessToken: "token")

        guard case .failure = result else { return XCTFail("expected failure, got \(result)") }
    }

    func testPushFailureIsSurfacedAsFailure() async {
        let api = FakeAPIClient()
        api.pushError = .notAuthenticated
        let coordinator = CalendarSyncCoordinator(calendar: FakeCalendarReader(), apiClient: api)

        let result = await coordinator.sync(accessToken: "expired-token")

        guard case .failure(let message) = result else { return XCTFail("expected failure, got \(result)") }
        XCTAssertTrue(message.lowercased().contains("expired"))
    }

    func testEmptyCalendarStillReportsSuccessWithZeroEvents() async {
        // A genuinely free day is a real, valid push — distinct from
        // `.notAuthorized`, which is what the previous test covers.
        let api = FakeAPIClient()
        let coordinator = CalendarSyncCoordinator(calendar: FakeCalendarReader(), apiClient: api)

        let result = await coordinator.sync(accessToken: "token")

        XCTAssertEqual(result, .success(eventsPushed: 0))
        XCTAssertEqual(api.pushCallCount, 1)
    }
}
