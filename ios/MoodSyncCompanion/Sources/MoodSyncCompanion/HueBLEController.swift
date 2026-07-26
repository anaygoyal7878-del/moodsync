import Foundation

public enum HueBLEError: Error, Sendable {
    /// Bluetooth radio is off, or this app isn't authorized to use it —
    /// `CBManagerState` anything other than `.poweredOn`/`.unknown`/
    /// `.resetting`.
    case bluetoothUnavailable
    /// No BLE peripheral advertising the Hue light service was found
    /// with this name within the scan window — either the name doesn't
    /// match what the bulb actually advertises, the bulb is out of
    /// range, or its Bluetooth radio is off (Hue bulbs stop advertising
    /// while a Hue Bridge or the Hue app already holds a connection).
    case peripheralNotFound(String)
    case serviceNotFound
    case characteristicNotFound
    case writeFailed(String)
    /// No Apple-documented upper bound on how long scanning/connecting
    /// "should" take, so this call times out defensively rather than
    /// hanging forever on a bulb that's out of range or unresponsive —
    /// same rationale as `HomeKitError.timedOut`.
    case timedOut
}

/// Thin, testable seam over CoreBluetooth — same protocol-seam rationale
/// as `HomeKitController`: a plain protocol the app layer depends on,
/// with the real `CBCentralManager`-backed implementation behind
/// `#if canImport(CoreBluetooth)`.
///
/// **This is fundamentally different from every other provider in this
/// codebase: there is no Philips-published API here.** The service/
/// characteristic UUIDs and byte payload formats this talks to come from
/// independent community reverse-engineering, not Philips documentation
/// — see docs/HUE_BLE_ARCHITECTURE.md for exact sources and per-field
/// confidence. Philips does not support, document, or guarantee this
/// protocol continuing to work; a bulb firmware update could silently
/// break it. CoreBluetooth's own delegate/API surface used to talk to it
/// (`CBCentralManager`, `CBPeripheral`, standard connect/discover/write
/// callbacks) is long-stable, widely-documented Apple framework API —
/// that part is as confirmed as HomeKitController's HMHomeManager calls.
/// It's specifically the Hue-side UUIDs and byte formats that are
/// unofficial.
public protocol HueBLEControlling: Sendable {
    func isBluetoothAvailable() -> Bool
    /// `peripheralName` matches the bulb's advertised Bluetooth name
    /// (whatever the user typed into the automation rule) — there's no
    /// server-side device list for Bluetooth-only bulbs the way cloud
    /// Hue's `syncDevices` produces one, so name-matching is the only
    /// handle available, same reasoning as HomeKit's scene-name
    /// matching in `HomeKitController`.
    func setPower(peripheralName: String, on: Bool) async throws
    /// `brightness` is 0-100 (percent, matching the cloud Hue action's
    /// param shape) — converted to the protocol's 0-255 byte range
    /// internally.
    func setBrightness(peripheralName: String, brightness: Int) async throws
}

#if canImport(CoreBluetooth)
import CoreBluetooth

/// `CBCentralManagerDelegate`/`CBPeripheralDelegate` conformance
/// requires a class, and both are entirely completion-callback based —
/// there's no synchronous "wait for X" API, so every step here bridges a
/// delegate callback to `async` via a single stored continuation. Only
/// one command runs at a time (`DeviceCommandCoordinator` executes
/// `PendingDeviceCommand`s sequentially, one after another — see its own
/// doc comment), so a single stored continuation per phase is sufficient
/// and deliberately simpler than a per-request dictionary.
public final class HueBLEController: NSObject, HueBLEControlling, CBCentralManagerDelegate, CBPeripheralDelegate, @unchecked Sendable {
    /// Reverse-engineered, not Philips-published — see
    /// docs/HUE_BLE_ARCHITECTURE.md §2. Power and brightness specifically
    /// are corroborated across two independent community write-ups with
    /// matching byte formats; this controller deliberately implements
    /// only those two, not color/color-temperature, which had only one
    /// source with a byte format description that read as internally
    /// inconsistent.
    private static let serviceUUID = CBUUID(string: "932C32BD-0000-47A2-835A-A8D455B859DD")
    private static let powerCharacteristicUUID = CBUUID(string: "932C32BD-0002-47A2-835A-A8D455B859DD")
    private static let brightnessCharacteristicUUID = CBUUID(string: "932C32BD-0003-47A2-835A-A8D455B859DD")

    private var manager: CBCentralManager!
    private var poweredOnContinuation: CheckedContinuation<Void, Error>?
    private var discoveryTarget: (name: String, continuation: CheckedContinuation<CBPeripheral, Error>)?
    private var connectContinuation: CheckedContinuation<Void, Error>?
    private var serviceContinuation: CheckedContinuation<CBService, Error>?
    private var characteristicsContinuation: CheckedContinuation<[CBCharacteristic], Error>?
    private var writeContinuation: CheckedContinuation<Void, Error>?
    private var connectedPeripheral: CBPeripheral?

    public override init() {
        super.init()
        manager = CBCentralManager(delegate: self, queue: nil)
    }

    public func isBluetoothAvailable() -> Bool {
        manager.state == .poweredOn
    }

    public func setPower(peripheralName: String, on: Bool) async throws {
        let characteristic = try await connectAndDiscover(peripheralName: peripheralName, characteristicUUID: Self.powerCharacteristicUUID)
        // Byte format from community reverse-engineering (two
        // independent sources agree) — see
        // docs/HUE_BLE_ARCHITECTURE.md §2: 0x010101 = on, 0x010100 = off.
        let payload = Data([0x01, 0x01, on ? 0x01 : 0x00])
        try await write(payload, to: characteristic)
        disconnect()
    }

