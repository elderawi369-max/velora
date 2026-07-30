import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { getDb, type EnvBindings } from "../lib/db";
import { profiles, supportTickets, users } from "../db/schema";
import { getOwnProfileContext } from "../lib/profile-context";
import { verifyTurnstileToken } from "../lib/turnstile";
import { supportTicketSchema } from "../lib/validation";

export const supportRoutes = new Hono<{ Bindings: EnvBindings }>();

supportRoutes.post("/tickets", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  const payload = supportTicketSchema.safeParse(await c.req.json());

  if (!payload.success) {
    return c.json({ error: "Invalid support ticket payload." }, 400);
  }

  const turnstileValid = await verifyTurnstileToken(
    c.env,
    payload.data.turnstileToken,
    c.req.header("CF-Connecting-IP"),
    c.req.header("X-Velora-Client-Platform"),
    c.req.header("Origin"),
  );

  if (!turnstileValid) {
    return c.json({ error: "Please complete the human verification check." }, 400);
  }

  let linkedProfileId = own?.profileId ?? null;

  if (!linkedProfileId) {
    const db = getDb(c.env);
    const [matchedUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, payload.data.email))
      .limit(1);

    if (matchedUser) {
      const [matchedProfile] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.userId, matchedUser.id))
        .limit(1);

      linkedProfileId = matchedProfile?.id ?? null;
    }
  }

  await getDb(c.env).insert(supportTickets).values({
    id: crypto.randomUUID(),
    profileId: linkedProfileId,
    email: payload.data.email,
    subject: payload.data.subject,
    message: payload.data.message,
    status: "open",
    createdAt: Date.now(),
  });

  return c.json({ ok: true }, 201);
});
