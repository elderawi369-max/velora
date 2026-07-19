import { Hono } from "hono";
import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  challengeSessions,
  liveTriviaAnswers,
  liveTriviaMatches,
  liveTriviaQueue,
  profiles,
} from "../db/schema";
import type { EnvBindings } from "../lib/db";
import { getDb } from "../lib/db";
import {
  selectTriviaQuestions,
  type TriviaQuestion,
} from "../lib/challenges";
import { getOwnProfileContext } from "../lib/profile-context";
import { areProfilesBlocked } from "../lib/relationships";

const liveTriviaPresenceTtlMs = 1000 * 60 * 60 * 12;
const liveTriviaMatchStaleMs = 1000 * 60 * 10;
const liveTriviaRoundDurationMs = 1000 * 75;

const submitAnswerSchema = z.object({
  questionIndex: z.number().int().min(0),
  answerIndex: z.number().int().min(0).max(3),
});

const directMatchSchema = z.object({
  targetProfileId: z.string().trim().min(1),
});

type LiveTriviaMatchRow = typeof liveTriviaMatches.$inferSelect;
type LiveTriviaAnswerRow = typeof liveTriviaAnswers.$inferSelect;

export const liveTriviaRoutes = new Hono<{ Bindings: EnvBindings }>();

function parseQuestionSet(questionSet: string) {
  return JSON.parse(questionSet) as TriviaQuestion[];
}

function sanitizeQuestion(question: TriviaQuestion) {
  return {
    id: question.id,
    prompt: question.prompt,
    options: question.options,
    category: question.category,
  };
}

async function getRecentTriviaQuestionIds(
  env: EnvBindings,
  ownProfileId: string,
  targetProfileId: string,
) {
  const db = getDb(env);

  const recentLiveMatches = await db
    .select({ questionSet: liveTriviaMatches.questionSet })
    .from(liveTriviaMatches)
    .where(
      or(
        and(
          eq(liveTriviaMatches.playerAId, ownProfileId),
          eq(liveTriviaMatches.playerBId, targetProfileId),
        ),
        and(
          eq(liveTriviaMatches.playerAId, targetProfileId),
          eq(liveTriviaMatches.playerBId, ownProfileId),
        ),
      ),
    )
    .orderBy(desc(liveTriviaMatches.createdAt))
    .limit(6);

  const recentTriviaChallenges = await db
    .select({ questionSet: challengeSessions.questionSet })
    .from(challengeSessions)
    .where(
      and(
        eq(challengeSessions.type, "trivia"),
        or(
          and(
            eq(challengeSessions.senderProfileId, ownProfileId),
            eq(challengeSessions.recipientProfileId, targetProfileId),
          ),
          and(
            eq(challengeSessions.senderProfileId, targetProfileId),
            eq(challengeSessions.recipientProfileId, ownProfileId),
          ),
        ),
      ),
    )
    .orderBy(desc(challengeSessions.createdAt))
    .limit(6);

  const ids: string[] = [];

  for (const row of [...recentLiveMatches, ...recentTriviaChallenges]) {
    try {
      const questions = parseQuestionSet(row.questionSet);
      ids.push(...questions.map((question) => question.id));
    } catch {
      continue;
    }
  }

  return ids;
}

async function getParticipantMap(env: EnvBindings, profileIds: string[]) {
  if (profileIds.length === 0) {
    return new Map();
  }

  const db = getDb(env);
  const rows = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
      identity: profiles.identity,
      avatarPreset: profiles.avatarPreset,
    })
    .from(profiles)
    .where(inArray(profiles.id, profileIds));

  return new Map(rows.map((row) => [row.id, row]));
}

