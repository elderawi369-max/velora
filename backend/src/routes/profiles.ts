import { Hono } from "hono";
import { desc, eq, inArray, isNull } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import { gifts, profiles } from "../db/schema";
import { getUserIdFromSession } from "../lib/auth";
import { getOwnProfileContext } from "../lib/profile-context";
import { areProfilesBlocked, isFavorited } from "../lib/relationships";
import { profileSchema } from "../lib/validation";

export const profileRoutes = new Hono<{ Bindings: EnvBindings }>();

type GiftType = "rose" | "starlight" | "crown";

const giftDurationsMs: Record<GiftType, number> = {
  rose: 1000 * 60 * 60 * 24,
  starlight: 1000 * 60 * 60 * 48,
  crown: 1000 * 60 * 60 * 72,
};

const giftLabels: Record<GiftType, string> = {
  rose: "Rose Aura",
  starlight: "Starlight Ring",
  crown: "Velora Crown",
};

function getStrongerGiftType(current: GiftType | null, next: GiftType | null) {
  const priority: Record<GiftType, number> = {
    rose: 1,
    starlight: 2,
    crown: 3,
  };

  if (!next) {
    return current;
  }

  if (!current) {
    return next;
  }

  return priority[next] >= priority[current] ? next : current;
}

function getAvatarPresetForPersonality(personalityType: PersonalityType) {
  const avatarMap: Record<PersonalityType, string> = {
    "clingy / affectionate": "rose",
    "cold / mysterious": "luna",
    "flirty / teasing": "velvet",
    protective: "halo",
    "soft / sweet": "rose",
    intellectual: "echo",
    "funny / chaotic": "nova",
    "confident / dominant": "velvet",
    "emotionally distant": "luna",
    "roleplay / fantasy": "halo",
  };

  return avatarMap[personalityType];
}

async function getGiftEffects(env: EnvBindings, profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map<string, {
      dominantGiftType: GiftType | null;
      totalReceived: number;
      activeLabel: string | null;
      activeExpiresAt: number | null;
      remainingMs: number;
      activeCount: number;
    }>();
  }

  const db = getDb(env);
  const rows = await db
    .select({
      targetProfileId: gifts.targetProfileId,
      giftType: gifts.giftType,
      createdAt: gifts.createdAt,
    })
    .from(gifts)
    .where(inArray(gifts.targetProfileId, profileIds));

  const effects = new Map<string, {
    dominantGiftType: GiftType | null;
    totalReceived: number;
    activeLabel: string | null;
    activeExpiresAt: number | null;
    remainingMs: number;
    activeCount: number;
  }>();
  const now = Date.now();

  profileIds.forEach((profileId) => {
    effects.set(profileId, {
      dominantGiftType: null,
      totalReceived: 0,
      activeLabel: null,
      activeExpiresAt: null,
      remainingMs: 0,
      activeCount: 0,
    });
  });

  for (const row of rows) {
    const current = effects.get(row.targetProfileId);
    if (!current) {
      continue;
    }

    const nextTotal = current.totalReceived + 1;
    const normalizedType = (row.giftType === "rose" || row.giftType === "starlight" || row.giftType === "crown")
      ? (row.giftType as GiftType)
      : null;
    const expiresAt =
      normalizedType ? row.createdAt + giftDurationsMs[normalizedType] : 0;
    const isActive = normalizedType ? expiresAt > now : false;
    const nextDominantGiftType = isActive
      ? getStrongerGiftType(current.dominantGiftType, normalizedType)
      : current.dominantGiftType;
    const dominantChanged = nextDominantGiftType !== current.dominantGiftType;
    const shouldRefreshCurrentGift =
      isActive &&
      normalizedType !== null &&
      nextDominantGiftType === current.dominantGiftType &&
      normalizedType === current.dominantGiftType &&
      expiresAt > (current.activeExpiresAt ?? 0);

    effects.set(row.targetProfileId, {
      dominantGiftType: nextDominantGiftType,
      totalReceived: nextTotal,
      activeLabel:
        isActive && nextDominantGiftType
          ? dominantChanged
            ? giftLabels[nextDominantGiftType]
            : shouldRefreshCurrentGift
              ? giftLabels[nextDominantGiftType]
              : current.activeLabel ?? giftLabels[nextDominantGiftType]
          : current.activeLabel,
      activeExpiresAt:
        isActive && nextDominantGiftType
          ? dominantChanged
            ? expiresAt
            : shouldRefreshCurrentGift
              ? expiresAt
              : current.activeExpiresAt
          : current.activeExpiresAt,
      remainingMs:
        isActive && nextDominantGiftType
          ? dominantChanged
            ? Math.max(expiresAt - now, 0)
            : shouldRefreshCurrentGift
              ? Math.max(expiresAt - now, 0)
              : current.remainingMs
          : current.remainingMs,
      activeCount: isActive ? current.activeCount + 1 : current.activeCount,
    });
  }

  return effects;
}