    public func setBrightness(peripheralName: String, brightness: Int) async throws {
        let characteristic = try await connectAndDiscover(peripheralName: peripheralName, characteristicUUID: Self.brightnessCharacteristicUUID)
        let clamped = max(0, min(100, brightness))
        let byteValue = UInt8((clamped * 255) / 100)
        // Byte format from community reverse-engineering — see
        // docs/HUE_BLE_ARCHITECTURE.md §2: 0x02 0x01 <value 0x00-0xFF>.
        let payload = Data([0x02, 0x01, byteValue])
        try await write(payload, to: characteristic)
        disconnect()
    }

    // MARK: - Sequential connect/discover/write pipeline

    private func waitForPoweredOn() async throws {
        if manager.state == .poweredOn { return }
        guard manager.state == .unknown || manager.state == .resetting else {
            throw HueBLEError.bluetoothUnavailable
        }
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
                    self.poweredOnContinuation = continuation
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: 5_000_000_000)
                throw HueBLEError.timedOut
            }
            try await group.next()
            group.cancelAll()
        }
    }

    private func scanAndConnect(peripheralName: String) async throws -> CBPeripheral {
        let peripheral: CBPeripheral = try await withThrowingTaskGroup(of: CBPeripheral.self) { group in
            group.addTask {
                try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<CBPeripheral, Error>) in
                    self.discoveryTarget = (peripheralName, continuation)
                    self.manager.scanForPeripherals(withServices: [Self.serviceUUID], options: nil)
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: 8_000_000_000)
                throw HueBLEError.peripheralNotFound(peripheralName)
            }
            guard let first = try await group.next() else {
                throw HueBLEError.peripheralNotFound(peripheralName)
            }
            group.cancelAll()
            return first
        }
        manager.stopScan()

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            self.connectContinuation = continuation
            self.manager.connect(peripheral, options: nil)
        }
        peripheral.delegate = self
        connectedPeripheral = peripheral
        return peripheral
    }

    private func connectAndDiscover(peripheralName: String, characteristicUUID: CBUUID) async throws -> CBCharacteristic {
        try await waitForPoweredOn()
        let peripheral = try await scanAndConnect(peripheralName: peripheralName)

        let service = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<CBService, Error>) in
            self.serviceContinuation = continuation
            peripheral.discoverServices([Self.serviceUUID])
        }

        let characteristics = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<[CBCharacteristic], Error>) in
            self.characteristicsContinuation = continuation
            peripheral.discoverCharacteristics([Self.powerCharacteristicUUID, Self.brightnessCharacteristicUUID], for: service)
        }

        guard let characteristic = characteristics.first(where: { $0.uuid == characteristicUUID }) else {
            throw HueBLEError.characteristicNotFound
        }
        return characteristic
    }

    private func write(_ data: Data, to characteristic: CBCharacteristic) async throws {
        guard let peripheral = connectedPeripheral else { throw HueBLEError.writeFailed("No connected peripheral") }

        // Prefer a confirmed write (`.withResponse`) when the
        // characteristic supports it, since that's what lets this
        // actually detect failure via `didWriteValueFor` — fall back to
        // `.withoutResponse` (fire-and-forget, no delegate callback at
        // all) only if the characteristic doesn't advertise `.write`.
        guard characteristic.properties.contains(.write) else {
            peripheral.writeValue(data, for: characteristic, type: .withoutResponse)
            return
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            self.writeContinuation = continuation
            peripheral.writeValue(data, for: characteristic, type: .withResponse)
        }
    }

    private func disconnect() {
        if let peripheral = connectedPeripheral {
            manager.cancelPeripheralConnection(peripheral)
        }
        connectedPeripheral = nil
    }

    // MARK: - CBCentralManagerDelegate

    public func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard let continuation = poweredOnContinuation else { return }
        if central.state == .poweredOn {
            poweredOnContinuation = nil
            continuation.resume()
        } else if central.state != .unknown && central.state != .resetting {
            poweredOnContinuation = nil
            continuation.resume(throwing: HueBLEError.bluetoothUnavailable)
        }
    }

    public func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard let target = discoveryTarget else { return }
        let advertisedName = advertisementData[CBAdvertisementDataLocalNameKey] as? String
        guard peripheral.name == target.name || advertisedName == target.name else { return }
        discoveryTarget = nil
        target.continuation.resume(returning: peripheral)
    }

    public func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        connectContinuation?.resume()
        connectContinuation = nil
    }

    public func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        connectContinuation?.resume(throwing: HueBLEError.writeFailed(error?.localizedDescription ?? "Failed to connect"))
        connectContinuation = nil
    }

    // MARK: - CBPeripheralDelegate

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        if let error {
            serviceContinuation?.resume(throwing: HueBLEError.writeFailed(error.localizedDescription))
        } else if let service = peripheral.services?.first(where: { $0.uuid == Self.serviceUUID }) {
            serviceContinuation?.resume(returning: service)
        } else {
            serviceContinuation?.resume(throwing: HueBLEError.serviceNotFound)
        }
        serviceContinuation = nil
    }

    public func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        if let error {
            characteristicsContinuation?.resume(throwing: HueBLEError.writeFailed(error.localizedDescription))
        } else {
            characteristicsContinuation?.resume(returning: service.characteristics ?? [])
        }
        characteristicsContinuation = nil
    }

    public func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error {
            writeContinuation?.resume(throwing: HueBLEError.writeFailed(error.localizedDescription))
        } else {
            writeContinuation?.resume()
        }
        writeContinuation = nil
    }
}
#endif
