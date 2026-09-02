import type { EnvBindings } from "./db";

export type VoiceDeliveryStyle = "natural" | "romantic" | "playful" | "comforting" | "serious" | "excited";

export type LockedVoiceProfile = {
  catalogName: string;
  provider: "google-cloud-text-to-speech";
  engine: "Neural2";
  voiceName: string;
  locale: string;
  speakingRate: number;
  pitch: number;
  audioEncoding: "MP3";
  sampleRateHertz: 24000;
  profileVersion: number;
  delivery: Partial<Record<VoiceDeliveryStyle, { speakingRate: number; pitch: number }>>;
};

const profile = (
  catalogName: string,
  voiceName: string,
  locale: string,
  speakingRate: number,
  pitch: number,
  delivery: LockedVoiceProfile["delivery"],
): LockedVoiceProfile => ({ catalogName, provider: "google-cloud-text-to-speech", engine: "Neural2", voiceName, locale, speakingRate, pitch, audioEncoding: "MP3", sampleRateHertz: 24000, profileVersion: 1, delivery });

// Owner-approved identities. These names never rotate at request time.
export const lockedCompanionVoices: Record<string, LockedVoiceProfile> = Object.fromEntries([
  profile("Alexa", "en-GB-Neural2-F", "en-GB", 1.02, 0.5, { playful: { speakingRate: 1.04, pitch: 1 }, comforting: { speakingRate: 0.97, pitch: 0.25 }, excited: { speakingRate: 1.06, pitch: 1.25 } }),
  profile("Lisa", "en-GB-Neural2-C", "en-GB", 0.94, 0, { romantic: { speakingRate: 0.94, pitch: 0 }, playful: { speakingRate: 0.98, pitch: 0.5 }, comforting: { speakingRate: 0.93, pitch: -0.25 }, serious: { speakingRate: 0.95, pitch: -0.25 }, excited: { speakingRate: 1, pitch: 0.75 } }),
  profile("Lora", "en-US-Neural2-F", "en-US", 0.98, -0.5, { playful: { speakingRate: 1, pitch: 0 }, comforting: { speakingRate: 0.94, pitch: -0.75 }, serious: { speakingRate: 1, pitch: -1 }, excited: { speakingRate: 1.02, pitch: 0.25 } }),
  profile("Monica", "en-AU-Neural2-C", "en-AU", 0.98, 0, { playful: { speakingRate: 1, pitch: 0.5 }, comforting: { speakingRate: 0.94, pitch: -0.25 }, excited: { speakingRate: 1.02, pitch: 0.75 } }),
  profile("Maya", "en-US-Neural2-G", "en-US", 0.98, 0, { playful: { speakingRate: 1, pitch: 0.5 }, comforting: { speakingRate: 0.94, pitch: -0.25 }, excited: { speakingRate: 1.02, pitch: 0.75 } }),
  profile("Sarah", "en-US-Neural2-H", "en-US", 1, -0.5, { playful: { speakingRate: 1.02, pitch: 0 }, comforting: { speakingRate: 0.96, pitch: -0.75 }, excited: { speakingRate: 1.04, pitch: 0.25 } }),
  profile("Arjun", "en-IN-Neural2-C", "en-IN", 0.96, -1, { romantic: { speakingRate: 0.93, pitch: -0.5 }, playful: { speakingRate: 0.98, pitch: -0.5 }, comforting: { speakingRate: 0.92, pitch: -1.25 }, excited: { speakingRate: 1, pitch: -0.25 } }),
  profile("Diego", "en-US-Neural2-J", "en-US", 1.02, -0.5, { playful: { speakingRate: 1.04, pitch: 0 }, comforting: { speakingRate: 0.98, pitch: -0.75 }, excited: { speakingRate: 1.06, pitch: 0.25 } }),
  profile("Kenji", "en-US-Neural2-I", "en-US", 0.97, -1, { playful: { speakingRate: 0.99, pitch: -0.5 }, comforting: { speakingRate: 0.93, pitch: -1.25 }, excited: { speakingRate: 1.01, pitch: -0.25 } }),
  profile("Malik", "en-US-Neural2-D", "en-US", 0.96, -1, { playful: { speakingRate: 0.98, pitch: -0.5 }, comforting: { speakingRate: 0.92, pitch: -1.25 }, excited: { speakingRate: 1, pitch: -0.25 } }),
  profile("Oliver", "en-GB-Neural2-B", "en-GB", 1.02, -1, { playful: { speakingRate: 1.04, pitch: -0.5 }, comforting: { speakingRate: 0.98, pitch: -1.25 }, excited: { speakingRate: 1.06, pitch: -0.25 } }),
  profile("Samir", "en-GB-Neural2-O", "en-GB", 0.97, -0.5, { playful: { speakingRate: 0.99, pitch: 0 }, comforting: { speakingRate: 0.93, pitch: -0.75 }, excited: { speakingRate: 1.01, pitch: 0.25 } }),
].map((item) => [item.catalogName.toLowerCase(), item]));

export function voiceForCatalogName(name: string) {
  return lockedCompanionVoices[name.trim().toLowerCase()] ?? null;
}

