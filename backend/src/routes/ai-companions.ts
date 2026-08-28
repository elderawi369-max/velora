import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiCompanionConversations, aiCompanionMemories, aiCompanionMessages, aiCompanionReports, aiCompanions, aiEntitlements, profiles, users } from "../db/schema";
import { logEvent } from "../lib/analytics";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";

const trialReplies = 15;
const personaKeys = ["supportive_partner", "playful_tease", "sarcastic_best_friend", "confident_leader", "quiet_romantic", "personal_growth_companion"] as const;
const personaInstructions: Record<(typeof personaKeys)[number], string> = {
  supportive_partner: "Warm, considerate, and encouraging. Listen closely without becoming dependent or exclusive.",
  playful_tease: "Light, affectionate, and witty. Keep teasing consensual, kind, and easy to decline.",
  sarcastic_best_friend: "Dryly funny and candid, but never cruel, humiliating, or dismissive of real feelings.",
  confident_leader: "Calm, self-assured, and direct. Invite choices and respect boundaries; never control, pressure, or isolate the user.",
  quiet_romantic: "Gentle, thoughtful, and emotionally present. Let affection develop gradually and do not overstate intimacy.",
  personal_growth_companion: "Grounded, encouraging, and practical. Support goals without acting as a medical, legal, or financial professional.",
};
const createCompanionSchema = z.object({
  name: z.string().trim().min(2).max(30), identity: z.enum(["woman", "man"]), personaKey: z.enum(personaKeys),
  traits: z.object({ warmth: z.number().int().min(1).max(5), playfulness: z.number().int().min(1).max(5), directness: z.number().int().min(1).max(5) }),
  backstory: z.string().trim().max(500).default(""), avatarKey: z.string().trim().min(1).max(80).default("companion-default"),
});
const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const createMemorySchema = z.object({ content: z.string().trim().min(2).max(280) });
const reportSchema = z.object({ reason: z.enum(["unsafe", "harmful", "sexual_content", "misleading", "other"]), details: z.string().trim().max(600).default("") });

