import Foundation

public enum DeviceCommandRunResult: Sendable, Equatable {
    case noCommandsPending
    case completed(executed: Int, failed: Int)
    case failure(String)
}

/// Orchestrates one device-command poll cycle: fetch pending commands
/// from the backend, execute each locally via whichever controller the
/// action targets, report the outcome back. The inverse of
/// `SyncCoordinator` (which pushes HealthKit data up) — see
/// docs/HOMEKIT_ARCHITECTURE.md. Kept separate from the controllers and
/// `MoodSyncAPIClient` so it's testable against fakes of all of them
/// without touching HomeKit, Bluetooth, or the network.
///
/// Two providers queue commands here today, both because their control
/// path genuinely can't run on MoodSync's cloud backend: HomeKit (no
/// cloud API at all) and Bluetooth-only Hue bulbs (Bluetooth needs the
/// phone physically near the bulb). Commands run sequentially, not
/// concurrently — `HueBLEController` in particular holds one BLE
/// connection at a time and relies on that.
public final class DeviceCommandCoordinator {
    private let homeKit: HomeKitControlling
    private let hueBLE: HueBLEControlling?
    private let apiClient: MoodSyncAPIClientProtocol

    /// `hueBLE` is optional so callers that only care about HomeKit
    /// (or are running where CoreBluetooth isn't usable) don't have to
    /// construct a BLE controller they'll never use — a `hue_ble.*`
    /// command arriving with no controller wired up fails that one
    /// command loudly rather than silently skipping it.
    public init(homeKit: HomeKitControlling, hueBLE: HueBLEControlling? = nil, apiClient: MoodSyncAPIClientProtocol) {
        self.homeKit = homeKit
        self.hueBLE = hueBLE
        self.apiClient = apiClient
    }

    public func run(accessToken: String) async -> DeviceCommandRunResult {
        do {
            let commands = try await apiClient.fetchPendingDeviceCommands(accessToken: accessToken)
            if commands.isEmpty { return .noCommandsPending }

            var executed = 0
            var failed = 0
            for command in commands {
                do {
                    try await execute(command)
                    try await apiClient.completePendingDeviceCommand(id: command.id, status: .executed, accessToken: accessToken)
                    executed += 1
                } catch {
                    try? await apiClient.completePendingDeviceCommand(id: command.id, status: .failed(reason: describe(error)), accessToken: accessToken)
                    failed += 1
                }
            }
            return .completed(executed: executed, failed: failed)
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    /// Routes on `action.type`'s provider prefix — see
    /// shared/src/automation.ts's `ActionType` for the full list. An
    /// unrecognized type reaching this queue would be a real bug
    /// (dispatch.ts only queues the types handled below), so it fails
    /// loudly rather than silently skipping.
    private func execute(_ command: PendingDeviceCommand) async throws {
        switch command.action.type {
        case "homekit.activate_scene", "homekit.run_scene":
            guard let sceneName = command.action.params["sceneName"]?.stringValue else {
                throw HomeKitError.activationFailed("Missing params.sceneName")
            }
            try await homeKit.activateScene(named: sceneName)

        case "homekit.security_control":
            // Deliberately unimplemented on the device side, not just
            // gated — the backend already refuses to queue this action
            // at all while UserPreferences.securityControlEnabled is
            // false (see ai/src/actionExecutors.ts), and no actual
            // lock/garage/alarm write path has been built here this
            // round (out of scope — see docs/HOME_SCENES_ARCHITECTURE.md).
            // Failing loudly here is a second, independent line of
            // defense: even a wrongly-queued command can't execute.
            throw HomeKitError.activationFailed("Security-accessory control is not implemented on this device.")

        case "hue_ble.set_power":
            let controller = try requireHueBLE()
            guard let name = command.action.params["peripheralName"]?.stringValue else {
                throw HueBLEError.writeFailed("Missing params.peripheralName")
            }
            guard let on = command.action.params["on"]?.boolValue else {
                throw HueBLEError.writeFailed("Missing params.on")
            }
            try await controller.setPower(peripheralName: name, on: on)

        case "hue_ble.set_brightness":
            let controller = try requireHueBLE()
            guard let name = command.action.params["peripheralName"]?.stringValue else {
                throw HueBLEError.writeFailed("Missing params.peripheralName")
            }
            guard let brightness = command.action.params["brightness"]?.numberValue else {
                throw HueBLEError.writeFailed("Missing params.brightness")
            }
            try await controller.setBrightness(peripheralName: name, brightness: Int(brightness))

        default:
            throw HomeKitError.activationFailed("Unrecognized action type: \(command.action.type)")
        }
    }

    private func requireHueBLE() throws -> HueBLEControlling {
        guard let hueBLE else {
            throw HueBLEError.bluetoothUnavailable
        }
        return hueBLE
    }

    private func describe(_ error: Error) -> String {
        if let error = error as? HomeKitError { return describe(error) }
        if let error = error as? HueBLEError { return describe(error) }
        return error.localizedDescription
    }

    private func describe(_ error: HomeKitError) -> String {
        switch error {
        case .noHomeConfigured:
            return "No HomeKit home is configured on this device."
        case .sceneNotFound(let name):
            return "No HomeKit scene named \"\(name)\" was found — check the scene name in your automation rule."
        case .activationFailed(let message):
            return "Couldn't activate the scene: \(message)"
        case .restricted:
            return "HomeKit access is restricted on this device (check Screen Time / parental controls)."
        case .timedOut:
            return "Timed out waiting for HomeKit to respond — try again."
        }
    }

    private func describe(_ error: HueBLEError) -> String {
        switch error {
        case .bluetoothUnavailable:
            return "Bluetooth is off or unavailable — turn it on and allow MoodSync to use it."
        case .peripheralNotFound(let name):
            return "Couldn't find a Bluetooth light named \"\(name)\" nearby. Check the name matches, the bulb is powered and in range, and the Hue app isn't already connected to it."
        case .serviceNotFound:
            return "That light doesn't expose the expected Hue Bluetooth service — it may not be a Bluetooth-capable Hue bulb."
        case .characteristicNotFound:
            return "That light doesn't support this command over Bluetooth."
        case .writeFailed(let message):
            return "Couldn't send the command over Bluetooth: \(message)"
        case .timedOut:
            return "Timed out talking to the light over Bluetooth — make sure it's in range and try again."
        }
    }
}
