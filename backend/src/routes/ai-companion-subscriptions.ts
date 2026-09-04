import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiCompanionSubscriptionPlans, aiCompanionSubscriptions } from "../db/schema";
import { activateAiCompanionPlan, aiCompanionPlans } from "../lib/ai-companion-plans";
import { getDb, type EnvBindings } from "../lib/db";
import { getAccountContext } from "../lib/profile-context";
import { getGooglePlayAccessToken } from "./payments";

export const aiCompanionSubscriptionRoutes = new Hono<{ Bindings: EnvBindings }>();

const paidPlanSchema = z.enum(["pro", "ultra"]);
const checkoutSchema = z.object({ plan: paidPlanSchema });
const completeSchema = z.object({ checkoutId: z.string().trim().min(1).max(240) });
const googleSchema = z.object({
  plan: paidPlanSchema,
  purchaseToken: z.string().trim().min(1).max(512),
  packageName: z.string().trim().min(1).max(160),
  productId: z.string().trim().min(1).max(160),
  orderId: z.string().trim().max(160).optional(),
});

async function contextFor(c: any) {
  return getAccountContext(c.env, c.req.header("cookie"), c.req.header("authorization"));
}

function frontendOrigin(origin: string | undefined) {
  if (origin && (/^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i.test(origin) || origin === "https://app.velorachat.com")) return origin;
  return "";
}

function paymentProvider(env: EnvBindings) {
  const configured = (env.PAYMENTS_PROVIDER ?? "").toLowerCase();
  if (configured === "stripe" && env.STRIPE_SECRET_KEY) return "stripe" as const;
  if (configured === "paypal" && env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) return "paypal" as const;
  if (env.PAYPAL_CLIENT_ID && env.PAYPAL_SECRET) return "paypal" as const;
  if (env.STRIPE_SECRET_KEY) return "stripe" as const;
  return null;
}

function paypalBaseUrl(env: EnvBindings) {
  return (env.PAYPAL_ENV ?? "").toLowerCase() === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

async function paypalAccessToken(env: EnvBindings) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_SECRET) throw new Error("PayPal subscription billing is not configured.");
  const response = await fetch(`${paypalBaseUrl(env)}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const body = await response.json<{ access_token?: string; error_description?: string }>();
  if (!response.ok || !body.access_token) throw new Error(body.error_description ?? "Unable to authenticate subscription checkout.");
  return body.access_token;
}

async function ensurePayPalPlan(env: EnvBindings, plan: "pro" | "ultra", token: string) {
  const configured = plan === "pro" ? env.PAYPAL_AI_PRO_PLAN_ID : env.PAYPAL_AI_ULTRA_PLAN_ID;
  if (configured) return configured;
  const db = getDb(env);
  const [existing] = await db.select().from(aiCompanionSubscriptionPlans).where(and(eq(aiCompanionSubscriptionPlans.provider, "paypal"), eq(aiCompanionSubscriptionPlans.plan, plan))).limit(1);
  if (existing) return existing.externalPlanId;

  const planDetails = aiCompanionPlans[plan];
  const productResponse = await fetch(`${paypalBaseUrl(env)}/v1/catalogs/products`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "PayPal-Request-Id": `velora-ai-${plan}-product-v1` },
    body: JSON.stringify({ name: `Velora ${planDetails.name}`, description: planDetails.positioning, type: "SERVICE", category: "SOFTWARE" }),
  });
  const product = await productResponse.json<{ id?: string; message?: string }>();
  if (!productResponse.ok || !product.id) throw new Error(product.message ?? `Unable to configure the Velora ${planDetails.name} subscription.`);

  const planResponse = await fetch(`${paypalBaseUrl(env)}/v1/billing/plans`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation", "PayPal-Request-Id": `velora-ai-${plan}-plan-v1` },
    body: JSON.stringify({
      product_id: product.id,
      name: `Velora ${planDetails.name}`,
      description: planDetails.positioning,
      status: "ACTIVE",
      billing_cycles: [{
        frequency: { interval_unit: "MONTH", interval_count: 1 },
        tenure_type: "REGULAR",
        sequence: 1,
        total_cycles: 0,
        pricing_scheme: { fixed_price: { value: ((planDetails.webPriceCents ?? 0) / 100).toFixed(2), currency_code: "USD" } },
      }],
      payment_preferences: { auto_bill_outstanding: true, setup_fee: { value: "0", currency_code: "USD" }, setup_fee_failure_action: "CONTINUE", payment_failure_threshold: 3 },
    }),
  });
  const paypalPlan = await planResponse.json<{ id?: string; message?: string }>();
  if (!planResponse.ok || !paypalPlan.id) throw new Error(paypalPlan.message ?? `Unable to configure the Velora ${planDetails.name} subscription.`);
  const timestamp = Date.now();
  await db.insert(aiCompanionSubscriptionPlans).values({ id: crypto.randomUUID(), provider: "paypal", plan, externalProductId: product.id, externalPlanId: paypalPlan.id, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
  const [saved] = await db.select().from(aiCompanionSubscriptionPlans).where(and(eq(aiCompanionSubscriptionPlans.provider, "paypal"), eq(aiCompanionSubscriptionPlans.plan, plan))).limit(1);
  return saved?.externalPlanId ?? paypalPlan.id;
}

async function createPayPalSubscription(env: EnvBindings, plan: "pro" | "ultra", origin: string, internalId: string) {
  const token = await paypalAccessToken(env);
  const planId = await ensurePayPalPlan(env, plan, token);
  const response = await fetch(`${paypalBaseUrl(env)}/v1/billing/subscriptions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: internalId,
      application_context: {
        brand_name: "Velora",
        user_action: "SUBSCRIBE_NOW",
        return_url: `${origin}/ai-companions?subscription_return=paypal`,
        cancel_url: `${origin}/ai-companions?subscription_canceled=1`,
      },
    }),
  });
  const body = await response.json<{ id?: string; links?: Array<{ rel: string; href: string }>; message?: string }>();
  const url = body.links?.find((link) => link.rel === "approve")?.href;
  if (!response.ok || !body.id || !url) throw new Error(body.message ?? "Unable to create PayPal subscription.");
  return { checkoutId: body.id, checkoutUrl: url };
}

