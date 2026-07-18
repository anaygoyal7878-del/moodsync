import SwiftUI
import MoodSyncCompanion

/// First-launch permission flow. Order matters and follows Apple's
/// documented "soft ask" pattern (explain in your own UI before the
/// system prompt appears) plus the two-step location escalation Apple
/// recommends (request When In Use before ever requesting Always — see
/// docs/GEOFENCING_ARCHITECTURE.md):
///
/// 1. Server URL — nothing else works without this on a physical device
///    (see `ServerConfiguration`'s doc comment for why localhost is wrong).
/// 2. HealthKit — the app's primary purpose; asked first among the real
///    permissions since it's the one every feature depends on.
/// 3. Location, When In Use — required before Always can even be
///    requested.
/// 4. Location, Always — explained as its own step since granting it is
///    what makes arrival/departure automations work in the background.
/// 5. HomeKit — implicit: there is no explicit "request permission" call
///    the way HealthKit/Location have; the system prompt appears
///    automatically the first time `HMHomeManager` touches home data
///    (`HomeKitController.listSceneNames()`), so this step just explains
///    that before it happens and confirms the user has a Home set up in
///    Apple's Home app at all.
/// 6. Done.
@available(iOS 17.0, macOS 14.0, *)
public struct OnboardingView: View {
    private enum Step: Int, CaseIterable {
        case welcome, serverURL, health, locationWhenInUse, locationAlways, homeKit, done
    }

    @AppStorage("moodsync.hasCompletedOnboarding") private var hasCompletedOnboarding = false
    @State private var step: Step = .welcome
    @State private var serverURLText: String = ServerConfiguration.baseURL?.absoluteString ?? ""
    @State private var serverURLError: String?
    @State private var healthStatus: String?
    @State private var locationStatus: String?
    @State private var homeKitStatus: String?
    @State private var isBusy = false

    #if canImport(CoreLocation)
    @State private var locationController = LocationController()
    #endif

    public init() {}

