import { drizzle } from "drizzle-orm/d1";

export type EnvBindings = {
  DB: D1Database;
  AI?: Ai;
  COMPANION_IMAGES?: R2Bucket;
  APP_NAME?: string;
  ADMIN_SECRET?: string;
  APP_ENV?: string;
  ENABLE_DEV_ENDPOINTS?: string;
  TURNSTILE_SECRET_KEY?: string;
  STRIPE_SECRET_KEY?: string;
  PAYPAL_CLIENT_ID?: string;
  PAYPAL_SECRET?: string;
  PAYPAL_ENV?: string;
  PAYPAL_WEBHOOK_ID?: string;
  PAYMENTS_PROVIDER?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  RESEND_FROM_NAME?: string;
  RESEND_SUPPORT_FROM_EMAIL?: string;
  SUPPORT_REPLY_TO_EMAIL?: string;
  APPLE_BUNDLE_ID?: string;
  APPLE_SHARED_SECRET?: string;
  GOOGLE_PLAY_PACKAGE_NAME?: string;
  GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_SERVICE_ACCOUNT_JSON?: string;
  AI_COMPANION_ENABLED?: string;
  AI_COMPANION_DAILY_TRIAL_LIMIT?: string;
  AI_COMPANION_BETA_EMAILS?: string;
};

export function getDb(env: EnvBindings) {
  return drizzle(env.DB);
}