async function createStripeSubscription(env: EnvBindings, plan: "pro" | "ultra", origin: string, internalId: string) {
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe subscription billing is not configured.");
  const price = aiCompanionPlans[plan];
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", `${origin}/ai-companions?subscription_return=stripe&session_id={CHECKOUT_SESSION_ID}`);
  form.set("cancel_url", `${origin}/ai-companions?subscription_canceled=1`);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(price.webPriceCents));
  form.set("line_items[0][price_data][recurring][interval]", "month");
  form.set("line_items[0][price_data][product_data][name]", `Velora ${price.name}`);
  form.set("metadata[aiSubscriptionId]", internalId);
  form.set("metadata[plan]", plan);
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() });
  const body = await response.json<{ id?: string; url?: string; error?: { message?: string } }>();
  if (!response.ok || !body.id || !body.url) throw new Error(body.error?.message ?? "Unable to create Stripe subscription.");
  return { checkoutId: body.id, checkoutUrl: body.url };
}

async function verifyWebSubscription(env: EnvBindings, provider: string, checkoutId: string) {
  if (provider === "paypal") {
    const token = await paypalAccessToken(env);
    const response = await fetch(`${paypalBaseUrl(env)}/v1/billing/subscriptions/${encodeURIComponent(checkoutId)}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json<{ id?: string; status?: string; billing_info?: { next_billing_time?: string } }>();
    if (!response.ok || body.status !== "ACTIVE") throw new Error("The PayPal subscription is not active yet.");
    const nextBilling = body.billing_info?.next_billing_time ? Date.parse(body.billing_info.next_billing_time) : NaN;
    return { externalSubscriptionId: body.id ?? checkoutId, periodEnd: Number.isFinite(nextBilling) ? nextBilling + 2 * 86_400_000 : Date.now() + 32 * 86_400_000 };
  }
  if (!env.STRIPE_SECRET_KEY) throw new Error("Stripe subscription billing is not configured.");
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(checkoutId)}`, { headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}` } });
  const body = await response.json<{ payment_status?: string; subscription?: string; error?: { message?: string } }>();
  if (!response.ok || body.payment_status !== "paid" || !body.subscription) throw new Error(body.error?.message ?? "The Stripe subscription is not active yet.");
  return { externalSubscriptionId: body.subscription, periodEnd: Date.now() + 32 * 86_400_000 };
}

aiCompanionSubscriptionRoutes.post("/subscriptions/checkout", async (c) => {
  try {
    const context = await contextFor(c); if (!context) return c.json({ error: "Sign in to continue." }, 401);
    const parsed = checkoutSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Choose Pro or Ultra." }, 400);
    const origin = frontendOrigin(c.req.header("origin")); if (!origin) return c.json({ error: "Unknown frontend origin." }, 400);
    const provider = paymentProvider(c.env); if (!provider) return c.json({ error: "Subscription payments are not configured yet." }, 503);
    const internalId = crypto.randomUUID();
    const checkout = provider === "paypal" ? await createPayPalSubscription(c.env, parsed.data.plan, origin, internalId) : await createStripeSubscription(c.env, parsed.data.plan, origin, internalId);
    const timestamp = Date.now();
    await getDb(c.env).insert(aiCompanionSubscriptions).values({ id: internalId, userId: context.userId, plan: parsed.data.plan, provider, externalCheckoutId: checkout.checkoutId, externalSubscriptionId: null, status: "pending", currentPeriodStart: null, currentPeriodEnd: null, createdAt: timestamp, updatedAt: timestamp });
    return c.json(checkout);
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Unable to start subscription checkout." }, 502); }
});

aiCompanionSubscriptionRoutes.post("/subscriptions/checkout/complete", async (c) => {
  try {
    const context = await contextFor(c); if (!context) return c.json({ error: "Sign in to continue." }, 401);
    const parsed = completeSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Missing subscription checkout." }, 400);
    const db = getDb(c.env);
    const [record] = await db.select().from(aiCompanionSubscriptions).where(and(eq(aiCompanionSubscriptions.externalCheckoutId, parsed.data.checkoutId), eq(aiCompanionSubscriptions.userId, context.userId))).limit(1);
    if (!record) return c.json({ error: "Subscription checkout not found." }, 404);
    if (record.status === "active") return c.json({ entitlement: await activateAiCompanionPlan(c.env, { userId: context.userId, plan: record.plan as "pro" | "ultra", source: `${record.provider}:${record.externalSubscriptionId ?? record.externalCheckoutId}`, expiresAt: record.currentPeriodEnd }) });
    const verified = await verifyWebSubscription(c.env, record.provider, record.externalCheckoutId);
    const timestamp = Date.now();
    await db.update(aiCompanionSubscriptions).set({ externalSubscriptionId: verified.externalSubscriptionId, status: "active", currentPeriodStart: timestamp, currentPeriodEnd: verified.periodEnd, updatedAt: timestamp }).where(eq(aiCompanionSubscriptions.id, record.id));
    const entitlement = await activateAiCompanionPlan(c.env, { userId: context.userId, plan: record.plan as "pro" | "ultra", source: `${record.provider}:${verified.externalSubscriptionId}`, expiresAt: verified.periodEnd });
    return c.json({ entitlement });
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Unable to confirm subscription." }, 502); }
});

aiCompanionSubscriptionRoutes.post("/subscriptions/refresh", async (c) => {
  try {
    const context = await contextFor(c); if (!context) return c.json({ error: "Sign in to continue." }, 401);
    const db = getDb(c.env);
    const [record] = await db.select().from(aiCompanionSubscriptions).where(and(eq(aiCompanionSubscriptions.userId, context.userId), eq(aiCompanionSubscriptions.status, "active"))).orderBy(desc(aiCompanionSubscriptions.updatedAt)).limit(1);
    if (!record || record.provider === "google") return c.json({ entitlement: null });
    if (record.currentPeriodEnd && record.currentPeriodEnd > Date.now()) {
      return c.json({ entitlement: await activateAiCompanionPlan(c.env, { userId: context.userId, plan: record.plan as "pro" | "ultra", source: `${record.provider}:${record.externalSubscriptionId ?? record.externalCheckoutId}`, expiresAt: record.currentPeriodEnd }) });
    }
    const verified = await verifyWebSubscription(c.env, record.provider, record.externalCheckoutId);
    const timestamp = Date.now();
    await db.update(aiCompanionSubscriptions).set({ externalSubscriptionId: verified.externalSubscriptionId, currentPeriodStart: timestamp, currentPeriodEnd: verified.periodEnd, updatedAt: timestamp }).where(eq(aiCompanionSubscriptions.id, record.id));
    return c.json({ entitlement: await activateAiCompanionPlan(c.env, { userId: context.userId, plan: record.plan as "pro" | "ultra", source: `${record.provider}:${verified.externalSubscriptionId}`, expiresAt: verified.periodEnd }) });
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Unable to refresh subscription." }, 502); }
});

type GoogleSubscription = { subscriptionState?: string; latestOrderId?: string; lineItems?: Array<{ productId?: string; expiryTime?: string }> };

aiCompanionSubscriptionRoutes.post("/subscriptions/google", async (c) => {
  try {
    const context = await contextFor(c); if (!context) return c.json({ error: "Sign in to continue." }, 401);
    const parsed = googleSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Invalid Google Play subscription." }, 400);
    if (!c.env.GOOGLE_PLAY_PACKAGE_NAME || parsed.data.packageName !== c.env.GOOGLE_PLAY_PACKAGE_NAME) return c.json({ error: "Google Play package does not match Velora." }, 400);
    if (aiCompanionPlans[parsed.data.plan].googlePlayProductId !== parsed.data.productId) return c.json({ error: "Google Play product does not match the selected plan." }, 400);
    const token = await getGooglePlayAccessToken(c.env);
    const response = await fetch(`https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(parsed.data.packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(parsed.data.purchaseToken)}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json<GoogleSubscription & { error?: { message?: string } }>();
    if (!response.ok) throw new Error(body.error?.message ?? "Unable to verify Google Play subscription.");
    if (!body.lineItems?.some((item) => item.productId === parsed.data.productId)) return c.json({ error: "Verified Google Play product does not match the selected plan." }, 400);
    if (!new Set(["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_IN_GRACE_PERIOD"]).has(body.subscriptionState ?? "")) return c.json({ error: "Google Play subscription is not active." }, 400);
    const expiry = Math.max(...body.lineItems.map((item) => item.expiryTime ? Date.parse(item.expiryTime) : 0));
    if (!Number.isFinite(expiry) || expiry <= Date.now()) return c.json({ error: "Google Play subscription has expired." }, 400);
    const externalId = `google:${parsed.data.purchaseToken}`;
    const timestamp = Date.now();
    const [existing] = await getDb(c.env).select().from(aiCompanionSubscriptions).where(eq(aiCompanionSubscriptions.externalCheckoutId, externalId)).limit(1);
    if (existing && existing.userId !== context.userId) return c.json({ error: "This Google Play subscription belongs to another account." }, 403);
    await getDb(c.env).insert(aiCompanionSubscriptions).values({ id: crypto.randomUUID(), userId: context.userId, plan: parsed.data.plan, provider: "google", externalCheckoutId: externalId, externalSubscriptionId: body.latestOrderId ?? parsed.data.orderId ?? externalId, status: "active", currentPeriodStart: timestamp, currentPeriodEnd: expiry, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: aiCompanionSubscriptions.externalCheckoutId, set: { userId: context.userId, plan: parsed.data.plan, externalSubscriptionId: body.latestOrderId ?? parsed.data.orderId ?? externalId, status: "active", currentPeriodEnd: expiry, updatedAt: timestamp } });
    const entitlement = await activateAiCompanionPlan(c.env, { userId: context.userId, plan: parsed.data.plan, source: externalId, expiresAt: expiry });
    return c.json({ entitlement });
  } catch (error) { return c.json({ error: error instanceof Error ? error.message : "Unable to verify Google Play subscription." }, 502); }
});
