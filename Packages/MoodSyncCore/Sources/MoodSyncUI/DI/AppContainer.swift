import Foundation
import MoodSyncCore
import MoodSyncHealthKit
import MoodSyncSupabase

/// Composition root: every ViewModel takes what it needs from here rather
/// than constructing dependencies itself, so ViewModels stay unit-testable
/// against fakes and the app has exactly one instance of anything
/// stateful (the mood engine, the provider registry, etc).
@MainActor
public final class AppContainer: ObservableObject {
    public let moodEngine: MoodEngine
    public let automationEngine: AutomationEngine
    public let providerRegistry: DiffuserProviderRegistry

    public let authRepository: AuthRepository
    public let profileRepository: ProfileRepository
    public let deviceRepository: DeviceRepository
    public let automationRuleRepository: AutomationRuleRepository
    public let fragranceProfileRepository: FragranceProfileRepository
    public let userPreferencesRepository: UserPreferencesRepository
    public let automationHistoryRepository: AutomationHistoryRepository
    public let moodHistoryRepository: MoodHistoryRepository
    public let moodIngestClient: MoodIngestClient
    public let healthSummaryUploader: HealthSummaryUploading

    public let healthKitAuthorizing: HealthKitAuthorizing
    public let healthSnapshotProvider: HealthMetricSnapshotProviding
    public let healthKitBackgroundMonitor: HealthKitBackgroundMonitoring

    public init(
        moodEngine: MoodEngine,
        automationEngine: AutomationEngine,
        providerRegistry: DiffuserProviderRegistry,
        authRepository: AuthRepository,
        profileRepository: ProfileRepository,
        deviceRepository: DeviceRepository,
        automationRuleRepository: AutomationRuleRepository,
        fragranceProfileRepository: FragranceProfileRepository,
        userPreferencesRepository: UserPreferencesRepository,
        automationHistoryRepository: AutomationHistoryRepository,
        moodHistoryRepository: MoodHistoryRepository,
        moodIngestClient: MoodIngestClient,
        healthSummaryUploader: HealthSummaryUploading,
        healthKitAuthorizing: HealthKitAuthorizing,
        healthSnapshotProvider: HealthMetricSnapshotProviding,
        healthKitBackgroundMonitor: HealthKitBackgroundMonitoring
    ) {
        self.moodEngine = moodEngine
        self.automationEngine = automationEngine
        self.providerRegistry = providerRegistry
        self.authRepository = authRepository
        self.profileRepository = profileRepository
        self.deviceRepository = deviceRepository
        self.automationRuleRepository = automationRuleRepository
        self.fragranceProfileRepository = fragranceProfileRepository
        self.userPreferencesRepository = userPreferencesRepository
        self.automationHistoryRepository = automationHistoryRepository
        self.moodHistoryRepository = moodHistoryRepository
        self.moodIngestClient = moodIngestClient
        self.healthSummaryUploader = healthSummaryUploader
        self.healthKitAuthorizing = healthKitAuthorizing
        self.healthSnapshotProvider = healthSnapshotProvider
        self.healthKitBackgroundMonitor = healthKitBackgroundMonitor
    }
}
