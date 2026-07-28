import Foundation

/// Mirrors `database/prisma/schema.prisma`'s HomeSnapshot/Room/Zone/
/// Accessory/Scene models field-for-field so `MoodSyncAPIClient`'s
/// `pushHomeSnapshot` can encode this directly as the request body — see
/// docs/HOME_SCENES_ARCHITECTURE.md.
public struct HomeSnapshotDTO: Sendable, Codable, Equatable {
    public struct Room: Sendable, Codable, Equatable {
        public let roomId: String
        public let name: String
        public let temperatureC: Double?
        public let humidityPct: Double?
        public let airQuality: String?

        public init(roomId: String, name: String, temperatureC: Double? = nil, humidityPct: Double? = nil, airQuality: String? = nil) {
            self.roomId = roomId
            self.name = name
            self.temperatureC = temperatureC
            self.humidityPct = humidityPct
            self.airQuality = airQuality
        }
    }

    public struct Zone: Sendable, Codable, Equatable {
        public let zoneId: String
        public let name: String
        public let roomIds: [String]

        public init(zoneId: String, name: String, roomIds: [String]) {
            self.zoneId = zoneId
            self.name = name
            self.roomIds = roomIds
        }
    }

    /// Matches `HomeAccessoryCategory` in schema.prisma exactly (same raw
    /// string values) — never includes a camera/doorbell-video category,
    /// see `fetchHomeSnapshot()`'s mapping, which filters those out
    /// entirely rather than mapping them to `.other`.
    public enum AccessoryCategory: String, Sendable, Codable {
        case lock = "LOCK"
        case garageDoor = "GARAGE_DOOR"
        case alarmSystem = "ALARM_SYSTEM"
        case smokeDetector = "SMOKE_DETECTOR"
        case leakSensor = "LEAK_SENSOR"
        case windowCovering = "WINDOW_COVERING"
        case doorbell = "DOORBELL"
        case outletOrSwitch = "OUTLET_OR_SWITCH"
        case light = "LIGHT"
        case thermostatOrSensor = "THERMOSTAT_OR_SENSOR"
        case other = "OTHER"
    }

    public struct Accessory: Sendable, Codable, Equatable {
        public let accessoryId: String
        public let name: String
        public let roomId: String?
        public let category: AccessoryCategory
        public let manufacturer: String?
        public let model: String?
        public let firmwareVersion: String?
        public let reachable: Bool
        public let batteryLevelPct: Int?
        public let statusValue: String?
        public let isSecurityAccessory: Bool

        public init(
            accessoryId: String, name: String, roomId: String?, category: AccessoryCategory,
            manufacturer: String? = nil, model: String? = nil, firmwareVersion: String? = nil,
            reachable: Bool, batteryLevelPct: Int? = nil, statusValue: String? = nil,
            isSecurityAccessory: Bool = false
        ) {
            self.accessoryId = accessoryId
            self.name = name
            self.roomId = roomId
            self.category = category
            self.manufacturer = manufacturer
            self.model = model
            self.firmwareVersion = firmwareVersion
            self.reachable = reachable
            self.batteryLevelPct = batteryLevelPct
            self.statusValue = statusValue
            self.isSecurityAccessory = isSecurityAccessory
        }
    }

    public struct Scene: Sendable, Codable, Equatable {
        public let sceneId: String
        public let name: String
        public let accessoryIds: [String]

        public init(sceneId: String, name: String, accessoryIds: [String]) {
            self.sceneId = sceneId
            self.name = name
            self.accessoryIds = accessoryIds
        }
    }

    public let homeId: String
    public let homeName: String
    /// Always `false` — Matter accessories appear as ordinary
    /// `HMAccessory` objects with no separate third-party "Matter
    /// detection" API to query. Kept as an honest placeholder rather
    /// than fabricated detection logic; see
    /// docs/HOME_SCENES_ARCHITECTURE.md's sourcing table.
    public let isMatterHome: Bool
    public let rooms: [Room]
    public let zones: [Zone]
    public let accessories: [Accessory]
    public let scenes: [Scene]

    public init(homeId: String, homeName: String, isMatterHome: Bool = false, rooms: [Room], zones: [Zone], accessories: [Accessory], scenes: [Scene]) {
        self.homeId = homeId
        self.homeName = homeName
        self.isMatterHome = isMatterHome
        self.rooms = rooms
        self.zones = zones
        self.accessories = accessories
        self.scenes = scenes
    }
}

