import { and, eq, isNull, or, sql } from "drizzle-orm";
import { conversations, messages, notifications, profiles } from "../db/schema";
import { getDb, type EnvBindings } from "./db";

export async function getUnreadBadgeCountForProfile(
  env: EnvBindings,
  profileId: string,
) {
  const db = getDb(env);

  const [conversationCountRow] = await db
    .select({
      count: sql<number>`COALESCE(SUM((
        SELECT COUNT(*)
        FROM ${messages} AS unread_messages
        WHERE unread_messages.${messages.conversationId.name} = ${conversations.id}
          AND unread_messages.${messages.senderProfileId.name} = CASE
            WHEN ${conversations.profileAId} = ${profileId} THEN ${conversations.profileBId}
            ELSE ${conversations.profileAId}
          END
          AND unread_messages.${messages.createdAt.name} > CASE
            WHEN ${conversations.profileAId} = ${profileId} THEN ${conversations.lastReadAtA}
            ELSE ${conversations.lastReadAtB}
          END
      )), 0)`,
    })
    .from(conversations)
    .where(
      or(
        and(eq(conversations.profileAId, profileId), isNull(conversations.hiddenAtA)),
        and(eq(conversations.profileBId, profileId), isNull(conversations.hiddenAtB)),
      ),
    );

  const [notificationCountRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(notifications)
    .where(and(eq(notifications.profileId, profileId), isNull(notifications.readAt)));

  return Number(conversationCountRow?.count ?? 0) + Number(notificationCountRow?.count ?? 0);
}

export async function getUnreadBadgeCountForUser(
  env: EnvBindings,
  userId: string,
) {
  const db = getDb(env);
  const [profileRow] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  if (!profileRow) {
    return 0;
  }

  return getUnreadBadgeCountForProfile(env, profileRow.id);
}
