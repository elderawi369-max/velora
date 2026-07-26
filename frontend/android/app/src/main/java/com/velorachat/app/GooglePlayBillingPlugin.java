package com.velorachat.app;

import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.ConsumeParams;
import com.android.billingclient.api.ConsumeResponseListener;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@CapacitorPlugin(name = "GooglePlayBilling")
public class GooglePlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {
    private static final String LOG_TAG = "VeloraBilling";

    private BillingClient billingClient;
    private boolean isConnecting = false;
    private final Map<String, ProductDetails> productDetailsCache = new HashMap<>();
    private final List<PendingClientAction> pendingClientActions = new ArrayList<>();

    private static class PendingClientAction {
        final PluginCall call;
        final Runnable action;

        PendingClientAction(PluginCall call, Runnable action) {
            this.call = call;
            this.action = action;
        }
    }

    @Override
    public void load() {
        ensureBillingClient();
    }

    @Override
    protected void handleOnDestroy() {
        if (billingClient != null) {
            billingClient.endConnection();
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        withReadyBillingClient(call, () -> {
            JSObject result = new JSObject();
            result.put("available", true);
            call.resolve(result);
        });
    }

    @PluginMethod
    public void purchaseProduct(PluginCall call) {
        String productId = call.getString("productId", "").trim();
        String obfuscatedAccountId = call.getString("obfuscatedAccountId");
        if (productId.isEmpty()) {
            call.reject("productId is required.");
            return;
        }

        withReadyBillingClient(call, () -> querySingleProductAndLaunch(call, productId, obfuscatedAccountId));
    }

    @PluginMethod
    public void consumePurchase(PluginCall call) {
        String purchaseToken = call.getString("purchaseToken", "").trim();
        if (purchaseToken.isEmpty()) {
            call.reject("purchaseToken is required.");
            return;
        }

        withReadyBillingClient(call, () ->
            billingClient.consumeAsync(
                ConsumeParams.newBuilder().setPurchaseToken(purchaseToken).build(),
                new ConsumeResponseListener() {
                    @Override
                    public void onConsumeResponse(@NonNull BillingResult billingResult, @NonNull String token) {
                        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                            call.reject(resolveBillingMessage(billingResult, "Unable to consume Google Play purchase."));
                            return;
                        }

                        JSObject result = new JSObject();
                        result.put("ok", true);
                        result.put("purchaseToken", token);
                        call.resolve(result);
                    }
                }
            )
        );
    }

