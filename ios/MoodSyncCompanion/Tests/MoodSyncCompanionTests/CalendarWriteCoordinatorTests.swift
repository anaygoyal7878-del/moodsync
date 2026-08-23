import XCTest
@testable import MoodSyncCompanion

private final class FakeCalendarWriter: CalendarReading, @unchecked Sendable {
    func requestAuthorization() async throws -> Bool { true }
    func readUpcomingEvents(now: Date) -> [CalendarEventWindow] { [] }

    var createEventError: EventKitReaderError?
    private(set) var createdEvents: [(title: String, startsAt: Date, endsAt: Date)] = []

    func createEvent(title: String, startsAt: Date, endsAt: Date) throws {
        if let createEventError { throw createEventError }
        createdEvents.append((title, startsAt, endsAt))
    }
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
    func pushCalendarSnapshot(events: [CalendarEventWindow], accessToken: String) async throws {}

    var pendingWrites: [PendingCalendarWrite] = []
    var fetchError: MoodSyncAPIError?
    private(set) var completions: [(id: String, outcome: PendingCalendarWriteOutcome)] = []

    func fetchPendingCalendarWrites(accessToken: String) async throws -> [PendingCalendarWrite] {
        if let fetchError { throw fetchError }
        return pendingWrites
    }

    func completePendingCalendarWrite(id: String, status: PendingCalendarWriteOutcome, accessToken: String) async throws {
        completions.append((id, status))
    }
}

private func makeWrite(id: String = "write-1", title: String = "Dentist") -> PendingCalendarWrite {
    PendingCalendarWrite(id: id, title: title, startsAt: Date(), endsAt: Date().addingTimeInterval(3600))
}

final class CalendarWriteCoordinatorTests: XCTestCase {
    func testNoWritesPendingWhenQueueIsEmpty() async {
        let coordinator = CalendarWriteCoordinator(calendar: FakeCalendarWriter(), apiClient: FakeAPIClient())
        let result = await coordinator.run(accessToken: "token")
        XCTAssertEqual(result, .noWritesPending)
    }

    func testCreatesAPendingEventAndReportsSuccess() async {
        let writer = FakeCalendarWriter()
        let api = FakeAPIClient()
        api.pendingWrites = [makeWrite(title: "Dentist")]
        let coordinator = CalendarWriteCoordinator(calendar: writer, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 1, failed: 0))
        XCTAssertEqual(writer.createdEvents.first?.title, "Dentist")
        XCTAssertEqual(api.completions.count, 1)
        XCTAssertEqual(api.completions.first?.outcome, .executed)
    }

    func testSaveFailureIsReportedWithAReadableReason() async {
        let writer = FakeCalendarWriter()
        writer.createEventError = .saveFailed("disk full")
        let api = FakeAPIClient()
        api.pendingWrites = [makeWrite()]
        let coordinator = CalendarWriteCoordinator(calendar: writer, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 0, failed: 1))
        guard case .failed(let reason) = api.completions.first?.outcome else {
            return XCTFail("expected a failed outcome")
        }
        XCTAssertTrue(reason.contains("disk full"))
    }

    func testMultipleWritesAreEachExecutedIndependently() async {
        let writer = FakeCalendarWriter()
        let api = FakeAPIClient()
        api.pendingWrites = [makeWrite(id: "w1", title: "Dentist"), makeWrite(id: "w2", title: "Standup")]
        let coordinator = CalendarWriteCoordinator(calendar: writer, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 2, failed: 0))
        XCTAssertEqual(writer.createdEvents.map(\.title), ["Dentist", "Standup"])
    }

    func testOneFailureDoesNotStopTheRest() async {
        // A per-title-conditional fake, so exactly one of two queued
        // writes fails while the other still goes through in the same run.
        final class ConditionalWriter: CalendarReading, @unchecked Sendable {
            private(set) var createdEvents: [(title: String, startsAt: Date, endsAt: Date)] = []
            func requestAuthorization() async throws -> Bool { true }
            func readUpcomingEvents(now: Date) -> [CalendarEventWindow] { [] }
            func createEvent(title: String, startsAt: Date, endsAt: Date) throws {
                if title == "Bad" { throw EventKitReaderError.saveFailed("nope") }
                createdEvents.append((title, startsAt, endsAt))
            }
        }
        let writer = ConditionalWriter()
        let api = FakeAPIClient()
        api.pendingWrites = [makeWrite(id: "w1", title: "Bad"), makeWrite(id: "w2", title: "Good")]
        let coordinator = CalendarWriteCoordinator(calendar: writer, apiClient: api)

        let result = await coordinator.run(accessToken: "token")

        XCTAssertEqual(result, .completed(executed: 1, failed: 1))
        XCTAssertEqual(writer.createdEvents.map(\.title), ["Good"])
    }

    func testFetchFailureIsSurfacedAsFailure() async {
        let api = FakeAPIClient()
        api.fetchError = .notAuthenticated
        let coordinator = CalendarWriteCoordinator(calendar: FakeCalendarWriter(), apiClient: api)

        let result = await coordinator.run(accessToken: "expired-token")

        guard case .failure(let message) = result else { return XCTFail("expected failure, got \(result)") }
        XCTAssertTrue(message.lowercased().contains("expired"))
    }
}
