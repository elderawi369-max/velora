import type { EnvBindings } from "./db";

// These are compatibility signals, not proof of app authenticity. Native auth
// remains password based and is rate limited using Cloudflare's client IP.
export function nativeAuthPlatform(clientPlatform?: string, origin?: string) {
  if (clientPlatform === "ios-native" && origin === "capacitor://localhost") return "ios";
  if (clientPlatform === "android-native" && origin === "https://localhost") return "android";
  return null;
}

export function isNativeAuthToken(token: string, clientPlatform?: string, origin?: string) {
  const platform = nativeAuthPlatform(clientPlatform, origin);
  return platform !== null && token === `${platform}-native-bypass`;
}

export async function allowNativeAuthAttempt(
  env: Pick<EnvBindings, "DB" | "APP_ENV">,
  remoteIp: string | undefined,
  now = Date.now(),
) {
  const ip = remoteIp?.trim();
  if (!ip || ip.length > 128) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
  const ipHash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  await env.DB.prepare("DELETE FROM native_auth_rate_limits WHERE expires_at <= ?").bind(now).run();
  for (const [windowMs, limit] of [[600_000, 20], [86_400_000, 60]]) {
    const window = Math.floor(now / windowMs);
    const key = `${ipHash}:${windowMs}:${window}`;
    const row = await env.DB.prepare(
      "INSERT INTO native_auth_rate_limits (id, attempts, expires_at) VALUES (?, 1, ?) " +
      "ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1 RETURNING attempts",
    ).bind(key, (window + 1) * windowMs).first<{ attempts: number }>();
    if (!row || row.attempts > limit) return false;
  }
  return true;
}
