import { Hono } from "hono";
import { eq } from "drizzle-orm";
import {
  boostCatalog,
  challengeCreditCatalog,
  fulfillPurchase,
  giftCatalog,
} from "../lib/commerce";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";
import {
  checkoutSessionSchema,
  mobilePurchaseVerificationSchema,
} from "../lib/validation";
import { paymentWebhookEvents, profiles, purchases } from "../db/schema";
import { logEvent } from "../lib/analytics";

export const paymentRoutes = new Hono<{ Bindings: EnvBindings }>();

type CheckoutProvider = "paypal" | "stripe";
type MobileProvider = "apple" | "google";
type GoogleServiceAccountCredentials = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type GooglePurchaseVerification = {
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  orderId?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

type GoogleConsumeResult = {
  status: "not_applicable" | "already_consumed" | "consumed" | "failed";
  purchaseState?: number;
  consumptionState?: number;
  acknowledgementState?: number;
  error?: string;
};

class PaymentRouteError extends Error {
  status: number;

  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

function resolveFrontendOrigin(origin: string | undefined) {
  if (!origin) {
    return "";
  }

  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if (localhostPattern.test(origin)) {
    return origin;
  }

  const allowedOrigins = [
    "https://app.velorachat.com",
  ];

  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  return "";
}

function getConfiguredPaymentProvider(env: EnvBindings): CheckoutProvider | null {
  const configured = (env.PAYMENTS_PROVIDER ?? "").toLowerCase();

  if (configured === "paypal" && env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) {
    return "paypal";
  }

  if (configured === "stripe" && env.STRIPE_SECRET_KEY) {
    return "stripe";
  }

  if (env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) {
    return "paypal";
  }

  if (env.STRIPE_SECRET_KEY) {
    return "stripe";
  }

  return null;
}

function getPayPalBaseUrl(env: EnvBindings) {
  const mode = (env.PAYPAL_ENV ?? "").toLowerCase();
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

function toBase64UrlString(input: string) {
  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function toBase64UrlBytes(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodePemPrivateKey(privateKeyPem: string) {
  const normalized = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

export async function getGooglePlayAccessToken(env: EnvBindings) {
  if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    throw new PaymentRouteError("Google Play billing is not configured yet.", 501);
  }

  let credentials: GoogleServiceAccountCredentials;
  try {
    credentials = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) as GoogleServiceAccountCredentials;
  } catch {
    throw new PaymentRouteError("Google Play service account JSON is invalid.", 500);
  }

  if (!credentials.client_email || !credentials.private_key) {
    throw new PaymentRouteError("Google Play service account credentials are incomplete.", 500);
  }

  const tokenAudience = credentials.token_uri ?? "https://oauth2.googleapis.com/token";
  const nowSeconds = Math.floor(Date.now() / 1000);
  const unsignedToken = [
    toBase64UrlString(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    toBase64UrlString(
      JSON.stringify({
        iss: credentials.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: tokenAudience,
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      }),
    ),
  ].join(".");

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    decodePemPrivateKey(credentials.private_key),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  const assertion = `${unsignedToken}.${toBase64UrlBytes(signature)}`;
  const response = await fetch(tokenAudience, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new PaymentRouteError(
      data.error_description ?? data.error ?? "Unable to authenticate with Google Play Developer API.",
      500,
    );
  }

  return data.access_token;
}

async function getPayPalAccessToken(env: EnvBindings) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
    throw new Error("PayPal is not configured yet.");
  }

  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const response = await fetch(`${getPayPalBaseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const data = (await response.json()) as {
    access_token?: string;
    error_description?: string;
    error?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "Unable to authenticate with PayPal.");
  }

  return data.access_token;
}

async function createPayPalOrder(
  env: EnvBindings,
  input: {
    origin: string;
    productName: string;
    amountCents: number;
    metadata: Record<string, string>;
  },
): Promise<{ id: string; url: string }> {
  const accessToken = await getPayPalAccessToken(env);
  const amount = (input.amountCents / 100).toFixed(2);

  const response = await fetch(`${getPayPalBaseUrl(env)}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: input.metadata.productKind,
          custom_id: input.metadata.purchaseId,
          description: input.productName,
          amount: {
            currency_code: "USD",
            value: amount,
          },
        },
      ],
      payment_source: {
        paypal: {
          experience_context: {
            brand_name: "Velora",
            landing_page: "LOGIN",
            user_action: "PAY_NOW",
            return_url: `${input.origin}/payments/success`,
            cancel_url: `${input.origin}/payments/cancel`,
          },
        },
      },
    }),
  });

  const data = (await response.json()) as {
    id?: string;
    links?: Array<{ href?: string; rel?: string }>;
    message?: string;
    details?: Array<{ issue?: string; description?: string }>;
  };

  const approveLink = data.links?.find((link) => link.rel === "payer-action" || link.rel === "approve")?.href;

  if (!response.ok || !data.id || !approveLink) {
    throw new Error(
      data.details?.[0]?.description ??
      data.message ??
      "Unable to create PayPal checkout order.",
    );
  }

  return {
    id: data.id,
    url: approveLink,
  };
}

