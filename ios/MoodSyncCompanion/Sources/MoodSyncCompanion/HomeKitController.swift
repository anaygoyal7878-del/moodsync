import Foundation

public enum HomeKitError: Error, Sendable {
    case noHomeConfigured
    case sceneNotFound(String)
    case activationFailed(String)
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
/// session, see docs/HOMEKIT_ARCHITECTURE.md): third-party apps can only
/// activate pre-configured Scenes (`HMActionSet`), never control
/// individual accessories directly or query arbitrary state — and
/// background execution (without this app open) requires a special
/// entitlement Apple grants case-by-case via Developer Technical Support,
/// not available by default.
public protocol HomeKitControlling: Sendable {
    func isHomeKitAvailable() -> Bool
    /// Scene names the user has configured in Apple's Home app, across
    /// their primary home — what a rule's `homekit.activate_scene`
    /// action's `params.sceneName` should match against.
    func listSceneNames() async throws -> [String]
    func activateScene(named sceneName: String) async throws
}

#if canImport(HomeKit)
import HomeKit

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

    private func waitUntilReady() async {
        if isReady { return }
        await withCheckedContinuation { continuation in
            readyContinuations.append(continuation)
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
        await waitUntilReady()
        guard let home = manager.primaryHome ?? manager.homes.first else {
            throw HomeKitError.noHomeConfigured
        }
        return home.actionSets.map(\.name)
    }

    public func activateScene(named sceneName: String) async throws {
        await waitUntilReady()
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
}
#endif