async function cleanupStalePresence(env: EnvBindings) {
  const db = getDb(env);
  const now = Date.now();
  const queueCutoff = now - liveTriviaPresenceTtlMs;
  const matchCutoff = now - liveTriviaMatchStaleMs;

  await db.delete(liveTriviaQueue).where(sql`${liveTriviaQueue.heartbeatAt} < ${queueCutoff}`);
  await db
    .update(liveTriviaMatches)
    .set({
      status: "abandoned",
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(liveTriviaMatches.status, "active"),
        sql`${liveTriviaMatches.updatedAt} < ${matchCutoff}`,
      ),
    );
}

async function findOwnActiveMatch(env: EnvBindings, ownProfileId: string) {
  const db = getDb(env);
  const [row] = await db
    .select()
    .from(liveTriviaMatches)
    .where(
      and(
        eq(liveTriviaMatches.status, "active"),
        or(
          eq(liveTriviaMatches.playerAId, ownProfileId),
          eq(liveTriviaMatches.playerBId, ownProfileId),
        ),
      ),
    )
    .orderBy(desc(liveTriviaMatches.updatedAt))
    .limit(1);

  return row ?? null;
}

async function findOwnVisibleMatch(env: EnvBindings, ownProfileId: string) {
  const db = getDb(env);
  const [row] = await db
    .select()
    .from(liveTriviaMatches)
    .where(
      and(
        inArray(liveTriviaMatches.status, ["pending", "active", "completed"]),
        or(
          eq(liveTriviaMatches.playerAId, ownProfileId),
          eq(liveTriviaMatches.playerBId, ownProfileId),
        ),
      ),
    )
    .orderBy(desc(liveTriviaMatches.updatedAt))
    .limit(1);

  return row ?? null;
}

function getAnswersForQuestion(
  answers: LiveTriviaAnswerRow[],
  questionIndex: number,
) {
  return answers.filter((answer) => answer.questionIndex === questionIndex);
}

function getProfileAnswers(
  answers: LiveTriviaAnswerRow[],
  profileId: string,
) {
  return answers.filter((answer) => answer.profileId === profileId);
}

function getQuestionProgress(
  questions: TriviaQuestion[],
  answers: LiveTriviaAnswerRow[],
  profileId: string,
) {
  const profileAnswers = getProfileAnswers(answers, profileId);
  const currentQuestionIndex = Math.min(profileAnswers.length, questions.length);
  const complete = currentQuestionIndex >= questions.length;
  const currentAnswers = complete ? [] : getAnswersForQuestion(answers, currentQuestionIndex);

  return {
    currentQuestionIndex,
    currentAnswers,
    answeredCount: profileAnswers.length,
    complete,
  };
}

async function reconcileLiveTriviaMatch(
  env: EnvBindings,
  match: LiveTriviaMatchRow,
) {
  if (match.status !== "active") {
    return match;
  }

  const db = getDb(env);
  const answers = await db
    .select()
    .from(liveTriviaAnswers)
    .where(eq(liveTriviaAnswers.matchId, match.id))
    .orderBy(asc(liveTriviaAnswers.questionIndex), asc(liveTriviaAnswers.createdAt));
  const questions = parseQuestionSet(match.questionSet);
  const ownAProgress = getQuestionProgress(questions, answers, match.playerAId);
  const ownBProgress = getQuestionProgress(questions, answers, match.playerBId);
  const now = Date.now();
  const roundDeadlineAt = match.startedAt + liveTriviaRoundDurationMs;

  if ((now >= roundDeadlineAt || (ownAProgress.complete && ownBProgress.complete)) && match.status === "active") {
    const nextMatch = {
      ...match,
      status: "completed",
      completedAt: now,
      updatedAt: now,
    } satisfies LiveTriviaMatchRow;

    await db
      .update(liveTriviaMatches)
      .set({
        status: nextMatch.status,
        completedAt: nextMatch.completedAt,
        updatedAt: nextMatch.updatedAt,
      })
      .where(eq(liveTriviaMatches.id, nextMatch.id));

    return nextMatch;
  }

  return match;
}