async function capturePayPalOrder(env: EnvBindings, orderId: string) {
  const accessToken = await getPayPalAccessToken(env);
  const response = await fetch(`${getPayPalBaseUrl(env)}/v2/checkout/orders/${orderId}/capture`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });

  const data = (await response.json()) as {
    id?: string;
    status?: string;
    purchase_units?: Array<{
      custom_id?: string;
      payments?: {
        captures?: Array<{ status?: string }>;
      };
    }>;
    details?: Array<{ description?: string }>;
    message?: string;
  };

  if (!response.ok || !data.id) {
    throw new Error(data.details?.[0]?.description ?? data.message ?? "Unable to capture PayPal order.");
  }

  const purchaseUnit = data.purchase_units?.[0];
  const captureStatus = purchaseUnit?.payments?.captures?.[0]?.status;

  return {
    id: data.id,
    status: data.status,
    purchaseId: purchaseUnit?.custom_id ?? null,
    captureStatus: captureStatus ?? null,
  };
}

async function createStripeCheckoutSession(
  env: EnvBindings,
  input: {
    origin: string;
    productName: string;
    amountCents: number;
    metadata: Record<string, string>;
  },
): Promise<{ id: string; url: string }> {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured yet.");
  }

  const formData = new URLSearchParams();
  formData.set("mode", "payment");
  formData.set("success_url", `${input.origin}/payments/success?session_id={CHECKOUT_SESSION_ID}`);
  formData.set("cancel_url", `${input.origin}/payments/cancel`);
  formData.set("line_items[0][quantity]", "1");
  formData.set("line_items[0][price_data][currency]", "usd");
  formData.set("line_items[0][price_data][unit_amount]", String(input.amountCents));
  formData.set("line_items[0][price_data][product_data][name]", input.productName);

  Object.entries(input.metadata).forEach(([key, value]) => {
    formData.set(`metadata[${key}]`, value);
  });

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  const data = (await response.json()) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!response.ok || !data.id || !data.url) {
    throw new Error(data.error?.message ?? "Unable to create Stripe checkout session.");
  }

  return {
    id: data.id,
    url: data.url,
  };
}

async function fetchStripeCheckoutSession(env: EnvBindings, sessionId: string) {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error("Stripe is not configured yet.");
  }

  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    },
  });

  const data = (await response.json()) as {
    id?: string;
    payment_status?: string;
    metadata?: Record<string, string>;
    error?: { message?: string };
  };

  if (!response.ok || !data.id) {
    throw new Error(data.error?.message ?? "Unable to verify Stripe checkout session.");
  }

  return data;
}

async function createHostedCheckoutSession(
  env: EnvBindings,
  input: {
    origin: string;
    productName: string;
    amountCents: number;
    metadata: Record<string, string>;
  },
) {
  const provider = getConfiguredPaymentProvider(env);
  if (provider === "paypal") {
    return createPayPalOrder(env, input);
  }

  if (provider === "stripe") {
    return createStripeCheckoutSession(env, input);
  }

  throw new Error("Payments are not configured yet.");
}

async function completeHostedCheckout(env: EnvBindings, externalId: string) {
  const provider = getConfiguredPaymentProvider(env);

  if (provider === "paypal") {
    const order = await capturePayPalOrder(env, externalId);
    if (order.captureStatus !== "COMPLETED") {
      throw new Error("Payment is not completed yet.");
    }

    if (!order.purchaseId) {
      throw new Error("Purchase metadata is missing.");
    }

    return {
      externalId: order.id,
      purchaseId: order.purchaseId,
    };
  }

  if (provider === "stripe") {
    const session = await fetchStripeCheckoutSession(env, externalId);
    if (session.payment_status !== "paid") {
      throw new Error("Payment is not completed yet.");
    }

    const purchaseId = session.metadata?.purchaseId;
    if (!purchaseId) {
      throw new Error("Purchase metadata is missing.");
    }

    return {
      externalId: session.id!,
      purchaseId,
    };
  }

  throw new Error("Payments are not configured yet.");
}

async function fulfillPurchaseByExternalId(env: EnvBindings, externalId: string) {
  const db = getDb(env);
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.stripeSessionId, externalId))
    .limit(1);

  if (!purchase) {
    throw new Error("Purchase not found.");
  }

  return fulfillPurchase(env, purchase.id);
}