public enum HomeKitError: Error, Sendable {
    case noHomeConfigured
    case sceneNotFound(String)
    case activationFailed(String)
    /// `HMHomeManagerAuthorizationStatus.restricted` — e.g. Screen Time
    /// / parental controls blocking HomeKit access outright. Distinct
    /// from `.noHomeConfigured` (which means "access is fine, the user
    /// just hasn't set up a Home yet in Apple's Home app") since the
    /// recovery action differs: a restriction can't be fixed by
    /// configuring a Home, only by changing the device's restrictions.
    case restricted
    /// `waitUntilReady()` never received `homeManagerDidUpdateHomes` —
    /// normally near-instant, but with no Apple-documented upper bound,
    /// so this call times out defensively rather than hanging the UI
    /// forever on an unresponsive real device.
    case timedOut
}

/// Thin, testable seam over HomeKit — same protocol-seam rationale as
/// `HealthKitReading` (see that file's doc comment): a plain protocol the
/// app layer depends on, with the real `HMHomeManager`-backed
/// implementation behind `#if canImport(HomeKit)`.
///
/// **What's confirmed vs. flagged**: `HMHomeManager`/`HMHome`/`HMActionSet`
/// and the general shape of `executeActionSet` are HomeKit's long-stable,
/// widely-documented public API (Objective-C-bridged, using the
/// `(Error?) -> Void` completion-handler convention consistent across the
/// whole framework since iOS 8) — but a live fetch of
/// developer.apple.com's HomeKit reference pages in this session returned
/// only page titles (their docs are a JS-rendered SPA this tool can't
/// execute), so the exact signature below could not be independently
/// re-confirmed from a live source this round. Flagged here rather than
/// asserted as freshly verified — cross-check against Xcode's autocomplete/
/// the real SDK headers before shipping, same as any framework code
/// written without a live doc fetch.
///
/// **Confirmed real platform constraints** (via live web search this
/// session, see docs/HOMEKIT_ARCHITECTURE.md and
/// docs/HOME_SCENES_ARCHITECTURE.md): third-party apps can only
/// *control* accessories by activating pre-configured Scenes
/// (`HMActionSet`) — there is no per-accessory write/control surface
/// here. Reading accessory *metadata* is a separate, real capability:
/// `HMAccessory` exposes name, room, reachability, firmware version,
/// and an "Accessory Information" service (manufacturer/model/serial),
/// all public and third-party-readable — `fetchHomeSnapshot()` below
/// uses exactly this for the cached Home Dashboard, without granting
/// any new control capability. Background execution (without this app
/// open) still requires a special entitlement Apple grants case-by-case
/// via Developer Technical Support, not available by default.
public protocol HomeKitControlling: Sendable {
    func isHomeKitAvailable() -> Bool
    /// Scene names the user has configured in Apple's Home app, across
    /// their primary home — what a rule's `homekit.activate_scene`
    /// action's `params.sceneName` should match against.
    func listSceneNames() async throws -> [String]
    func activateScene(named sceneName: String) async throws
    /// True if `HMHomeManagerAuthorizationStatus.restricted` is set right
    /// now — checked synchronously, no `waitUntilReady()` needed, since
    /// authorization state (unlike the homes list itself) is available
    /// immediately.
    func isRestricted() -> Bool
    /// Full Home/Room/Zone/Accessory/Scene enumeration for the
    /// snapshot the backend caches (it can never query HomeKit
    /// directly) — see `HomeSnapshotDTO` and
    /// docs/HOME_SCENES_ARCHITECTURE.md. Reads `HMAccessory`'s
    /// "Accessory Information" service (manufacturer/model/firmware) —
    /// real, public, third-party-readable metadata, not the "arbitrary
    /// state" this file's earlier doc comment overstated as
    /// inaccessible; see docs/HOMEKIT_ARCHITECTURE.md's correction.
    func fetchHomeSnapshot() async throws -> HomeSnapshotDTO
}

#if canImport(HomeKit)
import HomeKit

