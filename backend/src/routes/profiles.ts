import { Hono } from "hono";
import { desc, eq, isNull } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import { profiles } from "../db/schema";
import { getUserIdFromSession } from "../lib/auth";
import { getOwnProfileContext } from "../lib/profile-context";
import { isFavorited } from "../lib/relationships";
import { profileSchema } from "../lib/validation";

export const profileRoutes = new Hono<{ Bindings: EnvBindings }>();

profileRoutes.get("/", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  const db = getDb(c.env);
  const results = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      avatarPreset: profiles.avatarPreset,
      vibeTags: profiles.vibeTags,
      boundaries: profiles.boundaries,
      suspendedAt: profiles.suspendedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(isNull(profiles.suspendedAt))
    .orderBy(desc(profiles.createdAt))
    .limit(50);

  return c.json({
    profiles: await Promise.all(
      results.map(async (profile) => ({
        ...profile,
        vibeTags: JSON.parse(profile.vibeTags) as string[],
        boundaries: JSON.parse(profile.boundaries) as string[],
        isFavorited: own ? await isFavorited(c.env, own.profileId, profile.id) : false,
      })),
    ),
  });
});

profileRoutes.post("/", async (c) => {
  const userId = await getUserIdFromSession(c.env, c.req.header("Cookie"));
  if (!userId) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = profileSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid profile payload." }, 400);
  }

  const db = getDb(c.env);
  const [existingProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (existingProfile) {
    return c.json({ error: "Profile already exists for this user." }, 409);
  }

  const [usernameTaken] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, payload.data.username))
    .limit(1);

  if (usernameTaken) {
    return c.json({ error: "That username is already taken." }, 409);
  }

  const now = Date.now();
  const profileId = crypto.randomUUID();

  await db.insert(profiles).values({
    id: profileId,
    userId,
    username: payload.data.username,
    displayName: payload.data.displayName,
    bio: payload.data.bio,
        avatarPreset: payload.data.avatarPreset,
        vibeTags: JSON.stringify(payload.data.vibeTags),
        boundaries: JSON.stringify(payload.data.boundaries),
        suspendedAt: null,
        createdAt: now,
        updatedAt: now,
      });

  return c.json({
    profile: {
      id: profileId,
      ...payload.data,
    },
  }, 201);
});

profileRoutes.get("/:username", async (c) => {
  const db = getDb(c.env);
  const [profile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      avatarPreset: profiles.avatarPreset,
      vibeTags: profiles.vibeTags,
      boundaries: profiles.boundaries,
      suspendedAt: profiles.suspendedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.username, c.req.param("username")))
    .limit(1);

  if (!profile) {
    return c.json({ error: "Profile not found." }, 404);
  }

  if (profile.suspendedAt) {
    return c.json({ error: "Profile not found." }, 404);
  }

  return c.json({
    profile: {
      ...profile,
      vibeTags: JSON.parse(profile.vibeTags) as string[],
      boundaries: JSON.parse(profile.boundaries) as string[],
    },
  });
});
