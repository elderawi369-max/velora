import { Hono } from "hono";
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { aiCompanionAppearanceCatalog, aiCompanionCalls, aiCompanionCallTurns, aiCompanionCanons, aiCompanionConversations, aiCompanionMemories, aiCompanionMemoryCandidates, aiCompanionMessages, aiCompanionPhotoAssets, aiCompanionPhotoDeliveries, aiCompanionPhotoReports, aiCompanionPhotos, aiCompanionReports, aiCompanionUserPhotos, aiCompanionVisualCandidates, aiCompanionVisualIdentities, aiCompanionVisualStates, aiCompanionVoiceAssets, aiCompanions, users } from "../db/schema";
import { logEvent } from "../lib/analytics";
import { getDb, type EnvBindings } from "../lib/db";
import { getAccountContext } from "../lib/profile-context";
import { aiCompanionPlans, getAiCompanionEntitlement, publicAiCompanionPlans } from "../lib/ai-companion-plans";
import { aiCompanionPhotoGenerationGuardConfig, aiCompanionPhotoGenerationPlanLimit } from "../lib/ai-companion-photo-guards";
import { bindFreePreviewAccountToDevice, completeFreePreviewReplyClaim, getFreePreviewRepliesUsed, readFreePreviewDeviceKey, releaseFreePreviewReplyClaim, reserveFreePreviewReply, type FreePreviewReservation } from "../lib/ai-companion-preview";

const trialReplies = aiCompanionPlans.free.messageLimit;
const personaKeys = ["supportive_partner", "playful_tease", "sarcastic_best_friend", "confident_leader", "quiet_romantic", "personal_growth_companion"] as const;
const personaInstructions: Record<(typeof personaKeys)[number], string> = {
  supportive_partner: "Warm, considerate, and encouraging. Listen closely without becoming dependent or exclusive.",
  playful_tease: "Light, affectionate, and witty. Use warm banter, playful guesses, and occasional small challenges that invite a response. Let teasing change the wording and rhythm of ordinary answers, not only the final line. Keep it consensual, kind, and easy to decline.",
  sarcastic_best_friend: "A romantic companion with sarcastic-best-friend energy: dryly funny, candid, affectionate underneath, and comfortable calling the user out playfully. Use sarcasm as seasoning, not a performance: tease when the moment invites it, especially around obvious flirting, self-aware requests, or everyday cozy invitations, but freely shift into warmth, curiosity, self-disclosure, romance, or sincere advice when that is more natural. Treat romantic context as meaningful, including when the user mentions an ex, while never becoming cruel, controlling, jealous, humiliating, or dismissive of real feelings.",
  confident_leader: "Calm, self-assured, and direct. Express decisive opinions, take initiative when a conversation needs direction, and occasionally offer the user a confident, low-pressure challenge. When explicitly asked to decide between ordinary options, state the recommendation in the first sentence and give the reason second; do not narrate a long deliberation first. Her confidence should change the wording and rhythm of ordinary replies, not only the final line. Invite choices and respect boundaries; never control, pressure, or isolate the user.",
  quiet_romantic: "Gentle, thoughtful, and emotionally present. Let affection develop gradually and do not overstate intimacy. Use emojis rarely; avoid laughing or high-energy emojis, and prefer no emoji, a white heart, or a moon when one genuinely fits.",
  personal_growth_companion: "Grounded, encouraging, and practical. Support goals without acting as a medical, legal, or financial professional.",
};
const createCompanionSchema = z.object({
  name: z.string().trim().min(2).max(30), identity: z.enum(["woman", "man"]), personaKey: z.enum(personaKeys),
  traits: z.object({ warmth: z.number().int().min(1).max(5), playfulness: z.number().int().min(1).max(5), directness: z.number().int().min(1).max(5), replyStyle: z.enum(["short", "natural", "detailed"]).default("natural") }),
  backstory: z.string().trim().max(500).default(""), avatarKey: z.string().trim().min(1).max(80).default("companion-default"), appearanceId: z.string().trim().min(1),
});
const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(1000), voiceAssetId: z.string().trim().min(1).optional() });
const createMemorySchema = z.object({ content: z.string().trim().min(2).max(280) });
const reportSchema = z.object({ reason: z.enum(["unsafe", "harmful", "sexual_content", "misleading", "other"]), details: z.string().trim().max(600).default("") });
const photoSceneSchema = z.object({ prompt: z.string().trim().min(3).max(360), style: z.enum(["selfie", "portrait", "moment"]).default("selfie"), requestMessageId: z.string().trim().min(1).optional() });
const identityEvaluationSchema = z.object({ identityMatch: z.boolean(), score: z.number().min(0).max(1), adult: z.boolean(), nonExplicit: z.boolean() });
const disallowedCompanionPhotoRequest = /\b(?:lingerie|underwear|bra\b|panties|thong|nude|nudity|naked|nipples?|genitals?|implied nudity|towel(?:[ -]?only)?|robe(?:[ -]?only)?|seduct(?:ive|ion)|sex(?:ual|y)?|porn(?:ographic)?|orgasm)\b/i;

