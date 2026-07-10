import Foundation

#if canImport(HomeKit)
import HomeKit

/// Controls native HomeKit diffuser-adjacent accessories (e.g. VOCOlinc
/// FlowerBud, Meross Smart WiFi Essential Oil Diffuser — both expose as
/// HomeKit "humidifier" accessories since Apple's Home app has no dedicated
/// diffuser category) or any certified HomeKit smart plug used as the
/// power-only fallback for a diffuser with no direct integration. HomeKit
/// has no server-side API, so unlike Moodo/Home Assistant this provider
/// talks to `HMHomeManager` directly on-device.
@available(iOS 13.0, *)
public final class HomeKitProvider: NSObject, DiffuserProvider, HMHomeManagerDelegate, @unchecked Sendable {
    public let kind: DiffuserProviderKind = .homeKit

    private let homeManager = HMHomeManager()
    private var homesReadyContinuation: CheckedContinuation<Void, Never>?
    private var didBecomeReady = false

    public override init() {
        super.init()
        homeManager.delegate = self
    }

    public func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        didBecomeReady = true
        homesReadyContinuation?.resume()
        homesReadyContinuation = nil
    }

    private func waitUntilReady() async {
        if didBecomeReady { return }
        await withCheckedContinuation { continuation in
            homesReadyContinuation = continuation
        }
    }

    public func discoverDevices() async throws -> [DiffuserDevice] {
        await waitUntilReady()

        var devices: [DiffuserDevice] = []
        for home in homeManager.homes {
            for accessory in home.accessories {
                guard let capabilities = capabilities(for: accessory) else { continue }
                devices.append(
                    DiffuserDevice(
                        id: accessory.uniqueIdentifier.uuidString,
                        provider: .homeKit,
                        externalId: accessory.uniqueIdentifier.uuidString,
                        name: accessory.name,
                        room: accessory.room?.name,
                        capabilities: capabilities,
                        isOnline: accessory.isReachable
                    )
                )
            }
        }
        return devices
    }

    public func send(_ command: DiffuserCommand, to device: DiffuserDevice) async throws {
        guard let accessory = accessory(matching: device) else {
            throw DiffuserProviderError.deviceUnreachable
        }

        if let powerCharacteristic = characteristic(in: accessory, type: HMCharacteristicTypePowerState) {
            try await write(true, to: powerCharacteristic)
        }

        if device.capabilities.intensity,
           let humidityCharacteristic = characteristic(in: accessory, type: HMCharacteristicTypeTargetRelativeHumidity) {
            try await write(command.intensity * 100, to: humidityCharacteristic)
        } else if device.capabilities.intensity,
                  let rotationCharacteristic = characteristic(in: accessory, type: HMCharacteristicTypeRotationSpeed) {
            try await write(command.intensity * 100, to: rotationCharacteristic)
        }
    }

    public func stop(_ device: DiffuserDevice) async throws {
        guard let accessory = accessory(matching: device),
              let powerCharacteristic = characteristic(in: accessory, type: HMCharacteristicTypePowerState) else {
            throw DiffuserProviderError.deviceUnreachable
        }
        try await write(false, to: powerCharacteristic)
    }

    private func accessory(matching device: DiffuserDevice) -> HMAccessory? {
        homeManager.homes
            .flatMap(\.accessories)
            .first { $0.uniqueIdentifier.uuidString == device.externalId }
    }

    private func capabilities(for accessory: HMAccessory) -> DiffuserCapabilities? {
        let hasPower = characteristic(in: accessory, type: HMCharacteristicTypePowerState) != nil
        guard hasPower else { return nil }
        let hasIntensity = characteristic(in: accessory, type: HMCharacteristicTypeTargetRelativeHumidity) != nil
            || characteristic(in: accessory, type: HMCharacteristicTypeRotationSpeed) != nil
        return DiffuserCapabilities(power: true, intensity: hasIntensity, scentSelection: false)
    }

    private func characteristic(in accessory: HMAccessory, type: String) -> HMCharacteristic? {
        accessory.services
            .flatMap(\.characteristics)
            .first { $0.characteristicType == type }
    }

    private func write(_ value: Any, to characteristic: HMCharacteristic) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            characteristic.writeValue(value) { error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume()
                }
            }
        }
    }
}
#endif
