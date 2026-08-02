import { and, eq, gt, isNotNull, sql } from "drizzle-orm";
import {
  liveTriviaMatches,
  notifications,
  profiles,
  starterCreditGrants,
  users,
  challengeSessions,
} from "../db/schema";
import type { EnvBindings } from "./db";
import { getDb } from "./db";
import { logEvent } from "./analytics";
import { createNotification } from "./commerce";

export const starterCreditAmount = 2;
export const starterCreditAccountAgeMs = 1000 * 60 * 60 * 48;
export const starterCreditInstallCooldownMs = 1000 * 60 * 60 * 24;
export const starterCreditIpCooldownMs = 1000 * 60 * 60 * 24;
export const newAccountPendingChallengeWindowMs = 1000 * 60 * 60 * 24;
export const newAccountPendingChallengeLimit = 2;

type StarterCreditGrant = {
  credits: number;
  grantedAt: number;
};

export function readInstallId(value: string | undefined) {
  const installId = value?.trim() ?? "";
  return /^[a-z0-9-]{16,128}$/i.test(installId) ? installId : null;
}

export function readClientIp(value: string | undefined) {
  const ip = value?.trim() ?? "";
  return ip.length > 0 && ip.length <= 128 ? ip : null;
}

export function hasStarterCreditEligibleCoreProfile(input: {
  username: string;
  displayName: string;
  personalityType: string;
  identity: string;
  lookingFor: string;
  bio: string;
  avatarPreset: string;
}) {
  return (
    input.username.trim().length >= 3 &&
    input.displayName.trim().length >= 2 &&
    input.personalityType.trim().length >= 1 &&
    input.identity.trim().length >= 1 &&
    input.lookingFor.trim().length >= 1 &&
    input.bio.trim().length >= 10 &&
    input.avatarPreset.trim().length >= 1
  );
}

async function hasRecentStarterCreditGrantForInstall(
  env: EnvBindings,
  installId: string,
  cutoff: number,
) {
  const db = getDb(env);
  const [row] = await db
    .select({ id: starterCreditGrants.id })
    .from(starterCreditGrants)
    .where(
      and(
        eq(starterCreditGrants.installId, installId),
        gt(starterCreditGrants.grantedAt, cutoff),
      ),
    )
    .limit(1);

  return Boolean(row);
}

async function hasRecentStarterCreditGrantForIp(
  env: EnvBindings,
  ip: string,
  cutoff: number,
) {
  const db = getDb(env);
  const [row] = await db
    .select({ id: starterCreditGrants.id })
    .from(starterCreditGrants)
    .where(
      and(
        eq(starterCreditGrants.ipAddress, ip),
        gt(starterCreditGrants.grantedAt, cutoff),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function maybeGrantStarterCredits(
  env: EnvBindings,
  input: {
    userId: string;
    installId: string | null;
    ip: string | null;
  },
) {
  const db = getDb(env);
  const [row] = await db
    .select({
      userId: users.id,
      userCreatedAt: users.createdAt,
      profileId: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
      identity: profiles.identity,
      lookingFor: profiles.lookingFor,
      bio: profiles.bio,
      avatarPreset: profiles.avatarPreset,
      starterCreditsGrantedAt: profiles.starterCreditsGrantedAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, input.userId))
    .limit(1);

  if (
    !row?.profileId ||
    row.starterCreditsGrantedAt ||
    row.username == null ||
    row.displayName == null ||
    row.personalityType == null ||
    row.identity == null ||
    row.lookingFor == null ||
    row.bio == null ||
    row.avatarPreset == null
  ) {
    return null;
  }

  const now = Date.now();
  if (now - row.userCreatedAt < starterCreditAccountAgeMs) {
    return null;
  }

  if (
    !hasStarterCreditEligibleCoreProfile({
      username: row.username,
      displayName: row.displayName,
      personalityType: row.personalityType,
      identity: row.identity,
      lookingFor: row.lookingFor,
      bio: row.bio,
      avatarPreset: row.avatarPreset,
    })
  ) {
    return null;
  }

  if (input.installId) {
    const blockedByInstall = await hasRecentStarterCreditGrantForInstall(
      env,
      input.installId,
      now - starterCreditInstallCooldownMs,
    );
    if (blockedByInstall) {
      return null;
    }
  }

  if (input.ip) {
    const blockedByIp = await hasRecentStarterCreditGrantForIp(
      env,
      input.ip,
      now - starterCreditIpCooldownMs,
    );
    if (blockedByIp) {
      return null;
    }
  }

  const updateResult = await env.DB.prepare(
    `
      UPDATE profiles
      SET challenge_credits = challenge_credits + ?, starter_credits_granted_at = ?, updated_at = ?
      WHERE id = ? AND starter_credits_granted_at IS NULL
    `,
  )
    .bind(starterCreditAmount, now, now, row.profileId)
    .run();

  if (!updateResult.meta.changes) {
    return null;
  }

  await db.insert(starterCreditGrants).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    profileId: row.profileId,
    installId: input.installId,
    ipAddress: input.ip,
    grantedAt: now,
  });

  await logEvent(env, {
    eventType: "starter_credits_granted",
    userId: input.userId,
    profileId: row.profileId,
    eventData: {
      credits: starterCreditAmount,
      installId: input.installId,
      ip: input.ip,
    },
  });

  await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.profileId, row.profileId),
        eq(notifications.actorProfileId, row.profileId),
        eq(notifications.type, "starter_credit_reward"),
        isNotNull(notifications.readAt),
      ),
    );

  await createNotification(env, {
    profileId: row.profileId,
    actorProfileId: row.profileId,
    type: "starter_credit_reward",
  });

  return {
      profileId: row.profileId,
      grant: {
        credits: starterCreditAmount,
        grantedAt: now,
      } satisfies StarterCreditGrant,
  };
}

export async function getPendingOutgoingChallengeCount(
  env: EnvBindings,
  profileId: string,
) {
  const db = getDb(env);
  const [challengePendingRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(challengeSessions)
    .where(
      and(
        eq(challengeSessions.senderProfileId, profileId),
        eq(challengeSessions.status, "pending"),
      ),
    );

  const [livePendingRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(liveTriviaMatches)
    .where(
      and(
        eq(liveTriviaMatches.playerAId, profileId),
        eq(liveTriviaMatches.status, "pending"),
      ),
    );

  const challengePendingCount = Number(challengePendingRow?.count ?? 0);
  const livePendingCount = Number(livePendingRow?.count ?? 0);
  return challengePendingCount + livePendingCount;
}

export async function isNewAccountWithinChallengeLimitWindow(
  env: EnvBindings,
  profileId: string,
) {
  const db = getDb(env);
  const [row] = await db
    .select({ userCreatedAt: users.createdAt })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!row) {
    return false;
  }

  return Date.now() - row.userCreatedAt < newAccountPendingChallengeWindowMs;
}
