import { Hono } from "hono";
import { and, asc, desc, eq, or, sql } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import { conversations, messages, profiles } from "../db/schema";
import { enforceConversationStartLimit, enforceMessageLimit } from "../lib/limits";
import { containsBlockedContactInfo } from "../lib/moderation";
import { getOwnProfileContext } from "../lib/profile-context";
import { areProfilesBlocked, isFavorited } from "../lib/relationships";
import { logEvent } from "../lib/analytics";
import { sendPushToUser } from "../lib/push";

export const chatRoutes = new Hono<{ Bindings: EnvBindings }>();

function getOtherReadAt(conversation: typeof conversations.$inferSelect, ownProfileId: string) {
  return conversation.profileAId === ownProfileId
    ? conversation.lastReadAtB
    : conversation.lastReadAtA;
}

function getOwnReadAt(conversation: typeof conversations.$inferSelect, ownProfileId: string) {
  return conversation.profileAId === ownProfileId
    ? conversation.lastReadAtA
    : conversation.lastReadAtB;
}

function getOwnHiddenAt(
  conversation: typeof conversations.$inferSelect,
  ownProfileId: string,
) {
  return conversation.profileAId === ownProfileId
    ? conversation.hiddenAtA
    : conversation.hiddenAtB;
}

function readStatePatch(
  conversation: typeof conversations.$inferSelect,
  ownProfileId: string,
  timestamp: number,
) {
  return conversation.profileAId === ownProfileId
    ? { lastReadAtA: timestamp }
    : { lastReadAtB: timestamp };
}

function hideStatePatch(
  conversation: typeof conversations.$inferSelect,
  ownProfileId: string,
  timestamp: number,
) {
  return conversation.profileAId === ownProfileId
    ? { hiddenAtA: timestamp }
    : { hiddenAtB: timestamp };
}

function clearHiddenStatePatch(
  conversation: typeof conversations.$inferSelect,
  ownProfileId: string,
) {
  return conversation.profileAId === ownProfileId
    ? { hiddenAtA: null }
    : { hiddenAtB: null };
}

function clearHiddenForBothPatch(conversation: typeof conversations.$inferSelect) {
  return {
    ...clearHiddenStatePatch(conversation, conversation.profileAId),
    ...clearHiddenStatePatch(conversation, conversation.profileBId),
  };
}

chatRoutes.get("/conversations", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(conversations)
    .where(
      or(
        and(
          eq(conversations.profileAId, own.profileId),
          sql`${conversations.hiddenAtA} IS NULL`,
        ),
        and(
          eq(conversations.profileBId, own.profileId),
          sql`${conversations.hiddenAtB} IS NULL`,
        ),
      ),
    )
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  const items = await Promise.all(
    rows.map(async (conversation) => {
      const otherProfileId =
        conversation.profileAId === own.profileId
          ? conversation.profileBId
          : conversation.profileAId;

      const [otherProfile] = await db
        .select({
          id: profiles.id,
          username: profiles.username,
          displayName: profiles.displayName,
          personalityType: profiles.personalityType,
          identity: profiles.identity,
          avatarPreset: profiles.avatarPreset,
        })
        .from(profiles)
        .where(eq(profiles.id, otherProfileId))
        .limit(1);

      const ownReadAt = getOwnReadAt(conversation, own.profileId);
      const [unreadCountRow] = await db
        .select({
          count: sql<number>`count(*)`,
        })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversation.id),
            eq(messages.senderProfileId, otherProfileId),
            sql`${messages.createdAt} > ${ownReadAt}`,
          ),
        );

      const unreadCount = Number(unreadCountRow?.count ?? 0);

      return {
        id: conversation.id,
        otherProfile,
        isFavorited: otherProfile
          ? await isFavorited(c.env, own.profileId, otherProfile.id)
          : false,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
        unread: unreadCount > 0,
        unreadCount,
        awaitingReply:
          unreadCount > 0 &&
          conversation.lastMessageSenderProfileId === otherProfileId,
        needsTheirReply:
          conversation.lastMessagePreview.length > 0 &&
          conversation.lastMessageSenderProfileId === own.profileId &&
          getOtherReadAt(conversation, own.profileId) < conversation.lastMessageAt,
        createdAt: conversation.createdAt,
      };
    }),
  );

  return c.json({ conversations: items });
});

