import { Hono } from "hono";
import { and, desc, eq } from "drizzle-orm";
import { notifications, profiles } from "../db/schema";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";

export const notificationRoutes = new Hono<{ Bindings: EnvBindings }>();

notificationRoutes.get("/", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const rows = await db
    .select({
      id: notifications.id,
      type: notifications.type,
      giftType: notifications.giftType,
      challengeSessionId: notifications.challengeSessionId,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      actorProfileId: notifications.actorProfileId,
      actorUsername: profiles.username,
      actorDisplayName: profiles.displayName,
      actorPersonalityType: profiles.personalityType,
      actorIdentity: profiles.identity,
      actorAvatarPreset: profiles.avatarPreset,
    })
    .from(notifications)
    .innerJoin(profiles, eq(notifications.actorProfileId, profiles.id))
    .where(eq(notifications.profileId, own.profileId))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  return c.json({
    notifications: rows.map((row) => ({
      id: row.id,
      type: row.type,
      giftType: row.giftType,
      challengeSessionId: row.challengeSessionId,
      readAt: row.readAt,
      createdAt: row.createdAt,
      actorProfile: {
        id: row.actorProfileId,
        username: row.actorUsername,
        displayName: row.actorDisplayName,
        personalityType: row.actorPersonalityType,
        identity: row.actorIdentity,
        avatarPreset: row.actorAvatarPreset,
      },
    })),
  });
});

notificationRoutes.post("/:notificationId/read", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(
      and(
        eq(notifications.id, c.req.param("notificationId")),
        eq(notifications.profileId, own.profileId),
      ),
    );

  return c.json({ ok: true });
});

notificationRoutes.post("/read-all", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  await db
    .update(notifications)
    .set({ readAt: Date.now() })
    .where(eq(notifications.profileId, own.profileId));

  return c.json({ ok: true });
});
