import SwiftUI
import MoodSyncCore

public struct AutomationRulesView: View {
    @StateObject private var viewModel: AutomationRulesViewModel

    public init(container: AppContainer) {
        _viewModel = StateObject(wrappedValue: AutomationRulesViewModel(container: container))
    }

    public var body: some View {
        NavigationStack {
            List(MoodLabel.allCases, id: \.self) { mood in
                NavigationLink {
                    AutomationRuleEditorView(mood: mood, viewModel: viewModel)
                } label: {
                    HStack {
                        MoodBadge(mood: mood)
                        Spacer()
                        let rule = viewModel.defaultRule(for: mood)
                        Text(rule.enabled ? "\(rule.runtimeMinutes) min • \(Int(rule.intensity * 100))%" : "Off")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .navigationTitle("Automation")
            .task { await viewModel.load() }
        }
    }
}

private struct AutomationRuleEditorView: View {
    let mood: MoodLabel
    @ObservedObject var viewModel: AutomationRulesViewModel
    @State private var rule: AutomationRule

    init(mood: MoodLabel, viewModel: AutomationRulesViewModel) {
        self.mood = mood
        self.viewModel = viewModel
        _rule = State(initialValue: viewModel.defaultRule(for: mood))
    }

    var body: some View {
        Form {
            Section {
                Toggle("Automate this mood", isOn: Binding(
                    get: { rule.enabled },
                    set: { updateRule(enabled: $0) }
                ))
            }

            if rule.enabled {
                Section("Fragrance") {
                    Picker("Profile", selection: Binding(
                        get: { rule.fragranceProfileId },
                        set: { updateRule(fragranceProfileId: $0) }
                    )) {
                        Text("Best match").tag(String?.none)
                        ForEach(viewModel.fragranceProfiles) { profile in
                            Text(profile.name).tag(String?.some(profile.id))
                        }
                    }
                }

                Section("Intensity") {
                    Slider(value: Binding(
                        get: { rule.intensity },
                        set: { updateRule(intensity: $0) }
                    ), in: 0...1)
                    Text("\(Int(rule.intensity * 100))%").foregroundStyle(.secondary)
                }

                Section("Timing") {
                    Stepper("Runtime: \(rule.runtimeMinutes) min", value: Binding(
                        get: { rule.runtimeMinutes },
                        set: { updateRule(runtimeMinutes: $0) }
                    ), in: 1...120)
                    Stepper("Cooldown: \(rule.cooldownMinutes) min", value: Binding(
                        get: { rule.cooldownMinutes },
                        set: { updateRule(cooldownMinutes: $0) }
                    ), in: 0...240, step: 5)
                }
            }
        }
        .navigationTitle(mood.rawValue.capitalized)
        .onDisappear {
            Task { await viewModel.save(rule) }
        }
    }

    private func updateRule(
        enabled: Bool? = nil,
        fragranceProfileId: String?? = nil,
        intensity: Double? = nil,
        runtimeMinutes: Int? = nil,
        cooldownMinutes: Int? = nil
    ) {
        rule = AutomationRule(
            mood: rule.mood,
            fragranceProfileId: fragranceProfileId ?? rule.fragranceProfileId,
            intensity: intensity ?? rule.intensity,
            runtimeMinutes: runtimeMinutes ?? rule.runtimeMinutes,
            cooldownMinutes: cooldownMinutes ?? rule.cooldownMinutes,
            enabled: enabled ?? rule.enabled
        )
    }
}