    @PluginMethod
    public void queryActivePurchases(PluginCall call) {
        withReadyBillingClient(call, () ->
            billingClient.queryPurchasesAsync(
                QueryPurchasesParams.newBuilder()
                    .setProductType(BillingClient.ProductType.INAPP)
                    .build(),
                (billingResult, purchaseList) -> {
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        call.reject(resolveBillingMessage(billingResult, "Unable to query Google Play purchases."));
                        return;
                    }

                    JSObject result = new JSObject();
                    JSArray items = new JSArray();
                    if (purchaseList != null) {
                        for (Purchase purchase : purchaseList) {
                            items.put(serializePurchase(purchase));
                        }
                    }
                    result.put("purchases", items);
                    call.resolve(result);
                }
            )
        );
    }

    private void ensureBillingClient() {
        if (billingClient != null) {
            return;
        }

        billingClient =
            BillingClient.newBuilder(getContext())
                .enablePendingPurchases(
                    PendingPurchasesParams.newBuilder().enableOneTimeProducts().build()
                )
                .setListener(this)
                .build();
    }

    private void withReadyBillingClient(PluginCall call, Runnable action) {
        ensureBillingClient();

        if (billingClient.isReady()) {
            action.run();
            return;
        }

        pendingClientActions.add(new PendingClientAction(call, action));

        if (isConnecting) {
            return;
        }

        isConnecting = true;
        billingClient.startConnection(
            new BillingClientStateListener() {
                @Override
                public void onBillingSetupFinished(@NonNull BillingResult billingResult) {
                    isConnecting = false;
                    if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                        rejectPendingClientActions(resolveBillingMessage(billingResult, "Google Play Billing is unavailable."));
                        return;
                    }

                    flushPendingClientActions();
                }

                @Override
                public void onBillingServiceDisconnected() {
                    isConnecting = false;
                }
            }
        );
    }

    private void flushPendingClientActions() {
        List<PendingClientAction> actions = new ArrayList<>(pendingClientActions);
        pendingClientActions.clear();
        for (PendingClientAction action : actions) {
            action.action.run();
        }
    }

    private void rejectPendingClientActions(String message) {
        List<PendingClientAction> actions = new ArrayList<>(pendingClientActions);
        pendingClientActions.clear();
        for (PendingClientAction action : actions) {
            action.call.reject(message);
        }
    }

    private void querySingleProductAndLaunch(
        PluginCall call,
        String productId,
        @Nullable String obfuscatedAccountId
    ) {
        ProductDetails cachedProduct = productDetailsCache.get(productId);
        if (cachedProduct != null) {
            launchPurchaseFlow(call, cachedProduct, obfuscatedAccountId);
            return;
        }

        QueryProductDetailsParams.Product product =
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(productId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build();

        billingClient.queryProductDetailsAsync(
            QueryProductDetailsParams.newBuilder().setProductList(Collections.singletonList(product)).build(),
            (billingResult, productDetailsResult) -> {
                List<ProductDetails> productDetailsList = productDetailsResult.getProductDetailsList();
                if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                    call.reject(resolveBillingMessage(billingResult, "Unable to load Google Play product."));
                    return;
                }

                if (productDetailsList == null || productDetailsList.isEmpty()) {
                    call.reject("Google Play product is not available yet.");
                    return;
                }

                ProductDetails productDetails = productDetailsList.get(0);
                productDetailsCache.put(productId, productDetails);
                launchPurchaseFlow(call, productDetails, obfuscatedAccountId);
            }
        );
    }

    private void launchPurchaseFlow(
        PluginCall call,
        ProductDetails productDetails,
        @Nullable String obfuscatedAccountId
    ) {
        saveCall(call);

        BillingFlowParams.ProductDetailsParams productParams =
            BillingFlowParams.ProductDetailsParams.newBuilder()
                .setProductDetails(productDetails)
                .build();

        BillingFlowParams.Builder paramsBuilder =
            BillingFlowParams.newBuilder()
                .setProductDetailsParamsList(Collections.singletonList(productParams));

        if (obfuscatedAccountId != null && !obfuscatedAccountId.trim().isEmpty()) {
            paramsBuilder.setObfuscatedAccountId(obfuscatedAccountId.trim());
        }

        getActivity().runOnUiThread(() -> {
            BillingResult billingResult = billingClient.launchBillingFlow(getActivity(), paramsBuilder.build());
            if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                releaseCall(call);
                call.reject(resolveBillingMessage(billingResult, "Unable to open Google Play checkout."));
            }
        });
    }

    @Override
    public void onPurchasesUpdated(
        @NonNull BillingResult billingResult,
        @Nullable List<Purchase> purchases
    ) {
        PluginCall call = getSavedCall();
        if (call == null) {
            return;
        }

        if (billingResult.getResponseCode() == BillingClient.BillingResponseCode.USER_CANCELED) {
            JSObject result = new JSObject();
            result.put("cancelled", true);
            call.resolve(result);
            releaseCall(call);
            return;
        }

        if (billingResult.getResponseCode() != BillingClient.BillingResponseCode.OK) {
            call.reject(resolveBillingMessage(billingResult, "Google Play purchase failed."));
            releaseCall(call);
            return;
        }

        if (purchases == null || purchases.isEmpty()) {
            call.reject("Google Play did not return a completed purchase.");
            releaseCall(call);
            return;
        }

        Purchase purchase = purchases.get(0);
        call.resolve(serializePurchase(purchase));
        releaseCall(call);
    }

    private JSObject serializePurchase(Purchase purchase) {
        JSObject result = new JSObject();
        result.put("cancelled", false);
        result.put("purchaseToken", purchase.getPurchaseToken());
        result.put("orderId", purchase.getOrderId());
        result.put("packageName", purchase.getPackageName());
        result.put("acknowledged", purchase.isAcknowledged());
        result.put("purchaseState", purchaseStateToString(purchase.getPurchaseState()));

        JSArray productIds = new JSArray();
        List<String> products = purchase.getProducts();
        for (String productId : products) {
            productIds.put(productId);
        }
        result.put("productIds", productIds);
        result.put("productId", products.isEmpty() ? null : products.get(0));
        return result;
    }

    private String purchaseStateToString(int purchaseState) {
        if (purchaseState == Purchase.PurchaseState.PURCHASED) {
            return "purchased";
        }
        if (purchaseState == Purchase.PurchaseState.PENDING) {
            return "pending";
        }
        return "unspecified";
    }

    private void releaseCall(PluginCall call) {
        bridge.releaseCall(call);
    }

    private String resolveBillingMessage(BillingResult billingResult, String fallback) {
        String message = billingResult.getDebugMessage();
        if (message == null || message.trim().isEmpty()) {
            return fallback;
        }

        return message;
    }
}
