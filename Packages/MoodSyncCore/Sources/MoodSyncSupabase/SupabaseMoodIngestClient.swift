import Foundation
import MoodSyncCore
import Supabase

private struct MoodIngestRequestBody: Encodable {
    let mood: String
    let confidence: Double
    let componentScores: [String: Double]
    let contributingFactors: [String]
    let engineVersion: String
    let inferredAt: String
}

private struct MoodIngestResponseDTO: Decodable {
    let moodStateId: String
    let dispatch: DispatchOutcomeDTO

    struct DispatchOutcomeDTO: Decodable {
        let outcome: String
    }
}

public struct MoodIngestResult: Sendable, Equatable {
    public let moodStateId: String
    public let dispatchOutcome: RemoteDispatchOutcome
}

public protocol MoodIngestClient: Sendable {
    /// Posts the *output* of an on-device `MoodEngine.infer` call — never
    /// raw HealthKit samples — and returns what automation decided to do.
    func ingest(_ inference: MoodInference) async throws -> MoodIngestResult
}

public final class SupabaseMoodIngestClient: MoodIngestClient {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func ingest(_ inference: MoodInference) async throws -> MoodIngestResult {
        let isoFormatter = ISO8601DateFormatter()
        let componentScores = Dictionary(
            uniqueKeysWithValues: inference.componentScores.map { ($0.key.rawValue, $0.value) }
        )

        let response: MoodIngestResponseDTO = try await container.client.functions.invoke(
            "mood-ingest",
            options: FunctionInvokeOptions(body: MoodIngestRequestBody(
                mood: inference.mood.rawValue,
                confidence: inference.confidence,
                componentScores: componentScores,
                contributingFactors: inference.contributingFactors.map(\.rawValue),
                engineVersion: inference.engineVersion,
                inferredAt: isoFormatter.string(from: inference.inferredAt)
            ))
        )

        return MoodIngestResult(
            moodStateId: response.moodStateId,
            dispatchOutcome: RemoteDispatchOutcome(rawValue: response.dispatch.outcome) ?? .failed
        )
    }
}
