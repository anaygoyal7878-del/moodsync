import Testing
@testable import MoodSyncCore

struct MoodEngineTests {
    @Test func infersSleepingFromLowHeartRateAndNightHour() {
        let engine = MoodEngine()
        let snapshot = MoodMetricSnapshot(values: [
            .heartRate: 48,
            .respiratoryRate: 11,
            .timeOfDayHour: 2,
            .activityStepsToday: 20,
        ])

        let inference = engine.infer(from: snapshot)

        #expect(inference.mood == .sleeping)
        #expect(inference.confidence > 0)
        #expect(inference.contributingFactors.contains(.timeOfDayHour))
    }

    @Test func infersHighStressFromLowHRVAndFastBreathing() {
        let engine = MoodEngine()
        let snapshot = MoodMetricSnapshot(values: [
            .hrvSDNN: 18,
            .heartRate: 118,
            .respiratoryRate: 23,
            .restingHeartRate: 82,
            .mindfulMinutesToday: 0,
        ])

        let inference = engine.infer(from: snapshot)

        #expect(inference.mood == .highStress)
    }

    @Test func infersEnergizedFromHighActivityAndGoodHRV() {
        let engine = MoodEngine()
        let snapshot = MoodMetricSnapshot(values: [
            .activityStepsToday: 12000,
            .heartRate: 105,
            .hrvSDNN: 80,
            .timeOfDayHour: 9,
            .workoutRecencyMinutes: 30,
        ])

        let inference = engine.infer(from: snapshot)

        #expect(inference.mood == .energized)
    }

    @Test func missingMetricsFallBackToNeutralWithoutCrashing() {
        let engine = MoodEngine()
        let snapshot = MoodMetricSnapshot(values: [:])

        let inference = engine.infer(from: snapshot)

        #expect(inference.contributingFactors.isEmpty)
        #expect(MoodLabel.allCases.contains(inference.mood))
    }

    @Test func componentScoresCoverEveryMood() {
        let engine = MoodEngine()
        let snapshot = MoodMetricSnapshot(values: [.heartRate: 70])

        let inference = engine.infer(from: snapshot)

        #expect(Set(inference.componentScores.keys) == Set(MoodLabel.allCases))
    }

    @Test func confidenceIsAValidProbability() {
        let engine = MoodEngine()
        let snapshot = MoodMetricSnapshot(values: [
            .heartRate: 75, .hrvSDNN: 45, .respiratoryRate: 15, .timeOfDayHour: 14,
        ])
        let inference = engine.infer(from: snapshot)

        #expect(inference.confidence >= 0)
        #expect(inference.confidence <= 1)
    }

    @Test func scoreCurveInterpolatesLinearlyBetweenPoints() {
        let curve = ScoreCurve(points: [.init(x: 0, y: 0), .init(x: 10, y: 1)])
        #expect(abs(curve.score(for: 5) - 0.5) < 0.0001)
        #expect(curve.score(for: -5) == 0.0)
        #expect(curve.score(for: 15) == 1.0)
    }

    @Test func customConfigurationOverridesDefault() {
        let customProfile = MoodWeightProfile(mood: .focused, metricWeights: [
            MetricWeight(metric: .heartRate, weight: 1.0, curve: ScoreCurve(points: [
                .init(x: 0, y: 1.0), .init(x: 200, y: 1.0),
            ])),
        ])
        let config = MoodEngineConfiguration(version: "test", profiles: [customProfile])
        let engine = MoodEngine(configuration: config)

        let inference = engine.infer(from: MoodMetricSnapshot(values: [.heartRate: 70]))

        #expect(inference.mood == .focused)
        #expect(inference.componentScores.count == 1)
    }
}
