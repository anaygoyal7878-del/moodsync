import SwiftUI

public struct OnboardingConsentView: View {
    @StateObject private var viewModel: OnboardingViewModel
    private let onFinished: () -> Void

    public init(container: AppContainer, onFinished: @escaping () -> Void) {
        _viewModel = StateObject(wrappedValue: OnboardingViewModel(container: container))
        self.onFinished = onFinished
    }

    public var body: some View {
        VStack(spacing: 24) {
            Spacer()

            Image(systemName: "heart.text.square.fill")
                .font(.system(size: 56))
                .foregroundStyle(.pink)

            Text("Sync with Apple Health")
                .font(.title2.bold())

            Text("MoodSync reads your heart rate, HRV, respiratory rate, sleep, mindfulness sessions, and workouts to infer your mood and adjust your diffuser automatically. Only a daily summary — never raw samples — is ever stored on our servers, and only once you consent below.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal)

            if let errorMessage = viewModel.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            Spacer()

            Button {
                Task {
                    await viewModel.requestHealthAccess()
                    if viewModel.didGrantAccess { onFinished() }
                }
            } label: {
                if viewModel.isRequestingAccess {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Text("Allow Health Access")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(viewModel.isRequestingAccess)

            Button("Not Now") {
                Task {
                    await viewModel.declineHealthSync()
                    onFinished()
                }
            }
            .foregroundStyle(.secondary)
        }
        .padding()
    }
}
