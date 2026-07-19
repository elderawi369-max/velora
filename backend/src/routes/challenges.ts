import { Hono } from "hono";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { challengeResponses, challengeSessions, profiles } from "../db/schema";
import {
  challengeQuestionCount,
  challengeSessionTtlMs,
  computeCompatibilityResult,
  computeTriviaResult,
  computeTriviaScore,
  type ChallengeQuestion,
  type CompatibilityQuestion,
  type ChallengeType,
  type TriviaQuestion,
  selectCompatibilityQuestions,
  selectTriviaQuestions,
} from "../lib/challenges";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";
import { areProfilesBlocked } from "../lib/relationships";
import { createNotification } from "../lib/commerce";

const sendChallengeSchema = z.object({
  targetProfileId: z.string().trim().min(1),
  type: z.enum(["compatibility", "trivia"]),
});

const submitChallengeSchema = z.object({
  answers: z.array(z.number().int().min(0).max(3)).length(challengeQuestionCount),
});

type ChallengeSessionRow = typeof challengeSessions.$inferSelect;

export const challengeRoutes = new Hono<{ Bindings: EnvBindings }>();

function parseQuestionSet(questionSet: string) {
  return JSON.parse(questionSet) as ChallengeQuestion[];
}

function getChallengeDisplayType(type: ChallengeType) {
  return type === "compatibility" ? "Vibe Check" : "Trivia";
}

function sanitizeQuestionsForClient(questions: ChallengeQuestion[]) {
  return questions.map((question) => ({
    id: question.id,
    prompt: question.prompt,
    options: question.options,
    category: "category" in question ? question.category : null,
  }));
}

async function getParticipantMap(env: EnvBindings, profileIds: string[]) {
  const db = getDb(env);
  const items = await db
    .select({
      id: profiles.id,
      username: profiles.username,
      displayName: profiles.displayName,
      personalityType: profiles.personalityType,
      identity: profiles.identity,
      avatarPreset: profiles.avatarPreset,
      challengeCredits: profiles.challengeCredits,
    })
    .from(profiles)
    .where(inArray(profiles.id, profileIds));

  return new Map(items.map((item) => [item.id, item]));
}

