import { eq } from "drizzle-orm";
import { boosts, gifts, notifications, profiles, purchases } from "../db/schema";
import { getDb, type EnvBindings } from "./db";
import { logEvent } from "./analytics";
import { sendPushToUser } from "./push";

export type GiftType = "rose" | "starlight" | "crown";
export type BoostType = "spark" | "spotlight";
export type ChallengeCreditPackType = "challenge_pack_3" | "challenge_pack_10";

export const giftCatalog = [
  { key: "rose", label: "Rose Aura", priceCents: 99 },
  { key: "starlight", label: "Starlight Ring", priceCents: 149 },
  { key: "crown", label: "Velora Crown", priceCents: 249 },
] as const;

export const boostCatalog = [
  { key: "spark", label: "Spark Boost", durationHours: 6, priceCents: 149 },
  { key: "spotlight", label: "Spotlight Boost", durationHours: 24, priceCents: 299 },
] as const;

export const challengeCreditCatalog = [
  { key: "challenge_pack_3", label: "3 Challenge Credits", credits: 3, priceCents: 99 },
  { key: "challenge_pack_10", label: "10 Challenge Credits", credits: 10, priceCents: 249 },
] as const;

export async function createNotification(
  env: EnvBindings,
  input: {
    profileId: string;
    actorProfileId: string;
    type: "favorite" | "gift" | "challenge" | "challenge_result" | "starter_credit_reward";
    giftType?: string;
    challengeSessionId?: string;
  },
) {
  const db = getDb(env);
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    profileId: input.profileId,
    actorProfileId: input.actorProfileId,
    type: input.type,
    giftType: input.giftType ?? null,
    challengeSessionId: input.challengeSessionId ?? null,
    readAt: null,
    createdAt: Date.now(),
  });

  const [targetProfile] = await db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.id, input.profileId))
    .limit(1);
  const [actorProfile] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, input.actorProfileId))
    .limit(1);

  if (targetProfile?.userId) {
    const body =
      input.type === "gift"
        ? `${actorProfile?.displayName ?? "Someone"} sent you a ${
            input.giftType === "rose"
              ? "Rose Aura"
              : input.giftType === "starlight"
                ? "Starlight Ring"
                : "Velora Crown"
          }.`
        : input.type === "challenge"
          ? `${actorProfile?.displayName ?? "Someone"} sent you a challenge.`
          : input.type === "challenge_result"
            ? `${actorProfile?.displayName ?? "Someone"} finished your challenge.`
            : input.type === "starter_credit_reward"
              ? "Velora added 2 Challenge Credits to your account."
              : `${actorProfile?.displayName ?? "Someone"} favorited your profile.`;

    const link =
      input.type === "challenge" || input.type === "challenge_result"
        ? input.challengeSessionId
          ? `/challenges/${input.challengeSessionId}`
          : "/challenges"
        : input.type === "starter_credit_reward"
          ? "/challenges"
          : "/activity";

    await sendPushToUser(env, targetProfile.userId, {
      title: input.type === "starter_credit_reward" ? "Velora reward" : "Velora activity",
      body,
      link,
    }).catch(() => undefined);
  }
}

export async function fulfillPurchase(env: EnvBindings, purchaseId: string) {
  const db = getDb(env);
  const [purchase] = await db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .limit(1);

  if (!purchase) {
    throw new Error("Purchase not found.");
  }

  if (purchase.status === "fulfilled") {
    return purchase;
  }

  const now = Date.now();

  if (purchase.productKind === "gift") {
    if (!purchase.targetProfileId) {
      throw new Error("Gift purchase is missing a target profile.");
    }

    await db.insert(gifts).values({
      id: crypto.randomUUID(),
      senderProfileId: purchase.buyerProfileId,
      targetProfileId: purchase.targetProfileId,
      giftType: purchase.itemKey,
      createdAt: now,
    });

    await createNotification(env, {
      profileId: purchase.targetProfileId,
      actorProfileId: purchase.buyerProfileId,
      type: "gift",
      giftType: purchase.itemKey,
    });
  }

  if (purchase.productKind === "boost") {
    const boost = boostCatalog.find((item) => item.key === purchase.itemKey);
    if (!boost) {
      throw new Error("Boost purchase is invalid.");
    }

    await db.insert(boosts).values({
      id: crypto.randomUUID(),
      profileId: purchase.buyerProfileId,
      boostType: boost.key,
      createdAt: now,
      expiresAt: now + boost.durationHours * 60 * 60 * 1000,
    });
  }

  if (purchase.productKind === "challenge_credit_pack") {
    const pack = challengeCreditCatalog.find((item) => item.key === purchase.itemKey);
    if (!pack) {
      throw new Error("Challenge credit purchase is invalid.");
    }

    const [buyerProfile] = await db
      .select({ challengeCredits: profiles.challengeCredits })
      .from(profiles)
      .where(eq(profiles.id, purchase.buyerProfileId))
      .limit(1);

    if (!buyerProfile) {
      throw new Error("Buyer profile not found.");
    }

    await db
      .update(profiles)
      .set({
        challengeCredits: buyerProfile.challengeCredits + pack.credits,
        updatedAt: now,
      })
      .where(eq(profiles.id, purchase.buyerProfileId));
  }

  await db
    .update(purchases)
    .set({
      status: "fulfilled",
      fulfilledAt: now,
    })
    .where(eq(purchases.id, purchase.id));

  await logEvent(env, {
    eventType:
      purchase.productKind === "gift"
        ? "gift_purchase_completed"
        : purchase.productKind === "boost"
          ? "boost_purchase_completed"
          : "challenge_credit_purchase_completed",
    profileId: purchase.buyerProfileId,
    eventData: {
      purchaseId: purchase.id,
      productKind: purchase.productKind,
      itemKey: purchase.itemKey,
      targetProfileId: purchase.targetProfileId,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
    },
  });

  return {
    ...purchase,
    status: "fulfilled",
    fulfilledAt: now,
  };
}
