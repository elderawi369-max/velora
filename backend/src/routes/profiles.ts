import { Hono } from "hono";
import { desc, eq, isNull } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import { profiles } from "../db/schema";
import { getUserIdFromSession } from "../lib/auth";
import { getOwnProfileContext } from "../lib/profile-context";
import { areProfilesBlocked, isFavorited } from "../lib/relationships";
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
      promptEntries: profiles.promptEntries,
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
    promptEntries: JSON.parse(profile.promptEntries) as Array<{
      question: string;
      answer: string;
    }>,
    vibeTags: JSON.parse(profile.vibeTags) as string[],
    boundaries: JSON.parse(profile.boundaries) as string[],
    trustSignals: [
      profile.bio.length >= 40 ? "Complete profile" : null,
      Date.now() - profile.createdAt >= 1000 * 60 * 60 * 24 ? "Established profile" : null,
      JSON.parse(profile.promptEntries).length >= 2 ? "Prompt-rich profile" : null,
    ].filter(Boolean),
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
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  const db = getDb(c.env);
  const results = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      identity: profiles.identity,
      lookingFor: profiles.lookingFor,
      bio: profiles.bio,
      promptEntries: profiles.promptEntries,
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
      if (own && (await areProfilesBlocked(c.env, own.profileId, profile.id))) {
        return null;
      }

      const compatibilityScore = getCompatibilityScore(currentProfile, {
        identity: profile.identity as Identity,
        lookingFor: profile.lookingFor as LookingFor,
      });

      return {
        ...profile,
        promptEntries: JSON.parse(profile.promptEntries) as Array<{
          question: string;
          answer: string;
        }>,
        vibeTags: JSON.parse(profile.vibeTags) as string[],
        boundaries: JSON.parse(profile.boundaries) as string[],
        isFavorited: own ? await isFavorited(c.env, own.profileId, profile.id) : false,
        recommended: compatibilityScore > 0,
        compatibilityScore,
        trustSignals: [
          profile.bio.length >= 40 ? "Complete profile" : null,
          Date.now() - profile.createdAt >= 1000 * 60 * 60 * 24
            ? "Established profile"
            : null,
          JSON.parse(profile.promptEntries).length >= 2 ? "Prompt-rich profile" : null,
        ].filter(Boolean),
      };
    }),
  );
  const filteredNormalized = normalized.filter(Boolean);
  const rankedProfiles = normalized.filter(
    (
      profile,
    ): profile is NonNullable<(typeof normalized)[number]> => profile !== null,
  );

  rankedProfiles.sort((left, right) => {
    if (right.compatibilityScore !== left.compatibilityScore) {
      return right.compatibilityScore - left.compatibilityScore;
    }

    return right.createdAt - left.createdAt;
  });

  return c.json({
    profiles: rankedProfiles,
  });
});

profileRoutes.get("/me", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ profile: null });
  }

  const profile = await getProfileById(c.env, own.profileId);
  return c.json({ profile });
});

profileRoutes.post("/", async (c) => {
  const userId = await getUserIdFromSession(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
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
    promptEntries: JSON.stringify(payload.data.promptEntries),
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
      trustSignals: payload.data.bio.length >= 40 ? ["Complete profile"] : [],
    },
  }, 201);
});

profileRoutes.put("/me", async (c) => {
  const userId = await getUserIdFromSession(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!userId) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = profileSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid profile payload." }, 400);
  }

  const db = getDb(c.env);
  const [existingProfile] = await db
    .select({ id: profiles.id, username: profiles.username })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!existingProfile) {
    return c.json({ error: "Profile not found." }, 404);
  }

  const [usernameTaken] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, payload.data.username))
    .limit(1);

  if (usernameTaken && usernameTaken.id !== existingProfile.id) {
    return c.json({ error: "That username is already taken." }, 409);
  }

  await db
    .update(profiles)
    .set({
      username: payload.data.username,
      displayName: payload.data.displayName,
      identity: payload.data.identity,
      lookingFor: payload.data.lookingFor,
      bio: payload.data.bio,
      promptEntries: JSON.stringify(payload.data.promptEntries),
      avatarPreset: payload.data.avatarPreset,
      vibeTags: JSON.stringify(payload.data.vibeTags),
      boundaries: JSON.stringify(payload.data.boundaries),
      updatedAt: Date.now(),
    })
    .where(eq(profiles.id, existingProfile.id));

  return c.json({
    profile: {
      id: existingProfile.id,
      ...payload.data,
      trustSignals: [
        payload.data.bio.length >= 40 ? "Complete profile" : null,
        payload.data.promptEntries.length >= 2 ? "Prompt-rich profile" : null,
      ].filter(Boolean),
    },
  });
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