async function getRecentQuestionIds(
  env: EnvBindings,
  ownProfileId: string,
  targetProfileId: string,
  type: ChallengeType,
) {
  const db = getDb(env);
  const recentSessions = await db
    .select({ questionSet: challengeSessions.questionSet })
    .from(challengeSessions)
    .where(
      and(
        eq(challengeSessions.type, type),
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
    .limit(20);

  const ids: string[] = [];
  for (const session of recentSessions) {
    try {
      const questions = parseQuestionSet(session.questionSet);
      ids.push(...questions.map((question) => question.id));
    } catch {
      continue;
    }
  }

  return ids;
}

async function buildChallengeView(
  env: EnvBindings,
  session: ChallengeSessionRow,
  ownProfileId: string,
) {
  const db = getDb(env);
  const otherProfileId =
    session.senderProfileId === ownProfileId
      ? session.recipientProfileId
      : session.senderProfileId;
  const participantMap = await getParticipantMap(env, [
    session.senderProfileId,
    session.recipientProfileId,
  ]);
  const responses = await db
    .select()
    .from(challengeResponses)
    .where(eq(challengeResponses.sessionId, session.id));
  const questions = parseQuestionSet(session.questionSet);
  const ownResponse = responses.find((item) => item.profileId === ownProfileId) ?? null;
  const otherResponse = responses.find((item) => item.profileId === otherProfileId) ?? null;

  let result: Record<string, unknown> | null = null;
  if (responses.length === 2) {
    const senderResponse = responses.find(
      (item) => item.profileId === session.senderProfileId,
    );
    const recipientResponse = responses.find(
      (item) => item.profileId === session.recipientProfileId,
    );

    if (senderResponse && recipientResponse) {
      if (session.type === "compatibility") {
        result = computeCompatibilityResult(
          questions as CompatibilityQuestion[],
          JSON.parse(senderResponse.answers) as number[],
          JSON.parse(recipientResponse.answers) as number[],
        );
      } else {
        result = computeTriviaResult(
          questions as TriviaQuestion[],
          senderResponse.score,
          recipientResponse.score,
        );
      }
    }
  }

  return {
    id: session.id,
    type: session.type,
    typeLabel: getChallengeDisplayType(session.type as ChallengeType),
    status: session.status,
    isSender: session.senderProfileId === ownProfileId,
    isRecipient: session.recipientProfileId === ownProfileId,
    otherProfile: participantMap.get(otherProfileId) ?? null,
    questions: sanitizeQuestionsForClient(questions),
    expiresAt: session.expiresAt,
    createdAt: session.createdAt,
    acceptedAt: session.acceptedAt,
    completedAt: session.completedAt,
    ownResponse: ownResponse
      ? {
          answers: JSON.parse(ownResponse.answers) as number[],
          score: ownResponse.score,
          completedAt: ownResponse.completedAt,
        }
      : null,
    otherParticipantCompleted: Boolean(otherResponse),
    result,
  };
}

challengeRoutes.get("/", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const rows = await db
    .select()
    .from(challengeSessions)
    .where(
      or(
        eq(challengeSessions.senderProfileId, own.profileId),
        eq(challengeSessions.recipientProfileId, own.profileId),
      ),
    )
    .orderBy(desc(challengeSessions.updatedAt))
    .limit(100);

  const participantIds = Array.from(
    new Set(rows.flatMap((row) => [row.senderProfileId, row.recipientProfileId])),
  );
  const participantMap = await getParticipantMap(c.env, participantIds);

  return c.json({
    challenges: rows.map((row) => {
      const otherProfileId =
        row.senderProfileId === own.profileId ? row.recipientProfileId : row.senderProfileId;

      return {
        id: row.id,
        type: row.type,
        typeLabel: getChallengeDisplayType(row.type as ChallengeType),
        status: row.status,
        isSender: row.senderProfileId === own.profileId,
        otherProfile: participantMap.get(otherProfileId) ?? null,
        expiresAt: row.expiresAt,
        createdAt: row.createdAt,
        completedAt: row.completedAt,
      };
    }),
    creditBalance: participantMap.get(own.profileId)?.challengeCredits ?? 0,
  });
});

challengeRoutes.post("/", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = sendChallengeSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid challenge payload." }, 400);
  }

  if (payload.data.targetProfileId === own.profileId) {
    return c.json({ error: "You cannot challenge yourself." }, 400);
  }

  if (await areProfilesBlocked(c.env, own.profileId, payload.data.targetProfileId)) {
    return c.json({ error: "This challenge is unavailable." }, 403);
  }

  const db = getDb(c.env);
  const [ownProfile] = await db
    .select({ challengeCredits: profiles.challengeCredits })
    .from(profiles)
    .where(eq(profiles.id, own.profileId))
    .limit(1);

  if (!ownProfile || ownProfile.challengeCredits < 1) {
    return c.json(
      { error: "You need at least 1 challenge credit before sending a challenge." },
      402,
    );
  }

  const [targetProfile] = await db
    .select({ id: profiles.id, suspendedAt: profiles.suspendedAt })
    .from(profiles)
    .where(eq(profiles.id, payload.data.targetProfileId))
    .limit(1);

  if (!targetProfile || targetProfile.suspendedAt) {
    return c.json({ error: "Profile not found." }, 404);
  }

  const [existingPending] = await db
    .select({ id: challengeSessions.id })
    .from(challengeSessions)
    .where(
      and(
        eq(challengeSessions.type, payload.data.type),
        eq(challengeSessions.status, "pending"),
        or(
          and(
            eq(challengeSessions.senderProfileId, own.profileId),
            eq(challengeSessions.recipientProfileId, payload.data.targetProfileId),
          ),
          and(
            eq(challengeSessions.senderProfileId, payload.data.targetProfileId),
            eq(challengeSessions.recipientProfileId, own.profileId),
          ),
        ),
      ),
    )
    .limit(1);

  if (existingPending) {
    return c.json({ error: "There is already a pending challenge between these profiles." }, 409);
  }

  const recentQuestionIds = await getRecentQuestionIds(
    c.env,
    own.profileId,
    payload.data.targetProfileId,
    payload.data.type,
  );
  const questions =
    payload.data.type === "compatibility"
      ? selectCompatibilityQuestions(recentQuestionIds)
      : selectTriviaQuestions(recentQuestionIds);
  const now = Date.now();

  const session = {
    id: crypto.randomUUID(),
    type: payload.data.type,
    status: "pending",
    senderProfileId: own.profileId,
    recipientProfileId: payload.data.targetProfileId,
    questionSet: JSON.stringify(questions),
    expiresAt: now + challengeSessionTtlMs,
    acceptedAt: null,
    declinedAt: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
  } as const;

  await db.insert(challengeSessions).values(session);
  await db
    .update(profiles)
    .set({
      challengeCredits: ownProfile.challengeCredits - 1,
      updatedAt: now,
    })
    .where(eq(profiles.id, own.profileId));

  await createNotification(c.env, {
    profileId: payload.data.targetProfileId,
    actorProfileId: own.profileId,
    type: "challenge",
    challengeSessionId: session.id,
  });

  return c.json(
    {
      challenge: await buildChallengeView(c.env, session, own.profileId),
    },
    201,
  );
});