chatRoutes.post("/conversations", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const body = (await c.req.json()) as { targetProfileId?: string };
  if (!body.targetProfileId) {
    return c.json({ error: "targetProfileId is required." }, 400);
  }

  if (body.targetProfileId === own.profileId) {
    return c.json({ error: "You cannot start a conversation with yourself." }, 400);
  }

  if (await areProfilesBlocked(c.env, own.profileId, body.targetProfileId)) {
    return c.json({ error: "This connection is unavailable." }, 403);
  }

  try {
    await enforceConversationStartLimit(c.env, own);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Rate limited." }, 429);
  }

  const db = getDb(c.env);
  const [targetProfile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, body.targetProfileId))
    .limit(1);

  if (!targetProfile) {
    return c.json({ error: "Target profile not found." }, 404);
  }

  const [existingConversation] = await db
    .select()
    .from(conversations)
    .where(
      or(
        and(
          eq(conversations.profileAId, own.profileId),
          eq(conversations.profileBId, body.targetProfileId),
        ),
        and(
          eq(conversations.profileAId, body.targetProfileId),
          eq(conversations.profileBId, own.profileId),
        ),
      ),
    )
    .limit(1);

  if (existingConversation) {
    const [reopenedConversation] = await db
      .update(conversations)
      .set(clearHiddenStatePatch(existingConversation, own.profileId))
      .where(eq(conversations.id, existingConversation.id))
      .returning();

    return c.json({ conversation: reopenedConversation ?? existingConversation });
  }

  const now = Date.now();
  const conversation = {
    id: crypto.randomUUID(),
    profileAId: own.profileId,
    profileBId: body.targetProfileId,
    lastMessageAt: now,
    lastMessagePreview: "",
    lastMessageSenderProfileId: own.profileId,
    lastReadAtA: now,
    lastReadAtB: 0,
    hiddenAtA: null,
    hiddenAtB: null,
    createdAt: now,
  };

  await db.insert(conversations).values(conversation);

  await logEvent(c.env, {
    eventType: "conversation_started",
    profileId: own.profileId,
    eventData: {
      conversationId: conversation.id,
      targetProfileId: body.targetProfileId,
    },
  });

  return c.json({ conversation }, 201);
});

chatRoutes.get("/conversations/:conversationId", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, c.req.param("conversationId")))
    .limit(1);

  if (!conversation) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const isMember =
    conversation.profileAId === own.profileId ||
    conversation.profileBId === own.profileId;

  if (!isMember) {
    return c.json({ error: "Forbidden." }, 403);
  }

  if (getOwnHiddenAt(conversation, own.profileId)) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const otherProfileId =
    conversation.profileAId === own.profileId
      ? conversation.profileBId
      : conversation.profileAId;
  const [ownProfileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, own.profileId))
    .limit(1);

  const [otherProfile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
      identity: profiles.identity,
      avatarPreset: profiles.avatarPreset,
      bio: profiles.bio,
      promptEntries: profiles.promptEntries,
      vibeTags: profiles.vibeTags,
    })
    .from(profiles)
    .where(eq(profiles.id, otherProfileId))
    .limit(1);

  return c.json({
    conversation: {
      id: conversation.id,
      otherProfile: otherProfile
        ? {
            ...otherProfile,
            vibeTags: JSON.parse(otherProfile.vibeTags) as string[],
            promptEntries: JSON.parse(otherProfile.promptEntries) as Array<{
              question: string;
              answer: string;
            }>,
          }
        : null,
      isFavorited: otherProfile
        ? await isFavorited(c.env, own.profileId, otherProfile.id)
        : false,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      unread: Boolean(
        conversation.lastMessageSenderProfileId !== own.profileId &&
          conversation.lastMessageAt > getOwnReadAt(conversation, own.profileId),
      ),
      unreadCount: Boolean(
        conversation.lastMessageSenderProfileId !== own.profileId &&
          conversation.lastMessageAt > getOwnReadAt(conversation, own.profileId),
      )
        ? 1
        : 0,
      awaitingReply: Boolean(
        conversation.lastMessageSenderProfileId !== own.profileId &&
          conversation.lastMessageAt > getOwnReadAt(conversation, own.profileId),
      ),
      needsTheirReply: Boolean(
        conversation.lastMessagePreview &&
          conversation.lastMessageSenderProfileId === own.profileId &&
          getOtherReadAt(conversation, own.profileId) < conversation.lastMessageAt
      ),
      createdAt: conversation.createdAt,
    },
  });
});

chatRoutes.get("/conversations/:conversationId/messages", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, c.req.param("conversationId")))
    .limit(1);

  if (!conversation) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const isMember =
    conversation.profileAId === own.profileId ||
    conversation.profileBId === own.profileId;

  if (!isMember) {
    return c.json({ error: "Forbidden." }, 403);
  }

  if (getOwnHiddenAt(conversation, own.profileId)) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const items = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversation.id))
    .orderBy(asc(messages.createdAt))
    .limit(200);

  await db
    .update(conversations)
    .set(readStatePatch(conversation, own.profileId, Date.now()))
    .where(eq(conversations.id, conversation.id));

  return c.json({ messages: items, ownProfileId: own.profileId });
});

