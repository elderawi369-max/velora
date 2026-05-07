import { Hono } from "hono";
import { desc, eq, gt, inArray, isNotNull, isNull } from "drizzle-orm";
import {
  boosts,
  eventLogs,
  favorites,
  gifts,
  paymentWebhookEvents,
  profiles,
  purchases,
  reports,
  supportTickets,
  users,
} from "../db/schema";
import { requireAdmin } from "../lib/admin";
import { getDb, type EnvBindings } from "../lib/db";

export const adminRoutes = new Hono<{ Bindings: EnvBindings }>();

adminRoutes.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

adminRoutes.get("/analytics", async (c) => {
  const db = getDb(c.env);
  const now = Date.now();
  const sevenDaysAgo = now - 1000 * 60 * 60 * 24 * 7;

  const [
    allUsers,
    allProfiles,
    verifiedProfiles,
    openTickets,
    allReports,
    activeBoosts,
    fulfilledPurchases,
    purchasesLast7d,
    eventsLast7d,
    recentEvents,
    allFavorites,
    allGifts,
  ] = await Promise.all([
    db.select({ id: users.id }).from(users),
    db.select({ id: profiles.id, username: profiles.username, displayName: profiles.displayName }).from(profiles),
    db
      .select({ id: profiles.id })
      .from(profiles)
      .where(isNotNull(profiles.verifiedHumanAt)),
    db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.status, "open")),
    db.select({ id: reports.id, targetProfileId: reports.targetProfileId }).from(reports),
    db
      .select({ id: boosts.id, profileId: boosts.profileId, expiresAt: boosts.expiresAt })
      .from(boosts)
      .where(gt(boosts.expiresAt, now)),
    db
      .select({
        id: purchases.id,
        buyerProfileId: purchases.buyerProfileId,
        targetProfileId: purchases.targetProfileId,
        productKind: purchases.productKind,
        amountCents: purchases.amountCents,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .where(eq(purchases.status, "fulfilled")),
    db
      .select({
        id: purchases.id,
        productKind: purchases.productKind,
        amountCents: purchases.amountCents,
      })
      .from(purchases)
      .where(gt(purchases.createdAt, sevenDaysAgo)),
    db
      .select({
        eventType: eventLogs.eventType,
        createdAt: eventLogs.createdAt,
      })
      .from(eventLogs)
      .where(gt(eventLogs.createdAt, sevenDaysAgo)),
    db
      .select({
        id: eventLogs.id,
        eventType: eventLogs.eventType,
        userId: eventLogs.userId,
        profileId: eventLogs.profileId,
        eventData: eventLogs.eventData,
        createdAt: eventLogs.createdAt,
      })
      .from(eventLogs)
      .orderBy(desc(eventLogs.createdAt))
      .limit(20),
    db
      .select({
        id: favorites.id,
        profileId: favorites.profileId,
        targetProfileId: favorites.targetProfileId,
      })
      .from(favorites),
    db
      .select({
        id: gifts.id,
        targetProfileId: gifts.targetProfileId,
      })
      .from(gifts),
  ]);

  const profileMap = new Map(
    allProfiles.map((profile) => [
      profile.id,
      {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
      },
    ]),
  );

  const purchasesRevenueCents = fulfilledPurchases.reduce(
    (sum, purchase) => sum + purchase.amountCents,
    0,
  );
  const revenueLast7dCents = purchasesLast7d.reduce(
    (sum, purchase) => sum + purchase.amountCents,
    0,
  );

  const eventCount = (eventType: string) =>
    eventsLast7d.filter((event) => event.eventType === eventType).length;

  const topProfiles = allProfiles
    .map((profile) => {
      const favoritesReceived = allFavorites.filter(
        (favorite) => favorite.targetProfileId === profile.id,
      ).length;
      const giftsReceived = allGifts.filter(
        (gift) => gift.targetProfileId === profile.id,
      ).length;
      const reportsReceived = allReports.filter(
        (report) => report.targetProfileId === profile.id,
      ).length;
      const activeBoostCount = activeBoosts.filter(
        (boost) => boost.profileId === profile.id,
      ).length;
      const purchaseRevenueCents = fulfilledPurchases
        .filter(
          (purchase) =>
            purchase.targetProfileId === profile.id || purchase.buyerProfileId === profile.id,
        )
        .reduce((sum, purchase) => sum + purchase.amountCents, 0);

      return {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        favoritesReceived,
        giftsReceived,
        reportsReceived,
        activeBoostCount,
        purchaseRevenueCents,
      };
    })
    .sort((left, right) => {
      if (right.giftsReceived !== left.giftsReceived) {
        return right.giftsReceived - left.giftsReceived;
      }

      if (right.favoritesReceived !== left.favoritesReceived) {
        return right.favoritesReceived - left.favoritesReceived;
      }

      return right.purchaseRevenueCents - left.purchaseRevenueCents;
    })
    .slice(0, 8);

  const recentEventItems = recentEvents.map((event) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(event.eventData);
    } catch {
      parsed = {};
    }

    const targetProfileId =
      typeof parsed.targetProfileId === "string" ? parsed.targetProfileId : null;
    const profile = event.profileId ? profileMap.get(event.profileId) ?? null : null;
    const targetProfile = targetProfileId ? profileMap.get(targetProfileId) ?? null : null;

    return {
      id: event.id,
      eventType: event.eventType,
      createdAt: event.createdAt,
      profile,
      targetProfile,
      data: parsed,
    };
  });

  return c.json({
    overview: {
      totalUsers: allUsers.length,
      totalProfiles: allProfiles.length,
      verifiedProfiles: verifiedProfiles.length,
      openSupportTickets: openTickets.length,
      totalReports: allReports.length,
      activeBoosts: activeBoosts.length,
      fulfilledPurchases: fulfilledPurchases.length,
      revenueUsdCents: purchasesRevenueCents,
    },
    funnelLast7d: {
      signups: eventCount("signup_completed"),
      profilesCreated: eventCount("profile_created"),
      conversationsStarted: eventCount("conversation_started"),
      giftsPurchased: purchasesLast7d.filter((purchase) => purchase.productKind === "gift").length,
      boostsPurchased: purchasesLast7d.filter((purchase) => purchase.productKind === "boost").length,
      passwordResetRequests: eventCount("password_reset_requested"),
      revenueUsdCents: revenueLast7dCents,
    },
    topProfiles,
    recentEvents: recentEventItems,
  });
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
          verifiedHumanAt: profiles.verifiedHumanAt,
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

adminRoutes.post("/profiles/:profileId/verify", async (c) => {
  const db = getDb(c.env);
  await db
    .update(profiles)
    .set({
      verifiedHumanAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(profiles.id, c.req.param("profileId")));

  return c.json({ ok: true });
});

adminRoutes.post("/profiles/:profileId/unverify", async (c) => {
  const db = getDb(c.env);
  await db
    .update(profiles)
    .set({
      verifiedHumanAt: null,
      updatedAt: Date.now(),
    })
    .where(eq(profiles.id, c.req.param("profileId")));

  return c.json({ ok: true });
});
