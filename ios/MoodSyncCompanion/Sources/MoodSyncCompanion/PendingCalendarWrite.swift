import Foundation

/// Mirrors the backend's `PendingCalendarWrite` shape
/// (`database/prisma/schema.prisma`, `GET /api/calendar/apple/pending-writes`)
/// — what this app polls for and executes locally via EventKit, since
/// EventKit has no server-side write path either. Same "backend
/// queues, device polls and executes" shape as `PendingDeviceCommand`,
/// separate type because a calendar write isn't a `SmartHomeProvider`
/// action. See docs/APPLE_CALENDAR_ARCHITECTURE.md.
public struct PendingCalendarWrite: Decodable, Sendable, Equatable {
    public let id: String
    public let title: String
    public let startsAt: Date
    public let endsAt: Date
}
