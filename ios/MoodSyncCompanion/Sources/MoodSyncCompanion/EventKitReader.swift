import Foundation

public enum EventKitReaderError: Error, Sendable {
    case authorizationFailed(String)
}

/// One event window, no title/location/attendees — see
/// `AppleCalendarSnapshot`'s schema comment in the database package for
/// why. Kept deliberately minimal: `ai/src/calendarSignal.ts` has never
/// needed more than "how many hours are booked" and "is a non-all-day
/// event happening right now", and a calendar title is often the most
/// sensitive text a person has.
public struct CalendarEventWindow: Sendable, Codable, Equatable {
    public let startsAt: Date
    public let endsAt: Date
    public let isAllDay: Bool

    public init(startsAt: Date, endsAt: Date, isAllDay: Bool) {
        self.startsAt = startsAt
        self.endsAt = endsAt
        self.isAllDay = isAllDay
    }
}

/// Thin, testable seam over EventKit — same protocol-plus-`#if
/// canImport` shape as `HealthKitReading`/`HealthKitReader`, for the
/// same reason: this file compiles (with the guarded implementation
/// simply absent) anywhere EventKit isn't available, and the app layer
/// depends on the protocol, not the concrete `EKEventStore`-backed type,
/// so it's testable with a fake that never touches a real calendar.
public protocol CalendarReading: Sendable {
    func requestAuthorization() async throws -> Bool
    /// Every event window from the start of today to the end of
    /// tomorrow, in the device's local calendar day. Tomorrow is
    /// included (not just today) so an evening sync still has a useful
    /// answer for "am I busy in the morning" — `ai/src/calendarSignal.ts`
    /// filters to whatever window it actually needs server-side; this
    /// reader's job is just to not have already thrown away the data.
    func readUpcomingEvents(now: Date) -> [CalendarEventWindow]
}

#if canImport(EventKit)
import EventKit

public final class EventKitReader: CalendarReading, @unchecked Sendable {
    private let store = EKEventStore()

    public init() {}

    public func requestAuthorization() async throws -> Bool {
        do {
            // Read-only, same privacy stance as every provider in this
            // product — MoodSync never writes to a user's calendar.
            if #available(iOS 17.0, *) {
                return try await store.requestFullAccessToEvents()
            } else {
                return try await withCheckedThrowingContinuation { continuation in
                    store.requestAccess(to: .event) { granted, error in
                        if let error { continuation.resume(throwing: error) } else { continuation.resume(returning: granted) }
                    }
                }
            }
        } catch {
            throw EventKitReaderError.authorizationFailed(error.localizedDescription)
        }
    }

    public func readUpcomingEvents(now: Date = Date()) -> [CalendarEventWindow] {
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: now)
        guard let endOfTomorrow = calendar.date(byAdding: .day, value: 2, to: startOfToday) else { return [] }

        // `nil` calendars means "search every calendar the user granted
        // access to" — matches the read-everything-connected posture
        // this product takes for HealthKit and HomeKit too.
        let predicate = store.predicateForEvents(withStart: startOfToday, end: endOfTomorrow, calendars: nil)
        return store.events(matching: predicate).map {
            CalendarEventWindow(startsAt: $0.startDate, endsAt: $0.endDate, isAllDay: $0.isAllDay)
        }
    }
}
#endif
