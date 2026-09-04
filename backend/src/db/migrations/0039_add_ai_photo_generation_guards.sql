CREATE TABLE IF NOT EXISTS ai_companion_photo_generation_usage (
  user_id TEXT NOT NULL REFERENCES users(id),
  usage_period TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  estimated_spend_cents INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(user_id, usage_period)
);

CREATE TABLE IF NOT EXISTS ai_companion_photo_generation_locks (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  usage_period TEXT NOT NULL,
  acquired_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_companion_photo_generation_budget (
  billing_period TEXT PRIMARY KEY,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  estimated_spend_cents INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
