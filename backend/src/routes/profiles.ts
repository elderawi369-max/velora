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

async function getProfileById(env: EnvBindings, profileId: string) {
  const db = getDb(env);
  const [profile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      identity: profiles.identity,
      lookingFor: profiles.lookingFor,
      bio: profiles.bio,
      avatarPreset: profiles.avatarPreset,
      vibeTags: profiles.vibeTags,
      boundaries: profiles.boundaries,
      suspendedAt: profiles.suspendedAt,
      createdAt: profiles.createdAt,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!profile || profile.suspendedAt) {
    return null;
  }

  return {
    ...profile,
    vibeTags: JSON.parse(profile.vibeTags) as string[],
    boundaries: JSON.parse(profile.boundaries) as string[],
  };
}

type Identity = "woman" | "man" | "non-binary" | "prefer not to say";
type LookingFor = "women" | "men" | "non-binary people" | "any";

function identityMatchesPreference(identity: Identity, lookingFor: LookingFor) {
  if (lookingFor === "any") {
    return true;
  }

  if (lookingFor === "women") {
    return identity === "woman";
  }

  if (lookingFor === "men") {
    return identity === "man";
  }

  return identity === "non-binary";
}

function getCompatibilityScore(
  ownProfile:
    | {
        identity: Identity;
        lookingFor: LookingFor;
      }
    | undefined,
  targetProfile: {
    identity: Identity;
    lookingFor: LookingFor;
  },
) {
  if (!ownProfile) {
    return 0;
  }

  let score = 0;
  if (identityMatchesPreference(targetProfile.identity, ownProfile.lookingFor)) {
    score += 2;
  }

  if (identityMatchesPreference(ownProfile.identity, targetProfile.lookingFor)) {
    score += 1;
  }

  return score;
}

profileRoutes.get("/", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  const db = getDb(c.env);
  const results = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      identity: profiles.identity,
      lookingFor: profiles.lookingFor,
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

  const visibleProfiles = results.filter((profile) => profile.id !== own?.profileId);
  const ownProfile = own
    ? visibleProfiles.find((profile) => profile.id === own.profileId)
    : undefined;
  const fallbackOwnProfile =
    own && !ownProfile
      ? (
          await db
            .select({
              identity: profiles.identity,
              lookingFor: profiles.lookingFor,
            })
            .from(profiles)
            .where(eq(profiles.id, own.profileId))
            .limit(1)
        )[0]
      : undefined;

  const currentProfile = fallbackOwnProfile
    ? {
        identity: fallbackOwnProfile.identity as Identity,
        lookingFor: fallbackOwnProfile.lookingFor as LookingFor,
      }
    : undefined;

  const normalized = await Promise.all(
    visibleProfiles.map(async (profile) => {
      const compatibilityScore = getCompatibilityScore(currentProfile, {
        identity: profile.identity as Identity,
        lookingFor: profile.lookingFor as LookingFor,
      });

      return {
        ...profile,
        vibeTags: JSON.parse(profile.vibeTags) as string[],
        boundaries: JSON.parse(profile.boundaries) as string[],
        isFavorited: own ? await isFavorited(c.env, own.profileId, profile.id) : false,
        recommended: compatibilityScore > 0,
        compatibilityScore,
      };
    }),
  );

  normalized.sort((left, right) => {
    if (right.compatibilityScore !== left.compatibilityScore) {
      return right.compatibilityScore - left.compatibilityScore;
    }

    return right.createdAt - left.createdAt;
  });

  return c.json({
    profiles: normalized,
  });
});

profileRoutes.get("/me", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  if (!own) {
    return c.json({ profile: null });
  }

  const profile = await getProfileById(c.env, own.profileId);
  return c.json({ profile });
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
    identity: payload.data.identity,
    lookingFor: payload.data.lookingFor,
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
  const [match] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, c.req.param("username")))
    .limit(1);

  if (!match) {
    return c.json({ error: "Profile not found." }, 404);
  }

  const profile = await getProfileById(c.env, match.id);
  if (!profile) {
    return c.json({ error: "Profile not found." }, 404);
  }

  return c.json({ profile });
});