/// **Important honesty note, unlike `HueBLEController`**: `canImport(HomeKit)`
/// is `false` on macOS (confirmed this session — HomeKit is an iOS/
/// watchOS/tvOS-only framework, it does not exist on macOS at all, not
/// even for compile-checking purposes). That means everything inside
/// this `#if` block — including `fetchHomeSnapshot()` below — is
/// **not compiled or type-checked by `swift build` in this sandbox**,
/// unlike `HueBLEController.swift`'s CoreBluetooth code (which does
/// exist on macOS and so genuinely is compile-verified here). This code
/// is hand-written against the real, documented HomeKit API surface but
/// has never been compiled by any Swift compiler in this environment —
/// it needs an actual Xcode/iOS build to even confirm it compiles, let
/// alone runs. See docs/HOME_SCENES_ARCHITECTURE.md.
///
/// `HMHomeManagerDelegate` conformance requires a class, and its
/// `homeManagerDidUpdateHomes` callback is how `HMHomeManager` reports
/// that `homes` has finished loading — there's no synchronous "wait for
/// ready" API, so callers await `waitUntilReady()` before reading `homes`.
public final class HomeKitController: NSObject, HomeKitControlling, HMHomeManagerDelegate, @unchecked Sendable {
    private let manager = HMHomeManager()
    private var readyContinuations: [CheckedContinuation<Void, Never>] = []
    private var isReady = false

    public override init() {
        super.init()
        manager.delegate = self
    }

    public func isHomeKitAvailable() -> Bool {
        // No `HKHealthStore.isHealthDataAvailable()` equivalent exists for
        // HomeKit — the framework itself is always linkable on supported
        // OS versions; "availability" in practice means "the user has at
        // least one home configured," checked after `waitUntilReady()`.
        true
    }

    public func isRestricted() -> Bool {
        manager.authorizationStatus.contains(.restricted)
    }

