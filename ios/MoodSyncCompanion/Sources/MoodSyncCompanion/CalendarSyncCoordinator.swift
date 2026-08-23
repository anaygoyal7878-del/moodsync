import Foundation

public enum CalendarSyncResult: Sendable, Equatable {
    case success(eventsPushed: Int)
    case failure(String)
    /// Distinct from `.failure` — the person simply hasn't granted
    /// calendar access. Not an error to report; a state to show a
    /// connect prompt for, same as an unconnected wearable.
    case notAuthorized
}

/// Orchestrates one calendar sync cycle: read EventKit, push to the
/// backend. Kept separate from `EventKitReader`/`MoodSyncAPIClient
/// so it's testable against fakes of both, without touching a real
/// calendar or the network — same shape as `SyncCoordinator`, and
/// deliberately its own type rather than a branch inside
/// `SyncCoordinator`, since biometric sync must keep succeeding even
/// on a device where calendar access was declined.
public final class CalendarSyncCoordinator {
    private let calendar: CalendarReading
    private let apiClient: MoodSyncAPIClientProtocol

    public init(calendar: CalendarReading, apiClient: MoodSyncAPIClientProtocol) {
        self.calendar = calendar
        self.apiClient = apiClient
    }

    public func sync(accessToken: String, now: Date = Date()) async -> CalendarSyncResult {
        do {
            let granted = try await calendar.requestAuthorization()
            guard granted else { return .notAuthorized }

            let events = calendar.readUpcomingEvents(now: now)
            try await apiClient.pushCalendarSnapshot(events: events, accessToken: accessToken)
            return .success(eventsPushed: events.count)
        } catch let error as EventKitReaderError {
            switch error {
            case .authorizationFailed(let message):
                return .failure("Couldn't get permission to read your calendar: \(message)")
            // This coordinator only ever calls requestAuthorization and
            // readUpcomingEvents, neither of which can throw a write
            // error — these cases exist only because Swift requires the
            // switch to be exhaustive over the whole shared error type.
            case .noWritableCalendar, .saveFailed:
                return .failure(error.localizedDescription)
            }
        } catch {
            return .failure(error.localizedDescription)
        }
    }
}
