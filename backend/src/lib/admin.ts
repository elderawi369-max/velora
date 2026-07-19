import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { users } from "../db/schema";
import { getUserIdFromSession } from "./auth";
import type { EnvBindings } from "./db";
import { getDb } from "./db";

const founderEmail = "elderawi369@gmail.com";

function readAdminHeader(c: Context<{ Bindings: EnvBindings }>) {
  return c.req.header("x-admin-key") ?? "";
}

export function requireAdmin(c: Context<{ Bindings: EnvBindings }>) {
  const configuredKey =
    c.env.ADMIN_SECRET ?? (c.env.APP_ENV === "local" ? "velora-local-admin" : "");
  const providedKey = readAdminHeader(c);

  if (!configuredKey || !providedKey || providedKey !== configuredKey) {
    throw new HTTPException(401, {
      message: "Unauthorized admin request.",
    });
  }
}

export async function requireFounderAdmin(c: Context<{ Bindings: EnvBindings }>) {
  requireAdmin(c);

  const userId = await getUserIdFromSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );

  if (!userId) {
    throw new HTTPException(401, {
      message: "Founder session required.",
    });
  }

  const db = getDb(c.env);
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user || user.email.trim().toLowerCase() !== founderEmail) {
    throw new HTTPException(403, {
      message: "Founder access only.",
    });
  }
}
