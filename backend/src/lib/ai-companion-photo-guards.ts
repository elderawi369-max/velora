import type { EnvBindings } from "./db";

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function aiCompanionPhotoGenerationGuardConfig(env: EnvBindings) {
  return {
    freeLifetimeLimit: positiveInteger(env.AI_COMPANION_PHOTO_FREE_LIFETIME_GENERATION_LIMIT, 1),
    proDailyLimit: positiveInteger(env.AI_COMPANION_PHOTO_PRO_DAILY_GENERATION_LIMIT, 2),
    ultraDailyLimit: positiveInteger(env.AI_COMPANION_PHOTO_ULTRA_DAILY_GENERATION_LIMIT, 3),
    // FLUX.2 Klein 9B is $0.015 for the first output MP plus $0.002 per
    // input-image MP. Four 512px references make 3 cents a conservative hold.
    estimatedCostCents: positiveInteger(env.AI_COMPANION_PHOTO_ESTIMATED_COST_CENTS, 3),
    monthlySpendCeilingCents: nonNegativeInteger(env.AI_COMPANION_PHOTO_MONTHLY_SPEND_CEILING_CENTS, 5_000),
  };
}

export function aiCompanionPhotoGenerationPlanLimit(env: EnvBindings, plan: "free" | "pro" | "ultra") {
  const config = aiCompanionPhotoGenerationGuardConfig(env);
  if (plan === "free") return { limit: config.freeLifetimeLimit, period: "lifetime" as const };
  return { limit: plan === "ultra" ? config.ultraDailyLimit : config.proDailyLimit, period: "daily" as const };
}
