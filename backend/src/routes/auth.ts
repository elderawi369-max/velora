import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import { users } from "../db/schema";
import {
  createSession,
  buildSessionCookie,
  clearSessionCookie,
  revokeSession,
  resolveCookiePolicy,
} from "../lib/auth";
import { hashPassword, verifyPassword } from "../lib/crypto";
import { loginSchema, signupSchema } from "../lib/validation";
import { profiles } from "../db/schema";

export const authRoutes = new Hono<{ Bindings: EnvBindings }>();

authRoutes.post("/signup", async (c) => {
  const payload = signupSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid signup payload." }, 400);
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