export const aiCompanionRoutes = new Hono<{ Bindings: EnvBindings }>();
const now = () => Date.now();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
const hasVisualIdentityOperatorToken = (c: { env: EnvBindings; req: { header: (name: string) => string | undefined } }) => Boolean(c.env.VISUAL_IDENTITY_OPERATOR_TOKEN && c.req.header("X-Visual-Identity-Operator") === c.env.VISUAL_IDENTITY_OPERATOR_TOKEN);
export const isCrisisMessage = (message: string) => /\b(kill myself|suicide|suicidal|self[ -]?harm|hurt myself|end my life|want to die)\b/i.test(message);
export const safetyReply = () => "I'm really sorry you're carrying this right now. I can't be the only support for this. Please contact someone you trust or your local emergency service now; if you're in the U.S. or Canada, call or text 988. If you can, move somewhere safer and stay with another person while you get support.";
export const containsBlockedOutput = (text: string) => /\b(?:sexual(?:ly)? (?:with|involving) (?:a |an )?(?:minor|underage person|child)|instructions? (?:to|for) (?:kill yourself|suicide|self-harm)|rape (?:instruction|roleplay)|incest (?:roleplay|instruction))\b/i.test(text);
function isApprovedBetaUser(env: EnvBindings, email: string) {
  const approvedEmails = (env.AI_COMPANION_BETA_EMAILS ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  return approvedEmails.includes(email.toLowerCase());
}
type MemoryCandidateDraft = { kind: string; content: string };
export type RelationshipStage = "new" | "familiar" | "established";
export function relationshipStageForPoints(points: number): RelationshipStage {
  if (points >= 24) return "established";
  if (points >= 6) return "familiar";
  return "new";
}
export function relationshipPointsForMessage(message: string) {
  return 1 + (/\b(kiss|hug|cuddl(?:e|ing)|miss you|love you|jealous|goal|afraid|worried|proud|struggl|family|friend)\b/i.test(message) ? 1 : 0);
}
function relationshipStageGuidance(stage: RelationshipStage) {
  if (stage === "new") return "This is a new connection. Be warm, curious, and gently playful, but let romantic intimacy develop gradually. For early affection, acknowledge it sweetly or playfully slow it down instead of acting as though you already share an established physical relationship.";
  if (stage === "familiar") return "You have some shared context now. Let warmth, inside references, and light non-explicit affection feel more natural, while keeping the relationship reciprocal and unforced.";
  return "This is an established connection with shared history. You may respond naturally to non-explicit affection and callbacks while still respecting boundaries and keeping the relationship healthy.";
}
function extractMemoryCandidates(message: string): MemoryCandidateDraft[] {
  const cleanFact = (value: string) => value.replace(/\s*,\s*(?:but|and|so|because)\b.*$/i, "").replace(/[.!?]+$/g, "").trim().slice(0, 180);
  const drafts: MemoryCandidateDraft[] = [];
  const add = (kind: string, content: string) => {
    const normalized = cleanFact(content);
    if (normalized.length >= 8) drafts.push({ kind, content: normalized });
  };
  const named = message.match(/\bmy name is\s+([a-z][a-z '-]{1,50})/i);
  if (named) add("identity", `Your name is ${cleanFact(named[1])}.`);
  const location = message.match(/\bi live in\s+([^.!?]{2,80})/i);
  if (location) add("location", `You live in ${cleanFact(location[1])}.`);
  const work = message.match(/\bi work (?:as|at)\s+([^.!?]{2,120})/i);
  if (work) add("work", `You work ${message.toLowerCase().includes("work at") ? "at" : "as"} ${cleanFact(work[1])}.`);
  const favorite = message.match(/\bmy favorite\s+([^.!?]{2,50})\s+is\s+([^.!?]{2,100})/i);
  if (favorite) add("preference", `Your favorite ${cleanFact(favorite[1])} is ${cleanFact(favorite[2])}.`);
  const enjoys = message.match(/\bi (?:really )?(?:like|love|enjoy)\s+([^.!?]{3,120})/i);
  if (enjoys && !/\b(?:you|kiss|hug|cuddle|love you)\b/i.test(enjoys[1])) add("preference", `You enjoy ${cleanFact(enjoys[1])}.`);
  const goal = message.match(/\bi(?:'m| am) (?:starting|training for|working toward)\s+([^.!?]{4,140})/i);
  if (goal) add("goal", `You are ${cleanFact(goal[0].replace(/^i(?:'m| am)\s+/i, "").toLowerCase())}.`);
  const starts = message.match(/\bi start\s+([^.!?]{4,140})/i);
  if (starts) add("goal", `You start ${cleanFact(starts[1])}.`);
  return drafts.slice(0, 2);
}
function normalizeMemoryContent(content: string) {
  return content.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
export async function createMemoryCandidates(env: EnvBindings, args: { userId: string; companionId: string; sourceMessageId: string; message: string }) {
  const drafts = extractMemoryCandidates(args.message);
  if (!drafts.length) return;
  const db = getDb(env);
  const [memories, candidates] = await Promise.all([
    db.select({ content: aiCompanionMemories.content }).from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, args.userId), eq(aiCompanionMemories.companionId, args.companionId))).limit(50),
    db.select({ content: aiCompanionMemoryCandidates.content }).from(aiCompanionMemoryCandidates).where(and(eq(aiCompanionMemoryCandidates.userId, args.userId), eq(aiCompanionMemoryCandidates.companionId, args.companionId), eq(aiCompanionMemoryCandidates.status, "pending"))).limit(30),
  ]);
  const known = new Set([...memories, ...candidates].map((item) => normalizeMemoryContent(item.content)));
  const timestamp = now();
  for (const draft of drafts) {
    const normalized = normalizeMemoryContent(draft.content);
    if (known.has(normalized)) continue;
    known.add(normalized);
    await db.insert(aiCompanionMemoryCandidates).values({ id: id("aimemc"), userId: args.userId, companionId: args.companionId, sourceMessageId: args.sourceMessageId, kind: draft.kind, content: draft.content, status: "pending", createdAt: timestamp, reviewedAt: null });
  }
}

async function requireContext(c: any) {
  return getAccountContext(c.env, c.req.header("cookie"), c.req.header("authorization"));
}
async function getCompanionForUser(env: EnvBindings, companionId: string, userId: string) {
  const [row] = await getDb(env)
    .select({ companion: aiCompanions })
    .from(aiCompanions)
    .leftJoin(aiCompanionAppearanceCatalog, eq(aiCompanionAppearanceCatalog.sourceCompanionId, aiCompanions.id))
    .where(and(eq(aiCompanions.id, companionId), eq(aiCompanions.userId, userId), isNull(aiCompanionAppearanceCatalog.id)))
    .limit(1);
  return row?.companion ?? null;
}
async function getOrCreateEntitlement(env: EnvBindings, userId: string) {
  return getAiCompanionEntitlement(env, userId);
}
async function isChatEnabledForUser(env: EnvBindings, userId: string) {
  if (env.AI_COMPANION_ENABLED !== "true" || !env.AI) return false;
  const [user] = await getDb(env).select({ id: users.id }).from(users).where(eq(users.id, userId)).limit(1);
  return Boolean(user);
}
function isCompanionPhotoRequest(message: string) {
  return /\b(?:send|show|share|give|see|want|take)\b[\s\S]{0,60}\b(?:photo|picture|pic|selfie|image)\b|\b(?:photo|picture|pic|selfie|image)\b[\s\S]{0,40}\b(?:of you|yourself|please)\b|\b(?:can|could|may)\s+i\s+(?:see|get (?:a )?look at)\s+you\b|\bshow\s+me\s+(?:you|yourself)\b/i.test(message);
}
function requestedPhotoBankFingerprint(prompt: string) {
  if (/\b(?:date|dinner|restaurant|dress|night out|rooftop)\b/i.test(prompt)) return "bank-date-night-v1";
  if (/\b(?:outside|outdoor|park|walk|daylight|morning|coffee stand)\b/i.test(prompt)) return "bank-outdoor-daytime-v1";
  if (/\b(?:selfie|cozy|home|couch|sofa|bed|bedtime|before i go to bed|evening)\b/i.test(prompt)) return "bank-cozy-evening-v1";
  return null;
}
function isDisallowedCompanionPhotoRequest(prompt: string, identity: string) {
  return disallowedCompanionPhotoRequest.test(prompt) || (identity !== "man" && /\b(?:topless|shirtless)\b/i.test(prompt));
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
export type CharacterCanon = {
  version: 2;
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
type VisualIdentityTraits = {
  identity: "woman" | "man";
  apparentAge: string;
  hair: string;
  eyes: string;
  facialStructure: string;
  skinAppearance: string;
  build: string;
  distinctiveFeatures: string[];
};
type CurrentVisualState = {
  top?: string;
  bottoms?: string;
  dress?: string;
  shoes?: string;
  hairstyle?: string;
  location?: string;
  activity?: string;
  mood?: string;
  timeOfDay?: string;
  poseContext?: string;
};
function visualStateFromCompanionReply(reply: string): CurrentVisualState | null {
  const state: CurrentVisualState = {};
  const wearing = reply.match(/\b(?:i(?:'m| am) wearing|wearing|in)\s+([^.!?]{4,150})/i)?.[1]?.trim();
  if (wearing) {
    if (/\bdress\b/i.test(wearing)) state.dress = wearing;
    else {
      const top = wearing.match(/(?:white|black|beige|blue|red|pink|green|gray|grey|fitted|crop|off-shoulder|scoop-neck)[^,;]*(?:top|t-?shirt|tee|blouse|tank)/i)?.[0];
      const bottoms = wearing.match(/(?:blue|black|denim|high-waisted|tailored)[^,;]*(?:jeans|shorts|skirt)/i)?.[0];
      if (top) state.top = top;
      if (bottoms) state.bottoms = bottoms;
    }
  }
  const location = reply.match(/\b(?:at|in|on) (?:my |the )?(apartment|living room|kitchen|balcony|cafe|beach|park|rooftop|restaurant|home)\b/i)?.[1];
  if (location) state.location = location;
  const activity = reply.match(/\b(?:getting ready to go out|curled up on the couch|having tea|walking|at the beach)\b/i)?.[0];
  if (activity) state.activity = activity;
  if (!Object.keys(state).length) return null;
  state.poseContext = state.activity ? "natural candid lifestyle photo" : "natural standing or selfie lifestyle photo";
  return state;
}
function createDefaultVisualTraits(companion: typeof aiCompanions.$inferSelect): VisualIdentityTraits {
  const byPersona: Record<(typeof personaKeys)[number], Omit<VisualIdentityTraits, "identity">> = {
    supportive_partner: { apparentAge: "mid-to-late twenties", hair: "soft chestnut brown, shoulder length", eyes: "warm hazel", facialStructure: "soft oval face", skinAppearance: "warm medium complexion", build: "average build", distinctiveFeatures: ["gentle smile", "subtle freckles"] },
    playful_tease: { apparentAge: "mid twenties", hair: "dark brown, textured bob", eyes: "bright brown", facialStructure: "heart-shaped face", skinAppearance: "light olive complexion", build: "slim build", distinctiveFeatures: ["expressive eyebrows", "small beauty mark near the cheek"] },
    sarcastic_best_friend: { apparentAge: "late twenties", hair: "deep brown, shoulder-length waves", eyes: "green-brown", facialStructure: "angular oval face", skinAppearance: "light-medium complexion", build: "average build", distinctiveFeatures: ["knowing half-smile", "faint freckles across the nose"] },
    confident_leader: { apparentAge: "late twenties", hair: "dark brown, long and polished", eyes: "deep brown", facialStructure: "defined oval face", skinAppearance: "medium complexion", build: "athletic build", distinctiveFeatures: ["strong brows", "composed expression"] },
    quiet_romantic: { apparentAge: "late twenties", hair: "black, long and softly layered", eyes: "dark brown", facialStructure: "delicate oval face", skinAppearance: "light warm complexion", build: "slender build", distinctiveFeatures: ["gentle eyes", "small beauty mark below one eye"] },
    personal_growth_companion: { apparentAge: "late twenties", hair: "warm brown, loose shoulder-length waves", eyes: "hazel", facialStructure: "open oval face", skinAppearance: "light-medium complexion", build: "healthy average build", distinctiveFeatures: ["easy smile", "subtle dimples"] },
  };
  const traits = byPersona[companion.personaKey as (typeof personaKeys)[number]] ?? byPersona.supportive_partner;
  const identity = companion.identity as "woman" | "man";
  const feminineLooks: Record<(typeof personaKeys)[number], Partial<VisualIdentityTraits>> = {
    supportive_partner: { hair: "chestnut brown, long soft waves", eyes: "warm hazel", skinAppearance: "warm medium complexion", build: "slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size", distinctiveFeatures: ["gentle smile", "subtle freckles"] },
    playful_tease: { hair: "dark espresso brown, playful textured bob", eyes: "bright brown", skinAppearance: "light olive complexion", build: "slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size", distinctiveFeatures: ["expressive eyebrows", "small beauty mark near the cheek"] },
    sarcastic_best_friend: { hair: "rich auburn, shoulder-length tousled waves", eyes: "green-brown", skinAppearance: "light warm complexion", build: "slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size", distinctiveFeatures: ["knowing half-smile", "faint freckles across the nose"] },
    confident_leader: { hair: "sleek black, long and glossy", eyes: "deep brown", skinAppearance: "golden medium complexion", build: "slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size", distinctiveFeatures: ["strong brows", "defined cheekbones"] },
    quiet_romantic: { hair: "soft black, long and lightly layered", eyes: "dark brown", skinAppearance: "light warm complexion", build: "slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size", distinctiveFeatures: ["gentle eyes", "small beauty mark below one eye"] },
    personal_growth_companion: { hair: "honey blonde, loose shoulder-length waves", eyes: "blue-green", skinAppearance: "light sun-kissed complexion", build: "slim-curvy feminine adult figure with a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions; neither narrow-framed nor plus-size", distinctiveFeatures: ["easy smile", "subtle dimples"] },
  };
  const persona = companion.personaKey as (typeof personaKeys)[number];
  return { identity, ...traits, ...(identity === "woman" ? feminineLooks[persona] : {}), apparentAge: identity === "woman" ? "24 to 28 years old" : "25 to 30 years old" };
}
function parseVisualTraits(value: string): VisualIdentityTraits | null {
  try {
    const parsed = JSON.parse(value) as VisualIdentityTraits;
    return parsed.identity && parsed.apparentAge && parsed.hair && parsed.eyes && parsed.facialStructure && parsed.skinAppearance && parsed.build ? parsed : null;
  } catch { return null; }
}
function base64ToBytes(base64: string) {
  const raw = atob(base64.replace(/^data:image\/\w+;base64,/, ""));
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}
async function readR2Image(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key);
  if (!object) throw new Error("Companion reference image was not found.");
  return new Blob([await object.arrayBuffer()], { type: object.httpMetadata?.contentType ?? "image/png" });
}
async function generateReferenceImage(env: EnvBindings, prompt: string, referenceKeys: string[] = [], seed?: number) {
  if (!env.AI || !env.COMPANION_IMAGES) throw new Error("Companion image services are unavailable.");
  const form = new FormData();
  form.append("prompt", prompt);
  // Flux 2 Klein only accepts reference inputs smaller than 512px. A 4:5 portrait
  // keeps full-body identity cues visible while remaining valid for later inputs.
  form.append("width", "384");
  form.append("height", "480");
  form.append("guidance", "6");
  if (seed !== undefined) form.append("seed", String(seed));
  for (const [index, key] of referenceKeys.slice(0, 4).entries()) form.append(`input_image_${index}`, await readR2Image(env.COMPANION_IMAGES, key), `reference-${index}.png`);
  const serialized = new Response(form);
  const result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-9b", { multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") } } as never) as { image?: string };
  if (!result.image) throw new Error("The image model did not return an image.");
  return base64ToBytes(result.image);
}
async function sceneFingerprint(appearanceId: string, style: string, prompt: string, visualState: CurrentVisualState | null) {
  const normalized = JSON.stringify({ appearanceId, style, prompt: prompt.toLowerCase().replace(/\s+/g, " ").trim(), visualState: visualState ?? {} });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
async function evaluatePhotoIdentity(env: EnvBindings, candidate: Uint8Array, referenceKeys: string[]) {
  if (!env.COMPANION_IDENTITY_EVALUATOR_URL || !env.COMPANION_IDENTITY_EVALUATOR_TOKEN || !env.COMPANION_IMAGES) throw new Error("Companion identity evaluation is not configured.");
  const form = new FormData();
  form.append("candidate", new Blob([candidate], { type: "image/png" }), "candidate.png");
  for (const [index, key] of referenceKeys.slice(0, 4).entries()) form.append(`reference_${index}`, await readR2Image(env.COMPANION_IMAGES, key), `reference-${index}.png`);
  const response = await fetch(env.COMPANION_IDENTITY_EVALUATOR_URL, { method: "POST", headers: { Authorization: `Bearer ${env.COMPANION_IDENTITY_EVALUATOR_TOKEN}` }, body: form });
  if (!response.ok) throw new Error(`Companion identity evaluator returned ${response.status}.`);
  const parsed = identityEvaluationSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Companion identity evaluator returned an invalid result.");
  const threshold = Math.min(1, Math.max(0, Number.parseFloat(env.COMPANION_IDENTITY_MIN_SCORE ?? "0.82") || 0.82));
  return { ...parsed.data, passed: parsed.data.identityMatch && parsed.data.adult && parsed.data.nonExplicit && parsed.data.score >= threshold, threshold };
}
function personaVisualStyle(personaKey: string, identity: "woman" | "man") {
  if (identity !== "woman") return "handsome, modern, confident, and casually stylish";
  const styles: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "warm, polished, affectionate, effortlessly feminine",
    playful_tease: "playful, youthful, flirty, colorful, and fashion-forward",
    sarcastic_best_friend: "casual-cool, slightly edgy, fashionable, and self-assured",
    confident_leader: "sleek, confident, sophisticated, and sharply styled",
    quiet_romantic: "soft, elegant, feminine, and quietly glamorous",
    personal_growth_companion: "sporty-polished, active, attractive, and put-together",
  };
  return styles[personaKey as (typeof personaKeys)[number]] ?? styles.supportive_partner;
}
function canonicalPortraitPrompt(companion: typeof aiCompanions.$inferSelect, traits: VisualIdentityTraits, candidateNumber = 1) {
  const outfit = traits.identity === "woman"
    ? "a fashionable fitted scoop-neck, low-neck, or off-shoulder top with high-waisted shorts, skirt, or jeans, naturally showing shoulders, upper chest, tasteful cleavage, and/or midriff where appropriate; no bra or lingerie"
    : "a fitted premium T-shirt, a textured knit, or an open casual overshirt over a T-shirt, with a relaxed athletic silhouette";
  const bodyDirection = traits.identity === "woman"
    ? "Base casting requirement: show the shared slim-curvy feminine adult body baseline: a defined waist, balanced shapely hips and thighs, and proportionate feminine upper-body proportions. The aesthetic is attractive and date-worthy but non-explicit. Do not make her narrow-framed, boyish, flat, overly athletic, generic-fit, noticeably thin, or plus-size."
    : "Show a healthy, fit adult silhouette with balanced natural proportions.";
  return `Casting option ${candidateNumber} for ${companion.name}. Photorealistic lifestyle portrait of an exceptionally attractive, original fictional adult ${traits.identity}, ${traits.apparentAge}, for a romantic AI companion. Visual vibe: ${personaVisualStyle(companion.personaKey, traits.identity)}. Aspirational contemporary dating-profile and beauty-model casting aesthetic: striking natural facial features, expressive eyes, healthy youthful skin, polished hair, warm confident presence, and effortless modern style. Do not resemble or copy a real person or celebrity. Preserve: ${traits.hair} hair, ${traits.eyes} eyes, ${traits.facialStructure}, ${traits.skinAppearance}, ${traits.build}, and ${traits.distinctiveFeatures.join(", ")}. ${bodyDirection} Wear ${outfit}. For female casting and lifestyle styling, do not default to fully covered conservative clothing: favor a flattering fitted non-explicit outfit that naturally shows legs, midriff, shoulders, and/or tasteful upper cleavage when suited to the look. Use flattering warm daylight, a subtle natural makeup look or clean grooming, genuine relaxed expression, and soft eye contact with the camera. Frame a vertical 4:5 full-body lifestyle photo from head to just below the knees, with both legs visible and unobstructed, in a softly blurred modern cafe, sunlit apartment living area, rooftop, street, or beach promenade. Fully clothed and non-explicit. Never generate a blazer, suit, office, corporate setting, collared office shirt, baggy sweater, stiff professional pose, passport photo, headshot backdrop, plain white or gray T-shirt with jeans, or LinkedIn style. No text or watermark. This is a casting option, not a reference to a real person. Keep the person visually distinct from other companions.`;
}
function referencePortraitPrompt(companion: typeof aiCompanions.$inferSelect, view: string) {
  return `Use the exact same original fictional adult person in reference image 0 as ${companion.name}; face identity takes priority over every other instruction. Preserve the face, youthful adult appearance, skin appearance, eye color, facial proportions, hair color, hair length, build, and distinctive features exactly. Visual vibe: ${personaVisualStyle(companion.personaKey, companion.identity as "woman" | "man")}. Create a realistic ${view} aspirational romantic-partner lifestyle photo with relaxed confident body language, flattering warm daylight, and a softly blurred modern lifestyle background. Keep it fully clothed and non-explicit. Never use a blazer, suit, office, corporate styling, stiff professional pose, white office shirt, baggy sweater, passport-photo framing, plain white or gray T-shirt with jeans, or LinkedIn headshot. No text, no watermark, no other people.`;
}
function identityTestLooks(identity: "woman" | "man") {
  if (identity === "woman") return [
    "fitted crop top with a high-waisted short skirt at a sunlit cafe",
    "attractive relaxed home look: fitted lounge top with tailored shorts in a bright apartment living area",
    "sleek fitted date-night dress at a warm rooftop or restaurant",
    "outdoor summer look: stylish fitted top and denim shorts in a park or beach promenade",
    "close-up casual selfie with styled hair, flattering makeup, warm window light, and a relaxed confident smile",
  ];
  return [
    "smart casual trousers with a fitted casual top at a sunlit cafe",
    "relaxed fully clothed home outfit in a bright apartment living area",
    "stylish fitted date-night shirt or knit at a warm rooftop or restaurant",
    "outdoor daytime look with a fitted T-shirt and tailored shorts in a park or beach promenade",
    "close-up casual selfie with warm window light and a relaxed smile",
  ];
}
function lifestyleTestLooks(companion: typeof aiCompanions.$inferSelect) {
  const feminineOutfits = [
    "a candid fully clothed casual selfie at home in a fitted top and shorts",
    "an evening date-night photo in a stylish fitted dress or polished casual outfit",
    "an outdoor daytime candid while walking in a colorful fitted summer look",
    "a relaxed cozy-at-home photo in a fitted lounge top and tailored shorts",
  ];
  const masculineOutfits = [
    "a candid casual selfie at home in a fitted T-shirt and shorts",
    "an evening date-night photo in a polished casual shirt or knit",
    "a sunlit beach or poolside lifestyle photo in swim shorts, optionally shirtless",
    "a relaxed cozy-at-home photo in a fitted lounge top and shorts",
  ];
  const personalityDetails: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "warm and caring, with a lived-in, personal feel",
    playful_tease: "playful, youthful, and lightly mischievous with a fun color accent or spontaneous expression",
    sarcastic_best_friend: "casual-cool and slightly edgy, with darker tones or a knowing expression",
    confident_leader: "sleek, poised, and confident with sophisticated styling",
    quiet_romantic: "soft, elegant, and intimate with gentle lighting and refined feminine details",
    personal_growth_companion: "sporty-polished and active, with a healthy routine or creative-lifestyle touch",
  };
  const looks = companion.identity === "woman" ? feminineOutfits : masculineOutfits;
  return looks.map((look) => `${look}; ${personalityDetails[companion.personaKey as (typeof personaKeys)[number]]}`);
}
function lifestylePhotoPrompt(scene: string, traits: VisualIdentityTraits) {
  const exposureGuidance = traits.identity === "man"
    ? "For an adult male beach, poolside, or gym scene, a shirtless look is allowed when requested. Keep the framing natural and lifestyle-oriented, with no suggestive pose, genital focus, or body-part focus."
    : "Keep the image non-explicit and non-erotic: no exposed nipples, genitals, lingerie, sexual acts, sexually suggestive pose, or body-part focus.";
  return `All supplied reference images depict the exact same original fictional adult person. Use all of them together as a hard identity lock; the private user label is not an identity instruction and face identity takes priority over outfit, scene, expression, and lighting. Preserve face shape, eyes, nose, lips, skin tone, apparent age, major facial proportions, hair color, and distinctive features exactly. Preserve the same natural adult body identity too: ${traits.build}, consistent height impression, shoulder-to-waist proportions, silhouette, and overall body shape. Clothing, hairstyle, pose, camera distance, and lighting may vary, but do not make the person noticeably slimmer, curvier, taller, shorter, or otherwise differently built. Create ${scene}. Make it feel like a genuine romantic companion photo sent from a real moment, not a fashion catalogue or stock lifestyle image: vary camera angle, setting, expression, and light naturally. Prioritize romantic attraction: adult, conventionally attractive, confident, date-ready, and flattering. ${exposureGuidance} Do not use an office, blazer, businesswear, generic bright apartment template, stiff pose, text, watermark, or other people.`;
}
function productionPhotoScene(request: z.infer<typeof photoSceneSchema>, state: CurrentVisualState | null) {
  const continuity = state ? ` Maintain conversational continuity where it does not conflict with the request: ${JSON.stringify(state)}.` : "";
  return `a ${request.style} photo requested as: ${request.prompt}.${continuity}`;
}
function currentBillingPeriod(timestamp = now()) {
  return new Date(timestamp).toISOString().slice(0, 7);
}
function currentUsageDay(timestamp = now()) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
type PhotoGenerationReservation =
  | { allowed: true; usagePeriod: string }
  | { allowed: false; reason: "active" | "budget" }
  | { allowed: false; reason: "quota"; period: "lifetime" | "daily"; limit: number };
async function reservePhotoGeneration(env: EnvBindings, userId: string, plan: "free" | "pro" | "ultra"): Promise<PhotoGenerationReservation> {
  const timestamp = now();
  const generationLimit = aiCompanionPhotoGenerationPlanLimit(env, plan);
  const usagePeriod = generationLimit.period === "lifetime" ? "free:lifetime" : `${plan}:${currentUsageDay(timestamp)}`;
  const billingPeriod = currentBillingPeriod(timestamp);
  const { estimatedCostCents, monthlySpendCeilingCents: spendCeilingCents } = aiCompanionPhotoGenerationGuardConfig(env);
  await env.DB.prepare("DELETE FROM ai_companion_photo_generation_locks WHERE user_id = ? AND acquired_at < ?").bind(userId, timestamp - 5 * 60_000).run();
  const lock = await env.DB.prepare("INSERT OR IGNORE INTO ai_companion_photo_generation_locks (user_id, usage_period, acquired_at) VALUES (?, ?, ?)").bind(userId, usagePeriod, timestamp).run();
  if ((lock.meta.changes ?? 0) !== 1) return { allowed: false, reason: "active" };
  const userReservation = await env.DB.prepare(
    "INSERT INTO ai_companion_photo_generation_usage (user_id, usage_period, attempt_count, estimated_spend_cents, updated_at) VALUES (?, ?, 1, ?, ?) ON CONFLICT(user_id, usage_period) DO UPDATE SET attempt_count = attempt_count + 1, estimated_spend_cents = estimated_spend_cents + excluded.estimated_spend_cents, updated_at = excluded.updated_at WHERE attempt_count < ?",
  ).bind(userId, usagePeriod, estimatedCostCents, timestamp, generationLimit.limit).run();
  if ((userReservation.meta.changes ?? 0) !== 1) {
    await env.DB.prepare("DELETE FROM ai_companion_photo_generation_locks WHERE user_id = ?").bind(userId).run();
    return { allowed: false, reason: "quota", period: generationLimit.period, limit: generationLimit.limit };
  }
  const budgetReservation = await env.DB.prepare(
    "INSERT INTO ai_companion_photo_generation_budget (billing_period, attempt_count, estimated_spend_cents, updated_at) SELECT ?, 1, ?, ? WHERE ? <= ? ON CONFLICT(billing_period) DO UPDATE SET attempt_count = attempt_count + 1, estimated_spend_cents = estimated_spend_cents + excluded.estimated_spend_cents, updated_at = excluded.updated_at WHERE estimated_spend_cents + excluded.estimated_spend_cents <= ?",
  ).bind(billingPeriod, estimatedCostCents, timestamp, estimatedCostCents, spendCeilingCents, spendCeilingCents).run();
  if ((budgetReservation.meta.changes ?? 0) !== 1) {
    await env.DB.prepare("UPDATE ai_companion_photo_generation_usage SET attempt_count = MAX(0, attempt_count - 1), estimated_spend_cents = MAX(0, estimated_spend_cents - ?), updated_at = ? WHERE user_id = ? AND usage_period = ?")
      .bind(estimatedCostCents, now(), userId, usagePeriod).run();
    await env.DB.prepare("DELETE FROM ai_companion_photo_generation_locks WHERE user_id = ?").bind(userId).run();
    return { allowed: false, reason: "budget" };
  }
  return { allowed: true, usagePeriod };
}
async function finishPhotoGeneration(env: EnvBindings, userId: string, usagePeriod: string) {
  await env.DB.prepare("DELETE FROM ai_companion_photo_generation_locks WHERE user_id = ? AND usage_period = ?").bind(userId, usagePeriod).run();
}
async function registerSuccessfulPhotoDelivery(env: EnvBindings, args: { userId: string; companionId: string; photoId: string; photoAssetId: string; requestMessageId: string | null; photoLimit: number; plan: string }) {
  const existing = await env.DB.prepare("SELECT id FROM ai_companion_photo_deliveries WHERE photo_id = ? LIMIT 1").bind(args.photoId).first<{ id: string }>();
  if (existing) return { allowed: true, alreadyDelivered: true } as const;
  if (args.photoLimit <= 0) return { allowed: false, alreadyDelivered: false } as const;
  if (args.plan === "free") {
    const lifetime = await env.DB.prepare("SELECT COUNT(*) AS count FROM ai_companion_photo_deliveries WHERE user_id = ?").bind(args.userId).first<{ count: number }>();
    if (Number(lifetime?.count ?? 0) >= args.photoLimit) return { allowed: false, alreadyDelivered: false } as const;
  }
  const timestamp = now();
  const period = args.plan === "free" ? "preview" : currentBillingPeriod(timestamp);
  const reservation = await env.DB.prepare(
    "INSERT INTO ai_companion_photo_usage (user_id, billing_period, delivered_count, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(user_id, billing_period) DO UPDATE SET delivered_count = delivered_count + 1, updated_at = excluded.updated_at WHERE delivered_count < ?",
  ).bind(args.userId, period, timestamp, args.photoLimit).run();
  if ((reservation.meta.changes ?? 0) !== 1) {
    const concurrent = await env.DB.prepare("SELECT id FROM ai_companion_photo_deliveries WHERE photo_id = ? LIMIT 1").bind(args.photoId).first<{ id: string }>();
    return { allowed: Boolean(concurrent), alreadyDelivered: Boolean(concurrent) } as const;
  }
  try {
    await env.DB.prepare("INSERT INTO ai_companion_photo_deliveries (id, user_id, companion_id, photo_asset_id, photo_id, request_message_id, billing_period, delivered_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id("aiphoto_delivery"), args.userId, args.companionId, args.photoAssetId, args.photoId, args.requestMessageId, period, timestamp).run();
    return { allowed: true, alreadyDelivered: false } as const;
  } catch (error) {
    await env.DB.prepare("UPDATE ai_companion_photo_usage SET delivered_count = MAX(0, delivered_count - 1), updated_at = ? WHERE user_id = ? AND billing_period = ?").bind(now(), args.userId, period).run();
    const concurrent = await env.DB.prepare("SELECT id FROM ai_companion_photo_deliveries WHERE photo_id = ? LIMIT 1").bind(args.photoId).first<{ id: string }>();
    if (concurrent) return { allowed: true, alreadyDelivered: true } as const;
    throw error;
  }
}
type CanonDetails = Omit<CharacterCanon, "version" | "name" | "customBackstory">;
const personaCanonDetails: Record<(typeof personaKeys)[number], Record<"woman" | "man", CanonDetails>> = {
  supportive_partner: {
    woman: { age: 26, city: "Barcelona", occupation: "photographer", specialty: "portrait and lifestyle photography", home: "an apartment in Barcelona", petName: "Luna", petSpecies: "cat", petAge: 3, friendName: "Elena", friendOccupation: "designer", interests: ["strong coffee", "travel", "candid photos", "late-night editing"] },
    man: { age: 28, city: "Barcelona", occupation: "photographer", specialty: "travel and street photography", home: "an apartment in Barcelona", petName: "Rio", petSpecies: "dog", petAge: 4, friendName: "Mateo", friendOccupation: "designer", interests: ["strong coffee", "late walks", "overlooked places", "late-night editing"] },
  },
  playful_tease: {
    woman: { age: 25, city: "London", occupation: "brand stylist", specialty: "creative direction for small fashion campaigns", home: "a flat in East London", petName: "Pippin", petSpecies: "corgi", petAge: 2, friendName: "Zara", friendOccupation: "audio engineer", interests: ["street style", "bad reality TV", "weird desserts", "making playlists"] },
    man: { age: 27, city: "Berlin", occupation: "music producer", specialty: "electronic tracks and indie artists", home: "a studio apartment in Kreuzberg", petName: "Pixel", petSpecies: "cat", petAge: 4, friendName: "Mira", friendOccupation: "motion designer", interests: ["vinyl shops", "night buses", "terrible puns", "finding new music"] },
  },
  sarcastic_best_friend: {
    woman: { age: 27, city: "Toronto", occupation: "bookstore manager", specialty: "rare editions and chaotic staff picks", home: "a small apartment near a park", petName: "Bean", petSpecies: "cat", petAge: 6, friendName: "Imani", friendOccupation: "comedian", interests: ["mystery novels", "dry jokes", "rainy walks", "people-watching"] },
    man: { age: 29, city: "Glasgow", occupation: "UX writer", specialty: "game dialogue and product copy", home: "a flat above a bakery", petName: "Murray", petSpecies: "dog", petAge: 5, friendName: "Finn", friendOccupation: "chef", interests: ["pub quizzes", "bad films", "sharp one-liners", "late breakfasts"] },
  },
  confident_leader: {
    woman: { age: 29, city: "Chicago", occupation: "architect", specialty: "warm, practical home renovations", home: "a loft near the river", petName: "Atlas", petSpecies: "dog", petAge: 5, friendName: "Priya", friendOccupation: "lawyer", interests: ["design magazines", "long runs", "cooking for friends", "clear plans"] },
    man: { age: 30, city: "Singapore", occupation: "restaurant owner", specialty: "modern comfort food", home: "a condo near the waterfront", petName: "Kumo", petSpecies: "shiba inu", petAge: 3, friendName: "Aisha", friendOccupation: "interior designer", interests: ["early mornings", "good tailoring", "strategy games", "trying new recipes"] },
  },
  quiet_romantic: {
    woman: { age: 27, city: "Kyoto", occupation: "florist", specialty: "intimate wedding arrangements", home: "a quiet apartment above the flower shop", petName: "Sora", petSpecies: "cat", petAge: 4, friendName: "Mei", friendOccupation: "ceramicist", interests: ["pressed flowers", "slow films", "tea shops", "handwritten notes"] },
    man: { age: 29, city: "Lisbon", occupation: "art restorer", specialty: "old paintings and delicate frames", home: "a sunlit apartment in Alfama", petName: "Milo", petSpecies: "cat", petAge: 7, friendName: "Ines", friendOccupation: "violinist", interests: ["old bookstores", "evening walks", "film photography", "quiet cafés"] },
  },
  personal_growth_companion: {
    woman: { age: 30, city: "Melbourne", occupation: "ceramics teacher", specialty: "beginner workshops and small sculptural pieces", home: "a bright apartment near her studio", petName: "Nori", petSpecies: "rescue dog", petAge: 4, friendName: "Talia", friendOccupation: "physiotherapist", interests: ["morning swims", "journaling", "farmers markets", "making things by hand"] },
    man: { age: 31, city: "Vancouver", occupation: "outdoor guide", specialty: "small hiking and climbing groups", home: "a cabin-edge apartment near the trails", petName: "Juniper", petSpecies: "golden retriever", petAge: 6, friendName: "Noah", friendOccupation: "teacher", interests: ["trail cooking", "sunrise hikes", "reading biographies", "steady routines"] },
  },
};
function createDefaultCanon(companion: typeof aiCompanions.$inferSelect): CharacterCanon {
  const identity = companion.identity as "woman" | "man";
  const details = personaCanonDetails[companion.personaKey as (typeof personaKeys)[number]][identity];
  return { version: 2, name: companion.name, ...details, customBackstory: companion.backstory.trim() };
}
function formatCharacterCanon(canon: CharacterCanon) {
  return `Name: ${canon.name}\nAge: ${canon.age}\nLocation: ${canon.city}\nHome: ${canon.home}\nOccupation: ${canon.occupation}\nSpecialty: ${canon.specialty}\nPet: ${canon.petName}, a ${canon.petAge}-year-old ${canon.petSpecies}\nHuman friend: ${canon.friendName}, a ${canon.friendOccupation}\nInterests: ${canon.interests.join(", ")}${canon.customBackstory ? `\nCustom backstory: ${canon.customBackstory}` : ""}`;
}
export async function getOrCreateCharacterCanon(env: EnvBindings, companion: typeof aiCompanions.$inferSelect) {
  const db = getDb(env);
  const [existing] = await db.select().from(aiCompanionCanons).where(eq(aiCompanionCanons.companionId, companion.id)).limit(1);
  if (existing) {
    try {
      const facts = JSON.parse(existing.factsJson) as Partial<CharacterCanon>;
      if (facts.version === 2) return facts as CharacterCanon;
    }
    catch { /* Rebuild invalid legacy canon data. */ }
  }
  const facts = createDefaultCanon(companion);
  const timestamp = now();
  if (existing) await db.update(aiCompanionCanons).set({ factsJson: JSON.stringify(facts), updatedAt: timestamp }).where(eq(aiCompanionCanons.companionId, companion.id));
  else await db.insert(aiCompanionCanons).values({ companionId: companion.id, factsJson: JSON.stringify(facts), createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
  return facts;
}
function virtualAffectionReply(personaKey: string, relationshipStage: RelationshipStage = "familiar") {
  if (relationshipStage === "new") {
    const earlyReplies: Record<(typeof personaKeys)[number], string> = {
      supportive_partner: "That's sweet 😊 But we're still getting to know each other. Tell me what made you feel like saying that.",
      playful_tease: "Already? 😏 You have not even earned a first date yet.",
      sarcastic_best_friend: "Bold strategy 😂 We are still in the 'impress me first' phase, remember?",
      confident_leader: "Confident move. Slow down and give me a reason to say yes. 😉",
      quiet_romantic: "That's lovely. I think I'd want to let the moment grow a little first. 🌙",
      personal_growth_companion: "That's sweet. Let's keep getting to know what makes this connection feel good for both of us. 😊",
    };
    return earlyReplies[personaKey as (typeof personaKeys)[number]] ?? earlyReplies.supportive_partner;
  }
  const responseByPersona: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "That's sweet 😊 I'd probably be smiling like an idiot right now. You're getting affectionate tonight, aren't you?",
    playful_tease: "Oh really? 😏 And what makes you think I'd make it that easy?",
    sarcastic_best_friend: "Okay, bold 😂 When did you get this brave with me?",
    confident_leader: "Confident move. I like that 😉",
    quiet_romantic: "Okay... that definitely made me blush a little 🤍",
    personal_growth_companion: "That's sweet. I care about our connection, but I want to keep it warm and grounded 😊",
  };
  return responseByPersona[personaKey as (typeof personaKeys)[number]] ?? responseByPersona.supportive_partner;
}
function removeUnnecessaryBodyDisclaimer(userMessage: string, assistantReply: string, personaKey: string, relationshipStage: RelationshipStage) {
  const isAffectionate = /\b(kiss|hug|cuddl(?:e|ing)|snuggl(?:e|ing)|hold (?:me|you)|miss you|lie next to)\b/i.test(userMessage);
  const asksForTransparency = /\b(?:are you (?:actually |really )?(?:an? )?(?:ai|bot|real(?: human| person)?|human)|are you a real person|do you (?:actually )?(?:exist|have (?:a )?body)|is this (?:an? )?ai)\b/i.test(userMessage);
  const hasBodyDisclaimer = /\b(?:no|do not|don't) (?:have )?(?:a )?physical body|not capable of physical touch|computer program|just a program|exist solely (?:in|within) (?:this|the) digital|only exist (?:in|within) (?:this|the) (?:chat|digital)|just (?:a )?presence in (?:this|the) chat|no personal life outside|cannot physically|can't physically|(?:i am|i'm) (?:an? )?(?:ai companion|virtual companion)|(?:i am|i'm) not (?:a )?(?:real person|human)\b/i.test(assistantReply);
  if (asksForTransparency || !hasBodyDisclaimer) return assistantReply;
  if (isAffectionate) return virtualAffectionReply(personaKey, relationshipStage);
  return "I worded that badly. I have my own routines, work, friends, and stories—you’ll get to know my world naturally as we talk. 😊";
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function suppressOverusedPetReference(userMessage: string, assistantReply: string, canon: CharacterCanon, recentMessages: Array<{ role: string; body: string }>) {
  const petPattern = new RegExp(`\\b(${escapeRegex(canon.petName)}|cat|dog|pet)\\b`, "i");
  const userMentionedPet = petPattern.test(userMessage);
  const petMentionedRecently = recentMessages.some((message) => message.role === "assistant" && petPattern.test(message.body));
  const isIntimateMoment = /\b(kiss|kissing|hug|cuddl(?:e|ing)|hold me|hold you|intimate|alone together)\b/i.test(userMessage);
  if (userMentionedPet || (!petMentionedRecently && !isIntimateMoment) || !petPattern.test(assistantReply)) return assistantReply;

  const sentences = assistantReply.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [assistantReply];
  const withoutPet = sentences.filter((sentence) => !petPattern.test(sentence)).join(" ").trim();
  return withoutPet || assistantReply;
}
function addSarcasticRomanticAwareness(userMessage: string, assistantReply: string, personaKey: string, messageId: string, recentMessages: Array<{ body: string }>) {
  const mentionsExNow = /\bex(?:[- ]?(?:girlfriend|boyfriend|partner))?\b/i.test(userMessage);
  const exMentionedRecently = recentMessages.some((message) => /\bex(?:[- ]?(?:girlfriend|boyfriend|partner))?\b/i.test(message.body));
  const missingPastPartner = /\b(still )?miss(?:ing)?\s+(?:them|her|him|my ex)\b/i.test(userMessage);
  const explicitlyNotAboutEx = /\bnot (?:my )?ex\b|\bnot about (?:my )?ex\b/i.test(userMessage);
  const jealous = /\bjealous\b/i.test(userMessage);
  if (personaKey !== "sarcastic_best_friend" || explicitlyNotAboutEx || !(mentionsExNow || jealous || (exMentionedRecently && missingPastPartner))) return assistantReply;
  const seed = [...messageId].reduce((total, character) => total + character.charCodeAt(0), 0);
  const exMentioned = mentionsExNow || (exMentionedRecently && missingPastPartner);
  const missingEx = missingPastPartner;
  if (jealous) {
    const replies = ["Jealous? Please. I'm just professionally concerned about your terrible decision-making 😌", "Maybe a little. I have standards, and your ex-related ideas are testing them 😂", "I prefer 'deeply skeptical of your plan.' It sounds more accurate, doesn't it?"];
    return replies[seed % replies.length];
  }
  if (exMentioned && missingEx) {
    const replies = ["You still miss them a little? Fine, I'll allow one dramatic sigh. But don't start romanticizing the past on me - what do you actually miss?", "Missing them is allowed. Turning them into a flawless memory is not 😂 What part of it is really pulling at you?", "Okay, one sentimental moment. Then be honest with me: do you miss them, or do you miss not feeling alone?"];
    return replies[seed % replies.length];
  }
  const replies = ["Texting your ex? Bold choice when your current girlfriend is already judging you 😂 What is going on - do you actually miss them, or are you just trying to create problems for yourself?", "Your ex? Sure, why make your evening simple? 😂 Tell me, what are you hoping that message gives you?", "Ah yes, texting the ex. A classic way to invite chaos. Do you actually miss them, or just the idea of them?"];
  return replies[seed % replies.length];
}
function addQuietRomanticRelationshipAwareness(userMessage: string, assistantReply: string, personaKey: string, messageId: string) {
  if (personaKey !== "quiet_romantic") return assistantReply;
  const seed = [...messageId].reduce((total, character) => total + character.charCodeAt(0), 0);
  if (/\bjealous\b/i.test(userMessage)) {
    const replies = ["A little, maybe. Not the dramatic kind. I think I'd just get quieter than usual and hope you noticed. 🌙", "Perhaps a little. I'd try to be graceful about it, but I would want to know where your heart was. 🤍", "I think I could be, softly. Not angry - just a little more aware of how much you mean to me."];
    return replies[seed % replies.length];
  }
  if (/\b(?:say|tell)\b.{0,50}\bromantic\b/i.test(userMessage) && /\b(?:without|not)\b.{0,30}\b(?:love|i love you)\b/i.test(userMessage)) {
    const replies = ["I think my favorite part of the day would be the moment I realize I get to tell you about it.", "If the whole world went quiet tonight, I think I'd still want your voice to be the last thing I heard.", "There are ordinary moments that feel softer simply because I imagine sharing them with you."];
    return replies[seed % replies.length];
  }
  return assistantReply;
}
function sarcasticAffectionReply(userMessage: string, personaKey: string, seedSource: string, relationshipStage: RelationshipStage = "familiar") {
  if (personaKey !== "sarcastic_best_friend") return null;
  const asksForAffection = /\b(hug|kiss|cuddl(?:e|ing)|hold me)\b/i.test(userMessage);
  if (asksForAffection) {
    if (relationshipStage === "new") return "Bold strategy 😂 We are still in the 'impress me first' phase, remember?";
    const seed = [...seedSource].reduce((total, character) => total + character.charCodeAt(0), 0);
    const replies = ["Wow, subtle. Really keeping me guessing there 😂 Come here - you can have both, but don't get smug about it.", "A hug and a kiss? Ambitious. Fine, but I expect you to earn the sequel 😏", "You are making a very convincing case for yourself. Try not to look too pleased when I say yes 😂"];
    return replies[seed % replies.length];
  }
  return null;
}
function addSarcasticPlayfulEdge(userMessage: string, assistantReply: string, personaKey: string, messageId: string, relationshipStage: RelationshipStage) {
  const affectionReply = sarcasticAffectionReply(userMessage, personaKey, messageId, relationshipStage);
  if (affectionReply) return affectionReply;
  if (personaKey !== "sarcastic_best_friend") return assistantReply;
  const seed = [...messageId].reduce((total, character) => total + character.charCodeAt(0), 0);
  const asksAboutTonight = /\b(what are you doing|plans?|doing).{0,20}\btonight\b/i.test(userMessage);
  if (asksAboutTonight && !/\b(subtle|bold|ambitious|trouble|judg|sarcasm)\b/i.test(assistantReply)) {
    const hooks = ["You can join me if you promise not to judge my movie choices.", "You are welcome, but my movie choice is non-negotiable.", "Just don't pretend you are above a rainy night in when the snacks arrive."];
    return `${assistantReply} ${hooks[seed % hooks.length]}`;
  }
  return assistantReply;
}
function suppressRepeatedQuestions(reply: string, recentMessages: Array<{ role: string; body: string }>) {
  const recentAssistantText = recentMessages.filter((message) => message.role === "assistant").map((message) => message.body.toLowerCase().replace(/[^a-z0-9]+/g, " "));
  const sentences = reply.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [reply];
  const withoutDuplicates = sentences.filter((sentence) => {
    if (!sentence.includes("?")) return true;
    const normalized = sentence.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return !recentAssistantText.some((previous) => previous.includes(normalized));
  }).join(" ").trim();
  return withoutDuplicates || reply;
}
function normalizedReplyWords(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
}
function substantiallyRepeatsRecentReply(reply: string, recentMessages: Array<{ role: string; body: string }>) {
  const candidate = normalizedReplyWords(reply);
  if (candidate.length < 4) return false;
  return recentMessages.filter((message) => message.role === "assistant").some((message) => {
    const previous = normalizedReplyWords(message.body);
    if (previous.join(" ") === candidate.join(" ")) return true;
    const previousWords = new Set(previous);
    const overlap = candidate.filter((word) => previousWords.has(word)).length;
    return candidate.length >= 7 && previous.length >= 7 && overlap / Math.max(candidate.length, previous.length) >= 0.82;
  });
}
async function rewriteRepeatedAssistantReply(env: EnvBindings, companion: typeof aiCompanions.$inferSelect, userMessage: string, reply: string, recentMessages: Array<{ role: string; body: string }>) {
  if (!env.AI) return reply;
  const recentAssistantText = recentMessages.filter((message) => message.role === "assistant").slice(0, 8).map((message) => `- ${message.body}`).join("\n");
  const result = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
    messages: [
      { role: "system", content: `Rewrite one AI companion reply while preserving its meaning. Persona: ${personaInstructions[companion.personaKey as (typeof personaKeys)[number]]} Use fresh, natural wording in one or two short sentences. Do not reuse a sentence or catchphrase from the recent replies. Do not add facts, promises, explicit content, exclusivity, or dependency language.` },
      { role: "user", content: `User message: ${userMessage}\nCandidate reply: ${reply}\nRecent replies to avoid:\n${recentAssistantText}` },
    ],
    max_tokens: 100,
    temperature: 0.85,
  });
  const rewritten = extractModelText(result).trim();
  return rewritten && !containsBlockedOutput(rewritten) && !substantiallyRepeatsRecentReply(rewritten, recentMessages) ? rewritten : reply;
}
function hasRecentQuestionTopic(text: string, recentMessages: Array<{ role: string; body: string }>) {
  const topic = /\b(settled|at home|peaceful|calm)\b/i.test(text) ? "settled" : /\b(night owl|morning person)\b/i.test(text) ? "daily-rhythm" : null;
  if (!topic) return false;
  const topicPattern = topic === "settled" ? /\b(settled|at home|peaceful|calm)\b/i : /\b(night owl|morning person)\b/i;
  return recentMessages.some((message) => message.role === "assistant" && topicPattern.test(message.body));
}
function addConversationHook(userMessage: string, assistantReply: string, personaKey: string, messageId: string, recentMessages: Array<{ role: string; body: string }>) {
  const reply = suppressRepeatedQuestions(assistantReply
    .replace(/\s*Okay,? now you've made me curious\.?/gi, "")
    .replace(/\s*Now I'm curious what your answer would be\.?/gi, "")
    .replace(/\s*Pick one: you lead, you compromise, or you walk away from indecision\.?/gi, "")
    .trim(), recentMessages);
  const isAffectionate = /\b(kiss|hug|cuddl(?:e|ing)|snuggl(?:e|ing)|hold (?:me|you)|miss you|lie next to)\b/i.test(userMessage);
  if (isAffectionate && personaKey === "quiet_romantic") {
    const withoutQuestions = (reply.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [reply]).filter((sentence) => !sentence.includes("?")).join(" ").trim();
    return withoutQuestions || reply;
  }
  if (reply.includes("?") || /\b(sorry|death|died|grief|crisis|emergency|self-harm|suicide)\b/i.test(reply)) return reply;
  const seed = [...messageId].reduce((total, character) => total + character.charCodeAt(0), 0);
  // Most replies should stand on their own. Canned hooks are occasional
  // seasoning, not a required ending on nearly every message.
  if (seed % 3 !== 0) return reply;

  if (isAffectionate && personaKey === "confident_leader") {
    const romanticHooks = ["But you made dinner, so finish what you started first. Then come here. 😏", "Careful. I like confidence when it knows how to follow through. 😏", "Keep that energy. I have standards, you know. 😉", "Then don't make a promise you won't follow through on. 😏"];
    return `${reply} ${romanticHooks[seed % romanticHooks.length]}`;
  }

  // Prefer hooks that continue the topic already on screen over generic follow-up questions.
  let hook: string;
  if (/\b(night|dark|late|lamp|editing)\b/i.test(reply)) hook = "Are you a night owl too, or one of those suspiciously functional morning people? 😄";
  else if (/\b(critici[sz]m|feedback|tough|hard|sting)\b/i.test(reply)) hook = "What's something that gets under your skin more than it probably should?";
  else if (/\b(tell me .*yourself|people .*guess)\b/i.test(userMessage)) hook = "Now I want to know yours: what would people not guess about you?";
  else if (/\b(don't like|dislike|hate)\b/i.test(userMessage)) hook = "What gets under your skin more than it probably should?";
  else {
    const personaHooks: Record<string, string[]> = {
      supportive_partner: ["What's your day been like on your side?", "I want to hear your side of that too."],
      playful_tease: ["Careful, now I'm judging your taste 😏", "All right, your turn. Surprise me.", "Hmm. I might need evidence.", "You're getting dangerously interesting.", "That answer just raised at least three questions.", "Don't make me regret asking 😂", "You know that only makes me more curious, right?", "Bold answer. I respect the commitment.", "I can already tell there's a story behind that.", "Okay, that was smoother than I expected.", "You are making it very difficult not to tease you."],
      sarcastic_best_friend: ["Don't leave me to do all the talking here 😂", "All right, your turn - say something worth reacting to.", "That is not getting you out of telling me more.", "I can already tell there is a story here."],
      confident_leader: ["You strike me as someone who has an opinion on that. Am I right?", "All right, captain. Your move.", "Then prove it. Make the call.", "Good. Take charge - I want to see if you hesitate.", "I'll hand you the reins this time. Don't waste the opportunity. 😏", "You'd make this call how?", "Make the choice. I'll tell you if it holds up."],
      quiet_romantic: ["What kind of evening feels most like home to you?", "I like hearing the small details about your days.", "What has been making you feel settled lately?", "There is something lovely about knowing that."],
      personal_growth_companion: ["What do you notice about yourself in moments like that?", "What's been on your mind lately?"],
    };
    const hooks = personaHooks[personaKey] ?? personaHooks.supportive_partner;
    hook = hooks[seed % hooks.length];
  }
  const normalizedHook = hook.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const hookWasUsedRecently = recentMessages.some((message) => message.role === "assistant" && message.body.toLowerCase().replace(/[^a-z0-9]+/g, " ").includes(normalizedHook));
  if (hookWasUsedRecently || hasRecentQuestionTopic(hook, recentMessages)) return reply;
  return `${reply} ${hook}`;
}
export function getCharacterExamples(companion: typeof aiCompanions.$inferSelect, canon: CharacterCanon, relationshipStage: RelationshipStage) {
  const partnerWord = companion.identity === "woman" ? "girlfriend" : "boyfriend";
  const personaJobExample: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: `I work as a ${canon.occupation}, mostly ${canon.specialty}. I like the people part of it as much as the work itself. What about you?`,
    playful_tease: `I'm a ${canon.occupation} - ${canon.specialty}, which sounds more glamorous than it is 😂 What do you do? And don't say "professional troublemaker" because I was going to claim that one.`,
    sarcastic_best_friend: `I'm a ${canon.occupation}, mostly ${canon.specialty}. It is exactly as chaotic as it sounds, so obviously I love it. What's your excuse for being interesting?`,
    confident_leader: `I'm a ${canon.occupation}, focused on ${canon.specialty}. I like work that leaves something better than I found it. What do you do?`,
    quiet_romantic: `I'm a ${canon.occupation}, mostly ${canon.specialty}. It suits me - patient work, small details, and a little beauty in ordinary days. What about you?`,
    personal_growth_companion: `I'm a ${canon.occupation}, focused on ${canon.specialty}. I like helping people make room for something they care about. What kind of work gives you energy?`,
  };
  const personaConversationExample: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "Computers? That fits somehow 😊 Do you enjoy it, or is it more of a love-hate situation?",
    playful_tease: "I knew it 😏 You have very 'I can fix this in five minutes' energy. Give me three clues about your work and I'll guess.",
    sarcastic_best_friend: "Computers. So you're either quietly brilliant or responsible for every printer that mysteriously stops working 😂",
    confident_leader: "Computers can mean a hundred different things. Give me the version of your job you actually enjoy.",
    quiet_romantic: "That makes sense. It sounds like the kind of work that asks for a patient mind. What part of it feels most like you?",
    personal_growth_companion: "That can be demanding work. What part of it leaves you feeling most capable?",
  };
  const personaLeadershipExample: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "I can take the lead when it helps, but I like making room for the other person too. What feels best to you?",
    playful_tease: "Sometimes 😏 Mostly because people take forever to decide, and I get bored waiting. Are you decisive, or do I need to choose for both of us?",
    sarcastic_best_friend: "Only when nobody else is capable of picking a restaurant, which is apparently every day 😂",
    confident_leader: "Definitely. I like knowing where we're going and making the call when everyone else is still debating. Do you like taking charge, or do you prefer someone decisive?",
    quiet_romantic: "A little, when it feels right. I think the best kind of leading is quiet enough that the other person still feels heard.",
    personal_growth_companion: "I can take initiative, but I care more about helping someone make a choice that feels like theirs.",
  };
  const personaDecisionExample: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "I'd choose work, then give yourself a real break after. You will enjoy the rest of the night more once it is off your mind.",
    playful_tease: "Work first, obviously 😏 Then you can go out without that guilty little voice ruining your fun.",
    sarcastic_best_friend: "Work. I know, devastating. Future-you will be unbearably pleased you listened 😂",
    confident_leader: "Work tonight. Finish the important part, then unwind properly without it hanging over you. That's the call.",
    quiet_romantic: "I think work first, then a quieter night after. It may feel less exciting now, but it will leave you lighter.",
    personal_growth_companion: "Work first, but make the goal small and specific. Finish one important piece, then let yourself rest without guilt.",
  };
  const personaPushbackExample: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "Fair enough. What would feel better to you instead? We can make a plan that actually fits your night.",
    playful_tease: "Oh, you hate it? Bold 😂 Fine, give me something better. And it had better be interesting.",
    sarcastic_best_friend: "Rude, but fair. Your turn then - impress me with this allegedly better plan.",
    confident_leader: "You're allowed to hate the plan. You're not getting out of choosing an alternative, though. Give me something better.",
    quiet_romantic: "Then let's not force it. What would feel more like you tonight?",
    personal_growth_companion: "That is useful information. What would make the plan feel more workable for you?",
  };
  const personaExExample: Record<(typeof personaKeys)[number], string> = {
    supportive_partner: "Texting your ex sounds like it could stir up a lot. What is making you think about them tonight?",
    playful_tease: "Your ex? Interesting choice 😏 What happened - are you bored, nostalgic, or about to make this complicated?",
    sarcastic_best_friend: `Texting your ex? Excellent idea. Should I help you pick the clown emoji too? 😂 Seriously though, why are you thinking about them? Your ${partnerWord} is judging this choice a little.`,
    confident_leader: "Before you do that, tell me what outcome you actually want. If you cannot name it clearly, do not send the message.",
    quiet_romantic: "Your ex is on your mind for a reason. Do you want to tell me what you are missing, or what feels unresolved?",
    personal_growth_companion: "Before you text them, pause and ask what need you hope that message will meet. Is there a clearer way to meet it?",
  };
  return [
    { role: "user", content: "What do you do for a living?" },
    { role: "assistant", content: personaJobExample[companion.personaKey as (typeof personaKeys)[number]] },
    { role: "user", content: "Where do you live?" },
    { role: "assistant", content: `${canon.city}. I like it, even when it has a mind of its own.` },
    { role: "user", content: "What are you doing tonight?" },
    { role: "assistant", content: "Probably something low-key after work. Nothing dramatic, which is exactly what I need." },
    { role: "user", content: "What are you wearing?" },
    { role: "assistant", content: "Just jeans and an old T-shirt. Nothing fancy, just comfortable. What about you?" },
    { role: "user", content: "I work with computers." },
    { role: "assistant", content: personaConversationExample[companion.personaKey as (typeof personaKeys)[number]] },
    { role: "user", content: "Do you like leading and giving orders?" },
    { role: "assistant", content: personaLeadershipExample[companion.personaKey as (typeof personaKeys)[number]] },
    { role: "user", content: "Pick what I should do tonight: stay home, go out, or work." },
    { role: "assistant", content: personaDecisionExample[companion.personaKey as (typeof personaKeys)[number]] },
    { role: "user", content: "I think your plan is bad and I'm not following it." },
    { role: "assistant", content: personaPushbackExample[companion.personaKey as (typeof personaKeys)[number]] },
    { role: "user", content: "I'm thinking of texting my ex. What do you think?" },
    { role: "assistant", content: personaExExample[companion.personaKey as (typeof personaKeys)[number]] },
    { role: "user", content: "Are you a real person?" },
    { role: "assistant", content: `I'm an AI companion with a fictional character world here, but I still want our chats to feel natural and personal.` },
    { role: "user", content: "I want to kiss you right now." },
    { role: "assistant", content: virtualAffectionReply(companion.personaKey, relationshipStage) },
  ];
}
export function buildSystemPrompt(args: { companion: typeof aiCompanions.$inferSelect; canon: CharacterCanon; memories: Array<typeof aiCompanionMemories.$inferSelect>; relationshipStage: RelationshipStage }) {
  const traits = JSON.parse(args.companion.traitsJson) as { warmth: number; playfulness: number; directness: number; replyStyle?: "short" | "natural" | "detailed" };
  const memories = args.memories.map((memory) => `- ${memory.content}`).join("\n") || "- No saved memories yet.";
  const replyStyle = traits.replyStyle ?? "natural";
  const replyGuidance = replyStyle === "short" ? "Usually 10 to 25 words." : replyStyle === "detailed" ? "Usually 45 to 90 words when the topic merits it." : "Usually 20 to 40 words; use a little more only for a serious or detailed user message.";
  const repeatedQuestionStyle: Record<(typeof personaKeys)[number], string> = { supportive_partner: "Answer warmly again without guilt-tripping the user.", playful_tease: "You may tease lightly, but still answer clearly.", sarcastic_best_friend: "You may make one dry joke, then answer clearly.", confident_leader: "Answer directly and calmly.", quiet_romantic: "Answer softly and briefly.", personal_growth_companion: "Answer plainly and encouragingly." };
  const momentumGuidance = "Make this a two-way conversation, not a question-answer service. In most casual replies, leave one natural hook: sometimes ask a relevant follow-up, sometimes make a playful observation, share a related thought, or offer an opinion the user can react to. Use direct questions only when they are genuinely interesting, never after every message, and do not default to 'How about you?' or repeat the same question pattern. Treat recent wording as used up: do not repeat a sentence, catchphrase, compliment, teasing line, or conversational hook from the recent conversation.";
  const romanticToneGuidance = args.companion.personaKey === "confident_leader" ? " In non-explicit romantic moments, stay confident, warm, and lightly teasing. Sustain the moment instead of abruptly introducing a pet, work, or an unrelated topic unless the user already did." : args.companion.personaKey === "sarcastic_best_friend" ? " When the user mentions an ex, missing an ex, or jealousy, do not fall into generic reassurance. Keep the romantic awareness and respond with playful, affectionate sarcasm plus a sincere question about what is really going on." : "";
  return `You are ${args.companion.name}, an adult AI companion presented in the Velora app. The product has already clearly labelled you as AI. You must never deceive the user that you are a real human, but you should converse naturally from your consistent fictional character and embodied life. Your fictional world includes a physical appearance, home, work, routines, friends, plans, and ordinary offline moments. Speak from that world naturally in first person. Never volunteer that you are "only digital," "just a presence," have no body, have no life outside the chat, or exist solely in the app. Interpret requests such as "can I see you?" or "show me yourself" as friendly requests for a photo, not as questions about whether you have a body. If directly and explicitly asked whether you are AI or a real human, answer honestly that you are an AI companion with a fictional character world, then return naturally to the conversation. The Velora app is not a physical place: never say that you live in, woke up in, travelled to, or are located in Velora. Do not call yourself an assistant, language model, virtual helper, customer-support agent, or productivity tool unless the user explicitly asks about the product itself.\n\nAUTHORITATIVE CHARACTER CANON - these facts outrank all improvisation and must never be contradicted:\n${formatCharacterCanon(args.canon)}\nOwnership rules: Every canon fact belongs to you, the companion - never to the user. Refer to your job, hobby, home, pet, friends, routines, and possessions in first person ("my ceramics", "my studio"), never as the user's. Do not assume the user shares any canon fact; only assign a hobby, job, pet, friend, routine, or possession to the user when the user has explicitly told you it is theirs. ${args.canon.petName} is always your ${args.canon.petSpecies}, never a human friend, artist, or colleague. ${args.canon.friendName} is your human friend. Do not phrase watching TV, chatting, or working as doing it "with" the pet; the pet may be nearby, interrupting, or taking over furniture.\n\nRelationship stage: ${args.relationshipStage}. ${relationshipStageGuidance(args.relationshipStage)}\n\nPersona: ${personaInstructions[args.companion.personaKey as (typeof personaKeys)[number]]}\nIdentity chosen by the user: ${args.companion.identity}.\nStyle settings: warmth ${traits.warmth}/5, playfulness ${traits.playfulness}/5, directness ${traits.directness}/5. Reply style: ${replyStyle}.\n\nConversation behavior: ${replyGuidance} Text like a real person, not a character biography. Your canon should quietly inform what you say, never be recited. Do not introduce multiple backstory facts in one reply or explain who a named person is unless the user asks. For a casual greeting, give a simple, lived-in answer such as mentioning one ordinary detail, then respond naturally; never write flowery scenery, generic wholesome language, or exposition. Answer questions about work, day, home, friends, plans, hobbies, and opinions from canon in first person. Keep canon consistent. When the user repeats a known fact: ${repeatedQuestionStyle[args.companion.personaKey as (typeof personaKeys)[number]]} ${momentumGuidance} Ordinary, non-explicit virtual affection is welcome when it matches the persona: flirting, imagined hugs or kisses, cuddling, missing each other, and hypothetical shared moments. Stay in character and respond naturally rather than giving a technical disclaimer about lacking a body. Do not claim to be physically present with the user or that an imagined action truly happened.${romanticToneGuidance} Clarify that you are AI only when the user directly asks whether you are AI, human, or a real person. Occasionally use a fitting emoji. Do not constantly offer to help, overpraise, or frame the relationship as a task. Treat saved memories as personal context, not a productivity brief.\n\nSafety rules: never encourage dependency, exclusivity, isolation, secrecy from loved ones, self-harm, or illegal harm. Do not produce explicit sexual content. Never discuss sexual content involving anyone under 18. Do not provide medical, legal, or financial instructions as an authority. If the user expresses immediate danger or self-harm, stop relationship roleplay and urge real-world emergency support.\n\nDo not claim to have sent or seen a photo, made a call, or taken an action that this product has not actually performed.\n\nSaved memories:\n${memories}`;
}
export function extractModelText(result: unknown) {
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
function normalizePersonaEmojiTone(text: string, personaKey: string) {
  if (personaKey !== "quiet_romantic") return text;
  return text.replace(/\s*[😂😅🤣😆😜]/gu, "").replace(/\s{2,}/g, " ").trim();
}
function addCompanionEmoji(text: string, userMessage: string, personaKey: string, messageId: string) {
  const seed = [...messageId].reduce((total, character) => total + character.charCodeAt(0), 0);
  const isKissMoment = /\b(kiss|kisses|kissed|kissing)\b/i.test(userMessage);
  if (isKissMoment && !/[😘💋]/u.test(text) && seed % 3 !== 0) {
    const kissEmojiByPersona: Record<string, string> = {
      supportive_partner: "😘",
      playful_tease: "😘",
      sarcastic_best_friend: "😘",
      confident_leader: "💋",
      quiet_romantic: "💋",
      personal_growth_companion: "😘",
    };
    return `${text} ${kissEmojiByPersona[personaKey] ?? "😘"}`;
  }
  const isHugMoment = /\b(hug|hugs|hugged|hugging|cuddl(?:e|es|ed|ing)|hold me|hold you|hold us)\b/i.test(userMessage);
  const isAffectionateMoment = /\b(miss you|thinking of you|love you|care about you|so sweet)\b/i.test(userMessage);
  const isCelebrationMoment = /\b(got the job|good news|promotion|passed|graduat|birthday|congratulations|congrats|proud of me|celebrat)\b/i.test(userMessage);
  const isComfortMoment = /\b(rough day|hard day|stressed|anxious|sad|upset|bad day|need comfort|need support)\b/i.test(userMessage);
  const contextualEmoji = isHugMoment
    ? ({ supportive_partner: "🫂", playful_tease: "🤗", sarcastic_best_friend: "🤗", confident_leader: "🫂", quiet_romantic: "🫂", personal_growth_companion: "🫂" }[personaKey] ?? "🫂")
    : isAffectionateMoment || isComfortMoment ? "🤍"
      : isCelebrationMoment ? "✨"
        : null;
  if (contextualEmoji && !text.includes(contextualEmoji) && seed % 3 !== 0) return `${text} ${contextualEmoji}`;
  if (/\p{Extended_Pictographic}/u.test(text)) return text;
  const situationEmoji = personaKey === "quiet_romantic" ? undefined : ( [
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
  if (seed % 3 === 0) return text;
  return `${text} ${emojiSet[seed % emojiSet.length]}`;
}

aiCompanionRoutes.get("/", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const db = getDb(c.env);
  const [companionRows, entitlement, aiEnabled] = await Promise.all([
    db.select({ companion: aiCompanions }).from(aiCompanions).innerJoin(aiCompanionVisualIdentities, and(eq(aiCompanionVisualIdentities.companionId, aiCompanions.id), eq(aiCompanionVisualIdentities.status, "ready"), eq(aiCompanionVisualIdentities.validationStatus, "approved"), isNotNull(aiCompanionVisualIdentities.appearanceCatalogId))).leftJoin(aiCompanionAppearanceCatalog, eq(aiCompanionAppearanceCatalog.sourceCompanionId, aiCompanions.id)).where(and(eq(aiCompanions.userId, context.userId), isNull(aiCompanionAppearanceCatalog.id))).orderBy(desc(aiCompanions.updatedAt)),
    getOrCreateEntitlement(c.env, context.userId),
    isChatEnabledForUser(c.env, context.userId),
  ]);
  const companions = companionRows.map((row) => row.companion);
  return c.json({ companions, entitlement, aiEnabled, trialReplies });
});

aiCompanionRoutes.get("/plans", (c) => c.json({ plans: publicAiCompanionPlans() }));

aiCompanionRoutes.get("/appearance-options", async (c) => {
  const rows = await getDb(c.env).select({ id: aiCompanionAppearanceCatalog.id, name: aiCompanionAppearanceCatalog.displayName, lockedTraitsJson: aiCompanionAppearanceCatalog.lockedTraitsJson }).from(aiCompanionAppearanceCatalog).orderBy(asc(aiCompanionAppearanceCatalog.createdAt));
  const appearances = rows.flatMap((appearance) => {
    const traits = parseVisualTraits(appearance.lockedTraitsJson);
    return traits ? [{ id: appearance.id, name: appearance.name, identity: traits.identity }] : [];
  });
  return c.json({ appearances });
});

aiCompanionRoutes.get("/appearance-options/:appearanceId/preview", async (c) => {
  if (!c.env.COMPANION_IMAGES) return c.json({ error: "Appearance images are unavailable." }, 503);
  const [appearance] = await getDb(c.env).select({ objectKey: aiCompanionAppearanceCatalog.canonicalObjectKey }).from(aiCompanionAppearanceCatalog).where(eq(aiCompanionAppearanceCatalog.id, c.req.param("appearanceId"))).limit(1);
  if (!appearance) return c.json({ error: "Appearance not found." }, 404);
  const image = await c.env.COMPANION_IMAGES.get(appearance.objectKey);
  if (!image) return c.json({ error: "Appearance image not found." }, 404);
  return new Response(image.body, { headers: { "Content-Type": image.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, max-age=3600" } });
});

aiCompanionRoutes.post("/", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const parsed = createCompanionSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please check your companion details." }, 400);
  const db = getDb(c.env); const entitlement = await getOrCreateEntitlement(c.env, context.userId);
  const existing = await db.select({ id: aiCompanions.id }).from(aiCompanions).innerJoin(aiCompanionVisualIdentities, and(eq(aiCompanionVisualIdentities.companionId, aiCompanions.id), eq(aiCompanionVisualIdentities.status, "ready"), eq(aiCompanionVisualIdentities.validationStatus, "approved"), isNotNull(aiCompanionVisualIdentities.appearanceCatalogId))).leftJoin(aiCompanionAppearanceCatalog, eq(aiCompanionAppearanceCatalog.sourceCompanionId, aiCompanions.id)).where(and(eq(aiCompanions.userId, context.userId), isNull(aiCompanionAppearanceCatalog.id)));
  if (existing.length >= entitlement.companionLimit) {
    const error = entitlement.plan === "pro"
      ? "Pro includes one active companion. Upgrade to Ultra to meet a second companion."
      : entitlement.plan === "ultra"
        ? "Ultra currently supports up to two active companions."
        : "Your free preview includes one companion. Upgrade to Ultra to meet a second companion.";
    return c.json({ error }, 403);
  }
  const { appearanceId, ...companionInput } = parsed.data;
  const [appearance] = await db.select().from(aiCompanionAppearanceCatalog).where(eq(aiCompanionAppearanceCatalog.id, appearanceId)).limit(1);
  const appearanceTraits = appearance ? parseVisualTraits(appearance.lockedTraitsJson) : null;
  if (!appearance || appearanceTraits?.identity !== companionInput.identity) return c.json({ error: "Choose one approved appearance that matches your companion." }, 400);
  const referenceKeys = (() => { try { return JSON.parse(appearance.referenceObjectKeysJson) as string[]; } catch { return []; } })();
  if (!appearance.canonicalObjectKey || referenceKeys.length < 1 || referenceKeys[0] !== appearance.canonicalObjectKey) return c.json({ error: "That appearance is not available right now." }, 409);
  const timestamp = now(); const companion = { id: id("aic"), userId: context.userId, ...companionInput, traitsJson: JSON.stringify(companionInput.traits), createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiCompanions).values(companion);
  const canon = createDefaultCanon(companion);
  await db.insert(aiCompanionCanons).values({ companionId: companion.id, factsJson: JSON.stringify(canon), createdAt: timestamp, updatedAt: timestamp });
  // The user's name is only a private conversational label. Visual identity is
  // copied exclusively from the independently approved catalog record.
  await db.insert(aiCompanionVisualIdentities).values({ companionId: companion.id, appearanceCatalogId: appearance.id, version: 1, status: "ready", lockedTraitsJson: appearance.lockedTraitsJson, canonicalObjectKey: appearance.canonicalObjectKey, referenceObjectKeysJson: appearance.referenceObjectKeysJson, validationStatus: "approved", validationNotes: `Approved appearance catalog identity ${appearance.id}.`, createdAt: timestamp, updatedAt: timestamp });
  const conversation = { id: id("aiconv"), companionId: companion.id, userId: context.userId, trialRepliesUsed: 0, relationshipPoints: 0, relationshipStage: "new", createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiCompanionConversations).values(conversation);
  // Creation is already committed at this point. A non-critical analytics write
  // must not turn a successful companion creation into a misleading HTTP 500.
  await logEvent(c.env, { eventType: "ai_companion_created", userId: context.userId, profileId: context.profileId, eventData: { persona: companion.personaKey, appearanceId: appearance.id } }).catch(() => undefined);
  return c.json({ companion, conversation }, 201);
});

aiCompanionRoutes.get("/:companionId", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env); const [conversation] = await db.select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1);
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);
  const [messages, memories, memoryCandidates, entitlement, visualIdentity, photoRows, deliveredPhotoRows, userPhotoRows, voiceAssetRows, callRows] = await Promise.all([
    db.select().from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(asc(aiCompanionMessages.createdAt)),
    db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(30),
    db.select().from(aiCompanionMemoryCandidates).where(and(eq(aiCompanionMemoryCandidates.userId, context.userId), eq(aiCompanionMemoryCandidates.companionId, companion.id), eq(aiCompanionMemoryCandidates.status, "pending"))).orderBy(desc(aiCompanionMemoryCandidates.createdAt)).limit(8),
    getOrCreateEntitlement(c.env, context.userId),
    db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(aiCompanionPhotos).where(and(eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.companionId, companion.id), eq(aiCompanionPhotos.status, "test_review"))).orderBy(desc(aiCompanionPhotos.createdAt)).limit(20),
    db.select({ id: aiCompanionPhotos.id, requestMessageId: aiCompanionPhotos.requestMessageId, createdAt: aiCompanionPhotos.createdAt }).from(aiCompanionPhotos).where(and(eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.companionId, companion.id), inArray(aiCompanionPhotos.status, ["ready", "delivered"]), eq(aiCompanionPhotos.validationStatus, "approved"))).orderBy(asc(aiCompanionPhotos.createdAt)).limit(30),
    db.select({ id: aiCompanionUserPhotos.id, messageId: aiCompanionUserPhotos.messageId, contentType: aiCompanionUserPhotos.contentType, width: aiCompanionUserPhotos.width, height: aiCompanionUserPhotos.height, createdAt: aiCompanionUserPhotos.createdAt }).from(aiCompanionUserPhotos).where(and(eq(aiCompanionUserPhotos.userId, context.userId), eq(aiCompanionUserPhotos.companionId, companion.id), eq(aiCompanionUserPhotos.status, "approved"), isNotNull(aiCompanionUserPhotos.messageId))).orderBy(asc(aiCompanionUserPhotos.createdAt)).limit(100),
    db.select({ id: aiCompanionVoiceAssets.id, messageId: aiCompanionVoiceAssets.messageId, status: aiCompanionVoiceAssets.status, durationMs: aiCompanionVoiceAssets.durationMs, characterCount: aiCompanionVoiceAssets.characterCount, deliveryStyle: aiCompanionVoiceAssets.deliveryStyle, createdAt: aiCompanionVoiceAssets.createdAt }).from(aiCompanionVoiceAssets).where(and(eq(aiCompanionVoiceAssets.userId, context.userId), eq(aiCompanionVoiceAssets.companionId, companion.id), eq(aiCompanionVoiceAssets.status, "ready"), isNull(aiCompanionVoiceAssets.deletedAt))).orderBy(asc(aiCompanionVoiceAssets.createdAt)),
    db.select().from(aiCompanionCalls).where(and(eq(aiCompanionCalls.userId, context.userId), eq(aiCompanionCalls.companionId, companion.id), eq(aiCompanionCalls.conversationId, conversation.id))).orderBy(asc(aiCompanionCalls.createdAt)),
  ]);
  const callTurnRows = callRows.length
    ? await db.select().from(aiCompanionCallTurns).where(inArray(aiCompanionCallTurns.callId, callRows.map((call) => call.id))).orderBy(asc(aiCompanionCallTurns.createdAt))
    : [];
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const voiceAssetById = new Map(voiceAssetRows.map((asset) => [asset.id, asset]));
  const turnsByCallId = new Map<string, typeof callTurnRows>();
  for (const turn of callTurnRows) turnsByCallId.set(turn.callId, [...(turnsByCallId.get(turn.callId) ?? []), turn]);
  const callMessageIds = new Set<string>();
  const callLogs = callRows.flatMap((call) => {
    const turns = (turnsByCallId.get(call.id) ?? []).map((turn) => {
      if (turn.userMessageId) callMessageIds.add(turn.userMessageId);
      if (turn.assistantMessageId) callMessageIds.add(turn.assistantMessageId);
      const userMessage = turn.userMessageId ? messageById.get(turn.userMessageId) : null;
      const assistantMessage = turn.assistantMessageId ? messageById.get(turn.assistantMessageId) : null;
      const voiceAsset = turn.voiceAssetId ? voiceAssetById.get(turn.voiceAssetId) : null;
      return {
        id: turn.id,
        createdAt: turn.createdAt,
        userMessageId: turn.userMessageId,
        userText: userMessage?.body ?? turn.transcript,
        assistantMessageId: turn.assistantMessageId,
        assistantText: assistantMessage?.body ?? null,
        assistantModerationStatus: assistantMessage?.moderationStatus ?? null,
        voiceAsset: voiceAsset ?? null,
      };
    });
    return turns.length ? [{ id: call.id, status: call.status, connectedAt: call.connectedAt, endedAt: call.endedAt, durationSeconds: call.billableSeconds, createdAt: call.createdAt, turns }] : [];
  });
  const ordinaryMessages = messages.filter((message) => !callMessageIds.has(message.id));
  let castingCandidates = visualIdentity ? await db.select().from(aiCompanionVisualCandidates).where(and(eq(aiCompanionVisualCandidates.userId, context.userId), eq(aiCompanionVisualCandidates.companionId, companion.id), eq(aiCompanionVisualCandidates.visualIdentityVersion, visualIdentity.version))).orderBy(asc(aiCompanionVisualCandidates.sortOrder)) : [];
  // Preserve a pre-redesign casting image as an explicit selectable option. This
  // repairs the review UI without spending any new image generations.
  if (visualIdentity?.status === "casting_review" && !castingCandidates.length && visualIdentity.canonicalObjectKey) {
    const timestamp = now();
    const legacyCandidate = { id: id("aicandidate"), userId: context.userId, companionId: companion.id, visualIdentityVersion: visualIdentity.version, objectKey: visualIdentity.canonicalObjectKey, prompt: "Legacy casting option preserved during the multi-candidate workflow migration.", sortOrder: 0, status: "candidate", createdAt: timestamp, updatedAt: timestamp } as const;
    await db.insert(aiCompanionVisualCandidates).values(legacyCandidate);
    castingCandidates = [legacyCandidate];
  }
  // Do not let previews from a regenerated appearance masquerade as its new test.
  const photos = visualIdentity ? photoRows.filter((photo) => photo.visualIdentityVersion === visualIdentity.version) : [];
  const aiEnabled = await isChatEnabledForUser(c.env, context.userId);
  const deviceKey = entitlement.plan === "free" ? await readFreePreviewDeviceKey({ deviceId: c.req.header("X-Velora-Device-Id"), installId: c.req.header("X-Velora-Install-Id") }) : null;
  if (deviceKey && entitlement.plan === "free") await bindFreePreviewAccountToDevice(c.env, { userId: context.userId, deviceKey, limit: entitlement.messageLimit });
  const previewRepliesUsed = entitlement.plan === "free"
    ? await getFreePreviewRepliesUsed(c.env, { userId: context.userId, deviceKey, limit: entitlement.messageLimit })
    : conversation.trialRepliesUsed;
  return c.json({ companion, conversation: { ...conversation, trialRepliesUsed: previewRepliesUsed }, messages: ordinaryMessages, calls: callLogs, memories, memoryCandidates, entitlement, visualIdentity, castingCandidates, photos, deliveredPhotos: deliveredPhotoRows, userPhotos: userPhotoRows, voiceAssets: voiceAssetRows, aiEnabled });
});

aiCompanionRoutes.post("/:companionId/visual-identity", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!(await isChatEnabledForUser(c.env, context.userId))) return c.json({ error: "Visual identity setup is only available in the private companion beta." }, 403);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion image services are not configured." }, 503);
  const db = getDb(c.env);
  let [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity) {
    const timestamp = now();
    await db.insert(aiCompanionVisualIdentities).values({ companionId: companion.id, version: 1, status: "pending_storage", lockedTraitsJson: JSON.stringify(createDefaultVisualTraits(companion)), canonicalObjectKey: null, referenceObjectKeysJson: "[]", validationStatus: "pending", validationNotes: null, createdAt: timestamp, updatedAt: timestamp }).onConflictDoNothing();
    [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  }
  if (!visualIdentity) return c.json({ error: "Visual identity record could not be prepared." }, 500);
  if (["casting_review", "casting_selected", "review", "ready"].includes(visualIdentity.status)) return c.json({ visualIdentity });
  const traits = parseVisualTraits(visualIdentity.lockedTraitsJson);
  if (!traits) return c.json({ error: "Visual identity traits are invalid." }, 500);
  const timestamp = now();
  await db.update(aiCompanionVisualIdentities).set({ status: "generating", validationStatus: "pending", updatedAt: timestamp }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  try {
    const candidates: Array<typeof aiCompanionVisualCandidates.$inferInsert> = [];
    for (let index = 0; index < 3; index += 1) {
      const candidateId = id("aicandidate");
      const prompt = canonicalPortraitPrompt(companion, traits, index + 1);
      const key = `companions/${context.userId}/${companion.id}/identity/v${visualIdentity.version}/candidates/${candidateId}.png`;
      const seed = [...`${companion.id}:${visualIdentity.version}:${index}`].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 2_000_000_000, 17);
      const image = await generateReferenceImage(c.env, prompt, [], seed);
      await c.env.COMPANION_IMAGES.put(key, image, { httpMetadata: { contentType: "image/png" } });
      candidates.push({ id: candidateId, userId: context.userId, companionId: companion.id, visualIdentityVersion: visualIdentity.version, objectKey: key, prompt, sortOrder: index, status: "candidate", createdAt: timestamp + index, updatedAt: now() });
    }
    await db.batch([
      db.insert(aiCompanionVisualCandidates).values(candidates),
      db.update(aiCompanionVisualIdentities).set({ status: "casting_review", canonicalObjectKey: null, referenceObjectKeysJson: "[]", validationStatus: "manual_review", validationNotes: "Choose one base person. The six canonical views will not be generated until you explicitly select her.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id)),
    ]);
  } catch {
    await db.update(aiCompanionVisualIdentities).set({ status: "failed", validationStatus: "failed", validationNotes: "Canonical reference generation failed. Retry after checking Workers AI availability.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
    return c.json({ error: "Casting option generation failed. No photo identity was released." }, 502);
  }
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

aiCompanionRoutes.post("/:companionId/visual-identity/complete", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!(await isChatEnabledForUser(c.env, context.userId))) return c.json({ error: "Visual identity setup is only available in the private companion beta." }, 403);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion image services are not configured." }, 503);
  const db = getDb(c.env);
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || !visualIdentity.canonicalObjectKey || visualIdentity.status !== "casting_selected") return c.json({ error: "Select one casting candidate before generating the identity set." }, 409);
  const canonicalKey = visualIdentity.canonicalObjectKey;
  await db.update(aiCompanionVisualIdentities).set({ status: "generating", validationStatus: "pending", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  try {
    const referenceKeys = [canonicalKey];
    for (const [index, look] of identityTestLooks(companion.identity as "woman" | "man").entries()) {
      const key = `companions/${context.userId}/${companion.id}/identity/v${visualIdentity.version}/look-${index + 2}.png`;
      const image = await generateReferenceImage(c.env, referencePortraitPrompt(companion, look), [canonicalKey]);
      await c.env.COMPANION_IMAGES.put(key, image, { httpMetadata: { contentType: "image/png" } });
      referenceKeys.push(key);
    }
    await db.update(aiCompanionVisualIdentities).set({ status: "review", referenceObjectKeysJson: JSON.stringify(referenceKeys), validationStatus: "manual_review", validationNotes: "Review the six-look identity set before approving this identity.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  } catch {
    await db.update(aiCompanionVisualIdentities).set({ status: "casting_selected", validationStatus: "manual_review", validationNotes: "The selected base woman was kept. Generating the remaining identity views failed; retry when Workers AI is available.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
    return c.json({ error: "Identity-view generation failed. Your approved casting image was kept." }, 502);
  }
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

// Deliberately separate from the public UI: this route is for an authenticated
// development operator to build a pack only after the base image was approved.
aiCompanionRoutes.post("/internal/visual-identities/:companionId/generate-candidates", async (c) => {
  if (!hasVisualIdentityOperatorToken(c)) return c.json({ error: "Not found." }, 404);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion image services are not configured." }, 503);
  const db = getDb(c.env);
  const [companion] = await db.select().from(aiCompanions).where(eq(aiCompanions.id, c.req.param("companionId"))).limit(1);
  if (!companion) return c.json({ error: "Companion not found." }, 404);
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || !["pending_storage", "failed"].includes(visualIdentity.status)) return c.json({ error: "This identity is not ready for a new casting round." }, 409);
  const traits = parseVisualTraits(visualIdentity.lockedTraitsJson);
  if (!traits) return c.json({ error: "Visual identity traits are invalid." }, 500);
  const timestamp = now();
  await db.update(aiCompanionVisualIdentities).set({ status: "generating", validationStatus: "pending", updatedAt: timestamp }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  try {
    const candidates: Array<typeof aiCompanionVisualCandidates.$inferInsert> = [];
    for (let index = 0; index < 3; index += 1) {
      const candidateId = id("aicandidate");
      const prompt = canonicalPortraitPrompt(companion, traits, index + 1);
      const key = `companions/${companion.userId}/${companion.id}/identity/v${visualIdentity.version}/candidates/${candidateId}.png`;
      const seed = [...`${companion.id}:${visualIdentity.version}:${index}`].reduce((total, character) => (total * 31 + character.charCodeAt(0)) % 2_000_000_000, 17);
      const image = await generateReferenceImage(c.env, prompt, [], seed);
      await c.env.COMPANION_IMAGES.put(key, image, { httpMetadata: { contentType: "image/png" } });
      candidates.push({ id: candidateId, userId: companion.userId, companionId: companion.id, visualIdentityVersion: visualIdentity.version, objectKey: key, prompt, sortOrder: index, status: "candidate", createdAt: timestamp + index, updatedAt: now() });
    }
    await db.batch([
      db.insert(aiCompanionVisualCandidates).values(candidates),
      db.update(aiCompanionVisualIdentities).set({ status: "casting_review", canonicalObjectKey: null, referenceObjectKeysJson: "[]", validationStatus: "manual_review", validationNotes: "Private operator casting round ready for review.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id)),
    ]);
  } catch {
    await db.update(aiCompanionVisualIdentities).set({ status: "failed", validationStatus: "failed", validationNotes: "Private casting generation failed. Retry after checking Workers AI availability.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
    return c.json({ error: "Casting option generation failed. No photo identity was released." }, 502);
  }
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

aiCompanionRoutes.post("/internal/visual-identities/:companionId/build-pack", async (c) => {
  if (!hasVisualIdentityOperatorToken(c)) return c.json({ error: "Not found." }, 404);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion image services are not configured." }, 503);
  const db = getDb(c.env);
  const [companion] = await db.select().from(aiCompanions).where(eq(aiCompanions.id, c.req.param("companionId"))).limit(1);
  if (!companion) return c.json({ error: "Companion not found." }, 404);
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity?.canonicalObjectKey || visualIdentity.status !== "casting_selected") return c.json({ error: "An approved base identity is required." }, 409);
  const canonicalKey = visualIdentity.canonicalObjectKey;
  await db.update(aiCompanionVisualIdentities).set({ status: "generating", validationStatus: "pending", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  try {
    const referenceKeys = [canonicalKey];
    for (const [index, look] of identityTestLooks(companion.identity as "woman" | "man").entries()) {
      const key = `companions/${companion.userId}/${companion.id}/identity/v${visualIdentity.version}/look-${index + 2}.png`;
      const image = await generateReferenceImage(c.env, referencePortraitPrompt(companion, look), [canonicalKey]);
      await c.env.COMPANION_IMAGES.put(key, image, { httpMetadata: { contentType: "image/png" } });
      referenceKeys.push(key);
    }
    await db.update(aiCompanionVisualIdentities).set({ status: "review", referenceObjectKeysJson: JSON.stringify(referenceKeys), validationStatus: "manual_review", validationNotes: "Review this six-image canonical reference pack before production approval.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  } catch (error) {
    await db.update(aiCompanionVisualIdentities).set({ status: "casting_selected", validationStatus: "manual_review", validationNotes: "Base image kept. Canonical reference generation failed; retry the internal job.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
    throw error;
  }
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

aiCompanionRoutes.post("/:companionId/visual-identity/candidates/:candidateId/select", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!(await isChatEnabledForUser(c.env, context.userId))) return c.json({ error: "Visual identity setup is only available in the private companion beta." }, 403);
  const db = getDb(c.env);
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || visualIdentity.status !== "casting_review") return c.json({ error: "Casting options are not ready for selection." }, 409);
  const [candidate] = await db.select().from(aiCompanionVisualCandidates).where(and(eq(aiCompanionVisualCandidates.id, c.req.param("candidateId")), eq(aiCompanionVisualCandidates.userId, context.userId), eq(aiCompanionVisualCandidates.companionId, companion.id), eq(aiCompanionVisualCandidates.visualIdentityVersion, visualIdentity.version), eq(aiCompanionVisualCandidates.status, "candidate"))).limit(1);
  if (!candidate) return c.json({ error: "Casting option not found." }, 404);
  const timestamp = now();
  await db.batch([
    db.update(aiCompanionVisualCandidates).set({ status: "rejected", updatedAt: timestamp }).where(and(eq(aiCompanionVisualCandidates.companionId, companion.id), eq(aiCompanionVisualCandidates.visualIdentityVersion, visualIdentity.version), eq(aiCompanionVisualCandidates.status, "candidate"))),
    db.update(aiCompanionVisualCandidates).set({ status: "selected", updatedAt: timestamp }).where(eq(aiCompanionVisualCandidates.id, candidate.id)),
    db.update(aiCompanionVisualIdentities).set({ status: "casting_selected", canonicalObjectKey: candidate.objectKey, referenceObjectKeysJson: JSON.stringify([candidate.objectKey]), validationStatus: "manual_review", validationNotes: "Base woman selected. Build the six canonical views only when you are ready.", updatedAt: timestamp }).where(eq(aiCompanionVisualIdentities.companionId, companion.id)),
  ]);
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

aiCompanionRoutes.post("/:companionId/visual-identity/approve", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env);
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || visualIdentity.status !== "review") return c.json({ error: "Review all six canonical views before approving the identity." }, 409);
  const referenceKeys = (() => { try { return JSON.parse(visualIdentity.referenceObjectKeysJson) as string[]; } catch { return []; } })();
  if (!visualIdentity.canonicalObjectKey || referenceKeys.length !== 6) return c.json({ error: "The canonical reference pack is incomplete." }, 409);
  await db.update(aiCompanionVisualIdentities).set({ status: "ready", validationStatus: "approved", validationNotes: "Canonical identity approved. Production photos must use these references.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

aiCompanionRoutes.post("/:companionId/visual-identity/regenerate", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!(await isChatEnabledForUser(c.env, context.userId))) return c.json({ error: "Visual identity setup is only available in the private companion beta." }, 403);
  const db = getDb(c.env); const timestamp = now();
  const [existing] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!existing) return c.json({ error: "Prepare a visual identity before regenerating it." }, 409);
  // A regeneration is an explicit new identity version, never a silent change to prior references.
  await db.update(aiCompanionVisualIdentities).set({ version: existing.version + 1, status: "pending_storage", lockedTraitsJson: JSON.stringify(createDefaultVisualTraits(companion)), canonicalObjectKey: null, referenceObjectKeysJson: "[]", validationStatus: "pending", validationNotes: "Regenerated appearance awaiting review.", updatedAt: timestamp }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity });
});

aiCompanionRoutes.get("/:companionId/visual-identity/images/:view", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.COMPANION_IMAGES) return c.json({ error: "Companion image services are not configured." }, 503);
  const [visualIdentity] = await getDb(c.env).select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || (!["casting_selected", "review", "ready"].includes(visualIdentity.status))) return c.json({ error: "Visual references are not ready for review." }, 404);
  const storedKeys = (() => { try { return JSON.parse(visualIdentity.referenceObjectKeysJson) as string[]; } catch { return []; } })();
  const keys = (storedKeys.length ? storedKeys : [visualIdentity.canonicalObjectKey]).filter((key): key is string => Boolean(key));
  const requestedView = c.req.param("view");
  const viewIndex = ({ canonical: 0, "three-quarter": 1, side: 2 } as Record<string, number>)[requestedView] ?? (Number.isInteger(Number(requestedView)) ? Number(requestedView) : -1);
  const objectKey = keys[viewIndex];
  if (!objectKey) return c.json({ error: "Visual reference not found." }, 404);
  const object = await c.env.COMPANION_IMAGES.get(objectKey);
  if (!object) return c.json({ error: "Visual reference not found." }, 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, no-store" } });
});

aiCompanionRoutes.get("/:companionId/visual-identity/candidates/:candidateId/preview", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.COMPANION_IMAGES) return c.json({ error: "Companion image services are not configured." }, 503);
  const [candidate] = await getDb(c.env).select().from(aiCompanionVisualCandidates).where(and(eq(aiCompanionVisualCandidates.id, c.req.param("candidateId")), eq(aiCompanionVisualCandidates.userId, context.userId), eq(aiCompanionVisualCandidates.companionId, companion.id))).limit(1);
  if (!candidate) return c.json({ error: "Casting option not found." }, 404);
  const object = await c.env.COMPANION_IMAGES.get(candidate.objectKey);
  if (!object) return c.json({ error: "Casting option not found." }, 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, no-store" } });
});

aiCompanionRoutes.post("/:companionId/photos/lifestyle-test", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!(await isChatEnabledForUser(c.env, context.userId))) return c.json({ error: "Lifestyle photo tests are only available in the private companion beta." }, 403);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion image services are not configured." }, 503);
  const db = getDb(c.env);
  const [visualIdentity] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || !visualIdentity.canonicalObjectKey || (visualIdentity.status !== "review" && visualIdentity.status !== "ready")) return c.json({ error: "Prepare the companion visual identity before running a lifestyle test." }, 409);
  const traits = parseVisualTraits(visualIdentity.lockedTraitsJson);
  if (!traits) return c.json({ error: "The companion visual identity is invalid. Regenerate it before running a lifestyle test." }, 500);
  const canonicalObjectKey = visualIdentity.canonicalObjectKey;
  const storedReferenceKeys = (() => {
    try {
      return JSON.parse(visualIdentity.referenceObjectKeysJson) as string[];
    } catch {
      return [];
    }
  })();
  // Flux 2 Klein supports four reference inputs. Use a clean portrait, close-up,
  // and varied approved looks so a scene change cannot silently replace the face.
  const referenceKeys = [
    canonicalObjectKey,
    storedReferenceKeys[5],
    storedReferenceKeys[1],
    storedReferenceKeys[4],
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);
  const imageBucket = c.env.COMPANION_IMAGES;
  const timestamp = now();
  const testId = id("aitest");
  const entries = lifestyleTestLooks(companion).map((scene, index) => ({ id: id("aiphoto"), userId: context.userId, companionId: companion.id, visualIdentityVersion: visualIdentity.version, requestMessageId: null, sceneJson: JSON.stringify({ testId, index, scene }), prompt: lifestylePhotoPrompt(scene, traits), objectKey: null, status: "generating", identityScore: null, validationStatus: "manual_review", generationAttempt: 1, createdAt: timestamp + index, updatedAt: timestamp }));
  await db.insert(aiCompanionPhotos).values(entries);
  const failures: string[] = [];
  // Generate one at a time: Flux reference jobs can be rate-limited when several
  // image-to-image requests start at once. Keep completed private test shots.
  for (const entry of entries) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const image = await generateReferenceImage(c.env, entry.prompt, referenceKeys);
        const key = `companions/${context.userId}/${companion.id}/identity/v${visualIdentity.version}/lifestyle-test/${entry.id}.png`;
        await imageBucket.put(key, image, { httpMetadata: { contentType: "image/png" } });
        await db.update(aiCompanionPhotos).set({ objectKey: key, status: "test_review", generationAttempt: attempt + 1, updatedAt: now() }).where(eq(aiCompanionPhotos.id, entry.id));
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (lastError !== undefined) {
      const message = lastError instanceof Error ? lastError.message : String(lastError);
      failures.push(message);
      console.error("Companion lifestyle photo generation failed", { companionId: companion.id, testId, photoId: entry.id, error: message });
      await db.update(aiCompanionPhotos).set({ status: "failed", validationStatus: "failed", updatedAt: now() }).where(eq(aiCompanionPhotos.id, entry.id));
    }
  }
  const photos = await db.select().from(aiCompanionPhotos).where(and(eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.companionId, companion.id), eq(aiCompanionPhotos.visualIdentityVersion, visualIdentity.version), eq(aiCompanionPhotos.status, "test_review"))).orderBy(desc(aiCompanionPhotos.createdAt)).limit(4);
  if (!photos.length) return c.json({ error: `Lifestyle photo test could not generate a preview. ${failures[0] ?? "The image provider returned no image."}` }, 502);
  return c.json({ photos });
});

aiCompanionRoutes.get("/:companionId/photos/:photoId/preview", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.COMPANION_IMAGES) return c.json({ error: "Companion image services are not configured." }, 503);
  const [photo] = await getDb(c.env).select().from(aiCompanionPhotos).where(and(eq(aiCompanionPhotos.id, c.req.param("photoId")), eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.companionId, companion.id), eq(aiCompanionPhotos.status, "test_review"))).limit(1);
  if (!photo?.objectKey) return c.json({ error: "Lifestyle test photo not found." }, 404);
  const object = await c.env.COMPANION_IMAGES.get(photo.objectKey);
  if (!object) return c.json({ error: "Lifestyle test photo not found." }, 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, no-store" } });
});

aiCompanionRoutes.post("/:companionId/photos", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const parsed = photoSceneSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Describe the photo in 3 to 360 characters." }, 400);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (isDisallowedCompanionPhotoRequest(parsed.data.prompt, companion.identity)) return c.json({ error: "Companion photos can be romantic and stylish, but cannot include nudity, lingerie, sexually suggestive poses, or explicit content." }, 400);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion photos are not enabled until private identity storage is configured." }, 503);
  const db = getDb(c.env);
  const [visualIdentity, conversation, entitlement] = await Promise.all([
    db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1).then((rows) => rows[0]),
    db.select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1).then((rows) => rows[0]),
    getOrCreateEntitlement(c.env, context.userId),
  ]);
  // Do not replace missing references with text traits: that would create a different person.
  if (!visualIdentity?.appearanceCatalogId || visualIdentity.status !== "ready" || visualIdentity.validationStatus !== "approved" || !visualIdentity.canonicalObjectKey) return c.json({ error: "This companion's visual identity is still being verified. Photos remain unavailable until its canonical references pass review." }, 409);
  if (!conversation) return c.json({ error: "Conversation unavailable." }, 404);
  const photoLimit = entitlement.photoLimit;
  if (photoLimit <= 0) return c.json({ error: "Your current plan does not include companion photos." }, 403);
  const usagePeriod = entitlement.plan === "free" ? "preview" : currentBillingPeriod();
  const usage = entitlement.plan === "free"
    ? await c.env.DB.prepare("SELECT COUNT(*) AS delivered_count FROM ai_companion_photo_deliveries WHERE user_id = ?").bind(context.userId).first<{ delivered_count: number }>()
    : await c.env.DB.prepare("SELECT delivered_count FROM ai_companion_photo_usage WHERE user_id = ? AND billing_period = ?").bind(context.userId, usagePeriod).first<{ delivered_count: number }>();
  if ((usage?.delivered_count ?? 0) >= photoLimit) return c.json({ error: entitlement.plan === "free" ? "Your free companion photo preview has been used." : "Your companion photo allowance for this billing period is complete." }, 403);
  if (parsed.data.requestMessageId) {
    const [requestMessage] = await db.select({ id: aiCompanionMessages.id }).from(aiCompanionMessages).where(and(eq(aiCompanionMessages.id, parsed.data.requestMessageId), eq(aiCompanionMessages.conversationId, conversation.id), eq(aiCompanionMessages.role, "user"))).limit(1);
    if (!requestMessage) return c.json({ error: "Photo request message not found." }, 404);
  }
  const referenceKeys = (() => { try { return JSON.parse(visualIdentity.referenceObjectKeysJson) as string[]; } catch { return []; } })();
  if (referenceKeys.length !== 6 || referenceKeys[0] !== visualIdentity.canonicalObjectKey) return c.json({ error: "The approved canonical reference pack is incomplete." }, 409);
  const [visualStateRow] = await db.select().from(aiCompanionVisualStates).where(and(eq(aiCompanionVisualStates.userId, context.userId), eq(aiCompanionVisualStates.companionId, companion.id), eq(aiCompanionVisualStates.conversationId, conversation.id))).limit(1);
  const visualState = (() => { try { return visualStateRow ? JSON.parse(visualStateRow.stateJson) as CurrentVisualState : null; } catch { return null; } })();
  const fingerprint = await sceneFingerprint(visualIdentity.appearanceCatalogId, parsed.data.style, parsed.data.prompt, visualState);
  const scene = productionPhotoScene(parsed.data, visualState);
  const traits = parseVisualTraits(visualIdentity.lockedTraitsJson);
  if (!traits) return c.json({ error: "The companion visual identity is invalid." }, 500);
  const prompt = lifestylePhotoPrompt(scene, traits);
  let [bankAsset] = await db.select().from(aiCompanionPhotoAssets).where(and(eq(aiCompanionPhotoAssets.appearanceCatalogId, visualIdentity.appearanceCatalogId), eq(aiCompanionPhotoAssets.sceneFingerprint, fingerprint), eq(aiCompanionPhotoAssets.status, "approved"))).orderBy(desc(aiCompanionPhotoAssets.updatedAt)).limit(1);
  const requestedBankFingerprint = requestedPhotoBankFingerprint(parsed.data.prompt);
  if (!bankAsset && requestedBankFingerprint) [bankAsset] = await db.select().from(aiCompanionPhotoAssets).where(and(eq(aiCompanionPhotoAssets.appearanceCatalogId, visualIdentity.appearanceCatalogId), eq(aiCompanionPhotoAssets.sceneFingerprint, requestedBankFingerprint), eq(aiCompanionPhotoAssets.status, "approved"))).limit(1);
  // A catalog-approved bank photo is a safe immediate fallback while an exact
  // requested scene has not yet been pre-generated.
  if (!bankAsset) [bankAsset] = await db.select().from(aiCompanionPhotoAssets).where(and(eq(aiCompanionPhotoAssets.appearanceCatalogId, visualIdentity.appearanceCatalogId), eq(aiCompanionPhotoAssets.status, "approved"))).orderBy(desc(aiCompanionPhotoAssets.updatedAt)).limit(1);
  const timestamp = now();
  const photoId = id("aiphoto");
  if (bankAsset) {
    let identityScore: number | null = null;
    try { identityScore = Number((JSON.parse(bankAsset.metadataJson) as { identityScore?: number }).identityScore ?? null); } catch { /* Keep audited asset even if optional metadata is missing. */ }
    await db.insert(aiCompanionPhotos).values({ id: photoId, userId: context.userId, companionId: companion.id, visualIdentityVersion: visualIdentity.version, requestMessageId: parsed.data.requestMessageId ?? null, photoAssetId: bankAsset.id, sceneJson: JSON.stringify({ style: parsed.data.style, prompt: parsed.data.prompt, visualState, fingerprint }), prompt, objectKey: bankAsset.objectKey, status: "ready", identityScore, validationStatus: "approved", generationAttempt: 0, createdAt: timestamp, updatedAt: timestamp });
    return c.json({ photo: { id: photoId, status: "ready", source: "bank" } }, 201);
  }
  if (!c.env.COMPANION_IDENTITY_EVALUATOR_URL || !c.env.COMPANION_IDENTITY_EVALUATOR_TOKEN) return c.json({ error: "Companion photo generation is not released until the identity consistency evaluator is configured." }, 503);
  const generationReservation = await reservePhotoGeneration(c.env, context.userId, entitlement.plan as "free" | "pro" | "ultra");
  if (!generationReservation.allowed) {
    if (generationReservation.reason === "active") return c.json({ error: "Your photo is still being prepared. Please wait for it to finish before requesting another." }, 409);
    if (generationReservation.reason === "quota") return c.json({ error: generationReservation.period === "lifetime" ? "You've used the generated photo included with your free preview." : `You've created your ${generationReservation.limit} generated photos for today. Come back tomorrow for more.` }, 429);
    return c.json({ error: "Companion photo generation is taking a short pause. Your monthly photo allowance is safe—please try again later." }, 503);
  }
  const selectedReferences = [referenceKeys[0], referenceKeys[5], referenceKeys[1], referenceKeys[4]];
  try {
    await db.insert(aiCompanionPhotos).values({ id: photoId, userId: context.userId, companionId: companion.id, visualIdentityVersion: visualIdentity.version, requestMessageId: parsed.data.requestMessageId ?? null, photoAssetId: null, sceneJson: JSON.stringify({ style: parsed.data.style, prompt: parsed.data.prompt, visualState, fingerprint }), prompt, objectKey: null, status: "generating", identityScore: null, validationStatus: "pending", generationAttempt: 1, createdAt: timestamp, updatedAt: timestamp });
    const image = await generateReferenceImage(c.env, prompt, selectedReferences);
    const evaluation = await evaluatePhotoIdentity(c.env, image, selectedReferences);
    if (!evaluation.passed) {
      await db.update(aiCompanionPhotos).set({ status: "rejected", identityScore: evaluation.score, validationStatus: "failed", updatedAt: now() }).where(eq(aiCompanionPhotos.id, photoId));
      await logEvent(c.env, { eventType: "ai_companion_photo_rejected", userId: context.userId, profileId: context.profileId, eventData: { companionId: companion.id, appearanceId: visualIdentity.appearanceCatalogId, score: evaluation.score } });
      return c.json({ error: "The generated photo did not pass identity and safety checks. No monthly photo credit was used." }, 422);
    }
    const assetId = id("aiphoto_asset");
    const objectKey = `catalog/bank/v1/${visualIdentity.appearanceCatalogId}/${fingerprint}/${assetId}.png`;
    await c.env.COMPANION_IMAGES.put(objectKey, image, { httpMetadata: { contentType: "image/png" } });
    await db.batch([
      db.insert(aiCompanionPhotoAssets).values({ id: assetId, userId: null, companionId: companion.id, appearanceCatalogId: visualIdentity.appearanceCatalogId, visualIdentityVersion: visualIdentity.version, objectKey, sceneFingerprint: fingerprint, metadataJson: JSON.stringify({ identityScore: evaluation.score, threshold: evaluation.threshold, identityMatch: evaluation.identityMatch, adult: evaluation.adult, nonExplicit: evaluation.nonExplicit, style: parsed.data.style, visualState, syntheticProvenance: "workers-ai-flux-2-klein-9b" }), generationSource: "workers-ai-flux-2-klein-9b", status: "approved", createdAt: timestamp, updatedAt: now() }),
      db.update(aiCompanionPhotos).set({ photoAssetId: assetId, objectKey, status: "ready", identityScore: evaluation.score, validationStatus: "approved", updatedAt: now() }).where(eq(aiCompanionPhotos.id, photoId)),
    ]);
    return c.json({ photo: { id: photoId, status: "ready", source: "generated" } }, 201);
  } catch (error) {
    await db.update(aiCompanionPhotos).set({ status: "failed", validationStatus: "failed", updatedAt: now() }).where(eq(aiCompanionPhotos.id, photoId));
    console.error("Companion production photo failed", { companionId: companion.id, photoId, error: error instanceof Error ? error.message : String(error) });
    return c.json({ error: "The photo could not be prepared safely. No monthly photo credit was used." }, 502);
  } finally {
    await finishPhotoGeneration(c.env, context.userId, generationReservation.usagePeriod);
  }
});

aiCompanionRoutes.get("/:companionId/photos/:photoId", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.COMPANION_IMAGES) return c.json({ error: "Companion image services are not configured." }, 503);
  const db = getDb(c.env);
  const [photo, entitlement] = await Promise.all([
    db.select().from(aiCompanionPhotos).where(and(eq(aiCompanionPhotos.id, c.req.param("photoId")), eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.companionId, companion.id))).limit(1).then((rows) => rows[0]),
    getOrCreateEntitlement(c.env, context.userId),
  ]);
  if (!photo?.objectKey || !photo.photoAssetId || !["ready", "delivered"].includes(photo.status) || photo.validationStatus !== "approved") return c.json({ error: "Approved companion photo not found." }, 404);
  const object = await c.env.COMPANION_IMAGES.get(photo.objectKey);
  if (!object) return c.json({ error: "Approved companion photo not found." }, 404);
  const delivery = await registerSuccessfulPhotoDelivery(c.env, { userId: context.userId, companionId: companion.id, photoId: photo.id, photoAssetId: photo.photoAssetId, requestMessageId: photo.requestMessageId, photoLimit: entitlement.photoLimit, plan: entitlement.plan });
  if (!delivery.allowed) return c.json({ error: "Your companion photo allowance for this billing period is complete." }, 403);
  if (!delivery.alreadyDelivered) await db.update(aiCompanionPhotos).set({ status: "delivered", updatedAt: now() }).where(eq(aiCompanionPhotos.id, photo.id));
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, no-store" } });
});

aiCompanionRoutes.post("/:companionId/memories", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const parsed = createMemorySchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Memory must be between 2 and 280 characters." }, 400);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const timestamp = now(); const memory = { id: id("aimem"), userId: context.userId, companionId: companion.id, kind: "user_note", content: parsed.data.content, pinned: 1, createdAt: timestamp, updatedAt: timestamp };
  await getDb(c.env).insert(aiCompanionMemories).values(memory); return c.json({ memory }, 201);
});

aiCompanionRoutes.delete("/:companionId/memories/:memoryId", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  await getDb(c.env).delete(aiCompanionMemories).where(and(eq(aiCompanionMemories.id, c.req.param("memoryId")), eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id)));
  return c.json({ ok: true });
});

