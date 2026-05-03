import { Hono } from "hono";
import { getDb, type EnvBindings } from "../lib/db";
import { supportTickets } from "../db/schema";
import { getOwnProfileContext } from "../lib/profile-context";
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

  await getDb(c.env).insert(supportTickets).values({
    id: crypto.randomUUID(),
    profileId: own?.profileId ?? null,
    email: payload.data.email,
    subject: payload.data.subject,
    message: payload.data.message,
    status: "open",
    createdAt: Date.now(),
  });

  return c.json({ ok: true }, 201);
});
