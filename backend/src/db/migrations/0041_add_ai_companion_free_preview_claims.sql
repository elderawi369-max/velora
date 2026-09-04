CREATE TABLE IF NOT EXISTS ai_companion_free_preview_claims (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  device_key TEXT NOT NULL,
  conversation_id TEXT REFERENCES ai_companion_conversations(id),
  message_id TEXT REFERENCES ai_companion_messages(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_companion_free_preview_claims_user_idx
  ON ai_companion_free_preview_claims(user_id);

CREATE INDEX IF NOT EXISTS ai_companion_free_preview_claims_device_idx
  ON ai_companion_free_preview_claims(device_key);

CREATE UNIQUE INDEX IF NOT EXISTS ai_companion_free_preview_claims_message_idx
  ON ai_companion_free_preview_claims(message_id)
  WHERE message_id IS NOT NULL;