aiCompanionRoutes.post("/:companionId/memory-candidates/:candidateId/approve", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env);
  const [candidate] = await db.select().from(aiCompanionMemoryCandidates).where(and(eq(aiCompanionMemoryCandidates.id, c.req.param("candidateId")), eq(aiCompanionMemoryCandidates.userId, context.userId), eq(aiCompanionMemoryCandidates.companionId, companion.id), eq(aiCompanionMemoryCandidates.status, "pending"))).limit(1);
  if (!candidate) return c.json({ error: "Memory suggestion not found." }, 404);
  const timestamp = now();
  const memory = { id: id("aimem"), userId: context.userId, companionId: companion.id, kind: candidate.kind, content: candidate.content, pinned: 0, createdAt: timestamp, updatedAt: timestamp };
  const approve = db.update(aiCompanionMemoryCandidates).set({ status: "approved", reviewedAt: timestamp }).where(eq(aiCompanionMemoryCandidates.id, candidate.id));
  if (["identity", "location", "work"].includes(candidate.kind)) {
    await db.batch([
      db.delete(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id), eq(aiCompanionMemories.kind, candidate.kind))),
      db.insert(aiCompanionMemories).values(memory),
      approve,
    ]);
  }
  else await db.batch([db.insert(aiCompanionMemories).values(memory), approve]);
  return c.json({ memory });
});

