import Foundation

/// First-cut tunable weights. These are a reasonable starting model, not a
/// clinical claim — the whole point of `MoodEngineConfiguration` being data
/// (not branching Swift code) is that this gets replaced by a
/// server-delivered, continuously-tuned configuration as real usage data
/// comes in via `user_preferences` and `automation_history`.
public extension MoodEngineConfiguration {
    static let `default` = MoodEngineConfiguration(
        version: "2026.07.0",
        profiles: [
            MoodWeightProfile(mood: .relaxed, metricWeights: [
                MetricWeight(metric: .hrvSDNN, weight: 0.30, curve: ScoreCurve(points: [
                    .init(x: 20, y: 0.1), .init(x: 50, y: 0.5), .init(x: 100, y: 1.0),
                ])),
                MetricWeight(metric: .heartRate, weight: 0.25, curve: ScoreCurve(points: [
                    .init(x: 50, y: 1.0), .init(x: 70, y: 0.7), .init(x: 100, y: 0.2), .init(x: 130, y: 0.0),
                ])),
                MetricWeight(metric: .respiratoryRate, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 12, y: 1.0), .init(x: 16, y: 0.6), .init(x: 22, y: 0.1),
                ])),
                MetricWeight(metric: .mindfulMinutesToday, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.3), .init(x: 10, y: 0.7), .init(x: 30, y: 1.0),
                ])),
                MetricWeight(metric: .workoutRecencyMinutes, weight: 0.10, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.2), .init(x: 60, y: 0.6), .init(x: 240, y: 1.0),
                ])),
            ]),
            MoodWeightProfile(mood: .focused, metricWeights: [
                MetricWeight(metric: .heartRate, weight: 0.25, curve: ScoreCurve(points: [
                    .init(x: 60, y: 0.3), .init(x: 80, y: 0.8), .init(x: 100, y: 1.0), .init(x: 130, y: 0.4),
                ])),
                MetricWeight(metric: .restingHeartRate, weight: 0.10, curve: ScoreCurve(points: [
                    .init(x: 50, y: 0.4), .init(x: 65, y: 0.8), .init(x: 80, y: 0.5),
                ])),
                MetricWeight(metric: .respiratoryRate, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 12, y: 0.5), .init(x: 16, y: 1.0), .init(x: 20, y: 0.5),
                ])),
                MetricWeight(metric: .timeOfDayHour, weight: 0.30, curve: ScoreCurve(points: [
                    .init(x: 6, y: 0.2), .init(x: 9, y: 0.8), .init(x: 14, y: 1.0), .init(x: 18, y: 0.6), .init(x: 22, y: 0.1),
                ])),
                MetricWeight(metric: .activityStepsToday, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.3), .init(x: 3000, y: 0.7), .init(x: 8000, y: 1.0), .init(x: 15000, y: 0.6),
                ])),
            ]),
            MoodWeightProfile(mood: .highStress, metricWeights: [
                MetricWeight(metric: .hrvSDNN, weight: 0.30, curve: ScoreCurve(points: [
                    .init(x: 20, y: 1.0), .init(x: 50, y: 0.5), .init(x: 100, y: 0.05),
                ])),
                MetricWeight(metric: .heartRate, weight: 0.25, curve: ScoreCurve(points: [
                    .init(x: 60, y: 0.1), .init(x: 90, y: 0.4), .init(x: 120, y: 0.8), .init(x: 150, y: 1.0),
                ])),
                MetricWeight(metric: .respiratoryRate, weight: 0.25, curve: ScoreCurve(points: [
                    .init(x: 12, y: 0.1), .init(x: 18, y: 0.5), .init(x: 24, y: 1.0),
                ])),
                MetricWeight(metric: .restingHeartRate, weight: 0.10, curve: ScoreCurve(points: [
                    .init(x: 50, y: 0.1), .init(x: 70, y: 0.5), .init(x: 90, y: 1.0),
                ])),
                MetricWeight(metric: .mindfulMinutesToday, weight: 0.10, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.8), .init(x: 15, y: 0.4), .init(x: 30, y: 0.1),
                ])),
            ]),
            MoodWeightProfile(mood: .fatigued, metricWeights: [
                MetricWeight(metric: .sleepMinutesLast24h, weight: 0.35, curve: ScoreCurve(points: [
                    .init(x: 0, y: 1.0), .init(x: 300, y: 0.6), .init(x: 420, y: 0.3), .init(x: 540, y: 0.05),
                ])),
                MetricWeight(metric: .restingHeartRate, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 50, y: 0.1), .init(x: 65, y: 0.4), .init(x: 80, y: 0.9),
                ])),
                MetricWeight(metric: .hrvSDNN, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 20, y: 0.8), .init(x: 50, y: 0.4), .init(x: 100, y: 0.05),
                ])),
                MetricWeight(metric: .activityStepsToday, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.7), .init(x: 3000, y: 0.4), .init(x: 8000, y: 0.1),
                ])),
                MetricWeight(metric: .timeOfDayHour, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 6, y: 0.3), .init(x: 12, y: 0.4), .init(x: 15, y: 0.7), .init(x: 20, y: 0.9), .init(x: 23, y: 0.6),
                ])),
            ]),
            MoodWeightProfile(mood: .sleeping, metricWeights: [
                MetricWeight(metric: .heartRate, weight: 0.30, curve: ScoreCurve(points: [
                    .init(x: 40, y: 1.0), .init(x: 60, y: 0.6), .init(x: 80, y: 0.1),
                ])),
                MetricWeight(metric: .respiratoryRate, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 10, y: 1.0), .init(x: 14, y: 0.6), .init(x: 18, y: 0.1),
                ])),
                MetricWeight(metric: .timeOfDayHour, weight: 0.35, curve: ScoreCurve(points: [
                    .init(x: 0, y: 1.0), .init(x: 5, y: 0.9), .init(x: 7, y: 0.3), .init(x: 10, y: 0.05), .init(x: 22, y: 0.4), .init(x: 23, y: 0.8),
                ])),
                MetricWeight(metric: .activityStepsToday, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 0, y: 1.0), .init(x: 500, y: 0.5), .init(x: 2000, y: 0.05),
                ])),
            ]),
            MoodWeightProfile(mood: .recovering, metricWeights: [
                MetricWeight(metric: .workoutRecencyMinutes, weight: 0.35, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.3), .init(x: 20, y: 0.8), .init(x: 60, y: 1.0), .init(x: 180, y: 0.4), .init(x: 400, y: 0.05),
                ])),
                MetricWeight(metric: .heartRate, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 60, y: 0.2), .init(x: 90, y: 0.6), .init(x: 115, y: 1.0), .init(x: 140, y: 0.5),
                ])),
                MetricWeight(metric: .respiratoryRate, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 14, y: 0.2), .init(x: 18, y: 0.6), .init(x: 22, y: 1.0), .init(x: 26, y: 0.5),
                ])),
                MetricWeight(metric: .hrvSDNN, weight: 0.15, curve: ScoreCurve(points: [
                    .init(x: 20, y: 0.3), .init(x: 40, y: 0.7), .init(x: 70, y: 1.0), .init(x: 100, y: 0.6),
                ])),
                MetricWeight(metric: .restingHeartRate, weight: 0.10, curve: ScoreCurve(points: [
                    .init(x: 50, y: 0.3), .init(x: 65, y: 0.6), .init(x: 80, y: 1.0),
                ])),
            ]),
            MoodWeightProfile(mood: .energized, metricWeights: [
                MetricWeight(metric: .activityStepsToday, weight: 0.30, curve: ScoreCurve(points: [
                    .init(x: 0, y: 0.05), .init(x: 4000, y: 0.5), .init(x: 9000, y: 0.9), .init(x: 15000, y: 1.0),
                ])),
                MetricWeight(metric: .heartRate, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 60, y: 0.3), .init(x: 90, y: 0.7), .init(x: 110, y: 1.0), .init(x: 140, y: 0.5),
                ])),
                MetricWeight(metric: .hrvSDNN, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 20, y: 0.1), .init(x: 50, y: 0.6), .init(x: 90, y: 1.0),
                ])),
                MetricWeight(metric: .timeOfDayHour, weight: 0.20, curve: ScoreCurve(points: [
                    .init(x: 6, y: 0.6), .init(x: 9, y: 1.0), .init(x: 13, y: 0.8), .init(x: 17, y: 0.6), .init(x: 21, y: 0.2),
                ])),
                MetricWeight(metric: .workoutRecencyMinutes, weight: 0.10, curve: ScoreCurve(points: [
                    .init(x: 0, y: 1.0), .init(x: 120, y: 0.6), .init(x: 400, y: 0.2),
                ])),
            ]),
        ]
    )
}
