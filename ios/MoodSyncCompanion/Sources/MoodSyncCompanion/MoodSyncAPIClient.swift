import Foundation

public enum MoodSyncAPIError: Error, Sendable {
    case requestFailed(status: Int, body: String)
    case notAuthenticated
}

public struct MoodSyncTokens: Sendable, Equatable {
    public let accessToken: String
    public let refreshToken: String
}

/// Same protocol-seam rationale as `HealthKitReading` — `SyncCoordinator`
/// depends on this, not the concrete networking type, so it's testable
/// with a fake that never touches the network.
public protocol MoodSyncAPIClientProtocol: Sendable {
    func login(email: String, password: String) async throws -> MoodSyncTokens
    @discardableResult
    func ingest(readings: [NormalizedReading], deviceName: String?, accessToken: String) async throws -> Int
    func fetchPendingDeviceCommands(accessToken: String) async throws -> [PendingDeviceCommand]
    func completePendingDeviceCommand(id: String, status: PendingDeviceCommandOutcome, accessToken: String) async throws
}

public enum PendingDeviceCommandOutcome: Sendable, Equatable {
    case executed
    case failed(reason: String)
}

/// Talks to the exact same endpoints the web app uses
/// (`backend/src/api/routes/auth.ts`, `backend/src/api/routes/integrations/appleHealth.ts`)
/// — this app authenticates as a normal MoodSync user (the same email/
/// password from signup), not via a separate device OAuth flow, since
/// Apple Health has no OAuth handshake of its own to piggyback on.
public actor MoodSyncAPIClient: MoodSyncAPIClientProtocol {
    private let baseURL: URL
    private let session: URLSession

    public init(baseURL: URL, session: URLSession = .shared) {
        self.baseURL = baseURL
        self.session = session
    }

    public func login(email: String, password: String) async throws -> MoodSyncTokens {
        struct LoginRequest: Encodable { let email: String; let password: String }
        struct LoginResponse: Decodable { let accessToken: String; let refreshToken: String }

        let response: LoginResponse = try await post(
            path: "/api/auth/login",
            body: LoginRequest(email: email, password: password),
            accessToken: nil
        )
        return MoodSyncTokens(accessToken: response.accessToken, refreshToken: response.refreshToken)
    }

    /// Matches the backend's `{ readings: [...], deviceName? }` request
    /// body and `{ readingsInserted: number }` response exactly. Each
    /// `NormalizedReading` also carries its own `deviceName` field (used
    /// for the on-device domain model), which the backend's per-reading
    /// Zod schema simply ignores as an unrecognized key — `deviceName` is
    /// only read from this top-level field.
    @discardableResult
    public func ingest(readings: [NormalizedReading], deviceName: String? = nil, accessToken: String) async throws -> Int {
        struct IngestRequest: Encodable { let readings: [NormalizedReading]; let deviceName: String? }
        struct IngestResponse: Decodable { let readingsInserted: Int }

        let response: IngestResponse = try await post(
            path: "/api/integrations/apple-health/ingest",
            body: IngestRequest(readings: readings, deviceName: deviceName),
            accessToken: accessToken
        )
        return response.readingsInserted
    }

    /// Polls the HomeKit-queue counterpart to `ingest` — see
    /// `backend/src/api/routes/devices.ts`. Called on app open/foreground,
    /// matching the "device polls server" shape described in
    /// docs/HOMEKIT_ARCHITECTURE.md (inverted from `ingest`, where this
    /// app pushes data up instead).
    public func fetchPendingDeviceCommands(accessToken: String) async throws -> [PendingDeviceCommand] {
        struct Response: Decodable { let commands: [PendingDeviceCommand] }
        let response: Response = try await get(path: "/api/devices/pending-commands", accessToken: accessToken)
        return response.commands
    }

    public func completePendingDeviceCommand(id: String, status: PendingDeviceCommandOutcome, accessToken: String) async throws {
        struct CompleteRequest: Encodable {
            let status: String
            let failureReason: String?
        }
        let body: CompleteRequest
        switch status {
        case .executed:
            body = CompleteRequest(status: "EXECUTED", failureReason: nil)
        case .failed(let reason):
            body = CompleteRequest(status: "FAILED", failureReason: reason)
        }

        struct EmptyResponse: Decodable {}
        let _: EmptyResponse? = try await postAllowingEmptyResponse(
            path: "/api/devices/pending-commands/\(id)/complete",
            body: body,
            accessToken: accessToken
        )
    }

    private func get<Response: Decodable>(path: String, accessToken: String) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, urlResponse) = try await session.data(for: request)
        guard let httpResponse = urlResponse as? HTTPURLResponse else {
            throw MoodSyncAPIError.requestFailed(status: -1, body: "No HTTP response")
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 { throw MoodSyncAPIError.notAuthenticated }
            throw MoodSyncAPIError.requestFailed(status: httpResponse.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }

    /// Same request shape as `post`, but tolerant of a `204 No Content`
    /// response body — the complete-command endpoint returns 204, which
    /// `JSONDecoder` can't decode as any concrete type.
    private func postAllowingEmptyResponse<Body: Encodable, Response: Decodable>(
        path: String,
        body: Body,
        accessToken: String
    ) async throws -> Response? {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(body)

        let (data, urlResponse) = try await session.data(for: request)
        guard let httpResponse = urlResponse as? HTTPURLResponse else {
            throw MoodSyncAPIError.requestFailed(status: -1, body: "No HTTP response")
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 { throw MoodSyncAPIError.notAuthenticated }
            throw MoodSyncAPIError.requestFailed(status: httpResponse.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }
        if httpResponse.statusCode == 204 || data.isEmpty { return nil }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }

    private func post<Body: Encodable, Response: Decodable>(
        path: String,
        body: Body,
        accessToken: String?
    ) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        if let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(body)

        let (data, urlResponse) = try await session.data(for: request)
        guard let httpResponse = urlResponse as? HTTPURLResponse else {
            throw MoodSyncAPIError.requestFailed(status: -1, body: "No HTTP response")
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            if httpResponse.statusCode == 401 { throw MoodSyncAPIError.notAuthenticated }
            throw MoodSyncAPIError.requestFailed(status: httpResponse.statusCode, body: String(data: data, encoding: .utf8) ?? "")
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Response.self, from: data)
    }
}
