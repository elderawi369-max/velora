import { eq } from "drizzle-orm";
import { boosts, gifts, notifications, purchases } from "../db/schema";
import { getDb, type EnvBindings } from "./db";

export type GiftType = "rose" | "starlight" | "crown";
export type BoostType = "spark" | "spotlight";

export const giftCatalog = [
  { key: "rose", label: "Rose Aura", priceCents: 99 },
  { key: "starlight", label: "Starlight Ring", priceCents: 199 },
  { key: "crown", label: "Velora Crown", priceCents: 399 },
] as const;

export const boostCatalog = [
  { key: "spark", label: "Spark Boost", durationHours: 6, priceCents: 299 },
  { key: "spotlight", label: "Spotlight Boost", durationHours: 24, priceCents: 699 },
] as const;

export async function createNotification(
  env: EnvBindings,
  input: {
    profileId: string;
    actorProfileId: string;
    type: "favorite" | "gift";
    giftType?: string;
  },
) {
  const db = getDb(env);
  await db.insert(notifications).values({
    id: crypto.randomUUID(),
    profileId: input.profileId,
    actorProfileId: input.actorProfileId,
    type: input.type,
    giftType: input.giftType ?? null,
    readAt: null,
    createdAt: Date.now(),
  });
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

  await db
    .update(purchases)
    .set({
      status: "fulfilled",
      fulfilledAt: now,
    })
    .where(eq(purchases.id, purchase.id));

  return {
    ...purchase,
    status: "fulfilled",
    fulfilledAt: now,
  };
}
