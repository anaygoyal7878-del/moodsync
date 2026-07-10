import Foundation

/// Inferred mood states. Mirrors the `mood_label` Postgres enum in
/// `supabase/migrations/0001_init.sql` — keep both in sync.
public enum MoodLabel: String, Codable, CaseIterable, Sendable {
    case relaxed
    case focused
    case highStress = "high_stress"
    case fatigued
    case sleeping
    case recovering
    case energized
}
