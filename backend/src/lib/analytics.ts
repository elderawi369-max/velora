import { eventLogs } from "../db/schema";
import { getDb, type EnvBindings } from "./db";

export async function logEvent(
  env: EnvBindings,
  input: {
    eventType: string;
    userId?: string | null;
    profileId?: string | null;
    eventData?: Record<string, unknown>;
  },
) {
  const db = getDb(env);
  await db.insert(eventLogs).values({
    id: crypto.randomUUID(),
    userId: input.userId ?? null,
    profileId: input.profileId ?? null,
    eventType: input.eventType,
    eventData: JSON.stringify(input.eventData ?? {}),
    createdAt: Date.now(),
  });
}
