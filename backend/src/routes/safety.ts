import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { blocks, profiles, reports } from "../db/schema";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";

export const safetyRoutes = new Hono<{ Bindings: EnvBindings }>();

safetyRoutes.get("/blocks", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const rows = await db
    .select({
      id: blocks.id,
      targetProfileId: blocks.targetProfileId,
      createdAt: blocks.createdAt,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
      identity: profiles.identity,
      avatarPreset: profiles.avatarPreset,
    })
    .from(blocks)
    .innerJoin(profiles, eq(blocks.targetProfileId, profiles.id))
    .where(eq(blocks.profileId, own.profileId));

  return c.json({ blocks: rows });
});

safetyRoutes.post("/blocks", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const body = (await c.req.json()) as { targetProfileId?: string };
  if (!body.targetProfileId) {
    return c.json({ error: "targetProfileId is required." }, 400);
  }

  if (body.targetProfileId === own.profileId) {
    return c.json({ error: "You cannot block yourself." }, 400);
  }

  const db = getDb(c.env);
  const [existing] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(and(eq(blocks.profileId, own.profileId), eq(blocks.targetProfileId, body.targetProfileId)))
    .limit(1);

  if (!existing) {
    await db.insert(blocks).values({
      id: crypto.randomUUID(),
      profileId: own.profileId,
      targetProfileId: body.targetProfileId,
      createdAt: Date.now(),
    });
  }

  return c.json({ ok: true });
});

safetyRoutes.delete("/blocks/:targetProfileId", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  await getDb(c.env)
    .delete(blocks)
    .where(
      and(
        eq(blocks.profileId, own.profileId),
        eq(blocks.targetProfileId, c.req.param("targetProfileId")),
      ),
    );

  return c.json({ ok: true });
});

safetyRoutes.post("/reports", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const body = (await c.req.json()) as {
    targetProfileId?: string;
    conversationId?: string;
    reason?: string;
    details?: string;
  };

  if (!body.targetProfileId || !body.reason) {
    return c.json({ error: "targetProfileId and reason are required." }, 400);
  }

  await getDb(c.env).insert(reports).values({
    id: crypto.randomUUID(),
    reporterProfileId: own.profileId,
    targetProfileId: body.targetProfileId,
    conversationId: body.conversationId ?? null,
    reason: body.reason,
    details: body.details?.trim() ?? "",
    createdAt: Date.now(),
  });

  return c.json({ ok: true });
});