function assertCatalogItem(input: {
  productKind: "gift" | "boost" | "challenge_credit_pack";
  itemKey: string;
}) {
  if (input.productKind === "gift") {
    const gift = giftCatalog.find((item) => item.key === input.itemKey);
    if (!gift) {
      throw new PaymentRouteError("Invalid gift type.", 400);
    }

    return gift;
  }

  if (input.productKind === "challenge_credit_pack") {
    const pack = challengeCreditCatalog.find((item) => item.key === input.itemKey);
    if (!pack) {
      throw new PaymentRouteError("Invalid challenge credit pack.", 400);
    }

    return pack;
  }

  const boost = boostCatalog.find((item) => item.key === input.itemKey);
  if (!boost) {
    throw new PaymentRouteError("Invalid boost type.", 400);
  }

  return boost;
}

async function assertValidGiftTarget(
  env: EnvBindings,
  ownProfileId: string,
  targetProfileId: string | undefined,
) {
  if (!targetProfileId) {
    throw new PaymentRouteError("Gift purchases need a target profile.", 400);
  }

  if (targetProfileId === ownProfileId) {
    throw new PaymentRouteError("You cannot send a gift to yourself.", 400);
  }

  const db = getDb(env);
  const [target] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, targetProfileId))
    .limit(1);

  if (!target) {
    throw new PaymentRouteError("Target profile not found.", 404);
  }
}

async function verifyApplePurchase(
  env: EnvBindings,
  _input: {
    receiptData: string;
    transactionId: string;
  },
) {
  if (!env.APPLE_BUNDLE_ID || !env.APPLE_SHARED_SECRET) {
    throw new PaymentRouteError("Apple mobile billing is not configured yet.", 501);
  }

  throw new PaymentRouteError(
    "Apple mobile purchase verification is not connected yet. Add StoreKit receipt verification next.",
    501,
  );
}

async function verifyGooglePurchase(
  env: EnvBindings,
  input: {
    packageName: string;
    productId: string;
    purchaseToken: string;
    orderId?: string;
  },
) {
  if (!env.GOOGLE_PLAY_PACKAGE_NAME || !env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    throw new PaymentRouteError("Google Play billing is not configured yet.", 501);
  }

  if (input.packageName !== env.GOOGLE_PLAY_PACKAGE_NAME) {
    throw new PaymentRouteError("Google Play purchase package does not match this app.", 400);
  }

  const accessToken = await getGooglePlayAccessToken(env);
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      input.packageName,
    )}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(
      input.purchaseToken,
    )}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const data = (await response.json()) as GooglePurchaseVerification;

  if (!response.ok) {
    throw new PaymentRouteError(
      data.error?.message ?? "Unable to verify Google Play purchase.",
      response.status === 401 || response.status === 403 ? 501 : 500,
    );
  }

  if (typeof data.purchaseState !== "number") {
    throw new PaymentRouteError("Google Play purchase response is incomplete.", 500);
  }

  if (data.purchaseState === 2) {
    throw new PaymentRouteError("Google Play purchase is still pending.", 400);
  }

  if (data.purchaseState !== 0) {
    throw new PaymentRouteError("Google Play purchase is not completed.", 400);
  }

  if (input.orderId && data.orderId && input.orderId !== data.orderId) {
    throw new PaymentRouteError("Google Play order verification did not match the expected order.", 400);
  }

  return data;
}

function isGooglePurchaseSettled(data: GooglePurchaseVerification) {
  return data.consumptionState === 1 || data.acknowledgementState === 1;
}

async function syncGooglePurchaseState(
  env: EnvBindings,
  purchaseId: string,
  input: {
    provider?: string | null;
    purchaseToken?: string | null;
    packageName?: string | null;
    productId?: string | null;
    orderId?: string | null;
    purchaseState?: number | null;
    consumptionState?: number | null;
    acknowledgementState?: number | null;
    verifiedAt?: number | null;
    consumeStatus?: string | null;
    consumeAttemptCount?: number;
    consumeLastAttemptAt?: number | null;
    consumeLastError?: string | null;
    consumedAt?: number | null;
  },
) {
  const db = getDb(env);
  await db
    .update(purchases)
    .set({
      mobileProvider: input.provider ?? undefined,
      mobilePurchaseToken: input.purchaseToken ?? undefined,
      mobilePackageName: input.packageName ?? undefined,
      mobileProductId: input.productId ?? undefined,
      mobileOrderId: input.orderId ?? undefined,
      mobilePurchaseState: input.purchaseState ?? undefined,
      mobileConsumptionState: input.consumptionState ?? undefined,
      mobileAcknowledgementState: input.acknowledgementState ?? undefined,
      mobileVerifiedAt: input.verifiedAt ?? undefined,
      mobileConsumeStatus: input.consumeStatus ?? undefined,
      mobileConsumeAttemptCount: input.consumeAttemptCount ?? undefined,
      mobileConsumeLastAttemptAt: input.consumeLastAttemptAt ?? undefined,
      mobileConsumeLastError: input.consumeLastError ?? undefined,
      mobileConsumedAt: input.consumedAt ?? undefined,
    })
    .where(eq(purchases.id, purchaseId));
}

