import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { boostCatalog, fulfillPurchase, giftCatalog } from "../lib/commerce";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";
import { checkoutSessionSchema } from "../lib/validation";
import { paymentWebhookEvents, profiles, purchases } from "../db/schema";
import { logEvent } from "../lib/analytics";

export const paymentRoutes = new Hono<{ Bindings: EnvBindings }>();

type CheckoutProvider = "paypal" | "stripe";

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

async function getPayPalAccessToken(env: EnvBindings) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) {
    throw new Error("PayPal is not configured yet.");
  }

  const credentials = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
  const response = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
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

  const response = await fetch("https://api-m.sandbox.paypal.com/v2/checkout/orders", {
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
  const response = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${orderId}/capture`, {
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
      if (!payload.data.targetProfileId) {
        return c.json({ error: "Gift purchases need a target profile." }, 400);
      }

      if (payload.data.targetProfileId === own.profileId) {
        return c.json({ error: "You cannot send a gift to yourself." }, 400);
      }

      const [target] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, payload.data.targetProfileId))
        .limit(1);

      if (!target) {
        return c.json({ error: "Target profile not found." }, 404);
      }

      const gift = giftCatalog.find((item) => item.key === payload.data.itemKey);
      if (!gift) {
        return c.json({ error: "Invalid gift type." }, 400);
      }

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
          targetProfileId: payload.data.targetProfileId,
        },
      });

      await db.insert(purchases).values({
        id: purchaseId,
        stripeSessionId: session.id,
        buyerProfileId: own.profileId,
        targetProfileId: payload.data.targetProfileId,
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
          targetProfileId: payload.data.targetProfileId,
          itemKey: gift.key,
          amountCents: gift.priceCents,
        },
      });

      return c.json({ checkoutUrl: session.url, checkoutId: session.id });
    }

    const boost = boostCatalog.find((item) => item.key === payload.data.itemKey);
    if (!boost) {
      return c.json({ error: "Invalid boost type." }, 400);
    }

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
    return c.json(
      { error: error instanceof Error ? error.message : "Unable to start checkout." },
      500,
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
