CREATE TABLE IF NOT EXISTS ai_companion_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  plan TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_checkout_id TEXT NOT NULL UNIQUE,
  external_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  current_period_start INTEGER,
  current_period_end INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_companion_subscriptions_user_idx
  ON ai_companion_subscriptions(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS ai_companion_subscription_plans (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  plan TEXT NOT NULL,
  external_product_id TEXT NOT NULL,
  external_plan_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider, plan)
);
