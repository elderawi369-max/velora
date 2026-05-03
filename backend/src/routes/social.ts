import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { favorites, gifts, notifications, profiles } from "../db/schema";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";

const giftCatalog = [
  { key: "rose", label: "Rose Aura" },
  { key: "starlight", label: "Starlight Ring" },
  { key: "crown", label: "Velora Crown" },
] as const;

export const socialRoutes = new Hono<{ Bindings: EnvBindings }>();

async function createNotification(
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

socialRoutes.get("/favorites", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const rows = await db
    .select({
      id: favorites.id,
      targetProfileId: favorites.targetProfileId,
      createdAt: favorites.createdAt,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarPreset: profiles.avatarPreset,
    })
    .from(favorites)
    .innerJoin(profiles, eq(favorites.targetProfileId, profiles.id))
    .where(eq(favorites.profileId, own.profileId))
    .orderBy(desc(favorites.createdAt));

  return c.json({ favorites: rows });
});

socialRoutes.post("/favorites/:targetProfileId", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const targetProfileId = c.req.param("targetProfileId");
  if (targetProfileId === own.profileId) {
    return c.json({ error: "You cannot favorite yourself." }, 400);
  }

  const db = getDb(c.env);
  const [existing] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(eq(favorites.profileId, own.profileId), eq(favorites.targetProfileId, targetProfileId)),
    )
    .limit(1);

  if (!existing) {
    await db.insert(favorites).values({
      id: crypto.randomUUID(),
      profileId: own.profileId,
      targetProfileId,
      createdAt: Date.now(),
    });

    await createNotification(c.env, {
      profileId: targetProfileId,
      actorProfileId: own.profileId,
      type: "favorite",
    });
  }

  return c.json({ ok: true });
});

socialRoutes.delete("/favorites/:targetProfileId", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.profileId, own.profileId),
        eq(favorites.targetProfileId, c.req.param("targetProfileId")),
      ),
    );

  return c.json({ ok: true });
});

socialRoutes.get("/gifts/catalog", (c) => c.json({ gifts: giftCatalog }));

socialRoutes.post("/gifts/send", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const body = (await c.req.json()) as { targetProfileId?: string; giftType?: string };
  if (!body.targetProfileId || !body.giftType) {
    return c.json({ error: "targetProfileId and giftType are required." }, 400);
  }

  if (body.targetProfileId === own.profileId) {
    return c.json({ error: "You cannot send a gift to yourself." }, 400);
  }

  const validGift = giftCatalog.some((gift) => gift.key === body.giftType);
  if (!validGift) {
    return c.json({ error: "Invalid gift type." }, 400);
  }

  const db = getDb(c.env);
  await db.insert(gifts).values({
    id: crypto.randomUUID(),
    senderProfileId: own.profileId,
    targetProfileId: body.targetProfileId,
    giftType: body.giftType,
    createdAt: Date.now(),
  });

  await createNotification(c.env, {
    profileId: body.targetProfileId,
    actorProfileId: own.profileId,
    type: "gift",
    giftType: body.giftType,
  });

  return c.json({ ok: true });
});
