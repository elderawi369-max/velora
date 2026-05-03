import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { profiles, reports, supportTickets } from "../db/schema";
import { requireAdmin } from "../lib/admin";
import { getDb, type EnvBindings } from "../lib/db";

export const adminRoutes = new Hono<{ Bindings: EnvBindings }>();

adminRoutes.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

adminRoutes.get("/reports", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(reports)
    .orderBy(desc(reports.createdAt))
    .limit(200);

  const items = await Promise.all(
    rows.map(async (report) => {
      const [targetProfile] = await db
        .select({
          id: profiles.id,
          username: profiles.username,
          displayName: profiles.displayName,
          suspendedAt: profiles.suspendedAt,
        })
        .from(profiles)
        .where(eq(profiles.id, report.targetProfileId))
        .limit(1);
      const sameTargetReports = rows.filter((item) => item.targetProfileId === report.targetProfileId);
      const uniqueReporterCount = new Set(
        sameTargetReports.map((item) => item.reporterProfileId),
      ).size;
      const reportCount = sameTargetReports.length;
      const riskLevel =
        uniqueReporterCount >= 3 || reportCount >= 5
          ? "high"
          : uniqueReporterCount >= 2 || reportCount >= 3
            ? "watch"
            : "low";

      return {
        ...report,
        targetProfile,
        reportCount,
        uniqueReporterCount,
        riskLevel,
      };
    }),
  );

  return c.json({ reports: items });
});

adminRoutes.get("/support-tickets", async (c) => {
  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(supportTickets)
    .orderBy(desc(supportTickets.createdAt))
    .limit(200);

  return c.json({ tickets: rows });
});

adminRoutes.post("/profiles/:profileId/suspend", async (c) => {
  const db = getDb(c.env);
  await db
    .update(profiles)
    .set({
      suspendedAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(profiles.id, c.req.param("profileId")));

  return c.json({ ok: true });
});

adminRoutes.post("/profiles/:profileId/unsuspend", async (c) => {
  const db = getDb(c.env);
  await db
    .update(profiles)
    .set({
      suspendedAt: null,
      updatedAt: Date.now(),
    })
    .where(eq(profiles.id, c.req.param("profileId")));

  return c.json({ ok: true });
});
