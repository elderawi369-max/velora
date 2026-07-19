import { Hono } from "hono";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
  conversations,
  eventLogs,
  messages,
  profiles,
  reports,
  supportTickets,
} from "../db/schema";
import { requireAdmin } from "../lib/admin";
import { getDb, type EnvBindings } from "../lib/db";
import { containsBlockedContactInfo } from "../lib/moderation";

const DAY_MS = 1000 * 60 * 60 * 24;

type TopConversationRow = {
  conversationId: string;
  messageCount: number;
  createdAt: number;
  lastMessageAt: number;
  profileADisplayName: string;
  profileAUsername: string;
  profileBDisplayName: string;
  profileBUsername: string;
};

type EngagementSummary = {
  activeUsers: number;
  messagesSent: number;
  uniqueMessageSenders: number;
  activeConversations: number;
  newConversations: number;
  averageMessagesPerActiveConversation: number;
  medianMessagesPerActiveConversation: number;
  conversationsWith2PlusMessages: number;
  conversationsWith5PlusMessages: number;
  conversationsWith10PlusMessages: number;
  oneSidedConversations: number;
  twoWayConversations: number;
  replyRate: number;
  topConversations: TopConversationRow[];
};

type FunnelSummary = {
  signups: number;
  profilesCreated: number;
  usersStartedConversation: number;
  usersSentMessage: number;
  usersReceivedReply: number;
};

type RetentionSummary = {
  day: number;
  eligibleUsers: number;
  retainedUsers: number;
  retentionRate: number;
};

type DailyTrendPoint = {
  day: string;
  signups: number;
  profilesCreated: number;
  activeUsers: number;
  messagesSent: number;
  conversationsStarted: number;
  twoWayConversations: number;
};

export const adminRoutes = new Hono<{ Bindings: EnvBindings }>();

const adminProfileContentSchema = z.object({
  bio: z.string().trim().max(2000),
  promptEntries: z
    .array(
      z.object({
        question: z.string().trim().max(160),
        answer: z.string().trim().max(600),
      }),
    )
    .max(6),
});

adminRoutes.use("*", async (c, next) => {
  requireAdmin(c);
  await next();
});

function normalizeNumber(value: unknown) {
  return Number(value ?? 0);
}