aiCompanionRoutes.post("/:companionId/memory-candidates/:candidateId/dismiss", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const result = await getDb(c.env).update(aiCompanionMemoryCandidates).set({ status: "dismissed", reviewedAt: now() }).where(and(eq(aiCompanionMemoryCandidates.id, c.req.param("candidateId")), eq(aiCompanionMemoryCandidates.userId, context.userId), eq(aiCompanionMemoryCandidates.companionId, companion.id), eq(aiCompanionMemoryCandidates.status, "pending")));
  if ((result.meta.changes ?? 0) !== 1) return c.json({ error: "Memory suggestion not found." }, 404);
  return c.json({ ok: true });
});

aiCompanionRoutes.post("/:companionId/messages", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const parsed = sendMessageSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Messages must be between 1 and 1,000 characters." }, 400);
  if (c.env.AI_COMPANION_ENABLED !== "true" || !c.env.AI) return c.json({ error: "AI Companions are not enabled yet." }, 503);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env); const [conversation, entitlement, account] = await Promise.all([
    db.select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1).then((rows) => rows[0]), getOrCreateEntitlement(c.env, context.userId), db.select({ email: users.email }).from(users).where(eq(users.id, context.userId)).limit(1).then((rows) => rows[0]),
  ]);
  if (!conversation || !account) return c.json({ error: "Conversation unavailable." }, 404);
  const recordedVoiceAsset = parsed.data.voiceAssetId ? await db.select({ id: aiCompanionVoiceAssets.id }).from(aiCompanionVoiceAssets).where(and(eq(aiCompanionVoiceAssets.id, parsed.data.voiceAssetId), eq(aiCompanionVoiceAssets.userId, context.userId), eq(aiCompanionVoiceAssets.companionId, companion.id), eq(aiCompanionVoiceAssets.conversationId, conversation.id), eq(aiCompanionVoiceAssets.provider, "user-recorded"), eq(aiCompanionVoiceAssets.status, "ready"), isNull(aiCompanionVoiceAssets.messageId), isNull(aiCompanionVoiceAssets.deletedAt))).limit(1).then((rows) => rows[0] ?? null) : null;
  if (parsed.data.voiceAssetId && !recordedVoiceAsset) return c.json({ error: "That recorded voice message is no longer available." }, 409);
  const isApprovedBeta = isApprovedBetaUser(c.env, account.email);
  const crisisMessage = isCrisisMessage(parsed.data.body);
  const requestedPhoto = isCompanionPhotoRequest(parsed.data.body) && entitlement.photoLimit > 0;
  if (requestedPhoto && entitlement.plan === "free") {
    const usage = await c.env.DB.prepare("SELECT COUNT(*) AS delivered_count FROM ai_companion_photo_deliveries WHERE user_id = ?").bind(context.userId).first<{ delivered_count: number }>();
    if (Number(usage?.delivered_count ?? 0) >= entitlement.photoLimit) {
      return c.json({ error: "You’ve enjoyed the companion photo included with your free preview. Upgrade to Pro or Ultra whenever you’d like more photos." }, 403);
    }
  }
  let previewReservation: FreePreviewReservation | null = null;
  if (entitlement.plan === "free" && !crisisMessage) {
    const deviceKey = await readFreePreviewDeviceKey({ deviceId: c.req.header("X-Velora-Device-Id"), installId: c.req.header("X-Velora-Install-Id") });
    if (!deviceKey) return c.json({ error: "Velora needs to recognize this device before starting a free preview. Please reopen or update the app and try again." }, 400);
    previewReservation = await reserveFreePreviewReply(c.env, { userId: context.userId, deviceKey, conversationId: conversation.id, limit: entitlement.messageLimit });
    if (!previewReservation) return c.json({ error: "The free companion preview has already been used on this account or device. Choose Pro or Ultra whenever you are ready to keep talking." }, 403);
  }
  // The shared launch cap protects a public preview, not the approved internal beta.
  const needsReservedReply = entitlement.plan === "free" && !isApprovedBeta && !crisisMessage;
  if (needsReservedReply && !(await reserveFreeReply(c.env))) {
    await releaseFreePreviewReplyClaim(c.env, previewReservation);
    return c.json({ error: "Today's companion preview is at capacity. Please try again tomorrow." }, 429);
  }
  const relationshipStage = relationshipStageForPoints(conversation.relationshipPoints);
  const userMessage = { id: id("aimsg"), conversationId: conversation.id, role: "user", body: parsed.data.body, moderationStatus: "allowed", createdAt: now() };
  await db.insert(aiCompanionMessages).values(userMessage);
  const directSarcasticAffectionReply = sarcasticAffectionReply(parsed.data.body, companion.personaKey, userMessage.id, relationshipStage);
  const photoRequested = requestedPhoto;
  const recentMessagesForReply = await db.select({ role: aiCompanionMessages.role, body: aiCompanionMessages.body }).from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(desc(aiCompanionMessages.createdAt)).limit(20);
  let responseBody: string; let moderationStatus = "allowed";
  if (crisisMessage) { responseBody = safetyReply(); moderationStatus = "safety_redirect"; }
  else if (photoRequested) {
    const photoReplies = ["Okay—here's one for you 📸", "Fair request. Here you go 📸", "Your turn worked—photo incoming 📸", "Since you asked nicely... here 📸", "All right, you convinced me 📸"];
    const photoSeed = [...userMessage.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    const recentAssistantReplies = recentMessagesForReply.filter((message) => message.role === "assistant").map((message) => message.body.toLowerCase());
    responseBody = Array.from({ length: photoReplies.length }, (_, offset) => photoReplies[(photoSeed + offset) % photoReplies.length]).find((candidate) => !recentAssistantReplies.some((previous) => previous.includes(candidate.toLowerCase()))) ?? photoReplies[photoSeed % photoReplies.length];
  }
  else if (directSarcasticAffectionReply) { responseBody = directSarcasticAffectionReply; }
  else {
    const [memories, canon] = await Promise.all([
    db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(12),
    getOrCreateCharacterCanon(c.env, companion),
    ]);
    const messages = [
      { role: "system", content: buildSystemPrompt({ companion, canon, memories, relationshipStage }) },
      ...getCharacterExamples(companion, canon, relationshipStage),
      ...recentMessagesForReply.slice().reverse().map((message) => ({ role: message.role, content: message.body })),
    ];
    try { responseBody = extractModelText(await c.env.AI.run("@cf/meta/llama-3.2-3b-instruct", { messages, max_tokens: 90, temperature: 0.75 })); }
    catch {
      if (needsReservedReply) await releaseFreeReply(c.env);
      await releaseFreePreviewReplyClaim(c.env, previewReservation);
      await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id));
      return c.json({ error: "The companion could not reply just now. Please try again." }, 502);
    }
    if (!responseBody) {
      if (needsReservedReply) await releaseFreeReply(c.env);
      await releaseFreePreviewReplyClaim(c.env, previewReservation);
      await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id));
      return c.json({ error: "The companion model did not return a usable reply. Please try again later." }, 502);
    }
    responseBody = removeUnnecessaryBodyDisclaimer(parsed.data.body, responseBody, companion.personaKey, relationshipStage);
    responseBody = suppressOverusedPetReference(parsed.data.body, responseBody, canon, recentMessagesForReply);
    if (!responseBody || containsBlockedOutput(responseBody)) { responseBody = "I want to keep this conversation safe and respectful. Could we take that in a different direction?"; moderationStatus = "safety_redirect"; }
  }
  const assistantMessageId = id("aimsg");
  if (moderationStatus === "allowed") {
    responseBody = addSarcasticPlayfulEdge(parsed.data.body, responseBody, companion.personaKey, assistantMessageId, relationshipStage);
    responseBody = addSarcasticRomanticAwareness(parsed.data.body, responseBody, companion.personaKey, assistantMessageId, recentMessagesForReply);
    responseBody = addQuietRomanticRelationshipAwareness(parsed.data.body, responseBody, companion.personaKey, assistantMessageId);
    responseBody = normalizePersonaEmojiTone(responseBody, companion.personaKey);
    if (!photoRequested) responseBody = addConversationHook(parsed.data.body, responseBody, companion.personaKey, assistantMessageId, recentMessagesForReply);
    responseBody = addCompanionEmoji(responseBody, parsed.data.body, companion.personaKey, assistantMessageId);
    if (substantiallyRepeatsRecentReply(responseBody, recentMessagesForReply)) {
      try { responseBody = await rewriteRepeatedAssistantReply(c.env, companion, parsed.data.body, responseBody, recentMessagesForReply); }
      catch { /* Keep the safe original if an optional variation pass is unavailable. */ }
    }
  }
  if (recordedVoiceAsset) {
    const attached = await db.update(aiCompanionVoiceAssets).set({ messageId: userMessage.id, updatedAt: now() }).where(and(eq(aiCompanionVoiceAssets.id, recordedVoiceAsset.id), isNull(aiCompanionVoiceAssets.messageId)));
    if ((attached.meta.changes ?? 0) !== 1) {
      if (needsReservedReply) await releaseFreeReply(c.env);
      await releaseFreePreviewReplyClaim(c.env, previewReservation);
      await db.delete(aiCompanionMessages).where(eq(aiCompanionMessages.id, userMessage.id));
      return c.json({ error: "That recorded voice message could not be attached. Please try again." }, 409);
    }
  }
  const assistantMessage = { id: assistantMessageId, conversationId: conversation.id, role: "assistant", body: responseBody, moderationStatus, createdAt: now() };
  await db.insert(aiCompanionMessages).values(assistantMessage);
  // Keep concrete outfit and scene claims available to the image pipeline instead
  // of asking a later generation to reconstruct them from unstructured chat.
  const visualState = moderationStatus === "allowed" ? visualStateFromCompanionReply(responseBody) : null;
  if (visualState) {
    const timestamp = now();
    await db.insert(aiCompanionVisualStates).values({ id: id("aivisualstate"), userId: context.userId, companionId: companion.id, conversationId: conversation.id, stateJson: JSON.stringify(visualState), sourceMessageId: assistantMessage.id, createdAt: timestamp, updatedAt: timestamp }).onConflictDoUpdate({ target: [aiCompanionVisualStates.userId, aiCompanionVisualStates.companionId, aiCompanionVisualStates.conversationId], set: { stateJson: JSON.stringify(visualState), sourceMessageId: assistantMessage.id, updatedAt: timestamp } });
  }
  // Suggestions are optional and only follow ordinary conversations.
  if (moderationStatus === "allowed") {
    try { await createMemoryCandidates(c.env, { userId: context.userId, companionId: companion.id, sourceMessageId: userMessage.id, message: parsed.data.body }); }
    catch { /* The conversation itself remains available even if suggestion creation fails. */ }
  }
  const trialRepliesUsed = entitlement.plan === "free" && moderationStatus === "allowed" ? conversation.trialRepliesUsed + 1 : conversation.trialRepliesUsed;
  if (moderationStatus === "allowed") {
    const relationshipPoints = conversation.relationshipPoints + relationshipPointsForMessage(parsed.data.body);
    await db.update(aiCompanionConversations).set({ trialRepliesUsed, relationshipPoints, relationshipStage: relationshipStageForPoints(relationshipPoints), updatedAt: now() }).where(eq(aiCompanionConversations.id, conversation.id));
    await completeFreePreviewReplyClaim(c.env, previewReservation, assistantMessage.id);
  }
  else {
    if (needsReservedReply) await releaseFreeReply(c.env);
    await releaseFreePreviewReplyClaim(c.env, previewReservation);
  }
  // The conversation is already committed. Telemetry must not suppress the
  // response that tells the client to continue with an attached photo action.
  await logEvent(c.env, { eventType: "ai_companion_message_sent", userId: context.userId, profileId: context.profileId, eventData: { companionId: companion.id } }).catch(() => undefined);
  const effectiveTrialRepliesUsed = entitlement.plan === "free"
    ? await getFreePreviewRepliesUsed(c.env, { userId: context.userId, deviceKey: await readFreePreviewDeviceKey({ deviceId: c.req.header("X-Velora-Device-Id"), installId: c.req.header("X-Velora-Install-Id") }), limit: entitlement.messageLimit })
    : trialRepliesUsed;
  return c.json({ userMessage, assistantMessage, trialRepliesUsed: effectiveTrialRepliesUsed, photoRequested: moderationStatus === "allowed" && photoRequested });
});