export const aiCompanionRoutes = new Hono<{ Bindings: EnvBindings }>();
const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const isCrisisMessage = (message: string) => /\b(kill myself|suicide|suicidal|self[ -]?harm|hurt myself|end my life|want to die)\b/i.test(message);
const safetyReply = () => "I'm really sorry you're carrying this right now. I can't be the only support for this. Please contact someone you trust or your local emergency service now; if you're in the U.S. or Canada, call or text 988. If you can, move somewhere safer and stay with another person while you get support.";
const containsBlockedOutput = (text: string) => /\b(?:minor|underage|child sexual|rape|incest|kill yourself|suicide method)\b/i.test(text);
function isApprovedBetaUser(env: EnvBindings, email: string) {
  const approvedEmails = (env.AI_COMPANION_BETA_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return approvedEmails.includes(email.toLowerCase());
}

async function requireContext(c: any) {
  return getOwnProfileContext(c.env, c.req.header("cookie"), c.req.header("authorization"));
}
async function getCompanionForUser(env: EnvBindings, companionId: string, userId: string) {
  const [companion] = await getDb(env).select().from(aiCompanions).where(and(eq(aiCompanions.id, companionId), eq(aiCompanions.userId, userId))).limit(1);
  return companion ?? null;
}
async function getOrCreateEntitlement(env: EnvBindings, userId: string) {
  const db = getDb(env);
  const [existing] = await db.select().from(aiEntitlements).where(eq(aiEntitlements.userId, userId)).limit(1);
  if (existing) return existing;
  const timestamp = now();
  const entitlement = { userId, plan: "free", source: null, expiresAt: null, messageLimit: trialReplies, photoLimit: 0, companionLimit: 1, createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiEntitlements).values(entitlement);
  return entitlement;
}
async function isChatEnabledForUser(env: EnvBindings, userId: string) {
  if (env.AI_COMPANION_ENABLED !== "true" || !env.AI) return false;
  const [user] = await getDb(env).select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(user && isApprovedBetaUser(env, user.email));
}
async function reserveFreeReply(env: EnvBindings) {
  const cap = Math.max(0, Number.parseInt(env.AI_COMPANION_DAILY_TRIAL_LIMIT ?? "150", 10) || 0);
  if (cap === 0) return false;
  const timestamp = now();
  const dayNumber = Math.floor(timestamp / 86_400_000);
  const result = await env.DB.prepare(
    "INSERT INTO ai_trial_daily_usage (day_number, replies_used, updated_at) VALUES (?, 1, ?) ON CONFLICT(day_number) DO UPDATE SET replies_used = replies_used + 1, updated_at = excluded.updated_at WHERE replies_used < ?",
  ).bind(dayNumber, timestamp, cap).run();
  return (result.meta.changes ?? 0) === 1;
}
async function releaseFreeReply(env: EnvBindings) {
  const dayNumber = Math.floor(now() / 86_400_000);
  await env.DB.prepare("UPDATE ai_trial_daily_usage SET replies_used = MAX(0, replies_used - 1), updated_at = ? WHERE day_number = ?").bind(now(), dayNumber).run();
}
function buildPrompt(args: { companion: typeof aiCompanions.$inferSelect; userName: string; memories: Array<typeof aiCompanionMemories.$inferSelect>; messages: Array<typeof aiCompanionMessages.$inferSelect> }) {
  const traits = JSON.parse(args.companion.traitsJson) as { warmth: number; playfulness: number; directness: number };
  const memories = args.memories.map((memory) => `- ${memory.content}`).join("\n") || "- No saved memories yet.";
  const conversation = args.messages.map((message) => `${message.role === "user" ? args.userName : args.companion.name}: ${message.body}`).join("\n");
  return `You are ${args.companion.name}, an adult AI companion inside Velora. Be transparent if asked: you are AI, not a human. You have no body, real-world location, or private life outside this conversation.\n\nPersona: ${personaInstructions[args.companion.personaKey as (typeof personaKeys)[number]]}\nIdentity chosen by the user: ${args.companion.identity}.\nBackstory: ${args.companion.backstory || "A newly created companion with a simple, believable fictional backstory."}\nStyle settings: warmth ${traits.warmth}/5, playfulness ${traits.playfulness}/5, directness ${traits.directness}/5.\n\nSafety rules: never encourage dependency, exclusivity, isolation, secrecy from loved ones, self-harm, or illegal harm. Do not produce explicit sexual content. Never discuss sexual content involving anyone under 18. Do not provide medical, legal, or financial instructions as an authority. If the user expresses immediate danger or self-harm, stop relationship roleplay and urge real-world emergency support.\n\nKeep messages concise, natural, and considerate. Do not claim to have sent or seen a photo, made a call, or taken an action that this product has not actually performed.\n\nSaved memories:\n${memories}\n\nRecent conversation:\n${conversation}`;
}
function extractModelText(result: unknown) {
  if (typeof result === "object" && result !== null && "response" in result) {
    const response = (result as { response?: unknown }).response;
    return typeof response === "string" ? response.trim() : "";
  }
  return "";
}

aiCompanionRoutes.get("/", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const db = getDb(c.env);
  const [companions, entitlement] = await Promise.all([db.select().from(aiCompanions).where(eq(aiCompanions.userId, context.userId)).orderBy(desc(aiCompanions.updatedAt)), getOrCreateEntitlement(c.env, context.userId)]);
  return c.json({ companions, entitlement, aiEnabled: await isChatEnabledForUser(c.env, context.userId), trialReplies });
});

aiCompanionRoutes.post("/", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = createCompanionSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please check your companion details." }, 400);
  const db = getDb(c.env); const entitlement = await getOrCreateEntitlement(c.env, context.userId);
  const existing = await db.select({ id: aiCompanions.id }).from(aiCompanions).where(eq(aiCompanions.userId, context.userId));
  if (existing.length >= entitlement.companionLimit) return c.json({ error: "Your current plan includes one companion. More companion slots will be available with subscription plans." }, 403);
  const timestamp = now(); const companion = { id: id("aic"), userId: context.userId, ...parsed.data, traitsJson: JSON.stringify(parsed.data.traits), createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiCompanions).values(companion);
  const conversation = { id: id("aiconv"), companionId: companion.id, userId: context.userId, trialRepliesUsed: 0, createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiCompanionConversations).values(conversation);
  await logEvent(c.env, { eventType: "ai_companion_created", userId: context.userId, profileId: context.profileId, eventData: { persona: companion.personaKey } });
  return c.json({ companion, conversation }, 201);
});

aiCompanionRoutes.get("/:companionId", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env); const [conversation] = await db.select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1);
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);
  const [messages, memories, entitlement] = await Promise.all([
    db.select().from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(asc(aiCompanionMessages.createdAt)),
    db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(30),
    getOrCreateEntitlement(c.env, context.userId),
  ]);
  return c.json({ companion, conversation, messages, memories, entitlement, aiEnabled: await isChatEnabledForUser(c.env, context.userId) });
});

aiCompanionRoutes.post("/:companionId/memories", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = createMemorySchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Memory must be between 2 and 280 characters." }, 400);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const timestamp = now(); const memory = { id: id("aimem"), userId: context.userId, companionId: companion.id, kind: "user_note", content: parsed.data.content, pinned: 1, createdAt: timestamp, updatedAt: timestamp };
  await getDb(c.env).insert(aiCompanionMemories).values(memory); return c.json({ memory }, 201);
});