    public var body: some View {
        VStack(spacing: 20) {
            ProgressView(value: Double(step.rawValue), total: Double(Step.allCases.count - 1))
            Spacer()
            content
            Spacer()
            controls
        }
        .padding()
        .animation(.default, value: step)
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .welcome:
            VStack(spacing: 12) {
                Text("Welcome to MoodSync").font(.title2).fontWeight(.semibold)
                Text("This companion app reads your Health data and pushes it to your MoodSync account, so your smart home can react to how you're actually doing. The next few steps ask for the permissions it needs, one at a time, with why before each system prompt.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        case .serverURL:
            VStack(alignment: .leading, spacing: 12) {
                Text("Server URL").font(.title2).fontWeight(.semibold)
                Text("MoodSync doesn't have a deployed server yet — point this at your Mac's backend on the same Wi-Fi network, e.g. http://192.168.1.23:3000. See the Real Device Setup Guide for how to find your Mac's IP.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                TextField("http://192.168.1.23:3000", text: $serverURLText)
                    #if os(iOS)
                    .textInputAutocapitalization(.never)
                    .keyboardType(.URL)
                    #endif
                    .autocorrectionDisabled()
                    .textFieldStyle(.roundedBorder)
                if let serverURLError {
                    Text(serverURLError).font(.caption).foregroundStyle(.red)
                }
            }
        case .health:
            VStack(spacing: 12) {
                Text("Health Data").font(.title2).fontWeight(.semibold)
                Text("MoodSync reads your heart rate, sleep, HRV, and activity from Health to compute your recovery/stress/focus scores. This is read-only — MoodSync never writes anything back to Health.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if let healthStatus {
                    Text(healthStatus).font(.caption).foregroundStyle(.secondary)
                }
            }
        case .locationWhenInUse:
            VStack(spacing: 12) {
                Text("Location — While Using").font(.title2).fontWeight(.semibold)
                Text("To trigger automations when you arrive home or leave, MoodSync needs to know your location. This first prompt is \"While Using the App\" — the next step upgrades it to work in the background.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if let locationStatus {
                    Text(locationStatus).font(.caption).foregroundStyle(.secondary)
                }
            }
        case .locationAlways:
            VStack(spacing: 12) {
                Text("Location — Always").font(.title2).fontWeight(.semibold)
                Text("Arrival/departure automations only work when this app isn't open, so iOS needs \"Always\" access to wake it for a boundary crossing. You can skip this and set it later in Settings — geofencing just won't fire until you do.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if let locationStatus {
                    Text(locationStatus).font(.caption).foregroundStyle(.secondary)
                }
            }
        case .homeKit:
            VStack(spacing: 12) {
                Text("HomeKit").font(.title2).fontWeight(.semibold)
                Text("If you've set up a Home in Apple's Home app, MoodSync can activate scenes you've configured there (like \"Relax\" or \"Focus\") as part of an automation. iOS will show its own permission prompt the first time this is used — there's nothing to configure here beyond having a Home set up.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                if let homeKitStatus {
                    Text(homeKitStatus).font(.caption).foregroundStyle(.secondary)
                }
            }
        case .done:
            VStack(spacing: 12) {
                Text("You're set").font(.title2).fontWeight(.semibold)
                Text("Log in with your MoodSync account to start syncing.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
    }

    @ViewBuilder
    private var controls: some View {
        switch step {
        case .welcome:
            Button("Get started") { advance() }.buttonStyle(.borderedProminent)
        case .serverURL:
            Button(isBusy ? "Saving…" : "Continue") { saveServerURL() }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy)
        case .health:
            Button(isBusy ? "Requesting…" : "Allow Health Access") { Task { await requestHealth() } }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy)
            Button("Skip for now") { advance() }.buttonStyle(.plain).foregroundStyle(.secondary)
        case .locationWhenInUse:
            Button(isBusy ? "Requesting…" : "Allow While Using") { Task { await requestLocationWhenInUse() } }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy)
            Button("Skip for now") { advance() }.buttonStyle(.plain).foregroundStyle(.secondary)
        case .locationAlways:
            Button(isBusy ? "Requesting…" : "Allow Always") { Task { await requestLocationAlways() } }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy)
            Button("Skip for now") { advance() }.buttonStyle(.plain).foregroundStyle(.secondary)
        case .homeKit:
            Button(isBusy ? "Checking…" : "Continue") { Task { await checkHomeKit() } }
                .buttonStyle(.borderedProminent)
                .disabled(isBusy)
        case .done:
            Button("Continue to login") { hasCompletedOnboarding = true }.buttonStyle(.borderedProminent)
        }
    }

    private func advance() {
        guard let next = Step(rawValue: step.rawValue + 1) else { return }
        step = next
    }

    private func saveServerURL() {
        switch ServerConfiguration.validate(serverURLText) {
        case .valid(let url):
            serverURLError = nil
            ServerConfiguration.baseURL = url
            advance()
        case .invalid(let message):
            serverURLError = message
        }
    }

    private func requestHealth() async {
        isBusy = true
        defer { isBusy = false }
        do {
            try await HealthKitReader().requestAuthorization()
            // HealthKit's read-authorization completion never reveals
            // per-type grant/deny for privacy reasons (see
            // docs/APPLE_HEALTH_ARCHITECTURE.md) — a successful call here
            // only means the system prompt was shown and answered, not
            // that every type was granted, so the message reflects that
            // rather than claiming certainty.
            healthStatus = "Health prompt shown — MoodSync will use whatever access you granted."
            advance()
        } catch HealthKitError.notAvailableOnThisDevice {
            healthStatus = "Health data isn't available on this device (e.g. iPad, or a Simulator without Health data)."
            advance()
        } catch {
            healthStatus = "Couldn't request Health access: \(error.localizedDescription)"
        }
    }

    #if canImport(CoreLocation)
    private func requestLocationWhenInUse() async {
        isBusy = true
        defer { isBusy = false }
        guard await locationController.isLocationServicesEnabled() else {
            locationStatus = "Location Services are off for this device — enable them in Settings > Privacy & Security > Location Services, then come back."
            isBusy = false
            return
        }
        locationController.requestWhenInUseAuthorization()
        // `requestWhenInUseAuthorization()` is fire-and-forget (the
        // system prompt is asynchronous and there's no completion
        // handler) — this app doesn't have a delegate callback wired for
        // authorization-change notifications yet, so it gives the system
        // prompt a moment to be answered before reading the result back.
        try? await Task.sleep(nanoseconds: 800_000_000)
        switch locationController.authorizationState() {
        case .whenInUseOnly, .authorizedAlways:
            locationStatus = "Location access granted."
            advance()
        case .deniedOrRestricted:
            locationStatus = "Location access denied — you can change this later in Settings > Privacy & Security > Location Services > MoodSync."
        case .notDetermined:
            locationStatus = "Waiting for a response to the system prompt…"
        }
    }

    private func requestLocationAlways() async {
        isBusy = true
        defer { isBusy = false }
        locationController.requestAlwaysAuthorization()
        try? await Task.sleep(nanoseconds: 800_000_000)
        switch locationController.authorizationState() {
        case .authorizedAlways:
            locationStatus = "Always access granted — arrival/departure automations are ready once you set a home location from the main screen."
            advance()
        case .whenInUseOnly:
            locationStatus = "Still \"While Using\" only — iOS sometimes requires opening Settings directly for this upgrade: Settings > Privacy & Security > Location Services > MoodSync > Always."
        case .deniedOrRestricted, .notDetermined:
            locationStatus = "Location access isn't granted — geofencing won't work until it is."
        }
    }
    #else
    private func requestLocationWhenInUse() async { advance() }
    private func requestLocationAlways() async { advance() }
    #endif

    #if canImport(HomeKit)
    private func checkHomeKit() async {
        isBusy = true
        defer { isBusy = false }
        let homeKit = HomeKitController()
        if homeKit.isRestricted() {
            homeKitStatus = "HomeKit is restricted on this device (Screen Time / parental controls) — scene automations won't be available."
            advance()
            return
        }
        do {
            let scenes = try await homeKit.listSceneNames()
            homeKitStatus = scenes.isEmpty
                ? "No HomeKit scenes found yet — set one up in Apple's Home app if you want to use HomeKit automations."
                : "Found \(scenes.count) HomeKit scene\(scenes.count == 1 ? "" : "s")."
        } catch HomeKitError.noHomeConfigured {
            homeKitStatus = "No Home is set up in Apple's Home app yet — you can add one later; HomeKit automations just won't run until you do."
        } catch HomeKitError.timedOut {
            homeKitStatus = "HomeKit didn't respond — you can continue and check again later."
        } catch {
            homeKitStatus = "Couldn't check HomeKit: \(error.localizedDescription)"
        }
        advance()
    }
    #else
    private func checkHomeKit() async { advance() }
    #endif
}
