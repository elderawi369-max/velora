import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { boostCatalog, fulfillPurchase, giftCatalog } from "../lib/commerce";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";
import { checkoutSessionSchema } from "../lib/validation";
import { profiles, purchases } from "../db/schema";

export const paymentRoutes = new Hono<{ Bindings: EnvBindings }>();

function resolveFrontendOrigin(origin: string | undefined) {
  if (!origin) {
    return "";
  }

  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if (localhostPattern.test(origin)) {
    return origin;
  }

  const pagesPattern = /^https:\/\/[a-z0-9-]+\.pages\.dev$/i;
  if (pagesPattern.test(origin)) {
    return origin;
  }

  return "";
}

function getConfiguredPaymentProvider(env: EnvBindings) {
  if ((env.PAYMENTS_PROVIDER ?? "").toLowerCase() === "stripe" && env.STRIPE_SECRET_KEY) {
    return "stripe" as const;
  }

  if (env.STRIPE_SECRET_KEY) {
    return "stripe" as const;
  }

  return null;
}

async function createHostedCheckoutSession(env: EnvBindings, input: {
  origin: string;
  productName: string;
  amountCents: number;
  metadata: Record<string, string>;
}): Promise<{ id: string; url: string }> {
  const provider = getConfiguredPaymentProvider(env);
  if (provider !== "stripe" || !env.STRIPE_SECRET_KEY) {
    throw new Error("Payments are not configured yet.");
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

  const data = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };

  if (!response.ok || !data.id || !data.url) {
    throw new Error(data.error?.message ?? "Unable to create checkout session.");
  }

  return {
    id: data.id,
    url: data.url,
  };
}

async function fetchCheckoutSessionStatus(env: EnvBindings, sessionId: string) {
  const provider = getConfiguredPaymentProvider(env);
  if (provider !== "stripe" || !env.STRIPE_SECRET_KEY) {
    throw new Error("Payments are not configured yet.");
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
    throw new Error(data.error?.message ?? "Unable to verify checkout session.");
  }

  return data;
}

paymentRoutes.post("/checkout", async (c) => {
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

    return c.json({ checkoutUrl: session.url });
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

  return c.json({ checkoutUrl: session.url });
});

paymentRoutes.post("/checkout/complete", async (c) => {
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

  const checkoutSession = await fetchCheckoutSessionStatus(c.env, body.sessionId);
  if (checkoutSession.payment_status !== "paid") {
    return c.json({ error: "Payment is not completed yet." }, 400);
  }

  const purchaseId = checkoutSession.metadata?.purchaseId;
  if (!purchaseId) {
    return c.json({ error: "Purchase metadata is missing." }, 400);
  }

  const db = getDb(c.env);
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .limit(1);

  if (!purchase) {
    return c.json({ error: "Purchase not found." }, 404);
  }

  if (purchase.buyerProfileId !== own.profileId) {
    return c.json({ error: "This checkout does not belong to you." }, 403);
  }

  const fulfilledPurchase = await fulfillPurchase(c.env, purchase.id);
  return c.json({ ok: true, purchase: fulfilledPurchase });
});