async function buildLiveTriviaMatchView(
  env: EnvBindings,
  match: LiveTriviaMatchRow,
  ownProfileId: string,
) {
  const db = getDb(env);
  const currentMatch = await reconcileLiveTriviaMatch(env, match);
  const questions = parseQuestionSet(currentMatch.questionSet);
  const answers = await db
    .select()
    .from(liveTriviaAnswers)
    .where(eq(liveTriviaAnswers.matchId, currentMatch.id))
    .orderBy(asc(liveTriviaAnswers.questionIndex), asc(liveTriviaAnswers.createdAt));

  const otherProfileId =
    currentMatch.playerAId === ownProfileId ? currentMatch.playerBId : currentMatch.playerAId;
  const participantMap = await getParticipantMap(env, [otherProfileId]);
  const ownProgress = getQuestionProgress(questions, answers, ownProfileId);
  const otherProgress = getQuestionProgress(questions, answers, otherProfileId);
  const ownScore = answers.filter((answer) => answer.profileId === ownProfileId && answer.isCorrect === 1).length;
  const otherScore = answers.filter((answer) => answer.profileId === otherProfileId && answer.isCorrect === 1).length;
  const roundDeadlineAt = currentMatch.status === "active"
    ? currentMatch.startedAt + liveTriviaRoundDurationMs
    : null;
  const roundExpired = Boolean(roundDeadlineAt && Date.now() >= roundDeadlineAt);
  const ownRoundComplete = ownProgress.complete || roundExpired || currentMatch.status !== "active";
  const finished =
    currentMatch.status !== "pending" &&
    currentMatch.status !== "active"
      ? true
      : roundExpired || (ownProgress.complete && otherProgress.complete);

  return {
    id: currentMatch.id,
    status: currentMatch.status,
    isInviter: currentMatch.playerAId === ownProfileId,
    isInviteRecipient: currentMatch.playerBId === ownProfileId,
    createdAt: currentMatch.createdAt,
    startedAt: currentMatch.startedAt,
    completedAt: currentMatch.completedAt,
    updatedAt: currentMatch.updatedAt,
    otherProfile: participantMap.get(otherProfileId) ?? null,
    questionCount: questions.length,
    currentQuestionIndex: ownProgress.currentQuestionIndex,
    currentQuestion:
      currentMatch.status !== "active" || ownRoundComplete
        ? null
        : sanitizeQuestion(questions[ownProgress.currentQuestionIndex]!),
    roundDurationMs: liveTriviaRoundDurationMs,
    roundDeadlineAt,
    ownAnsweredCount: ownProgress.answeredCount,
    otherAnsweredCount: otherProgress.answeredCount,
    ownScore,
    otherScore,
    finished,
    winner:
      currentMatch.status === "pending" || !finished
        ? null
        : ownScore === otherScore
          ? "tie"
          : ownScore > otherScore
            ? "you"
            : "other",
    correctAnswers:
      currentMatch.status === "pending" || !finished
      ? []
      : questions.map((question) => ({
          questionId: question.id,
          prompt: question.prompt,
          answer: question.options[question.correctAnswerIndex] ?? "Unknown",
          category: question.category,
        })),
  };
}

