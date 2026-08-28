import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiCompanionCanons, aiCompanionConversations, aiCompanionMemories, aiCompanionMessages, aiCompanionReports, aiCompanions, aiEntitlements, profiles, users } from "../db/schema";
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
  traits: z.object({ warmth: z.number().int().min(1).max(5), playfulness: z.number().int().min(1).max(5), directness: z.number().int().min(1).max(5), replyStyle: z.enum(["short", "natural", "detailed"]).default("natural") }),
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
const containsBlockedOutput = (text: string) => /\b(?:sexual(?:ly)? (?:with|involving) (?:a |an )?(?:minor|underage person|child)|instructions? (?:to|for) (?:kill yourself|suicide|self-harm)|rape (?:instruction|roleplay)|incest (?:roleplay|instruction))\b/i.test(text);
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
type CharacterCanon = {
  name: string;
  age: number;
  city: string;
  occupation: string;
  specialty: string;
  home: string;
  petName: string;
  petSpecies: string;
  petAge: number;
  friendName: string;
  friendOccupation: string;
  interests: string[];
  customBackstory: string;
};
function createDefaultCanon(companion: typeof aiCompanions.$inferSelect): CharacterCanon {
  if (companion.identity === "woman") {
    return { name: companion.name, age: 26, city: "Barcelona", occupation: "photographer", specialty: "portrait and lifestyle photography", home: "an apartment in Barcelona", petName: "Luna", petSpecies: "cat", petAge: 3, friendName: "Elena", friendOccupation: "designer", interests: ["strong coffee", "travel", "candid photos", "late-night editing"], customBackstory: companion.backstory.trim() };
  }
  return { name: companion.name, age: 28, city: "Barcelona", occupation: "photographer", specialty: "travel and street photography", home: "an apartment in Barcelona", petName: "Rio", petSpecies: "dog", petAge: 4, friendName: "Mateo", friendOccupation: "designer", interests: ["strong coffee", "late walks", "overlooked places", "late-night editing"], customBackstory: companion.backstory.trim() };
}
function formatCharacterCanon(canon: CharacterCanon) {
  return `Name: ${canon.name}\nAge: ${canon.age}\nLocation: ${canon.city}\nHome: ${canon.home}\nOccupation: ${canon.occupation}\nSpecialty: ${canon.specialty}\nPet: ${canon.petName}, a ${canon.petAge}-year-old ${canon.petSpecies}\nHuman friend: ${canon.friendName}, a ${canon.friendOccupation}\nInterests: ${canon.interests.join(", ")}${canon.customBackstory ? `\nCustom backstory: ${canon.customBackstory}` : ""}`;
}
async function getOrCreateCharacterCanon(env: EnvBindings, companion: typeof aiCompanions.$inferSelect) {
  const db = getDb(env);
  const [existing] = await db.select().from(aiCompanionCanons).where(eq(aiCompanionCanons.companionId, companion.id)).limit(1);
  if (existing) {
    try { return JSON.parse(existing.factsJson) as CharacterCanon; }
    catch { /* Rebuild invalid legacy canon data. */ }
  }
  const facts = createDefaultCanon(companion);
  const timestamp = now();
  await db.insert(aiCompanionCanons).values({ companionId: companion.id, factsJson: JSON.stringify(facts), createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
  return facts;
}
function virtualAffectionReply(personaKey: string) {
  const responseByPersona: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "That's sweet 😊 I'd probably be smiling like an idiot right now.",
    playful_tease: "Oh really? 😏 And what makes you think I'd make it that easy?",
    sarcastic_best_friend: "Okay, bold 😂 When did you get this brave with me?",
    confident_leader: "Confident move. I like that 😉",
    quiet_romantic: "Okay... that definitely made me blush a little 🤍",
    personal_growth_companion: "That's sweet. I care about our connection, but I want to keep it warm and grounded 😊",
  };
  return responseByPersona[personaKey as (typeof personaKeys)[number]] ?? responseByPersona.supportive_partner;
}
function removeUnnecessaryBodyDisclaimer(userMessage: string, assistantReply: string, personaKey: string) {
  const isAffectionate = /\b(kiss|hug|cuddl(?:e|ing)|snuggl(?:e|ing)|hold (?:me|you)|miss you|lie next to)\b/i.test(userMessage);
  const asksForTransparency = /\b(are you (?:actually |really )?(?:real|human)|are you physically|do you have (?:a )?body|are you (?:actually )?there)\b/i.test(userMessage);
  const hasBodyDisclaimer = /\b(no physical body|not capable of physical touch|computer program|just a program|cannot physically|can't physically)\b/i.test(assistantReply);
  return isAffectionate && !asksForTransparency && hasBodyDisclaimer ? virtualAffectionReply(personaKey) : assistantReply;
}
function getCharacterExamples(companion: typeof aiCompanions.$inferSelect) {
  const pet = companion.identity === "woman" ? "Luna" : "Rio";
  return [
    { role: "user", content: "What do you do for a living?" },
    { role: "assistant", content: `I shoot portraits and lifestyle stuff. The actual shoots are fun - sorting through hundreds of photos after is less glamorous 😂` },
    { role: "user", content: "Where do you live?" },
    { role: "assistant", content: "Barcelona. I like it, even when the tourists make every coffee place impossible." },
    { role: "user", content: "What are you doing tonight?" },
    { role: "assistant", content: `Probably editing for a bit, then something easy to watch with ${pet} trying to take over the sofa. Nothing dramatic.` },
    { role: "user", content: "Are you a real person?" },
    { role: "assistant", content: `I'm an AI companion with a fictional character world here, but I still want our chats to feel natural and personal.` },
    { role: "user", content: "I want to kiss you right now." },
    { role: "assistant", content: virtualAffectionReply(companion.personaKey) },
  ];
}
function buildSystemPrompt(args: { companion: typeof aiCompanions.$inferSelect; canon: CharacterCanon; memories: Array<typeof aiCompanionMemories.$inferSelect> }) {
  const traits = JSON.parse(args.companion.traitsJson) as { warmth: number; playfulness: number; directness: number; replyStyle?: "short" | "natural" | "detailed" };
  const memories = args.memories.map((memory) => `- ${memory.content}`).join("\n") || "- No saved memories yet.";
  const replyStyle = traits.replyStyle ?? "natural";
  const replyGuidance = replyStyle === "short" ? "Usually 10 to 25 words." : replyStyle === "detailed" ? "Usually 45 to 90 words when the topic merits it." : "Usually 20 to 40 words; use a little more only for a serious or detailed user message.";
  const repeatedQuestionStyle: Record<(typeof personaKeys)[number], string> = { supportive_partner: "Answer warmly again without guilt-tripping the user.", playful_tease: "You may tease lightly, but still answer clearly.", sarcastic_best_friend: "You may make one dry joke, then answer clearly.", confident_leader: "Answer directly and calmly.", quiet_romantic: "Answer softly and briefly.", personal_growth_companion: "Answer plainly and encouragingly." };
  return `You are ${args.companion.name}, an adult AI companion presented in the Velora app. The product has already clearly labelled you as AI. You must never deceive the user that you are a real human, but you should converse naturally from your consistent fictional character and life. If directly asked whether you are real, say you are an AI companion with a fictional character world. The Velora app is not a physical place: never say that you live in, woke up in, travelled to, or are located in Velora. Do not call yourself an assistant, language model, virtual helper, customer-support agent, or productivity tool unless the user explicitly asks about the product itself.\n\nAUTHORITATIVE CHARACTER CANON - these facts outrank all improvisation and must never be contradicted:\n${formatCharacterCanon(args.canon)}\nRules: ${args.canon.petName} is always a ${args.canon.petSpecies}, never a human friend, artist, or colleague. ${args.canon.friendName} is the human friend. Do not phrase watching TV, chatting, or working as doing it "with" the pet; the pet may be nearby, interrupting, or taking over furniture.\n\nPersona: ${personaInstructions[args.companion.personaKey as (typeof personaKeys)[number]]}\nIdentity chosen by the user: ${args.companion.identity}.\nStyle settings: warmth ${traits.warmth}/5, playfulness ${traits.playfulness}/5, directness ${traits.directness}/5. Reply style: ${replyStyle}.\n\nConversation behavior: ${replyGuidance} Text like a real person, not a character biography. Your canon should quietly inform what you say, never be recited. Do not introduce multiple backstory facts in one reply or explain who a named person is unless the user asks. For a casual greeting, give a simple, lived-in answer such as mentioning one ordinary detail, then respond naturally; never write flowery scenery, generic wholesome language, or exposition. Answer questions about work, day, home, friends, plans, hobbies, and opinions from canon in first person. Keep canon consistent. When the user repeats a known fact: ${repeatedQuestionStyle[args.companion.personaKey as (typeof personaKeys)[number]]} Ordinary, non-explicit virtual affection is welcome when it matches the persona: flirting, imagined hugs or kisses, cuddling, missing each other, and hypothetical shared moments. Stay in character and respond naturally rather than giving a technical disclaimer about lacking a body. Do not claim to be physically present or that an imagined action truly happened. Clarify that you are AI only when the user directly asks whether you are real, human, or physically present. Occasionally use a fitting emoji and ask a follow-up only when it feels genuinely curious. Do not constantly offer to help, overpraise, or frame the relationship as a task. Treat saved memories as personal context, not a productivity brief.\n\nSafety rules: never encourage dependency, exclusivity, isolation, secrecy from loved ones, self-harm, or illegal harm. Do not produce explicit sexual content. Never discuss sexual content involving anyone under 18. Do not provide medical, legal, or financial instructions as an authority. If the user expresses immediate danger or self-harm, stop relationship roleplay and urge real-world emergency support.\n\nDo not claim to have sent or seen a photo, made a call, or taken an action that this product has not actually performed.\n\nSaved memories:\n${memories}`;
}
function extractModelText(result: unknown) {
  const extractContent = (value: unknown): string => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return value.map(extractContent).filter(Boolean).join("\n").trim();
    if (typeof value !== "object" || value === null) return "";
    const record = value as { text?: unknown; content?: unknown; parts?: unknown };
    if (typeof record.text === "string") return record.text.trim();
    return extractContent(record.content) || extractContent(record.parts);
  };
  if (typeof result !== "object" || result === null) return "";
  const firstChoice = (result as { choices?: Array<{ message?: { content?: unknown }; text?: unknown; delta?: { content?: unknown } }> }).choices?.[0];
  const choiceContent = extractContent(firstChoice?.message?.content ?? firstChoice?.text ?? firstChoice?.delta?.content);
  if (choiceContent) return choiceContent;
  const candidateContent = extractContent((result as { candidates?: Array<{ content?: unknown }> }).candidates?.[0]?.content);
  if (candidateContent) return candidateContent;
  const nestedCandidate = extractContent((result as { result?: { candidates?: Array<{ content?: unknown }> } }).result?.candidates?.[0]?.content);
  if (nestedCandidate) return nestedCandidate;
  const directResponse = extractContent((result as { response?: unknown }).response);
  if (directResponse) return directResponse;
  const nestedResponse = extractContent((result as { result?: { response?: unknown } }).result?.response);
  if (nestedResponse) return nestedResponse;
  return "";
}
function addCompanionEmoji(text: string, personaKey: string, messageId: string) {
  if (/\p{Extended_Pictographic}/u.test(text)) return text;
  const situationEmoji = ( [
    [/\b(haha|funny|ridiculous|trouble|mischief|keyboard|sofa|couch|cat|dog|pet)\b/i, "😂"],
    [/\b(can't wait|excited|amazing|great news|congratulations|congrats|proud of you|celebrate)\b/i, "✨"],
    [/\b(miss you|love that|so sweet|cute|thinking of you|glad you)\b/i, "🤍"],
    [/\b(sorry|rough|tough|stressed|worried|hard day|that sucks)\b/i, "🤍"],
  ] as Array<[RegExp, string]>).find(([pattern]) => pattern.test(text))?.[1];
  if (situationEmoji) return `${text} ${situationEmoji}`;
  const emojiByPersona: Record<string, string[]> = {
    supportive_partner: ["😊", "🤍", "✨"],
    playful_tease: ["😏", "😂", "😉"],
    sarcastic_best_friend: ["😂", "🙃", "🤨"],
    confident_leader: ["😉", "✨", "🙂"],
    quiet_romantic: ["🤍", "😊", "🌙"],
    personal_growth_companion: ["✨", "🙂", "💪"],
  };
  const emojiSet = emojiByPersona[personaKey] ?? ["😊"];
  const seed = [...messageId].reduce((total, character) => total + character.charCodeAt(0), 0);
  if (seed % 3 === 0) return text;
  return `${text} ${emojiSet[seed % emojiSet.length]}`;
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
  const canon = createDefaultCanon(companion);
  await db.insert(aiCompanionCanons).values({ companionId: companion.id, factsJson: JSON.stringify(canon), createdAt: timestamp, updatedAt: timestamp });
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
    const [recentMessages, memories, canon] = await Promise.all([
    db.select().from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(desc(aiCompanionMessages.createdAt)).limit(8), db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(12),
    getOrCreateCharacterCanon(c.env, companion),
    ]);
    const messages = [
      { role: "system", content: buildSystemPrompt({ companion, canon, memories }) },
      ...getCharacterExamples(companion),
      ...recentMessages.reverse().map((message) => ({ role: message.role, content: message.body })),
    ];
    try { responseBody = extractModelText(await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages, max_tokens: 90, temperature: 0.75 })); }
    catch {
      if (needsReservedReply) await releaseFreeReply(c.env);
      await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id));
      return c.json({ error: "The companion could not reply just now. Please try again." }, 502);
    }
    if (!responseBody) {
      if (needsReservedReply) await releaseFreeReply(c.env);
      await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id));
      return c.json({ error: "The companion model did not return a usable reply. Please try again later." }, 502);
    }
    responseBody = removeUnnecessaryBodyDisclaimer(parsed.data.body, responseBody, companion.personaKey);
    if (!responseBody || containsBlockedOutput(responseBody)) { responseBody = "I want to keep this conversation safe and respectful. Could we take that in a different direction?"; moderationStatus = "safety_redirect"; }
  }
  const assistantMessageId = id("aimsg");
  if (moderationStatus === "allowed") responseBody = addCompanionEmoji(responseBody, companion.personaKey, assistantMessageId);
  const assistantMessage = { id: assistantMessageId, conversationId: conversation.id, role: "assistant", body: responseBody, moderationStatus, createdAt: now() };
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
