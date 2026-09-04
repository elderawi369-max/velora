export type AiCompanionPlanKey = "free" | "pro" | "ultra";

export type AiCompanionPlan = {
  key: AiCompanionPlanKey;
  name: string;
  positioning: string;
  messageLimit: number;
  companionLimit: number;
  photoLimit: number;
  voiceMonthlySeconds: number;
  webPriceCents: number | null;
  googlePlayFallbackPrice: string | null;
  googlePlayProductId: string | null;
};

export const aiCompanionPlans: Record<AiCompanionPlanKey, AiCompanionPlan> = {
  free: {
    key: "free",
    name: "Free Preview",
    positioning: "Meet your companion",
    messageLimit: 15,
    companionLimit: 1,
    photoLimit: 1,
    voiceMonthlySeconds: 0,
    webPriceCents: null,
    googlePlayFallbackPrice: null,
    googlePlayProductId: null,
  },
  pro: {
    key: "pro",
    name: "Pro",
    positioning: "Your dedicated companion",
    messageLimit: 1000,
    companionLimit: 1,
    photoLimit: 60,
    voiceMonthlySeconds: 240 * 60,
    webPriceCents: 699,
    googlePlayFallbackPrice: "$7.99",
    googlePlayProductId: "velora_ai_pro_monthly",
  },
  ultra: {
    key: "ultra",
    name: "Ultra",
    positioning: "More connections, more possibilities",
    messageLimit: 1000,
    companionLimit: 2,
    photoLimit: 150,
    voiceMonthlySeconds: 480 * 60,
    webPriceCents: 1299,
    googlePlayFallbackPrice: "$13.99",
    googlePlayProductId: "velora_ai_ultra_monthly",
  },
};

export function normalizeAiCompanionPlan(value: string | null | undefined): AiCompanionPlanKey {
  return value === "pro" || value === "ultra" ? value : "free";
}

export function publicAiCompanionPlans() {
  return (["pro", "ultra"] as const).map((key) => {
    const plan = aiCompanionPlans[key];
    return {
      key: plan.key,
      name: plan.name,
      positioning: plan.positioning,
      messageLimit: plan.messageLimit,
      companionLimit: plan.companionLimit,
      photoLimit: plan.photoLimit,
      webPriceCents: plan.webPriceCents,
      googlePlayFallbackPrice: plan.googlePlayFallbackPrice,
      googlePlayProductId: plan.googlePlayProductId,
    };
  });
}

export function entitlementLimits(planValue: string | null | undefined) {
  const plan = aiCompanionPlans[normalizeAiCompanionPlan(planValue)];
  return {
    plan: plan.key,
    messageLimit: plan.messageLimit,
    photoLimit: plan.photoLimit,
    companionLimit: plan.companionLimit,
    voiceMonthlySeconds: plan.voiceMonthlySeconds,
  };
}

export async function getAiCompanionEntitlement(env: EnvBindings, userId: string) {
  const db = getDb(env);
  const [existing] = await db.select().from(aiEntitlements).where(eq(aiEntitlements.userId, userId)).limit(1);
  if (existing) {
    const activePlan = existing.expiresAt && existing.expiresAt <= Date.now() ? "free" : existing.plan;
    return { ...existing, ...entitlementLimits(activePlan) };
  }
  const timestamp = Date.now();
  const entitlement = { userId, source: null, expiresAt: null, ...entitlementLimits("free"), createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiEntitlements).values(entitlement);
  return entitlement;
}

export async function activateAiCompanionPlan(env: EnvBindings, input: { userId: string; plan: "pro" | "ultra"; source: string; expiresAt: number | null }) {
  const timestamp = Date.now();
  const limits = entitlementLimits(input.plan);
  await getDb(env).insert(aiEntitlements).values({
    userId: input.userId,
    source: input.source,
    expiresAt: input.expiresAt,
    ...limits,
    createdAt: timestamp,
    updatedAt: timestamp,
  }).onConflictDoUpdate({
    target: aiEntitlements.userId,
    set: { source: input.source, expiresAt: input.expiresAt, ...limits, updatedAt: timestamp },
  });
  return { ...limits, source: input.source, expiresAt: input.expiresAt };
}
import { eq } from "drizzle-orm";
import { aiEntitlements } from "../db/schema";
import { getDb, type EnvBindings } from "./db";
