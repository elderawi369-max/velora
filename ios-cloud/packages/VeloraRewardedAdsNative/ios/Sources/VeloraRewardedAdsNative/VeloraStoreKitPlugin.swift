import Capacitor
import Foundation
import StoreKit

@objc(VeloraStoreKitPlugin)
public final class VeloraStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VeloraStoreKitPlugin"
    public let jsName = "VeloraStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "queryProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchaseProduct", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unfinishedTransactions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]
    private let productIDs: Set<String> = [
        "com.velorachat.app.gift.rose_aura", "com.velorachat.app.gift.starlight_ring",
        "com.velorachat.app.gift.velora_crown", "com.velorachat.app.boost.spark",
        "com.velorachat.app.boost.spotlight", "com.velorachat.app.credits.3",
        "com.velorachat.app.credits.10"
    ]
    private var products: [String: Product] = [:]
    private var transactions: [String: StoreKit.Transaction] = [:]
    private var updateTask: Task<Void, Never>?
    private var purchasing = false

    override public func load() {
        updateTask = Task { [weak self] in
            for await result in StoreKit.Transaction.updates {
                guard !Task.isCancelled else { break }
                guard case .verified(let transaction) = result else { continue }
                await MainActor.run { [weak self] in
                    guard let self, self.productIDs.contains(transaction.productID), transaction.appAccountToken != nil else { return }
                    let value = self.remember(transaction)
                    self.notifyListeners("transactionUpdated", data: value)
                }
            }
        }
    }
    deinit { updateTask?.cancel() }

    @objc public func queryProducts(_ call: CAPPluginCall) {
        Task { @MainActor in
            do {
                let requested = Set(call.getArray("productIds", String.self) ?? [])
                guard !requested.isEmpty, requested.isSubset(of: productIDs) else {
                    call.reject("Unknown Apple purchase product."); return
                }
                let found = try await Product.products(for: requested)
                for product in found where product.type == .consumable { products[product.id] = product }
                call.resolve(["products": found.filter { $0.type == .consumable }.map {
                    ["productId": $0.id, "displayName": $0.displayName, "description": $0.description, "displayPrice": $0.displayPrice]
                }, "canMakePayments": AppStore.canMakePayments])
            } catch { call.reject("The App Store could not load prices. Please try again.") }
        }
    }

    @objc public func purchaseProduct(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard !purchasing else { call.reject("Another purchase is already in progress."); return }
            guard AppStore.canMakePayments else { call.reject("Purchases are disabled on this device."); return }
            guard let id = call.getString("productId"), productIDs.contains(id),
                  let rawToken = call.getString("appAccountToken"), let token = UUID(uuidString: rawToken) else {
                call.reject("The purchase request is incomplete."); return
            }
            purchasing = true
            defer { purchasing = false }
            do {
                let product: Product
                if let cached = products[id] { product = cached }
                else if let loaded = try await Product.products(for: [id]).first { product = loaded; products[id] = loaded }
                else { call.reject("This product is not available in the App Store yet."); return }
                guard product.type == .consumable else { call.reject("This purchase product has an unsupported type."); return }
                switch try await product.purchase(options: [.appAccountToken(token)]) {
                case .success(let verification):
                    guard case .verified(let transaction) = verification,
                          transaction.productID == id, transaction.appAccountToken == token,
                          transaction.revocationDate == nil else {
                        call.reject("The purchase could not be verified. No reward was granted."); return
                    }
                    // Keep the transaction unfinished until the API confirms durable delivery.
                    call.resolve(["status": "purchased", "transaction": remember(transaction)])
                case .pending:
                    call.resolve(["status": "pending"])
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                @unknown default:
                    call.reject("The purchase is not complete yet.")
                }
            } catch { call.reject("The App Store purchase could not complete. Please try again.") }
        }
    }

    @objc public func unfinishedTransactions(_ call: CAPPluginCall) {
        Task { @MainActor in
            var pending: [[String: Any]] = []
            for await result in StoreKit.Transaction.unfinished {
                guard case .verified(let transaction) = result,
                      productIDs.contains(transaction.productID), transaction.appAccountToken != nil,
                      transaction.revocationDate == nil else { continue }
                pending.append(remember(transaction))
            }
            call.resolve(["transactions": pending])
        }
    }

    @objc public func finishTransaction(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let id = call.getString("transactionId") else { call.reject("Missing transaction identifier."); return }
            if let transaction = transactions[id] {
                await transaction.finish()
                transactions.removeValue(forKey: id)
                call.resolve(["finished": true]); return
            }
            for await result in StoreKit.Transaction.unfinished {
                if case .verified(let transaction) = result, String(transaction.id) == id,
                   productIDs.contains(transaction.productID), transaction.appAccountToken != nil {
                    await transaction.finish()
                    call.resolve(["finished": true]); return
                }
            }
            // An already-finished transaction makes retries harmless.
            call.resolve(["finished": true])
        }
    }

    @MainActor private func remember(_ transaction: StoreKit.Transaction) -> [String: Any] {
        let id = String(transaction.id)
        transactions[id] = transaction
        return ["transactionId": id, "productId": transaction.productID,
                "appAccountToken": transaction.appAccountToken?.uuidString.lowercased() ?? ""]
    }
}
