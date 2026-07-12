import SwiftUI
import MoodSyncCompanion

/// One-screen companion app: log into the same MoodSync account used on
/// the web, authorize HealthKit, sync. There is deliberately no
/// onboarding flow beyond this — the whole point of this app is to be
/// the minimum surface needed to get real HealthKit data into the
/// backend, not a second product.
@available(iOS 17.0, macOS 14.0, *)
public struct MoodSyncCompanionView: View {
    private let baseURL: URL

    @State private var email = ""
    @State private var password = ""
    @State private var accessToken: String?
    @State private var status: String = "Not signed in"
    @State private var isBusy = false

    public init(baseURL: URL) {
        self.baseURL = baseURL
    }

    public var body: some View {
        VStack(spacing: 16) {
            Text("MoodSync")
                .font(.title2)
                .fontWeight(.semibold)

            if accessToken == nil {
                TextField("Email", text: $email)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    #endif
                    .textFieldStyle(.roundedBorder)
                SecureField("Password", text: $password)
                    .textFieldStyle(.roundedBorder)
                Button(isBusy ? "Signing in…" : "Log in") { Task { await logIn() } }
                    .disabled(isBusy || email.isEmpty || password.isEmpty)
                    .buttonStyle(.borderedProminent)
            } else {
                Button(isBusy ? "Syncing…" : "Sync now") { Task { await sync() } }
                    .disabled(isBusy)
                    .buttonStyle(.borderedProminent)
            }

            Text(status)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
    }

    private func logIn() async {
        isBusy = true
        defer { isBusy = false }
        do {
            let client = MoodSyncAPIClient(baseURL: baseURL)
            let tokens = try await client.login(email: email, password: password)
            accessToken = tokens.accessToken
            status = "Signed in. Ready to sync."
        } catch {
            status = "Login failed: \(error.localizedDescription)"
        }
    }

    private func sync() async {
        guard let accessToken else { return }
        isBusy = true
        defer { isBusy = false }

        let coordinator = SyncCoordinator(
            healthKit: HealthKitReader(),
            apiClient: MoodSyncAPIClient(baseURL: baseURL)
        )
        switch await coordinator.sync(accessToken: accessToken) {
        case .success(let count):
            status = "Synced — \(count) reading\(count == 1 ? "" : "s") sent."
        case .failure(let message):
            status = message
        }
    }
}
