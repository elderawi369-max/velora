import { eq } from "drizzle-orm";
import { profiles, users } from "../db/schema";
import { getUserIdFromSession } from "./auth";
import type { EnvBindings } from "./db";
import { getDb } from "./db";

export type OwnProfileContext = {
  userId: string;
  userCreatedAt: number;
  profileId: string;
};

export type AccountContext = {
  userId: string;
  userCreatedAt: number;
  profileId: string | null;
};

export async function getAccountContext(
  env: EnvBindings,
  cookieHeader: string | undefined,
  authorizationHeader?: string | undefined,
): Promise<AccountContext | null> {
  const userId = await getUserIdFromSession(env, cookieHeader, authorizationHeader);
  if (!userId) return null;

  const db = getDb(env);
  const [user] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return null;

  const [profile] = await db
    .select({ id: profiles.id, suspendedAt: profiles.suspendedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  if (profile?.suspendedAt) return null;

  return {
    userId,
    userCreatedAt: user.createdAt,
    profileId: profile?.id ?? null,
  };
}

export async function getOwnProfileContext(
  env: EnvBindings,
  cookieHeader: string | undefined,
  authorizationHeader?: string | undefined,
): Promise<OwnProfileContext | null> {
  const account = await getAccountContext(env, cookieHeader, authorizationHeader);
  if (!account?.profileId) return null;

  return {
    userId: account.userId,
    userCreatedAt: account.userCreatedAt,
    profileId: account.profileId,
  };
}