challengeRoutes.get("/:challengeId", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [session] = await db
    .select()
    .from(challengeSessions)
    .where(eq(challengeSessions.id, c.req.param("challengeId")))
    .limit(1);

  if (!session) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  if (
    session.senderProfileId !== own.profileId &&
    session.recipientProfileId !== own.profileId
  ) {
    return c.json({ error: "Forbidden." }, 403);
  }

  return c.json({
    challenge: await buildChallengeView(c.env, session, own.profileId),
  });
});

challengeRoutes.post("/:challengeId/accept", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [session] = await db
    .select()
    .from(challengeSessions)
    .where(eq(challengeSessions.id, c.req.param("challengeId")))
    .limit(1);

  if (!session) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  if (session.recipientProfileId !== own.profileId) {
    return c.json({ error: "Only the recipient can accept this challenge." }, 403);
  }

  if (session.status !== "pending") {
    return c.json({ error: "This challenge can no longer be accepted." }, 400);
  }

  if (session.expiresAt <= Date.now()) {
    await db
      .update(challengeSessions)
      .set({ status: "expired", updatedAt: Date.now() })
      .where(eq(challengeSessions.id, session.id));
    return c.json({ error: "This challenge has expired." }, 410);
  }

  const now = Date.now();
  await db
    .update(challengeSessions)
    .set({
      status: "accepted",
      acceptedAt: now,
      updatedAt: now,
    })
    .where(eq(challengeSessions.id, session.id));

  return c.json({
    ok: true,
    challenge: await buildChallengeView(
      c.env,
      { ...session, status: "accepted", acceptedAt: now, updatedAt: now },
      own.profileId,
    ),
  });
});

challengeRoutes.post("/:challengeId/decline", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [session] = await db
    .select()
    .from(challengeSessions)
    .where(eq(challengeSessions.id, c.req.param("challengeId")))
    .limit(1);

  if (!session) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  if (session.recipientProfileId !== own.profileId) {
    return c.json({ error: "Only the recipient can decline this challenge." }, 403);
  }

  if (session.status !== "pending") {
    return c.json({ error: "This challenge can no longer be declined." }, 400);
  }

  const now = Date.now();
  await db
    .update(challengeSessions)
    .set({
      status: "declined",
      declinedAt: now,
      updatedAt: now,
    })
    .where(eq(challengeSessions.id, session.id));

  return c.json({ ok: true });
});

