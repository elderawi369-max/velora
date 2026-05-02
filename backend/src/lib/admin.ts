import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import type { EnvBindings } from "./db";

function readAdminHeader(c: Context<{ Bindings: EnvBindings }>) {
  return c.req.header("x-admin-key") ?? "";
}

export function requireAdmin(c: Context<{ Bindings: EnvBindings }>) {
  const configuredKey = c.env.ADMIN_KEY ?? "velora-local-admin";
  const providedKey = readAdminHeader(c);

  if (!providedKey || providedKey !== configuredKey) {
    throw new HTTPException(401, {
      message: "Unauthorized admin request.",
    });
  }
}
