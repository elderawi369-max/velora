import { Hono } from "hono";
import { eq, or } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import {
  blocks,
  boosts,
  conversations,
  favorites,
  gifts,
  messages,
  notifications,
  eventLogs,
  profiles,
  purchases,
  reports,
  sessions,
  supportTickets,
  users,
} from "../db/schema";
import {
  createSession,
  buildSessionCookie,
  clearSessionCookie,
  getUserIdFromSession,
  revokeSession,
  resolveCookiePolicy,
} from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { verifyTurnstileToken } from "../lib/turnstile";
import { logEvent } from "../lib/analytics";
import {
  changePasswordSchema,
  deleteAccountSchema,
  loginSchema,
  signupSchema,
} from "../lib/validation";

export const authRoutes = new Hono<{ Bindings: EnvBindings }>();

authRoutes.post("/signup", async (c) => {
  const payload = signupSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid signup payload." }, 400);
  }

  const turnstileValid = await verifyTurnstileToken(
    c.env,
    payload.data.turnstileToken,
    c.req.header("CF-Connecting-IP"),
  );

  if (!turnstileValid) {
    return c.json({ error: "Please complete the human verification check." }, 400);
  }

  const db = getDb(c.env);
  const [existingUser] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, payload.data.email))
    .limit(1);

  if (existingUser) {
    return c.json({ error: "An account with that email already exists." }, 409);
  }

  const now = Date.now();
  const userId = crypto.randomUUID();
  const { hash, salt } = await hashPassword(payload.data.password);

  await db.insert(users).values({
    id: userId,
    email: payload.data.email,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: now,
    updatedAt: now,
  });

  await logEvent(c.env, {
    eventType: "signup_completed",
    userId,
    eventData: {
      emailDomain: payload.data.email.split("@")[1] ?? "",
    },
  });

  const sessionToken = await createSession(c.env, userId);
  c.header(
    "Set-Cookie",
    buildSessionCookie(
      sessionToken,
      resolveCookiePolicy(c.req.url, c.env.APP_ENV),
    ),
  );

  return c.json({
    user: {
      id: userId,
      email: payload.data.email,
      emailVerified: false,
    },
    sessionToken,
    hasProfile: false,
  }, 201);
});

authRoutes.post("/login", async (c) => {
  const payload = loginSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid login payload." }, 400);
  }

  const db = getDb(c.env);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, payload.data.email))
    .limit(1);

  if (!user) {
    return c.json({ error: "Invalid email or password." }, 401);
  }

  const isValid = await verifyPassword(
    payload.data.password,
    user.passwordSalt,
    user.passwordHash,
  );

  if (!isValid) {
    return c.json({ error: "Invalid email or password." }, 401);
  }

  const sessionToken = await createSession(c.env, user.id);
  c.header(
    "Set-Cookie",
    buildSessionCookie(
      sessionToken,
      resolveCookiePolicy(c.req.url, c.env.APP_ENV),
    ),
  );

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  return c.json({
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    sessionToken,
    hasProfile: Boolean(profile),
  });
});

authRoutes.post("/logout", async (c) => {
  await revokeSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  c.header(
    "Set-Cookie",
    clearSessionCookie(resolveCookiePolicy(c.req.url, c.env.APP_ENV)),
  );
  return c.json({ ok: true });
});

authRoutes.post("/change-password", async (c) => {
  const userId = await getUserIdFromSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!userId) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = changePasswordSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid password update payload." }, 400);
  }

  if (payload.data.currentPassword === payload.data.newPassword) {
    return c.json({ error: "Choose a different new password." }, 400);
  }

  const db = getDb(c.env);
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({ error: "User not found." }, 404);
  }

  const isValid = await verifyPassword(
    payload.data.currentPassword,
    user.passwordSalt,
    user.passwordHash,
  );
  if (!isValid) {
    return c.json({ error: "Current password is incorrect." }, 401);
  }

  const { hash, salt } = await hashPassword(payload.data.newPassword);
  await db
    .update(users)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      updatedAt: Date.now(),
    })
    .where(eq(users.id, user.id));

  return c.json({ ok: true });
});

authRoutes.delete("/account", async (c) => {
  try {
    const userId = await getUserIdFromSession(
      c.env,
      c.req.header("Cookie"),
      c.req.header("Authorization"),
    );
    if (!userId) {
      return c.json({ error: "Unauthorized." }, 401);
    }

    const payload = deleteAccountSchema.safeParse(await c.req.json());
    if (!payload.success) {
      return c.json({ error: "Invalid delete-account request." }, 400);
    }

    const db = getDb(c.env);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return c.json({ error: "User not found." }, 404);
    }

    const isValid = await verifyPassword(
      payload.data.currentPassword,
      user.passwordSalt,
      user.passwordHash,
    );
    if (!isValid) {
      return c.json({ error: "Current password is incorrect." }, 401);
    }

    const [profile] = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.userId, userId))
      .limit(1);

    if (profile) {
      const relatedConversations = await db
        .select({ id: conversations.id })
        .from(conversations)
        .where(
          or(
            eq(conversations.profileAId, profile.id),
            eq(conversations.profileBId, profile.id),
          ),
        );
      const conversationIds = relatedConversations.map((item) => item.id);

      for (const conversationId of conversationIds) {
        await db.delete(messages).where(eq(messages.conversationId, conversationId));
      }

      await db
        .delete(reports)
        .where(
          or(
            eq(reports.reporterProfileId, profile.id),
            eq(reports.targetProfileId, profile.id),
          ),
        );

      for (const conversationId of conversationIds) {
        await db.delete(reports).where(eq(reports.conversationId, conversationId));
      }

      await db
        .delete(notifications)
        .where(
          or(
            eq(notifications.profileId, profile.id),
            eq(notifications.actorProfileId, profile.id),
          ),
        );

      await db
        .delete(favorites)
        .where(
          or(
            eq(favorites.profileId, profile.id),
            eq(favorites.targetProfileId, profile.id),
          ),
        );
      await db
        .delete(blocks)
        .where(
          or(
            eq(blocks.profileId, profile.id),
            eq(blocks.targetProfileId, profile.id),
          ),
        );
      await db
        .delete(gifts)
        .where(
          or(
            eq(gifts.senderProfileId, profile.id),
            eq(gifts.targetProfileId, profile.id),
          ),
        );
      await db.delete(boosts).where(eq(boosts.profileId, profile.id));
      await db
        .delete(purchases)
        .where(
          or(
            eq(purchases.buyerProfileId, profile.id),
            eq(purchases.targetProfileId, profile.id),
          ),
        );
      await db.delete(supportTickets).where(eq(supportTickets.profileId, profile.id));
      await db
        .delete(eventLogs)
        .where(
          or(
            eq(eventLogs.userId, userId),
            eq(eventLogs.profileId, profile.id),
          ),
        );

      for (const conversationId of conversationIds) {
        await db.delete(conversations).where(eq(conversations.id, conversationId));
      }

      await db.delete(profiles).where(eq(profiles.id, profile.id));
    }

    await db.delete(eventLogs).where(eq(eventLogs.userId, userId));

    await db.delete(sessions).where(eq(sessions.userId, userId));
    await db.delete(users).where(eq(users.id, userId));

    c.header(
      "Set-Cookie",
      clearSessionCookie(resolveCookiePolicy(c.req.url, c.env.APP_ENV)),
    );
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to delete account right now.",
      },
      500,
    );
  }
});
