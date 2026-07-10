import SwiftUI
import MoodSyncCore

/// Reusable mood chip used on the dashboard, in history rows, and in the
/// automation rule list — one place to keep color/icon mapping consistent.
public struct MoodBadge: View {
    private let mood: MoodLabel
    private let confidence: Double?

    public init(mood: MoodLabel, confidence: Double? = nil) {
        self.mood = mood
        self.confidence = confidence
    }

    public var body: some View {
        HStack(spacing: 6) {
            Image(systemName: symbolName)
            Text(title)
                .font(.subheadline.weight(.semibold))
            if let confidence {
                Text("\(Int(confidence * 100))%")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(tint.opacity(0.15), in: Capsule())
        .foregroundStyle(tint)
    }

    private var title: String {
        switch mood {
        case .relaxed: return "Relaxed"
        case .focused: return "Focused"
        case .highStress: return "High Stress"
        case .fatigued: return "Fatigued"
        case .sleeping: return "Sleeping"
        case .recovering: return "Recovering"
        case .energized: return "Energized"
        }
    }

    private var symbolName: String {
        switch mood {
        case .relaxed: return "leaf.fill"
        case .focused: return "target"
        case .highStress: return "bolt.heart.fill"
        case .fatigued: return "battery.25"
        case .sleeping: return "moon.zzz.fill"
        case .recovering: return "arrow.triangle.2.circlepath"
        case .energized: return "sun.max.fill"
        }
    }

    private var tint: Color {
        switch mood {
        case .relaxed: return .mint
        case .focused: return .blue
        case .highStress: return .red
        case .fatigued: return .gray
        case .sleeping: return .indigo
        case .recovering: return .teal
        case .energized: return .orange
        }
    }
}