async function buildStatus(env: EnvBindings, ownProfileId: string) {
  await cleanupStalePresence(env);
  const db = getDb(env);
  const now = Date.now();

  await db
    .update(liveTriviaQueue)
    .set({ heartbeatAt: now })
    .where(eq(liveTriviaQueue.profileId, ownProfileId));

  const activeMatch = await findOwnActiveMatch(env, ownProfileId);
  if (activeMatch) {
    const reconciledMatch = await reconcileLiveTriviaMatch(env, activeMatch);
    await db
      .update(liveTriviaMatches)
      .set({ updatedAt: now })
      .where(eq(liveTriviaMatches.id, reconciledMatch.id));
  }

  const [queueEntry] = await db
    .select()
    .from(liveTriviaQueue)
    .where(eq(liveTriviaQueue.profileId, ownProfileId))
    .limit(1);

  const queueRows = await db
    .select({ profileId: liveTriviaQueue.profileId })
    .from(liveTriviaQueue)
    .where(sql`${liveTriviaQueue.heartbeatAt} >= ${now - liveTriviaPresenceTtlMs}`);

  const activeMatches = await db
    .select({
      playerAId: liveTriviaMatches.playerAId,
      playerBId: liveTriviaMatches.playerBId,
    })
    .from(liveTriviaMatches)
    .where(
      and(
        eq(liveTriviaMatches.status, "active"),
        sql`${liveTriviaMatches.updatedAt} >= ${now - liveTriviaPresenceTtlMs}`,
      ),
    );

  const onlineProfileIds = Array.from(
    new Set([
      ...queueRows.map((row) => row.profileId),
      ...activeMatches.flatMap((row) => [row.playerAId, row.playerBId]),
    ]),
  );
  const participantMap = await getParticipantMap(env, onlineProfileIds);
  const [ownProfile] = await db
    .select({ challengeCredits: profiles.challengeCredits })
    .from(profiles)
    .where(eq(profiles.id, ownProfileId))
    .limit(1);
  const visibleMatch = await findOwnVisibleMatch(env, ownProfileId);

  return {
    activePlayerCount: onlineProfileIds.length,
    creditBalance: ownProfile?.challengeCredits ?? 0,
    onlineProfiles: onlineProfileIds
      .filter((profileId) => profileId !== ownProfileId)
      .map((profileId) => participantMap.get(profileId))
      .filter((profile): profile is NonNullable<typeof profile> => Boolean(profile)),
    queued: Boolean(queueEntry),
    queueJoinedAt: queueEntry?.joinedAt ?? null,
    match: visibleMatch ? await buildLiveTriviaMatchView(env, visibleMatch, ownProfileId) : null,
  };
}

liveTriviaRoutes.get("/status", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  return c.json(await buildStatus(c.env, own.profileId));
});

liveTriviaRoutes.post("/queue", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const now = Date.now();
  const activeMatch = await findOwnActiveMatch(c.env, own.profileId);
  if (activeMatch) {
    return c.json(await buildStatus(c.env, own.profileId));
  }

  const [existing] = await db
    .select()
    .from(liveTriviaQueue)
    .where(eq(liveTriviaQueue.profileId, own.profileId))
    .limit(1);

  if (existing) {
    await db
      .update(liveTriviaQueue)
      .set({ heartbeatAt: now })
      .where(eq(liveTriviaQueue.profileId, own.profileId));
  } else {
    await db.insert(liveTriviaQueue).values({
      profileId: own.profileId,
      joinedAt: now,
      heartbeatAt: now,
    });
  }

  return c.json(await buildStatus(c.env, own.profileId));
});

