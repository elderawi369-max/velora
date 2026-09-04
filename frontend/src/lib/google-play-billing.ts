import { Capacitor, registerPlugin } from "@capacitor/core";
import { verifyGoogleAiCompanionSubscription, verifyGoogleMobilePurchase } from "./api";

type BillingAvailability = {
  available: boolean;
};

type PurchaseProductOptions = {
  productId: string;
  productType?: "inapp" | "subs";
  offerToken?: string;
  obfuscatedAccountId?: string;
};

type PurchaseProductResult = {
  cancelled: boolean;
  purchaseToken?: string;
  orderId?: string | null;
  packageName?: string;
  productId?: string | null;
  productIds?: string[];
  purchaseState?: string;
  acknowledged?: boolean;
};

type ConsumePurchaseResult = {
  ok: boolean;
  purchaseToken: string;
};

type QueryActivePurchasesResult = {
  purchases: PurchaseProductResult[];
};

export type GooglePlayProduct = {
  productId: string;
  title?: string;
  description?: string;
  formattedPrice?: string;
  priceAmountMicros?: number;
  currencyCode?: string;
  offerToken?: string;
};

type GooglePlayBillingPlugin = {
  isAvailable(): Promise<BillingAvailability>;
  purchaseProduct(options: PurchaseProductOptions): Promise<PurchaseProductResult>;
  consumePurchase(options: { purchaseToken: string }): Promise<ConsumePurchaseResult>;
  acknowledgePurchase(options: { purchaseToken: string }): Promise<ConsumePurchaseResult>;
  queryProducts(options: { productIds: string[]; productType: "inapp" | "subs" }): Promise<{ products: GooglePlayProduct[] }>;
  queryActivePurchases(options?: { productType?: "inapp" | "subs" }): Promise<QueryActivePurchasesResult>;
};

const GooglePlayBilling = registerPlugin<GooglePlayBillingPlugin>("GooglePlayBilling");

const googlePlayProductIds = {
  rose: "rose_aura",
  starlight: "starlight_ring",
  crown: "velora_crown",
  spark: "spark_boost",
  spotlight: "spotlight_boost",
  challenge_pack_3: "challenge_credits_3",
  challenge_pack_10: "challenge_credits_10",
} as const;

const googlePlaySubscriptionProductIds = {
  pro: "velora_ai_pro_monthly",
  ultra: "velora_ai_ultra_monthly",
} as const;

type GooglePlayPurchaseContext = {
  productKind: "gift" | "boost" | "challenge_credit_pack";
  itemKey: string;
  targetProfileId?: string;
  createdAt: number;
};

const purchaseContextStorageKeyPrefix = "velora-google-play-purchase-context";

function resolveGooglePlayProductId(itemKey: string) {
  return googlePlayProductIds[itemKey as keyof typeof googlePlayProductIds] ?? "";
}

function resolveCatalogItemByGoogleProductId(productId: string) {
  const entry = Object.entries(googlePlayProductIds).find(([, value]) => value === productId);
  if (!entry) {
    return null;
  }

  const [itemKey] = entry;
  if (itemKey === "rose" || itemKey === "starlight" || itemKey === "crown") {
    return {
      productKind: "gift" as const,
      itemKey,
    };
  }

  if (itemKey === "spark" || itemKey === "spotlight") {
    return {
      productKind: "boost" as const,
      itemKey,
    };
  }

  return {
    productKind: "challenge_credit_pack" as const,
    itemKey,
  };
}

function getPurchaseContextStorageKey(itemKey: string) {
  return `${purchaseContextStorageKeyPrefix}:${itemKey}`;
}

function saveGooglePlayPurchaseContext(context: GooglePlayPurchaseContext) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    getPurchaseContextStorageKey(context.itemKey),
    JSON.stringify(context),
  );
}