async function consumeGooglePurchase(
  env: EnvBindings,
  input: {
    packageName: string;
    productId: string;
    purchaseToken: string;
  },
) {
  const accessToken = await getGooglePlayAccessToken(env);
  const response = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(
      input.packageName,
    )}/purchases/products/${encodeURIComponent(input.productId)}/tokens/${encodeURIComponent(
      input.purchaseToken,
    )}:consume`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );

  if (!response.ok) {
    let message = "Unable to consume Google Play purchase.";
    try {
      const data = (await response.json()) as GooglePurchaseVerification;
      message = data.error?.message ?? message;
    } catch {
      const text = await response.text();
      if (text.trim()) {
        message = text.trim();
      }
    }

    throw new PaymentRouteError(
      message,
      response.status === 401 || response.status === 403 ? 501 : 500,
    );
  }
}

async function consumeGooglePurchaseIfNeeded(
  env: EnvBindings,
  purchase: typeof purchases.$inferSelect,
  verifiedState?: GooglePurchaseVerification,
): Promise<GoogleConsumeResult> {
  if (
    purchase.mobileProvider !== "google" ||
    !purchase.mobilePackageName ||
    !purchase.mobileProductId ||
    !purchase.mobilePurchaseToken
  ) {
    return { status: "not_applicable" };
  }

  const latestState =
    verifiedState ??
    (await verifyGooglePurchase(env, {
      packageName: purchase.mobilePackageName,
      productId: purchase.mobileProductId,
      purchaseToken: purchase.mobilePurchaseToken,
      orderId: purchase.mobileOrderId ?? undefined,
    }));

  const now = Date.now();
  await syncGooglePurchaseState(env, purchase.id, {
    provider: "google",
    purchaseToken: purchase.mobilePurchaseToken,
    packageName: purchase.mobilePackageName,
    productId: purchase.mobileProductId,
    orderId: latestState.orderId ?? purchase.mobileOrderId ?? null,
    purchaseState: latestState.purchaseState ?? null,
    consumptionState: latestState.consumptionState ?? null,
    acknowledgementState: latestState.acknowledgementState ?? null,
    verifiedAt: now,
  });

  if (isGooglePurchaseSettled(latestState)) {
    await syncGooglePurchaseState(env, purchase.id, {
      consumeStatus: "consumed",
      consumedAt: purchase.mobileConsumedAt ?? now,
      consumeLastError: null,
    });

    await logEvent(env, {
      eventType: "google_mobile_purchase_already_consumed",
      profileId: purchase.buyerProfileId,
      eventData: {
        purchaseId: purchase.id,
        externalPaymentId: purchase.stripeSessionId,
        productKind: purchase.productKind,
        itemKey: purchase.itemKey,
      },
    });

    return {
      status: "already_consumed",
      purchaseState: latestState.purchaseState,
      consumptionState: latestState.consumptionState,
      acknowledgementState: latestState.acknowledgementState,
    };
  }

  const attemptCount = (purchase.mobileConsumeAttemptCount ?? 0) + 1;
  const attemptAt = Date.now();

  try {
    await consumeGooglePurchase(env, {
      packageName: purchase.mobilePackageName,
      productId: purchase.mobileProductId,
      purchaseToken: purchase.mobilePurchaseToken,
    });

    await syncGooglePurchaseState(env, purchase.id, {
      consumeStatus: "consumed",
      consumeAttemptCount: attemptCount,
      consumeLastAttemptAt: attemptAt,
      consumeLastError: null,
      consumedAt: attemptAt,
      consumptionState: 1,
      acknowledgementState: latestState.acknowledgementState ?? 1,
    });

    await logEvent(env, {
      eventType: "google_mobile_purchase_consumed",
      profileId: purchase.buyerProfileId,
      eventData: {
        purchaseId: purchase.id,
        externalPaymentId: purchase.stripeSessionId,
        productKind: purchase.productKind,
        itemKey: purchase.itemKey,
        attemptCount,
      },
    });

    return {
      status: "consumed",
      purchaseState: latestState.purchaseState,
      consumptionState: 1,
      acknowledgementState: latestState.acknowledgementState ?? 1,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to consume Google Play purchase.";

    await syncGooglePurchaseState(env, purchase.id, {
      consumeStatus: "failed",
      consumeAttemptCount: attemptCount,
      consumeLastAttemptAt: attemptAt,
      consumeLastError: message,
    });

    await logEvent(env, {
      eventType: "google_mobile_purchase_consume_failed",
      profileId: purchase.buyerProfileId,
      eventData: {
        purchaseId: purchase.id,
        externalPaymentId: purchase.stripeSessionId,
        productKind: purchase.productKind,
        itemKey: purchase.itemKey,
        attemptCount,
        error: message,
      },
    });

    return {
      status: "failed",
      purchaseState: latestState.purchaseState,
      consumptionState: latestState.consumptionState,
      acknowledgementState: latestState.acknowledgementState,
      error: message,
    };
  }
}

async function upsertAndFulfillMobilePurchase(
  env: EnvBindings,
  input: {
    provider: MobileProvider;
    externalPaymentId: string;
    buyerProfileId: string;
    targetProfileId: string | null;
    productKind: "gift" | "boost" | "challenge_credit_pack";
    itemKey: string;
    amountCents: number;
    rawPayload: Record<string, string | null | undefined>;
    mobilePurchaseToken?: string;
    mobilePackageName?: string;
    mobileProductId?: string;
    mobileOrderId?: string;
    mobilePurchaseState?: number;
    mobileConsumptionState?: number;
    mobileAcknowledgementState?: number;
  },
) {
  const db = getDb(env);
  const [existingPurchase] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.stripeSessionId, input.externalPaymentId))
    .limit(1);

  if (existingPurchase) {
    if (existingPurchase.buyerProfileId !== input.buyerProfileId) {
      throw new PaymentRouteError("This purchase does not belong to you.", 403);
    }

    if (existingPurchase.status === "fulfilled") {
      return existingPurchase;
    }

    return fulfillPurchase(env, existingPurchase.id);
  }

  const purchaseId = crypto.randomUUID();
  await db.insert(purchases).values({
    id: purchaseId,
    stripeSessionId: input.externalPaymentId,
    buyerProfileId: input.buyerProfileId,
    targetProfileId: input.targetProfileId,
    mobileProvider: input.provider,
    mobilePurchaseToken: input.mobilePurchaseToken ?? null,
    mobilePackageName: input.mobilePackageName ?? null,
    mobileProductId: input.mobileProductId ?? null,
    mobileOrderId: input.mobileOrderId ?? null,
    mobilePurchaseState: input.mobilePurchaseState ?? null,
    mobileConsumptionState: input.mobileConsumptionState ?? null,
    mobileAcknowledgementState: input.mobileAcknowledgementState ?? null,
    mobileVerifiedAt: Date.now(),
    mobileConsumeStatus: input.provider === "google" ? "pending" : null,
    mobileConsumeAttemptCount: 0,
    mobileConsumeLastAttemptAt: null,
    mobileConsumeLastError: null,
    mobileConsumedAt: null,
    productKind: input.productKind,
    itemKey: input.itemKey,
    amountCents: input.amountCents,
    currency: "usd",
    status: "pending",
    fulfilledAt: null,
    createdAt: Date.now(),
  });

  await logEvent(env, {
    eventType: "mobile_purchase_verified",
    profileId: input.buyerProfileId,
    eventData: {
      provider: input.provider,
      purchaseId,
      externalPaymentId: input.externalPaymentId,
      productKind: input.productKind,
      itemKey: input.itemKey,
      targetProfileId: input.targetProfileId,
      ...input.rawPayload,
    },
  });

  return fulfillPurchase(env, purchaseId);
}

paymentRoutes.post("/checkout", async (c) => {
  try {
    const own = await getOwnProfileContext(
      c.env,
      c.req.header("Cookie"),
      c.req.header("Authorization"),
    );
    if (!own) {
      return c.json({ error: "Unauthorized." }, 401);
    }

    const payload = checkoutSessionSchema.safeParse(await c.req.json());
    if (!payload.success) {
      return c.json({ error: "Invalid checkout request." }, 400);
    }

    const origin = resolveFrontendOrigin(c.req.header("Origin"));
    if (!origin) {
      return c.json({ error: "Unknown frontend origin." }, 400);
    }

    const db = getDb(c.env);

    if (payload.data.productKind === "gift") {
      await assertValidGiftTarget(c.env, own.profileId, payload.data.targetProfileId);
      const targetProfileId = payload.data.targetProfileId!;
      const gift = assertCatalogItem(payload.data);

      const purchaseId = crypto.randomUUID();
      const session = await createHostedCheckoutSession(c.env, {
        origin,
        productName: gift.label,
        amountCents: gift.priceCents,
        metadata: {
          purchaseId,
          buyerProfileId: own.profileId,
          productKind: "gift",
          itemKey: gift.key,
          targetProfileId,
        },
      });

      await db.insert(purchases).values({
        id: purchaseId,
        stripeSessionId: session.id,
        buyerProfileId: own.profileId,
        targetProfileId,
        productKind: "gift",
        itemKey: gift.key,
        amountCents: gift.priceCents,
        currency: "usd",
        status: "pending",
        fulfilledAt: null,
        createdAt: Date.now(),
      });

      await logEvent(c.env, {
        eventType: "gift_checkout_started",
        profileId: own.profileId,
        eventData: {
          purchaseId,
          checkoutId: session.id,
          targetProfileId,
          itemKey: gift.key,
          amountCents: gift.priceCents,
        },
      });

      return c.json({ checkoutUrl: session.url, checkoutId: session.id });
    }

    if (payload.data.productKind === "challenge_credit_pack") {
      const pack = challengeCreditCatalog.find((item) => item.key === payload.data.itemKey);
      if (!pack) {
        throw new PaymentRouteError("Invalid challenge credit pack.", 400);
      }

      const purchaseId = crypto.randomUUID();
      const session = await createHostedCheckoutSession(c.env, {
        origin,
        productName: pack.label,
        amountCents: pack.priceCents,
        metadata: {
          purchaseId,
          buyerProfileId: own.profileId,
          productKind: "challenge_credit_pack",
          itemKey: pack.key,
        },
      });

      await db.insert(purchases).values({
        id: purchaseId,
        stripeSessionId: session.id,
        buyerProfileId: own.profileId,
        targetProfileId: null,
        productKind: "challenge_credit_pack",
        itemKey: pack.key,
        amountCents: pack.priceCents,
        currency: "usd",
        status: "pending",
        fulfilledAt: null,
        createdAt: Date.now(),
      });

      await logEvent(c.env, {
        eventType: "challenge_credit_checkout_started",
        profileId: own.profileId,
        eventData: {
          purchaseId,
          checkoutId: session.id,
          itemKey: pack.key,
          credits: pack.credits,
          amountCents: pack.priceCents,
        },
      });

      return c.json({ checkoutUrl: session.url, checkoutId: session.id });
    }

    const boost = assertCatalogItem(payload.data);

    const purchaseId = crypto.randomUUID();
    const session = await createHostedCheckoutSession(c.env, {
      origin,
      productName: boost.label,
      amountCents: boost.priceCents,
      metadata: {
        purchaseId,
        buyerProfileId: own.profileId,
        productKind: "boost",
        itemKey: boost.key,
      },
    });

    await db.insert(purchases).values({
      id: purchaseId,
      stripeSessionId: session.id,
      buyerProfileId: own.profileId,
      targetProfileId: null,
      productKind: "boost",
      itemKey: boost.key,
      amountCents: boost.priceCents,
      currency: "usd",
      status: "pending",
      fulfilledAt: null,
      createdAt: Date.now(),
    });

    await logEvent(c.env, {
      eventType: "boost_checkout_started",
      profileId: own.profileId,
      eventData: {
        purchaseId,
        checkoutId: session.id,
        itemKey: boost.key,
        amountCents: boost.priceCents,
      },
    });

    return c.json({ checkoutUrl: session.url, checkoutId: session.id });
  } catch (error) {
    const status = (error instanceof PaymentRouteError ? error.status : 500) as
      | 400
      | 401
      | 403
      | 404
      | 500
      | 501;
    return c.json(
      { error: error instanceof Error ? error.message : "Unable to start checkout." },
      status,
    );
  }
});

paymentRoutes.post("/checkout/complete", async (c) => {
  try {
    const own = await getOwnProfileContext(
      c.env,
      c.req.header("Cookie"),
      c.req.header("Authorization"),
    );
    if (!own) {
      return c.json({ error: "Unauthorized." }, 401);
    }

    const body = (await c.req.json()) as { sessionId?: string };
    if (!body.sessionId) {
      return c.json({ error: "sessionId is required." }, 400);
    }

    const db = getDb(c.env);
    const [existingPurchaseByExternalId] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeSessionId, body.sessionId))
      .limit(1);

    if (
      getConfiguredPaymentProvider(c.env) === "paypal" &&
      existingPurchaseByExternalId?.status === "fulfilled"
    ) {
      if (existingPurchaseByExternalId.buyerProfileId !== own.profileId) {
        return c.json({ error: "This checkout does not belong to you." }, 403);
      }

      return c.json({ ok: true, purchase: existingPurchaseByExternalId });
    }

    const checkout = await completeHostedCheckout(c.env, body.sessionId);
    const [purchase] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.id, checkout.purchaseId))
      .limit(1);

    if (!purchase) {
      return c.json({ error: "Purchase not found." }, 404);
    }

    if (purchase.buyerProfileId !== own.profileId) {
      return c.json({ error: "This checkout does not belong to you." }, 403);
    }

    const fulfilledPurchase = await fulfillPurchase(c.env, purchase.id);
    return c.json({ ok: true, purchase: fulfilledPurchase });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : "Unable to confirm purchase." },
      500,
    );
  }
});

paymentRoutes.post("/mobile/verify/apple", async (c) => {
  try {
    const own = await getOwnProfileContext(
      c.env,
      c.req.header("Cookie"),
      c.req.header("Authorization"),
    );
    if (!own) {
      return c.json({ error: "Unauthorized." }, 401);
    }

    const payload = mobilePurchaseVerificationSchema.safeParse(await c.req.json());
    if (!payload.success || payload.data.provider !== "apple") {
      return c.json({ error: "Invalid Apple purchase verification payload." }, 400);
    }

    const product = assertCatalogItem(payload.data);
    if (payload.data.productKind === "gift") {
      await assertValidGiftTarget(c.env, own.profileId, payload.data.targetProfileId);
    }

    await verifyApplePurchase(c.env, {
      receiptData: payload.data.receiptData,
      transactionId: payload.data.transactionId,
    });

    const purchase = await upsertAndFulfillMobilePurchase(c.env, {
      provider: "apple",
      externalPaymentId: `apple:${payload.data.transactionId}`,
      buyerProfileId: own.profileId,
      targetProfileId: payload.data.targetProfileId ?? null,
      productKind: payload.data.productKind,
      itemKey: payload.data.itemKey,
      amountCents: product.priceCents,
      rawPayload: {
        transactionId: payload.data.transactionId,
      },
    });

    return c.json({ ok: true, purchase });
  } catch (error) {
    const status = (error instanceof PaymentRouteError ? error.status : 500) as
      | 400
      | 401
      | 403
      | 404
      | 500
      | 501;
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify Apple purchase.",
      },
      status,
    );
  }
});

paymentRoutes.post("/mobile/verify/google", async (c) => {
  try {
    const own = await getOwnProfileContext(
      c.env,
      c.req.header("Cookie"),
      c.req.header("Authorization"),
    );
    if (!own) {
      return c.json({ error: "Unauthorized." }, 401);
    }

    const payload = mobilePurchaseVerificationSchema.safeParse(await c.req.json());
    if (!payload.success || payload.data.provider !== "google") {
      return c.json({ error: "Invalid Google purchase verification payload." }, 400);
    }

    const externalPaymentId = `google:${payload.data.purchaseToken}`;
    const db = getDb(c.env);
    const [existingPurchase] = await db
      .select()
      .from(purchases)
      .where(eq(purchases.stripeSessionId, externalPaymentId))
      .limit(1);

    const product = assertCatalogItem(payload.data);
    if (!existingPurchase && payload.data.productKind === "gift") {
      await assertValidGiftTarget(c.env, own.profileId, payload.data.targetProfileId);
    }

    const googleVerification = await verifyGooglePurchase(c.env, {
      packageName: payload.data.packageName,
      productId: payload.data.productId,
      purchaseToken: payload.data.purchaseToken,
      orderId: payload.data.orderId,
    });

    let purchase: typeof purchases.$inferSelect;

    if (existingPurchase) {
      if (existingPurchase.buyerProfileId !== own.profileId) {
        return c.json({ error: "This purchase does not belong to you." }, 403);
      }

      await syncGooglePurchaseState(c.env, existingPurchase.id, {
        provider: "google",
        purchaseToken: payload.data.purchaseToken,
        packageName: payload.data.packageName,
        productId: payload.data.productId,
        orderId: payload.data.orderId ?? googleVerification.orderId ?? null,
        purchaseState: googleVerification.purchaseState ?? null,
        consumptionState: googleVerification.consumptionState ?? null,
        acknowledgementState: googleVerification.acknowledgementState ?? null,
        verifiedAt: Date.now(),
      });

      purchase =
        existingPurchase.status === "fulfilled"
          ? {
              ...existingPurchase,
              mobileProvider: "google",
              mobilePurchaseToken: payload.data.purchaseToken,
              mobilePackageName: payload.data.packageName,
              mobileProductId: payload.data.productId,
              mobileOrderId: payload.data.orderId ?? googleVerification.orderId ?? null,
              mobilePurchaseState: googleVerification.purchaseState ?? null,
              mobileConsumptionState: googleVerification.consumptionState ?? null,
              mobileAcknowledgementState: googleVerification.acknowledgementState ?? null,
              mobileVerifiedAt: Date.now(),
            }
          : await fulfillPurchase(c.env, existingPurchase.id);
    } else {
      purchase = await upsertAndFulfillMobilePurchase(c.env, {
        provider: "google",
        externalPaymentId,
        buyerProfileId: own.profileId,
        targetProfileId: payload.data.targetProfileId ?? null,
        productKind: payload.data.productKind,
        itemKey: payload.data.itemKey,
        amountCents: product.priceCents,
        rawPayload: {
          orderId: payload.data.orderId ?? null,
          packageName: payload.data.packageName,
          productId: payload.data.productId,
        },
        mobilePurchaseToken: payload.data.purchaseToken,
        mobilePackageName: payload.data.packageName,
        mobileProductId: payload.data.productId,
        mobileOrderId: payload.data.orderId ?? googleVerification.orderId,
        mobilePurchaseState: googleVerification.purchaseState,
        mobileConsumptionState: googleVerification.consumptionState,
        mobileAcknowledgementState: googleVerification.acknowledgementState,
      });
    }

    const consumeResult = await consumeGooglePurchaseIfNeeded(c.env, purchase, googleVerification);

    return c.json({
      ok: true,
      purchase,
      googlePlay: {
        purchaseState: googleVerification.purchaseState ?? null,
        consumptionState:
          consumeResult.status === "consumed"
            ? 1
            : googleVerification.consumptionState ?? null,
        acknowledgementState:
          consumeResult.status === "consumed"
            ? googleVerification.acknowledgementState ?? 1
            : googleVerification.acknowledgementState ?? null,
        consumeStatus: consumeResult.status,
        consumeError: consumeResult.error ?? null,
      },
    });
  } catch (error) {
    const status = (error instanceof PaymentRouteError ? error.status : 500) as
      | 400
      | 401
      | 403
      | 404
      | 500
      | 501;
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to verify Google purchase.",
      },
      status,
    );
  }
});

paymentRoutes.post("/mobile/verify", async (c) => {
  return c.json(
    {
      error: "Use /mobile/verify/apple or /mobile/verify/google for platform-specific verification.",
    },
    400,
  );
});

paymentRoutes.post("/webhook/paypal", async (c) => {
  try {
    const payload = (await c.req.json()) as {
      id?: string;
      event_type?: string;
      resource?: {
        id?: string;
        purchase_units?: Array<{ custom_id?: string }>;
        supplementary_data?: {
          related_ids?: {
            order_id?: string;
          };
        };
      };
    };

    if (!payload.id || !payload.event_type) {
      return c.json({ error: "Invalid webhook payload." }, 400);
    }

    const db = getDb(c.env);
    const [existing] = await db
      .select({ id: paymentWebhookEvents.id })
      .from(paymentWebhookEvents)
      .where(eq(paymentWebhookEvents.eventId, payload.id))
      .limit(1);

    if (existing) {
      return c.json({ ok: true, duplicate: true });
    }

    await db.insert(paymentWebhookEvents).values({
      id: crypto.randomUUID(),
      provider: "paypal",
      eventId: payload.id,
      eventType: payload.event_type,
      resourceId:
        payload.resource?.id ??
        payload.resource?.supplementary_data?.related_ids?.order_id ??
        null,
      payload: JSON.stringify(payload),
      processedAt: null,
      createdAt: Date.now(),
    });

    let fulfilledPurchaseId: string | null = null;

    if (payload.event_type === "CHECKOUT.ORDER.APPROVED" && payload.resource?.id) {
      const checkout = await completeHostedCheckout(c.env, payload.resource.id);
      const fulfilled = await fulfillPurchase(c.env, checkout.purchaseId);
      fulfilledPurchaseId = fulfilled.id;
    }

    if (
      payload.event_type === "PAYMENT.CAPTURE.COMPLETED" &&
      payload.resource?.supplementary_data?.related_ids?.order_id
    ) {
      const fulfilled = await fulfillPurchaseByExternalId(
        c.env,
        payload.resource.supplementary_data.related_ids.order_id,
      );
      fulfilledPurchaseId = fulfilled.id;
    }

    await db
      .update(paymentWebhookEvents)
      .set({ processedAt: Date.now() })
      .where(eq(paymentWebhookEvents.eventId, payload.id));

    await logEvent(c.env, {
      eventType: "paypal_webhook_received",
      eventData: {
        eventId: payload.id,
        eventType: payload.event_type,
        resourceId:
          payload.resource?.id ??
          payload.resource?.supplementary_data?.related_ids?.order_id ??
          null,
        fulfilledPurchaseId,
      },
    });

    return c.json({ ok: true, fulfilledPurchaseId });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to process PayPal webhook.",
      },
      500,
    );
  }
});
