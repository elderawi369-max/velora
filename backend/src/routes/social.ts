import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { favorites, profiles } from "../db/schema";
import { boostCatalog, createNotification, giftCatalog } from "../lib/commerce";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";
import { logEvent } from "../lib/analytics";

export const socialRoutes = new Hono<{ Bindings: EnvBindings }>();

socialRoutes.get("/favorites", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
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
      personalityType: profiles.personalityType,
      identity: profiles.identity,
      avatarPreset: profiles.avatarPreset,
    })
    .from(favorites)
    .innerJoin(profiles, eq(favorites.targetProfileId, profiles.id))
    .where(eq(favorites.profileId, own.profileId))
    .orderBy(desc(favorites.createdAt));

  return c.json({ favorites: rows });
});

socialRoutes.post("/favorites/:targetProfileId", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
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
      and(
        eq(favorites.profileId, own.profileId),
        eq(favorites.targetProfileId, targetProfileId),
      ),
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

    await logEvent(c.env, {
      eventType: "profile_favorited",
      profileId: own.profileId,
      eventData: {
        targetProfileId,
      },
    });
  }

  return c.json({ ok: true });
});

socialRoutes.delete("/favorites/:targetProfileId", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
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

socialRoutes.get("/boosts/catalog", (c) => c.json({ boosts: boostCatalog }));

socialRoutes.post("/gifts/send", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  if (c.env.ENABLE_DEV_ENDPOINTS !== "true") {
    return c.json({ error: "Direct gift sending is disabled." }, 403);
  }

  return c.json(
    {
      error: "Direct gift sending is only available in local development.",
    },
    403,
  );
});

socialRoutes.post("/boosts/activate", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  if (c.env.ENABLE_DEV_ENDPOINTS !== "true") {
    return c.json({ error: "Direct boost activation is disabled." }, 403);
  }

  return c.json(
    {
      error: "Direct boost activation is only available in local development.",
    },
    403,
  );
});
