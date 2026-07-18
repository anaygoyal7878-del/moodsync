import Foundation

public enum LocationControllerError: Error, Sendable {
    case authorizationDenied
    case noHomeConfigured
}

/// Thin, testable seam over CoreLocation — same protocol-seam rationale as
/// `HealthKitReading`/`HomeKitControlling`: a plain protocol the app layer
/// depends on, with the real `CLLocationManager`-backed implementation
/// behind `#if canImport(CoreLocation)`.
///
/// **Real constraints this was built against** (verified live against
/// Apple's CoreLocation docs before writing any code — see
/// docs/GEOFENCING_ARCHITECTURE.md): one `CLCircularRegion` ("home"),
/// 100m radius (Apple's own recommended minimum for reliable detection);
/// region monitoring while the app is closed requires the **Always**
/// authorization tier (`requestAlwaysAuthorization()`, not just
/// when-in-use) plus `UIBackgroundModes: location` in Info.plist; iOS
/// debounces a boundary crossing by roughly 20 seconds before reporting
/// it, and only wakes the app for about 10 seconds to handle the
/// callback, so `didEnterRegion`/`didExitRegion` must push-and-return
/// (queue the network call, not block on it) rather than retry in a
/// loop.
public protocol LocationControlling: Sendable {
    /// True once the user has both granted Always authorization and set a
    /// home region — the two independent gates on this feature actually
    /// working while the app is closed.
    func isMonitoringActive() -> Bool
    /// Captures the device's current location as the one "home" region
    /// (100m radius) and begins monitoring it. Throws
    /// `.authorizationDenied` if Always access hasn't been granted —
    /// callers should request authorization first via
    /// `requestAlwaysAuthorization()`.
    func setHomeToCurrentLocation() async throws
    func requestAlwaysAuthorization()
    func stopMonitoring()
}

/// Fired when `CLLocationManagerDelegate` reports a region crossing —
/// the app layer (not this controller) owns pushing this to the backend
/// via `MoodSyncAPIClient.postLocationEvent`, matching `SyncCoordinator`'s
/// existing "controller reports, coordinator pushes" split.
public protocol LocationEventObserving: AnyObject, Sendable {
    func locationController(didObserve event: LocationEventType, at occurredAt: Date)
}

#if canImport(CoreLocation)
import CoreLocation

/// One geofenced "home" region — no multi-region support in v1 (see
/// docs/GEOFENCING_ARCHITECTURE.md §4), no raw coordinate ever leaves
/// the device (only the boolean ARRIVED/DEPARTED event is pushed, by
/// the app layer holding a `LocationEventObserving` reference, not this
/// class directly touching the network).
public final class LocationController: NSObject, LocationControlling, CLLocationManagerDelegate, @unchecked Sendable {
    private static let homeRegionIdentifier = "moodsync.home"
    private static let homeRegionRadiusMeters: CLLocationDistance = 100

    private let manager = CLLocationManager()
    public weak var observer: LocationEventObserving?

    public override init() {
        super.init()
        manager.delegate = self
    }

    public func isMonitoringActive() -> Bool {
        manager.authorizationStatus == .authorizedAlways
            && manager.monitoredRegions.contains { $0.identifier == Self.homeRegionIdentifier }
    }

    public func requestAlwaysAuthorization() {
        manager.requestAlwaysAuthorization()
    }

    public func setHomeToCurrentLocation() async throws {
        guard manager.authorizationStatus == .authorizedAlways else {
            throw LocationControllerError.authorizationDenied
        }
        guard let location = manager.location else {
            throw LocationControllerError.noHomeConfigured
        }

        for region in manager.monitoredRegions where region.identifier == Self.homeRegionIdentifier {
            manager.stopMonitoring(for: region)
        }

        let region = CLCircularRegion(
            center: location.coordinate,
            radius: Self.homeRegionRadiusMeters,
            identifier: Self.homeRegionIdentifier
        )
        region.notifyOnEntry = true
        region.notifyOnExit = true
        manager.startMonitoring(for: region)
    }

    public func stopMonitoring() {
        for region in manager.monitoredRegions where region.identifier == Self.homeRegionIdentifier {
            manager.stopMonitoring(for: region)
        }
    }

    public func locationManager(_ manager: CLLocationManager, didEnterRegion region: CLRegion) {
        guard region.identifier == Self.homeRegionIdentifier else { return }
        observer?.locationController(didObserve: .arrived, at: Date())
    }

    public func locationManager(_ manager: CLLocationManager, didExitRegion region: CLRegion) {
        guard region.identifier == Self.homeRegionIdentifier else { return }
        observer?.locationController(didObserve: .departed, at: Date())
    }
}
#endif
