import { Capacitor, registerPlugin } from "@capacitor/core";
import { verifyGoogleMobilePurchase } from "./api";

type BillingAvailability = {
  available: boolean;
};

type PurchaseProductOptions = {
  productId: string;
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

type GooglePlayBillingPlugin = {
  isAvailable(): Promise<BillingAvailability>;
  purchaseProduct(options: PurchaseProductOptions): Promise<PurchaseProductResult>;
  consumePurchase(options: { purchaseToken: string }): Promise<ConsumePurchaseResult>;
};

const GooglePlayBilling = registerPlugin<GooglePlayBillingPlugin>("GooglePlayBilling");

const googlePlayProductIds = {
  rose: "rose_aura",
  starlight: "starlight_ring",
  crown: "velora_crown",
  spark: "spark_boost",
  spotlight: "spotlight_boost",
  challenge_pack_3: "challenge-credits-3",
  challenge_pack_10: "challenge-credits-10",
} as const;

function resolveGooglePlayProductId(itemKey: string) {
  return googlePlayProductIds[itemKey as keyof typeof googlePlayProductIds] ?? "";
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

  const purchase = await GooglePlayBilling.purchaseProduct({
    productId,
  });

  if (purchase.cancelled) {
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

  try {
    await GooglePlayBilling.consumePurchase({ purchaseToken: purchase.purchaseToken });
  } catch (error) {
    console.warn("Unable to consume Google Play purchase token after fulfillment.", error);
  }

  return {
    cancelled: false as const,
    purchase: verification.purchase,
  };
}
