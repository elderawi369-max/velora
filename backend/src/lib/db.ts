import { drizzle } from "drizzle-orm/d1";

export type EnvBindings = {
  DB: D1Database;
  APP_NAME?: string;
  ADMIN_SECRET?: string;
  APP_ENV?: string;
  ENABLE_DEV_ENDPOINTS?: string;
  TURNSTILE_SECRET_KEY?: string;
  STRIPE_SECRET_KEY?: string;
};

export function getDb(env: EnvBindings) {
  return drizzle(env.DB);
}