async function getProfileById(env: EnvBindings, profileId: string) {
  const db = getDb(env);
  const [profile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
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

  const personalityType = normalizePersonalityType(profile.personalityType);
  const giftEffects = (await getGiftEffects(env, [profileId])).get(profileId) ?? {
    dominantGiftType: null,
    totalReceived: 0,
    activeLabel: null,
    activeExpiresAt: null,
    remainingMs: 0,
    activeCount: 0,
  };

  return {
    ...profile,
    personalityType,
    avatarPreset: getAvatarPresetForPersonality(personalityType),
    identity: normalizeIdentity(profile.identity),
    lookingFor: normalizeLookingFor(profile.lookingFor),
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
    isFavorited: false,
    recommended: false,
    compatibilityScore: 0,
    matchReasons: [] as string[],
    giftEffect: giftEffects,
  };
}

type PersonalityType =
  | "clingy / affectionate"
  | "cold / mysterious"
  | "flirty / teasing"
  | "protective"
  | "soft / sweet"
  | "intellectual"
  | "funny / chaotic"
  | "confident / dominant"
  | "emotionally distant"
  | "roleplay / fantasy";
type Identity = "woman" | "man" | "prefer not to say";
type LookingFor = "women" | "men" | "any";

function normalizePersonalityType(value: string): PersonalityType {
  const allowed = new Set<PersonalityType>([
    "clingy / affectionate",
    "cold / mysterious",
    "flirty / teasing",
    "protective",
    "soft / sweet",
    "intellectual",
    "funny / chaotic",
    "confident / dominant",
    "emotionally distant",
    "roleplay / fantasy",
  ]);

  return allowed.has(value as PersonalityType)
    ? (value as PersonalityType)
    : "soft / sweet";
}

function normalizeIdentity(value: string): Identity {
  if (value === "woman" || value === "man") {
    return value;
  }

  return "prefer not to say";
}

function normalizeLookingFor(value: string): LookingFor {
  if (value === "women" || value === "men") {
    return value;
  }

  return "any";
}

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

  return false;
}

function getPersonalityCompatibilityScore(
  ownPersonality: PersonalityType,
  targetPersonality: PersonalityType,
) {
  const strongPairs: Record<PersonalityType, PersonalityType[]> = {
    "clingy / affectionate": ["protective", "soft / sweet", "confident / dominant"],
    "cold / mysterious": ["flirty / teasing", "confident / dominant", "intellectual"],
    "flirty / teasing": ["cold / mysterious", "funny / chaotic", "confident / dominant"],
    protective: ["clingy / affectionate", "soft / sweet", "intellectual"],
    "soft / sweet": ["protective", "clingy / affectionate", "intellectual"],
    intellectual: ["intellectual", "soft / sweet", "cold / mysterious", "protective"],
    "funny / chaotic": ["flirty / teasing", "funny / chaotic", "roleplay / fantasy"],
    "confident / dominant": ["flirty / teasing", "cold / mysterious", "clingy / affectionate"],
    "emotionally distant": ["cold / mysterious", "intellectual"],
    "roleplay / fantasy": ["roleplay / fantasy", "funny / chaotic", "flirty / teasing"],
  };

  if (ownPersonality === targetPersonality) {
    return 2;
  }

  return strongPairs[ownPersonality].includes(targetPersonality) ? 3 : 0;
}

function countOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  return left.filter((item) => rightSet.has(item)).length;
}

function getCompatibilityScore(
  ownProfile:
    | {
        personalityType: PersonalityType;
        identity: Identity;
        lookingFor: LookingFor;
        vibeTags: string[];
        boundaries: string[];
      }
    | undefined,
  targetProfile: {
    personalityType: PersonalityType;
    identity: Identity;
    lookingFor: LookingFor;
    vibeTags: string[];
    boundaries: string[];
  },
) {
  if (!ownProfile) {
    return {
      total: 0,
      reasons: [] as string[],
    };
  }

  let score = 0;
  const reasons: string[] = [];
  if (identityMatchesPreference(targetProfile.identity, ownProfile.lookingFor)) {
    score += 2;
    reasons.push("Fits who you want to chat with");
  }

  if (identityMatchesPreference(ownProfile.identity, targetProfile.lookingFor)) {
    score += 1;
    reasons.push("You fit their chat preference too");
  }

  const personalityScore = getPersonalityCompatibilityScore(
    ownProfile.personalityType,
    targetProfile.personalityType,
  );
  score += personalityScore;
  if (personalityScore >= 3) {
    reasons.push("Strong personality chemistry");
  } else if (personalityScore >= 2) {
    reasons.push("Similar personality energy");
  }

  const sharedVibes = countOverlap(ownProfile.vibeTags, targetProfile.vibeTags);
  score += Math.min(sharedVibes, 3);
  if (sharedVibes >= 2) {
    reasons.push("Several shared vibe tags");
  } else if (sharedVibes === 1) {
    reasons.push("A shared vibe tag");
  }

  const sharedBoundaries = countOverlap(ownProfile.boundaries, targetProfile.boundaries);
  score += Math.min(sharedBoundaries, 2);
  if (sharedBoundaries >= 2) {
    reasons.push("Very compatible chat preferences");
  } else if (sharedBoundaries === 1) {
    reasons.push("A shared chat preference");
  }

  return {
    total: score,
    reasons: Array.from(new Set(reasons)).slice(0, 3),
  };
}

