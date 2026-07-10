import Testing
import Foundation
@testable import MoodSyncCore

struct AutomationEngineTests {
    private func makeInference(mood: MoodLabel) -> MoodInference {
        MoodInference(
            mood: mood,
            confidence: 0.8,
            componentScores: [:],
            contributingFactors: [],
            engineVersion: "test",
            inferredAt: Date()
        )
    }

    @Test func dispatchesWhenRuleEnabledAndNoCooldown() {
        let engine = AutomationEngine()
        let rule = AutomationRule(
            mood: .relaxed, fragranceProfileId: "lavender", intensity: 0.5,
            runtimeMinutes: 15, cooldownMinutes: 45, enabled: true
        )

        let decision = engine.decide(
            inference: makeInference(mood: .relaxed),
            rules: [rule],
            availableFragranceProfiles: [],
            recentHistory: [],
            learnedPreferences: .empty,
            overrideState: nil
        )

        guard case .dispatch(let command) = decision else {
            Issue.record("Expected dispatch, got \(decision)")
            return
        }
        #expect(command.fragranceProfileId == "lavender")
        #expect(abs(command.intensity - 0.5) < 0.0001)
    }

    @Test func skipsWhenRuleDisabled() {
        let engine = AutomationEngine()
        let rule = AutomationRule(
            mood: .relaxed, fragranceProfileId: "lavender", intensity: 0.5,
            runtimeMinutes: 15, cooldownMinutes: 45, enabled: false
        )

        let decision = engine.decide(
            inference: makeInference(mood: .relaxed),
            rules: [rule],
            availableFragranceProfiles: [],
            recentHistory: [],
            learnedPreferences: .empty,
            overrideState: nil
        )

        #expect(decision == .skip(reason: .skippedUserOverride))
    }

    @Test func skipsDuringCooldownWindow() {
        let engine = AutomationEngine()
        let rule = AutomationRule(
            mood: .focused, fragranceProfileId: "citrus", intensity: 0.6,
            runtimeMinutes: 10, cooldownMinutes: 60, enabled: true
        )
        let recentDispatch = AutomationHistoryEntry(
            mood: .focused, startedAt: Date().addingTimeInterval(-10 * 60), outcome: .dispatched
        )

        let decision = engine.decide(
            inference: makeInference(mood: .focused),
            rules: [rule],
            availableFragranceProfiles: [],
            recentHistory: [recentDispatch],
            learnedPreferences: .empty,
            overrideState: nil
        )

        #expect(decision == .skip(reason: .skippedCooldown))
    }

    @Test func dispatchesAfterCooldownElapses() {
        let engine = AutomationEngine()
        let rule = AutomationRule(
            mood: .focused, fragranceProfileId: "citrus", intensity: 0.6,
            runtimeMinutes: 10, cooldownMinutes: 60, enabled: true
        )
        let oldDispatch = AutomationHistoryEntry(
            mood: .focused, startedAt: Date().addingTimeInterval(-90 * 60), outcome: .dispatched
        )

        let decision = engine.decide(
            inference: makeInference(mood: .focused),
            rules: [rule],
            availableFragranceProfiles: [],
            recentHistory: [oldDispatch],
            learnedPreferences: .empty,
            overrideState: nil
        )

        if case .skip = decision {
            Issue.record("Expected dispatch after cooldown elapsed, got \(decision)")
        }
    }

    @Test func skipsWhileUserOverrideActive() {
        let engine = AutomationEngine()
        let rule = AutomationRule(
            mood: .energized, fragranceProfileId: "citrus", intensity: 0.7,
            runtimeMinutes: 10, cooldownMinutes: 30, enabled: true
        )
        let override = UserOverrideState(deviceId: "device-1", activeUntil: Date().addingTimeInterval(600))

        let decision = engine.decide(
            inference: makeInference(mood: .energized),
            rules: [rule],
            availableFragranceProfiles: [],
            recentHistory: [],
            learnedPreferences: .empty,
            overrideState: override
        )

        #expect(decision == .skip(reason: .skippedUserOverride))
    }

    @Test func selectsHighestCombinedAffinityFragranceWhenRuleDoesNotPinOne() {
        let engine = AutomationEngine()
        let rule = AutomationRule(
            mood: .relaxed, fragranceProfileId: nil, intensity: 0.5,
            runtimeMinutes: 15, cooldownMinutes: 0, enabled: true
        )
        let lavender = FragranceProfile(id: "lavender", name: "Lavender", notes: [], moodAffinity: [.relaxed: 0.9])
        let citrus = FragranceProfile(id: "citrus", name: "Citrus", notes: [], moodAffinity: [.relaxed: 0.3])
        let learned = UserLearnedPreferences(scentAffinity: ["citrus": 0.95], intensityPreference: [:])

        let decision = engine.decide(
            inference: makeInference(mood: .relaxed),
            rules: [rule],
            availableFragranceProfiles: [lavender, citrus],
            recentHistory: [],
            learnedPreferences: learned,
            overrideState: nil
        )

        guard case .dispatch(let command) = decision else {
            Issue.record("Expected dispatch, got \(decision)")
            return
        }
        // lavender: 0.9*0.5 + 0.5*0.5 = 0.70; citrus: 0.3*0.5 + 0.95*0.5 = 0.625
        #expect(command.fragranceProfileId == "lavender")
    }

    @Test func blendsLearnedIntensityWithRuleIntensity() {
        let engine = AutomationEngine(learnedIntensityBlend: 0.5)
        let rule = AutomationRule(
            mood: .fatigued, fragranceProfileId: "mint", intensity: 0.4,
            runtimeMinutes: 10, cooldownMinutes: 0, enabled: true
        )
        let learned = UserLearnedPreferences(scentAffinity: [:], intensityPreference: [.fatigued: 0.8])

        let decision = engine.decide(
            inference: makeInference(mood: .fatigued),
            rules: [rule],
            availableFragranceProfiles: [],
            recentHistory: [],
            learnedPreferences: learned,
            overrideState: nil
        )

        guard case .dispatch(let command) = decision else {
            Issue.record("Expected dispatch, got \(decision)")
            return
        }
        #expect(abs(command.intensity - 0.6) < 0.0001) // 0.4*0.5 + 0.8*0.5
    }
}
