import Capacitor
import Foundation
import GoogleMobileAds
import UIKit

private final class RewardedSlot {
    var ad: RewardedAd?
    var cachedAt: Date?
    var loading = false
    var pendingShowCall: CAPPluginCall?
}

@objc(VeloraRewardedAdsPlugin)
public final class VeloraRewardedAdsPlugin: CAPPlugin, CAPBridgedPlugin, FullScreenContentDelegate {
    public let identifier = "VeloraRewardedAdsPlugin"
    public let jsName = "VeloraRewardedAds"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "prepareConsent", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "preloadRewardedAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showRewardedAd", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPrivacyOptionsRequirement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "presentPrivacyOptions", returnType: CAPPluginReturnPromise)
    ]

    private let testRewardedID = "ca-app-pub-3940256099942544/1712485313"
    private let triviaRewardedID = "ca-app-pub-8082896452517848/5984730430"
    private let browseRewardedID = "ca-app-pub-8082896452517848/8419322089"
    private let mindHuntersRewardedID = "ca-app-pub-8082896452517848/6510595610"
    private let maxCacheAge: TimeInterval = 55 * 60

    private var slots: [String: RewardedSlot] = [:]
    private var activePlacement: String?
    private var activeCall: CAPPluginCall?
    private var activeAd: RewardedAd?
    private var activeRewarded = false

    @objc public func prepareConsent(_ call: CAPPluginCall) {
        Task { @MainActor in
            VeloraAdsConsentManager.shared.prepare(from: self.bridge?.viewController) { allowed in
                call.resolve([
                    "canRequestAds": allowed,
                    "privacyOptionsRequired": VeloraAdsConsentManager.shared.isPrivacyOptionsRequired
                ])
            }
        }
    }

    @objc public func preloadRewardedAd(_ call: CAPPluginCall) {
        Task { @MainActor in
            let placement = self.placement(from: call)
            let slot = self.slot(for: placement)
            if self.hasFreshAd(slot) {
                call.resolve(["ready": true])
            } else if slot.loading {
                call.resolve(["ready": false])
            } else {
                slot.ad = nil
                self.load(slot: slot, placement: placement, adUnitID: self.adUnitID(from: call, placement: placement), preloadCall: call)
            }
        }
    }

    @objc public func showRewardedAd(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard self.activeCall == nil else {
                call.reject("Another rewarded ad is already being shown.")
                return
            }
            let placement = self.placement(from: call)
            let slot = self.slot(for: placement)
            let adUnitID = self.adUnitID(from: call, placement: placement)
            if self.hasFreshAd(slot) {
                self.show(slot: slot, placement: placement, call: call, adUnitID: adUnitID)
            } else if slot.pendingShowCall != nil {
                call.reject("A rewarded ad request is already in progress.")
            } else {
                slot.ad = nil
                slot.pendingShowCall = call
                if !slot.loading {
                    self.load(slot: slot, placement: placement, adUnitID: adUnitID, preloadCall: nil)
                }
            }
        }
    }

    @objc public func getPrivacyOptionsRequirement(_ call: CAPPluginCall) {
        Task { @MainActor in
            call.resolve(["required": VeloraAdsConsentManager.shared.isPrivacyOptionsRequired])
        }
    }

    @objc public func presentPrivacyOptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                try await VeloraAdsConsentManager.shared.presentPrivacyOptions(from: self.bridge?.viewController)
                call.resolve()
            } catch {
                call.reject("Privacy choices could not be opened: \(error.localizedDescription)", nil, error)
            }
        }
    }

    @MainActor
    private func load(slot: RewardedSlot, placement: String, adUnitID: String, preloadCall: CAPPluginCall?) {
        slot.loading = true
        VeloraAdsConsentManager.shared.prepare(from: bridge?.viewController) { [weak self, weak slot] allowed in
            guard let self, let slot else { return }
            guard allowed else {
                slot.loading = false
                preloadCall?.resolve(["ready": false])
                self.rejectPendingShow(slot, message: "Rewarded ads cannot be requested until privacy consent is available.")
                return
            }

            Task { @MainActor in
                do {
                    let ad = try await RewardedAd.load(with: adUnitID, request: Request())
                    slot.loading = false
                    slot.ad = ad
                    slot.cachedAt = Date()
                    ad.fullScreenContentDelegate = self
                    preloadCall?.resolve(["ready": true])
                    if let pendingCall = slot.pendingShowCall {
                        slot.pendingShowCall = nil
                        self.show(slot: slot, placement: placement, call: pendingCall, adUnitID: adUnitID)
                    }
                } catch {
                    slot.loading = false
                    slot.ad = nil
                    preloadCall?.resolve(["ready": false])
                    self.rejectPendingShow(slot, message: "Rewarded ad is unavailable right now: \(error.localizedDescription)")
                }
            }
        }
    }

    @MainActor
    private func show(slot: RewardedSlot, placement: String, call: CAPPluginCall, adUnitID: String) {
        guard let ad = slot.ad, let viewController = bridge?.viewController else {
            slot.pendingShowCall = call
            load(slot: slot, placement: placement, adUnitID: adUnitID, preloadCall: nil)
            return
        }
        slot.ad = nil
        if let customData = call.getString("customData")?.trimmingCharacters(in: .whitespacesAndNewlines), !customData.isEmpty {
            let options = ServerSideVerificationOptions()
            options.customRewardText = customData
            ad.serverSideVerificationOptions = options
        }
        activePlacement = placement
        activeCall = call
        // Retain the presented ad until dismissal after removing it from cache.
        activeAd = ad
        activeRewarded = false
        ad.present(from: viewController) { [weak self] in
            self?.activeRewarded = true
        }
    }

    public func adDidDismissFullScreenContent(_ ad: FullScreenPresentingAd) {
        Task { @MainActor in
            let call = self.activeCall
            let placement = self.activePlacement
            let rewarded = self.activeRewarded
            self.clearActive()
            call?.resolve(["rewarded": rewarded])
            if let placement {
                let slot = self.slot(for: placement)
                self.load(slot: slot, placement: placement, adUnitID: self.fallbackAdUnitID(for: placement), preloadCall: nil)
            }
        }
    }

    public func ad(_ ad: FullScreenPresentingAd, didFailToPresentFullScreenContentWithError error: Error) {
        Task { @MainActor in
            let call = self.activeCall
            let placement = self.activePlacement
            self.clearActive()
            call?.reject("The rewarded ad could not be shown: \(error.localizedDescription)", nil, error)
            if let placement {
                let slot = self.slot(for: placement)
                self.load(slot: slot, placement: placement, adUnitID: self.fallbackAdUnitID(for: placement), preloadCall: nil)
            }
        }
    }

    @MainActor
    private func clearActive() {
        activePlacement = nil
        activeCall = nil
        activeAd = nil
        activeRewarded = false
    }

    private func placement(from call: CAPPluginCall) -> String {
        let value = call.getString("placement")?.trimmingCharacters(in: .whitespacesAndNewlines)
        return value?.isEmpty == false ? value! : "trivia"
    }

    @MainActor
    private func slot(for placement: String) -> RewardedSlot {
        if let existing = slots[placement] { return existing }
        let created = RewardedSlot()
        slots[placement] = created
        return created
    }

    private func hasFreshAd(_ slot: RewardedSlot) -> Bool {
        guard slot.ad != nil, let cachedAt = slot.cachedAt else { return false }
        return Date().timeIntervalSince(cachedAt) < maxCacheAge
    }

    private func adUnitID(from call: CAPPluginCall, placement: String) -> String {
        #if DEBUG
        return testRewardedID
        #else
        let configured = call.getString("adUnitId")?.trimmingCharacters(in: .whitespacesAndNewlines)
        return configured?.isEmpty == false ? configured! : fallbackAdUnitID(for: placement)
        #endif
    }

    private func fallbackAdUnitID(for placement: String) -> String {
        #if DEBUG
        return testRewardedID
        #else
        if placement == "browse" { return browseRewardedID }
        if placement == "mind-hunters" { return mindHuntersRewardedID }
        return triviaRewardedID
        #endif
    }

    private func rejectPendingShow(_ slot: RewardedSlot, message: String) {
        guard let call = slot.pendingShowCall else { return }
        slot.pendingShowCall = nil
        call.reject(message)
    }
}