profileRoutes.get("/", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  const db = getDb(c.env);
  const results = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
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
  const giftEffects = await getGiftEffects(
    c.env,
    visibleProfiles.map((profile) => profile.id),
  );
  const ownProfile = own
    ? visibleProfiles.find((profile) => profile.id === own.profileId)
    : undefined;
  const fallbackOwnProfile =
    own && !ownProfile
      ? (
          await db
            .select({
              personalityType: profiles.personalityType,
              identity: profiles.identity,
              lookingFor: profiles.lookingFor,
              vibeTags: profiles.vibeTags,
              boundaries: profiles.boundaries,
            })
            .from(profiles)
            .where(eq(profiles.id, own.profileId))
            .limit(1)
        )[0]
      : undefined;

  const currentProfile = fallbackOwnProfile
    ? {
        personalityType: normalizePersonalityType(fallbackOwnProfile.personalityType),
        identity: normalizeIdentity(fallbackOwnProfile.identity),
        lookingFor: normalizeLookingFor(fallbackOwnProfile.lookingFor),
        vibeTags: JSON.parse(fallbackOwnProfile.vibeTags) as string[],
        boundaries: JSON.parse(fallbackOwnProfile.boundaries) as string[],
      }
    : undefined;

  const normalized = await Promise.all(
    visibleProfiles.map(async (profile) => {
      if (own && (await areProfilesBlocked(c.env, own.profileId, profile.id))) {
        return null;
      }

      const personalityType = normalizePersonalityType(profile.personalityType);
      const compatibility = getCompatibilityScore(currentProfile, {
        personalityType,
        identity: normalizeIdentity(profile.identity),
        lookingFor: normalizeLookingFor(profile.lookingFor),
        vibeTags: JSON.parse(profile.vibeTags) as string[],
        boundaries: JSON.parse(profile.boundaries) as string[],
      });

      return {
        ...profile,
        personalityType,
        avatarPreset: getAvatarPresetForPersonality(personalityType),
        identity: normalizeIdentity(profile.identity),
        lookingFor: normalizeLookingFor(profile.lookingFor),
        promptEntries: JSON.parse(profile.promptEntries) as Array<{
          question: string;
          answer: string;
        }>,
        vibeTags: JSON.parse(profile.vibeTags) as string[],
        boundaries: JSON.parse(profile.boundaries) as string[],
        isFavorited: own ? await isFavorited(c.env, own.profileId, profile.id) : false,
        recommended: compatibility.total >= 5,
        compatibilityScore: compatibility.total,
        matchReasons: compatibility.reasons,
        trustSignals: [
          profile.bio.length >= 40 ? "Complete profile" : null,
          Date.now() - profile.createdAt >= 1000 * 60 * 60 * 24
            ? "Established profile"
            : null,
          JSON.parse(profile.promptEntries).length >= 2 ? "Prompt-rich profile" : null,
        ].filter(Boolean),
        giftEffect: giftEffects.get(profile.id) ?? {
          dominantGiftType: null,
          totalReceived: 0,
          activeLabel: null,
          activeExpiresAt: null,
          remainingMs: 0,
          activeCount: 0,
        },
      };
    }),
  );
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
    personalityType: payload.data.personalityType,
    identity: payload.data.identity,
    lookingFor: payload.data.lookingFor,
    bio: payload.data.bio,
    promptEntries: JSON.stringify(payload.data.promptEntries),
    avatarPreset: getAvatarPresetForPersonality(payload.data.personalityType),
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
      isFavorited: false,
      recommended: false,
      compatibilityScore: 0,
      matchReasons: [],
      giftEffect: {
        dominantGiftType: null,
        totalReceived: 0,
        activeLabel: null,
        activeExpiresAt: null,
        remainingMs: 0,
        activeCount: 0,
      },
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
      personalityType: payload.data.personalityType,
      identity: payload.data.identity,
      lookingFor: payload.data.lookingFor,
      bio: payload.data.bio,
      promptEntries: JSON.stringify(payload.data.promptEntries),
      avatarPreset: getAvatarPresetForPersonality(payload.data.personalityType),
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
      isFavorited: false,
      recommended: false,
      compatibilityScore: 0,
      matchReasons: [],
      giftEffect: (await getGiftEffects(c.env, [existingProfile.id])).get(existingProfile.id) ?? {
        dominantGiftType: null,
        totalReceived: 0,
        activeLabel: null,
        activeExpiresAt: null,
        remainingMs: 0,
        activeCount: 0,
      },
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