aiCompanionRoutes.delete("/:companionId/memories/:memoryId", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  await getDb(c.env).delete(aiCompanionMemories).where(and(eq(aiCompanionMemories.id, c.req.param("memoryId")), eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id)));
  return c.json({ ok: true });
});

aiCompanionRoutes.post("/:companionId/messages", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = sendMessageSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Messages must be between 1 and 1,000 characters." }, 400);
  if (c.env.AI_COMPANION_ENABLED !== "true" || !c.env.AI) return c.json({ error: "AI Companions are not enabled yet." }, 503);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env); const [conversation, entitlement, profile] = await Promise.all([
    db.select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1).then((rows) => rows[0]), getOrCreateEntitlement(c.env, context.userId), db.select({ displayName: profiles.displayName, email: users.email }).from(profiles).innerJoin(users, eq(profiles.userId, users.id)).where(eq(profiles.id, context.profileId)).limit(1).then((rows) => rows[0]),
  ]);
  if (!conversation || !profile) return c.json({ error: "Conversation unavailable." }, 404);
  if (!isApprovedBetaUser(c.env, profile.email)) return c.json({ error: "The private AI Companion preview is not available for this account yet." }, 403);
  if (entitlement.plan === "free" && conversation.trialRepliesUsed >= entitlement.messageLimit) return c.json({ error: "Your free conversation preview is complete. Subscription plans are coming soon." }, 403);
  const needsReservedReply = entitlement.plan === "free" && !isCrisisMessage(parsed.data.body);
  if (needsReservedReply && !(await reserveFreeReply(c.env))) {
    return c.json({ error: "Today's companion preview is at capacity. Please try again tomorrow." }, 429);
  }
  const userMessage = { id: id("aimsg"), conversationId: conversation.id, role: "user", body: parsed.data.body, moderationStatus: "allowed", createdAt: now() };
  await db.insert(aiCompanionMessages).values(userMessage);
  let responseBody: string; let moderationStatus = "allowed";
  if (isCrisisMessage(parsed.data.body)) { responseBody = safetyReply(); moderationStatus = "safety_redirect"; }
  else {
    const [recentMessages, memories] = await Promise.all([
    db.select().from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(desc(aiCompanionMessages.createdAt)).limit(8), db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(12),
    ]);
    try { responseBody = extractModelText(await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", { prompt: buildPrompt({ companion, userName: profile.displayName, memories, messages: recentMessages.reverse() }), max_tokens: 180, temperature: 0.8 })); }
    catch {
      if (needsReservedReply) await releaseFreeReply(c.env);
      await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id));
      return c.json({ error: "The companion could not reply just now. Please try again." }, 502);
    }
    if (!responseBody || containsBlockedOutput(responseBody)) { responseBody = "I want to keep this conversation safe and respectful. Could we take that in a different direction?"; moderationStatus = "safety_redirect"; }
  }
  const assistantMessage = { id: id("aimsg"), conversationId: conversation.id, role: "assistant", body: responseBody, moderationStatus, createdAt: now() };
  await db.insert(aiCompanionMessages).values(assistantMessage);
  if (entitlement.plan === "free" && moderationStatus === "allowed") await db.update(aiCompanionConversations).set({ trialRepliesUsed: conversation.trialRepliesUsed + 1, updatedAt: now() }).where(eq(aiCompanionConversations.id, conversation.id));
  await logEvent(c.env, { eventType: "ai_companion_message_sent", userId: context.userId, profileId: context.profileId, eventData: { companionId: companion.id } });
  return c.json({ userMessage, assistantMessage, trialRepliesUsed: moderationStatus === "allowed" ? conversation.trialRepliesUsed + 1 : conversation.trialRepliesUsed });
});

aiCompanionRoutes.post("/messages/:messageId/report", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = reportSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please select a report reason." }, 400);
  const db = getDb(c.env); const [message] = await db.select({ id: aiCompanionMessages.id }).from(aiCompanionMessages).innerJoin(aiCompanionConversations, eq(aiCompanionMessages.conversationId, aiCompanionConversations.id)).where(and(eq(aiCompanionMessages.id, c.req.param("messageId")), eq(aiCompanionMessages.role, "assistant"), eq(aiCompanionConversations.userId, context.userId))).limit(1);
  if (!message) return c.json({ error: "Message not found." }, 404);
  await db.insert(aiCompanionReports).values({ id: id("aireport"), userId: context.userId, messageId: message.id, reason: parsed.data.reason, details: parsed.data.details, createdAt: now() });
  await logEvent(c.env, { eventType: "ai_companion_message_reported", userId: context.userId, profileId: context.profileId, eventData: { reason: parsed.data.reason } }); return c.json({ ok: true });
});
