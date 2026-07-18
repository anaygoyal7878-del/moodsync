import Foundation

public enum MoodSyncAPIError: Error, Sendable {
    case requestFailed(status: Int, body: String)
    case notAuthenticated
    /// Distinguishes "the device can't reach the network at all" (no
    /// internet, Wi-Fi/cellular off, airplane mode) and "reached the
    /// network but not this specific server" (wrong IP/port, Mac's dev
    /// server not running, or on a different Wi-Fi network) — both are
    /// `URLError` at the `URLSession` layer, mapped here instead of
    /// leaking a raw `URLError.localizedDescription` (e.g. "The Internet
    /// connection appears to be offline.") up to the UI unexplained. See
    /// `dataTask(for:)` below for the specific `URLError.Code` mapping.
    case offline
    case cannotReachServer(String)
}

extension MoodSyncAPIError: LocalizedError {
    /// Single source of truth for user-facing text — both
    /// `SyncCoordinator` and `DeviceCommandCoordinator` used to duplicate
    /// this switch themselves; conforming to `LocalizedError` means
    /// `error.localizedDescription` (what `MoodSyncCompanionView`'s login
    /// screen already reads) gets the same real message instead of
    /// Swift's generic "operation couldn't be completed" fallback for a
    /// plain, non-conforming `Error` enum.
    public var errorDescription: String? {
        switch self {
        case .notAuthenticated:
            return "Your session expired — log in again."
        case .requestFailed(let status, _):
            return "MoodSync returned an error (status \(status))."
        case .offline:
            return "No internet connection — check Wi-Fi/cellular and airplane mode, then try again."
        case .cannotReachServer:
            return "Couldn't reach MoodSync — check the Server URL in Settings and that your Mac's backend is running on the same network."
        }
    }
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
    /// Pushed by `LocationController` on a `CLCircularRegion` enter/exit
    /// callback — see docs/GEOFENCING_ARCHITECTURE.md. Matches
    /// `backend/src/api/routes/locationEvents.ts`'s
    /// `{ type, occurredAt }` request body exactly.
    func postLocationEvent(type: LocationEventType, occurredAt: Date, accessToken: String) async throws
}

/// ARRIVED/DEPARTED — mirrors `LocationEventType` in
/// shared/src/automation.ts exactly (same two string values), kept as
/// its own Swift enum rather than importing anything cross-language.
public enum LocationEventType: String, Sendable, Codable {
    case arrived = "ARRIVED"
    case departed = "DEPARTED"
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

    public func postLocationEvent(type: LocationEventType, occurredAt: Date, accessToken: String) async throws {
        struct LocationEventRequest: Encodable { let type: String; let occurredAt: Date }
        struct Response: Decodable { let dispatched: [DispatchedRuleSummary] }
        struct DispatchedRuleSummary: Decodable {}

        let _: Response = try await post(
            path: "/api/location-events",
            body: LocationEventRequest(type: type.rawValue, occurredAt: occurredAt),
            accessToken: accessToken
        )
    }

    /// Wraps `URLSession.data(for:)`, translating a `URLError` (the type
    /// thrown for "never reached any server" failures — offline, DNS
    /// failure, connection refused/timed out) into one of
    /// `MoodSyncAPIError`'s two specific cases instead of letting the raw
    /// `URLError` surface. `.offline`-eligible codes are Apple's own
    /// documented set for "no network path exists at all" (airplane mode,
    /// Wi-Fi/cellular off, or genuinely no internet) — everything else
    /// that still fails to reach a server (wrong IP/port, dev server not
    /// running, wrong Wi-Fi network) becomes `.cannotReachServer` with the
    /// system's own description, since there's no single clean codepath
    /// to explain "you're probably pointed at the wrong Server URL" more
    /// specifically than that.
    private func dataTask(for request: URLRequest) async throws -> (Data, URLResponse) {
        do {
            return try await session.data(for: request)
        } catch let error as URLError {
            switch error.code {
            case .notConnectedToInternet, .networkConnectionLost, .dataNotAllowed, .internationalRoamingOff:
                throw MoodSyncAPIError.offline
            default:
                throw MoodSyncAPIError.cannotReachServer(error.localizedDescription)
            }
        }
    }

    private func get<Response: Decodable>(path: String, accessToken: String) async throws -> Response {
        var request = URLRequest(url: baseURL.appendingPathComponent(path))
        request.httpMethod = "GET"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, urlResponse) = try await dataTask(for: request)
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

        let (data, urlResponse) = try await dataTask(for: request)
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

        let (data, urlResponse) = try await dataTask(for: request)
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