function roundMetric(value: number, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

async function queryAll<T extends Record<string, unknown>>(
  env: EnvBindings,
  query: string,
  bindings: Array<string | number> = [],
) {
  const result = await env.DB.prepare(query).bind(...bindings).all<T>();
  return (result.results ?? []) as T[];
}

async function queryFirst<T extends Record<string, unknown>>(
  env: EnvBindings,
  query: string,
  bindings: Array<string | number> = [],
) {
  const rows = await queryAll<T>(env, query, bindings);
  return rows[0] ?? null;
}

async function getOverview(env: EnvBindings) {
  const now = Date.now();
  const row = await queryFirst<{
    totalUsers: number;
    totalProfiles: number;
    verifiedProfiles: number;
    openSupportTickets: number;
    totalReports: number;
    activeBoosts: number;
    fulfilledPurchases: number;
    revenueUsdCents: number;
  }>(
    env,
    `
      SELECT
        (SELECT COUNT(*) FROM users) AS totalUsers,
        (SELECT COUNT(*) FROM profiles) AS totalProfiles,
        (SELECT COUNT(*) FROM profiles WHERE verified_human_at IS NOT NULL) AS verifiedProfiles,
        (SELECT COUNT(*) FROM support_tickets WHERE status = 'open') AS openSupportTickets,
        (SELECT COUNT(*) FROM reports) AS totalReports,
        (SELECT COUNT(*) FROM boosts WHERE expires_at > ?) AS activeBoosts,
        (SELECT COUNT(*) FROM purchases WHERE status = 'fulfilled') AS fulfilledPurchases,
        (SELECT COALESCE(SUM(amount_cents), 0) FROM purchases WHERE status = 'fulfilled') AS revenueUsdCents
    `,
    [now],
  );

  return {
    totalUsers: normalizeNumber(row?.totalUsers),
    totalProfiles: normalizeNumber(row?.totalProfiles),
    verifiedProfiles: normalizeNumber(row?.verifiedProfiles),
    openSupportTickets: normalizeNumber(row?.openSupportTickets),
    totalReports: normalizeNumber(row?.totalReports),
    activeBoosts: normalizeNumber(row?.activeBoosts),
    fulfilledPurchases: normalizeNumber(row?.fulfilledPurchases),
    revenueUsdCents: normalizeNumber(row?.revenueUsdCents),
  };
}

async function getTopProfiles(env: EnvBindings) {
  const now = Date.now();
  const rows = await queryAll<{
    id: string;
    username: string;
    displayName: string;
    favoritesReceived: number;
    giftsReceived: number;
    reportsReceived: number;
    activeBoostCount: number;
    purchaseRevenueCents: number;
  }>(
    env,
    `
      WITH favorite_stats AS (
        SELECT target_profile_id AS profile_id, COUNT(*) AS favorites_received
        FROM favorites
        GROUP BY target_profile_id
      ),
      gift_stats AS (
        SELECT target_profile_id AS profile_id, COUNT(*) AS gifts_received
        FROM gifts
        GROUP BY target_profile_id
      ),
      report_stats AS (
        SELECT target_profile_id AS profile_id, COUNT(*) AS reports_received
        FROM reports
        GROUP BY target_profile_id
      ),
      boost_stats AS (
        SELECT profile_id, COUNT(*) AS active_boost_count
        FROM boosts
        WHERE expires_at > ?
        GROUP BY profile_id
      ),
      revenue_rows AS (
        SELECT buyer_profile_id AS profile_id, amount_cents
        FROM purchases
        WHERE status = 'fulfilled'
        UNION ALL
        SELECT target_profile_id AS profile_id, amount_cents
        FROM purchases
        WHERE status = 'fulfilled' AND target_profile_id IS NOT NULL
      ),
      revenue_stats AS (
        SELECT profile_id, COALESCE(SUM(amount_cents), 0) AS purchase_revenue_cents
        FROM revenue_rows
        GROUP BY profile_id
      )
      SELECT
        p.id AS id,
        p.username AS username,
        p.display_name AS displayName,
        COALESCE(fs.favorites_received, 0) AS favoritesReceived,
        COALESCE(gs.gifts_received, 0) AS giftsReceived,
        COALESCE(rs.reports_received, 0) AS reportsReceived,
        COALESCE(bs.active_boost_count, 0) AS activeBoostCount,
        COALESCE(rev.purchase_revenue_cents, 0) AS purchaseRevenueCents
      FROM profiles p
      LEFT JOIN favorite_stats fs ON fs.profile_id = p.id
      LEFT JOIN gift_stats gs ON gs.profile_id = p.id
      LEFT JOIN report_stats rs ON rs.profile_id = p.id
      LEFT JOIN boost_stats bs ON bs.profile_id = p.id
      LEFT JOIN revenue_stats rev ON rev.profile_id = p.id
      ORDER BY giftsReceived DESC, favoritesReceived DESC, purchaseRevenueCents DESC
      LIMIT 8
    `,
    [now],
  );

  return rows.map((row) => ({
    ...row,
    favoritesReceived: normalizeNumber(row.favoritesReceived),
    giftsReceived: normalizeNumber(row.giftsReceived),
    reportsReceived: normalizeNumber(row.reportsReceived),
    activeBoostCount: normalizeNumber(row.activeBoostCount),
    purchaseRevenueCents: normalizeNumber(row.purchaseRevenueCents),
  }));
}

async function getPeriodEngagement(
  env: EnvBindings,
  startMs: number,
  endMs: number,
): Promise<EngagementSummary> {
  const summaryRow = await queryFirst<{
    activeUsers: number;
    messagesSent: number;
    uniqueMessageSenders: number;
    activeConversations: number;
    newConversations: number;
    averageMessagesPerActiveConversation: number;
    medianMessagesPerActiveConversation: number;
    conversationsWith2PlusMessages: number;
    conversationsWith5PlusMessages: number;
    conversationsWith10PlusMessages: number;
    oneSidedConversations: number;
    twoWayConversations: number;
    replyRate: number;
  }>(
    env,
    `
      WITH period_messages AS (
        SELECT conversation_id, sender_profile_id, created_at
        FROM messages
        WHERE created_at >= ? AND created_at < ?
      ),
      active_conversation_stats AS (
        SELECT
          conversation_id,
          COUNT(*) AS message_count,
          COUNT(DISTINCT sender_profile_id) AS unique_senders
        FROM period_messages
        GROUP BY conversation_id
      ),
      median_message_counts AS (
        SELECT message_count
        FROM active_conversation_stats
        ORDER BY message_count
        LIMIT CASE
          WHEN (SELECT COUNT(*) FROM active_conversation_stats) % 2 = 0 THEN 2
          ELSE 1
        END
        OFFSET CASE
          WHEN (SELECT COUNT(*) FROM active_conversation_stats) = 0 THEN 0
          ELSE (SELECT (COUNT(*) - 1) / 2 FROM active_conversation_stats)
        END
      ),
      meaningful_profiles AS (
        SELECT id AS profile_id
        FROM profiles
        WHERE created_at >= ? AND created_at < ?
        UNION
        SELECT profile_a_id AS profile_id
        FROM conversations
        WHERE created_at >= ? AND created_at < ?
        UNION
        SELECT sender_profile_id AS profile_id
        FROM period_messages
        UNION
        SELECT profile_id
        FROM favorites
        WHERE created_at >= ? AND created_at < ?
      )
      SELECT
        COALESCE((SELECT COUNT(DISTINCT profile_id) FROM meaningful_profiles), 0) AS activeUsers,
        COALESCE((SELECT COUNT(*) FROM period_messages), 0) AS messagesSent,
        COALESCE((SELECT COUNT(DISTINCT sender_profile_id) FROM period_messages), 0) AS uniqueMessageSenders,
        COALESCE((SELECT COUNT(*) FROM active_conversation_stats), 0) AS activeConversations,
        COALESCE((SELECT COUNT(*) FROM conversations WHERE created_at >= ? AND created_at < ?), 0) AS newConversations,
        ROUND(COALESCE((SELECT AVG(message_count * 1.0) FROM active_conversation_stats), 0), 2) AS averageMessagesPerActiveConversation,
        ROUND(COALESCE((SELECT AVG(message_count * 1.0) FROM median_message_counts), 0), 2) AS medianMessagesPerActiveConversation,
        COALESCE((SELECT COUNT(*) FROM active_conversation_stats WHERE message_count >= 2), 0) AS conversationsWith2PlusMessages,
        COALESCE((SELECT COUNT(*) FROM active_conversation_stats WHERE message_count >= 5), 0) AS conversationsWith5PlusMessages,
        COALESCE((SELECT COUNT(*) FROM active_conversation_stats WHERE message_count >= 10), 0) AS conversationsWith10PlusMessages,
        COALESCE((SELECT COUNT(*) FROM active_conversation_stats WHERE unique_senders = 1), 0) AS oneSidedConversations,
        COALESCE((SELECT COUNT(*) FROM active_conversation_stats WHERE unique_senders >= 2), 0) AS twoWayConversations,
        ROUND(
          CASE
            WHEN (SELECT COUNT(*) FROM active_conversation_stats) = 0 THEN 0
            ELSE (
              (SELECT COUNT(*) FROM active_conversation_stats WHERE unique_senders >= 2) * 100.0
            ) / (SELECT COUNT(*) FROM active_conversation_stats)
          END,
          2
        ) AS replyRate
    `,
    [
      startMs,
      endMs,
      startMs,
      endMs,
      startMs,
      endMs,
      startMs,
      endMs,
      startMs,
      endMs,
    ],
  );

  const topConversations = await queryAll<TopConversationRow>(
    env,
    `
      WITH period_messages AS (
        SELECT conversation_id, sender_profile_id, created_at
        FROM messages
        WHERE created_at >= ? AND created_at < ?
      ),
      active_conversation_stats AS (
        SELECT
          conversation_id,
          COUNT(*) AS message_count,
          MAX(created_at) AS last_message_at
        FROM period_messages
        GROUP BY conversation_id
      )
      SELECT
        c.id AS conversationId,
        stats.message_count AS messageCount,
        c.created_at AS createdAt,
        stats.last_message_at AS lastMessageAt,
        profile_a.display_name AS profileADisplayName,
        profile_a.username AS profileAUsername,
        profile_b.display_name AS profileBDisplayName,
        profile_b.username AS profileBUsername
      FROM active_conversation_stats stats
      INNER JOIN conversations c ON c.id = stats.conversation_id
      INNER JOIN profiles profile_a ON profile_a.id = c.profile_a_id
      INNER JOIN profiles profile_b ON profile_b.id = c.profile_b_id
      ORDER BY stats.message_count DESC, stats.last_message_at DESC
      LIMIT 10
    `,
    [startMs, endMs],
  );

  return {
    activeUsers: normalizeNumber(summaryRow?.activeUsers),
    messagesSent: normalizeNumber(summaryRow?.messagesSent),
    uniqueMessageSenders: normalizeNumber(summaryRow?.uniqueMessageSenders),
    activeConversations: normalizeNumber(summaryRow?.activeConversations),
    newConversations: normalizeNumber(summaryRow?.newConversations),
    averageMessagesPerActiveConversation: roundMetric(
      normalizeNumber(summaryRow?.averageMessagesPerActiveConversation),
      2,
    ),
    medianMessagesPerActiveConversation: roundMetric(
      normalizeNumber(summaryRow?.medianMessagesPerActiveConversation),
      2,
    ),
    conversationsWith2PlusMessages: normalizeNumber(summaryRow?.conversationsWith2PlusMessages),
    conversationsWith5PlusMessages: normalizeNumber(summaryRow?.conversationsWith5PlusMessages),
    conversationsWith10PlusMessages: normalizeNumber(summaryRow?.conversationsWith10PlusMessages),
    oneSidedConversations: normalizeNumber(summaryRow?.oneSidedConversations),
    twoWayConversations: normalizeNumber(summaryRow?.twoWayConversations),
    replyRate: roundMetric(normalizeNumber(summaryRow?.replyRate), 2),
    topConversations: topConversations.map((row) => ({
      ...row,
      messageCount: normalizeNumber(row.messageCount),
      createdAt: normalizeNumber(row.createdAt),
      lastMessageAt: normalizeNumber(row.lastMessageAt),
    })),
  };
}

async function getPeriodSignupFunnel(
  env: EnvBindings,
  startMs: number,
  endMs: number,
): Promise<FunnelSummary> {
  const row = await queryFirst<{
    signups: number;
    profilesCreated: number;
    usersStartedConversation: number;
    usersSentMessage: number;
    usersReceivedReply: number;
  }>(
    env,
    `
      WITH cohort_users AS (
        SELECT id
        FROM users
        WHERE created_at >= ? AND created_at < ?
      ),
      cohort_profiles AS (
        SELECT p.id AS profile_id, p.user_id
        FROM profiles p
        INNER JOIN cohort_users u ON u.id = p.user_id
        WHERE p.created_at >= ? AND p.created_at < ?
      ),
      conversation_starters AS (
        SELECT DISTINCT cp.user_id
        FROM conversations c
        INNER JOIN cohort_profiles cp ON cp.profile_id = c.profile_a_id
        WHERE c.created_at >= ? AND c.created_at < ?
      ),
      message_senders AS (
        SELECT DISTINCT cp.user_id
        FROM messages m
        INNER JOIN cohort_profiles cp ON cp.profile_id = m.sender_profile_id
        WHERE m.created_at >= ? AND m.created_at < ?
      ),
      replied_users AS (
        SELECT DISTINCT cp.user_id
        FROM messages m
        INNER JOIN cohort_profiles cp ON cp.profile_id = m.sender_profile_id
        WHERE m.created_at >= ? AND m.created_at < ?
          AND EXISTS (
            SELECT 1
            FROM messages reply
            WHERE reply.conversation_id = m.conversation_id
              AND reply.sender_profile_id != m.sender_profile_id
              AND reply.created_at > m.created_at
              AND reply.created_at < ?
          )
      )
      SELECT
        COALESCE((SELECT COUNT(*) FROM cohort_users), 0) AS signups,
        COALESCE((SELECT COUNT(DISTINCT user_id) FROM cohort_profiles), 0) AS profilesCreated,
        COALESCE((SELECT COUNT(*) FROM conversation_starters), 0) AS usersStartedConversation,
        COALESCE((SELECT COUNT(*) FROM message_senders), 0) AS usersSentMessage,
        COALESCE((SELECT COUNT(*) FROM replied_users), 0) AS usersReceivedReply
    `,
    [
      startMs,
      endMs,
      startMs,
      endMs,
      startMs,
      endMs,
      startMs,
      endMs,
      startMs,
      endMs,
      endMs,
    ],
  );

  return {
    signups: normalizeNumber(row?.signups),
    profilesCreated: normalizeNumber(row?.profilesCreated),
    usersStartedConversation: normalizeNumber(row?.usersStartedConversation),
    usersSentMessage: normalizeNumber(row?.usersSentMessage),
    usersReceivedReply: normalizeNumber(row?.usersReceivedReply),
  };
}

async function getRetention(env: EnvBindings): Promise<RetentionSummary[]> {
  const milestones = [1, 7, 14, 30];

  const rows = await Promise.all(
    milestones.map(async (day) => {
      const row = await queryFirst<{
        eligibleUsers: number;
        retainedUsers: number;
        retentionRate: number;
      }>(
        env,
        `
          WITH meaningful_activity AS (
            SELECT user_id, created_at AS activity_at
            FROM profiles
            UNION ALL
            SELECT p.user_id, c.created_at AS activity_at
            FROM conversations c
            INNER JOIN profiles p ON p.id = c.profile_a_id
            UNION ALL
            SELECT p.user_id, m.created_at AS activity_at
            FROM messages m
            INNER JOIN profiles p ON p.id = m.sender_profile_id
            UNION ALL
            SELECT p.user_id, f.created_at AS activity_at
            FROM favorites f
            INNER JOIN profiles p ON p.id = f.profile_id
          ),
          eligible_users AS (
            SELECT id, created_at
            FROM users
            WHERE created_at <= ?
          ),
          retained_users AS (
            SELECT DISTINCT u.id
            FROM eligible_users u
            INNER JOIN meaningful_activity a ON a.user_id = u.id
            WHERE a.activity_at >= u.created_at + (? * ?)
              AND a.activity_at < u.created_at + ((? + 1) * ?)
          )
          SELECT
            COALESCE((SELECT COUNT(*) FROM eligible_users), 0) AS eligibleUsers,
            COALESCE((SELECT COUNT(*) FROM retained_users), 0) AS retainedUsers,
            ROUND(
              CASE
                WHEN (SELECT COUNT(*) FROM eligible_users) = 0 THEN 0
                ELSE ((SELECT COUNT(*) FROM retained_users) * 100.0) / (SELECT COUNT(*) FROM eligible_users)
              END,
              2
            ) AS retentionRate
        `,
        [Date.now() - day * DAY_MS, day, DAY_MS, day, DAY_MS],
      );

      return {
        day,
        eligibleUsers: normalizeNumber(row?.eligibleUsers),
        retainedUsers: normalizeNumber(row?.retainedUsers),
        retentionRate: roundMetric(normalizeNumber(row?.retentionRate), 2),
      };
    }),
  );

  return rows;
}

function createTrendMap(startMs: number) {
  const result = new Map<string, DailyTrendPoint>();
  const startDate = new Date(startMs);

  for (let index = 0; index < 30; index += 1) {
    const date = new Date(startDate.getTime() + index * DAY_MS);
    const day = date.toISOString().slice(0, 10);
    result.set(day, {
      day,
      signups: 0,
      profilesCreated: 0,
      activeUsers: 0,
      messagesSent: 0,
      conversationsStarted: 0,
      twoWayConversations: 0,
    });
  }

  return result;
}

async function getDailyTrends(env: EnvBindings, startMs: number, endMs: number) {
  const [signups, profilesCreated, activeUsers, messagesSent, conversationsStarted, twoWayConversations] =
    await Promise.all([
      queryAll<{ day: string; value: number }>(
        env,
        `
          SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS value
          FROM users
          WHERE created_at >= ? AND created_at < ?
          GROUP BY day
          ORDER BY day
        `,
        [startMs, endMs],
      ),
      queryAll<{ day: string; value: number }>(
        env,
        `
          SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS value
          FROM profiles
          WHERE created_at >= ? AND created_at < ?
          GROUP BY day
          ORDER BY day
        `,
        [startMs, endMs],
      ),
      queryAll<{ day: string; value: number }>(
        env,
        `
          WITH meaningful_activity AS (
            SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, id AS profile_id
            FROM profiles
            WHERE created_at >= ? AND created_at < ?
            UNION
            SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, profile_a_id AS profile_id
            FROM conversations
            WHERE created_at >= ? AND created_at < ?
            UNION
            SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, sender_profile_id AS profile_id
            FROM messages
            WHERE created_at >= ? AND created_at < ?
            UNION
            SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, profile_id
            FROM favorites
            WHERE created_at >= ? AND created_at < ?
          )
          SELECT day, COUNT(DISTINCT profile_id) AS value
          FROM meaningful_activity
          GROUP BY day
          ORDER BY day
        `,
        [startMs, endMs, startMs, endMs, startMs, endMs, startMs, endMs],
      ),
      queryAll<{ day: string; value: number }>(
        env,
        `
          SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS value
          FROM messages
          WHERE created_at >= ? AND created_at < ?
          GROUP BY day
          ORDER BY day
        `,
        [startMs, endMs],
      ),
      queryAll<{ day: string; value: number }>(
        env,
        `
          SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) AS value
          FROM conversations
          WHERE created_at >= ? AND created_at < ?
          GROUP BY day
          ORDER BY day
        `,
        [startMs, endMs],
      ),
      queryAll<{ day: string; value: number }>(
        env,
        `
          WITH daily_conversations AS (
            SELECT
              strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day,
              conversation_id,
              COUNT(DISTINCT sender_profile_id) AS unique_senders
            FROM messages
            WHERE created_at >= ? AND created_at < ?
            GROUP BY day, conversation_id
          )
          SELECT day, COUNT(*) AS value
          FROM daily_conversations
          WHERE unique_senders >= 2
          GROUP BY day
          ORDER BY day
        `,
        [startMs, endMs],
      ),
    ]);

  const trendMap = createTrendMap(startMs);
  const applySeries = (
    rows: Array<{ day: string; value: number }>,
    field: keyof Omit<DailyTrendPoint, "day">,
  ) => {
    rows.forEach((row) => {
      const day = trendMap.get(row.day);
      if (!day) {
        return;
      }

      day[field] = normalizeNumber(row.value);
    });
  };

  applySeries(signups, "signups");
  applySeries(profilesCreated, "profilesCreated");
  applySeries(activeUsers, "activeUsers");
  applySeries(messagesSent, "messagesSent");
  applySeries(conversationsStarted, "conversationsStarted");
  applySeries(twoWayConversations, "twoWayConversations");

  return Array.from(trendMap.values());
}

async function getRecentEvents(env: EnvBindings) {
  const db = getDb(env);
  const recentEvents = await db
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
    .limit(20);

  const referencedProfileIds = new Set<string>();

  recentEvents.forEach((event) => {
    if (event.profileId) {
      referencedProfileIds.add(event.profileId);
    }

    try {
      const parsed = JSON.parse(event.eventData) as Record<string, unknown>;
      if (typeof parsed.targetProfileId === "string") {
        referencedProfileIds.add(parsed.targetProfileId);
      }
    } catch {
      return;
    }
  });

  const profileRows =
    referencedProfileIds.size > 0
      ? await db
          .select({
            id: profiles.id,
            username: profiles.username,
            displayName: profiles.displayName,
          })
          .from(profiles)
          .where(inArray(profiles.id, Array.from(referencedProfileIds)))
      : [];

  const profileMap = new Map(
    profileRows.map((profile) => [profile.id, profile]),
  );

  return recentEvents.map((event) => {
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(event.eventData);
    } catch {
      parsed = {};
    }

    const targetProfileId =
      typeof parsed.targetProfileId === "string" ? parsed.targetProfileId : null;

    return {
      id: event.id,
      eventType: event.eventType,
      createdAt: event.createdAt,
      profile: event.profileId ? profileMap.get(event.profileId) ?? null : null,
      targetProfile: targetProfileId ? profileMap.get(targetProfileId) ?? null : null,
      data: parsed,
    };
  });
}