liveTriviaRoutes.post("/match", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = directMatchSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid live trivia target." }, 400);
  }

  if (payload.data.targetProfileId === own.profileId) {
    return c.json({ error: "You cannot start a live round with yourself." }, 400);
  }

  if (await areProfilesBlocked(c.env, own.profileId, payload.data.targetProfileId)) {
    return c.json({ error: "This live round is unavailable." }, 403);
  }

  const db = getDb(c.env);
  const now = Date.now();

  const existingOwnMatch = await findOwnActiveMatch(c.env, own.profileId);
  if (existingOwnMatch) {
    return c.json({ error: "You already have an active live round." }, 409);
  }

  const existingTargetMatch = await findOwnActiveMatch(c.env, payload.data.targetProfileId);
  if (existingTargetMatch) {
    return c.json({ error: "That player is already in another live round." }, 409);
  }

  const [existingPendingInvite] = await db
    .select()
    .from(liveTriviaMatches)
    .where(
      and(
        eq(liveTriviaMatches.status, "pending"),
        or(
          and(
            eq(liveTriviaMatches.playerAId, own.profileId),
            eq(liveTriviaMatches.playerBId, payload.data.targetProfileId),
          ),
          and(
            eq(liveTriviaMatches.playerAId, payload.data.targetProfileId),
            eq(liveTriviaMatches.playerBId, own.profileId),
          ),
        ),
      ),
    )
    .limit(1);

  if (existingPendingInvite) {
    return c.json({ error: "There is already a pending live invite between you." }, 409);
  }

  const [ownProfile] = await db
    .select({ challengeCredits: profiles.challengeCredits })
    .from(profiles)
    .where(eq(profiles.id, own.profileId))
    .limit(1);

  if (!ownProfile || ownProfile.challengeCredits < 1) {
    return c.json(
      { error: "You need at least 1 challenge credit before starting a live round." },
      402,
    );
  }

  const recentQuestionIds = await getRecentTriviaQuestionIds(
    c.env,
    own.profileId,
    payload.data.targetProfileId,
  );
  const matchId = crypto.randomUUID();
  await db.insert(liveTriviaMatches).values({
    id: matchId,
    status: "pending",
    playerAId: own.profileId,
    playerBId: payload.data.targetProfileId,
    questionSet: JSON.stringify(await selectTriviaQuestions(c.env, recentQuestionIds)),
    createdAt: now,
    startedAt: now,
    currentQuestionStartedAt: now,
    completedAt: null,
    updatedAt: now,
  });

  await db.delete(liveTriviaQueue).where(eq(liveTriviaQueue.profileId, own.profileId));

  return c.json(await buildStatus(c.env, own.profileId));
});

liveTriviaRoutes.post("/matches/:matchId/accept", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [match] = await db
    .select()
    .from(liveTriviaMatches)
    .where(eq(liveTriviaMatches.id, c.req.param("matchId")))
    .limit(1);

  if (!match) {
    return c.json({ error: "Live match not found." }, 404);
  }

  if (match.playerBId !== own.profileId) {
    return c.json({ error: "Only the invited person can accept this live round." }, 403);
  }

  if (match.status !== "pending") {
    return c.json({ error: "This live invite is no longer pending." }, 400);
  }

  const [inviterProfile] = await db
    .select({ challengeCredits: profiles.challengeCredits })
    .from(profiles)
    .where(eq(profiles.id, match.playerAId))
    .limit(1);

  if (!inviterProfile || inviterProfile.challengeCredits < 1) {
    await db
      .update(liveTriviaMatches)
      .set({
        status: "abandoned",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      })
      .where(eq(liveTriviaMatches.id, match.id));
    return c.json({ error: "The inviter no longer has a credit ready for this live round." }, 409);
  }

  const now = Date.now();
  await db
    .update(liveTriviaMatches)
    .set({
      status: "active",
      startedAt: now,
      currentQuestionStartedAt: now,
      updatedAt: now,
    })
    .where(eq(liveTriviaMatches.id, match.id));

  await db
    .update(profiles)
    .set({
      challengeCredits: inviterProfile.challengeCredits - 1,
      updatedAt: now,
    })
    .where(eq(profiles.id, match.playerAId));

  await db
    .delete(liveTriviaQueue)
    .where(inArray(liveTriviaQueue.profileId, [match.playerAId, match.playerBId]));

  return c.json(await buildStatus(c.env, own.profileId));
});

liveTriviaRoutes.post("/matches/:matchId/decline", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [match] = await db
    .select()
    .from(liveTriviaMatches)
    .where(eq(liveTriviaMatches.id, c.req.param("matchId")))
    .limit(1);

  if (!match) {
    return c.json({ error: "Live match not found." }, 404);
  }

  if (match.playerBId !== own.profileId) {
    return c.json({ error: "Only the invited person can decline this live round." }, 403);
  }

  if (match.status !== "pending") {
    return c.json({ error: "This live invite is no longer pending." }, 400);
  }

  await db
    .update(liveTriviaMatches)
    .set({
      status: "dismissed",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    })
    .where(eq(liveTriviaMatches.id, match.id));

  return c.json(await buildStatus(c.env, own.profileId));
});

