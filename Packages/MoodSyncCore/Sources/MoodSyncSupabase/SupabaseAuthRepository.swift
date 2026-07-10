import Foundation
import Supabase

public struct AuthenticatedUser: Sendable, Equatable {
    public let id: String
    public let email: String?
}

public protocol AuthRepository: Sendable {
    func signUp(email: String, password: String) async throws -> AuthenticatedUser
    func signIn(email: String, password: String) async throws -> AuthenticatedUser
    func signOut() async throws
    func currentUser() async -> AuthenticatedUser?
}

public final class SupabaseAuthRepository: AuthRepository {
    private let container: SupabaseServiceContainer

    public init(container: SupabaseServiceContainer) {
        self.container = container
    }

    public func signUp(email: String, password: String) async throws -> AuthenticatedUser {
        let response = try await container.client.auth.signUp(email: email, password: password)
        return AuthenticatedUser(id: response.user.id.uuidString, email: response.user.email)
    }

    public func signIn(email: String, password: String) async throws -> AuthenticatedUser {
        let session = try await container.client.auth.signIn(email: email, password: password)
        return AuthenticatedUser(id: session.user.id.uuidString, email: session.user.email)
    }

    public func signOut() async throws {
        try await container.client.auth.signOut()
    }

    public func currentUser() async -> AuthenticatedUser? {
        guard let user = try? await container.client.auth.session.user else { return nil }
        return AuthenticatedUser(id: user.id.uuidString, email: user.email)
    }
}
