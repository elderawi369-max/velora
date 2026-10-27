CREATE TABLE IF NOT EXISTS native_auth_rate_limits (
  id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS native_auth_rate_limits_expiry ON native_auth_rate_limits (expires_at);
