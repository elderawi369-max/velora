import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "./routes";
import type { EnvBindings } from "./lib/db";
import { seedDatabase } from "./db/seed";
import { getUserIdFromSession } from "./lib/auth";
import {
  maybeGrantStarterCredits,
  readClientIp,
  readInstallId,
} from "./lib/starter-credits";
import { sendDailyRetentionReminders } from "./lib/streaks";

const app = new Hono<{ Bindings: EnvBindings }>();

function resolveCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return "";
  }

  const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;
  if (localhostPattern.test(origin)) {
    return origin;
  }

  const allowedOrigins: string[] = [
    "https://app.velorachat.com",
  ];

  if (allowedOrigins.includes(origin)) {
    return origin;
  }

  return "";
}

app.use(
  "/api/*",
  cors({
    origin: (origin) => resolveCorsOrigin(origin),
    credentials: true,
  }),
);

app.use("/api/*", async (c, next) => {
  const userId = await getUserIdFromSession(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );

  if (userId) {
    await maybeGrantStarterCredits(c.env, {
      userId,
      installId: readInstallId(c.req.header("X-Velora-Install-Id")),
      ip: readClientIp(c.req.header("CF-Connecting-IP")),
    });
  }

  await next();
});

app.get("/", (c) => {
  return c.json({
    name: c.env.APP_NAME ?? "Velora API",
    status: "ok",
    message: "Velora backend is running.",
  });
});

app.route("/api", apiRoutes);

app.get("/api/health", (c) => {
  return c.json({
    ok: true,
    timestamp: new Date().toISOString(),
    adminConfigured: Boolean(c.env.ADMIN_SECRET ?? "velora-local-admin"),
    appEnv: c.env.APP_ENV ?? "unknown",
  });
});

app.post("/api/dev/seed", async (c) => {
  if (c.env.ENABLE_DEV_ENDPOINTS !== "true") {
    return c.json({ error: "Not found." }, 404);
  }

  await seedDatabase(c.env);
  return c.json({ ok: true });
});

export default {
  fetch: app.fetch,
  scheduled(_controller: ScheduledController, env: EnvBindings, ctx: ExecutionContext) {
    ctx.waitUntil(sendDailyRetentionReminders(env));
  },
};
