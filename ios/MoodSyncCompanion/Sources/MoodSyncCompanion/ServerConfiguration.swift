import Foundation

/// Persists the backend's base URL across launches — there is no single
/// correct default the way there would be for a shipped product with a
/// real deployed API, because this app currently only ever talks to a
/// developer's own locally-running backend (see
/// docs/IOS_REAL_DEVICE_SETUP_GUIDE.md). `http://localhost:3000` — what
/// this app hardcoded before — is wrong on a physical device: on-device,
/// "localhost" resolves to the iPhone itself, not the Mac running the
/// backend, so every request would fail. The onboarding flow asks the
/// user for their Mac's LAN IP instead and stores it here.
public enum ServerConfiguration {
    private static let userDefaultsKey = "moodsync.serverURLString"

    /// `nil` until the user has completed the onboarding step that sets
    /// this — callers must not assume a default is always present.
    public static var baseURL: URL? {
        get {
            guard let string = UserDefaults.standard.string(forKey: userDefaultsKey) else { return nil }
            return URL(string: string)
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: userDefaultsKey)
        }
    }

    public enum ValidationResult: Sendable, Equatable {
        case valid(URL)
        case invalid(String)
    }

    /// Basic shape validation before the URL is ever used in a request —
    /// catches the most common typos (missing scheme, pasted an email,
    /// stray whitespace) with an immediate, specific message instead of
    /// letting a malformed value fail obscurely on the first network
    /// call. Does not verify reachability — that's `MoodSyncAPIError
    /// .offline`/`.cannotReachServer`'s job, at actual request time.
    public static func validate(_ input: String) -> ValidationResult {
        let trimmed = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .invalid("Enter your Mac's server URL.") }
        guard let url = URL(string: trimmed), let scheme = url.scheme, let host = url.host, !host.isEmpty else {
            return .invalid("That doesn't look like a valid URL — include \"http://\", e.g. http://192.168.1.23:3000")
        }
        guard scheme == "http" || scheme == "https" else {
            return .invalid("URL must start with \"http://\" or \"https://\".")
        }
        return .valid(url)
    }
}
