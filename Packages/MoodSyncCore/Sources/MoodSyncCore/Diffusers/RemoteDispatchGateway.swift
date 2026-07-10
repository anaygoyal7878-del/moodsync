import Foundation

/// Abstracts the Supabase Edge Function calls (`devices-sync`,
/// `diffuser-dispatch`) that actually reach Moodo's and the user's Home
/// Assistant's cloud/local APIs. Provider account tokens are encrypted at
/// rest and only ever decrypted server-side (see
/// `supabase/functions/_shared/credentialCrypto.ts`), so the iOS app never
/// holds a Moodo or Home Assistant credential directly — it only calls
/// through this gateway. The app target supplies the concrete
/// implementation (backed by the Supabase Swift SDK); this package stays
/// network-library-agnostic and unit-testable via a fake gateway.
public protocol RemoteDispatchGateway: Sendable {
    func syncDevices(provider: DiffuserProviderKind) async throws -> [DiffuserDevice]

    func dispatch(
        deviceId: String,
        command: DiffuserCommand
    ) async throws -> RemoteDispatchOutcome

    func stop(deviceId: String) async throws
}

public enum RemoteDispatchOutcome: String, Sendable {
    case dispatched
    case skippedCooldown = "skipped_cooldown"
    case skippedUserOverride = "skipped_user_override"
    case failed
}
