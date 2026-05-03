import { eq } from "drizzle-orm";
import type { EnvBindings } from "./db";
import { getDb } from "./db";
import { hashToken } from "./crypto";
import { sessions } from "../db/schema";

const SESSION_COOKIE = "velora_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export async function createSession(env: EnvBindings, userId: string) {
  const db = getDb(env);
  const token = crypto.randomUUID();
  const now = Date.now();

  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await hashToken(token),
    expiresAt: now + SESSION_TTL_MS,
    createdAt: now,
  });

  return token;
}

type CookiePolicy = {
  sameSite: "Strict" | "None";
  secure: boolean;
};

export function buildSessionCookie(token: string, policy: CookiePolicy) {
  const secureFlag = policy.secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; HttpOnly; Path=/; SameSite=${policy.sameSite}; Max-Age=${60 * 60 * 24 * 30}${secureFlag}`;
}

export function clearSessionCookie(policy: CookiePolicy) {
  const secureFlag = policy.secure ? "; Secure" : "";
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; SameSite=${policy.sameSite}; Max-Age=0${secureFlag}`;
}

export function readSessionToken(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";").map((entry) => entry.trim());
  const sessionPair = parts.find((entry) => entry.startsWith(`${SESSION_COOKIE}=`));
  if (!sessionPair) {
    return null;
  }

  return sessionPair.slice(`${SESSION_COOKIE}=`.length);
}

export async function getUserIdFromSession(
  env: EnvBindings,
  cookieHeader: string | undefined,
) {
  const token = readSessionToken(cookieHeader);
  if (!token) {
    return null;
  }

  const db = getDb(env);
  const tokenHash = await hashToken(token);
  const [session] = await db
    .select()
    .from(sessions)
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);

  if (!session || session.expiresAt <= Date.now()) {
    return null;
  }

  return session.userId;
}

export function resolveCookiePolicy(requestUrl: string, appEnv?: string): CookiePolicy {
  if (appEnv === "local") {
    return {
      sameSite: "Strict",
      secure: false,
    };
  }

  return {
    sameSite: "None",
    secure: requestUrl.startsWith("https://"),
  };
}
