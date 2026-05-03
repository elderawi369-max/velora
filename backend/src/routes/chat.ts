import { Hono } from "hono";
import { and, asc, desc, eq, or } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import { conversations, messages, profiles } from "../db/schema";
import { enforceConversationStartLimit, enforceMessageLimit } from "../lib/limits";
import { containsBlockedContactInfo } from "../lib/moderation";
import { getOwnProfileContext } from "../lib/profile-context";
import { areProfilesBlocked, isFavorited } from "../lib/relationships";

export const chatRoutes = new Hono<{ Bindings: EnvBindings }>();

function getOwnReadAt(conversation: typeof conversations.$inferSelect, ownProfileId: string) {
  return conversation.profileAId === ownProfileId
    ? conversation.lastReadAtA
    : conversation.lastReadAtB;
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

chatRoutes.get("/conversations", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(conversations)
    .where(
      or(
        eq(conversations.profileAId, own.profileId),
        eq(conversations.profileBId, own.profileId),
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
          avatarPreset: profiles.avatarPreset,
        })
        .from(profiles)
        .where(eq(profiles.id, otherProfileId))
        .limit(1);

      return {
        id: conversation.id,
        otherProfile,
        isFavorited: otherProfile
          ? await isFavorited(c.env, own.profileId, otherProfile.id)
          : false,
        lastMessageAt: conversation.lastMessageAt,
        lastMessagePreview: conversation.lastMessagePreview,
        unread: Boolean(
          conversation.lastMessageSenderProfileId !== own.profileId &&
            conversation.lastMessageAt > getOwnReadAt(conversation, own.profileId),
        ),
        createdAt: conversation.createdAt,
      };
    }),
  );

  return c.json({ conversations: items });
});

chatRoutes.post("/conversations", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
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
    return c.json({ conversation: existingConversation });
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
    createdAt: now,
  };

  await db.insert(conversations).values(conversation);

  return c.json({ conversation }, 201);
});

chatRoutes.get("/conversations/:conversationId", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
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

  const otherProfileId =
    conversation.profileAId === own.profileId
      ? conversation.profileBId
      : conversation.profileAId;

  const [otherProfile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      avatarPreset: profiles.avatarPreset,
    })
    .from(profiles)
    .where(eq(profiles.id, otherProfileId))
    .limit(1);

  return c.json({
    conversation: {
      id: conversation.id,
      otherProfile,
      isFavorited: otherProfile
        ? await isFavorited(c.env, own.profileId, otherProfile.id)
        : false,
      lastMessageAt: conversation.lastMessageAt,
      lastMessagePreview: conversation.lastMessagePreview,
      unread: Boolean(
        conversation.lastMessageSenderProfileId !== own.profileId &&
          conversation.lastMessageAt > getOwnReadAt(conversation, own.profileId),
      ),
      createdAt: conversation.createdAt,
    },
  });
});

chatRoutes.get("/conversations/:conversationId/messages", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
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

chatRoutes.post("/conversations/:conversationId/messages", async (c) => {
  const own = await getOwnProfileContext(c.env, c.req.header("Cookie"));
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

  const otherProfileId =
    conversation.profileAId === own.profileId
      ? conversation.profileBId
      : conversation.profileAId;

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

  await db
    .update(conversations)
    .set({
      lastMessageAt: now,
      lastMessagePreview: trimmedBody.slice(0, 140),
      lastMessageSenderProfileId: own.profileId,
      ...readStatePatch(conversation, own.profileId, now),
    })
    .where(eq(conversations.id, conversation.id));

  return c.json({ message }, 201);
});
