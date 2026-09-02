import { Hono } from "hono";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import {
  aiCompanionAppearanceCatalog,
  aiCompanionCalls,
  aiCompanionCallTurns,
  aiCompanionConversations,
  aiCompanionMemories,
  aiCompanionMessages,
  aiCompanionVoiceAssets,
  aiCompanionVoiceProfiles,
  aiCompanions,
  aiEntitlements,
  aiCompanionVisualIdentities,
  users,
} from "../db/schema";
import { detectVoiceDeliveryStyle, prepareSpokenText, synthesizeCompanionSpeech, voiceForCatalogName, type LockedVoiceProfile } from "../lib/companion-voice";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";
import { buildSystemPrompt, containsBlockedOutput, createMemoryCandidates, extractModelText, getCharacterExamples, getOrCreateCharacterCanon, isCrisisMessage, relationshipPointsForMessage, relationshipStageForPoints, safetyReply } from "./ai-companions";

export const aiCompanionVoiceRoutes = new Hono<{ Bindings: EnvBindings }>();

const voiceMessageSchema = z.object({ messageId: z.string().trim().min(1) });
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const now = () => Date.now();
const monthPeriod = (timestamp = now()) => new Date(timestamp).toISOString().slice(0, 7);
const dayPeriod = (timestamp = now()) => new Date(timestamp).toISOString().slice(0, 10);

async function contextFor(c: any) {
  return getOwnProfileContext(c.env, c.req.header("cookie"), c.req.header("authorization"));
}

async function ownedCompanion(env: EnvBindings, companionId: string, userId: string) {
  const [row] = await getDb(env).select({ companion: aiCompanions }).from(aiCompanions)
    .leftJoin(aiCompanionAppearanceCatalog, eq(aiCompanionAppearanceCatalog.sourceCompanionId, aiCompanions.id))
    .where(and(eq(aiCompanions.id, companionId), eq(aiCompanions.userId, userId), isNull(aiCompanionAppearanceCatalog.id))).limit(1);
  return row?.companion ?? null;
}

async function entitlementFor(env: EnvBindings, userId: string) {
  const [entitlement] = await getDb(env).select().from(aiEntitlements).where(eq(aiEntitlements.userId, userId)).limit(1);
  return entitlement ?? null;
}

