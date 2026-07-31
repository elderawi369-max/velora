import { and, eq, isNull, or, sql } from "drizzle-orm";
import { conversations, messages, notifications, profiles } from "../db/schema";
import { getDb, type EnvBindings } from "./db";

export async function getUnreadBadgeCountForProfile(
  env: EnvBindings,
  profileId: string,
) {
  const db = getDb(env);
  const conversationRows = await db
    .select({
      id: conversations.id,
      profileAId: conversations.profileAId,
      profileBId: conversations.profileBId,
      lastReadAtA: conversations.lastReadAtA,
      lastReadAtB: conversations.lastReadAtB,
    })
    .from(conversations)
    .where(
      or(
        and(eq(conversations.profileAId, profileId), isNull(conversations.hiddenAtA)),
        and(eq(conversations.profileBId, profileId), isNull(conversations.hiddenAtB)),
      ),
    );

  let unreadConversationMessageCount = 0;

  for (const conversation of conversationRows) {
    const otherProfileId =
      conversation.profileAId === profileId
        ? conversation.profileBId
        : conversation.profileAId;
    const ownLastReadAt =
      conversation.profileAId === profileId
        ? conversation.lastReadAtA
        : conversation.lastReadAtB;

    const [messageCountRow] = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversation.id),
          eq(messages.senderProfileId, otherProfileId),
          sql`${messages.createdAt} > ${ownLastReadAt}`,
        ),
      );

    unreadConversationMessageCount += Number(messageCountRow?.count ?? 0);
  }

  const [notificationCountRow] = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(notifications)
    .where(and(eq(notifications.profileId, profileId), isNull(notifications.readAt)));

  return unreadConversationMessageCount + Number(notificationCountRow?.count ?? 0);
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
