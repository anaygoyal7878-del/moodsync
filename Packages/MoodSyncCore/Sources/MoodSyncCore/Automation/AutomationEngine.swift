import Foundation

/// Decides what, if anything, to do about a newly inferred mood: applies
/// the user's rule for that mood, blends in continuously-learned
/// preferences (never hardcoded per-user values), enforces cooldown so
/// fragrance isn't over-dispensed, and yields to any recent manual
/// override. The server (`automationDispatch.ts`) enforces the same
/// cooldown/override rules authoritatively — this mirrors that logic
/// on-device so the app can show *why* nothing happened and can queue a
/// decision while offline.
public final class AutomationEngine: Sendable {
    /// How much weight the learned intensity preference gets versus the
    /// rule's configured intensity when blending, 0 = ignore learning,
    /// 1 = fully learned.
    private let learnedIntensityBlend: Double

    public init(learnedIntensityBlend: Double = 0.4) {
        self.learnedIntensityBlend = min(max(learnedIntensityBlend, 0), 1)
    }

    public func decide(
        inference: MoodInference,
        rules: [AutomationRule],
        availableFragranceProfiles: [FragranceProfile],
        recentHistory: [AutomationHistoryEntry],
        learnedPreferences: UserLearnedPreferences,
        overrideState: UserOverrideState?,
        now: Date = Date()
    ) -> AutomationDecision {
        guard let rule = rules.first(where: { $0.mood == inference.mood }), rule.enabled else {
            return .skip(reason: .skippedUserOverride)
        }

        if let overrideState, overrideState.isActive(at: now) {
            return .skip(reason: .skippedUserOverride)
        }

        if isWithinCooldown(mood: inference.mood, cooldownMinutes: rule.cooldownMinutes, history: recentHistory, now: now) {
            return .skip(reason: .skippedCooldown)
        }

        let fragranceProfileId = selectFragranceProfile(
            rule: rule,
            mood: inference.mood,
            available: availableFragranceProfiles,
            learnedPreferences: learnedPreferences
        )

        let learnedIntensity = learnedPreferences.intensityPreference[inference.mood]
        let intensity = blend(base: rule.intensity, learned: learnedIntensity)

        return .dispatch(command: DiffuserCommand(
            intensity: intensity,
            runtimeMinutes: rule.runtimeMinutes,
            fragranceProfileId: fragranceProfileId
        ))
    }

    private func isWithinCooldown(
        mood: MoodLabel,
        cooldownMinutes: Int,
        history: [AutomationHistoryEntry],
        now: Date
    ) -> Bool {
        guard cooldownMinutes > 0 else { return false }
        guard let lastDispatch = history
            .filter({ $0.mood == mood && $0.outcome == .dispatched })
            .max(by: { $0.startedAt < $1.startedAt })
        else { return false }

        let elapsedMinutes = now.timeIntervalSince(lastDispatch.startedAt) / 60
        return elapsedMinutes < Double(cooldownMinutes)
    }

    /// If the rule pins a specific fragrance, honor it. Otherwise pick the
    /// candidate profile with the highest combined score of its authored
    /// mood affinity and the user's learned affinity for that profile.
    private func selectFragranceProfile(
        rule: AutomationRule,
        mood: MoodLabel,
        available: [FragranceProfile],
        learnedPreferences: UserLearnedPreferences
    ) -> String? {
        if let pinned = rule.fragranceProfileId { return pinned }

        let ranked = available
            .map { profile -> (String, Double) in
                let authoredAffinity = profile.moodAffinity[mood] ?? 0.5
                let learnedAffinity = learnedPreferences.scentAffinity[profile.id] ?? 0.5
                let combined = (authoredAffinity * 0.5) + (learnedAffinity * 0.5)
                return (profile.id, combined)
            }
            .max { $0.1 < $1.1 }

        return ranked?.0
    }

    private func blend(base: Double, learned: Double?) -> Double {
        guard let learned else { return base }
        return base * (1 - learnedIntensityBlend) + learned * learnedIntensityBlend
    }
}
