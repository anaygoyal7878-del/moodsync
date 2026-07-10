import Foundation
import Supabase

public struct SupabaseConfig: Sendable {
    public let url: URL
    public let anonKey: String

    public init(url: URL, anonKey: String) {
        self.url = url
        self.anonKey = anonKey
    }
}

/// Single composition point for the Supabase client. Every repository in
/// this module takes a `SupabaseServiceContainer` rather than constructing
/// its own client, so the app has exactly one authenticated session.
public final class SupabaseServiceContainer: Sendable {
    public let client: SupabaseClient

    public init(config: SupabaseConfig) {
        self.client = SupabaseClient(supabaseURL: config.url, supabaseKey: config.anonKey)
    }
}
