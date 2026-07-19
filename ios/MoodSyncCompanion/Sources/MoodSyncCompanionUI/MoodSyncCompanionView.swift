import SwiftUI
import MoodSyncCompanion

#if canImport(CoreLocation)
/// Forwards `LocationController`'s region-crossing callbacks to the
/// backend — kept as its own class (not inline in the View) since
/// `LocationEventObserving` requires a reference type and the View
/// itself is a value type. Holds the access token via a closure rather
/// than a stored copy so it always reads whatever `MoodSyncCompanionView`
/// currently has, without needing to be re-created on every sign-in.
private final class LocationPushObserver: LocationEventObserving, @unchecked Sendable {
    private let baseURL: URL
    private let accessTokenProvider: () -> String?

    init(baseURL: URL, accessTokenProvider: @escaping () -> String?) {
        self.baseURL = baseURL
        self.accessTokenProvider = accessTokenProvider
    }

    func locationController(didObserve event: LocationEventType, at occurredAt: Date) {
        guard let accessToken = accessTokenProvider() else { return }
        // Queue-and-return per docs/GEOFENCING_ARCHITECTURE.md's ~10s wake
        // window — this Task outlives the delegate callback but the
        // callback itself doesn't block on the network round trip.
        Task {
            try? await MoodSyncAPIClient(baseURL: baseURL).postLocationEvent(
                type: event,
                occurredAt: occurredAt,
                accessToken: accessToken
            )
        }
    }
}
#endif

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
    @State private var autoSyncTask: Task<Void, Never>?
    /// QA/demo convenience — see DemoHealthKitReader.swift's doc comment.
    /// Off by default; real HealthKit data is always what a normal run
    /// uses unless this is explicitly switched on.
    @State private var useDemoHealthData = false
    #if canImport(CoreLocation)
    @State private var locationController = LocationController()
    // Held strongly here since LocationController.observer is weak (it
    // doesn't own its observer, matching CLLocationManagerDelegate's
    // usual ownership direction) — without this, the observer set below
    // would be deallocated immediately after assignment.
    @State private var locationObserver: LocationPushObserver?
    @State private var locationStatus: String = ""
    #endif

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

                Toggle("Use demo health data", isOn: $useDemoHealthData)
                    .toggleStyle(.switch)
                if useDemoHealthData {
                    Text("Sync sends fixed sample data instead of reading real HealthKit values — for previewing the app without seeded Health app data.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }

                #if canImport(CoreLocation)
                Button("Set home to current location") { Task { await setHome() } }
                    .buttonStyle(.bordered)
                if !locationStatus.isEmpty {
                    Text(locationStatus)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                #endif
            }

            Text(status)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .onChange(of: accessToken) { _, newValue in
            #if canImport(CoreLocation)
            if newValue != nil {
                let observer = LocationPushObserver(baseURL: baseURL) { accessToken }
                locationObserver = observer
                locationController.observer = observer
            }
            #endif
            restartAutoSync(signedIn: newValue != nil)
        }
        .onDisappear { autoSyncTask?.cancel() }
    }

    /// Foreground auto-sync, matching the same `sync()` the "Sync now"
    /// button calls. Fires every 2.5 minutes while the app is open and
    /// signed in — that's the real cadence achievable here: iOS doesn't
    /// let a third-party app request a guaranteed background-execution
    /// interval (`BGAppRefreshTask` scheduling is OS-controlled and
    /// typically 15+ minutes, not developer-settable), so this
    /// intentionally only covers foreground/open-app time rather than
    /// claiming a background guarantee it can't deliver.
    private func restartAutoSync(signedIn: Bool) {
        autoSyncTask?.cancel()
        autoSyncTask = nil
        guard signedIn else { return }

        autoSyncTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 150 * 1_000_000_000)
                if Task.isCancelled { break }
                await sync()
            }
        }
    }

    #if canImport(CoreLocation)
    /// One-time setup: requests Always location access (required for
    /// region monitoring while the app is closed — see
    /// docs/GEOFENCING_ARCHITECTURE.md), then captures wherever the
    /// device currently is as the "home" region. Real authorization is
    /// asynchronous and user-driven (an Apple system prompt), so this
    /// simply requests it and reports the immediate outcome; a user who
    /// grants access after seeing "Location access needed" needs to tap
    /// this button again to actually set the region once granted.
    private func setHome() async {
        locationController.requestAlwaysAuthorization()
        do {
            try await locationController.setHomeToCurrentLocation()
            locationStatus = "Home set — arrival/departure automations are active."
        } catch LocationControllerError.authorizationDenied {
            locationStatus = "Location access needed — grant \"Always\" access in Settings, then try again."
        } catch {
            locationStatus = "Couldn't set home: \(error.localizedDescription)"
        }
    }
    #endif

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
            healthKit: useDemoHealthData ? DemoHealthKitReader() : HealthKitReader(),
            apiClient: MoodSyncAPIClient(baseURL: baseURL)
        )
        switch await coordinator.sync(accessToken: accessToken) {
        case .success(let count):
            status = "Synced — \(count) reading\(count == 1 ? "" : "s") sent."
        case .failure(let message):
            status = message
            return
        }

        // Checked right after a successful sync — this is "the next time
        // you open the app" moment docs/HOMEKIT_ARCHITECTURE.md describes
        // for homekit.* actions, since there's no other reliable wake
        // point available to a third-party app without Apple's
        // case-by-case background-execution entitlement.
        await checkPendingDeviceCommands(accessToken: accessToken)
    }

    #if canImport(HomeKit)
    private func checkPendingDeviceCommands(accessToken: String) async {
        let coordinator = DeviceCommandCoordinator(
            homeKit: HomeKitController(),
            apiClient: MoodSyncAPIClient(baseURL: baseURL)
        )
        switch await coordinator.run(accessToken: accessToken) {
        case .noCommandsPending:
            break
        case .completed(let executed, let failed):
            if executed > 0 || failed > 0 {
                status += " · HomeKit: \(executed) scene\(executed == 1 ? "" : "s") activated" + (failed > 0 ? ", \(failed) failed" : "")
            }
        case .failure(let message):
            status += " · HomeKit check failed: \(message)"
        }
    }
    #else
    private func checkPendingDeviceCommands(accessToken: String) async {}
    #endif
}
