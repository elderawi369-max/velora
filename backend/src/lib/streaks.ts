import { and, eq, isNull, lt } from "drizzle-orm";
import { profiles, users } from "../db/schema";
import type { EnvBindings } from "./db";
import { getDb } from "./db";
import { logEvent } from "./analytics";
import { createNotification } from "./commerce";
import { sendPushToUser } from "./push";

export const loginStreakTargetDays = 5;
export const loginStreakRewardCredits = 1;
const dayMs = 1000 * 60 * 60 * 24;

type LoginStreakStatus = {
  currentDays: number;
  targetDays: number;
  daysRemaining: number;
  checkedInToday: boolean;
  rewardCredits: number;
  rewardEarnedToday: boolean;
};

type LoginStreakGrant = {
  credits: number;
  grantedAt: number;
  streakDays: number;
};

function getUtcDayNumber(timestamp = Date.now()) {
  return Math.floor(timestamp / dayMs);
}

function buildStatus(input: {
  streakCount: number;
  lastCheckInDay: number | null;
  lastRewardedDay: number | null;
  todayDay: number;
}) {
  const rewardEarnedToday = input.lastRewardedDay === input.todayDay;
  const currentDays = rewardEarnedToday
    ? loginStreakTargetDays
    : Math.min(input.streakCount, loginStreakTargetDays);
  const checkedInToday = rewardEarnedToday || input.lastCheckInDay === input.todayDay;

  return {
    currentDays,
    targetDays: loginStreakTargetDays,
    daysRemaining: Math.max(loginStreakTargetDays - currentDays, 0),
    checkedInToday,
    rewardCredits: loginStreakRewardCredits,
    rewardEarnedToday,
  } satisfies LoginStreakStatus;
}

export async function maybeProcessLoginStreak(
  env: EnvBindings,
  userId: string,
) {
  const db = getDb(env);
  const [row] = await db
    .select({
      userId: users.id,
      userEmail: users.email,
      userUpdatedAt: users.updatedAt,
      streakCount: users.loginStreakCount,
      lastCheckInDay: users.loginStreakLastCheckInDay,
      lastRewardedDay: users.loginStreakLastRewardedDay,
      profileId: profiles.id,
      suspendedAt: profiles.suspendedAt,
    })
    .from(users)
    .leftJoin(profiles, eq(profiles.userId, users.id))
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  const todayDay = getUtcDayNumber();
  if (row.lastCheckInDay === todayDay) {
    return {
      status: buildStatus({
        streakCount: row.streakCount ?? 0,
        lastCheckInDay: row.lastCheckInDay ?? null,
        lastRewardedDay: row.lastRewardedDay ?? null,
        todayDay,
      }),
      grant: null,
    };
  }

  const previousDay = todayDay - 1;
  const nextStreakCount = row.lastCheckInDay === previousDay
    ? (row.streakCount ?? 0) + 1
    : 1;
  const canReward =
    Boolean(row.profileId) &&
    !row.suspendedAt &&
    nextStreakCount >= loginStreakTargetDays &&
    row.lastRewardedDay !== todayDay;
  const now = Date.now();

  const updateResult = await env.DB.prepare(
    `
      UPDATE users
      SET
        login_streak_count = ?,
        login_streak_last_check_in_day = ?,
        login_streak_last_rewarded_day = ?,
        updated_at = ?
      WHERE id = ?
        AND (login_streak_last_check_in_day IS NULL OR login_streak_last_check_in_day != ?)
    `,
  )
    .bind(
      canReward ? 0 : nextStreakCount,
      todayDay,
      canReward ? todayDay : row.lastRewardedDay ?? null,
      now,
      userId,
      todayDay,
    )
    .run();

  if (!updateResult.meta.changes) {
    const [freshRow] = await db
      .select({
        streakCount: users.loginStreakCount,
        lastCheckInDay: users.loginStreakLastCheckInDay,
        lastRewardedDay: users.loginStreakLastRewardedDay,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    return {
      status: buildStatus({
        streakCount: freshRow?.streakCount ?? 0,
        lastCheckInDay: freshRow?.lastCheckInDay ?? null,
        lastRewardedDay: freshRow?.lastRewardedDay ?? null,
        todayDay,
      }),
      grant: null,
    };
  }

  await logEvent(env, {
    eventType: "login_streak_check_in",
    userId,
    profileId: row.profileId ?? null,
    eventData: {
      streakCount: nextStreakCount,
      rewarded: canReward,
    },
  });

  let grant: LoginStreakGrant | null = null;
  if (canReward && row.profileId) {
    await env.DB.prepare(
      `
        UPDATE profiles
        SET challenge_credits = challenge_credits + ?, updated_at = ?
        WHERE id = ?
      `,
    )
      .bind(loginStreakRewardCredits, now, row.profileId)
      .run();

    await createNotification(env, {
      profileId: row.profileId,
      actorProfileId: row.profileId,
      type: "streak_reward",
    });

    await logEvent(env, {
      eventType: "login_streak_reward_granted",
      userId,
      profileId: row.profileId,
      eventData: {
        credits: loginStreakRewardCredits,
        streakDays: loginStreakTargetDays,
      },
    });

    grant = {
      credits: loginStreakRewardCredits,
      grantedAt: now,
      streakDays: loginStreakTargetDays,
    };
  }

  return {
    status: buildStatus({
      streakCount: canReward ? 0 : nextStreakCount,
      lastCheckInDay: todayDay,
      lastRewardedDay: canReward ? todayDay : row.lastRewardedDay ?? null,
      todayDay,
    }),
    grant,
  };
}

export async function sendLoginStreakReminders(env: EnvBindings) {
  const db = getDb(env);
  const todayDay = getUtcDayNumber();
  const yesterdayDay = todayDay - 1;
  const rows = await db
    .select({
      userId: users.id,
      profileId: profiles.id,
      streakCount: users.loginStreakCount,
      lastReminderDay: users.loginStreakLastReminderDay,
    })
    .from(users)
    .innerJoin(profiles, eq(profiles.userId, users.id))
    .where(
      and(
        isNull(profiles.suspendedAt),
        eq(users.loginStreakLastCheckInDay, yesterdayDay),
        lt(users.loginStreakCount, loginStreakTargetDays),
      ),
    );

  for (const row of rows) {
    if (!row.profileId || !row.streakCount) {
      continue;
    }
    if (row.lastReminderDay === todayDay) {
      continue;
    }

    await sendPushToUser(env, row.userId, {
      title: "Keep your Velora streak alive",
      body: `Day ${row.streakCount} of ${loginStreakTargetDays}. Open Velora today to keep the streak and earn ${loginStreakRewardCredits} Challenge Credit.`,
      link: "/",
    }).catch(() => undefined);

    await db
      .update(users)
      .set({
        loginStreakLastReminderDay: todayDay,
        updatedAt: Date.now(),
      })
      .where(eq(users.id, row.userId));

    await logEvent(env, {
      eventType: "login_streak_reminder_sent",
      userId: row.userId,
      profileId: row.profileId,
      eventData: {
        streakCount: row.streakCount,
      },
    });
  }
}