export function detectVoiceDeliveryStyle(text: string): VoiceDeliveryStyle {
  const value = text.toLowerCase();
  if (/\b(congrat|amazing|brilliant|did it|so proud|celebrat|great news|yes!)\b|!{2,}/i.test(value)) return "excited";
  if (/\b(here with you|take your time|breathe|not alone|i'm here|i am here|hard day|hurts?|overwhelmed|sorry)\b/i.test(value)) return "comforting";
  if (/\b(come closer|miss you|kiss|hold you|love|romantic|beside me|stay with me|wish you were here)\b/i.test(value)) return "romantic";
  if (/\b(teas|cute|smile|caught you|admit it|bold strategy|trouble)\b|\b(ha|haha)\b/i.test(value)) return "playful";
  if (/\b(serious|need to be honest|listen carefully|my answer is no|boundary|don't ignore|do not ignore)\b/i.test(value)) return "serious";
  return "natural";
}

export function prepareSpokenText(text: string) {
  const spoken = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/^\s*[-*#>]\s*/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/[“”„‟«»\"]/g, "")
    .replace(/[\p{Extended_Pictographic}\uFE0F]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  return spoken.slice(0, 500);
}

function base64Url(bytes: Uint8Array | string) {
  const raw = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (let offset = 0; offset < raw.length; offset += 0x8000) binary += String.fromCharCode(...raw.subarray(offset, offset + 0x8000));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

type GoogleServiceAccount = { client_email: string; private_key: string; token_uri?: string };
let cachedAccessToken: { token: string; expiresAt: number; email: string } | null = null;

async function googleAccessToken(env: EnvBindings) {
  if (!env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON) throw new Error("google_tts_not_configured");
  let account: GoogleServiceAccount;
  try { account = JSON.parse(env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON) as GoogleServiceAccount; }
  catch { throw new Error("google_tts_credentials_invalid"); }
  if (!account.client_email || !account.private_key) throw new Error("google_tts_credentials_invalid");
  const timestamp = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.email === account.client_email && cachedAccessToken.expiresAt > timestamp + 60) return cachedAccessToken.token;
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({ iss: account.client_email, scope: "https://www.googleapis.com/auth/cloud-platform", aud: account.token_uri ?? "https://oauth2.googleapis.com/token", iat: timestamp, exp: timestamp + 3600 }));
  const unsigned = `${header}.${claim}`;
  const keyBytes = decodeBase64(account.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, ""));
  const key = await crypto.subtle.importKey("pkcs8", keyBytes, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(account.token_uri ?? "https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }) });
  const result = await response.json<{ access_token?: string; expires_in?: number; error?: string }>();
  if (!response.ok || !result.access_token) throw new Error(`google_tts_auth_failed:${result.error ?? response.status}`);
  cachedAccessToken = { token: result.access_token, expiresAt: timestamp + Math.max(300, result.expires_in ?? 3600), email: account.client_email };
  return result.access_token;
}

export async function synthesizeCompanionSpeech(env: EnvBindings, profile: LockedVoiceProfile, rawText: string) {
  const text = prepareSpokenText(rawText);
  if (!text) throw new Error("voice_text_empty");
  const deliveryStyle = detectVoiceDeliveryStyle(text);
  const settings = profile.delivery[deliveryStyle] ?? { speakingRate: profile.speakingRate, pitch: profile.pitch };
  const token = await googleAccessToken(env);
  const response = await fetch("https://texttospeech.googleapis.com/v1/text:synthesize", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: { text }, voice: { languageCode: profile.locale, name: profile.voiceName }, audioConfig: { audioEncoding: profile.audioEncoding, speakingRate: settings.speakingRate, pitch: settings.pitch, sampleRateHertz: profile.sampleRateHertz } }),
  });
  const result = await response.json<{ audioContent?: string; error?: { status?: string } }>();
  if (!response.ok || !result.audioContent) throw new Error(`google_tts_failed:${result.error?.status ?? response.status}`);
  const bytes = decodeBase64(result.audioContent);
  return { bytes, text, deliveryStyle, durationMs: mp3DurationMs(bytes), settings };
}

function mp3DurationMs(bytes: Uint8Array) {
  let offset = 0;
  if (bytes.length > 10 && String.fromCharCode(...bytes.subarray(0, 3)) === "ID3") {
    offset = 10 + ((bytes[6] & 0x7f) << 21) + ((bytes[7] & 0x7f) << 14) + ((bytes[8] & 0x7f) << 7) + (bytes[9] & 0x7f);
  }
  const mpeg1Bitrates = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
  const mpeg2Bitrates = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const sampleRates = [44100, 48000, 32000];
  let seconds = 0;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff || (bytes[offset + 1] & 0xe0) !== 0xe0) { offset += 1; continue; }
    const versionBits = (bytes[offset + 1] >> 3) & 3;
    const layerBits = (bytes[offset + 1] >> 1) & 3;
    const bitrateIndex = (bytes[offset + 2] >> 4) & 15;
    const sampleIndex = (bytes[offset + 2] >> 2) & 3;
    if (versionBits === 1 || layerBits !== 1 || bitrateIndex === 0 || bitrateIndex === 15 || sampleIndex === 3) { offset += 1; continue; }
    const mpeg1 = versionBits === 3;
    const bitrate = (mpeg1 ? mpeg1Bitrates : mpeg2Bitrates)[bitrateIndex] * 1000;
    const sampleRate = sampleRates[sampleIndex] / (versionBits === 3 ? 1 : versionBits === 2 ? 2 : 4);
    const padding = (bytes[offset + 2] >> 1) & 1;
    const frameLength = Math.floor(((mpeg1 ? 144 : 72) * bitrate) / sampleRate) + padding;
    if (frameLength <= 0 || offset + frameLength > bytes.length + 1) break;
    seconds += (mpeg1 ? 1152 : 576) / sampleRate;
    offset += frameLength;
  }
  return Math.max(250, Math.round(seconds * 1000));
}
