import Foundation
import Supabase

public struct DailyHealthSummary: Sendable, Equatable {
    public let date: Date
    public let avgHeartRate: Double?
    public let restingHeartRate: Double?
    public let avgHrvSDNN: Double?
    public let avgRespiratoryRate: Double?
    public let sleepMinutes: Double?
    public let mindfulMinutes: Double?
    public let workoutMinutes: Double?

    public init(
        date: Date,
        avgHeartRate: Double?,
        restingHeartRate: Double?,
        avgHrvSDNN: Double?,
        avgRespiratoryRate: Double?,
        sleepMinutes: Double?,
        mindfulMinutes: Double?,
        workoutMinutes: Double?
    ) {
        self.date = date
        self.avgHeartRate = avgHeartRate
        self.restingHeartRate = restingHeartRate
        self.avgHrvSDNN = avgHrvSDNN
        self.avgRespiratoryRate = avgRespiratoryRate
        self.sleepMinutes = sleepMinutes
        self.mindfulMinutes = mindfulMinutes
        self.workoutMinutes = workoutMinutes
    }
}

private struct HealthSummaryUpsertDTO: Encodable {
    let userId: String
    let summaryDate: String
    let avgHeartRate: Double?
    let restingHeartRate: Double?
    let avgHrvSdnn: Double?
    let avgRespiratoryRate: Double?
    let sleepMinutes: Double?
    let mindfulMinutes: Double?
    let workoutMinutes: Double?

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case summaryDate = "summary_date"
        case avgHeartRate = "avg_heart_rate"
        case restingHeartRate = "resting_heart_rate"
        case avgHrvSdnn = "avg_hrv_sdnn"
        case avgRespiratoryRate = "avg_respiratory_rate"
        case sleepMinutes = "sleep_minutes"
        case mindfulMinutes = "mindful_minutes"
        case workoutMinutes = "workout_minutes"
    }
}

public protocol HealthSummaryUploading: Sendable {
    /// Uploads only a daily aggregate — never raw HealthKit samples. Callers
    /// must check `Profile.healthSyncConsent` before ever calling this.
    func upload(_ summary: DailyHealthSummary) async throws
}

public final class SupabaseHealthSummaryUploader: HealthSummaryUploading {
    private let container: SupabaseServiceContainer
    private let dateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.calendar = Calendar(identifier: .gregorian)
        return formatter
    }()

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func upload(_ summary: DailyHealthSummary) async throws {
        let userId = try await container.client.auth.session.user.id.uuidString
        try await container.client
            .from("health_summaries")
            .upsert(
                HealthSummaryUpsertDTO(
                    userId: userId,
                    summaryDate: dateFormatter.string(from: summary.date),
                    avgHeartRate: summary.avgHeartRate,
                    restingHeartRate: summary.restingHeartRate,
                    avgHrvSdnn: summary.avgHrvSDNN,
                    avgRespiratoryRate: summary.avgRespiratoryRate,
                    sleepMinutes: summary.sleepMinutes,
                    mindfulMinutes: summary.mindfulMinutes,
                    workoutMinutes: summary.workoutMinutes
                ),
                onConflict: "user_id,summary_date"
            )
            .execute()
    }
}