function readGooglePlayPurchaseContext(itemKey: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(getPurchaseContextStorageKey(itemKey));
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as GooglePlayPurchaseContext;
    if (!parsed?.itemKey || !parsed?.productKind) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function clearGooglePlayPurchaseContext(itemKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(getPurchaseContextStorageKey(itemKey));
}

async function delay(ms: number) {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isNativeAndroidApp() {
  return (
    Capacitor.getPlatform() === "android" &&
    (Capacitor.isNativePlatform() || Capacitor.isPluginAvailable("GooglePlayBilling"))
  );
}

export async function ensureGooglePlayBillingAvailable() {
  if (!isNativeAndroidApp()) {
    return false;
  }

  const result = await GooglePlayBilling.isAvailable();
  return Boolean(result.available);
}

export async function shouldUseGooglePlayBilling() {
  if (!isNativeAndroidApp()) {
    return false;
  }

  if (!Capacitor.isPluginAvailable("GooglePlayBilling")) {
    throw new Error("This Android build does not have Google Play Billing enabled yet.");
  }

  const available = await ensureGooglePlayBillingAvailable();
  if (!available) {
    throw new Error("Google Play Billing is unavailable on this Android device right now.");
  }

  return true;
}

export async function completeGooglePlayPurchase(input: {
  productKind: "gift" | "boost" | "challenge_credit_pack";
  itemKey: string;
  targetProfileId?: string;
}) {
  const productId = resolveGooglePlayProductId(input.itemKey);
  if (!productId) {
    throw new Error("This Android purchase item is not mapped to a Google Play product yet.");
  }

  saveGooglePlayPurchaseContext({
    productKind: input.productKind,
    itemKey: input.itemKey,
    targetProfileId: input.targetProfileId,
    createdAt: Date.now(),
  });

  const purchase = await GooglePlayBilling.purchaseProduct({
    productId,
  });

  if (purchase.cancelled) {
    clearGooglePlayPurchaseContext(input.itemKey);
    return { cancelled: true as const };
  }

  if (!purchase.purchaseToken || !purchase.packageName || !purchase.productId) {
    throw new Error("Google Play did not return a complete purchase token.");
  }

  const verification = await verifyGoogleMobilePurchase({
    provider: "google",
    productKind: input.productKind,
    itemKey: input.itemKey,
    targetProfileId: input.targetProfileId,
    purchaseToken: purchase.purchaseToken,
    packageName: purchase.packageName,
    productId: purchase.productId,
    orderId: purchase.orderId ?? undefined,
  });

  if (verification.googlePlay?.consumeStatus !== "consumed") {
    try {
      await GooglePlayBilling.consumePurchase({ purchaseToken: purchase.purchaseToken });
    } catch (error) {
      console.warn("Unable to consume Google Play purchase token after backend verification.", error);
    }
  }

  clearGooglePlayPurchaseContext(input.itemKey);

  return {
    cancelled: false as const,
    purchase: verification.purchase,
  };
}

export async function fetchGooglePlaySubscriptionProducts() {
  if (!(await shouldUseGooglePlayBilling())) return [];
  const result = await GooglePlayBilling.queryProducts({ productIds: Object.values(googlePlaySubscriptionProductIds), productType: "subs" });
  return result.products ?? [];
}

export async function completeGooglePlaySubscription(plan: "pro" | "ultra", product?: GooglePlayProduct) {
  const productId = googlePlaySubscriptionProductIds[plan];
  const purchase = await GooglePlayBilling.purchaseProduct({ productId, productType: "subs", offerToken: product?.offerToken });
  if (purchase.cancelled) return { cancelled: true as const };
  if (!purchase.purchaseToken || !purchase.packageName || !purchase.productId) throw new Error("Google Play did not return a complete subscription token.");
  const result = await verifyGoogleAiCompanionSubscription({ plan, purchaseToken: purchase.purchaseToken, packageName: purchase.packageName, productId: purchase.productId, orderId: purchase.orderId ?? undefined });
  if (!purchase.acknowledged) {
    try { await GooglePlayBilling.acknowledgePurchase({ purchaseToken: purchase.purchaseToken }); }
    catch (error) { console.warn("Unable to acknowledge Google Play subscription after verification.", error); }
  }
  return { cancelled: false as const, entitlement: result.entitlement };
}

export async function recoverGooglePlayPurchases() {
  if (!isNativeAndroidApp() || !Capacitor.isPluginAvailable("GooglePlayBilling")) {
    return { recoveredCount: 0 };
  }

  const available = await ensureGooglePlayBillingAvailable();
  if (!available) {
    return { recoveredCount: 0 };
  }

  const result = await GooglePlayBilling.queryActivePurchases({ productType: "inapp" });
  const purchases = result.purchases ?? [];
  let recoveredCount = 0;

  for (const purchase of purchases) {
    if (
      purchase.cancelled ||
      purchase.purchaseState !== "purchased" ||
      !purchase.purchaseToken ||
      !purchase.packageName ||
      !purchase.productId
    ) {
      continue;
    }

    const catalogItem = resolveCatalogItemByGoogleProductId(purchase.productId);
    if (!catalogItem) {
      continue;
    }

    const context = readGooglePlayPurchaseContext(catalogItem.itemKey);
    const maxAttempts = 3;
    let verified = false;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        const response = await verifyGoogleMobilePurchase({
          provider: "google",
          productKind: catalogItem.productKind,
          itemKey: catalogItem.itemKey,
          targetProfileId: context?.targetProfileId,
          purchaseToken: purchase.purchaseToken,
          packageName: purchase.packageName,
          productId: purchase.productId,
          orderId: purchase.orderId ?? undefined,
        });

        if (response.googlePlay?.consumeStatus !== "consumed") {
          try {
            await GooglePlayBilling.consumePurchase({ purchaseToken: purchase.purchaseToken });
          } catch (error) {
            console.warn("Client fallback consume failed during Google Play recovery.", error);
          }
        }

        clearGooglePlayPurchaseContext(catalogItem.itemKey);
        recoveredCount += 1;
        verified = true;
        break;
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          console.warn("Unable to recover Google Play purchase.", error);
          break;
        }

        await delay(1000 * 2 ** attempt);
      }
    }

    if (verified) {
      continue;
    }
  }

  const subscriptions = await GooglePlayBilling.queryActivePurchases({ productType: "subs" });
  for (const purchase of subscriptions.purchases ?? []) {
    if (purchase.cancelled || purchase.purchaseState !== "purchased" || !purchase.purchaseToken || !purchase.packageName || !purchase.productId) continue;
    const plan = Object.entries(googlePlaySubscriptionProductIds).find(([, productId]) => productId === purchase.productId)?.[0] as "pro" | "ultra" | undefined;
    if (!plan) continue;
    try {
      await verifyGoogleAiCompanionSubscription({ plan, purchaseToken: purchase.purchaseToken, packageName: purchase.packageName, productId: purchase.productId, orderId: purchase.orderId ?? undefined });
      if (!purchase.acknowledged) await GooglePlayBilling.acknowledgePurchase({ purchaseToken: purchase.purchaseToken });
      recoveredCount += 1;
    } catch (error) { console.warn("Unable to recover Google Play subscription.", error); }
  }

  return { recoveredCount };
}
