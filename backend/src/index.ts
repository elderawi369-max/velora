import { Hono } from "hono";
import { cors } from "hono/cors";
import { apiRoutes } from "./routes";
import type { EnvBindings } from "./lib/db";
import { seedDatabase } from "./db/seed";
import { sendLoginStreakReminders } from "./lib/streaks";

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
    ctx.waitUntil(sendLoginStreakReminders(env));
  },
};
