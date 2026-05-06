import { Hono } from "hono";
import { getUserIdFromSession } from "../lib/auth";
import { type EnvBindings } from "../lib/db";
import { unregisterPushDevice, registerPushDevice } from "../lib/push";
import { z } from "zod";

const registerSchema = z.object({
  token: z.string().trim().min(20),
  platform: z.enum(["web", "android"]),
  deviceLabel: z.string().trim().max(120).optional(),
});

const unregisterSchema = z.object({
  token: z.string().trim().min(20),
});

export const pushRoutes = new Hono<{ Bindings: EnvBindings }>();

pushRoutes.post("/register", async (c) => {
  const userId = await getUserIdFromSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!userId) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = registerSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid push registration payload." }, 400);
  }

  await registerPushDevice(c.env, {
    userId,
    token: payload.data.token,
    platform: payload.data.platform,
    deviceLabel: payload.data.deviceLabel ?? null,
  });

  return c.json({ ok: true });
});

pushRoutes.post("/unregister", async (c) => {
  const userId = await getUserIdFromSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!userId) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = unregisterSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid push unregister payload." }, 400);
  }

  await unregisterPushDevice(c.env, {
    userId,
    token: payload.data.token,
  });

  return c.json({ ok: true });
});