challengeRoutes.post("/:challengeId/cancel", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const db = getDb(c.env);
  const [session] = await db
    .select()
    .from(challengeSessions)
    .where(eq(challengeSessions.id, c.req.param("challengeId")))
    .limit(1);

  if (!session) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  if (session.senderProfileId !== own.profileId) {
    return c.json({ error: "Only the sender can cancel this challenge." }, 403);
  }

  if (session.status !== "pending") {
    return c.json({ error: "Only pending challenges can be canceled." }, 400);
  }

  await db
    .update(challengeSessions)
    .set({
      status: "canceled",
      updatedAt: Date.now(),
    })
    .where(eq(challengeSessions.id, session.id));

  const [ownProfile] = await db
    .select({ challengeCredits: profiles.challengeCredits })
    .from(profiles)
    .where(eq(profiles.id, own.profileId))
    .limit(1);

  if (ownProfile) {
    await db
      .update(profiles)
      .set({
        challengeCredits: ownProfile.challengeCredits + 1,
        updatedAt: Date.now(),
      })
      .where(eq(profiles.id, own.profileId));
  }

  return c.json({ ok: true });
});

challengeRoutes.post("/:challengeId/submit", async (c) => {
  const own = await getOwnProfileContext(
    c.env,
    c.req.header("Cookie"),
    c.req.header("Authorization"),
  );
  if (!own) {
    return c.json({ error: "Unauthorized." }, 401);
  }

  const payload = submitChallengeSchema.safeParse(await c.req.json());
  if (!payload.success) {
    return c.json({ error: "Invalid challenge answers." }, 400);
  }

  const db = getDb(c.env);
  const [session] = await db
    .select()
    .from(challengeSessions)
    .where(eq(challengeSessions.id, c.req.param("challengeId")))
    .limit(1);

  if (!session) {
    return c.json({ error: "Challenge not found." }, 404);
  }

  const isSender = session.senderProfileId === own.profileId;
  const isRecipient = session.recipientProfileId === own.profileId;
  if (!isSender && !isRecipient) {
    return c.json({ error: "Forbidden." }, 403);
  }

  if (session.status !== "accepted" && !(session.status === "pending" && isSender)) {
    return c.json({ error: "This challenge is not open for answers." }, 400);
  }

  if (session.expiresAt <= Date.now()) {
    await db
      .update(challengeSessions)
      .set({ status: "expired", updatedAt: Date.now() })
      .where(eq(challengeSessions.id, session.id));
    return c.json({ error: "This challenge has expired." }, 410);
  }

  const existingResponses = await db
    .select()
    .from(challengeResponses)
    .where(eq(challengeResponses.sessionId, session.id));
  if (existingResponses.some((item) => item.profileId === own.profileId)) {
    return c.json({ error: "You already completed this challenge." }, 409);
  }

  const questions = parseQuestionSet(session.questionSet);
  const now = Date.now();
  const score =
    session.type === "trivia"
      ? computeTriviaScore(questions as TriviaQuestion[], payload.data.answers)
      : 0;

  await db.insert(challengeResponses).values({
    id: crypto.randomUUID(),
    sessionId: session.id,
    profileId: own.profileId,
    answers: JSON.stringify(payload.data.answers),
    score,
    createdAt: now,
    completedAt: now,
  });

  const responsesAfterInsert = [
    ...existingResponses,
    {
      id: "",
      sessionId: session.id,
      profileId: own.profileId,
      answers: JSON.stringify(payload.data.answers),
      score,
      createdAt: now,
      completedAt: now,
    },
  ];

  let nextStatus = session.status;
  let completedAt = session.completedAt;
  if (responsesAfterInsert.length >= 2) {
    nextStatus = "completed";
    completedAt = now;
  }

  await db
    .update(challengeSessions)
    .set({
      status: nextStatus,
      completedAt,
      updatedAt: now,
    })
    .where(eq(challengeSessions.id, session.id));

  if (nextStatus === "completed") {
    const otherProfileId = isSender ? session.recipientProfileId : session.senderProfileId;
    await createNotification(c.env, {
      profileId: otherProfileId,
      actorProfileId: own.profileId,
      type: "challenge_result",
      challengeSessionId: session.id,
    });
  }

  return c.json({
    challenge: await buildChallengeView(
      c.env,
      {
        ...session,
        status: nextStatus,
        completedAt,
        updatedAt: now,
      },
      own.profileId,
    ),
  });
});
