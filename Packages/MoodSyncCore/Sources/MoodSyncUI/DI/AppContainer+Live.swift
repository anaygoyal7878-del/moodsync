import Foundation
import MoodSyncCore
import MoodSyncHealthKit
import MoodSyncSupabase

#if !canImport(HealthKit)
/// HealthKit only exists on iOS/watchOS. These no-op stand-ins let the rest
/// of the app (SwiftUI previews, macOS-hosted unit tests of ViewModels)
/// compile and run without ever claiming to read real health data — they
/// always report "unavailable" rather than fabricating values.
private struct UnavailableHealthKitAuthorizing: HealthKitAuthorizing {
    func isHealthDataAvailable() -> Bool { false }
    func requestAuthorization() async throws { throw HealthKitAuthorizationError.notAvailableOnThisDevice }
}

private struct UnavailableHealthSnapshotProvider: HealthMetricSnapshotProviding {
    func currentSnapshot() async throws -> MoodMetricSnapshot {
        MoodMetricSnapshot(values: [.timeOfDayHour: Double(Calendar.current.component(.hour, from: Date()))])
    }
}

private final class UnavailableHealthKitBackgroundMonitor: HealthKitBackgroundMonitoring, @unchecked Sendable {
    func startMonitoring(onUpdate: @escaping @Sendable () async -> Void) throws {}
    func stopMonitoring() {}
}
#endif

public extension AppContainer {
    /// Builds the real app composition: live Supabase-backed repositories
    /// and, on iOS/watchOS, the real HealthKit implementations.
    static func makeLive(supabaseConfig: SupabaseConfig) -> AppContainer {
        let serviceContainer = SupabaseServiceContainer(config: supabaseConfig)
        let deviceRepository = SupabaseDeviceRepository(container: serviceContainer)
        let gateway = SupabaseRemoteDispatchGateway(container: serviceContainer, deviceRepository: deviceRepository)

        let providerRegistry = DiffuserProviderRegistry(providers: [
            MoodoProvider(gateway: gateway),
            HomeAssistantProvider(gateway: gateway),
            GoveeProvider(gateway: gateway),
            SwitchBotProvider(gateway: gateway),
            makeHomeKitProvider(),
        ].compactMap { $0 })

        #if canImport(HealthKit)
        let healthKitAuthorizing: HealthKitAuthorizing = HealthKitAuthorizationManager()
        let healthSnapshotProvider: HealthMetricSnapshotProviding = HealthMetricSnapshotBuilder()
        let healthKitBackgroundMonitor: HealthKitBackgroundMonitoring = HealthKitBackgroundMonitor()
        #else
        let healthKitAuthorizing: HealthKitAuthorizing = UnavailableHealthKitAuthorizing()
        let healthSnapshotProvider: HealthMetricSnapshotProviding = UnavailableHealthSnapshotProvider()
        let healthKitBackgroundMonitor: HealthKitBackgroundMonitoring = UnavailableHealthKitBackgroundMonitor()
        #endif

        return AppContainer(
            moodEngine: MoodEngine(),
            automationEngine: AutomationEngine(),
            providerRegistry: providerRegistry,
            authRepository: SupabaseAuthRepository(container: serviceContainer),
            profileRepository: SupabaseProfileRepository(container: serviceContainer),
            deviceRepository: deviceRepository,
            automationRuleRepository: SupabaseAutomationRuleRepository(container: serviceContainer),
            fragranceProfileRepository: SupabaseFragranceProfileRepository(container: serviceContainer),
            userPreferencesRepository: SupabaseUserPreferencesRepository(container: serviceContainer),
            automationHistoryRepository: SupabaseAutomationHistoryRepository(container: serviceContainer),
            moodHistoryRepository: SupabaseMoodHistoryRepository(container: serviceContainer),
            moodIngestClient: SupabaseMoodIngestClient(container: serviceContainer),
            healthSummaryUploader: SupabaseHealthSummaryUploader(container: serviceContainer),
            healthKitAuthorizing: healthKitAuthorizing,
            healthSnapshotProvider: healthSnapshotProvider,
            healthKitBackgroundMonitor: healthKitBackgroundMonitor
        )
    }

    private static func makeHomeKitProvider() -> (any DiffuserProvider)? {
        #if canImport(HomeKit)
        if #available(iOS 13.0, *) {
            return HomeKitProvider()
        }
        return nil
        #else
        return nil
        #endif
    }
}