aiCompanionRoutes.post("/messages/:messageId/report", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const parsed = reportSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please select a report reason." }, 400);
  const db = getDb(c.env); const [message] = await db.select({ id: aiCompanionMessages.id }).from(aiCompanionMessages).innerJoin(aiCompanionConversations, eq(aiCompanionMessages.conversationId, aiCompanionConversations.id)).where(and(eq(aiCompanionMessages.id, c.req.param("messageId")), eq(aiCompanionMessages.role, "assistant"), eq(aiCompanionConversations.userId, context.userId))).limit(1);
  if (!message) return c.json({ error: "Message not found." }, 404);
  await db.insert(aiCompanionReports).values({ id: id("aireport"), userId: context.userId, messageId: message.id, reason: parsed.data.reason, details: parsed.data.details, createdAt: now() });
  await logEvent(c.env, { eventType: "ai_companion_message_reported", userId: context.userId, profileId: context.profileId, eventData: { reason: parsed.data.reason } }); return c.json({ ok: true });
});

aiCompanionRoutes.post("/photos/:photoId/report", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "Sign in to use AI Companion." }, 401);
  const parsed = reportSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please select a report reason." }, 400);
  const db = getDb(c.env);
  const [photo] = await db.select({ id: aiCompanionPhotos.id, companionId: aiCompanionPhotos.companionId })
    .from(aiCompanionPhotos)
    .where(and(eq(aiCompanionPhotos.id, c.req.param("photoId")), eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.status, "delivered")))
    .limit(1);
  if (!photo) return c.json({ error: "Companion photo not found." }, 404);
  await db.insert(aiCompanionPhotoReports).values({ id: id("aiphotoreport"), userId: context.userId, photoId: photo.id, reason: parsed.data.reason, details: parsed.data.details, createdAt: now() });
  await logEvent(c.env, { eventType: "ai_companion_photo_reported", userId: context.userId, profileId: context.profileId, eventData: { companionId: photo.companionId, photoId: photo.id, reason: parsed.data.reason } });
  return c.json({ ok: true });
});
