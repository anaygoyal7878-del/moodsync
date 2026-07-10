import Foundation

public struct FragranceProfile: Codable, Sendable, Equatable, Identifiable {
    public let id: String
    public let name: String
    public let notes: [String]
    public let moodAffinity: [MoodLabel: Double]

    public init(id: String, name: String, notes: [String], moodAffinity: [MoodLabel: Double]) {
        self.id = id
        self.name = name
        self.notes = notes
        self.moodAffinity = moodAffinity
    }
}

public struct AutomationRule: Codable, Sendable, Equatable {
    public let mood: MoodLabel
    public let fragranceProfileId: String?
    public let intensity: Double
    public let runtimeMinutes: Int
    public let cooldownMinutes: Int
    public let enabled: Bool

    public init(
        mood: MoodLabel,
        fragranceProfileId: String?,
        intensity: Double,
        runtimeMinutes: Int,
        cooldownMinutes: Int,
        enabled: Bool
    ) {
        self.mood = mood
        self.fragranceProfileId = fragranceProfileId
        self.intensity = intensity
        self.runtimeMinutes = runtimeMinutes
        self.cooldownMinutes = cooldownMinutes
        self.enabled = enabled
    }
}

public enum AutomationOutcome: String, Codable, Sendable {
    case dispatched
    case skippedCooldown = "skipped_cooldown"
    case skippedUserOverride = "skipped_user_override"
    case failed
}

public struct AutomationHistoryEntry: Codable, Sendable, Equatable {
    public let mood: MoodLabel
    public let startedAt: Date
    public let outcome: AutomationOutcome

    public init(mood: MoodLabel, startedAt: Date, outcome: AutomationOutcome) {
        self.mood = mood
        self.startedAt = startedAt
        self.outcome = outcome
    }
}

/// Tracks that a user recently took manual control of a device, so the
/// automation engine backs off instead of immediately overwriting their
/// choice on the next mood update.
public struct UserOverrideState: Sendable, Equatable {
    public let deviceId: String
    public let activeUntil: Date

    public init(deviceId: String, activeUntil: Date) {
        self.deviceId = deviceId
        self.activeUntil = activeUntil
    }

    public func isActive(at date: Date = Date()) -> Bool {
        date < activeUntil
    }
}

public enum AutomationDecision: Sendable, Equatable {
    case dispatch(command: DiffuserCommand)
    case skip(reason: AutomationOutcome)
}
