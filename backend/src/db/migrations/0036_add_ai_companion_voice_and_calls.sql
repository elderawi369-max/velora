CREATE TABLE IF NOT EXISTS ai_companion_voice_profiles (
  companion_id TEXT PRIMARY KEY REFERENCES ai_companions(id),
  catalog_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  engine TEXT NOT NULL,
  voice_name TEXT NOT NULL,
  locale TEXT NOT NULL,
  speaking_rate REAL NOT NULL,
  pitch REAL NOT NULL,
  audio_encoding TEXT NOT NULL DEFAULT 'MP3',
  sample_rate_hertz INTEGER NOT NULL DEFAULT 24000,
  profile_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'locked',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_companion_voice_assets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  conversation_id TEXT NOT NULL REFERENCES ai_companion_conversations(id),
  message_id TEXT REFERENCES ai_companion_messages(id),
  call_id TEXT,
  request_key TEXT NOT NULL UNIQUE,
  object_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'generating',
  duration_ms INTEGER,
  character_count INTEGER NOT NULL,
  provider TEXT NOT NULL,
  profile_version INTEGER NOT NULL,
  delivery_style TEXT NOT NULL DEFAULT 'natural',
  error_code TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE INDEX IF NOT EXISTS ai_companion_voice_assets_timeline_idx
  ON ai_companion_voice_assets(conversation_id, status, created_at);
CREATE INDEX IF NOT EXISTS ai_companion_voice_assets_owner_idx
  ON ai_companion_voice_assets(user_id, companion_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS ai_companion_voice_assets_message_idx
  ON ai_companion_voice_assets(message_id) WHERE message_id IS NOT NULL AND call_id IS NULL;

CREATE TABLE IF NOT EXISTS ai_companion_voice_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL,
  period TEXT NOT NULL,
  reserved_count INTEGER NOT NULL DEFAULT 0,
  successful_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_companion_voice_usage_owner_idx
  ON ai_companion_voice_usage(user_id, scope, period);

CREATE TABLE IF NOT EXISTS ai_companion_calls (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  companion_id TEXT NOT NULL REFERENCES ai_companions(id),
  conversation_id TEXT NOT NULL REFERENCES ai_companion_conversations(id),
  status TEXT NOT NULL DEFAULT 'calling',
  connected_at INTEGER,
  last_heartbeat_at INTEGER,
  ended_at INTEGER,
  billable_seconds INTEGER NOT NULL DEFAULT 0,
  max_seconds INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_companion_calls_active_idx
  ON ai_companion_calls(user_id, status, updated_at);

CREATE TABLE IF NOT EXISTS ai_companion_call_turns (
  id TEXT PRIMARY KEY,
  call_id TEXT NOT NULL REFERENCES ai_companion_calls(id),
  user_message_id TEXT REFERENCES ai_companion_messages(id),
  assistant_message_id TEXT REFERENCES ai_companion_messages(id),
  voice_asset_id TEXT REFERENCES ai_companion_voice_assets(id),
  transcript TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS ai_companion_call_turns_call_idx
  ON ai_companion_call_turns(call_id, created_at);
