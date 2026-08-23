import Foundation

public enum CalendarWriteRunResult: Sendable, Equatable {
    case noWritesPending
    case completed(executed: Int, failed: Int)
    case failure(String)
}

/// Orchestrates one calendar-write poll cycle: fetch pending writes
/// from the backend, create each locally via EventKit, report the
/// outcome back. The write-side counterpart to `CalendarSyncCoordinator`
/// (which pushes read data up) and structurally identical to
/// `DeviceCommandCoordinator` (which does the same thing for HomeKit
/// commands) — its own type rather than a branch inside either of
/// those, for the same reason `CalendarSyncCoordinator` is its own
/// type: a failure creating one event must never affect biometric sync
/// or HomeKit commands running alongside it.
public final class CalendarWriteCoordinator {
    private let calendar: CalendarReading
    private let apiClient: MoodSyncAPIClientProtocol

    public init(calendar: CalendarReading, apiClient: MoodSyncAPIClientProtocol) {
        self.calendar = calendar
        self.apiClient = apiClient
    }

    public func run(accessToken: String) async -> CalendarWriteRunResult {
        do {
            let writes = try await apiClient.fetchPendingCalendarWrites(accessToken: accessToken)
            if writes.isEmpty { return .noWritesPending }

            var executed = 0
            var failed = 0
            for write in writes {
                do {
                    try calendar.createEvent(title: write.title, startsAt: write.startsAt, endsAt: write.endsAt)
                    try await apiClient.completePendingCalendarWrite(id: write.id, status: .executed, accessToken: accessToken)
                    executed += 1
                } catch {
                    try? await apiClient.completePendingCalendarWrite(
                        id: write.id,
                        status: .failed(reason: describe(error)),
                        accessToken: accessToken,
                    )
                    failed += 1
                }
            }
            return .completed(executed: executed, failed: failed)
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    private func describe(_ error: Error) -> String {
        if let error = error as? EventKitReaderError {
            switch error {
            case .authorizationFailed(let message):
                return "Couldn't get permission to write to your calendar: \(message)"
            case .noWritableCalendar:
                return "No writable calendar found on this device."
            case .saveFailed(let message):
                return "Couldn't save the event: \(message)"
            }
        }
        return error.localizedDescription
    }
}
