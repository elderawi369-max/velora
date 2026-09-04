import type { EnvBindings } from "./db";
import { readInstallId } from "./starter-credits";

export type FreePreviewReservation = { id: string };

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function readFreePreviewDeviceKey(headers: {
  deviceId?: string;
  installId?: string;
}) {
  const identifier = readInstallId(headers.deviceId) ?? readInstallId(headers.installId);
  if (!identifier) return null;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`velora-ai-preview-v1:${identifier}`),
  );
  return bytesToHex(new Uint8Array(digest));
}

async function seedLegacyAccountUsage(
  env: EnvBindings,
  userId: string,
  deviceKey: string,
  limit: number,
) {
  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM ai_companion_free_preview_claims WHERE user_id = ?",
  ).bind(userId).first<{ count: number }>();
  if (Number(count?.count ?? 0) > 0) return;

  const legacy = await env.DB.prepare(
    "SELECT COALESCE(SUM(trial_replies_used), 0) AS count FROM ai_companion_conversations WHERE user_id = ?",
  ).bind(userId).first<{ count: number }>();
  const legacyCount = Math.min(limit, Math.max(0, Number(legacy?.count ?? 0)));
  if (!legacyCount) return;

  const timestamp = Date.now();
  await env.DB.batch(Array.from({ length: legacyCount }, (_, index) => env.DB.prepare(
    `INSERT OR IGNORE INTO ai_companion_free_preview_claims
      (id, user_id, device_key, conversation_id, message_id, created_at, updated_at)
      VALUES (?, ?, ?, NULL, NULL, ?, ?)`,
  ).bind(`legacy:${userId}:${index + 1}`, userId, deviceKey, timestamp, timestamp)));
}

export async function reserveFreePreviewReply(
  env: EnvBindings,
  input: { userId: string; deviceKey: string; conversationId: string; limit: number },
): Promise<FreePreviewReservation | null> {
  await seedLegacyAccountUsage(env, input.userId, input.deviceKey, input.limit);
  const reservation = { id: `aipreview_${crypto.randomUUID()}` };
  const timestamp = Date.now();
  const result = await env.DB.prepare(
    `INSERT INTO ai_companion_free_preview_claims
      (id, user_id, device_key, conversation_id, message_id, created_at, updated_at)
     SELECT ?, ?, ?, ?, NULL, ?, ?
     WHERE (SELECT COUNT(*) FROM ai_companion_free_preview_claims WHERE user_id = ?) < ?
       AND (SELECT COUNT(*) FROM ai_companion_free_preview_claims WHERE device_key = ?) < ?`,
  ).bind(
    reservation.id,
    input.userId,
    input.deviceKey,
    input.conversationId,
    timestamp,
    timestamp,
    input.userId,
    input.limit,
    input.deviceKey,
    input.limit,
  ).run();
  return result.meta.changes === 1 ? reservation : null;
}

export async function releaseFreePreviewReplyClaim(env: EnvBindings, reservation: FreePreviewReservation | null) {
  if (!reservation) return;
  await env.DB.prepare(
    "DELETE FROM ai_companion_free_preview_claims WHERE id = ? AND message_id IS NULL",
  ).bind(reservation.id).run();
}

export async function completeFreePreviewReplyClaim(
  env: EnvBindings,
  reservation: FreePreviewReservation | null,
  messageId: string,
) {
  if (!reservation) return;
  await env.DB.prepare(
    "UPDATE ai_companion_free_preview_claims SET message_id = ?, updated_at = ? WHERE id = ? AND message_id IS NULL",
  ).bind(messageId, Date.now(), reservation.id).run();
}

export async function getFreePreviewRepliesUsed(
  env: EnvBindings,
  input: { userId: string; deviceKey: string | null; limit: number },
) {
  const [accountClaims, deviceClaims, legacy] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM ai_companion_free_preview_claims WHERE user_id = ?").bind(input.userId).first<{ count: number }>(),
    input.deviceKey
      ? env.DB.prepare("SELECT COUNT(*) AS count FROM ai_companion_free_preview_claims WHERE device_key = ?").bind(input.deviceKey).first<{ count: number }>()
      : Promise.resolve({ count: 0 }),
    env.DB.prepare("SELECT COALESCE(SUM(trial_replies_used), 0) AS count FROM ai_companion_conversations WHERE user_id = ?").bind(input.userId).first<{ count: number }>(),
  ]);
  return Math.min(input.limit, Math.max(
    Number(accountClaims?.count ?? 0),
    Number(deviceClaims?.count ?? 0),
    Number(legacy?.count ?? 0),
  ));
}