async function betaUser(env: EnvBindings, userId: string) {
  const [user] = await getDb(env).select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  const approved = new Set((env.AI_COMPANION_BETA_EMAILS ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
  return Boolean(user && approved.has(user.email.toLowerCase()));
}

function voiceLimits(plan: string, beta: boolean) {
  if (beta || plan === "ultra") return { monthly: 60, daily: 10 };
  if (plan === "pro") return { monthly: 20, daily: 3 };
  return { monthly: 0, daily: 0 };
}

async function reserveVoiceMessage(env: EnvBindings, userId: string, limits: { monthly: number; daily: number }) {
  if (limits.monthly <= 0 || limits.daily <= 0) return false;
  const timestamp = now();
  const entries = [
    { scope: "month", period: monthPeriod(timestamp), limit: limits.monthly },
    { scope: "day", period: dayPeriod(timestamp), limit: limits.daily },
  ];
  const reserved: typeof entries = [];
  for (const entry of entries) {
    const usageId = `${userId}:${entry.scope}:${entry.period}`;
    await env.DB.prepare("INSERT OR IGNORE INTO ai_companion_voice_usage (id, user_id, scope, period, reserved_count, successful_count, updated_at) VALUES (?, ?, ?, ?, 0, 0, ?)").bind(usageId, userId, entry.scope, entry.period, timestamp).run();
    const result = await env.DB.prepare("UPDATE ai_companion_voice_usage SET reserved_count = reserved_count + 1, updated_at = ? WHERE id = ? AND reserved_count + successful_count < ?").bind(timestamp, usageId, entry.limit).run();
    if ((result.meta.changes ?? 0) === 1) { reserved.push(entry); continue; }
    for (const prior of reserved) await env.DB.prepare("UPDATE ai_companion_voice_usage SET reserved_count = MAX(0, reserved_count - 1), updated_at = ? WHERE id = ?").bind(timestamp, `${userId}:${prior.scope}:${prior.period}`).run();
    return false;
  }
  return true;
}

async function finishVoiceReservation(env: EnvBindings, userId: string, success: boolean) {
  const timestamp = now();
  for (const entry of [{ scope: "month", period: monthPeriod(timestamp) }, { scope: "day", period: dayPeriod(timestamp) }]) {
    await env.DB.prepare(`UPDATE ai_companion_voice_usage SET reserved_count = MAX(0, reserved_count - 1), successful_count = successful_count + ?, updated_at = ? WHERE id = ?`).bind(success ? 1 : 0, timestamp, `${userId}:${entry.scope}:${entry.period}`).run();
  }
}

async function lockedProfileFor(env: EnvBindings, companion: typeof aiCompanions.$inferSelect) {
  const db = getDb(env);
  const [identity] = await db.select({ catalogName: aiCompanionAppearanceCatalog.displayName })
    .from(aiCompanionVisualIdentities)
    .leftJoin(aiCompanionAppearanceCatalog, eq(aiCompanionAppearanceCatalog.id, aiCompanionVisualIdentities.appearanceCatalogId))
    .where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  const selected = voiceForCatalogName(identity?.catalogName ?? companion.name);
  if (!selected) return null;
  const timestamp = now();
  await db.insert(aiCompanionVoiceProfiles).values({ companionId: companion.id, catalogName: selected.catalogName, provider: selected.provider, engine: selected.engine, voiceName: selected.voiceName, locale: selected.locale, speakingRate: selected.speakingRate, pitch: selected.pitch, audioEncoding: selected.audioEncoding, sampleRateHertz: selected.sampleRateHertz, profileVersion: selected.profileVersion, status: "locked", createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
  const [persisted] = await db.select().from(aiCompanionVoiceProfiles).where(and(eq(aiCompanionVoiceProfiles.companionId, companion.id), eq(aiCompanionVoiceProfiles.status, "locked"))).limit(1);
  if (!persisted || persisted.voiceName !== selected.voiceName || persisted.profileVersion !== selected.profileVersion) return null;
  return selected;
}

function publicAsset(asset: typeof aiCompanionVoiceAssets.$inferSelect) {
  return { id: asset.id, messageId: asset.messageId, status: asset.status, durationMs: asset.durationMs, characterCount: asset.characterCount, deliveryStyle: asset.deliveryStyle, createdAt: asset.createdAt };
}

async function createVoiceAsset(args: { env: EnvBindings; userId: string; companion: typeof aiCompanions.$inferSelect; conversationId: string; messageId: string; callId?: string; requestKey: string; text: string; profile: LockedVoiceProfile; countMessageQuota: boolean; limits?: { monthly: number; daily: number } }) {
  const db = getDb(args.env);
  const [existing] = await db.select().from(aiCompanionVoiceAssets).where(eq(aiCompanionVoiceAssets.requestKey, args.requestKey)).limit(1);
  if (existing && existing.status !== "failed") return existing;
  if (existing?.status === "failed") await db.delete(aiCompanionVoiceAssets).where(and(eq(aiCompanionVoiceAssets.id, existing.id), eq(aiCompanionVoiceAssets.status, "failed")));
  if (!args.env.COMPANION_AUDIO) throw new Error("voice_storage_not_configured");
  if (args.countMessageQuota && !(await reserveVoiceMessage(args.env, args.userId, args.limits ?? { monthly: 0, daily: 0 }))) throw new Error("voice_quota_complete");
  const spoken = prepareSpokenText(args.text);
  if (!spoken) {
    if (args.countMessageQuota) await finishVoiceReservation(args.env, args.userId, false);
    throw new Error("voice_text_empty");
  }
  const timestamp = now();
  const assetId = id("aivoice");
  const draft = { id: assetId, userId: args.userId, companionId: args.companion.id, conversationId: args.conversationId, messageId: args.messageId, callId: args.callId ?? null, requestKey: args.requestKey, objectKey: null, status: "generating", durationMs: null, characterCount: spoken.length, provider: args.profile.provider, profileVersion: args.profile.profileVersion, deliveryStyle: detectVoiceDeliveryStyle(spoken), errorCode: null, createdAt: timestamp, updatedAt: timestamp, deletedAt: null };
  try { await db.insert(aiCompanionVoiceAssets).values(draft); }
  catch {
    if (args.countMessageQuota) await finishVoiceReservation(args.env, args.userId, false);
    const [duplicate] = await db.select().from(aiCompanionVoiceAssets).where(eq(aiCompanionVoiceAssets.requestKey, args.requestKey)).limit(1);
    if (duplicate) return duplicate;
    throw new Error("voice_asset_create_failed");
  }
  try {
    const audio = await synthesizeCompanionSpeech(args.env, args.profile, spoken);
    if (audio.durationMs > 30_000) throw new Error("voice_duration_limit");
    const objectKey = `voice/${args.userId}/${args.companion.id}/${assetId}/${crypto.randomUUID()}.mp3`;
    await args.env.COMPANION_AUDIO.put(objectKey, audio.bytes, { httpMetadata: { contentType: "audio/mpeg", cacheControl: "private, no-store" }, customMetadata: { profileVersion: String(args.profile.profileVersion), voiceName: args.profile.voiceName } });
    await db.update(aiCompanionVoiceAssets).set({ objectKey, status: "ready", durationMs: audio.durationMs, deliveryStyle: audio.deliveryStyle, updatedAt: now() }).where(eq(aiCompanionVoiceAssets.id, assetId));
    if (args.countMessageQuota) await finishVoiceReservation(args.env, args.userId, true);
    const [ready] = await db.select().from(aiCompanionVoiceAssets).where(eq(aiCompanionVoiceAssets.id, assetId)).limit(1);
    return ready;
  } catch (error) {
    await db.update(aiCompanionVoiceAssets).set({ status: "failed", errorCode: error instanceof Error ? error.message.slice(0, 100) : "voice_generation_failed", updatedAt: now() }).where(eq(aiCompanionVoiceAssets.id, assetId));
    if (args.countMessageQuota) await finishVoiceReservation(args.env, args.userId, false);
    throw error;
  }
}

async function companionContext(c: any) {
  const context = await contextFor(c);
  if (!context) return null;
  const companion = await ownedCompanion(c.env, c.req.param("companionId"), context.userId);
  if (!companion) return null;
  const [conversation, entitlement, beta, profile] = await Promise.all([
    getDb(c.env).select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1).then((rows) => rows[0]),
    entitlementFor(c.env, context.userId), betaUser(c.env, context.userId), lockedProfileFor(c.env, companion),
  ]);
  if (!conversation || !entitlement) return null;
  return { context, companion, conversation, entitlement, beta, profile };
}

aiCompanionVoiceRoutes.get("/:companionId/voice", async (c) => {
  const data = await companionContext(c);
  if (!data) return c.json({ error: "Companion voice is unavailable." }, 404);
  const limits = voiceLimits(data.entitlement.plan, data.beta);
  const [month, day] = await Promise.all([
    c.env.DB.prepare("SELECT reserved_count, successful_count FROM ai_companion_voice_usage WHERE id = ?").bind(`${data.context.userId}:month:${monthPeriod()}`).first<{ reserved_count: number; successful_count: number }>(),
    c.env.DB.prepare("SELECT reserved_count, successful_count FROM ai_companion_voice_usage WHERE id = ?").bind(`${data.context.userId}:day:${dayPeriod()}`).first<{ reserved_count: number; successful_count: number }>(),
  ]);
  const voiceConfigured = c.env.AI_COMPANION_VOICE_ENABLED === "true" && Boolean(c.env.COMPANION_AUDIO && c.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON && data.profile);
  const callsConfigured = c.env.AI_COMPANION_CALLS_ENABLED === "true" && voiceConfigured && Boolean(c.env.AI);
  return c.json({ voice: { enabled: voiceConfigured && limits.monthly > 0, catalogName: data.profile?.catalogName ?? null, engine: data.profile?.engine ?? null, monthlyLimit: limits.monthly, monthlyUsed: month?.successful_count ?? 0, dailyLimit: limits.daily, dailyUsed: day?.successful_count ?? 0, maxCharacters: 500, maxDurationSeconds: 30 }, calls: { enabled: callsConfigured && (data.beta || data.entitlement.plan === "ultra"), monthlySeconds: 3600, transcriptionDisclosure: "Your recorded turn is transcribed to create a reply. Raw call audio is not retained." } });
});

aiCompanionVoiceRoutes.post("/:companionId/voice-messages", async (c) => {
  const parsed = voiceMessageSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Choose a companion reply to turn into a voice note." }, 400);
  const data = await companionContext(c);
  if (!data) return c.json({ error: "Companion not found." }, 404);
  if (c.env.AI_COMPANION_VOICE_ENABLED !== "true" || !data.profile || !c.env.COMPANION_AUDIO || !c.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON) return c.json({ error: "Companion voice messages are not configured yet." }, 503);
  const limits = voiceLimits(data.entitlement.plan, data.beta);
  if (limits.monthly <= 0) return c.json({ error: "Voice messages are available with Velora Pro or Ultra." }, 403);
  const [message] = await getDb(c.env).select().from(aiCompanionMessages).where(and(eq(aiCompanionMessages.id, parsed.data.messageId), eq(aiCompanionMessages.conversationId, data.conversation.id), eq(aiCompanionMessages.role, "assistant"))).limit(1);
  if (!message || message.moderationStatus !== "allowed") return c.json({ error: "That reply cannot be made into a voice note." }, 404);
  try {
    const asset = await createVoiceAsset({ env: c.env, userId: data.context.userId, companion: data.companion, conversationId: data.conversation.id, messageId: message.id, requestKey: `message:${message.id}:profile:${data.profile.profileVersion}`, text: message.body, profile: data.profile, countMessageQuota: true, limits });
    return c.json({ voiceAsset: publicAsset(asset) }, asset.status === "ready" ? 201 : 202);
  } catch (error) {
    if (error instanceof Error && error.message === "voice_quota_complete") return c.json({ error: "Your voice-message allowance is complete for now." }, 429);
    return c.json({ error: "The voice note could not be created. No allowance was used." }, 502);
  }
});

aiCompanionVoiceRoutes.get("/:companionId/voice-messages/:assetId/audio", async (c) => {
  const context = await contextFor(c);
  if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  if (!c.env.COMPANION_AUDIO) return c.json({ error: "Voice storage is unavailable." }, 503);
  const [asset] = await getDb(c.env).select().from(aiCompanionVoiceAssets).where(and(eq(aiCompanionVoiceAssets.id, c.req.param("assetId")), eq(aiCompanionVoiceAssets.userId, context.userId), eq(aiCompanionVoiceAssets.companionId, c.req.param("companionId")), eq(aiCompanionVoiceAssets.status, "ready"), isNull(aiCompanionVoiceAssets.deletedAt))).limit(1);
  if (!asset?.objectKey) return c.json({ error: "Voice note not found." }, 404);
  const object = await c.env.COMPANION_AUDIO.get(asset.objectKey);
  if (!object) return c.json({ error: "Voice note not found." }, 404);
  return new Response(object.body, { headers: { "Content-Type": "audio/mpeg", "Content-Length": String(object.size), "Cache-Control": "private, no-store", "Content-Disposition": "inline" } });
});

aiCompanionVoiceRoutes.post("/:companionId/calls", async (c) => {
  const data = await companionContext(c);
  if (!data) return c.json({ error: "Companion not found." }, 404);
  if (c.env.AI_COMPANION_CALLS_ENABLED !== "true" || c.env.AI_COMPANION_VOICE_ENABLED !== "true" || !c.env.AI || !c.env.COMPANION_AUDIO || !data.profile) return c.json({ error: "Companion calls are not configured yet." }, 503);
  if (!data.beta && data.entitlement.plan !== "ultra") return c.json({ error: "Companion calls are available with Velora Ultra." }, 403);
  const timestamp = now();
  await c.env.DB.prepare("UPDATE ai_companion_calls SET status = 'ended', ended_at = ?, updated_at = ? WHERE user_id = ? AND status IN ('calling','connected') AND updated_at < ?").bind(timestamp, timestamp, data.context.userId, timestamp - 90_000).run();
  const active = await c.env.DB.prepare("SELECT id FROM ai_companion_calls WHERE user_id = ? AND status IN ('calling','connected') LIMIT 1").bind(data.context.userId).first<{ id: string }>();
  if (active) return c.json({ error: "You already have a companion call in progress." }, 409);
  const usage = await c.env.DB.prepare("SELECT COALESCE(SUM(billable_seconds), 0) AS seconds FROM ai_companion_calls WHERE user_id = ? AND created_at >= ?").bind(data.context.userId, Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).first<{ seconds: number }>();
  const remaining = Math.max(0, 3600 - Number(usage?.seconds ?? 0));
  if (remaining <= 0) return c.json({ error: "Your companion call allowance is complete for this month." }, 429);
  const call = { id: id("aicall"), userId: data.context.userId, companionId: data.companion.id, conversationId: data.conversation.id, status: "connected", connectedAt: timestamp, lastHeartbeatAt: timestamp, endedAt: null, billableSeconds: 0, maxSeconds: remaining, createdAt: timestamp, updatedAt: timestamp };
  await getDb(c.env).insert(aiCompanionCalls).values(call);
  return c.json({ call: { id: call.id, status: call.status, maxSeconds: call.maxSeconds, connectedAt: call.connectedAt }, disclosure: "Your recorded turns are transcribed to create replies. Raw call audio is not retained." }, 201);
});

async function activeOwnedCall(env: EnvBindings, callId: string, companionId: string, userId: string) {
  const [call] = await getDb(env).select().from(aiCompanionCalls).where(and(eq(aiCompanionCalls.id, callId), eq(aiCompanionCalls.userId, userId), eq(aiCompanionCalls.companionId, companionId), eq(aiCompanionCalls.status, "connected"))).limit(1);
  return call ?? null;
}

async function accountHeartbeat(env: EnvBindings, call: typeof aiCompanionCalls.$inferSelect) {
  const timestamp = now();
  const elapsed = Math.max(0, Math.min(15, Math.floor((timestamp - (call.lastHeartbeatAt ?? timestamp)) / 1000)));
  const nextSeconds = Math.min(call.maxSeconds, call.billableSeconds + elapsed);
  const ended = nextSeconds >= call.maxSeconds;
  await getDb(env).update(aiCompanionCalls).set({ billableSeconds: nextSeconds, lastHeartbeatAt: timestamp, status: ended ? "ended" : "connected", endedAt: ended ? timestamp : null, updatedAt: timestamp }).where(and(eq(aiCompanionCalls.id, call.id), eq(aiCompanionCalls.userId, call.userId), eq(aiCompanionCalls.billableSeconds, call.billableSeconds)));
  return { billableSeconds: nextSeconds, remainingSeconds: Math.max(0, call.maxSeconds - nextSeconds), ended };
}

aiCompanionVoiceRoutes.post("/:companionId/calls/:callId/heartbeat", async (c) => {
  const context = await contextFor(c);
  if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const call = await activeOwnedCall(c.env, c.req.param("callId"), c.req.param("companionId"), context.userId);
  if (!call) return c.json({ error: "Call not found or already ended." }, 404);
  return c.json(await accountHeartbeat(c.env, call));
});

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return btoa(binary);
}

aiCompanionVoiceRoutes.post("/:companionId/calls/:callId/turns", async (c) => {
  const data = await companionContext(c);
  if (!data) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.AI || !data.profile) return c.json({ error: "Call services are unavailable." }, 503);
  const call = await activeOwnedCall(c.env, c.req.param("callId"), data.companion.id, data.context.userId);
  if (!call) return c.json({ error: "Call not found or already ended." }, 404);
  const [latestTurn] = await getDb(c.env).select({ createdAt: aiCompanionCallTurns.createdAt }).from(aiCompanionCallTurns).where(eq(aiCompanionCallTurns.callId, call.id)).orderBy(desc(aiCompanionCallTurns.createdAt)).limit(1);
  if (latestTurn && latestTurn.createdAt > now() - 2_000) return c.json({ error: "Give the call a moment before sending another turn." }, 429);
  const form = await c.req.formData();
  const audioEntry = form.get("audio");
  const audio = typeof audioEntry === "object" && audioEntry !== null && "arrayBuffer" in audioEntry ? audioEntry as Blob : null;
  if (!audio || audio.size <= 0 || audio.size > 4 * 1024 * 1024 || !/^audio\//i.test(audio.type)) return c.json({ error: "Record a voice turn up to 4 MB." }, 400);
  let transcript = "";
  try {
    const result = await c.env.AI.run("@cf/openai/whisper-large-v3-turbo", { audio: bytesToBase64(new Uint8Array(await audio.arrayBuffer())), task: "transcribe", language: "en", vad_filter: true, condition_on_previous_text: false });
    transcript = typeof result === "object" && result !== null && typeof (result as { text?: unknown }).text === "string" ? (result as { text: string }).text.trim() : "";
  } catch { return c.json({ error: "I couldn't hear that clearly. Please try that turn again." }, 422); }
  if (!transcript || transcript.length > 1000) return c.json({ error: "I couldn't hear a clear spoken turn. Please try again." }, 422);
  const db = getDb(c.env);
  const relationshipStage = relationshipStageForPoints(data.conversation.relationshipPoints);
  const userMessage = { id: id("aimsg"), conversationId: data.conversation.id, role: "user", body: transcript, moderationStatus: "allowed", createdAt: now() };
  await db.insert(aiCompanionMessages).values(userMessage);
  let responseBody = "";
  let moderationStatus = "allowed";
  if (isCrisisMessage(transcript)) { responseBody = safetyReply(); moderationStatus = "safety_redirect"; }
  else {
    const [memories, canon, recent] = await Promise.all([
      db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, data.context.userId), eq(aiCompanionMemories.companionId, data.companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(12),
      getOrCreateCharacterCanon(c.env, data.companion),
      db.select({ role: aiCompanionMessages.role, body: aiCompanionMessages.body }).from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, data.conversation.id)).orderBy(desc(aiCompanionMessages.createdAt)).limit(14),
    ]);
    const messages = [{ role: "system", content: `${buildSystemPrompt({ companion: data.companion, canon, memories, relationshipStage })}\n\nThis is a turn-based voice call. Reply in one to three short, natural spoken sentences. Use contractions and conversational wording. Do not use markdown, lists, stage directions, emoji, URLs, or narration about your tone. Do not begin every turn with the user's name.` }, ...getCharacterExamples(data.companion, canon, relationshipStage), ...recent.slice().reverse().map((message) => ({ role: message.role, content: message.body }))];
    try { responseBody = extractModelText(await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages, max_tokens: 75, temperature: 0.72 })); }
    catch { await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id)); return c.json({ error: "The call reply could not be created. Please try again." }, 502); }
    if (!responseBody || containsBlockedOutput(responseBody)) { responseBody = "I want to keep this safe and respectful. Can we take that in a different direction?"; moderationStatus = "safety_redirect"; }
  }
  const assistantMessage = { id: id("aimsg"), conversationId: data.conversation.id, role: "assistant", body: responseBody, moderationStatus, createdAt: now() };
  await db.insert(aiCompanionMessages).values(assistantMessage);
  let voiceAsset;
  try { voiceAsset = await createVoiceAsset({ env: c.env, userId: data.context.userId, companion: data.companion, conversationId: data.conversation.id, messageId: assistantMessage.id, callId: call.id, requestKey: `call:${call.id}:turn:${userMessage.id}:profile:${data.profile.profileVersion}`, text: assistantMessage.body, profile: data.profile, countMessageQuota: false }); }
  catch { return c.json({ error: "The reply was saved, but its call audio could not be created." }, 502); }
  const turn = { id: id("aicallturn"), callId: call.id, userMessageId: userMessage.id, assistantMessageId: assistantMessage.id, voiceAssetId: voiceAsset.id, transcript, createdAt: now() };
  const relationshipPoints = data.conversation.relationshipPoints + relationshipPointsForMessage(transcript);
  await db.batch([db.insert(aiCompanionCallTurns).values(turn), db.update(aiCompanionConversations).set({ relationshipPoints, relationshipStage: relationshipStageForPoints(relationshipPoints), updatedAt: now() }).where(eq(aiCompanionConversations.id, data.conversation.id))]);
  if (moderationStatus === "allowed") await createMemoryCandidates(c.env, { userId: data.context.userId, companionId: data.companion.id, sourceMessageId: userMessage.id, message: transcript }).catch(() => undefined);
  const heartbeat = await accountHeartbeat(c.env, call);
  return c.json({ transcript, userMessage, assistantMessage, voiceAsset: publicAsset(voiceAsset), call: heartbeat }, 201);
});

aiCompanionVoiceRoutes.post("/:companionId/calls/:callId/end", async (c) => {
  const context = await contextFor(c);
  if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const call = await activeOwnedCall(c.env, c.req.param("callId"), c.req.param("companionId"), context.userId);
  if (!call) return c.json({ ok: true, alreadyEnded: true });
  const usage = await accountHeartbeat(c.env, call);
  const timestamp = now();
  await getDb(c.env).update(aiCompanionCalls).set({ status: "ended", endedAt: timestamp, updatedAt: timestamp }).where(and(eq(aiCompanionCalls.id, call.id), eq(aiCompanionCalls.userId, context.userId)));
  return c.json({ ok: true, billableSeconds: usage.billableSeconds });
});
