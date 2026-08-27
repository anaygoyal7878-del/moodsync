import Foundation

/// Persists the backend's base URL across launches.
///
/// The deployed backend is the default, so a normal user never has to
/// know what a base URL is — install, sign in, done. `baseURL` therefore
/// always resolves to something usable.
///
/// The override still exists because a developer running the backend on
/// their own Mac needs it: `http://localhost:3000` is wrong on a physical
/// device (on-device, "localhost" is the iPhone itself, not the Mac), so
/// pointing at a LAN IP like `http://192.168.1.23:3000` is the only way
/// to test against local changes. See docs/IOS_REAL_DEVICE_SETUP_GUIDE.md.
public enum ServerConfiguration {
    private static let userDefaultsKey = "moodsync.serverURLString"

    /// The hosted MoodSync backend — where the app points unless someone
    /// deliberately overrides it. Not a secret: this is the same public
    /// origin the web dashboard calls.
    public static let defaultBaseURL = URL(string: "https://backend-production-046a8.up.railway.app")!

    /// What the user explicitly set, or `nil` if they never have. Use this
    /// (not `baseURL`) to tell "pointed at their own backend" apart from
    /// "on the default" — the onboarding screen needs that distinction,
    /// request code does not.
    public static var storedBaseURL: URL? {
        get {
            guard let string = UserDefaults.standard.string(forKey: userDefaultsKey) else { return nil }
            return URL(string: string)
        }
        set {
            UserDefaults.standard.set(newValue?.absoluteString, forKey: userDefaultsKey)
        }
    }

    /// The URL requests should actually use. Always present: falls back to
    /// the deployed backend when the user hasn't overridden it.
    public static var baseURL: URL {
        storedBaseURL ?? defaultBaseURL
    }

    /// Drops any override and returns to the hosted backend.
    public static func resetToDefault() {
        UserDefaults.standard.removeObject(forKey: userDefaultsKey)
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
        guard !trimmed.isEmpty else { return .invalid("Enter a server URL, or leave it on the default.") }
        guard let url = URL(string: trimmed), let scheme = url.scheme, let host = url.host, !host.isEmpty else {
            return .invalid("That doesn't look like a valid URL — include \"https://\", e.g. https://example.com")
        }
        guard scheme == "http" || scheme == "https" else {
            return .invalid("URL must start with \"http://\" or \"https://\".")
        }
        return .valid(url)
    }
}