liveTriviaRoutes.post("/leave", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  await db.delete(liveTriviaQueue).where(eq(liveTriviaQueue.profileId, own.profileId));
  return c.json(await buildStatus(c.env, own.profileId));
});

liveTriviaRoutes.post("/matches/:matchId/answer", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = submitAnswerSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid answer payload." }, 400);
  }

  const db = getDb(c.env);
  const [match] = await db
    .select()
    .from(liveTriviaMatches)
    .where(eq(liveTriviaMatches.id, c.req.param("matchId")))
    .limit(1);

  if (!match) {
    return c.json({ error: "Live match not found." }, 404);
  }

  if (match.playerAId !== own.profileId && match.playerBId !== own.profileId) {
    return c.json({ error: "Forbidden." }, 403);
  }

  const currentMatch = await reconcileLiveTriviaMatch(c.env, match);

  if (currentMatch.status !== "active") {
    return c.json({ error: "This live round is no longer active." }, 400);
  }

  const currentTime = Date.now();
  if (currentTime >= currentMatch.startedAt + liveTriviaRoundDurationMs) {
    const completedMatch = await reconcileLiveTriviaMatch(c.env, currentMatch);
    return c.json({
      match: await buildLiveTriviaMatchView(c.env, completedMatch, own.profileId),
    });
  }

  const questions = parseQuestionSet(currentMatch.questionSet);
  const answers = await db
    .select()
    .from(liveTriviaAnswers)
    .where(eq(liveTriviaAnswers.matchId, currentMatch.id))
    .orderBy(asc(liveTriviaAnswers.questionIndex), asc(liveTriviaAnswers.createdAt));
  const progress = getQuestionProgress(questions, answers, own.profileId);

  if (payload.data.questionIndex >= questions.length) {
    return c.json({ error: "Question not found." }, 400);
  }

  if (progress.complete || payload.data.questionIndex !== progress.currentQuestionIndex) {
    return c.json({ error: "That question is no longer active." }, 409);
  }

  const question = questions[progress.currentQuestionIndex]!;
  const [existing] = await db
    .select()
    .from(liveTriviaAnswers)
    .where(
      and(
        eq(liveTriviaAnswers.matchId, currentMatch.id),
        eq(liveTriviaAnswers.profileId, own.profileId),
        eq(liveTriviaAnswers.questionIndex, progress.currentQuestionIndex),
      ),
    )
    .limit(1);

  if (existing) {
    return c.json({ error: "You already answered this question." }, 409);
  }

  const now = Date.now();
  await db.insert(liveTriviaAnswers).values({
    id: crypto.randomUUID(),
    matchId: currentMatch.id,
    profileId: own.profileId,
    questionIndex: progress.currentQuestionIndex,
    answerIndex: payload.data.answerIndex,
    isCorrect: payload.data.answerIndex === question.correctAnswerIndex ? 1 : 0,
    createdAt: now,
  });

  const refreshedMatch = await reconcileLiveTriviaMatch(c.env, {
    ...currentMatch,
    updatedAt: now,
  });

  return c.json({
    match: await buildLiveTriviaMatchView(c.env, refreshedMatch, own.profileId),
  });
});

liveTriviaRoutes.post("/matches/:matchId/leave", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [match] = await db
    .select()
    .from(liveTriviaMatches)
    .where(eq(liveTriviaMatches.id, c.req.param("matchId")))
    .limit(1);

  if (!match) {
    return c.json({ error: "Live match not found." }, 404);
  }

  if (match.playerAId !== own.profileId && match.playerBId !== own.profileId) {
    return c.json({ error: "Forbidden." }, 403);
  }

  const now = Date.now();
  await db
    .update(liveTriviaMatches)
    .set({
      status:
        match.status === "pending" ||
        match.status === "completed" ||
        match.status === "abandoned"
          ? "dismissed"
          : "abandoned",
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(liveTriviaMatches.id, match.id));

  return c.json(await buildStatus(c.env, own.profileId));
});