adminRoutes.get("/analytics", async (c) => {
  const now = Date.now();
  const sevenDaysAgo = now - DAY_MS * 7;
  const thirtyDaysAgo = now - DAY_MS * 30;

  const [
    overview,
    topProfiles,
    recentEvents,
    engagementLast7d,
    engagementLast30d,
    signupFunnelLast7d,
    signupFunnelLast30d,
    retention,
    dailyTrends,
  ] = await Promise.all([
    getOverview(c.env),
    getTopProfiles(c.env),
    getRecentEvents(c.env),
    getPeriodEngagement(c.env, sevenDaysAgo, now),
    getPeriodEngagement(c.env, thirtyDaysAgo, now),
    getPeriodSignupFunnel(c.env, sevenDaysAgo, now),
    getPeriodSignupFunnel(c.env, thirtyDaysAgo, now),
    getRetention(c.env),
    getDailyTrends(c.env, thirtyDaysAgo, now),
  ]);

  const purchasesLast7d = await queryFirst<{
    giftsPurchased: number;
    boostsPurchased: number;
    revenueUsdCents: number;
  }>(
    c.env,
    `
      SELECT
        COALESCE(SUM(CASE WHEN product_kind = 'gift' AND status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS giftsPurchased,
        COALESCE(SUM(CASE WHEN product_kind = 'boost' AND status = 'fulfilled' THEN 1 ELSE 0 END), 0) AS boostsPurchased,
        COALESCE(SUM(CASE WHEN status = 'fulfilled' THEN amount_cents ELSE 0 END), 0) AS revenueUsdCents
      FROM purchases
      WHERE created_at >= ? AND created_at < ?
    `,
    [sevenDaysAgo, now],
  );

  const passwordResetRequestsLast7d = await queryFirst<{ value: number }>(
    c.env,
    `
      SELECT COUNT(*) AS value
      FROM event_logs
      WHERE event_type = 'password_reset_requested'
        AND created_at >= ? AND created_at < ?
    `,
    [sevenDaysAgo, now],
  );

  return c.json({
    overview,
    funnelLast7d: {
      signups: signupFunnelLast7d.signups,
      profilesCreated: signupFunnelLast7d.profilesCreated,
      conversationsStarted: signupFunnelLast7d.usersStartedConversation,
      giftsPurchased: normalizeNumber(purchasesLast7d?.giftsPurchased),
      boostsPurchased: normalizeNumber(purchasesLast7d?.boostsPurchased),
      passwordResetRequests: normalizeNumber(passwordResetRequestsLast7d?.value),
      revenueUsdCents: normalizeNumber(purchasesLast7d?.revenueUsdCents),
    },
    engagement: {
      last7d: engagementLast7d,
      last30d: engagementLast30d,
    },
    signupFunnels: {
      last7d: signupFunnelLast7d,
      last30d: signupFunnelLast30d,
    },
    retention,
    dailyTrends,
    topProfiles,
    recentEvents,
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
          bio: profiles.bio,
          promptEntries: profiles.promptEntries,
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
        targetProfile: targetProfile
          ? {
              ...targetProfile,
              promptEntries: JSON.parse(targetProfile.promptEntries) as Array<{
                question: string;
                answer: string;
              }>,
            }
          : null,
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

adminRoutes.get("/conversations/:conversationId", async (c) => {
  const db = getDb(c.env);
  const conversationId = c.req.param("conversationId");

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return c.json({ error: "Conversation not found." }, 404);
  }

  const participants = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
    })
    .from(profiles)
    .where(inArray(profiles.id, [conversation.profileAId, conversation.profileBId]));

  const participantMap = new Map(
    participants.map((participant) => [participant.id, participant]),
  );

  const conversationMessages = await db
    .select({
      id: messages.id,
      senderProfileId: messages.senderProfileId,
      body: messages.body,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  return c.json({
    conversation: {
      id: conversation.id,
      createdAt: conversation.createdAt,
      participants: [
        participantMap.get(conversation.profileAId) ?? null,
        participantMap.get(conversation.profileBId) ?? null,
      ],
      messages: conversationMessages.map((message) => ({
        ...message,
        sender:
          participantMap.get(message.senderProfileId) ?? null,
      })),
    },
  });
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

adminRoutes.post("/profiles/:profileId/content", async (c) => {
  const payload = adminProfileContentSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid profile content payload." }, 400);
  }

  const cleanedPromptEntries = payload.data.promptEntries
    .map((entry) => ({
      question: entry.question.trim(),
      answer: entry.answer.trim(),
    }))
    .filter((entry) => entry.question && entry.answer);

  const blockedField = [
    payload.data.bio,
    ...cleanedPromptEntries.flatMap((entry) => [entry.question, entry.answer]),
  ].find((value) => containsBlockedContactInfo(value));

  if (blockedField) {
    return c.json(
      {
        error:
          "Profile content still contains off-app contact details. Remove email, links, handles, or obfuscated contact info first.",
      },
      400,
    );
  }

  const db = getDb(c.env);
  const profileId = c.req.param("profileId");
  const now = Date.now();

  await db
    .update(profiles)
    .set({
      bio: payload.data.bio.trim(),
      promptEntries: JSON.stringify(cleanedPromptEntries),
      updatedAt: now,
    })
    .where(eq(profiles.id, profileId));

  const [updatedProfile] = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      bio: profiles.bio,
      promptEntries: profiles.promptEntries,
      verifiedHumanAt: profiles.verifiedHumanAt,
      suspendedAt: profiles.suspendedAt,
    })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);

  if (!updatedProfile) {
    return c.json({ error: "Profile not found." }, 404);
  }

  return c.json({
    ok: true,
    profile: {
      ...updatedProfile,
      promptEntries: JSON.parse(updatedProfile.promptEntries) as Array<{
        question: string;
        answer: string;
      }>,
    },
  });
});
