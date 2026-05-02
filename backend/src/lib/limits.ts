import { and, eq, gte, or, sql } from "drizzle-orm";
import { conversations, messages } from "../db/schema";
import type { OwnProfileContext } from "./profile-context";
import { getDb, type EnvBindings } from "./db";

const NEW_ACCOUNT_WINDOW_MS = 1000 * 60 * 60 * 24 * 3;
const MAX_NEW_ACCOUNT_CONVERSATIONS_PER_DAY = 10;
const MAX_NEW_ACCOUNT_MESSAGES_PER_DAY = 30;

export async function enforceConversationStartLimit(
  env: EnvBindings,
  ownProfile: OwnProfileContext,
) {
  if (Date.now() - ownProfile.userCreatedAt > NEW_ACCOUNT_WINDOW_MS) {
    return;
  }

  const since = Date.now() - 1000 * 60 * 60 * 24;
  const db = getDb(env);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(
      and(
        or(
          eq(conversations.profileAId, ownProfile.profileId),
          eq(conversations.profileBId, ownProfile.profileId),
        ),
        gte(conversations.createdAt, since),
      ),
    );

  if ((row?.count ?? 0) >= MAX_NEW_ACCOUNT_CONVERSATIONS_PER_DAY) {
    throw new Error("New accounts can only start 10 conversations per day.");
  }
}

export async function enforceMessageLimit(
  env: EnvBindings,
  ownProfile: OwnProfileContext,
) {
  if (Date.now() - ownProfile.userCreatedAt > NEW_ACCOUNT_WINDOW_MS) {
    return;
  }

  const since = Date.now() - 1000 * 60 * 60 * 24;
  const db = getDb(env);
  const [row] = await db
    .select({ count: sql<number>`count(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.senderProfileId, ownProfile.profileId),
        gte(messages.createdAt, since),
      ),
    );

  if ((row?.count ?? 0) >= MAX_NEW_ACCOUNT_MESSAGES_PER_DAY) {
    throw new Error("New accounts can only send 30 messages per day.");
  }
}

