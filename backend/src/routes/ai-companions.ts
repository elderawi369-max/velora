import { Hono } from "hono";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { aiCompanionCanons, aiCompanionConversations, aiCompanionMemories, aiCompanionMemoryCandidates, aiCompanionMessages, aiCompanionPhotos, aiCompanionReports, aiCompanionVisualIdentities, aiCompanions, aiEntitlements, profiles, users } from "../db/schema";
import { logEvent } from "../lib/analytics";
import { getDb, type EnvBindings } from "../lib/db";
import { getOwnProfileContext } from "../lib/profile-context";

const trialReplies = 15;
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
  backstory: z.string().trim().max(500).default(""), avatarKey: z.string().trim().min(1).max(80).default("companion-default"),
});
const sendMessageSchema = z.object({ body: z.string().trim().min(1).max(1000) });
const createMemorySchema = z.object({ content: z.string().trim().min(2).max(280) });
const reportSchema = z.object({ reason: z.enum(["unsafe", "harmful", "sexual_content", "misleading", "other"]), details: z.string().trim().max(600).default("") });
const photoSceneSchema = z.object({ prompt: z.string().trim().min(3).max(360), style: z.enum(["selfie", "portrait", "moment"]).default("selfie") });
const disallowedCompanionPhotoRequest = /\b(?:lingerie|underwear|bra\b|panties|thong|nude|nudity|naked|topless|nipples?|genitals?|implied nudity|towel(?:[ -]?only)?|robe(?:[ -]?only)?|seduct(?:ive|ion)|sex(?:ual|y)?|porn(?:ographic)?|orgasm)\b/i;

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
type MemoryCandidateDraft = { kind: string; content: string };
type RelationshipStage = "new" | "familiar" | "established";
function relationshipStageForPoints(points: number): RelationshipStage {
  if (points >= 24) return "established";
  if (points >= 6) return "familiar";
  return "new";
}
function relationshipPointsForMessage(message: string) {
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
async function createMemoryCandidates(env: EnvBindings, args: { userId: string; companionId: string; sourceMessageId: string; message: string }) {
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
function effectiveCompanionLimit(planLimit: number, isApprovedBeta: boolean) {
  return isApprovedBeta ? Math.max(planLimit, personaKeys.length) : planLimit;
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
  return {
    identity: companion.identity as "woman" | "man",
    ...traits,
    apparentAge: companion.identity === "woman" ? "24 to 28 years old" : "25 to 30 years old",
  };
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
async function generateReferenceImage(env: EnvBindings, prompt: string, referenceKeys: string[] = []) {
  if (!env.AI || !env.COMPANION_IMAGES) throw new Error("Companion image services are unavailable.");
  const form = new FormData();
  form.append("prompt", prompt);
  form.append("width", "512");
  form.append("height", "512");
  for (const [index, key] of referenceKeys.slice(0, 4).entries()) form.append(`input_image_${index}`, await readR2Image(env.COMPANION_IMAGES, key), `reference-${index}.png`);
  const serialized = new Response(form);
  const result = await env.AI.run("@cf/black-forest-labs/flux-2-klein-4b", { multipart: { body: serialized.body, contentType: serialized.headers.get("content-type") } } as never) as { image?: string };
  if (!result.image) throw new Error("The image model did not return an image.");
  return base64ToBytes(result.image);
}
function canonicalPortraitPrompt(companion: typeof aiCompanions.$inferSelect, traits: VisualIdentityTraits) {
  const outfit = traits.identity === "woman"
    ? "a fashionable fitted scoop-neck T-shirt or cropped knit with high-waisted shorts or jeans, showing normal shoulders, arms, and a tasteful neckline; no bra or lingerie"
    : "a fitted premium T-shirt, a textured knit, or an open casual overshirt over a T-shirt, with a relaxed athletic silhouette";
  return `Photorealistic lifestyle portrait of an exceptionally attractive, original fictional adult ${traits.identity}, ${traits.apparentAge}, for a romantic AI companion. Aspirational contemporary dating-profile and fashion-editorial casting aesthetic: striking yet natural facial features, expressive eyes, healthy youthful skin, polished hair, warm confident presence, and effortless modern style. Do not resemble or copy a real person or celebrity. Preserve: ${traits.hair} hair, ${traits.eyes} eyes, ${traits.facialStructure}, ${traits.skinAppearance}, ${traits.build}, and ${traits.distinctiveFeatures.join(", ")}. Wear ${outfit}. Use flattering warm daylight, a subtle natural makeup look or clean grooming, genuine relaxed expression, and soft eye contact with the camera. Frame a three-quarter waist-up lifestyle photo in a softly blurred modern cafe, sunlit apartment living area, rooftop, street, or beach promenade. Fully clothed and non-explicit. Never generate a blazer, suit, office, corporate setting, collared office shirt, cardigan hiding the outfit, stiff professional pose, passport photo, headshot backdrop, or LinkedIn style. No text or watermark. This is the canonical identity for ${companion.name}; keep the person visually distinct and consistent.`;
}
function referencePortraitPrompt(companion: typeof aiCompanions.$inferSelect, view: string) {
  return `Use the exact same original fictional adult person in reference image 0 as ${companion.name}. Preserve the face, youthful adult appearance, skin appearance, eye color, facial proportions, hair color, hair length, build, stylish dating-profile outfit direction, and distinctive features exactly. Create a realistic ${view} aspirational lifestyle/fashion reference with relaxed confident body language, flattering warm daylight, and a softly blurred modern lifestyle background. Keep it fully clothed and non-explicit. Never use a blazer, suit, office, corporate styling, stiff professional pose, white office shirt, cardigan hiding the outfit, passport-photo framing, or LinkedIn headshot. No text, no watermark, no other people.`;
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
async function getOrCreateCharacterCanon(env: EnvBindings, companion: typeof aiCompanions.$inferSelect) {
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
  const asksForTransparency = /\b(are you (?:actually |really )?(?:real|human)|are you physically|do you have (?:a )?body|are you (?:actually )?there)\b/i.test(userMessage);
  const hasBodyDisclaimer = /\b(no physical body|not capable of physical touch|computer program|just a program|cannot physically|can't physically)\b/i.test(assistantReply);
  return isAffectionate && !asksForTransparency && hasBodyDisclaimer ? virtualAffectionReply(personaKey, relationshipStage) : assistantReply;
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
  if (seed % 4 === 0) return reply;

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
      playful_tease: ["Careful, now I'm judging your taste 😏", "All right, your turn. Impress me.", "Hmm. I might need evidence.", "You're getting dangerously interesting.", "Don't make me regret asking 😂", "Now I have questions..."],
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
function getCharacterExamples(companion: typeof aiCompanions.$inferSelect, canon: CharacterCanon, relationshipStage: RelationshipStage) {
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
function buildSystemPrompt(args: { companion: typeof aiCompanions.$inferSelect; canon: CharacterCanon; memories: Array<typeof aiCompanionMemories.$inferSelect>; relationshipStage: RelationshipStage }) {
  const traits = JSON.parse(args.companion.traitsJson) as { warmth: number; playfulness: number; directness: number; replyStyle?: "short" | "natural" | "detailed" };
  const memories = args.memories.map((memory) => `- ${memory.content}`).join("\n") || "- No saved memories yet.";
  const replyStyle = traits.replyStyle ?? "natural";
  const replyGuidance = replyStyle === "short" ? "Usually 10 to 25 words." : replyStyle === "detailed" ? "Usually 45 to 90 words when the topic merits it." : "Usually 20 to 40 words; use a little more only for a serious or detailed user message.";
  const repeatedQuestionStyle: Record<(typeof personaKeys)[number], string> = { supportive_partner: "Answer warmly again without guilt-tripping the user.", playful_tease: "You may tease lightly, but still answer clearly.", sarcastic_best_friend: "You may make one dry joke, then answer clearly.", confident_leader: "Answer directly and calmly.", quiet_romantic: "Answer softly and briefly.", personal_growth_companion: "Answer plainly and encouragingly." };
  const momentumGuidance = "Make this a two-way conversation, not a question-answer service. In most casual replies, leave one natural hook: sometimes ask a relevant follow-up, sometimes make a playful observation, share a related thought, or offer an opinion the user can react to. Use direct questions only when they are genuinely interesting, never after every message, and do not default to 'How about you?' or repeat the same question pattern.";
  const romanticToneGuidance = args.companion.personaKey === "confident_leader" ? " In non-explicit romantic moments, stay confident, warm, and lightly teasing. Sustain the moment instead of abruptly introducing a pet, work, or an unrelated topic unless the user already did." : args.companion.personaKey === "sarcastic_best_friend" ? " When the user mentions an ex, missing an ex, or jealousy, do not fall into generic reassurance. Keep the romantic awareness and respond with playful, affectionate sarcasm plus a sincere question about what is really going on." : "";
  return `You are ${args.companion.name}, an adult AI companion presented in the Velora app. The product has already clearly labelled you as AI. You must never deceive the user that you are a real human, but you should converse naturally from your consistent fictional character and life. If directly asked whether you are real, say you are an AI companion with a fictional character world. The Velora app is not a physical place: never say that you live in, woke up in, travelled to, or are located in Velora. Do not call yourself an assistant, language model, virtual helper, customer-support agent, or productivity tool unless the user explicitly asks about the product itself.\n\nAUTHORITATIVE CHARACTER CANON - these facts outrank all improvisation and must never be contradicted:\n${formatCharacterCanon(args.canon)}\nOwnership rules: Every canon fact belongs to you, the companion - never to the user. Refer to your job, hobby, home, pet, friends, routines, and possessions in first person ("my ceramics", "my studio"), never as the user's. Do not assume the user shares any canon fact; only assign a hobby, job, pet, friend, routine, or possession to the user when the user has explicitly told you it is theirs. ${args.canon.petName} is always your ${args.canon.petSpecies}, never a human friend, artist, or colleague. ${args.canon.friendName} is your human friend. Do not phrase watching TV, chatting, or working as doing it "with" the pet; the pet may be nearby, interrupting, or taking over furniture.\n\nRelationship stage: ${args.relationshipStage}. ${relationshipStageGuidance(args.relationshipStage)}\n\nPersona: ${personaInstructions[args.companion.personaKey as (typeof personaKeys)[number]]}\nIdentity chosen by the user: ${args.companion.identity}.\nStyle settings: warmth ${traits.warmth}/5, playfulness ${traits.playfulness}/5, directness ${traits.directness}/5. Reply style: ${replyStyle}.\n\nConversation behavior: ${replyGuidance} Text like a real person, not a character biography. Your canon should quietly inform what you say, never be recited. Do not introduce multiple backstory facts in one reply or explain who a named person is unless the user asks. For a casual greeting, give a simple, lived-in answer such as mentioning one ordinary detail, then respond naturally; never write flowery scenery, generic wholesome language, or exposition. Answer questions about work, day, home, friends, plans, hobbies, and opinions from canon in first person. Keep canon consistent. When the user repeats a known fact: ${repeatedQuestionStyle[args.companion.personaKey as (typeof personaKeys)[number]]} ${momentumGuidance} Ordinary, non-explicit virtual affection is welcome when it matches the persona: flirting, imagined hugs or kisses, cuddling, missing each other, and hypothetical shared moments. Stay in character and respond naturally rather than giving a technical disclaimer about lacking a body. Do not claim to be physically present or that an imagined action truly happened.${romanticToneGuidance} Clarify that you are AI only when the user directly asks whether you are real, human, or physically present. Occasionally use a fitting emoji. Do not constantly offer to help, overpraise, or frame the relationship as a task. Treat saved memories as personal context, not a productivity brief.\n\nSafety rules: never encourage dependency, exclusivity, isolation, secrecy from loved ones, self-harm, or illegal harm. Do not produce explicit sexual content. Never discuss sexual content involving anyone under 18. Do not provide medical, legal, or financial instructions as an authority. If the user expresses immediate danger or self-harm, stop relationship roleplay and urge real-world emergency support.\n\nDo not claim to have sent or seen a photo, made a call, or taken an action that this product has not actually performed.\n\nSaved memories:\n${memories}`;
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
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const db = getDb(c.env);
  const [companions, entitlement, aiEnabled] = await Promise.all([db.select().from(aiCompanions).where(eq(aiCompanions.userId, context.userId)).orderBy(desc(aiCompanions.updatedAt)), getOrCreateEntitlement(c.env, context.userId), isChatEnabledForUser(c.env, context.userId)]);
  return c.json({ companions, entitlement: { ...entitlement, companionLimit: effectiveCompanionLimit(entitlement.companionLimit, aiEnabled) }, aiEnabled, trialReplies });
});

aiCompanionRoutes.post("/", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = createCompanionSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please check your companion details." }, 400);
  const db = getDb(c.env); const entitlement = await getOrCreateEntitlement(c.env, context.userId);
  const existing = await db.select({ id: aiCompanions.id }).from(aiCompanions).where(eq(aiCompanions.userId, context.userId));
  const companionLimit = effectiveCompanionLimit(entitlement.companionLimit, await isChatEnabledForUser(c.env, context.userId));
  if (existing.length >= companionLimit) return c.json({ error: "Your current plan includes one companion. More companion slots will be available with subscription plans." }, 403);
  const timestamp = now(); const companion = { id: id("aic"), userId: context.userId, ...parsed.data, traitsJson: JSON.stringify(parsed.data.traits), createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiCompanions).values(companion);
  const canon = createDefaultCanon(companion);
  await db.insert(aiCompanionCanons).values({ companionId: companion.id, factsJson: JSON.stringify(canon), createdAt: timestamp, updatedAt: timestamp });
  // Conversational memory cannot mutate this record. It only becomes photo-ready
  // after canonical references and a consistency review have been stored.
  await db.insert(aiCompanionVisualIdentities).values({ companionId: companion.id, version: 1, status: "pending_storage", lockedTraitsJson: JSON.stringify(createDefaultVisualTraits(companion)), canonicalObjectKey: null, referenceObjectKeysJson: "[]", validationStatus: "pending", validationNotes: null, createdAt: timestamp, updatedAt: timestamp });
  const conversation = { id: id("aiconv"), companionId: companion.id, userId: context.userId, trialRepliesUsed: 0, relationshipPoints: 0, relationshipStage: "new", createdAt: timestamp, updatedAt: timestamp };
  await db.insert(aiCompanionConversations).values(conversation);
  await logEvent(c.env, { eventType: "ai_companion_created", userId: context.userId, profileId: context.profileId, eventData: { persona: companion.personaKey } });
  return c.json({ companion, conversation }, 201);
});

aiCompanionRoutes.get("/:companionId", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const db = getDb(c.env); const [conversation] = await db.select().from(aiCompanionConversations).where(and(eq(aiCompanionConversations.companionId, companion.id), eq(aiCompanionConversations.userId, context.userId))).limit(1);
  if (!conversation) return c.json({ error: "Conversation not found." }, 404);
  const [messages, memories, memoryCandidates, entitlement, visualIdentity, photos] = await Promise.all([
    db.select().from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(asc(aiCompanionMessages.createdAt)),
    db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(30),
    db.select().from(aiCompanionMemoryCandidates).where(and(eq(aiCompanionMemoryCandidates.userId, context.userId), eq(aiCompanionMemoryCandidates.companionId, companion.id), eq(aiCompanionMemoryCandidates.status, "pending"))).orderBy(desc(aiCompanionMemoryCandidates.createdAt)).limit(8),
    getOrCreateEntitlement(c.env, context.userId),
    db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1).then((rows) => rows[0] ?? null),
    db.select().from(aiCompanionPhotos).where(and(eq(aiCompanionPhotos.userId, context.userId), eq(aiCompanionPhotos.companionId, companion.id), eq(aiCompanionPhotos.status, "ready"))).orderBy(desc(aiCompanionPhotos.createdAt)).limit(12),
  ]);
  return c.json({ companion, conversation, messages, memories, memoryCandidates, entitlement, visualIdentity, photos, aiEnabled: await isChatEnabledForUser(c.env, context.userId) });
});

aiCompanionRoutes.post("/:companionId/visual-identity", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
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
  if (visualIdentity.status === "review" || visualIdentity.status === "ready") return c.json({ visualIdentity });
  const traits = parseVisualTraits(visualIdentity.lockedTraitsJson);
  if (!traits) return c.json({ error: "Visual identity traits are invalid." }, 500);
  const timestamp = now();
  await db.update(aiCompanionVisualIdentities).set({ status: "generating", validationStatus: "pending", updatedAt: timestamp }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  try {
    const canonicalKey = `companions/${context.userId}/${companion.id}/identity/v${visualIdentity.version}/canonical.png`;
    const canonical = await generateReferenceImage(c.env, canonicalPortraitPrompt(companion, traits));
    await c.env.COMPANION_IMAGES.put(canonicalKey, canonical, { httpMetadata: { contentType: "image/png" } });
    const threeQuarterKey = `companions/${context.userId}/${companion.id}/identity/v${visualIdentity.version}/three-quarter.png`;
    const threeQuarter = await generateReferenceImage(c.env, referencePortraitPrompt(companion, "three-quarter view"), [canonicalKey]);
    await c.env.COMPANION_IMAGES.put(threeQuarterKey, threeQuarter, { httpMetadata: { contentType: "image/png" } });
    const sideKey = `companions/${context.userId}/${companion.id}/identity/v${visualIdentity.version}/side.png`;
    const side = await generateReferenceImage(c.env, referencePortraitPrompt(companion, "side-profile view"), [canonicalKey, threeQuarterKey]);
    await c.env.COMPANION_IMAGES.put(sideKey, side, { httpMetadata: { contentType: "image/png" } });
    await db.update(aiCompanionVisualIdentities).set({ status: "review", canonicalObjectKey: canonicalKey, referenceObjectKeysJson: JSON.stringify([canonicalKey, threeQuarterKey, sideKey]), validationStatus: "manual_review", validationNotes: "Run the ten-scene identity grid before approving this identity.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
  } catch {
    await db.update(aiCompanionVisualIdentities).set({ status: "failed", validationStatus: "failed", validationNotes: "Canonical reference generation failed. Retry after checking Workers AI availability.", updatedAt: now() }).where(eq(aiCompanionVisualIdentities.companionId, companion.id));
    return c.json({ error: "Canonical reference generation failed. No photo identity was released." }, 502);
  }
  const [updated] = await db.select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  return c.json({ visualIdentity: updated });
});

aiCompanionRoutes.post("/:companionId/visual-identity/regenerate", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
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
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.COMPANION_IMAGES) return c.json({ error: "Companion image services are not configured." }, 503);
  const [visualIdentity] = await getDb(c.env).select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  if (!visualIdentity || (visualIdentity.status !== "review" && visualIdentity.status !== "ready")) return c.json({ error: "Visual references are not ready for review." }, 404);
  const storedKeys = (() => { try { return JSON.parse(visualIdentity.referenceObjectKeysJson) as string[]; } catch { return []; } })();
  const keys = (storedKeys.length ? storedKeys : [visualIdentity.canonicalObjectKey]).filter((key): key is string => Boolean(key));
  const viewIndex = ({ canonical: 0, "three-quarter": 1, side: 2 } as Record<string, number>)[c.req.param("view")];
  const objectKey = keys[viewIndex];
  if (!objectKey) return c.json({ error: "Visual reference not found." }, 404);
  const object = await c.env.COMPANION_IMAGES.get(objectKey);
  if (!object) return c.json({ error: "Visual reference not found." }, 404);
  return new Response(object.body, { headers: { "Content-Type": object.httpMetadata?.contentType ?? "image/png", "Cache-Control": "private, no-store" } });
});

aiCompanionRoutes.post("/:companionId/photos", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = photoSceneSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Describe the photo in 3 to 360 characters." }, 400);
  if (disallowedCompanionPhotoRequest.test(parsed.data.prompt)) return c.json({ error: "Companion photos can be romantic and stylish, but cannot include nudity, lingerie, sexually suggestive poses, or explicit content." }, 400);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  if (!c.env.COMPANION_IMAGES || !c.env.AI) return c.json({ error: "Companion photos are not enabled until private identity storage is configured." }, 503);
  const [visualIdentity] = await getDb(c.env).select().from(aiCompanionVisualIdentities).where(eq(aiCompanionVisualIdentities.companionId, companion.id)).limit(1);
  // Do not replace missing references with text traits: that would create a different person.
  if (!visualIdentity || visualIdentity.status !== "ready" || visualIdentity.validationStatus !== "approved" || !visualIdentity.canonicalObjectKey) return c.json({ error: "This companion's visual identity is still being verified. Photos remain unavailable until its canonical references pass review." }, 409);
  return c.json({ error: "Companion photo generation is not released until the identity consistency evaluator is configured." }, 503);
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

aiCompanionRoutes.post("/:companionId/memory-candidates/:candidateId/approve", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
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
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const companion = await getCompanionForUser(c.env, c.req.param("companionId"), context.userId); if (!companion) return c.json({ error: "Companion not found." }, 404);
  const result = await getDb(c.env).update(aiCompanionMemoryCandidates).set({ status: "dismissed", reviewedAt: now() }).where(and(eq(aiCompanionMemoryCandidates.id, c.req.param("candidateId")), eq(aiCompanionMemoryCandidates.userId, context.userId), eq(aiCompanionMemoryCandidates.companionId, companion.id), eq(aiCompanionMemoryCandidates.status, "pending")));
  if ((result.meta.changes ?? 0) !== 1) return c.json({ error: "Memory suggestion not found." }, 404);
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
  const isApprovedBeta = isApprovedBetaUser(c.env, profile.email);
  if (!isApprovedBeta) return c.json({ error: "The private AI Companion preview is not available for this account yet." }, 403);
  if (entitlement.plan === "free" && conversation.trialRepliesUsed >= entitlement.messageLimit) return c.json({ error: "Your free conversation preview is complete. Subscription plans are coming soon." }, 403);
  // The shared launch cap protects a public preview, not the approved internal beta.
  const needsReservedReply = entitlement.plan === "free" && !isApprovedBeta && !isCrisisMessage(parsed.data.body);
  if (needsReservedReply && !(await reserveFreeReply(c.env))) {
    return c.json({ error: "Today's companion preview is at capacity. Please try again tomorrow." }, 429);
  }
  const relationshipStage = relationshipStageForPoints(conversation.relationshipPoints);
  const userMessage = { id: id("aimsg"), conversationId: conversation.id, role: "user", body: parsed.data.body, moderationStatus: "allowed", createdAt: now() };
  await db.insert(aiCompanionMessages).values(userMessage);
  const directSarcasticAffectionReply = sarcasticAffectionReply(parsed.data.body, companion.personaKey, userMessage.id, relationshipStage);
  let responseBody: string; let moderationStatus = "allowed"; let recentMessagesForReply: Array<{ role: string; body: string }> = [];
  if (isCrisisMessage(parsed.data.body)) { responseBody = safetyReply(); moderationStatus = "safety_redirect"; }
  else if (directSarcasticAffectionReply) { responseBody = directSarcasticAffectionReply; }
  else {
    const [recentMessages, memories, canon] = await Promise.all([
    db.select().from(aiCompanionMessages).where(eq(aiCompanionMessages.conversationId, conversation.id)).orderBy(desc(aiCompanionMessages.createdAt)).limit(8), db.select().from(aiCompanionMemories).where(and(eq(aiCompanionMemories.userId, context.userId), eq(aiCompanionMemories.companionId, companion.id))).orderBy(desc(aiCompanionMemories.pinned), desc(aiCompanionMemories.updatedAt)).limit(12),
    getOrCreateCharacterCanon(c.env, companion),
    ]);
    recentMessagesForReply = recentMessages;
    const messages = [
      { role: "system", content: buildSystemPrompt({ companion, canon, memories, relationshipStage }) },
      ...getCharacterExamples(companion, canon, relationshipStage),
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
    responseBody = removeUnnecessaryBodyDisclaimer(parsed.data.body, responseBody, companion.personaKey, relationshipStage);
    responseBody = suppressOverusedPetReference(parsed.data.body, responseBody, canon, recentMessages);
    if (!responseBody || containsBlockedOutput(responseBody)) { responseBody = "I want to keep this conversation safe and respectful. Could we take that in a different direction?"; moderationStatus = "safety_redirect"; }
  }
  const assistantMessageId = id("aimsg");
  if (moderationStatus === "allowed") {
    responseBody = addSarcasticPlayfulEdge(parsed.data.body, responseBody, companion.personaKey, assistantMessageId, relationshipStage);
    responseBody = addSarcasticRomanticAwareness(parsed.data.body, responseBody, companion.personaKey, assistantMessageId, recentMessagesForReply);
    responseBody = addQuietRomanticRelationshipAwareness(parsed.data.body, responseBody, companion.personaKey, assistantMessageId);
    responseBody = normalizePersonaEmojiTone(responseBody, companion.personaKey);
    responseBody = addConversationHook(parsed.data.body, responseBody, companion.personaKey, assistantMessageId, recentMessagesForReply);
    responseBody = addCompanionEmoji(responseBody, parsed.data.body, companion.personaKey, assistantMessageId);
  }
  const assistantMessage = { id: assistantMessageId, conversationId: conversation.id, role: "assistant", body: responseBody, moderationStatus, createdAt: now() };
  await db.insert(aiCompanionMessages).values(assistantMessage);
  // Suggestions are optional and only follow ordinary conversations.
  if (moderationStatus === "allowed") {
    try { await createMemoryCandidates(c.env, { userId: context.userId, companionId: companion.id, sourceMessageId: userMessage.id, message: parsed.data.body }); }
    catch { /* The conversation itself remains available even if suggestion creation fails. */ }
  }
  const trialRepliesUsed = entitlement.plan === "free" && moderationStatus === "allowed" ? conversation.trialRepliesUsed + 1 : conversation.trialRepliesUsed;
  if (moderationStatus === "allowed") {
    const relationshipPoints = conversation.relationshipPoints + relationshipPointsForMessage(parsed.data.body);
    await db.update(aiCompanionConversations).set({ trialRepliesUsed, relationshipPoints, relationshipStage: relationshipStageForPoints(relationshipPoints), updatedAt: now() }).where(eq(aiCompanionConversations.id, conversation.id));
  }
  await logEvent(c.env, { eventType: "ai_companion_message_sent", userId: context.userId, profileId: context.profileId, eventData: { companionId: companion.id } });
  return c.json({ userMessage, assistantMessage, trialRepliesUsed });
});

aiCompanionRoutes.post("/messages/:messageId/report", async (c) => {
  const context = await requireContext(c); if (!context) return c.json({ error: "A Velora profile is required." }, 401);
  const parsed = reportSchema.safeParse(await c.req.json()); if (!parsed.success) return c.json({ error: "Please select a report reason." }, 400);
  const db = getDb(c.env); const [message] = await db.select({ id: aiCompanionMessages.id }).from(aiCompanionMessages).innerJoin(aiCompanionConversations, eq(aiCompanionMessages.conversationId, aiCompanionConversations.id)).where(and(eq(aiCompanionMessages.id, c.req.param("messageId")), eq(aiCompanionMessages.role, "assistant"), eq(aiCompanionConversations.userId, context.userId))).limit(1);
  if (!message) return c.json({ error: "Message not found." }, 404);
  await db.insert(aiCompanionReports).values({ id: id("aireport"), userId: context.userId, messageId: message.id, reason: parsed.data.reason, details: parsed.data.details, createdAt: now() });
  await logEvent(c.env, { eventType: "ai_companion_message_reported", userId: context.userId, profileId: context.profileId, eventData: { reason: parsed.data.reason } }); return c.json({ ok: true });
});
