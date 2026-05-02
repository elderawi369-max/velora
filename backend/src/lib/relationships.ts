import { and, eq, or } from "drizzle-orm";
import { blocks, favorites } from "../db/schema";
import type { EnvBindings } from "./db";
import { getDb } from "./db";

export async function areProfilesBlocked(
  env: EnvBindings,
  profileId: string,
  targetProfileId: string,
) {
  const db = getDb(env);
  const [row] = await db
    .select({ id: blocks.id })
    .from(blocks)
    .where(
      or(
        and(eq(blocks.profileId, profileId), eq(blocks.targetProfileId, targetProfileId)),
        and(eq(blocks.profileId, targetProfileId), eq(blocks.targetProfileId, profileId)),
      ),
    )
    .limit(1);

  return Boolean(row);
}

export async function isFavorited(
  env: EnvBindings,
  profileId: string,
  targetProfileId: string,
) {
  const db = getDb(env);
  const [row] = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(
      and(eq(favorites.profileId, profileId), eq(favorites.targetProfileId, targetProfileId)),
    )
    .limit(1);

  return Boolean(row);
}

