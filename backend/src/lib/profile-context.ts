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

export async function getOwnProfileContext(
  env: EnvBindings,
  cookieHeader: string | undefined,
): Promise<OwnProfileContext | null> {
  const userId = await getUserIdFromSession(env, cookieHeader);
  if (!userId) {
    return null;
  }

  const db = getDb(env);
  const [user] = await db
    .select({ createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [profile] = await db
    .select({ id: profiles.id, suspendedAt: profiles.suspendedAt })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!user || !profile || profile.suspendedAt) {
    return null;
  }

  return {
    userId,
    userCreatedAt: user.createdAt,
    profileId: profile.id,
  };
}
