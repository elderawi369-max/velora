import Foundation
import GoogleMobileAds
import UIKit
import UserMessagingPlatform

@MainActor
final class VeloraAdsConsentManager {
    static let shared = VeloraAdsConsentManager()

    private var preparing = false
    private var mobileAdsStarted = false
    private var completions: [(Bool) -> Void] = []

    private init() {}

    func prepare(from viewController: UIViewController?, completion: @escaping (Bool) -> Void) {
        completions.append(completion)
        guard !preparing else { return }
        preparing = true

        let parameters = RequestParameters()
        ConsentInformation.shared.requestConsentInfoUpdate(with: parameters) { [weak self] requestError in
            Task { @MainActor in
                guard let self else { return }
                if requestError != nil && !ConsentInformation.shared.canRequestAds {
                    self.finish(allowed: false)
                    return
                }

                do {
                    try await ConsentForm.loadAndPresentIfRequired(from: viewController)
                } catch {
                    if !ConsentInformation.shared.canRequestAds {
                        self.finish(allowed: false)
                        return
                    }
                }

                let allowed = ConsentInformation.shared.canRequestAds
                if allowed && !self.mobileAdsStarted {
                    _ = await MobileAds.shared.start()
                    self.mobileAdsStarted = true
                }
                self.finish(allowed: allowed)
            }
        }
    }

    var isPrivacyOptionsRequired: Bool {
        ConsentInformation.shared.privacyOptionsRequirementStatus == .required
    }

    func presentPrivacyOptions(from viewController: UIViewController?) async throws {
        try await ConsentForm.presentPrivacyOptionsForm(from: viewController)
    }

    private func finish(allowed: Bool) {
        preparing = false
        let callbacks = completions
        completions.removeAll()
        callbacks.forEach { $0(allowed) }
    }
}
