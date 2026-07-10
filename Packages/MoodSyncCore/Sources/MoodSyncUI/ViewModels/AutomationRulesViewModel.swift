import Foundation
import MoodSyncCore
import MoodSyncSupabase

@MainActor
public final class AutomationRulesViewModel: ObservableObject {
    @Published public private(set) var rulesByMood: [MoodLabel: AutomationRule] = [:]
    @Published public private(set) var fragranceProfiles: [FragranceProfile] = []
    @Published public private(set) var isLoading = false
    @Published public private(set) var errorMessage: String?

    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    public func load() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            async let rules = container.automationRuleRepository.fetchRules()
            async let profiles = container.fragranceProfileRepository.fetchAvailableProfiles()
            rulesByMood = Dictionary(uniqueKeysWithValues: try await rules.map { ($0.mood, $0) })
            fragranceProfiles = try await profiles
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    public func save(_ rule: AutomationRule) async {
        errorMessage = nil
        do {
            try await container.automationRuleRepository.upsert(rule)
            rulesByMood[rule.mood] = rule
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    /// The default rule shown for a mood the user hasn't configured yet —
    /// a sensible starting point they can edit, never applied silently.
    public func defaultRule(for mood: MoodLabel) -> AutomationRule {
        rulesByMood[mood] ?? AutomationRule(
            mood: mood,
            fragranceProfileId: fragranceProfiles.first?.id,
            intensity: 0.5,
            runtimeMinutes: 15,
            cooldownMinutes: 45,
            enabled: false
        )
    }
}