chatRoutes.delete("/conversations/:conversationId", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, c.req.param("conversationId")))
    .limit(1);

  if (!conversation) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const isMember =
    conversation.profileAId === own.profileId ||
    conversation.profileBId === own.profileId;

  if (!isMember) {
    return c.json({ error: "Forbidden." }, 403);
  }

  await db
    .update(conversations)
    .set(hideStatePatch(conversation, own.profileId, Date.now()))
    .where(eq(conversations.id, conversation.id));

  await logEvent(c.env, {
    eventType: "conversation_deleted",
    profileId: own.profileId,
    eventData: {
      conversationId: conversation.id,
    },
  });

  return c.json({ ok: true });
});

chatRoutes.post("/conversations/:conversationId/messages", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"), c.req.header("Authorization"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const body = (await c.req.json()) as { body?: string };
  const trimmedBody = body.body?.trim();

  if (!trimmedBody) {
    return c.json({ error: "Message body is required." }, 400);
  }

  if (trimmedBody.length > 1200) {
    return c.json({ error: "Message is too long." }, 400);
  }

  if (containsBlockedContactInfo(trimmedBody)) {
    return c.json(
      { error: "Messages cannot include off-platform contact information." },
      400,
    );
  }

  const db = getDb(c.env);
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, c.req.param("conversationId")))
    .limit(1);

  if (!conversation) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const isMember =
    conversation.profileAId === own.profileId ||
    conversation.profileBId === own.profileId;

  if (!isMember) {
    return c.json({ error: "Forbidden." }, 403);
  }

  if (getOwnHiddenAt(conversation, own.profileId)) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const otherProfileId =
    conversation.profileAId === own.profileId
      ? conversation.profileBId
      : conversation.profileAId;
  const [ownProfileRow] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, own.profileId))
    .limit(1);

  if (await areProfilesBlocked(c.env, own.profileId, otherProfileId)) {
    return c.json({ error: "This connection is unavailable." }, 403);
  }

  try {
    await enforceMessageLimit(c.env, own);
  } catch (error) {
    return c.json({ error: error instanceof Error ? error.message : "Rate limited." }, 429);
  }

  const now = Date.now();
  const message = {
    id: crypto.randomUUID(),
    conversationId: conversation.id,
    senderProfileId: own.profileId,
    body: trimmedBody,
    createdAt: now,
  };

  await db.insert(messages).values(message);

  const existingMessageCountRow = await db
    .select({
      count: sql<number>`count(*)`,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversation.id));
  const totalMessagesInConversation = Number(existingMessageCountRow[0]?.count ?? 0);
  const priorMessageCount = Math.max(totalMessagesInConversation - 1, 0);
  const wasFirstMessage = priorMessageCount === 0;
  const wasFirstReply =
    priorMessageCount >= 1 &&
    conversation.lastMessageSenderProfileId !== own.profileId &&
    getOwnReadAt(conversation, own.profileId) === 0;

  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: trimmedBody.slice(0, 140),
      lastMessageSenderProfileId: own.profileId,
      ...readStatePatch(conversation, own.profileId, now),
      ...clearHiddenForBothPatch(conversation),
    })
    .where(eq(conversations.id, conversation.id));

  const [targetUser] = await db
    .select({ userId: profiles.userId, displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.id, otherProfileId))
    .limit(1);

  if (targetUser?.userId) {
    await sendPushToUser(c.env, targetUser.userId, {
      title: `${ownProfileRow?.displayName ?? "Someone"} sent a message`,
      body: trimmedBody.slice(0, 120),
      link: `/chat/${conversation.id}`,
    }).catch(() => undefined);
  }

  await logEvent(c.env, {
    eventType: "message_sent",
    profileId: own.profileId,
    eventData: {
      conversationId: conversation.id,
      targetProfileId: otherProfileId,
      priorMessageCount,
    },
  });

  if (wasFirstMessage) {
    await logEvent(c.env, {
      eventType: "first_message_sent",
      profileId: own.profileId,
      eventData: {
        conversationId: conversation.id,
        targetProfileId: otherProfileId,
      },
    });
  }

  if (wasFirstReply) {
    await logEvent(c.env, {
      eventType: "first_reply_sent",
      profileId: own.profileId,
      eventData: {
        conversationId: conversation.id,
        targetProfileId: otherProfileId,
      },
    });

    if (now - conversation.createdAt <= 1000 * 60 * 60 * 24) {
      await logEvent(c.env, {
        eventType: "conversation_got_reply_within_24h",
        profileId: own.profileId,
        eventData: {
          conversationId: conversation.id,
          targetProfileId: otherProfileId,
        },
      });
    }
  }

  return c.json({ message }, 201);
});
