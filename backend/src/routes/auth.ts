import { Hono, type Context } from "hono";
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
  passwordResetTokens,
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
import { hashPassword, hashToken, verifyPassword } from "../lib/crypto";
import { verifyTurnstileToken } from "../lib/turnstile";
import { logEvent } from "../lib/analytics";
import { sendPasswordResetEmail } from "../lib/email";
import {
  maybeGrantStarterCredits,
  readClientIp,
  readInstallId,
} from "../lib/starter-credits";
import {
  changePasswordSchema,
  deleteAccountSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
} from "../lib/validation";

export const authRoutes = new Hono<{ Bindings: EnvBindings }>();

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 60;

function resolveFrontendOrigin(c: Context<{ Bindings: EnvBindings }>) {
  return c.req.header("Origin") ?? "https://app.velorachat.com";
}

function getClientPlatform(c: Context<{ Bindings: EnvBindings }>) {
  return c.req.header("X-Velora-Client-Platform");
}

authRoutes.get("/me", async (c) => {
  const userId = await getUserIdFromSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );

  if (!userId) {
    return c.json({
      authenticated: false,
      user: null,
      hasProfile: false,
      starterCreditGrant: null,
    });
  }

  const db = getDb(c.env);
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return c.json({
      authenticated: false,
      user: null,
      hasProfile: false,
      starterCreditGrant: null,
    });
  }

  const starterCreditResult = await maybeGrantStarterCredits(c.env, {
    userId,
    installId: readInstallId(c.req.header("X-Velora-Install-Id")),
    ip: readClientIp(c.req.header("CF-Connecting-IP")),
  });

  const [profile] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return c.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    hasProfile: Boolean(profile),
    starterCreditGrant: starterCreditResult?.grant ?? null,
  });
});

authRoutes.post("/signup", async (c) => {
  const payload = signupSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid signup payload." }, 400);
  }

  const turnstileValid = await verifyTurnstileToken(
    c.env,
    payload.data.turnstileToken,
    c.req.header("CF-Connecting-IP"),
    getClientPlatform(c),
    c.req.header("Origin"),
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

authRoutes.post("/forgot-password", async (c) => {
  const payload = forgotPasswordSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid forgot-password request." }, 400);
  }

  const turnstileValid = await verifyTurnstileToken(
    c.env,
    payload.data.turnstileToken,
    c.req.header("CF-Connecting-IP"),
    getClientPlatform(c),
    c.req.header("Origin"),
  );

  if (!turnstileValid) {
    return c.json({ error: "Please complete the human verification check." }, 400);
  }

  const db = getDb(c.env);
  const emailDeliveryReady = Boolean(c.env.RESEND_API_KEY && c.env.RESEND_FROM_EMAIL);
  const [user] = await db
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.email, payload.data.email))
    .limit(1);

  if (user) {
    const now = Date.now();
    const rawToken = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const frontendOrigin = resolveFrontendOrigin(c);
    const resetLink = `${frontendOrigin}/reset-password?token=${encodeURIComponent(rawToken)}`;

    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

    await db.insert(passwordResetTokens).values({
      id: crypto.randomUUID(),
      userId: user.id,
      tokenHash: await hashToken(rawToken),
      expiresAt: now + PASSWORD_RESET_TTL_MS,
      usedAt: null,
      createdAt: now,
    });

    const emailResult = await sendPasswordResetEmail(c.env, {
      to: user.email,
      resetLink,
    }).catch(async (error) => {
      await db.insert(supportTickets).values({
        id: crypto.randomUUID(),
        profileId: null,
        email: user.email,
        subject: "Password reset requested",
        message: `Password reset requested for ${user.email}. Email delivery failed, manual reset link: ${resetLink}. Error: ${
          error instanceof Error ? error.message : "Unknown email delivery error."
        }`,
        status: "open",
        createdAt: now,
      });

      return { delivered: false, provider: "fallback" as const };
    });

    await logEvent(c.env, {
      eventType: "password_reset_requested",
      userId: user.id,
      eventData: {
        delivery: emailResult.provider,
      },
    });
  }

  return c.json({
    ok: true,
    message:
      emailDeliveryReady
        ? "If that email exists, a reset email is on the way."
        : "If that email exists, the reset request is recorded. Email delivery is not configured yet, so support can still issue it manually.",
  });
});

authRoutes.post("/reset-password", async (c) => {
  const payload = resetPasswordSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid reset-password request." }, 400);
  }

  const db = getDb(c.env);
  const tokenHash = await hashToken(payload.data.token);
  const [resetToken] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!resetToken || resetToken.usedAt || resetToken.expiresAt <= Date.now()) {
    return c.json({ error: "This reset link is invalid or has expired." }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, resetToken.userId))
    .limit(1);

  if (!user) {
    return c.json({ error: "User not found." }, 404);
  }

  const { hash, salt } = await hashPassword(payload.data.newPassword);
  const now = Date.now();

  await db
    .update(users)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      updatedAt: now,
    })
    .where(eq(users.id, user.id));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: now })
    .where(eq(passwordResetTokens.id, resetToken.id));

  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
  await db.delete(sessions).where(eq(sessions.userId, user.id));

  await logEvent(c.env, {
    eventType: "password_reset_completed",
    userId: user.id,
    eventData: {},
  });

  return c.json({ ok: true });
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
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));

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
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId));

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
