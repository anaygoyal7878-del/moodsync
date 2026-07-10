import SwiftUI

public struct RootTabView: View {
    private let container: AppContainer

    public init(container: AppContainer) {
        self.container = container
    }

    public var body: some View {
        TabView {
            DashboardView(container: container)
                .tabItem { Label("Dashboard", systemImage: "waveform.path.ecg") }

            DevicesView(container: container)
                .tabItem { Label("Devices", systemImage: "diamond.circle") }

            AutomationRulesView(container: container)
                .tabItem { Label("Automation", systemImage: "wand.and.stars") }

            HistoryView(container: container)
                .tabItem { Label("History", systemImage: "clock.arrow.circlepath") }
        }
    }
}
