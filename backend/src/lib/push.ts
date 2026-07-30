import { and, eq } from "drizzle-orm";
import { pushDevices } from "../db/schema";
import type { EnvBindings } from "./db";
import { getUnreadBadgeCountForUser } from "./badges";
import { getDb } from "./db";

type PushPayload = {
  title: string;
  body: string;
  link?: string;
  badgeCount?: number;
};

function isPushConfigured(env: EnvBindings) {
  return Boolean(env.FIREBASE_PROJECT_ID && env.FIREBASE_SERVICE_ACCOUNT_JSON);
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function signJwt(payload: Record<string, unknown>, privateKeyPem: string) {
  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const encoder = new TextEncoder();
  const stripPem = privateKeyPem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  const keyBytes = Uint8Array.from(atob(stripPem), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyBytes.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );

  const encodedHeader = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsigned),
  );

  return `${unsigned}.${base64UrlEncode(new Uint8Array(signature))}`;
}

async function getGoogleAccessToken(env: EnvBindings) {
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    throw new Error("Firebase service account is not configured.");
  }

  const serviceAccount = JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON) as {
    client_email: string;
    private_key: string;
    token_uri?: string;
  };

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    serviceAccount.private_key,
  );

  const response = await fetch(serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(raw || "Unable to authorize Firebase push.");
  }

  const data = (await response.json()) as { access_token: string };
  return data.access_token;
}

export async function registerPushDevice(
  env: EnvBindings,
  input: {
    userId: string;
    token: string;
    platform: "web" | "android";
    deviceLabel?: string | null;
  },
) {
  const db = getDb(env);
  const now = Date.now();
  const [existing] = await db
    .select()
    .from(pushDevices)
    .where(eq(pushDevices.token, input.token))
    .limit(1);

  if (existing) {
    await db
      .update(pushDevices)
      .set({
        userId: input.userId,
        platform: input.platform,
        deviceLabel: input.deviceLabel ?? null,
        updatedAt: now,
        lastSeenAt: now,
      })
      .where(eq(pushDevices.id, existing.id));
    return;
  }

  await db.insert(pushDevices).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    token: input.token,
    platform: input.platform,
    deviceLabel: input.deviceLabel ?? null,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  });
}

export async function unregisterPushDevice(
  env: EnvBindings,
  input: {
    userId: string;
    token: string;
  },
) {
  const db = getDb(env);
  await db
    .delete(pushDevices)
    .where(and(eq(pushDevices.userId, input.userId), eq(pushDevices.token, input.token)));
}

export async function sendPushToUser(
  env: EnvBindings,
  userId: string,
  payload: PushPayload,
) {
  if (!isPushConfigured(env)) {
    return { delivered: 0, skipped: true };
  }

  const db = getDb(env);
  const devices = await db
    .select({
      id: pushDevices.id,
      token: pushDevices.token,
    })
    .from(pushDevices)
    .where(eq(pushDevices.userId, userId))
    .limit(20);

  if (devices.length === 0) {
    return { delivered: 0, skipped: false };
  }

  const accessToken = await getGoogleAccessToken(env);
  const badgeCount =
    typeof payload.badgeCount === "number"
      ? Math.max(0, Math.floor(payload.badgeCount))
      : await getUnreadBadgeCountForUser(env, userId);
  let delivered = 0;

  for (const device of devices) {
    const response = await fetch(
      `https://fcm.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: {
              title: payload.title,
              body: payload.body,
            },
            data: {
              link: payload.link ?? "/",
              title: payload.title,
              body: payload.body,
              badgeCount: String(badgeCount),
            },
            webpush: {
              fcm_options: {
                link: payload.link ?? "/",
              },
            },
            android: {
              priority: "high",
              notification: {
                channel_id: "velora_activity",
                notification_count: badgeCount,
              },
            },
          },
        }),
      },
    );

    if (response.ok) {
      delivered += 1;
      continue;
    }

    const raw = await response.text();
    if (raw.includes("UNREGISTERED") || raw.includes("registration-token-not-registered")) {
      await db.delete(pushDevices).where(eq(pushDevices.id, device.id));
    }
  }

  return { delivered, skipped: false };
}