    /// Races `homeManagerDidUpdateHomes` against a fixed timeout — see
    /// `HomeKitError.timedOut`'s doc comment for why this doesn't just
    /// await the continuation unconditionally.
    private func waitUntilReady() async throws {
        if isReady { return }
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                await withCheckedContinuation { continuation in
                    self.readyContinuations.append(continuation)
                }
            }
            group.addTask {
                try await Task.sleep(nanoseconds: 5_000_000_000)
                throw HomeKitError.timedOut
            }
            try await group.next()
            group.cancelAll()
        }
    }

    public func homeManagerDidUpdateHomes(_ manager: HMHomeManager) {
        isReady = true
        let pending = readyContinuations
        readyContinuations.removeAll()
        for continuation in pending {
            continuation.resume()
        }
    }

    public func listSceneNames() async throws -> [String] {
        guard !isRestricted() else { throw HomeKitError.restricted }
        try await waitUntilReady()
        guard let home = manager.primaryHome ?? manager.homes.first else {
            throw HomeKitError.noHomeConfigured
        }
        return home.actionSets.map(\.name)
    }

    public func activateScene(named sceneName: String) async throws {
        guard !isRestricted() else { throw HomeKitError.restricted }
        try await waitUntilReady()
        guard let home = manager.primaryHome ?? manager.homes.first else {
            throw HomeKitError.noHomeConfigured
        }
        guard let actionSet = home.actionSets.first(where: { $0.name == sceneName }) else {
            throw HomeKitError.sceneNotFound(sceneName)
        }

        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            home.executeActionSet(actionSet) { error in
                if let error {
                    continuation.resume(throwing: HomeKitError.activationFailed(error.localizedDescription))
                } else {
                    continuation.resume()
                }
            }
        }
    }

    public func fetchHomeSnapshot() async throws -> HomeSnapshotDTO {
        guard !isRestricted() else { throw HomeKitError.restricted }
        try await waitUntilReady()
        guard let home = manager.primaryHome ?? manager.homes.first else {
            throw HomeKitError.noHomeConfigured
        }

        // Rooms have no sensor characteristics of their own — temperature/
        // humidity/air-quality live on individual accessories located in
        // the room (a room with a temperature-sensing thermostat gets a
        // real reading; a room with no sensor accessory stays nil rather
        // than guessed). This was previously a gap: HomeSnapshotDTO.Room
        // had these fields but nothing populated them — see
        // docs/HOME_HEALTH_SCORE.md.
        var rooms: [HomeSnapshotDTO.Room] = []
        for room in home.rooms {
            let accessoriesInRoom = home.accessories.filter { $0.room?.uniqueIdentifier == room.uniqueIdentifier }
            var temperatureC: Double?
            var humidityPct: Double?
            var airQuality: String?
            for accessory in accessoriesInRoom {
                if temperatureC == nil, let t = await readNumericCharacteristic(HMCharacteristicTypeCurrentTemperature, in: accessory) {
                    temperatureC = t
                }
                if humidityPct == nil, let h = await readNumericCharacteristic(HMCharacteristicTypeCurrentRelativeHumidity, in: accessory) {
                    humidityPct = h
                }
                if airQuality == nil, let a = await readValue(for: HMCharacteristicTypeAirQuality, in: accessory) {
                    airQuality = "\(a)"
                }
            }
            rooms.append(HomeSnapshotDTO.Room(roomId: room.uniqueIdentifier.uuidString, name: room.name, temperatureC: temperatureC, humidityPct: humidityPct, airQuality: airQuality))
        }

        let zones = home.zones.map { zone in
            HomeSnapshotDTO.Zone(
                zoneId: zone.uniqueIdentifier.uuidString,
                name: zone.name,
                roomIds: zone.rooms.map { $0.uniqueIdentifier.uuidString }
            )
        }

        var accessories: [HomeSnapshotDTO.Accessory] = []
        for accessory in home.accessories {
            // Camera/video-doorbell accessories are excluded entirely —
            // this feature deliberately doesn't build a Cameras surface
            // at all (HMCameraProfile only allows embedding a
            // system-rendered live view, never capturing frames — see
            // docs/HOME_SCENES_ARCHITECTURE.md's scope note).
            if accessory.category.categoryType == HMAccessoryCategoryTypeVideoDoorbell {
                continue
            }
            accessories.append(await snapshot(for: accessory))
        }

        let scenes = home.actionSets.map { actionSet in
            HomeSnapshotDTO.Scene(
                sceneId: actionSet.uniqueIdentifier.uuidString,
                name: actionSet.name,
                accessoryIds: Set(
                    actionSet.actions.compactMap { action -> String? in
                        // `HMCharacteristicWriteAction<ValueType>` is a
                        // Swift-generic-over-an-ObjC-class; its exact
                        // `ValueType` varies per action and isn't knowable
                        // here, so this reads the `characteristic`
                        // property via KVC (a real, stable Objective-C
                        // property on every instantiation) rather than an
                        // `as?` cast to one specific generic
                        // specialization, which would only match actions
                        // of that exact value type.
                        guard let characteristic = (action as? NSObject)?.value(forKey: "characteristic") as? HMCharacteristic else {
                            return nil
                        }
                        return characteristic.service?.accessory?.uniqueIdentifier.uuidString
                    }
                ).sorted()
            )
        }

        return HomeSnapshotDTO(
            homeId: home.uniqueIdentifier.uuidString,
            homeName: home.name,
            // No third-party "Matter detection" API exists — see
            // HomeSnapshotDTO.isMatterHome's doc comment. Always false,
            // not fabricated.
            isMatterHome: false,
            rooms: rooms,
            zones: zones,
            accessories: accessories,
            scenes: scenes
        )
    }

    /// Maps one `HMAccessoryCategory` to `HomeSnapshotDTO.AccessoryCategory`
    /// and reads its "Accessory Information" service + battery/status
    /// characteristics. Every characteristic read is individually
    /// try/catch-wrapped so one unreadable value (a real possibility —
    /// security/safety characteristic read access wasn't independently
    /// confirmed this session, see docs/HOME_SCENES_ARCHITECTURE.md)
    /// doesn't fail the whole snapshot.
    private func snapshot(for accessory: HMAccessory) async -> HomeSnapshotDTO.Accessory {
        let category = Self.mapCategory(accessory.category.categoryType)
        let infoService = accessory.services.first(where: { $0.serviceType == HMServiceTypeAccessoryInformation })

        async let manufacturer = readStringCharacteristic(HMCharacteristicTypeManufacturer, in: infoService)
        async let model = readStringCharacteristic(HMCharacteristicTypeModel, in: infoService)
        async let firmwareVersion = readStringCharacteristic(HMCharacteristicTypeFirmwareVersion, in: infoService)
        async let batteryLevel = readIntCharacteristic(HMCharacteristicTypeBatteryLevel, in: accessory)
        async let statusValue = readStatusValue(for: category, accessory: accessory)

        let isSecurity = category == .lock || category == .garageDoor || category == .alarmSystem

        return await HomeSnapshotDTO.Accessory(
            accessoryId: accessory.uniqueIdentifier.uuidString,
            name: accessory.name,
            roomId: accessory.room?.uniqueIdentifier.uuidString,
            category: category,
            manufacturer: manufacturer,
            model: model,
            firmwareVersion: firmwareVersion,
            reachable: accessory.isReachable,
            batteryLevelPct: batteryLevel,
            statusValue: statusValue,
            isSecurityAccessory: isSecurity
        )
    }

    private static func mapCategory(_ categoryType: String) -> HomeSnapshotDTO.AccessoryCategory {
        switch categoryType {
        case HMAccessoryCategoryTypeLock: return .lock
        case HMAccessoryCategoryTypeGarageDoorOpener: return .garageDoor
        case HMAccessoryCategoryTypeSecuritySystem: return .alarmSystem
        case HMAccessoryCategoryTypeSensor: return .smokeDetector
        case HMAccessoryCategoryTypeWindow, HMAccessoryCategoryTypeWindowCovering: return .windowCovering
        case HMAccessoryCategoryTypeDoorbell: return .doorbell
        case HMAccessoryCategoryTypeOutlet, HMAccessoryCategoryTypeSwitch: return .outletOrSwitch
        case HMAccessoryCategoryTypeLightbulb: return .light
        case HMAccessoryCategoryTypeThermostat: return .thermostatOrSensor
        default: return .other
        }
    }

    private func findCharacteristic(_ type: String, in service: HMService?) -> HMCharacteristic? {
        service?.characteristics.first(where: { $0.characteristicType == type })
    }

    private func findCharacteristic(_ type: String, in accessory: HMAccessory) -> HMCharacteristic? {
        for service in accessory.services {
            if let match = findCharacteristic(type, in: service) { return match }
        }
        return nil
    }

    private func readStringCharacteristic(_ type: String, in service: HMService?) async -> String? {
        guard let characteristic = findCharacteristic(type, in: service) else { return nil }
        return await readValue(characteristic) as? String
    }

    private func readIntCharacteristic(_ type: String, in accessory: HMAccessory) async -> Int? {
        guard let characteristic = findCharacteristic(type, in: accessory) else { return nil }
        guard let number = await readValue(characteristic) as? NSNumber else { return nil }
        return number.intValue
    }

    /// Used for `HMCharacteristicTypeCurrentTemperature` (Celsius, per
    /// HomeKit's own unit convention — confirmed real HomeKit API
    /// behavior, not independently re-verified against a live account
    /// this session) and `HMCharacteristicTypeCurrentRelativeHumidity`
    /// (percent). Returns `nil` for an accessory with no such
    /// characteristic rather than 0 — a room with no temperature sensor
    /// has "unknown," not "0°C."
    private func readNumericCharacteristic(_ type: String, in accessory: HMAccessory) async -> Double? {
        guard let characteristic = findCharacteristic(type, in: accessory) else { return nil }
        guard let number = await readValue(characteristic) as? NSNumber else { return nil }
        return number.doubleValue
    }

    /// Generic single-value read by characteristic type, accessory-wide
    /// — used where the caller only needs the raw value (e.g. air
    /// quality's enum-like value) rather than a specific numeric type.
    private func readValue(for type: String, in accessory: HMAccessory) async -> Any? {
        guard let characteristic = findCharacteristic(type, in: accessory) else { return nil }
        return await readValue(characteristic)
    }

    /// Best-effort primary-state read for Home Safety categories
    /// (lock/garage/alarm) — deliberately returns the characteristic's
    /// raw value as a loose string rather than a typed enum per
    /// category; not independently confirmed this session that
    /// third-party apps can read these specific characteristic types,
    /// so a failure here is expected and silently yields `nil` rather
    /// than failing the snapshot. See
    /// docs/HOME_SCENES_ARCHITECTURE.md.
    private func readStatusValue(for category: HomeSnapshotDTO.AccessoryCategory, accessory: HMAccessory) async -> String? {
        let type: String
        switch category {
        case .lock: type = HMCharacteristicTypeCurrentLockMechanismState
        case .garageDoor: type = HMCharacteristicTypeCurrentDoorState
        case .alarmSystem: type = HMCharacteristicTypeCurrentSecuritySystemState
        default: return nil
        }
        guard let characteristic = findCharacteristic(type, in: accessory) else { return nil }
        guard let value = await readValue(characteristic) else { return nil }
        return "\(value)"
    }

    /// Bridges `HMCharacteristic.readValue(completionHandler:)` (a
    /// simple completion-handler API, not delegate-based, unlike
    /// CoreBluetooth) to `async`, then returns `characteristic.value`.
    /// Swallows the error rather than throwing — a single unreadable
    /// characteristic (e.g. no read permission) shouldn't fail the
    /// whole snapshot, see `snapshot(for:)`'s doc comment.
    private func readValue(_ characteristic: HMCharacteristic) async -> Any? {
        await withCheckedContinuation { (continuation: CheckedContinuation<Any?, Never>) in
            characteristic.readValue { error in
                if error != nil {
                    continuation.resume(returning: nil)
                } else {
                    continuation.resume(returning: characteristic.value)
                }
            }
        }
    }
}
#endif
